"""Grounded narration: Python owns every number, the model only writes the sentence.

`INSIGHTS.md` principle 2 — "the LLM never queries data and never does
arithmetic" — is impossible to enforce by prompting alone: a 4 GB model asked
for "24% below Lidl" will happily compute 24% wrongly. So the narration
endpoint hands the model an executed envelope plus a block of figures computed
here, and afterwards re-reads the sentence it gets back: every number token in
it must be a number that was in the payload. A caption that invents one is not
narration, and it does not ship.

The unifying rule for every shape below is **fail closed**: if a numeric-
looking span cannot be parsed unambiguously as one plain number, the whole
span is refused, never silently fragmented into pieces that might each
ground on some unrelated figure. A wrongly-refused caption costs a retry; a
wrongly-accepted one is a fabricated number shown to someone as a fact about
their own money.
"""

from __future__ import annotations

import re
import sys
import unicodedata
from decimal import Decimal, InvalidOperation

# Every dash-like glyph a model might render as a negative sign, normalised
# to ASCII "-" before extraction. Two review rounds hand-enumerated specific
# dash characters and missed some each time (round 1 caught only U+2212;
# round 2 added seven more but missed U+2010, U+2011, U+2015) — enumeration
# is what keeps leaving gaps, so this is now the full Unicode "Pd" (Dash
# Punctuation) category, computed once at import, plus the three glyphs
# already in use that are NOT in Pd: U+2212 MINUS SIGN (category Sm, math
# symbol; what the frontend renders — frontend/src/lib/money.ts,
# formatSigned), U+02D7 MODIFIER LETTER MINUS SIGN (Sk), and U+2796 HEAVY
# MINUS SIGN (So).
_NON_PD_DASHES = "−˗➖"
_PD_DASHES = "".join(
    chr(cp) for cp in range(sys.maxunicode + 1) if unicodedata.category(chr(cp)) == "Pd"
)
_DASHES = _PD_DASHES + _NON_PD_DASHES
_DASH_TO_MINUS = str.maketrans({c: "-" for c in _DASHES})

# Separators that make a digit run "grouped" (thousands notation) rather than
# a single decimal: comma, period, plain space, non-breaking space, thin
# space, narrow no-break space, and a line break (a grouping character that
# happened to fall at a text-wrap boundary). Plain space was excluded in an
# earlier round to protect a pinned test that split "2 793,48" into "2" and
# "793,48" — round 3 changes that: the pinned test itself was updated (with
# the caption's grounding outcome unchanged) to assert the merged token
# instead, once review showed merging plain space flips no accept/refuse
# verdict anywhere else in the suite. See the module tests.
_GROUP_SEP = "[.,    \n]"

# A digit-grouped number: 1-3 leading digits, one or more "separator + exactly
# 3 digits" repeats, optionally a further separator + trailing digits (a
# decimal tail written with a different, or the same, separator). Matches
# "1,204", "1.234,50", "1,234.50", "1,234,567", "1 204", NBSP/thin-space
# groups, and a number broken across a line. This shape is inherently
# locale-ambiguous (1,234 is 1234 in en-US and 1.234 in pl-PL) so it is never
# resolved, only refused whole — never allowed to leave a trailing digit run
# to be re-tokenised and grounded on its own.
_GROUPED = rf"-?\d{{1,3}}(?:{_GROUP_SEP}\d{{3}})+(?:{_GROUP_SEP}\d+)?"

# The number core shared by the exponent and magnitude shapes below: a sign,
# then either digits with an optional decimal tail ("1204", "1204.00") or a
# decimal separator straight into digits with no leading digit (".5"). This
# has to match _PLAIN exactly, not just "\d+(...)?": requiring a leading
# digit here would let a leading-dot number composed with a suffix (".5
# thousand", ".5e3") fall through to the plain fallback with the suffix
# unconsumed -- the marker gets silently dropped, and the bare ".5" grounds
# against any unrelated payload figure that happens to equal 0.5. `\d` here
# also matches non-ASCII decimal digits (fullwidth, Arabic-Indic, Devanagari,
# ...), so "１２thousand" folds the same way "12thousand" does.
_NUMBER_CORE = r"-?(?:\d+(?:[.,]\d+)?|[.,]\d+)"

# Scientific/power notation. Decimal happily parses "1e3" as 1000, but a
# caption is never expected to write exponent notation, so its mere presence
# is refused rather than evaluated — this module does no arithmetic, and
# resolving "^" or an exponent is arithmetic.
_EXPONENT = rf"{_NUMBER_CORE}(?:[eE][+-]?\d+|\^\d+|[⁰¹²³⁴-⁹]+)"

# A magnitude word or abbreviation (English and Polish — Polish is this
# application's actual locale, see frontend's Intl.NumberFormat('pl-PL')),
# glued, stacked, or separated by one space, folds into the token so it can
# never be compared as its bare digits: the module does not scale by
# 1,000 / 1,000,000 to validate it — that is exactly the arithmetic it must
# not do — so "1.2k", "2 million", "2MM", or "12 tysięcy" must never ground
# as if they read "1.2", "2", "2", or "12".
#
# The Polish words are matched by stem (tysi.../milion.../miliard...) rather
# than enumerating every declension (tysiąc/tysiące/tysięcy/tysiącach/...):
# `[^\W\d_]*` is "word characters that are letters" (Unicode-aware, so it
# covers Polish diacritics), deliberately excluding digits so the stem can't
# swallow an adjacent real number.
#
# `(?:...)+ ` (one or more, not exactly one) lets multiple markers stack —
# "2MM", "2kk", "1.2 km" are each two single-letter markers back to back,
# and a single match only caught the first one, leaving the second as an
# unconsumed letter that failed the trailing lookahead and dropped the whole
# match to the bare digits. The lookahead itself is scoped off from the
# pattern's overall IGNORECASE with `(?-i:...)`: under IGNORECASE, `[a-z]`
# matches uppercase too, so an un-scoped `(?![a-z])` would block "1.2kPLN"
# (a glued, uppercase currency code) exactly like it blocks "12 months" (a
# genuine following word) — scoping restores the asymmetry: block only a
# *lowercase* continuation (a real word), allow an uppercase one (a currency
# code with no space).
_MAGNITUDE_WORD = (
    r"(?:tysi[^\W\d_]*|tys\.?|milion[^\W\d_]*|mln\.?|miliard[^\W\d_]*|mld\.?"
    r"|thousands?|millions?|billions?|trillions?|bn|k|m|b)"
)
_MAGNITUDE_NUMBER = rf"{_NUMBER_CORE}[    ]?(?:{_MAGNITUDE_WORD})+(?-i:(?![a-z]))"

# Vulgar fraction characters, optionally preceded by a whole-number part
# ("¾", "2½"). The module cannot resolve what fraction of what, so these are
# refused rather than silently ignored (ignoring them entirely would make an
# invented fraction invisible, the same failure as a dropped decimal point).
_FRACTIONS = "½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞"
_FRACTION = rf"-?\d*[{_FRACTIONS}]"

# The plain fallback: an optional sign, then either digits with an optional
# decimal tail ("1204", "1204.00") or a decimal separator straight into
# digits with no leading digit (".5") — a form that would otherwise be
# invisible to extraction entirely, letting an invented ".5" pass because it
# was never seen as a number at all.
_PLAIN = r"-?(?:\d+(?:[.,]\d+)?|[.,]\d+)"

# Ordered alternation: at each position the first alternative that matches
# wins, so the "this is ambiguous, refuse the whole thing" shapes must come
# before the plain fallback — otherwise they get fragmented into pieces that
# each ground independently, which is the bug this ordering exists to
# prevent. The lookbehind stops "2026-07" yielding "-07" and "2793.48"
# yielding a second token "48" — a separator that follows a digit is not the
# start of a new number.
_NUMBER = re.compile(
    r"(?<![\d.,])(?:"
    + "|".join([_GROUPED, _EXPONENT, _MAGNITUDE_NUMBER, _FRACTION, _PLAIN])
    + ")",
    re.IGNORECASE,
)

# Shapes that must never ground even when they happen to parse as a Decimal.
# "1e3" parses to 1000 via Decimal's own scientific-notation support, but the
# module must not evaluate exponent notation as if it were a plain figure —
# see _EXPONENT above. Grouped spans are the same story in the other
# direction: "1,204" parses to 1.204 via the comma-to-dot replacement below,
# which is a genuine (and wrong) number, not a parse failure, so relying on
# InvalidOperation would not catch it — it has to be refused structurally.
_FORCE_REFUSE = re.compile(rf"^(?:{_GROUPED}|{_EXPONENT})$", re.IGNORECASE)

# Machine-facing ids are not figures. A caption citing "14" because 14 is a
# category id is not quoting the data, so these keys ground nothing.
_NOT_FIGURES = frozenset({"categoryId", "key", "version"})


def number_tokens(text: str) -> list[str]:
    """Every number-like token in a string, exactly as written, in order."""
    return _NUMBER.findall(text.translate(_DASH_TO_MINUS))


def _to_decimal(token: str) -> Decimal | None:
    try:
        return Decimal(token.replace(",", "."))
    except InvalidOperation:
        return None


def _collect(value: object, found: set[Decimal]) -> None:
    if isinstance(value, dict):
        for name, child in value.items():
            if name not in _NOT_FIGURES:
                _collect(child, found)
    elif isinstance(value, list):
        for child in value:
            _collect(child, found)
    elif isinstance(value, bool):
        return  # bool is an int in Python; True is not the number 1 here
    elif isinstance(value, (int, float, Decimal)):
        found.add(Decimal(str(value)))
    elif isinstance(value, str):
        for token in number_tokens(value):
            number = _to_decimal(token)
            if number is not None:
                found.add(number)


def numbers_in(value: object) -> set[Decimal]:
    """Every number reachable in a JSON-ish structure, including inside strings.

    Money arrives as strings ("243.5000") and periods as strings ("2026-07"),
    so string leaves are scanned too: a caption that says "2026-07" or "July
    2026" is quoting the data, not inventing.
    """
    found: set[Decimal] = set()
    _collect(value, found)
    return found


def _grounds(candidate: Decimal, value: Decimal) -> bool:
    """True when `value` rounds to `candidate` at the precision the caption used."""
    places = max(0, -candidate.as_tuple().exponent)
    tolerance = Decimal(1).scaleb(-places) / 2
    return abs(value - candidate) <= tolerance


def ungrounded_numbers(caption: str, payload: object) -> list[str]:
    """The caption's number tokens that no number in `payload` rounds to.

    An empty list means every figure in the sentence came from the data — the
    whole guarantee. The model chooses words, never values.
    """
    allowed = numbers_in(payload)
    bad: list[str] = []
    for token in number_tokens(caption):
        if _FORCE_REFUSE.fullmatch(token):
            bad.append(token)
            continue
        candidate = _to_decimal(token)
        if candidate is None or not any(_grounds(candidate, value) for value in allowed):
            bad.append(token)
    return bad

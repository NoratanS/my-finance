"""The grounding check: is every number in a caption actually in the data.

`INSIGHTS.md` principle 2 — "the LLM never queries data and never does
arithmetic" — is impossible to enforce by prompting alone: a 4 GB model asked
for "24% below Lidl" will happily compute 24% wrongly. So narration re-reads
the sentence it gets back: every number token in it must be a number that was
in the payload. A caption that invents one is not narration, and it does not
ship.

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
# to ASCII "-" before extraction, and every Unicode "Cf" (Format) character
# -- soft hyphen, zero-width space/joiner/non-joiner, word joiner,
# zero-width no-break space, left-to-right mark, and their relatives --
# stripped outright before extraction. Four review rounds hand-enumerating
# specific dash characters each missed some (round 1: only U+2212; round 2:
# seven more, missed U+2010/U+2011/U+2015; round 3's Pd-category scan
# missed U+2043 HYPHEN BULLET, category Po not Pd, and U+207B/U+208B
# SUPERSCRIPT/SUBSCRIPT MINUS, category Sm but distinct codepoints from
# U+2212) -- so the dash set is closed two ways instead of by further
# enumeration: the full Unicode "Pd" (Dash Punctuation) category, plus a
# short list of glyphs already known to be used as minus signs that aren't
# in Pd (U+2212 itself -- what the frontend renders, see
# frontend/src/lib/money.ts formatSigned -- U+02D7, U+2796, U+2043), plus
# every codepoint whose NFKC normalisation collapses to one of those (this
# is what catches U+207B/U+208B: both NFKC-normalise to U+2212). NFKC is
# applied only to build this fixed set at import time, never to caption
# text itself -- NFKC-normalising the caption would collapse "½" and "10³"
# into other characters and break the fraction/exponent handling below.
#
# Cf characters are invisible by design, so a model (or a copy-paste
# artifact upstream of it) can insert one between digits and a magnitude
# word ("2<ZWSP>million" grounds on an unrelated bare 2), between a sign
# and a number ("-<ZWSP>243.50" drops the sign the same way an
# unrecognised dash does), or in the middle of a digit run (fragmenting
# "12<ZWSP>500" into two independently-groundable tokens). Stripping them
# removes an over-refusal rather than adding one: once removed, each shape
# reduces to a form already handled (a glued magnitude word, a preserved
# sign, one merged digit run), so this is pure deletion, not a new pattern.
#
# The two full-Unicode scans below are combined into one category pass
# (computing `unicodedata.category` once per codepoint instead of twice),
# and the NFKC closure only calls the more expensive `normalize("NFKC", ...)`
# for codepoints that `unicodedata.decomposition()` says have a
# compatibility mapping at all -- the vast majority of codepoints don't,
# and normalising them would just return themselves. Both are one-time,
# module-import costs, not per-request ones.
_NON_PD_DASHES = "−˗➖⁃"
_PD_DASHES: list[str] = []
_CF_CHARS: list[str] = []
for _cp in range(sys.maxunicode + 1):
    _ch = chr(_cp)
    _cat = unicodedata.category(_ch)
    if _cat == "Pd":
        _PD_DASHES.append(_ch)
    elif _cat == "Cf":
        _CF_CHARS.append(_ch)
_BASE_DASHES = set(_PD_DASHES) | set(_NON_PD_DASHES)
_NFKC_DASHES = {
    chr(_cp)
    for _cp in range(sys.maxunicode + 1)
    if chr(_cp) not in _BASE_DASHES
    and unicodedata.decomposition(chr(_cp))
    and len(unicodedata.normalize("NFKC", chr(_cp))) == 1
    and unicodedata.normalize("NFKC", chr(_cp)) in _BASE_DASHES
}
_DASHES = "".join(_BASE_DASHES | _NFKC_DASHES)
_TEXT_FIXUP = {ord(c): "-" for c in _DASHES}
_TEXT_FIXUP.update({ord(c): None for c in _CF_CHARS})

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
# "mil"/"bil"/"tn"/"grand"/"large" are English magnitude slang/abbreviations
# ("2 mil", "2 bil", "2 tn", "2 grand", "50 large") added after review found
# them missing -- unlike an exotic script or an obscure dash glyph, these are
# ordinary, highly plausible things for a model to write, so their absence
# was a bigger gap than most of the rest of this file put together. The word
# list is still a finite enumeration, not exhaustive over every language or
# register a model might use (see the module docstring for what remains
# open).
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
#
# The separator between the digits and the marker is `[-\s]*`: any run
# (including none, for the glued case) of ASCII "-" -- dashes are already
# normalised to it by this point -- and/or whitespace, which in Python's
# `re` already covers space, tab, newline, NBSP, thin space, and narrow
# no-break space. An earlier version allowed exactly one character from a
# four-item class, which is why "2-million", "2\nmillion", "2  million",
# and "2-milionowy" each collapsed the fold and left bare digits to ground
# on an unrelated figure -- a hyphenated or line-wrapped magnitude word is
# ordinary English/Polish, not an exotic input.
# Spelled or abbreviated magnitudes match once. Single-letter markers may stack
# ("2MM", "2kk"), which is why they are a separate alternative: letting the whole
# set repeat made "mil" + "k" match the word "milk", so "2 milk cartons" folded
# into a magnitude and the caption was refused. In a grocery-spend app that is a
# likelier sentence than any of the dash glyphs above.
_MAGNITUDE_WORD = (
    r"(?:tysi[^\W\d_]*|tys\.?|milion[^\W\d_]*|mln\.?|miliard[^\W\d_]*|mld\.?"
    r"|thousands?|millions?|billions?|trillions?|bn|mil|bil|tn|grand)"
)
_MAGNITUDE_MARKER = r"(?:[kmb])"
_MAGNITUDE_NUMBER = (
    rf"{_NUMBER_CORE}[-\s]*(?:{_MAGNITUDE_WORD}|{_MAGNITUDE_MARKER}+)(?-i:(?![a-z]))"
)

# Vulgar fraction characters, optionally preceded by a whole-number part
# ("¾", "2½"). The module cannot resolve what fraction of what, so these are
# refused rather than silently ignored (ignoring them entirely would make an
# invented fraction invisible, the same failure as a dropped decimal point).
_FRACTIONS = "½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞"
_FRACTION = rf"-?\d*[{_FRACTIONS}]"

# Exotic decimal/grouping separators that aren't comma, period, or a
# grouping-space variant: Python-style underscore grouping ("12_500"),
# an ASCII prime/apostrophe used as a Swiss-style separator ("12'5"), the
# Unicode "smart quote" apostrophe U+2019 ("12’5") -- lost between two
# review rounds the first time (the finding said "eight forms", the relay
# said "seven", and only the ASCII apostrophe made it into the character
# class), a middle dot ("12·5"), the Arabic decimal and thousands
# separators (U+066B, U+066C), and the fullwidth/ideographic full stop
# ("12．5", "12。5"). None of these are recognised as a decimal point
# anywhere else in this module, so without this the separator itself
# simply breaks the match and the digits on each side become two
# independent tokens that can each coincidentally ground -- the same
# fragment-and-collide failure as an unrecognised thousands separator.
# Folded and force-refused the same way as _GROUPED, never read as a real
# decimal: unlike a lone comma, none of these has an established "this is
# definitely the decimal point" reading in the app's own locale to fall
# back on.
_EXOTIC_SEP = "_'’·٫٬。．"
_EXOTIC_NUMBER = rf"-?\d+(?:[{_EXOTIC_SEP}]\d+)+"

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
    + "|".join([_GROUPED, _EXPONENT, _EXOTIC_NUMBER, _MAGNITUDE_NUMBER, _FRACTION, _PLAIN])
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
_FORCE_REFUSE = re.compile(rf"^(?:{_GROUPED}|{_EXPONENT}|{_EXOTIC_NUMBER})$", re.IGNORECASE)

# Machine-facing ids are not figures. A caption citing "14" because 14 is a
# category id is not quoting the data, so these keys ground nothing. This is
# a finite, hand-picked list scoped to the current envelope/facts shape
# (plan.filters.categoryId, a group's key, plan.version) -- the same
# enumeration risk as the magnitude-word list and the pre-Pd-category dash
# set: a future payload field that is also an id (a merchant id, a
# transaction id) needs adding here explicitly, or its value grounds
# captions the same way any other number does.
_NOT_FIGURES = frozenset({"categoryId", "key", "version"})


def number_tokens(text: str) -> list[str]:
    """Every number-like token in a string, exactly as written, in order."""
    return _NUMBER.findall(text.translate(_TEXT_FIXUP))


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

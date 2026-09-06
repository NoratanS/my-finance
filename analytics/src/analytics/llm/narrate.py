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

import json
import logging
import re
import sys
import unicodedata
from collections.abc import Callable
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

logger = logging.getLogger(__name__)

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


_MONEY = Decimal("0.01")
_PCT = Decimal("0.1")


def _money(value: Decimal) -> str:
    return str(value.quantize(_MONEY, rounding=ROUND_HALF_UP))


def _pct(part: Decimal, whole: Decimal) -> str | None:
    """A percentage as a 1 dp string, or None when there is nothing to divide by."""
    if whole == 0:
        return None
    return str((part / whole * 100).quantize(_PCT, rounding=ROUND_HALF_UP))


def _group_facts(totals: list[tuple[str, Decimal]]) -> dict:
    """Totals, shares and the gap to the runner-up — for breakdown and split alike.

    Ranked by absolute value, matching how the executor sorts a breakdown, so
    "leads"/"top" mean the same thing in the caption as on the chart.
    """
    ranked = sorted(totals, key=lambda item: abs(item[1]), reverse=True)
    grand = sum((total for _, total in ranked), Decimal(0))
    items = []
    for label, total in ranked:
        item = {"label": label, "total": _money(total)}
        share = _pct(total, grand)
        if share is not None:
            item["sharePct"] = share
        items.append(item)
    facts: dict = {"groups": len(ranked), "total": _money(grand), "items": items}
    if len(ranked) >= 2 and ranked[1][1] != 0:
        facts["topGapPct"] = _pct(ranked[0][1] - ranked[1][1], abs(ranked[1][1]))
    return facts


def narration_facts(envelope: dict) -> list[dict]:
    """Per-currency figures a caption may cite, all computed here.

    This is where the arithmetic the model is forbidden to do actually happens:
    totals, per-bucket averages, shares of the total, the change across the
    range, the gap between the top two. The model gets them as data and can
    only quote them.
    """
    interval = (envelope.get("plan") or {}).get("interval")
    facts: list[dict] = []
    for result in envelope.get("results", []):
        shape = result["shape"]
        fact: dict = {"currency": result["currency"], "shape": shape}
        if shape == "value":
            fact["total"] = _money(Decimal(result["value"]))
        elif shape == "timeseries":
            points = result["points"]
            values = [Decimal(point["value"]) for point in points]
            total = sum(values, Decimal(0))
            if interval is not None:
                fact["interval"] = interval
            fact["buckets"] = len(points)
            fact["total"] = _money(total)
            if points:
                fact["perBucketAverage"] = _money(total / len(points))
                fact["firstPeriod"] = points[0]["period"]
                fact["lastPeriod"] = points[-1]["period"]
                change = _pct(values[-1] - values[0], abs(values[0]))
                if change is not None:
                    fact["changePct"] = change
        elif shape == "breakdown":
            fact.update(
                _group_facts(
                    [(g["label"], Decimal(g["value"])) for g in result["groups"]]
                )
            )
        elif shape == "timeseriesSplit":
            series = result["series"]
            buckets = len(series[0]["points"]) if series else 0
            if interval is not None:
                fact["interval"] = interval
            fact["buckets"] = buckets
            fact.update(
                _group_facts(
                    [
                        (one["label"],
                         sum((Decimal(p["value"]) for p in one["points"]), Decimal(0)))
                        for one in series
                    ]
                )
            )
            if buckets:
                # Read each average off the item's own total: _group_facts reorders
                # by rank, so zipping against series order mislabels the averages.
                for item in fact["items"]:
                    item["perBucketAverage"] = _money(Decimal(item["total"]) / buckets)
        facts.append(fact)
    return facts


def fallback_caption(facts: list[dict]) -> str:
    """A caption built with no model — every figure comes straight from `facts`.

    The degrade path. A model that is absent, unreachable, or that keeps
    inventing numbers costs the user phrasing, never the caption: "no feature
    exists only behind the AI" (docs/INSIGHTS.md, "The AI layer").
    """
    parts = []
    for fact in facts:
        piece = f"{fact['currency']} total {fact['total']}"
        if "perBucketAverage" in fact:
            piece += f", averaging {fact['perBucketAverage']} per {fact.get('interval', 'bucket')}"
        items = fact.get("items", [])
        if items:
            piece += f", led by {items[0]['label']} at {items[0]['total']}"
        parts.append(piece)
    if not parts:
        return "No data for this plan."
    return "; ".join(parts) + "."


CAPTION_RULES = (
    "Write one sentence of at most 20 words describing the chart this data draws.\n"
    "Rules:\n"
    '- Use only the numbers listed under "facts" above, copied digit for digit exactly\n'
    "  as written: no thousands separators, no rounding, and no words or abbreviations\n"
    '  for magnitude (never "k", "mil", "thousand", "million", "mln", "tys.").\n'
    "- Never add, subtract, average, round or otherwise compute a number yourself.\n"
    "- Describe only what the facts state: no forecast, no trend, no outlier, and no\n"
    "  comparison beyond the numbers given.\n"
    "- Keep each number's unit as given: a number next to a percentage field stays a\n"
    "  percentage, a money total stays money — never state one as the other.\n"
    "- Answer with the sentence only: no preamble, no quotes, no markdown.\n"
)


def build_narration_prompt(payload: dict) -> str:
    """The whole prompt: the data, then the rules. Nothing about the profile."""
    return "Data (JSON):\n" + json.dumps(payload, ensure_ascii=False) + "\n\n" + CAPTION_RULES


def build_retry_prompt(payload: dict, caption: str, ungrounded: list[str]) -> str:
    """The one retry, told exactly which tokens were rejected."""
    problem = (
        "it used numbers that are not in the data: " + ", ".join(ungrounded)
        if ungrounded
        else "it was empty"
    )
    return (
        build_narration_prompt(payload)
        + f'\nYour previous answer ("{caption}") was rejected because {problem}.\n'
        + "Rewrite it using only numbers that appear in the JSON above.\n"
    )


def first_sentence(raw: str) -> str:
    """The model's answer trimmed to one line, without wrapping quotes."""
    stripped = raw.strip()
    if not stripped:
        return ""
    return stripped.splitlines()[0].strip().strip('"').strip()


def narrate(envelope: dict, *, generate: Callable[[str], str] | None) -> str:
    """A caption for an executed envelope. Always grounded, always returns.

    Tries the model at most twice — once, then once more with the offending
    tokens quoted back — and degrades to `fallback_caption` when it is absent,
    unreachable, or still inventing numbers.

    "Always returns" includes an envelope this cannot read. Reading one is the
    only step outside the loop's own guard, and a caption is a convenience on a
    chart the reader already has, so a malformed envelope earns the empty
    caption rather than a 500 — saying nothing about data we could not parse.
    """
    try:
        facts = narration_facts(envelope)
    except Exception as exc:  # noqa: BLE001 - see above: never a 500
        logger.warning("could not read the envelope for narration: %s", exc)
        return fallback_caption([])
    if generate is None:
        return fallback_caption(facts)

    payload = {"envelope": envelope, "facts": facts}
    prompt = build_narration_prompt(payload)
    for _ in range(2):
        try:
            caption = first_sentence(generate(prompt))
        except Exception as exc:  # noqa: BLE001 - narration is convenience, never a 500
            logger.warning("narration model call failed, using the computed caption: %s", exc)
            break
        ungrounded = ungrounded_numbers(caption, payload)
        if caption and not ungrounded:
            return caption
        logger.info("rejected caption %r (ungrounded: %s)", caption, ungrounded)
        prompt = build_retry_prompt(payload, caption, ungrounded)
    return fallback_caption(facts)

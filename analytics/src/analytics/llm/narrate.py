"""Grounded narration: Python owns every number, the model only writes the sentence.

`INSIGHTS.md` principle 2 — "the LLM never queries data and never does
arithmetic" — is impossible to enforce by prompting alone: a 4 GB model asked
for "24% below Lidl" will happily compute 24% wrongly. So the narration
endpoint hands the model an executed envelope plus a block of figures computed
here, and afterwards re-reads the sentence it gets back: every number token in
it must be a number that was in the payload. A caption that invents one is not
narration, and it does not ship.
"""

from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation

# A number token: an optional sign, then either digits with an optional
# decimal tail ("1204", "1204.00") or a decimal point straight into digits
# with no leading digit ("212.4567" -> ".5" style captions). A trailing
# k/m magnitude suffix ("1.2k") is captured into the token on purpose: Decimal
# then fails to parse it, so it always lands in the ungrounded list instead of
# being compared as its bare digits and coincidentally matching an unrelated
# figure the same size as the un-scaled number.
# The lookbehind is what stops "2026-07" yielding "-07" and "2793.48" yielding
# a second token "48" — a separator that follows a digit is not a sign.
_NUMBER = re.compile(r"(?<![\d.,])-?(?:\d+(?:[.,]\d+)?|[.,]\d+)[kKmM]?")

# U+2212 MINUS SIGN is what the frontend renders (frontend/src/lib/money.ts,
# formatSigned); a model shown that text may echo it back.
_MINUS = "−"

# Machine-facing ids are not figures. A caption citing "14" because 14 is a
# category id is not quoting the data, so these keys ground nothing.
_NOT_FIGURES = frozenset({"categoryId", "key", "version"})


def number_tokens(text: str) -> list[str]:
    """Every number-like token in a string, exactly as written, in order."""
    return _NUMBER.findall(text.replace(_MINUS, "-"))


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
        candidate = _to_decimal(token)
        if candidate is None or not any(_grounds(candidate, value) for value in allowed):
            bad.append(token)
    return bad

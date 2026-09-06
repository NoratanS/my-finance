"""The check that makes "the AI cannot produce a wrong number" true.

A caption is accepted only when every number-like token in it is a number the
model was actually shown. These tests pin the rules down so nobody "fixes"
them later:

* Rounding is allowed, but only within half an ulp of the precision the
  caption used: a caption number is grounded when some payload number rounds
  to it at that precision. "212" is fine for 212.4567 (0dp, tolerance 0.5);
  "212.6" is not (1dp, tolerance 0.05) — but "212.5" IS, because 212.4567
  itself rounds to 212.5 at 1dp under the same rule. Verified empirically
  during Task 14 code review: the code is right, an earlier draft of this
  note was wrong about its own file.
* Nothing is derived. The checker does no arithmetic at all. Percentages and
  averages are grounded because `narration_facts` (Task 15) computed them into
  the payload, not because the checker recomputes them from pairs of values.
* U+2212 MINUS SIGN, and every other dash-like glyph a model might render as
  a negative sign (en/em/figure dash, and others — see `_DASHES` in
  `narrate.py`), normalises to "-": the frontend renders U+2212
  (`lib/money.ts` `formatSigned`), so a model shown that text may echo it,
  and a free-generating model can reach for any Unicode dash.
* A digit-grouped number ("1,204", "1,234.50", "1.234,50", "1,234,567", a
  group separated by NBSP/thin-space, or split across a line) is refused as
  one structural unit — never silently reinterpreted (a lone comma is not
  simply "the decimal point": "1,234" is 1234 in one locale and 1.234 in
  another) and never left with a dropped tail that grounds on its own. This
  is deliberate: grounding the wrong reading is exactly the failure this
  module exists to prevent, and the cost is a dropped caption, never a wrong
  number. Plain ASCII space is the one exception, and stays a token boundary
  rather than a grouping separator: "Lidl spent 2 793,48 PLN." tokenizes as
  "2" (grounds, e.g. against a merchant count) and "793,48" (does not) —
  not as one merged, refused span — because a plain space overwhelmingly
  means "these are two different numbers in a sentence" in ordinary prose,
  unlike a comma, a period, or a typographic (non-breaking) grouping space.
* Machine ids — `categoryId`, a group's `key`, the plan `version` — ground
  nothing. A sentence saying "14" because 14 happens to be a category id is
  not quoting the data.
"""

from decimal import Decimal

import pytest

from analytics.llm.narrate import number_tokens, numbers_in, ungrounded_numbers

PAYLOAD = {
    "envelope": {
        "plan": {
            "version": 1,
            "metric": "spend",
            "filters": {"categoryId": 47, "currency": "PLN"},
            "groupBy": "merchant",
            "interval": None,
            "range": {"type": "lastMonths", "n": 12},
        },
        "results": [
            {
                "currency": "PLN",
                "shape": "breakdown",
                "groups": [
                    {"key": "Lidl", "label": "Lidl", "value": "2793.4800"},
                    {"key": "Biedronka", "label": "Biedronka", "value": "2123.1600"},
                ],
            }
        ],
        "meta": {"truncatedGroups": False},
    },
    "facts": [
        {
            "currency": "PLN",
            "shape": "breakdown",
            "groups": 2,
            "total": "4916.64",
            "items": [
                {"label": "Lidl", "total": "2793.48", "sharePct": "56.8"},
                {"label": "Biedronka", "total": "2123.16", "sharePct": "43.2"},
            ],
            "topGapPct": "31.6",
        }
    ],
}


@pytest.mark.parametrize(
    "caption",
    [
        "Lidl leads at 2793.48 PLN, 31.6% above Biedronka.",
        "Lidl spent 2793 PLN over the last 12 months.",
        "Groceries totalled 4916.64 PLN across 2 merchants.",
        "Biedronka took 43.2% of the 4916.64 PLN spent.",
        "Spending is concentrated in two supermarkets.",
    ],
)
def test_captions_quoting_the_payload_are_grounded(caption):
    assert ungrounded_numbers(caption, PAYLOAD) == []


@pytest.mark.parametrize(
    ("caption", "expected"),
    [
        ("Lidl leads at 2800.00 PLN.", ["2800.00"]),
        ("Lidl is 40% above Biedronka.", ["40"]),
        ("Spending fell 12.5% year on year.", ["12.5"]),
        ("Lidl spent 2 793,48 PLN.", ["793,48"]),
        ("The top category is 47.", ["47"]),
        ("Lidl took 2793.48 PLN and an invented 999.00.", ["999.00"]),
    ],
)
def test_invented_numbers_are_reported(caption, expected):
    assert ungrounded_numbers(caption, PAYLOAD) == expected


def test_a_minus_sign_from_the_ui_is_not_a_new_number():
    payload = {"results": [{"currency": "PLN", "shape": "value", "value": "-243.5000"}]}
    assert ungrounded_numbers("Net was −243.50 PLN.", payload) == []


def test_number_tokens_reads_a_period_as_a_year_and_a_bucket():
    assert number_tokens("2026-07 and 2026-Q3") == ["2026", "07", "2026", "3"]


def test_numbers_in_skips_machine_ids():
    payload = {"categoryId": 47, "key": "14", "version": 1, "label": "Route 66"}
    assert numbers_in(payload) == {Decimal("66")}


def test_booleans_are_not_numbers():
    assert numbers_in({"truncatedGroups": False}) == set()


# --- Adversarial cases added beyond the brief's pinned tests (Task 14 report) ---
#
# A caption can write a fractional number without a leading zero (".5" instead
# of "0.5"). If the extractor's regex requires a leading digit before the
# decimal point, such a token is invisible to number_tokens entirely — it
# doesn't even reach the "is this grounded" comparison, so an invented ".5"
# with no matching payload figure silently passes as if the caption cited
# nothing. That is a hallucinated figure slipping through, which is the
# failure this module exists to prevent.


def test_a_leading_dot_decimal_is_not_invisible_to_the_checker():
    payload = {"facts": [{"total": "1204.0000"}]}
    assert ungrounded_numbers("Spend grew by .5 of the total.", payload) == [".5"]


def test_a_leading_dot_decimal_still_grounds_against_a_matching_figure():
    payload = {"facts": [{"share": "0.5"}]}
    assert ungrounded_numbers("Half the spend, .5 of the total.", payload) == []


# A "k"/"m" magnitude suffix ("1.2k" for 1200) is not arithmetic the checker
# will ever perform — scaling by 1000 is exactly the kind of computation this
# module refuses to do. But if the digits before the suffix are extracted and
# compared on their own, "1.2k" can accidentally ground against an unrelated
# payload figure that happens to equal 1.2 (a percentage, say), even though
# "1.2k" claims a completely different magnitude (1200). The chosen fix fails
# closed: a trailing k/m is folded into the token so it can never parse as a
# Decimal, so it always lands in the ungrounded list instead of silently
# matching by coincidence.


def test_a_k_suffix_does_not_ground_against_an_unrelated_decimal():
    payload = {"facts": [{"sharePct": "1.2", "total": "500.00"}]}
    assert ungrounded_numbers("Spend was 1.2k PLN.", payload) == ["1.2k"]


def test_number_tokens_reads_a_year_bucket_and_dot_decimal_together():
    assert number_tokens("2026-07, .5 share, 1.2k spend") == ["2026", "07", ".5", "1.2k"]


# --- Round 2: hostile cases from code review (Task 14 report, "Round 2") ---
#
# Review found three critical gaps in the round-1 fix, all the same shape:
# a numeric-looking span that cannot be parsed as one unambiguous number was
# fragmented into pieces, and the pieces grounded independently on unrelated
# payload figures instead of the whole span being refused. Fixed by widening
# what counts as "ambiguous" and refusing those shapes structurally, whether
# or not they happen to parse as a valid Decimal.

# C1 — a magnitude suffix escapes detection when separated by a space or
# spelled out as a word ("1.2 thousand", "2 million"), not just glued
# ("1.2k"). All forms must fold into one refused token.


@pytest.mark.parametrize(
    ("caption", "payload"),
    [
        ("Lidl spent 12 thousand PLN.", {"facts": [{"total": "2793.48"}]}),
        ("Spending reached 2 million PLN.", {"facts": [{"total": "500.00"}]}),
        # 43.2 exists in PAYLOAD as a sharePct; the bare digits must not ground.
        ("Lidl spent 43.2 k PLN.", PAYLOAD),
        ("Spend rose 1.2bn PLN.", {"facts": [{"total": "1.2"}]}),
        ("Spend rose 1.2B PLN.", {"facts": [{"total": "1.2"}]}),
        # Polish "tys." (tysiąc/thousand) with a comma decimal.
        ("Spend rose 2,8 tys. PLN.", {"facts": [{"total": "2.8"}]}),
    ],
)
def test_magnitude_suffixes_are_refused_glued_spaced_or_spelled(caption, payload):
    assert ungrounded_numbers(caption, payload) != []


# C2 — every dash-like glyph a model might render as a minus sign must
# normalise to "-", not just U+2212. Each of these captions claims a negative
# figure that matches the (negative) payload only if the sign survives.


@pytest.mark.parametrize(
    "dash",
    ["−", "–", "—", "‒", "˗", "﹣", "－", "➖"],
    ids=["minus", "en", "em", "figure", "modifier", "small-hyphen", "fullwidth", "heavy"],
)
def test_every_dash_variant_normalises_to_a_minus_sign(dash):
    payload = {"facts": [{"total": "-243.5000"}]}
    assert ungrounded_numbers(f"Net was {dash}243.50 PLN.", payload) == []
    # And the sign still matters: the same digits with no sign, against the
    # same negative payload, must NOT ground -- proves this isn't passing by
    # ignoring sign altogether.
    assert ungrounded_numbers("Net was 243.50 PLN.", payload) == ["243.50"]


# C3 — a digit-grouped number is refused as one structural unit, never
# silently reinterpreted (a single comma is not "the decimal point") and
# never left with a dropped tail that grounds on its own.


@pytest.mark.parametrize(
    ("caption", "payload"),
    [
        # "1,204" naively reinterpreted as 1.204 rounds to 1.2040 -- a real
        # collision, not a hypothetical one.
        ("Total hit 1,204 PLN.", {"facts": [{"total": "1.2040"}]}),
        ("Total hit 1,234.50 PLN.", {"facts": [{"total": "500.00"}]}),
        ("Total hit 1.234,50 PLN.", {"facts": [{"total": "500.00"}]}),
        ("Total hit 1,234,567 PLN.", {"facts": [{"total": "500.00"}]}),
        ("Total hit 1 204 PLN.", {"facts": [{"total": "500.00"}]}),  # NBSP group
        ("Total hit 1 204 PLN.", {"facts": [{"total": "500.00"}]}),  # thin space
        ("Total hit 1\n204 PLN.", {"facts": [{"total": "500.00"}]}),  # line-split
    ],
)
def test_grouped_separators_are_refused_structurally(caption, payload):
    assert ungrounded_numbers(caption, payload) != []


# I1/I2 — a vulgar fraction or exponent/power form is refused rather than
# yielding no token (invisible) or fragmenting into pieces that ground.


@pytest.mark.parametrize(
    ("caption", "payload"),
    [
        ("Lidl took ½ of the spend.", {"facts": [{"total": "500"}]}),
        ("Lidl took ¾ of the spend.", {"facts": [{"total": "500"}]}),
        ("Lidl took 2½ times as much.", {"facts": [{"total": "2"}, {"total": "500"}]}),
        # Decimal parses "1e3" as 1000; it must still be refused, since the
        # module does not evaluate exponent notation as a plain figure.
        ("Growth was 1e3 vs a base of 1000.", {"facts": [{"total": "1000.0000"}]}),
        ("Growth was 10^3 percent.", {"facts": [{"total": "10"}, {"total": "3"}]}),
        ("Growth was 10³ percent.", {"facts": [{"total": "10"}, {"total": "3"}]}),
    ],
)
def test_fractions_and_exponents_are_refused(caption, payload):
    assert ungrounded_numbers(caption, payload) != []


# A leading-dot decimal (round 1's ".5" fix) composed with a magnitude word
# or exponent notation (round 2's new shapes) escapes both fixes at once: the
# magnitude/exponent patterns required a leading digit before the decimal
# point, so ".5 thousand" or ".5e3" fell through to the plain leading-dot
# path, which strips the suffix and grounds the bare ".5" against any
# unrelated payload figure that happens to equal 0.5 -- exactly the kind of
# fragment-and-collide bypass round 2 exists to close.


def test_a_dot_lead_number_still_folds_a_magnitude_word():
    payload = {"facts": [{"share": "0.5"}]}
    assert ungrounded_numbers("Spend was .5 thousand PLN.", payload) != []


def test_a_dot_lead_number_still_folds_exponent_notation():
    # Without the fix, ".5" grounds against the unrelated 0.5 and "3" grounds
    # against the unrelated 3 -- both fragments coincidentally match, so the
    # caption (meaning 500) passes in full. That is the bug, not a corner
    # case: pick any payload with those two figures and it reproduces.
    payload = {"facts": [{"share": "0.5", "count": "3"}]}
    assert ungrounded_numbers("Spend was .5e3 PLN.", payload) != []

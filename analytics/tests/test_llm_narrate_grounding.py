"""The check that makes "the AI cannot produce a wrong number" true.

A caption is accepted only when every number-like token in it is a number the
model was actually shown. These tests pin the rules down so nobody "fixes"
them later:

* Rounding is allowed, in the safe direction only: a caption number is
  grounded when some payload number rounds to it at the precision the caption
  used — half an ulp of that precision. "212" is fine for 212.4567;
  "212.5" is not.
* Nothing is derived. The checker does no arithmetic at all. Percentages and
  averages are grounded because `narration_facts` (Task 15) computed them into
  the payload, not because the checker recomputes them from pairs of values.
* U+2212 MINUS SIGN normalises to "-": the frontend renders it
  (`lib/money.ts` `formatSigned`), so a model shown that text may echo it.
* A digit-group separator ("2 793,48", "1,234.50") makes the caption fail.
  Deliberate: "1,234" is 1234 in one locale and 1.234 in another, and
  grounding the wrong reading is exactly the failure this module exists to
  prevent. The cost is a dropped caption, never a wrong number.
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

"""Table-driven plan-problem tests, backup-validator style: every violation is one string that
pinpoints the field, and nothing is silently ignored."""

import pytest

from analytics.plan import MAX_MERCHANT_LENGTH, MAX_MERCHANTS
from analytics.validation import MERCHANT_UNAVAILABLE, validate_plan

VALID = {
    "version": 1,
    "metric": "spend",
    "filters": {"categoryId": 10, "includeDescendants": True, "currency": "PLN"},
    "groupBy": "category",
    "interval": "month",
    "range": {"type": "lastMonths", "n": 12},
}

CASES = [
    ("a minimal plan is valid",
     {"version": 1, "metric": "net", "range": {"type": "all"}}, []),
    ("not an object", [1, 2, 3], ["plan: must be a JSON object"]),
    ("unknown top-level field",
     {"version": 1, "metric": "spend", "range": {"type": "all"}, "split": "merchant"},
     ["split: unknown field"]),
    ("missing version",
     {"metric": "spend", "range": {"type": "all"}}, ["version: is required"]),
    ("unsupported version",
     # 99 rather than the next unreserved integer (3): a future stage could plausibly claim 3,
     # but nothing will ever claim 99, so this probe never needs to move again.
     {"version": 99, "metric": "spend", "range": {"type": "all"}},
     ["version: unsupported plan version 99"]),
    ("version 2 is supported",
     {"version": 2, "metric": "spend", "range": {"type": "all"}},
     []),
    ("a v2 plan with a forecast is valid",
     {"version": 2, "metric": "spend", "interval": "month", "range": {"type": "all"},
      "forecast": {"months": 3}},
     []),
    ("forecast on a v1 plan is rejected",
     {"version": 1, "metric": "spend", "interval": "month", "range": {"type": "all"},
      "forecast": {"months": 3}},
     ["forecast: requires plan version 2"]),
    ("true is not version 1",
     {"version": True, "metric": "spend", "range": {"type": "all"}},
     ["version: must be an integer"]),
    ("missing metric", {"version": 1, "range": {"type": "all"}}, ["metric: is required"]),
    ("unknown metric",
     {"version": 1, "metric": "savings", "range": {"type": "all"}},
     ["metric: must be one of spend, income, net"]),
    ("unknown groupBy",
     {"version": 1, "metric": "spend", "groupBy": "currency", "range": {"type": "all"}},
     ["groupBy: must be one of category, merchant, or null"]),
    ("merchant grouping is not available yet",
     {"version": 1, "metric": "spend", "groupBy": "merchant", "range": {"type": "all"}},
     [f"groupBy: {MERCHANT_UNAVAILABLE}"]),
    ("merchant filtering and grouping are not available yet",
     {"version": 1, "metric": "spend", "filters": {"merchants": ["Lidl"]},
      "range": {"type": "all"}},
     [f"filters.merchants: {MERCHANT_UNAVAILABLE}"]),
    ("unknown interval",
     {"version": 1, "metric": "spend", "interval": "fortnight", "range": {"type": "all"}},
     ["interval: must be one of day, week, month, quarter, year, or null"]),
    ("unknown filter field",
     {"version": 1, "metric": "spend", "filters": {"minAmount": 5}, "range": {"type": "all"}},
     ["filters.minAmount: unknown field"]),
    ("categoryId from another profile is not in this one",
     {"version": 1, "metric": "spend", "filters": {"categoryId": 90}, "range": {"type": "all"}},
     ["filters.categoryId: 90 does not exist in this profile"]),
    ("stale categoryId",
     {"version": 1, "metric": "spend", "filters": {"categoryId": 999}, "range": {"type": "all"}},
     ["filters.categoryId: 999 does not exist in this profile"]),
    ("categoryId must be an integer",
     {"version": 1, "metric": "spend", "filters": {"categoryId": "10"}, "range": {"type": "all"}},
     ["filters.categoryId: must be an integer"]),
    ("includeDescendants must be a boolean",
     {"version": 1, "metric": "spend", "filters": {"includeDescendants": "yes"},
      "range": {"type": "all"}},
     ["filters.includeDescendants: must be true or false"]),
    ("includeDescendants without categoryId is accepted and has no effect",
     {"version": 1, "metric": "spend", "filters": {"includeDescendants": True},
      "range": {"type": "all"}},
     []),
    ("lowercase currency",
     {"version": 1, "metric": "spend", "filters": {"currency": "pln"},
      "range": {"type": "all"}},
     ["filters.currency: must be a three-letter ISO 4217 code"]),
    ("missing range", {"version": 1, "metric": "spend"}, ["range: is required"]),
    ("unknown range type",
     {"version": 1, "metric": "spend", "range": {"type": "sinceForever"}},
     ["range.type: must be one of lastMonths, yearToDate, absolute, all"]),
    ("lastMonths needs a positive n",
     {"version": 1, "metric": "spend", "range": {"type": "lastMonths", "n": 0}},
     ["range.n: must be a positive integer"]),
    ("true is not a bucket count",
     {"version": 1, "metric": "spend", "range": {"type": "lastMonths", "n": True}},
     ["range.n: must be a positive integer"]),
    ("a field that belongs to another range type",
     {"version": 1, "metric": "spend", "range": {"type": "yearToDate", "n": 3}},
     ["range.n: unknown field for a yearToDate range"]),
    ("absolute needs both ends",
     {"version": 1, "metric": "spend", "range": {"type": "absolute", "from": "2026-01-01"}},
     ["range.to: is required, as an ISO date like 2026-01-31"]),
    ("from after to",
     {"version": 1, "metric": "spend",
      "range": {"type": "absolute", "from": "2026-06-30", "to": "2026-01-01"}},
     ["range: from must not be after to"]),
    ("several problems are reported together",
     {"version": 9, "metric": "savings", "range": {"type": "all"}, "zoom": 2},
     ["zoom: unknown field",
      "version: unsupported plan version 9",
      "metric: must be one of spend, income, net"]),
]


@pytest.mark.parametrize("name, raw, expected", CASES, ids=[c[0] for c in CASES])
def test_validate_plan(name, raw, expected, conn):
    assert validate_plan(raw, profile_id=1, conn=conn, merchant_enabled=False) == expected


def test_the_canonical_plan_is_valid(conn):
    assert validate_plan(VALID, profile_id=1, conn=conn, merchant_enabled=False) == []


def test_merchants_are_accepted_once_the_column_lands(conn):
    """MY-33 flips the flag; this pins that nothing else about the field changes."""
    raw = {"version": 1, "metric": "spend", "filters": {"merchants": ["Lidl", "Biedronka"]},
           "range": {"type": "all"}}
    assert validate_plan(raw, profile_id=1, conn=conn, merchant_enabled=True) == []
    assert validate_plan({**raw, "filters": {"merchants": []}}, profile_id=1, conn=conn,
                         merchant_enabled=True) == [
        "filters.merchants: must be a non-empty array of merchant names"]


def test_the_merchant_filter_is_bounded(conn):
    """executor.py's rule — authenticated input must not choose how many objects the server
    builds — applied to the one plan collection that had no bound."""
    def problems(merchants):
        return validate_plan(
            {"version": 1, "metric": "spend", "filters": {"merchants": merchants},
             "range": {"type": "all"}},
            profile_id=1, conn=conn, merchant_enabled=True)

    too_many = f"filters.merchants: at most {MAX_MERCHANTS} merchants"
    too_long = (f"filters.merchants: each merchant must be at most "
                f"{MAX_MERCHANT_LENGTH} characters")

    assert problems(["Lidl"] * MAX_MERCHANTS) == []
    assert problems(["Lidl"] * (MAX_MERCHANTS + 1)) == [too_many]
    # 100 chars is the V5 CHECK on txn.merchant; one more can never match a row.
    assert problems(["x" * MAX_MERCHANT_LENGTH]) == []
    assert problems(["x" * (MAX_MERCHANT_LENGTH + 1)]) == [too_long]
    # Both bounds accumulate: problems are collected, never reported fail-fast.
    assert problems(["x" * (MAX_MERCHANT_LENGTH + 1)] * (MAX_MERCHANTS + 1)) == [
        too_many, too_long]

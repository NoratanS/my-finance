"""Table-driven range and bucket-key tests. lastMonths yields n buckets total (spec D5) and the
clock is injected (spec D6), so the two subtle cases are the year boundary and yearToDate."""

from datetime import date

import pytest

from analytics.plan import Range
from analytics.ranges import (
    ALL_END,
    ALL_START,
    bucket_count,
    bucket_start,
    bucket_starts,
    period_key,
    resolve_range,
)

RANGES = [
    # spec D5: n buckets total — n-1 complete months plus the current partial one.
    ("12 months from mid-September", Range("lastMonths", n=12), date(2026, 9, 15),
     (date(2025, 10, 1), date(2026, 9, 15))),
    ("1 month is the current month only", Range("lastMonths", n=1), date(2026, 1, 31),
     (date(2026, 1, 1), date(2026, 1, 31))),
    ("3 months crossing the year boundary", Range("lastMonths", n=3), date(2026, 2, 10),
     (date(2025, 12, 1), date(2026, 2, 10))),
    ("24 months", Range("lastMonths", n=24), date(2026, 9, 15),
     (date(2024, 10, 1), date(2026, 9, 15))),
    ("year to date", Range("yearToDate"), date(2026, 9, 15),
     (date(2026, 1, 1), date(2026, 9, 15))),
    ("year to date on 1 January", Range("yearToDate"), date(2026, 1, 1),
     (date(2026, 1, 1), date(2026, 1, 1))),
    ("absolute is passed through", Range("absolute", start=date(2026, 1, 1), end=date(2026, 6, 30)),
     date(2026, 9, 15), (date(2026, 1, 1), date(2026, 6, 30))),
    ("all resolves to the sentinels", Range("all"), date(2026, 9, 15), (ALL_START, ALL_END)),
]


@pytest.mark.parametrize("name, rng, today, expected", RANGES, ids=[r[0] for r in RANGES])
def test_resolve_range(name, rng, today, expected):
    assert resolve_range(rng, today) == expected


BUCKETS = [
    ("months over a year boundary", "month", date(2025, 10, 1), date(2026, 9, 15),
     ["2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03",
      "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]),
    ("ISO weeks start on Monday, including the one before 1 January",
     "week", date(2026, 1, 1), date(2026, 1, 20),
     ["2025-12-29", "2026-01-05", "2026-01-12", "2026-01-19"]),
    ("days across a month end", "day", date(2026, 2, 27), date(2026, 3, 2),
     ["2026-02-27", "2026-02-28", "2026-03-01", "2026-03-02"]),
    ("quarters", "quarter", date(2026, 2, 1), date(2026, 8, 31),
     ["2026-Q1", "2026-Q2", "2026-Q3"]),
    ("quarters across a year boundary", "quarter", date(2025, 11, 1), date(2026, 2, 1),
     ["2025-Q4", "2026-Q1"]),
    ("years", "year", date(2024, 6, 1), date(2026, 3, 1), ["2024", "2025", "2026"]),
    ("a single bucket when both ends fall inside it", "month", date(2026, 5, 3), date(2026, 5, 29),
     ["2026-05"]),
    ("days across a leap-year February 29th", "day", date(2024, 2, 27), date(2024, 3, 2),
     ["2024-02-27", "2024-02-28", "2024-02-29", "2024-03-01", "2024-03-02"]),
]


@pytest.mark.parametrize(
    "name, interval, start, end, expected", BUCKETS, ids=[b[0] for b in BUCKETS]
)
def test_bucket_starts(name, interval, start, end, expected):
    assert bucket_starts(interval, start, end) == expected


@pytest.mark.parametrize(
    "name, interval, start, end, expected", BUCKETS, ids=[b[0] for b in BUCKETS]
)
def test_bucket_count_agrees_with_bucket_starts(name, interval, start, end, expected):
    assert bucket_count(interval, start, end) == len(expected)


def test_bucket_count_does_not_build_the_list():
    """The executor's cap must be checkable before a pathological range allocates anything."""
    assert bucket_count("day", date(1, 1, 1), date(9999, 12, 31)) == 3652059


def test_bucket_start_truncates_like_date_trunc():
    assert bucket_start("week", date(2026, 9, 1)) == date(2026, 8, 31)  # a Tuesday -> its Monday
    assert bucket_start("month", date(2026, 9, 15)) == date(2026, 9, 1)
    assert bucket_start("quarter", date(2026, 9, 15)) == date(2026, 7, 1)
    assert bucket_start("year", date(2026, 9, 15)) == date(2026, 1, 1)
    assert bucket_start("day", date(2026, 9, 15)) == date(2026, 9, 15)


def test_period_key_formats_match_the_result_shape_contract():
    assert period_key("day", date(2026, 7, 13)) == "2026-07-13"
    assert period_key("week", date(2026, 7, 13)) == "2026-07-13"
    assert period_key("month", date(2026, 7, 1)) == "2026-07"
    assert period_key("quarter", date(2026, 7, 1)) == "2026-Q3"
    assert period_key("year", date(2026, 1, 1)) == "2026"

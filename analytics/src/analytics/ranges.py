"""Range resolution and bucket keys (docs/INSIGHTS.md "Plan DSL v1" → range, "Result shapes").

This module is the *only* place a bucket key is formatted. The SQL returns the truncated bucket
as a plain date and the executor formats it here, so the keys rows carry and the keys empty
buckets are filled with can never drift apart.
"""

from __future__ import annotations

from datetime import date, timedelta

from analytics.plan import Range

# range: "all" has no bounds. These sentinels keep one code path in the SQL builder: Postgres
# DATE spans 4713 BC … 5874897 AD, so BETWEEN over them matches every row.
ALL_START = date.min
ALL_END = date.max


def resolve_range(rng: Range, today: date) -> tuple[date, date]:
    """Inclusive [from, to] over txn.occurred_on. `today` is the injectable clock (spec D6),
    read in the instance's timezone — never the database's."""
    if rng.type == "lastMonths":
        # A "lastMonths" range always has n (see plan.Plan); the assert narrows the type.
        assert rng.n is not None
        # n buckets total (spec D5): n-1 complete months plus the current partial one.
        return _shift_months(today.replace(day=1), -(rng.n - 1)), today
    if rng.type == "yearToDate":
        return date(today.year, 1, 1), today
    if rng.type == "absolute":
        # An "absolute" range always has both dates (see plan.Plan); the assert narrows the types.
        assert rng.start is not None and rng.end is not None
        return rng.start, rng.end
    return ALL_START, ALL_END


def bucket_start(interval: str, day: date) -> date:
    """The start of the bucket containing `day`, matching Postgres date_trunc exactly —
    including its ISO/Monday-start weeks."""
    if interval == "day":
        return day
    if interval == "week":
        return day - timedelta(days=day.weekday())
    if interval == "month":
        return day.replace(day=1)
    if interval == "quarter":
        return date(day.year, (day.month - 1) // 3 * 3 + 1, 1)
    return date(day.year, 1, 1)


def period_key(interval: str, start: date) -> str:
    """A bucket's wire format (docs/INSIGHTS.md → Result shapes)."""
    if interval in ("day", "week"):
        return start.isoformat()
    if interval == "month":
        return f"{start.year:04d}-{start.month:02d}"
    if interval == "quarter":
        return f"{start.year:04d}-Q{(start.month - 1) // 3 + 1}"
    return f"{start.year:04d}"


def bucket_count(interval: str, start: date, end: date) -> int:
    """How many buckets `bucket_starts` would produce, without producing them — the executor's
    cap has to be checkable before a pathological range allocates a list."""
    first, last = bucket_start(interval, start), bucket_start(interval, end)
    if interval == "day":
        return (last - first).days + 1
    if interval == "week":
        return (last - first).days // 7 + 1
    months = (last.year - first.year) * 12 + (last.month - first.month)
    if interval == "month":
        return months + 1
    if interval == "quarter":
        return months // 3 + 1
    return last.year - first.year + 1


def bucket_starts(interval: str, start: date, end: date) -> list[str]:
    """Every bucket key from the one containing `start` to the one containing `end`, gap-free.
    This is the x-axis every timeseries — and every series of a timeseriesSplit (spec D4) —
    emits a point for."""
    keys: list[str] = []
    current, last = bucket_start(interval, start), bucket_start(interval, end)
    while current <= last:
        keys.append(period_key(interval, current))
        current = _advance(interval, current)
    return keys


def _advance(interval: str, start: date) -> date:
    if interval == "day":
        return start + timedelta(days=1)
    if interval == "week":
        return start + timedelta(days=7)
    return _shift_months(start, {"month": 1, "quarter": 3, "year": 12}[interval])


def _shift_months(first_of_month: date, months: int) -> date:
    """Month arithmetic on a first-of-month date, which never needs end-of-month clamping."""
    total = first_of_month.year * 12 + (first_of_month.month - 1) + months
    return date(total // 12, total % 12 + 1, 1)

"""Runs a validated plan and shapes the rows into the result envelope
(docs/INSIGHTS.md "Result shapes").

The shape is derived, never declared: interval × groupBy pick one of four.
"""

from __future__ import annotations

from datetime import date

from analytics import sql
from analytics.plan import Plan, parse_plan
from analytics.postprocess import OTHER_KEY, OTHER_LABEL, postprocess
from analytics.ranges import bucket_count, bucket_starts, period_key, resolve_range
from analytics.validation import validate_plan

ZERO = "0.0000"

# Same reasoning as BackupValidator's MAX_PROBLEMS and BillingPeriod's bounded loop:
# authenticated input must not choose how many objects the server builds.
MAX_BUCKETS = 1000

# docs/INSIGHTS.md "Bounded output": a categorical axis is capped at the top 25 groups by
# absolute value plus one aggregate row. "__other__" is namespaced so a real group (a category
# id, a merchant string) can never collide with it.
MAX_GROUPS = 25


class PlanProblems(Exception):
    """A plan that cannot be executed. The route turns `problems` into the 400 body."""

    def __init__(self, problems: list[str]) -> None:
        super().__init__("; ".join(problems))
        self.problems = problems


def execute(conn, profile_id: int, raw_plan: object, *, today: date,
            merchant_enabled: bool) -> dict:
    """Raises PlanProblems(list[str]) on an invalid plan; returns the envelope dict."""
    problems = validate_plan(raw_plan, profile_id=profile_id, conn=conn,
                             merchant_enabled=merchant_enabled)
    if problems:
        raise PlanProblems(problems)

    plan = parse_plan(raw_plan)
    start, end = resolve_range(plan.range, today)
    if plan.interval is not None and plan.range.type != "all":
        _check_bucket_cap(bucket_count(plan.interval, start, end), plan.interval)

    query, params = sql.build_query(plan, profile_id, start, end)
    with conn.cursor() as cur:
        cur.execute(query, params)
        rows = cur.fetchall()

    periods = _periods(plan, rows, start, end)
    results = []
    truncated_any = False
    # A plan that pins one currency answers about that currency even when no row matched;
    # without the filter there is no currency to report an empty result for.
    currencies = sorted({row[0] for row in rows})
    if not currencies and plan.filters.currency is not None:
        currencies = [plan.filters.currency]
    for currency in currencies:
        shape, truncated = _shape(plan, [row for row in rows if row[0] == currency], periods)
        truncated_any = truncated_any or truncated
        results.append({"currency": currency, **shape})
    results = postprocess(
        results,
        interval=plan.interval,
        forecast_months=plan.forecast.months if plan.forecast else None,
        today=today,
    )
    return {"plan": plan.to_json(), "results": results,
            "meta": {"truncatedGroups": truncated_any}}


def _check_bucket_cap(count: int, interval: str) -> None:
    if count > MAX_BUCKETS:
        raise PlanProblems([f"range: {count} {interval} buckets exceeds the limit of "
                            f"{MAX_BUCKETS}; widen the interval or shorten the range"])


def _periods(plan: Plan, rows: list[tuple], start: date, end: date) -> list[str]:
    """The gap-free x-axis every timeseries — and every series of a split (spec D4) — emits a
    point for. A bounded range fills its whole window; `all` has no window, so its extent runs
    from the first bucket that holds a row to the last."""
    if plan.interval is None:
        return []
    if plan.range.type != "all":
        return bucket_starts(plan.interval, start, end)
    buckets = [row[1] for row in rows]
    if not buckets:
        return []
    first, last = min(buckets), max(buckets)
    _check_bucket_cap(bucket_count(plan.interval, first, last), plan.interval)
    return bucket_starts(plan.interval, first, last)


def _shape(plan: Plan, rows: list[tuple], periods: list[str]) -> tuple[dict, bool]:
    """Returns (shape dict, truncated) — `truncated` is False for the two shapes with no
    categorical axis to cap."""
    if plan.interval is not None and plan.group_by is not None:
        return _timeseries_split(plan, rows, periods)
    if plan.interval is not None:
        return {"shape": "timeseries", "points": _points(plan, rows, periods)}, False
    if plan.group_by is not None:
        return _breakdown(rows)
    return {"shape": "value", "value": _amount(rows[0][4]) if rows else ZERO}, False


def _amount(value) -> str:
    """Decimal in, decimal string at scale 4 out — never a float, never client arithmetic."""
    return f"{value:.4f}"


def _points(plan: Plan, rows: list[tuple], periods: list[str]) -> list[dict]:
    totals = {period_key(plan.interval, row[1]): _amount(row[4]) for row in rows}
    return [{"period": period, "value": totals.get(period, ZERO)} for period in periods]


def _breakdown(rows: list[tuple]) -> tuple[dict, bool]:
    kept, dropped, truncated = _rank_and_cap([(row[2], row[3], row[4]) for row in rows])
    groups = [{"key": key, "label": label, "value": _amount(total)}
              for key, label, total in kept]
    if truncated:
        other_total = sum(total for _key, _label, total in dropped)
        groups.append({"key": OTHER_KEY, "label": OTHER_LABEL, "value": _amount(other_total)})
    return {"shape": "breakdown", "groups": groups}, truncated


def _timeseries_split(plan: Plan, rows: list[tuple], periods: list[str]) -> tuple[dict, bool]:
    by_group: dict[str, dict[str, object]] = {}
    labels: dict[str, str] = {}
    totals: dict[str, object] = {}
    for _currency, bucket, key, label, total in rows:
        labels[key] = label
        by_group.setdefault(key, {})[period_key(plan.interval, bucket)] = total
        totals[key] = totals.get(key, 0) + total

    kept, dropped, truncated = _rank_and_cap([(k, labels[k], totals[k]) for k in totals])
    series = [{"key": key, "label": label,
               "points": [{"period": period, "value": _amount(by_group[key].get(period, 0))}
                          for period in periods]}
              for key, label, _total in kept]
    if truncated:
        dropped_keys = [key for key, _label, _total in dropped]
        other_points = [{"period": period,
                         "value": _amount(sum(by_group[key].get(period, 0)
                                              for key in dropped_keys))}
                        for period in periods]
        series.append({"key": OTHER_KEY, "label": OTHER_LABEL, "points": other_points})
    return {"shape": "timeseriesSplit", "series": series}, truncated


def _rank_and_cap(totals: list[tuple]) -> tuple[list[tuple], list[tuple], bool]:
    """Ranks (key, label, total) by absolute value descending — the key breaks ties so the order
    is reproducible — then splits at MAX_GROUPS. `dropped` carries the real (signed) totals of
    the rest, so an "Other" row built from them still sums to the true total rather than to the
    absolute value used only for ranking."""
    ranked = sorted(totals, key=lambda item: (-abs(item[2]), item[0]))
    if len(ranked) <= MAX_GROUPS:
        return ranked, [], False
    return ranked[:MAX_GROUPS], ranked[MAX_GROUPS:], True

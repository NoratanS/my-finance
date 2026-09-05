"""Golden envelopes: every gallery template that v1 can express, plus the edge cases
(empty data with and without a currency filter, multi-currency, truncation, a stale categoryId,
a negative net, all four shapes). Fixture plans are files so the same JSON can be pasted into
the explorer; the expected envelopes live here so the arithmetic sits next to the assertion.
"""

import json
from pathlib import Path

import pytest

from analytics.executor import PlanProblems, execute

PLANS = Path(__file__).parent / "fixtures" / "plans"

ZERO = "0.0000"


def load(name):
    return json.loads((PLANS / f"{name}.json").read_text(encoding="utf-8"))


def months(*pairs):
    """Twelve monthly buckets, 2025-10 … 2026-09, zero unless named."""
    values = dict(pairs)
    keys = ["2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03",
            "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]
    return [{"period": key, "value": values.get(key, ZERO)} for key in keys]


EXPECTED = {
    "monthly_spend_in_category": ([{
        "currency": "PLN", "shape": "timeseries",
        "points": months(("2025-10", "70.0000"), ("2025-12", "130.0000"),
                         ("2026-07", "150.0000"), ("2026-08", "200.0000"),
                         ("2026-09", "325.0000")),
    }], False),

    "top_categories_this_month": ([{
        "currency": "PLN", "shape": "breakdown", "groups": [
            {"key": "40", "label": "Many", "value": "465.0000"},
            {"key": "20", "label": "Transport", "value": "400.0000"},
            {"key": "10", "label": "Groceries", "value": "325.0000"},
        ]}], False),

    "groceries_split_monthly": ([{
        "currency": "PLN", "shape": "timeseriesSplit", "series": [
            {"key": "12", "label": "Biedronka",
             "points": months(("2025-12", "130.0000"), ("2026-07", "50.0000"),
                              ("2026-09", "300.0000"))},
            {"key": "11", "label": "Lidl",
             "points": months(("2025-10", "70.0000"), ("2026-07", "100.0000"),
                              ("2026-08", "200.0000"))},
            {"key": "10", "label": "Groceries", "points": months(("2026-09", "25.0000"))},
        ]}], False),

    "this_vs_last_month_by_category": ([{
        "currency": "PLN", "shape": "timeseriesSplit", "series": [
            {"key": "10", "label": "Groceries", "points": [
                {"period": "2026-08", "value": "200.0000"},
                {"period": "2026-09", "value": "325.0000"}]},
            {"key": "40", "label": "Many", "points": [
                {"period": "2026-08", "value": ZERO},
                {"period": "2026-09", "value": "465.0000"}]},
            {"key": "20", "label": "Transport", "points": [
                {"period": "2026-08", "value": ZERO},
                {"period": "2026-09", "value": "400.0000"}]},
        ]}], False),

    "income_monthly": ([{
        "currency": "PLN", "shape": "timeseries", "points": [
            {"period": "2026-07", "value": ZERO},
            {"period": "2026-08", "value": "4000.0000"},
            {"period": "2026-09", "value": "5000.0000"},
        ]}], False),

    "net_this_month": ([{"currency": "PLN", "shape": "value", "value": "3810.0000"}], False),

    "net_july_negative": ([{"currency": "PLN", "shape": "value", "value": "-150.0000"}], False),

    "all_time_yearly": ([{
        "currency": "PLN", "shape": "timeseries", "points": [
            {"period": "2025", "value": "200.0000"},
            {"period": "2026", "value": "675.0000"},
        ]}], False),

    "multi_currency_breakdown": ([
        {"currency": "EUR", "shape": "breakdown",
         "groups": [{"key": "11", "label": "Lidl", "value": "10.0000"}]},
        {"currency": "PLN", "shape": "breakdown",
         "groups": [{"key": "11", "label": "Lidl", "value": "200.0000"}]},
    ], False),

    "many_children_breakdown": ([{
        "currency": "PLN", "shape": "breakdown",
        "groups": [{"key": str(400 + n), "label": f"Many {n:02d}", "value": f"{n}.0000"}
                   for n in range(30, 5, -1)]
                  + [{"key": "__other__", "label": "Other", "value": "15.0000"}],
    }], True),

    "empty_with_currency_filter": ([{
        "currency": "EUR", "shape": "timeseries", "points": [
            {"period": "2026-08", "value": ZERO},
            {"period": "2026-09", "value": ZERO},
        ]}], False),
}


@pytest.mark.parametrize("name", sorted(EXPECTED))
def test_golden_envelope(name, conn, today):
    results, truncated = EXPECTED[name]
    envelope = execute(conn, 1, load(name), today=today, merchant_enabled=False)
    assert envelope["results"] == results
    assert envelope["meta"] == {"truncatedGroups": truncated}


def test_the_canonical_plan_echoes_itself_verbatim(conn, today):
    """The full envelope for the acceptance case, plan echo included."""
    envelope = execute(conn, 1, load("groceries_split_monthly"), today=today,
                       merchant_enabled=False)
    assert envelope["plan"] == {
        "version": 1, "metric": "spend",
        "filters": {"categoryId": 10, "includeDescendants": True, "currency": "PLN"},
        "groupBy": "category", "interval": "month",
        "range": {"type": "lastMonths", "n": 12},
    }
    assert envelope["results"] == EXPECTED["groceries_split_monthly"][0]
    assert envelope["meta"] == {"truncatedGroups": False}


def test_a_stale_category_is_a_plan_problem(conn, today):
    with pytest.raises(PlanProblems) as caught:
        execute(conn, 1, load("stale_category"), today=today, merchant_enabled=False)
    assert caught.value.problems == [
        "filters.categoryId: 999 does not exist in this profile"]


def test_no_rows_and_no_currency_filter_returns_no_results(conn, today):
    plan = {"version": 1, "metric": "income",
            "filters": {"categoryId": 20, "includeDescendants": True},
            "groupBy": None, "interval": None, "range": {"type": "all"}}
    envelope = execute(conn, 1, plan, today=today, merchant_enabled=False)
    assert envelope["results"] == []

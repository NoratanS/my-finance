"""Envelope shaping: the four shapes, zero-filled buckets, and the limits."""

import pytest

from analytics.executor import PlanProblems, execute


def run(conn, raw, today, profile_id=1):
    return execute(conn, profile_id, raw, today=today, merchant_enabled=False)


def test_value_shape(conn, today):
    envelope = run(conn, {"version": 1, "metric": "net", "filters": {"currency": "PLN"},
                          "range": {"type": "lastMonths", "n": 1}}, today)
    assert envelope["results"] == [
        {"currency": "PLN", "shape": "value", "value": "3810.0000"}]
    assert envelope["meta"] == {"truncatedGroups": False}


def test_timeseries_zero_fills_every_bucket_in_the_range(conn, today):
    envelope = run(conn, {"version": 1, "metric": "spend",
                          "filters": {"categoryId": 10, "currency": "PLN"},
                          "interval": "month",
                          "range": {"type": "lastMonths", "n": 12}}, today)
    assert envelope["results"] == [{
        "currency": "PLN", "shape": "timeseries", "points": [
            {"period": "2025-10", "value": "70.0000"},
            {"period": "2025-11", "value": "0.0000"},
            {"period": "2025-12", "value": "130.0000"},
            {"period": "2026-01", "value": "0.0000"},
            {"period": "2026-02", "value": "0.0000"},
            {"period": "2026-03", "value": "0.0000"},
            {"period": "2026-04", "value": "0.0000"},
            {"period": "2026-05", "value": "0.0000"},
            {"period": "2026-06", "value": "0.0000"},
            {"period": "2026-07", "value": "150.0000"},
            {"period": "2026-08", "value": "200.0000"},
            {"period": "2026-09", "value": "325.0000"},
        ]}]


def test_breakdown_is_sorted_by_absolute_value(conn, today):
    envelope = run(conn, {"version": 1, "metric": "spend", "filters": {"currency": "PLN"},
                          "groupBy": "category",
                          "range": {"type": "lastMonths", "n": 1}}, today)
    assert envelope["results"] == [{
        "currency": "PLN", "shape": "breakdown", "groups": [
            {"key": "40", "label": "Many", "value": "465.0000"},
            {"key": "20", "label": "Transport", "value": "400.0000"},
            {"key": "10", "label": "Groceries", "value": "325.0000"},
        ]}]


def test_timeseries_split_zero_fills_per_series(conn, today):
    envelope = run(conn, {"version": 1, "metric": "spend", "filters": {"currency": "PLN"},
                          "groupBy": "category", "interval": "month",
                          "range": {"type": "lastMonths", "n": 2}}, today)
    assert envelope["results"] == [{
        "currency": "PLN", "shape": "timeseriesSplit", "series": [
            {"key": "10", "label": "Groceries", "points": [
                {"period": "2026-08", "value": "200.0000"},
                {"period": "2026-09", "value": "325.0000"}]},
            {"key": "40", "label": "Many", "points": [
                {"period": "2026-08", "value": "0.0000"},
                {"period": "2026-09", "value": "465.0000"}]},
            {"key": "20", "label": "Transport", "points": [
                {"period": "2026-08", "value": "0.0000"},
                {"period": "2026-09", "value": "400.0000"}]},
        ]}]


def test_one_result_per_currency_sorted_by_code(conn, today):
    envelope = run(conn, {"version": 1, "metric": "spend", "filters": {"categoryId": 10},
                          "range": {"type": "absolute", "from": "2026-08-01",
                                    "to": "2026-08-31"}}, today)
    assert [r["currency"] for r in envelope["results"]] == ["EUR", "PLN"]
    assert [r["value"] for r in envelope["results"]] == ["10.0000", "200.0000"]


def test_range_all_spans_only_the_buckets_that_hold_rows(conn, today):
    envelope = run(conn, {"version": 1, "metric": "spend",
                          "filters": {"categoryId": 10, "currency": "PLN"},
                          "interval": "year", "range": {"type": "all"}}, today)
    assert envelope["results"] == [{
        "currency": "PLN", "shape": "timeseries", "points": [
            {"period": "2025", "value": "200.0000"},
            {"period": "2026", "value": "675.0000"},
        ]}]


def test_empty_data_is_a_result_not_an_error(conn, today):
    envelope = run(conn, {"version": 1, "metric": "income", "filters": {"categoryId": 20},
                          "range": {"type": "all"}}, today)
    assert envelope == {"plan": {"version": 1, "metric": "income",
                                 "filters": {"categoryId": 20, "includeDescendants": True},
                                 "groupBy": None, "interval": None, "range": {"type": "all"}},
                        "results": [], "meta": {"truncatedGroups": False}}


def test_the_envelope_echoes_the_normalized_plan(conn, today):
    envelope = run(conn, {"version": 1, "metric": "spend", "filters": {"categoryId": 10},
                          "interval": "month", "range": {"type": "lastMonths", "n": 2}}, today)
    assert envelope["plan"] == {
        "version": 1, "metric": "spend",
        "filters": {"categoryId": 10, "includeDescendants": True},
        "groupBy": None, "interval": "month", "range": {"type": "lastMonths", "n": 2}}


def test_an_invalid_plan_raises_the_problem_list(conn, today):
    with pytest.raises(PlanProblems) as caught:
        run(conn, {"version": 1, "metric": "spend", "filters": {"categoryId": 999},
                   "range": {"type": "all"}}, today)
    assert caught.value.problems == [
        "filters.categoryId: 999 does not exist in this profile"]


def test_a_range_that_would_draw_too_many_buckets_is_a_plan_problem(conn, today):
    with pytest.raises(PlanProblems) as caught:
        run(conn, {"version": 1, "metric": "spend", "interval": "day",
                   "range": {"type": "absolute", "from": "1990-01-01",
                             "to": "2026-01-01"}}, today)
    assert caught.value.problems == [
        "range: 13150 day buckets exceeds the limit of 1000; "
        "widen the interval or shorten the range"]


# --- Bounded output: top-25-groups-plus-Other (docs/INSIGHTS.md "Bounded output") -------------
#
# seed.sql's 30 children of category 40 ("Many 01".."Many 30", one 1..30 PLN txn each on the
# same day) exist for exactly this: a categorical axis with more than 25 groups. The brief's
# Step 3 reference executor did not implement the cap; the fixture comment ("the group-cap
# fixture") and the task's own "Bounded output" requirements (top 25 by absolute value, one
# "Other" row keyed "__other__", meta.truncatedGroups) make it in-scope regardless.

def test_breakdown_truncates_at_25_groups_with_an_other_aggregate(conn, today):
    envelope = run(conn, {"version": 1, "metric": "spend",
                          "filters": {"categoryId": 40, "currency": "PLN"},
                          "groupBy": "category",
                          "range": {"type": "lastMonths", "n": 1}}, today)
    expected_groups = [
        {"key": str(400 + g), "label": f"Many {g:02d}", "value": f"{g}.0000"}
        for g in range(30, 5, -1)
    ]
    expected_groups.append({"key": "__other__", "label": "Other", "value": "15.0000"})

    assert envelope["results"] == [
        {"currency": "PLN", "shape": "breakdown", "groups": expected_groups}]
    assert envelope["meta"] == {"truncatedGroups": True}


def test_timeseries_split_truncates_with_a_zero_filled_other_series(conn, today):
    envelope = run(conn, {"version": 1, "metric": "spend",
                          "filters": {"categoryId": 40, "currency": "PLN"},
                          "groupBy": "category", "interval": "month",
                          "range": {"type": "lastMonths", "n": 2}}, today)
    [result] = envelope["results"]
    assert result["currency"] == "PLN"
    assert result["shape"] == "timeseriesSplit"
    series = result["series"]

    # 25 real groups + one Other series, every one carrying a point for both buckets in range —
    # truncation must not leave the Other series (or any kept one) ragged.
    assert len(series) == 26
    assert all(len(s["points"]) == 2 for s in series)

    assert series[-1] == {"key": "__other__", "label": "Other", "points": [
        {"period": "2026-08", "value": "0.0000"},
        {"period": "2026-09", "value": "15.0000"}]}
    assert series[0] == {"key": "430", "label": "Many 30", "points": [
        {"period": "2026-08", "value": "0.0000"},
        {"period": "2026-09", "value": "30.0000"}]}
    assert envelope["meta"] == {"truncatedGroups": True}

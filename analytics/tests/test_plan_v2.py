"""Plan DSL v2 — the optional `forecast` field (docs/INSIGHTS.md -> Forecast).

Pure: no database, no container. `forecast_problems` is a total function of the
raw plan, so the whole rule set is table-driven.
"""

import pytest

from analytics.plan import MAX_FORECAST_MONTHS, SUPPORTED_VERSIONS
from analytics.validation import forecast_problems


def test_the_executor_accepts_both_plan_versions():
    """A1: a v2 plan is a v1 plan plus `forecast`, so v1 is never dropped."""
    assert SUPPORTED_VERSIONS == frozenset({1, 2})


def test_the_horizon_is_capped_at_the_seasonal_period():
    """months <= 12 keeps the seasonal-naive lookback inside the observed series."""
    assert MAX_FORECAST_MONTHS == 12


def test_no_forecast_is_never_a_problem():
    assert forecast_problems(None, version=1, interval="month") == []
    assert forecast_problems(None, version=2, interval="week") == []
    assert forecast_problems(None, version=1, interval=None) == []


def test_a_valid_forecast_on_a_v2_monthly_plan_has_no_problems():
    assert forecast_problems({"months": 3}, version=2, interval="month") == []
    assert forecast_problems({"months": 1}, version=2, interval="month") == []
    assert forecast_problems({"months": 12}, version=2, interval="month") == []


@pytest.mark.parametrize(
    ("raw", "version", "interval", "expected"),
    [
        ({"months": 3}, 1, "month", ["forecast: requires plan version 2"]),
        ({"months": 3}, 2, "week", ['forecast: requires interval "month"']),
        ({"months": 3}, 2, None, ['forecast: requires interval "month"']),
        ({"months": 0}, 2, "month", ["forecast.months: must be an integer between 1 and 12"]),
        ({"months": 13}, 2, "month", ["forecast.months: must be an integer between 1 and 12"]),
        ({"months": "3"}, 2, "month", ["forecast.months: must be an integer between 1 and 12"]),
        # True is an int in Python; a boolean horizon is still a rejection.
        ({"months": True}, 2, "month", ["forecast.months: must be an integer between 1 and 12"]),
        ({"months": 3, "confidence": 0.9}, 2, "month", ["forecast: unknown field(s) confidence"]),
        ({}, 2, "month", ["forecast.months: must be an integer between 1 and 12"]),
        (3, 2, "month", ['forecast: must be an object with a "months" field']),
    ],
)
def test_forecast_problems(raw, version, interval, expected):
    assert forecast_problems(raw, version=version, interval=interval) == expected

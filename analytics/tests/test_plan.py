"""The DSL object model: parsing an already-validated body, and the normalized echo."""

from datetime import date

from analytics.plan import Filters, Plan, Range, parse_plan


def test_parses_a_full_plan():
    plan = parse_plan(
        {
            "version": 1,
            "metric": "spend",
            "filters": {"categoryId": 10, "includeDescendants": False, "currency": "PLN"},
            "groupBy": "category",
            "interval": "month",
            "range": {"type": "absolute", "from": "2026-01-01", "to": "2026-06-30"},
        }
    )
    assert plan == Plan(
        version=1,
        metric="spend",
        filters=Filters(category_id=10, include_descendants=False, merchants=None, currency="PLN"),
        group_by="category",
        interval="month",
        range=Range(type="absolute", n=None, start=date(2026, 1, 1), end=date(2026, 6, 30)),
    )


def test_defaults_a_minimal_plan():
    plan = parse_plan({"version": 1, "metric": "net", "range": {"type": "all"}})
    assert plan.filters == Filters(
        category_id=None, include_descendants=True, merchants=None, currency=None
    )
    assert plan.group_by is None
    assert plan.interval is None
    assert plan.range == Range(type="all", n=None, start=None, end=None)


def test_include_descendants_defaults_to_true_when_a_category_is_filtered():
    plan = parse_plan(
        {
            "version": 1,
            "metric": "spend",
            "filters": {"categoryId": 10},
            "range": {"type": "lastMonths", "n": 12},
        }
    )
    assert plan.filters.include_descendants is True


def test_normalized_echo_fills_in_the_defaults_that_were_applied():
    raw = {
        "version": 1,
        "metric": "spend",
        "filters": {"categoryId": 10},
        "interval": "month",
        "range": {"type": "lastMonths", "n": 12},
    }
    assert parse_plan(raw).to_json() == {
        "version": 1,
        "metric": "spend",
        "filters": {"categoryId": 10, "includeDescendants": True},
        "groupBy": None,
        "interval": "month",
        "range": {"type": "lastMonths", "n": 12},
    }


def test_normalized_echo_renders_absolute_dates_back_as_iso_strings():
    raw = {
        "version": 1,
        "metric": "net",
        "filters": {"currency": "EUR"},
        "range": {"type": "absolute", "from": "2026-01-01", "to": "2026-06-30"},
    }
    assert parse_plan(raw).to_json()["range"] == {
        "type": "absolute",
        "from": "2026-01-01",
        "to": "2026-06-30",
    }
    assert parse_plan(raw).to_json()["filters"] == {"currency": "EUR"}

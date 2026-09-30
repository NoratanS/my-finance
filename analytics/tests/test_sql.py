"""The SQL layer, executed against the seeded container: assertions are on raw rows, so a
failure here points at the SQL rather than at the envelope shaping built on top of it."""

from datetime import date
from decimal import Decimal

import pytest
from psycopg.rows import class_row

from analytics import sql
from analytics.plan import parse_plan

JULY = (date(2026, 7, 1), date(2026, 7, 31))
SEPTEMBER = (date(2026, 9, 1), date(2026, 9, 30))
EVERYTHING = (date(2025, 1, 1), date(2026, 12, 31))


def run(conn, raw, profile_id, window):
    query, params = sql.build_query(parse_plan(raw), profile_id, *window)
    # The executor's row factory, so these tests also prove the aliases match sql.TotalRow.
    with conn.cursor(row_factory=class_row(sql.TotalRow)) as cur:
        cur.execute(query, params)
        return cur.fetchall()


def test_value_shape_returns_one_row_per_currency(conn):
    rows = run(
        conn,
        {"version": 1, "metric": "spend", "filters": {"categoryId": 10}, "range": {"type": "all"}},
        1,
        (date(2026, 8, 1), date(2026, 8, 31)),
    )
    assert sorted(rows) == [
        ("EUR", None, None, None, Decimal("10.0000")),
        ("PLN", None, None, None, Decimal("200.0000")),
    ]


def test_totals_keep_scale_four(conn):
    rows = run(
        conn,
        {"version": 1, "metric": "spend", "filters": {"currency": "PLN"}, "range": {"type": "all"}},
        1,
        JULY,
    )
    assert str(rows[0][4]) == "150.0000"


def test_the_subtree_filter_rolls_up_descendants(conn):
    rows = run(
        conn,
        {
            "version": 1,
            "metric": "spend",
            "filters": {"categoryId": 10, "includeDescendants": True, "currency": "PLN"},
            "range": {"type": "all"},
        },
        1,
        SEPTEMBER,
    )
    assert rows == [("PLN", None, None, None, Decimal("325.0000"))]


def test_include_descendants_false_takes_only_direct_transactions(conn):
    rows = run(
        conn,
        {
            "version": 1,
            "metric": "spend",
            "filters": {"categoryId": 10, "includeDescendants": False, "currency": "PLN"},
            "range": {"type": "all"},
        },
        1,
        SEPTEMBER,
    )
    assert rows == [("PLN", None, None, None, Decimal("25.0000"))]


def test_nothing_from_another_profile_leaks_in(conn):
    """Profile 2 holds a 9999.00 PLN September expense; profile 1's total must not see it."""
    plan = {
        "version": 1,
        "metric": "spend",
        "filters": {"currency": "PLN"},
        "range": {"type": "all"},
    }
    assert run(conn, plan, 1, SEPTEMBER)[0][4] == Decimal("1190.0000")
    assert run(conn, plan, 2, SEPTEMBER)[0][4] == Decimal("9999.0000")


def test_group_by_category_under_a_filter_keeps_the_parent_s_own_transactions(conn):
    """Children each carry their own subtree; the filtered category itself is one more group,
    so the groups partition the filtered set instead of quietly dropping row 107."""
    rows = run(
        conn,
        {
            "version": 1,
            "metric": "spend",
            "filters": {"categoryId": 10, "currency": "PLN"},
            "groupBy": "category",
            "range": {"type": "all"},
        },
        1,
        EVERYTHING,
    )
    assert sorted(rows, key=lambda r: r[2]) == [
        ("PLN", None, "10", "Groceries", Decimal("25.0000")),
        ("PLN", None, "11", "Lidl", Decimal("370.0000")),
        ("PLN", None, "12", "Biedronka", Decimal("480.0000")),
    ]


def test_group_by_category_without_a_filter_groups_by_roots(conn):
    rows = run(
        conn,
        {
            "version": 1,
            "metric": "spend",
            "filters": {"currency": "PLN"},
            "groupBy": "category",
            "range": {"type": "all"},
        },
        1,
        SEPTEMBER,
    )
    assert sorted(rows, key=lambda r: r[2]) == [
        ("PLN", None, "10", "Groceries", Decimal("325.0000")),
        ("PLN", None, "20", "Transport", Decimal("400.0000")),
        ("PLN", None, "40", "Many", Decimal("465.0000")),
    ]


def test_month_buckets_come_back_as_truncated_dates(conn):
    rows = run(
        conn,
        {
            "version": 1,
            "metric": "spend",
            "filters": {"categoryId": 10, "currency": "PLN"},
            "interval": "month",
            "range": {"type": "all"},
        },
        1,
        EVERYTHING,
    )
    assert sorted(rows, key=lambda r: r[1]) == [
        ("PLN", date(2025, 10, 1), None, None, Decimal("70.0000")),
        ("PLN", date(2025, 12, 1), None, None, Decimal("130.0000")),
        ("PLN", date(2026, 7, 1), None, None, Decimal("150.0000")),
        ("PLN", date(2026, 8, 1), None, None, Decimal("200.0000")),
        ("PLN", date(2026, 9, 1), None, None, Decimal("325.0000")),
    ]


def test_week_buckets_start_on_monday(conn):
    rows = run(
        conn,
        {
            "version": 1,
            "metric": "spend",
            "filters": {"categoryId": 12, "currency": "PLN"},
            "interval": "week",
            "range": {"type": "all"},
        },
        1,
        SEPTEMBER,
    )
    assert rows == [("PLN", date(2026, 8, 31), None, None, Decimal("300.0000"))]


def test_income_metric_selects_the_other_direction(conn):
    rows = run(
        conn,
        {
            "version": 1,
            "metric": "income",
            "filters": {"currency": "PLN"},
            "range": {"type": "all"},
        },
        1,
        SEPTEMBER,
    )
    assert rows == [("PLN", None, None, None, Decimal("5000.0000"))]


def test_net_is_income_minus_spend_and_may_be_negative(conn):
    rows = run(
        conn,
        {"version": 1, "metric": "net", "filters": {"currency": "PLN"}, "range": {"type": "all"}},
        1,
        JULY,
    )
    assert rows == [("PLN", None, None, None, Decimal("-150.0000"))]
    # Decimal equality ignores scale (Decimal("-150") == Decimal("-150.0000")), so the row
    # comparison above alone would not pin the serialized scale. This assertion checks the wire
    # form directly. It does NOT, however, discriminate net's own ::numeric(19,4) cast: Postgres
    # numeric subtraction returns dscale = max(operand dscales), and here the EXPENSE side is a
    # real sum over NUMERIC(19,4) (dscale 4) while the empty INCOME side is COALESCE's dscale-0
    # zero, so the subtraction already comes out at scale 4 with or without the outer cast — see
    # task-23-report.md "Fix round 1" for the probe that confirmed this.
    assert str(rows[0][4]) == "-150.0000"


def test_an_unknown_group_by_raises_instead_of_dropping_the_grouping():
    """Fail closed, like the interval lookup. `currency` was dropped from the v1 enum (spec D1)
    but parse_plan does not itself validate groupBy — that is validate_plan's job — so a
    fall-through here would build a query returning one group whose key and label are JSON null,
    violating the wire contract instead of erroring."""
    plan = parse_plan(
        {
            "version": 1,
            "metric": "spend",
            "filters": {},
            "groupBy": "currency",
            "range": {"type": "all"},
        }
    )
    with pytest.raises(KeyError):
        sql.build_query(plan, 1, *EVERYTHING)

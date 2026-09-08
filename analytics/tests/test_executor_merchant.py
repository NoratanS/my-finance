"""Merchant-dimension goldens (docs/INSIGHTS.md "Plan DSL v1"): the canonical Lidl vs Biedronka
plan, the 25-group cap, and merchant filtering. Data comes from tests/fixtures/seed_merchants.sql
under profile 9000; the clock is passed in, not frozen globally (spec D6)."""

import json
from datetime import date
from pathlib import Path
from uuid import uuid4

from analytics.executor import execute
from analytics.validation import validate_plan

FIXTURES = Path(__file__).parent / "fixtures"
PROFILE_ID = 9000
TODAY = date(2026, 9, 4)
# lastMonths: 12 is 12 buckets ending with the current partial month (spec D5).
PERIODS = [
    "2025-10",
    "2025-11",
    "2025-12",
    "2026-01",
    "2026-02",
    "2026-03",
    "2026-04",
    "2026-05",
    "2026-06",
    "2026-07",
    "2026-08",
    "2026-09",
]


def _plan(name: str) -> dict:
    return json.loads((FIXTURES / "plans" / name).read_text())


def test_canonical_merchant_split_is_gap_free_per_series(conn, merchant_seed):
    envelope = execute(
        conn, PROFILE_ID, _plan("merchant_split.json"), today=TODAY, merchant_enabled=True
    )

    assert envelope["meta"]["truncatedGroups"] is False
    (result,) = envelope["results"]
    assert result["currency"] == "PLN"
    assert result["shape"] == "timeseriesSplit"
    # Series are ordered by absolute total: Lidl 673.50, Biedronka 487.00.
    assert [series["label"] for series in result["series"]] == ["Lidl", "Biedronka"]

    by_label = {}
    for series in result["series"]:
        # zero-filled per series (D4)
        assert [point["period"] for point in series["points"]] == PERIODS
        by_label[series["label"]] = {point["period"]: point["value"] for point in series["points"]}

    assert by_label["Lidl"]["2026-07"] == "243.5000"
    assert by_label["Lidl"]["2026-08"] == "310.0000"
    assert by_label["Lidl"]["2026-09"] == "120.0000"
    assert by_label["Biedronka"]["2026-07"] == "180.0000"
    assert by_label["Biedronka"]["2026-08"] == "212.0000"
    assert by_label["Biedronka"]["2026-09"] == "95.0000"
    assert by_label["Lidl"]["2026-01"] == "0.0000"
    assert by_label["Biedronka"]["2025-10"] == "0.0000"


def test_null_merchant_is_grouped_as_unspecified_and_the_tail_is_capped(conn, merchant_seed):
    envelope = execute(
        conn, PROFILE_ID, _plan("merchant_breakdown.json"), today=TODAY, merchant_enabled=True
    )

    assert envelope["meta"]["truncatedGroups"] is True
    (result,) = envelope["results"]
    assert result["shape"] == "breakdown"
    # 29 merchants (Lidl, Biedronka, Unspecified, M01..M26) -> 25 kept + one "Other".
    assert len(result["groups"]) == 26
    labels = [group["label"] for group in result["groups"][:3]]
    assert labels == ["Lidl", "Biedronka", "Unspecified"]
    # The four smallest (M04 4.00 + M03 3.00 + M02 2.00 + M01 1.00) survive as one row.
    assert result["groups"][-1] == {"key": "__other__", "label": "Other", "value": "10.0000"}


def test_merchant_filter_is_literal_equality(conn, merchant_seed):
    envelope = execute(
        conn, PROFILE_ID, _plan("merchant_filter.json"), today=TODAY, merchant_enabled=True
    )

    (result,) = envelope["results"]
    assert result == {"currency": "PLN", "shape": "value", "value": "673.5000"}


def test_unspecified_is_a_label_not_a_filter_value(conn, merchant_seed):
    plan = _plan("merchant_breakdown.json")
    plan["filters"]["merchants"] = ["Lidl", "Unspecified"]

    envelope = execute(conn, PROFILE_ID, plan, today=TODAY, merchant_enabled=True)

    (result,) = envelope["results"]
    # A NULL merchant never satisfies an equality filter, so asking for
    # "Unspecified" asks for nothing.
    assert [group["label"] for group in result["groups"]] == ["Lidl"]
    assert envelope["meta"]["truncatedGroups"] is False


def test_merchant_plan_is_accepted_when_the_column_is_enabled(conn, merchant_seed):
    assert (
        validate_plan(
            _plan("merchant_split.json"), profile_id=PROFILE_ID, conn=conn, merchant_enabled=True
        )
        == []
    )


def test_merchant_plan_is_still_rejected_when_it_is_not(conn, merchant_seed):
    problems = validate_plan(
        _plan("merchant_split.json"), profile_id=PROFILE_ID, conn=conn, merchant_enabled=False
    )

    assert any("not available yet" in problem for problem in problems)


def _seed_merchant_collision_profile(conn) -> int:
    """A dedicated profile, not 9000: adding this row to seed_merchants.sql would perturb the
    25-group-cap arithmetic pinned by
    test_null_merchant_is_grouped_as_unspecified_and_the_tail_is_capped."""
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO app_user (email, password_hash, display_name)"
            " VALUES (%s, 'x', 'Collision') RETURNING id",
            (f"merchant-collision-{uuid4()}@example.test",),
        )
        user_id = cur.fetchone()[0]
        cur.execute(
            "INSERT INTO profile (user_id, name, default_currency)"
            " VALUES (%s, 'Collision', 'PLN') RETURNING id",
            (user_id,),
        )
        profile_id = cur.fetchone()[0]
        cur.execute(
            "INSERT INTO category (profile_id, parent_id, name)"
            " VALUES (%s, NULL, 'Groceries') RETURNING id",
            (profile_id,),
        )
        category_id = cur.fetchone()[0]
        cur.execute(
            "INSERT INTO txn"
            " (profile_id, category_id, amount, currency, txn_type, occurred_on, merchant)"
            " VALUES (%s, %s, 30.0000, 'PLN', 'EXPENSE', DATE '2026-08-01', NULL),"
            "        (%s, %s, 50.0000, 'PLN', 'EXPENSE', DATE '2026-08-02', 'Unspecified')",
            (profile_id, category_id, profile_id, category_id),
        )
    conn.commit()
    return profile_id


def test_null_merchant_does_not_collide_with_a_merchant_literally_named_unspecified(conn):
    """D6: a real merchant named "Unspecified" must not be grouped with merchant-less
    transactions just because they share a display label."""
    profile_id = _seed_merchant_collision_profile(conn)

    envelope = execute(
        conn, profile_id, _plan("merchant_breakdown.json"), today=TODAY, merchant_enabled=True
    )

    (result,) = envelope["results"]
    assert len(result["groups"]) == 2
    labels = [group["label"] for group in result["groups"]]
    assert labels == ["Unspecified", "Unspecified"]
    keys = {group["key"] for group in result["groups"]}
    # The null-merchant group and the literal 'Unspecified' merchant must not share a key.
    assert len(keys) == 2
    values = {group["value"] for group in result["groups"]}
    assert values == {"30.0000", "50.0000"}

"""Golden envelopes: every gallery template that v1 can express, plus the edge cases
(empty data with and without a currency filter, multi-currency, truncation, a stale categoryId,
a negative net, all four shapes, every range type, week and quarter buckets). Fixture plans are
files so the same JSON can be pasted into the explorer; the expected envelopes live here so the
arithmetic sits next to the assertion.
"""

import json
from datetime import date
from pathlib import Path
from uuid import uuid4

import pytest

from analytics.executor import PlanProblems, execute

PLANS = Path(__file__).parent / "fixtures" / "plans"

ZERO = "0.0000"


def load(name):
    return json.loads((PLANS / f"{name}.json").read_text(encoding="utf-8"))


def months(*pairs):
    """Twelve monthly buckets, 2025-10 … 2026-09, zero unless named."""
    values = dict(pairs)
    keys = [
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
    return [{"period": key, "value": values.get(key, ZERO)} for key in keys]


EXPECTED = {
    "monthly_spend_in_category": (
        [
            {
                "currency": "PLN",
                "shape": "timeseries",
                "points": months(
                    ("2025-10", "70.0000"),
                    ("2025-12", "130.0000"),
                    ("2026-07", "150.0000"),
                    ("2026-08", "200.0000"),
                    ("2026-09", "325.0000"),
                ),
            }
        ],
        False,
    ),
    "top_categories_this_month": (
        [
            {
                "currency": "PLN",
                "shape": "breakdown",
                "groups": [
                    {"key": "40", "label": "Many", "value": "465.0000"},
                    {"key": "20", "label": "Transport", "value": "400.0000"},
                    {"key": "10", "label": "Groceries", "value": "325.0000"},
                ],
            }
        ],
        False,
    ),
    "groceries_split_monthly": (
        [
            {
                "currency": "PLN",
                "shape": "timeseriesSplit",
                "series": [
                    {
                        "key": "12",
                        "label": "Biedronka",
                        "points": months(
                            ("2025-12", "130.0000"), ("2026-07", "50.0000"), ("2026-09", "300.0000")
                        ),
                    },
                    {
                        "key": "11",
                        "label": "Lidl",
                        "points": months(
                            ("2025-10", "70.0000"), ("2026-07", "100.0000"), ("2026-08", "200.0000")
                        ),
                    },
                    {"key": "10", "label": "Groceries", "points": months(("2026-09", "25.0000"))},
                ],
            }
        ],
        False,
    ),
    "this_vs_last_month_by_category": (
        [
            {
                "currency": "PLN",
                "shape": "timeseriesSplit",
                "series": [
                    {
                        "key": "10",
                        "label": "Groceries",
                        "points": [
                            {"period": "2026-08", "value": "200.0000"},
                            {"period": "2026-09", "value": "325.0000"},
                        ],
                    },
                    {
                        "key": "40",
                        "label": "Many",
                        "points": [
                            {"period": "2026-08", "value": ZERO},
                            {"period": "2026-09", "value": "465.0000"},
                        ],
                    },
                    {
                        "key": "20",
                        "label": "Transport",
                        "points": [
                            {"period": "2026-08", "value": ZERO},
                            {"period": "2026-09", "value": "400.0000"},
                        ],
                    },
                ],
            }
        ],
        False,
    ),
    "income_monthly": (
        [
            {
                "currency": "PLN",
                "shape": "timeseries",
                "points": [
                    {"period": "2026-07", "value": ZERO},
                    {"period": "2026-08", "value": "4000.0000"},
                    {"period": "2026-09", "value": "5000.0000"},
                ],
            }
        ],
        False,
    ),
    "net_this_month": ([{"currency": "PLN", "shape": "value", "value": "3810.0000"}], False),
    "net_july_negative": ([{"currency": "PLN", "shape": "value", "value": "-150.0000"}], False),
    "net_no_rows_currency": ([{"currency": "EUR", "shape": "value", "value": ZERO}], False),
    "all_time_yearly": (
        [
            {
                "currency": "PLN",
                "shape": "timeseries",
                "points": [
                    {"period": "2025", "value": "200.0000"},
                    {"period": "2026", "value": "675.0000"},
                ],
            }
        ],
        False,
    ),
    "multi_currency_breakdown": (
        [
            {
                "currency": "EUR",
                "shape": "breakdown",
                "groups": [{"key": "11", "label": "Lidl", "value": "10.0000"}],
            },
            {
                "currency": "PLN",
                "shape": "breakdown",
                "groups": [{"key": "11", "label": "Lidl", "value": "200.0000"}],
            },
        ],
        False,
    ),
    "many_children_breakdown": (
        [
            {
                "currency": "PLN",
                "shape": "breakdown",
                "groups": [
                    {"key": str(400 + n), "label": f"Many {n:02d}", "value": f"{n}.0000"}
                    for n in range(30, 5, -1)
                ]
                + [{"key": "__other__", "label": "Other", "value": "15.0000"}],
            }
        ],
        True,
    ),
    "empty_with_currency_filter": (
        [
            {
                "currency": "EUR",
                "shape": "timeseries",
                "points": [
                    {"period": "2026-08", "value": ZERO},
                    {"period": "2026-09", "value": ZERO},
                ],
            }
        ],
        False,
    ),
    # lastMonths 1 is 2026-09-01 … 09-15. The first week is the one *containing* 1 September,
    # so the axis starts on Monday 2026-08-31, where Postgres's date_trunc puts row 106 (300.00);
    # row 107 (25.00, 09-10) is in the week of 09-07. A Sunday-start calendar would miss both.
    "weekly_spend_in_category": (
        [
            {
                "currency": "PLN",
                "shape": "timeseries",
                "points": [
                    {"period": "2026-08-31", "value": "300.0000"},
                    {"period": "2026-09-07", "value": "25.0000"},
                    {"period": "2026-09-14", "value": ZERO},
                ],
            }
        ],
        False,
    ),
    # The monthly golden's twelve buckets summed by quarter; the yearly golden's 2025 (200) and
    # 2026 (675) split the same way.
    "quarterly_spend_in_category": (
        [
            {
                "currency": "PLN",
                "shape": "timeseries",
                "points": [
                    {"period": "2025-Q4", "value": "200.0000"},
                    {"period": "2026-Q1", "value": ZERO},
                    {"period": "2026-Q2", "value": ZERO},
                    {"period": "2026-Q3", "value": "675.0000"},
                ],
            }
        ],
        False,
    ),
    # 2026-01-01 … 09-15: the monthly golden's 2026 buckets and none of 2025's. Nine points run
    # the anomaly pass, but six zeros make the median and MAD 0, so nothing is flagged.
    "year_to_date_monthly": (
        [
            {
                "currency": "PLN",
                "shape": "timeseries",
                "points": [
                    {"period": "2026-01", "value": ZERO},
                    {"period": "2026-02", "value": ZERO},
                    {"period": "2026-03", "value": ZERO},
                    {"period": "2026-04", "value": ZERO},
                    {"period": "2026-05", "value": ZERO},
                    {"period": "2026-06", "value": ZERO},
                    {"period": "2026-07", "value": "150.0000"},
                    {"period": "2026-08", "value": "200.0000"},
                    {"period": "2026-09", "value": "325.0000"},
                ],
            }
        ],
        False,
    ),
}


@pytest.mark.parametrize("name", sorted(EXPECTED))
def test_golden_envelope(name, conn, today):
    results, truncated = EXPECTED[name]
    envelope = execute(conn, 1, load(name), today=today, merchant_enabled=False)
    assert envelope["results"] == results
    assert envelope["meta"] == {"truncatedGroups": truncated}


def test_the_canonical_plan_echoes_itself_verbatim(conn, today):
    """The full envelope for the acceptance case, plan echo included."""
    envelope = execute(
        conn, 1, load("groceries_split_monthly"), today=today, merchant_enabled=False
    )
    assert envelope["plan"] == {
        "version": 1,
        "metric": "spend",
        "filters": {"categoryId": 10, "includeDescendants": True, "currency": "PLN"},
        "groupBy": "category",
        "interval": "month",
        "range": {"type": "lastMonths", "n": 12},
    }
    assert envelope["results"] == EXPECTED["groceries_split_monthly"][0]
    assert envelope["meta"] == {"truncatedGroups": False}


def test_a_stale_category_is_a_plan_problem(conn, today):
    with pytest.raises(PlanProblems) as caught:
        execute(conn, 1, load("stale_category"), today=today, merchant_enabled=False)
    assert caught.value.problems == ["filters.categoryId: 999 does not exist in this profile"]


def test_no_rows_and_no_currency_filter_returns_no_results(conn, today):
    plan = {
        "version": 1,
        "metric": "income",
        "filters": {"categoryId": 20, "includeDescendants": True},
        "groupBy": None,
        "interval": None,
        "range": {"type": "all"},
    }
    envelope = execute(conn, 1, plan, today=today, merchant_enabled=False)
    assert envelope["results"] == []


def _seed_forecast_profile(conn) -> int:
    """A user, profile, category and two expenses of this test's own.

    Every executor query is profile-scoped, so a private profile can never
    collide with the shared seed fixture — no cleanup needed either.

    Inserting without explicit ids is safe because Stage 1's conftest advances the
    identity sequences past the fixture range (`_advance_identity_sequences`, set to
    10000) after loading seed.sql, which itself supplies ids with OVERRIDING SYSTEM
    VALUE. Without that, the first RETURNING id here would generate 1 and collide.
    """
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO app_user (email, password_hash, display_name)"
            " VALUES (%s, 'x', 'Forecast') RETURNING id",
            (f"forecast-{uuid4()}@example.test",),
        )
        user_id = cur.fetchone()[0]
        cur.execute(
            "INSERT INTO profile (user_id, name, default_currency)"
            " VALUES (%s, 'Forecast', 'PLN') RETURNING id",
            (user_id,),
        )
        profile_id = cur.fetchone()[0]
        cur.execute(
            "INSERT INTO category (profile_id, parent_id, name)"
            " VALUES (%s, NULL, 'Groceries') RETURNING id",
            (profile_id,),
        )
        category_id = cur.fetchone()[0]
        for occurred_on, amount in (("2025-10-04", "300.0000"), ("2025-11-04", "400.0000")):
            cur.execute(
                "INSERT INTO txn (profile_id, category_id, amount, currency, txn_type, occurred_on)"
                " VALUES (%s, %s, %s, 'PLN', 'EXPENSE', %s)",
                (profile_id, category_id, amount, occurred_on),
            )
    conn.commit()
    return profile_id


_FORECAST_V1_PLAN = {
    "version": 1,
    "metric": "spend",
    "filters": {"currency": "PLN"},
    "groupBy": None,
    "interval": "month",
    "range": {"type": "absolute", "from": "2025-10-01", "to": "2026-09-30"},
}

# Twelve gap-free monthly buckets; only the first two carry rows. The value
# multiset is {300, 400, 0 x 10}, so median = 0 and MAD = 0: the anomaly pass
# flags nothing and the envelope below is exact, not approximately exact.
_FORECAST_OBSERVED = [
    {"period": "2025-10", "value": "300.0000"},
    {"period": "2025-11", "value": "400.0000"},
    *(
        {"period": period, "value": "0.0000"}
        for period in (
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
        )
    ),
]


def test_a_v1_plan_still_executes_after_the_version_bump(conn):
    """A1: bumping SUPPORTED_VERSIONS must change nothing about a saved v1 plan."""
    profile_id = _seed_forecast_profile(conn)

    envelope = execute(
        conn,
        profile_id,
        dict(_FORECAST_V1_PLAN),
        today=date(2026, 9, 4),
        merchant_enabled=True,
    )

    result = envelope["results"][0]
    assert result["shape"] == "timeseries"
    assert result["points"] == _FORECAST_OBSERVED
    assert "forecast" not in envelope["plan"]
    assert "drift" not in result


def test_a_v2_plan_appends_seasonal_naive_projections(conn):
    profile_id = _seed_forecast_profile(conn)
    plan = {**_FORECAST_V1_PLAN, "version": 2, "forecast": {"months": 2}}

    envelope = execute(
        conn,
        profile_id,
        plan,
        today=date(2026, 9, 4),
        merchant_enabled=True,
    )

    assert envelope["plan"]["forecast"] == {"months": 2}
    assert envelope["results"][0]["points"] == [
        *_FORECAST_OBSERVED,
        # Twelve buckets back from 2026-10 is 2025-10 (300); from 2026-11, 2025-11 (400).
        {"period": "2026-10", "value": "300.0000", "projected": True},
        {"period": "2026-11", "value": "400.0000", "projected": True},
    ]


def test_a_v1_plan_carrying_a_forecast_is_rejected(conn):
    profile_id = _seed_forecast_profile(conn)
    plan = {**_FORECAST_V1_PLAN, "forecast": {"months": 2}}

    with pytest.raises(PlanProblems) as caught:
        execute(conn, profile_id, plan, today=date(2026, 9, 4), merchant_enabled=True)

    assert "forecast: requires plan version 2" in caught.value.problems


def _seed_short_forecast_profile(conn) -> int:
    """Three months, short enough to force the fallback branch: two complete (Jan 100,
    Feb 200) and one still-filling (Mar 5, as of `today=2026-03-04`)."""
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO app_user (email, password_hash, display_name)"
            " VALUES (%s, 'x', 'Short Forecast') RETURNING id",
            (f"short-forecast-{uuid4()}@example.test",),
        )
        user_id = cur.fetchone()[0]
        cur.execute(
            "INSERT INTO profile (user_id, name, default_currency)"
            " VALUES (%s, 'Short Forecast', 'PLN') RETURNING id",
            (user_id,),
        )
        profile_id = cur.fetchone()[0]
        cur.execute(
            "INSERT INTO category (profile_id, parent_id, name)"
            " VALUES (%s, NULL, 'Groceries') RETURNING id",
            (profile_id,),
        )
        category_id = cur.fetchone()[0]
        for occurred_on, amount in (
            ("2026-01-05", "100.0000"),
            ("2026-02-05", "200.0000"),
            ("2026-03-04", "5.0000"),
        ):
            cur.execute(
                "INSERT INTO txn (profile_id, category_id, amount, currency, txn_type, occurred_on)"
                " VALUES (%s, %s, %s, 'PLN', 'EXPENSE', %s)",
                (profile_id, category_id, amount, occurred_on),
            )
    conn.commit()
    return profile_id


def test_forecast_fallback_excludes_the_partial_current_month(conn):
    """D7: without the March 4th run's own txn (5.0000, four days into the month) pulling the
    fallback mean down, the projection is the mean of the two *complete* months, Jan (100) and
    Feb (200): (100 + 200) / 2 = 150.0000. Including the partial month would instead average in
    the 5.0000 alongside two full months' totals: (100 + 200 + 5) / 3 = 101.6667 — a forecast
    dragged down by a month that has barely started."""
    profile_id = _seed_short_forecast_profile(conn)
    plan = {
        "version": 2,
        "metric": "spend",
        "filters": {"currency": "PLN"},
        "groupBy": None,
        "interval": "month",
        "range": {"type": "absolute", "from": "2026-01-01", "to": "2026-03-31"},
        "forecast": {"months": 1},
    }

    envelope = execute(conn, profile_id, plan, today=date(2026, 3, 4), merchant_enabled=True)

    assert envelope["results"][0]["points"] == [
        {"period": "2026-01", "value": "100.0000"},
        {"period": "2026-02", "value": "200.0000"},
        {"period": "2026-03", "value": "5.0000"},
        {"period": "2026-04", "value": "150.0000", "projected": True},
    ]


# Same multiset as tests/test_postprocess.py::_SPIKY (median 105, MAD 7.5), laid out over the
# same twelve monthly buckets as _FORECAST_V1_PLAN's range: only the 900 bucket (index 6,
# 2026-04) crosses the |z| > 3.5 cutoff.
_ANOMALY_MONTHLY_VALUES = [
    "100.0000",
    "110.0000",
    "105.0000",
    "95.0000",
    "100.0000",
    "120.0000",
    "900.0000",
    "115.0000",
    "90.0000",
    "105.0000",
    "110.0000",
    "95.0000",
]


def _seed_anomaly_profile(conn) -> int:
    """One category, one expense per month over 2025-10..2026-09, amounts matching
    _ANOMALY_MONTHLY_VALUES so the executor's own median/MAD pass has something to flag."""
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO app_user (email, password_hash, display_name)"
            " VALUES (%s, 'x', 'Anomaly') RETURNING id",
            (f"anomaly-{uuid4()}@example.test",),
        )
        user_id = cur.fetchone()[0]
        cur.execute(
            "INSERT INTO profile (user_id, name, default_currency)"
            " VALUES (%s, 'Anomaly', 'PLN') RETURNING id",
            (user_id,),
        )
        profile_id = cur.fetchone()[0]
        cur.execute(
            "INSERT INTO category (profile_id, parent_id, name)"
            " VALUES (%s, NULL, 'Groceries') RETURNING id",
            (profile_id,),
        )
        category_id = cur.fetchone()[0]
        for period, amount in zip(_FORECAST_OBSERVED, _ANOMALY_MONTHLY_VALUES, strict=True):
            year, month = (int(part) for part in period["period"].split("-"))
            cur.execute(
                "INSERT INTO txn (profile_id, category_id, amount, currency, txn_type,"
                " occurred_on) VALUES (%s, %s, %s, 'PLN', 'EXPENSE', %s)",
                (profile_id, category_id, amount, date(year, month, 4)),
            )
    conn.commit()
    return profile_id


def test_a_real_outlier_bucket_comes_back_flagged_as_an_anomaly(conn):
    """End-to-end witness for `with_anomaly_flags` reaching the wire: the three forecast
    tests above never exercise a series with a genuine outlier, so this is the only
    DB-backed test that would fail if the anomaly pass were dropped from `postprocess`."""
    profile_id = _seed_anomaly_profile(conn)

    envelope = execute(
        conn,
        profile_id,
        dict(_FORECAST_V1_PLAN),
        today=date(2026, 9, 4),
        merchant_enabled=True,
    )

    points = envelope["results"][0]["points"]
    assert [point.get("anomaly") for point in points] == [None] * 6 + [True] + [None] * 5
    assert points[6] == {"period": "2026-04", "value": "900.0000", "anomaly": True}


_DRIFT_PLAN = {
    "version": 1,
    "metric": "spend",
    "filters": {"currency": "PLN"},
    "groupBy": "category",
    "interval": "month",
    "range": {"type": "absolute", "from": "2025-10-01", "to": "2026-01-31"},
}


def _seed_drift_profile(conn) -> tuple[int, dict[str, int]]:
    """Two categories under one profile. Lidl leads 2025-11 (500 > 300); Biedronka leads
    2025-12 (400 > 100) — a genuine lead change in the last complete bucket. 2026-01 is the
    partial "current" bucket (today falls inside it) and deliberately flips the lead again
    (Lidl 9000 > Biedronka 50), so a wiring bug that forgot to exclude the current bucket
    would report the wrong period pair rather than merely a missing `drift` key."""
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO app_user (email, password_hash, display_name)"
            " VALUES (%s, 'x', 'Drift') RETURNING id",
            (f"drift-{uuid4()}@example.test",),
        )
        user_id = cur.fetchone()[0]
        cur.execute(
            "INSERT INTO profile (user_id, name, default_currency)"
            " VALUES (%s, 'Drift', 'PLN') RETURNING id",
            (user_id,),
        )
        profile_id = cur.fetchone()[0]
        category_ids: dict[str, int] = {}
        for name in ("Lidl", "Biedronka"):
            cur.execute(
                "INSERT INTO category (profile_id, parent_id, name)"
                " VALUES (%s, NULL, %s) RETURNING id",
                (profile_id, name),
            )
            category_ids[name] = cur.fetchone()[0]
        rows = [
            ("Lidl", "2025-11-04", "500.0000"),
            ("Biedronka", "2025-11-04", "300.0000"),
            ("Lidl", "2025-12-04", "100.0000"),
            ("Biedronka", "2025-12-04", "400.0000"),
            ("Lidl", "2026-01-04", "9000.0000"),
            ("Biedronka", "2026-01-04", "50.0000"),
        ]
        for name, occurred_on, amount in rows:
            cur.execute(
                "INSERT INTO txn (profile_id, category_id, amount, currency, txn_type,"
                " occurred_on) VALUES (%s, %s, %s, 'PLN', 'EXPENSE', %s)",
                (profile_id, category_ids[name], amount, occurred_on),
            )
    conn.commit()
    return profile_id, category_ids


def test_a_genuine_lead_change_comes_back_as_drift(conn):
    """End-to-end witness for `detect_lead_change` reaching the wire: none of the other
    golden tests use a `timeseriesSplit` result whose data actually changes leaders, so
    this is the only DB-backed test that would fail if drift were dropped from
    `postprocess`, or if the current-bucket exclusion were wired incorrectly."""
    profile_id, category_ids = _seed_drift_profile(conn)

    envelope = execute(
        conn,
        profile_id,
        dict(_DRIFT_PLAN),
        today=date(2026, 1, 15),
        merchant_enabled=True,
    )

    result = envelope["results"][0]
    assert result["shape"] == "timeseriesSplit"
    assert result["drift"] == [
        {
            "kind": "leadChange",
            "period": "2025-12",
            "previousPeriod": "2025-11",
            "leader": {
                "key": str(category_ids["Biedronka"]),
                "label": "Biedronka",
                "value": "400.0000",
            },
            "previousLeader": {
                "key": str(category_ids["Lidl"]),
                "label": "Lidl",
                "value": "500.0000",
            },
        }
    ]

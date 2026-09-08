"""Envelope post-processing (docs/INSIGHTS.md -> Forecast, anomalies and drift).

Pure functions over the executor's own points: no database, no container. Every
expected number is hand-computed and spelled out in the test that asserts it.
"""

import pytest

from analytics.postprocess import OTHER_KEY, detect_lead_change, with_anomaly_flags, with_forecast


def _points(start_year: int, start_month: int, values: list[str]) -> list[dict]:
    """Chronological, gap-free month buckets starting at YYYY-MM, one per value."""
    out = []
    for offset, value in enumerate(values):
        index = start_year * 12 + start_month - 1 + offset
        out.append({"period": f"{index // 12:04d}-{index % 12 + 1:02d}", "value": value})
    return out


def test_seasonal_naive_reuses_the_bucket_twelve_months_back():
    # 14 buckets, 2025-08 .. 2026-09, values 100, 200, ... 1400.
    points = _points(2025, 8, [f"{(i + 1) * 100}.0000" for i in range(14)])
    assert points[-1]["period"] == "2026-09"

    result = with_forecast(points, 3)

    assert result[:14] == points  # observed points are handed back untouched
    assert result[14:] == [
        # 2026-10 repeats 2025-10 (index 2 = 300), 2026-11 repeats 2025-11, ...
        {"period": "2026-10", "value": "300.0000", "projected": True},
        {"period": "2026-11", "value": "400.0000", "projected": True},
        {"period": "2026-12", "value": "500.0000", "projected": True},
    ]


def test_seasonal_naive_crosses_the_year_boundary():
    # Exactly 12 buckets, 2026-01 .. 2026-12: h=1 reaches index 0, the earliest.
    points = _points(2026, 1, [f"{(i + 1) * 10}.0000" for i in range(12)])

    result = with_forecast(points, 1)

    assert result[-1] == {"period": "2027-01", "value": "10.0000", "projected": True}


def test_short_history_falls_back_to_the_mean_of_the_last_three_buckets():
    # Four buckets, so index 0 - 12 is out of range: (20 + 33 + 41) / 3
    # = 31.333333..., quantized to four places.
    points = _points(2026, 6, ["10.0000", "20.0000", "33.0000", "41.0000"])

    result = with_forecast(points, 2)

    assert result[4:] == [
        {"period": "2026-10", "value": "31.3333", "projected": True},
        {"period": "2026-11", "value": "31.3333", "projected": True},
    ]


def test_the_fallback_window_narrows_on_a_two_bucket_series():
    # Fewer than FALLBACK_WINDOW buckets: the window is what there is.
    # (0.0001 + 0.0003) / 2 = 0.0002 exactly, no rounding involved.
    points = _points(2026, 8, ["0.0001", "0.0003"])

    assert with_forecast(points, 1) == [
        *points,
        # Observed buckets are 2026-08 and 2026-09, so the projection is 2026-10.
        {"period": "2026-10", "value": "0.0002", "projected": True},
    ]


def test_the_fallback_rounds_a_true_tie_up():
    # (0.0002 + 0.0003) / 2 = 0.00025 — a genuine tie at the fifth place.
    # ROUND_HALF_UP gives 0.0003; Python's default ROUND_HALF_EVEN would give
    # 0.0002, so this is the case that pins the rounding mode down.
    points = _points(2026, 8, ["0.0002", "0.0003"])

    assert with_forecast(points, 1)[-1] == {
        "period": "2026-10",
        "value": "0.0003",  # half-even would round to 0.0002
        "projected": True,
    }


def test_an_empty_series_projects_nothing():
    assert with_forecast([], 3) == []


def test_fallback_excludes_the_current_partial_bucket_from_its_mean():
    """D7: the trailing bucket is still mid-month, so it is naturally lower than a complete
    month and must not drag the fallback mean down. Without exclusion this would be
    (20 + 33 + 41) / 3 = 31.3333 (test_short_history_falls_back_to_the_mean_of_the_last_three
    _buckets, above) — pulled down by the partial 41. Excluding it leaves (10 + 20 + 33) / 3
    = 21.0000, the mean of three genuinely complete months."""
    points = _points(2026, 6, ["10.0000", "20.0000", "33.0000", "41.0000"])

    result = with_forecast(points, 2, current_bucket="2026-09")

    assert result[4:] == [
        {"period": "2026-10", "value": "21.0000", "projected": True},
        {"period": "2026-11", "value": "21.0000", "projected": True},
    ]


def test_fallback_uses_every_point_when_current_bucket_does_not_match_the_last_one():
    """An `absolute` range ending in the past has no current bucket among its points (the
    caller passes today's bucket regardless), so nothing is excluded — same numbers as the
    no-exclusion case."""
    points = _points(2026, 6, ["10.0000", "20.0000", "33.0000", "41.0000"])

    result = with_forecast(points, 1, current_bucket="2026-12")

    assert result[-1] == {"period": "2026-10", "value": "31.3333", "projected": True}


def test_fallback_keeps_the_only_point_when_it_is_the_current_bucket():
    """Nothing else to fall back on, so the lone partial bucket is used anyway — the same
    single-bucket behaviour as when no current_bucket is passed at all."""
    points = _points(2026, 8, ["50.0000"])

    result = with_forecast(points, 1, current_bucket="2026-08")

    assert result[-1] == {"period": "2026-09", "value": "50.0000", "projected": True}


def test_seasonal_naive_is_unaffected_by_excluding_the_current_bucket():
    """The seasonal lookback reuses raw historical values rather than averaging, so excluding
    the partial current bucket from the *fallback* window changes nothing here — these two
    projections are sourced from complete months regardless (2025-10 and 2025-11 are index 2
    and 3 either way)."""
    points = _points(2025, 8, [f"{(i + 1) * 100}.0000" for i in range(14)])

    result = with_forecast(points, 2, current_bucket="2026-09")

    assert result[14:] == [
        {"period": "2026-10", "value": "300.0000", "projected": True},
        {"period": "2026-11", "value": "400.0000", "projected": True},
    ]


def test_seasonal_naive_at_exactly_one_year_out_reuses_the_partial_current_bucket_as_is():
    """h = SEASONAL_PERIOD projects the bucket exactly one year after the last observed one,
    whose seasonal source is *defined* as that last observed bucket itself — "this September"
    is the only "last September" a forecast made in September can have. That is inherent to
    seasonal-naive, not the D7 defect: unlike the fallback mean, this is not an average diluted
    by a partial value, it is a direct reuse of the one real data point that exists for that
    calendar month."""
    points = _points(2026, 1, [f"{(i + 1) * 10}.0000" for i in range(12)])  # 2026-01 .. 2026-12

    result = with_forecast(points, 12, current_bucket="2026-12")

    assert result[-1] == {"period": "2027-12", "value": "120.0000", "projected": True}


def test_a_single_bucket_series_projects_its_own_value():
    # count=1 is below FALLBACK_WINDOW too, so the window narrows to that one
    # bucket and its mean is itself.
    points = _points(2026, 8, ["50.0000"])

    assert with_forecast(points, 2) == [
        *points,
        {"period": "2026-09", "value": "50.0000", "projected": True},
        {"period": "2026-10", "value": "50.0000", "projected": True},
    ]


def test_a_series_shorter_than_a_full_period_uses_the_fallback_for_every_projection():
    """11 observed months with months=3: h=2 and h=3 could index back into the
    series, but the mode is chosen once, so all three are the flat mean."""
    points = [{"period": f"2025-{m:02d}", "value": f"{100 + m}.0000"} for m in range(1, 12)]
    result = with_forecast(points, 3)
    projected = [p for p in result if p.get("projected")]
    assert len(projected) == 3
    assert len({p["value"] for p in projected}) == 1
    # mean of the last FALLBACK_WINDOW (3) observed buckets: 109, 110, 111
    assert projected[0]["value"] == "110.0000"


# Twelve buckets whose value multiset is
# {90, 95, 95, 100, 100, 105, 105, 110, 110, 115, 120, 900}:
# median = (105 + 105) / 2 = 105
# deviations sorted = 0, 0, 5, 5, 5, 5, 10, 10, 10, 15, 15, 795
# MAD = (5 + 10) / 2 = 7.5
_SPIKY = [
    "100.0000", "110.0000", "105.0000", "95.0000", "100.0000", "120.0000",
    "900.0000", "115.0000", "90.0000", "105.0000", "110.0000", "95.0000",
]


def test_flags_the_single_outlier_by_the_median_mad_rule():
    # z(900) = 0.6745 * 795 / 7.5 = 71.5   -> flagged
    # z(120) = 0.6745 *  15 / 7.5 =  1.349 -> not flagged
    # z(90)  = 0.6745 * -15 / 7.5 = -1.349 -> not flagged
    points = _points(2025, 10, _SPIKY)

    result = with_anomaly_flags(points)

    assert [p.get("anomaly") for p in result] == [None] * 6 + [True] + [None] * 5
    assert result[6] == {"period": "2026-04", "value": "900.0000", "anomaly": True}


def test_flagging_does_not_mutate_the_input():
    points = _points(2025, 10, _SPIKY)

    with_anomaly_flags(points)

    assert all("anomaly" not in point for point in points)


def test_a_series_shorter_than_six_points_is_never_flagged():
    points = _points(2026, 5, ["100.0000", "100.0000", "100.0000", "100.0000", "9000.0000"])

    assert with_anomaly_flags(points) == points


def test_a_mostly_zero_series_is_never_flagged():
    # Zero-filled gap buckets drive MAD to 0. One purchase in an otherwise empty
    # stretch is not an anomaly — it is the only data there is.
    points = _points(2026, 1, ["0.0000"] * 7 + ["500.0000"])

    assert with_anomaly_flags(points) == points


def test_a_flat_series_is_never_flagged():
    points = _points(2026, 1, ["50.0000"] * 8)

    assert with_anomaly_flags(points) == points


def test_an_all_zero_series_is_never_flagged():
    points = _points(2026, 1, ["0.0000"] * 8)

    assert with_anomaly_flags(points) == points


def test_an_odd_length_series_uses_the_middle_value_as_its_median():
    # Nine buckets: the median is the 5th ordered value, not an average of two.
    # Production series are routinely odd-length, so the branch needs a witness.
    points = _points(2026, 1, ["100.0000"] * 4 + ["105.0000"] * 4 + ["900.0000"])

    flagged = with_anomaly_flags(points)

    assert [point.get("anomaly") for point in flagged] == [None] * 8 + [True]


def test_projected_points_neither_are_flagged_nor_skew_the_statistics():
    # Enforced here, not merely contracted: if Task 14 appends the forecast before
    # flagging, the guesses must not score themselves. Values are chosen so MAD is
    # non-zero either way — an all-flat series would make this pass vacuously.
    observed = _points(2026, 1, ["100.0000", "102.0000", "104.0000", "106.0000",
                                 "108.0000", "110.0000", "112.0000", "900.0000"])
    projected = [{**point, "projected": True} for point in _points(2026, 9, ["5000.0000"] * 3)]

    mixed = with_anomaly_flags(observed + projected)

    # The lone real outlier is still caught, and only it.
    assert [point.get("anomaly") for point in mixed[:8]] == [None] * 7 + [True]
    # Without the filter these projections score |z| > 400 and would be flagged.
    assert all(point.get("anomaly") is None for point in mixed[8:])
    # And the observed verdicts are identical to judging them alone.
    assert mixed[:8] == with_anomaly_flags(observed)


def _series(key: str, label: str, values: list[str]) -> dict:
    """A timeseriesSplit entry over 2026-04 onward."""
    return {"key": key, "label": label, "points": _points(2026, 4, values)}


def test_reports_the_lead_change_between_the_last_two_complete_buckets():
    # 2026-06 is the bucket containing today and is excluded, so the comparison
    # is 2026-04 (Lidl ahead) against 2026-05 (Biedronka ahead).
    lidl = _series("Lidl", "Lidl", ["500.0000", "300.0000", "10.0000"])
    biedronka = _series("Biedronka", "Biedronka", ["400.0000", "600.0000", "20.0000"])

    assert detect_lead_change([lidl, biedronka], "2026-06") == [
        {
            "kind": "leadChange",
            "period": "2026-05",
            "previousPeriod": "2026-04",
            "leader": {"key": "Biedronka", "label": "Biedronka", "value": "600.0000"},
            "previousLeader": {"key": "Lidl", "label": "Lidl", "value": "500.0000"},
        }
    ]


def test_no_lead_change_when_the_same_series_stays_ahead():
    lidl = _series("Lidl", "Lidl", ["500.0000", "600.0000", "10.0000"])
    biedronka = _series("Biedronka", "Biedronka", ["400.0000", "300.0000", "20.0000"])

    assert detect_lead_change([lidl, biedronka], "2026-06") == []


def test_a_tie_is_not_an_overtake():
    lidl = _series("Lidl", "Lidl", ["500.0000", "600.0000", "10.0000"])
    biedronka = _series("Biedronka", "Biedronka", ["400.0000", "600.0000", "20.0000"])

    assert detect_lead_change([lidl, biedronka], "2026-06") == []


def test_an_all_zero_bucket_has_no_leader():
    lidl = _series("Lidl", "Lidl", ["0.0000", "600.0000", "10.0000"])
    biedronka = _series("Biedronka", "Biedronka", ["0.0000", "300.0000", "20.0000"])

    assert detect_lead_change([lidl, biedronka], "2026-06") == []


def test_projected_buckets_are_never_compared():
    # The flip lives entirely in the projected tail: nothing is reported.
    lidl = {
        "key": "Lidl",
        "label": "Lidl",
        "points": [
            {"period": "2026-04", "value": "500.0000"},
            {"period": "2026-05", "value": "600.0000"},
            {"period": "2026-06", "value": "10.0000", "projected": True},
            {"period": "2026-07", "value": "10.0000", "projected": True},
        ],
    }
    biedronka = {
        "key": "Biedronka",
        "label": "Biedronka",
        "points": [
            {"period": "2026-04", "value": "400.0000"},
            {"period": "2026-05", "value": "300.0000"},
            {"period": "2026-06", "value": "900.0000", "projected": True},
            {"period": "2026-07", "value": "900.0000", "projected": True},
        ],
    }

    assert detect_lead_change([lidl, biedronka], "2026-06") == []


def test_one_series_has_no_lead_to_lose():
    only = [_series("Lidl", "Lidl", ["500.0000", "600.0000", "0.0000"])]
    assert detect_lead_change(only, "2026-06") == []


def test_one_complete_bucket_is_not_a_comparison():
    lidl = _series("Lidl", "Lidl", ["500.0000", "300.0000"])
    biedronka = _series("Biedronka", "Biedronka", ["400.0000", "600.0000"])

    # 2026-05 is the current bucket, leaving only 2026-04 to compare against.
    assert detect_lead_change([lidl, biedronka], "2026-05") == []


def _split(current_leader: str, previous_leader: str):
    """Two gap-filled monthly series over 2026-01..2026-03, with the lead changing
    hands in the last complete bucket (02) and 03 as the partial current one."""
    return [
        {"key": previous_leader, "label": previous_leader,
         "points": _points(2026, 1, ["10.0000", "300.0000", "1.0000"])},
        {"key": current_leader, "label": current_leader,
         "points": _points(2026, 1, ["10.0000", "100.0000", "900.0000"])},
    ]


def test_a_current_bucket_of_the_wrong_shape_is_rejected_not_ignored():
    # A day-shaped key against monthly buckets matches nothing, so the partial
    # bucket would silently come back into the comparison. Fail loudly instead.
    series = _split("Lidl", "Biedronka")

    with pytest.raises(ValueError, match="period key"):
        detect_lead_change(series, "2026-03-01")

    with pytest.raises(ValueError, match="period key"):
        detect_lead_change(series, "")


def test_a_well_formed_current_bucket_outside_the_range_is_accepted():
    # An absolute range ending in the past has no current bucket; every bucket in
    # it is complete, so this must not raise.
    series = _split("Lidl", "Biedronka")

    drift = detect_lead_change(series, "2026-09")

    assert [entry["period"] for entry in drift] == ["2026-03"]


def test_the_other_aggregate_is_never_a_leader():
    # __other__ dominates both buckets (it sums the whole truncated tail), which
    # without exclusion reports the SAME leader ("__other__") in both periods and
    # so masks the real Lidl -> Biedronka change underneath it. Excluding
    # __other__ from candidacy is what lets that real change surface at all.
    lidl = _series("Lidl", "Lidl", ["500.0000", "100.0000", "0.0000"])
    biedronka = _series("Biedronka", "Biedronka", ["300.0000", "400.0000", "0.0000"])
    other = _series(OTHER_KEY, "Other", ["1000.0000", "900.0000", "0.0000"])

    assert detect_lead_change([lidl, biedronka, other], "2026-06") == [
        {
            "kind": "leadChange",
            "period": "2026-05",
            "previousPeriod": "2026-04",
            "leader": {"key": "Biedronka", "label": "Biedronka", "value": "400.0000"},
            "previousLeader": {"key": "Lidl", "label": "Lidl", "value": "500.0000"},
        }
    ]


def test_a_negative_leader_is_not_a_lead():
    # Distinct totals, so the tie branch cannot mask this: the top value is still
    # not a positive spender, so there is no leader to change.
    series = [
        {"key": "Lidl", "label": "Lidl",
         "points": _points(2026, 1, ["-5.0000", "-5.0000", "-5.0000"])},
        {"key": "Biedronka", "label": "Biedronka",
         "points": _points(2026, 1, ["-9.0000", "-9.0000", "-9.0000"])},
    ]

    assert detect_lead_change(series, "2026-03") == []

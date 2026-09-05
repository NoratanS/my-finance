"""Envelope post-processing (docs/INSIGHTS.md -> Forecast, anomalies and drift).

Pure functions over the executor's own points: no database, no container. Every
expected number is hand-computed and spelled out in the test that asserts it.
"""

from analytics.postprocess import with_forecast


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

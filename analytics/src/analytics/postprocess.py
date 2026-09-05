"""Post-processing over the executor's result envelope.

Forecast, anomaly flags and drift (docs/INSIGHTS.md -> "Forecast, anomalies and
drift"). Everything here is a pure function of the points the SQL already
produced: the service connects with a SELECT-only role, so derived state has
nowhere to live but the response it is derived for.
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

Point = dict[str, object]

SEASONAL_PERIOD = 12
"""Seasonal-naive lag, in monthly buckets: this September looks like last September."""

FALLBACK_WINDOW = 3
"""Buckets averaged when the series is too short to reach SEASONAL_PERIOD back."""


def _money(value: Decimal) -> str:
    """The wire format for every amount: four decimal places, rounded half-up."""
    return str(value.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP))


def _month_key_after(key: str, ahead: int) -> str:
    """"2026-09" + 3 -> "2026-12". Month buckets only — forecast requires interval=month."""
    year, month = (int(part) for part in key.split("-"))
    index = year * 12 + month - 1 + ahead
    return f"{index // 12:04d}-{index % 12 + 1:02d}"


def with_forecast(points: list[Point], months: int) -> list[Point]:
    """Append `months` seasonal-naive projections to a chronological month series.

    Projection h (1-based) reuses the observed bucket SEASONAL_PERIOD buckets
    earlier. `months` is capped at SEASONAL_PERIOD by validation, so that source
    index is always inside the observed series when it is non-negative — a
    projection is never built from another projection.

    The mode is decided **once, for the whole forecast**: a series shorter than
    SEASONAL_PERIOD uses the flat mean of the last FALLBACK_WINDOW observed
    buckets for every projected bucket. Deciding per bucket would let one forecast
    mix two algorithms (with 11 observed months and months=3, h=1 would be a mean
    and h=2..3 seasonal values) — surprising on a chart, and impossible to state
    honestly in the docs.
    """
    if not points:
        return list(points)
    values = [Decimal(str(point["value"])) for point in points]
    count = len(values)
    window = values[-min(FALLBACK_WINDOW, count):]
    fallback = _money(sum(window) / len(window))
    last_key = str(points[-1]["period"])

    seasonal = count >= SEASONAL_PERIOD

    projected: list[Point] = []
    for ahead in range(1, months + 1):
        value = _money(values[count + ahead - 1 - SEASONAL_PERIOD]) if seasonal else fallback
        projected.append(
            {"period": _month_key_after(last_key, ahead), "value": value, "projected": True}
        )
    return [*points, *projected]

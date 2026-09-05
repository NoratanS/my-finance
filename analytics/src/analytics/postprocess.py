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


ANOMALY_MIN_POINTS = 6
"""Below this, a series has no shape to deviate from and nothing is flagged."""

ANOMALY_Z = Decimal("3.5")
"""Iglewicz & Hoaglin's cutoff for the modified z-score."""

_MAD_SCALE = Decimal("0.6745")
"""Consistency constant: 0.6745 * MAD estimates the standard deviation."""


def _median(values: list[Decimal]) -> Decimal:
    ordered = sorted(values)
    middle = len(ordered) // 2
    if len(ordered) % 2:
        return ordered[middle]
    return (ordered[middle - 1] + ordered[middle]) / 2


def with_anomaly_flags(points: list[Point]) -> list[Point]:
    """Flag outliers with the median/MAD (modified z-score) rule.

    Projected points are guesses, not observations, so a `"projected": true`
    point is passed through untouched and is excluded from the median/MAD as
    well — otherwise a projection would be scored as an anomaly and would skew
    the very statistics it is judged against. Callers should still flag the
    observed series before appending a forecast; this filter only makes the
    order stop mattering, and is a no-op when it is already correct.

    z = 0.6745 * (value - median) / MAD, flagged at |z| > ANOMALY_Z. Median-based
    rather than mean-based because a mean drags itself toward the outlier it is
    meant to expose. Two guards keep it quiet: a series shorter than
    ANOMALY_MIN_POINTS, and a series whose MAD is 0 (flat, or the common
    mostly-zero-filled one), flag nothing at all. A MAD of 0 makes the ratio
    undefined (0/0 for the median itself, or a division by zero for anything
    else) — rather than pick an arbitrary tie-break, we treat "no spread" as "no
    basis to call anything an outlier": a single purchase in an otherwise empty
    year is not an anomaly, it is the only data there is.
    """
    observed = [point for point in points if not point.get("projected")]
    values = [Decimal(str(point["value"])) for point in observed]
    if len(values) < ANOMALY_MIN_POINTS:
        return list(points)
    median = _median(values)
    mad = _median([abs(value - median) for value in values])
    if mad == 0:
        return list(points)

    flagged: list[Point] = []
    for point in points:
        if point.get("projected"):
            flagged.append(dict(point))
            continue
        score = _MAD_SCALE * (Decimal(str(point["value"])) - median) / mad
        flagged.append({**point, "anomaly": True} if abs(score) > ANOMALY_Z else dict(point))
    return flagged


def _leader(series: list[dict], period: str) -> dict | None:
    """The strictly-largest series in `period`, or None on a tie or an empty bucket."""
    ranked: list[tuple[Decimal, dict]] = []
    for entry in series:
        value = next(
            (
                Decimal(str(point["value"]))
                for point in entry["points"]
                if point["period"] == period
            ),
            None,
        )
        if value is not None:
            ranked.append((value, entry))
    if len(ranked) < 2:
        return None
    ranked.sort(key=lambda item: item[0], reverse=True)
    if ranked[0][0] == ranked[1][0] or ranked[0][0] <= 0:
        return None
    top = ranked[0][1]
    return {"key": str(top["key"]), "label": str(top["label"]), "value": _money(ranked[0][0])}


def _key_shape(key: str) -> str:
    """A period key's format with digits masked: "2026-09" -> "####-##", "2026-Q3" ->
    "####-Q#". Lets drift check `current_bucket` came from the same interval without
    being told which interval that is."""
    return "".join("#" if character.isdigit() else character for character in key)


def detect_lead_change(series: list[dict], current_bucket: str) -> list[dict]:
    """"Biedronka overtook Lidl" — a lead change between the last two complete buckets.

    `current_bucket` is the key of the bucket containing the executor's today; it
    is excluded, along with any projection, because a partial month always looks
    like a collapse and would report a lead change every time a month rolls over.
    It must be a period key of this result's own interval (`ranges.period_key`) —
    a key of the wrong shape is rejected rather than silently matching nothing,
    which would quietly reinstate the partial bucket. A well-formed key that is
    simply outside the range is fine: an `absolute` range ending in the past has
    no current bucket, and every bucket in it is complete.
    Stateless by construction: nothing is remembered between executions, which is
    what lets a SELECT-only service own this at all.
    """
    if len(series) < 2:
        return []
    observed = [
        str(point["period"])
        # Every series is gap-filled over the same buckets (D4), so the first
        # series' bucket list is the bucket list.
        for point in series[0]["points"]
        if not point.get("projected")
    ]
    if len(observed) < 2:
        return []
    shape = _key_shape(observed[0])
    if not isinstance(current_bucket, str) or _key_shape(current_bucket) != shape:
        raise ValueError(
            f"current_bucket {current_bucket!r} is not a {shape!r} period key; derive it with "
            "ranges.period_key from the same interval and clock as the query. Passing a key of "
            "the wrong shape would silently include the partial bucket."
        )
    periods = [period for period in observed if period != current_bucket]
    if len(periods) < 2:
        return []

    previous_period, period = periods[-2], periods[-1]
    previous_leader = _leader(series, previous_period)
    leader = _leader(series, period)
    if previous_leader is None or leader is None or previous_leader["key"] == leader["key"]:
        return []
    return [
        {
            "kind": "leadChange",
            "period": period,
            "previousPeriod": previous_period,
            "leader": leader,
            "previousLeader": previous_leader,
        }
    ]

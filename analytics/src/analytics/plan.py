"""The plan DSL v1 object model (docs/INSIGHTS.md "Plan DSL v1").

Frozen dataclasses rather than Pydantic models, for two reasons that are about
this API rather than about Pydantic. First, `docs/API.md` pins the exact
problem strings the executor returns ("groupBy: unknown field"), and mapping
Pydantic's error objects onto that contract is more code than the hand-written
check it would replace. Second, `validation.validate_plan` needs a live
database connection to confirm a categoryId belongs to the profile, which is
not something a field validator should be doing.

(An earlier version of this note claimed Pydantic fails fast and would collapse
the problem list. That is wrong -- ValidationError.errors() returns them all --
and it is recorded here so the argument is not re-made from a false premise.)
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

SUPPORTED_VERSIONS: frozenset[int] = frozenset({1, 2})
"""v1, plus v2 = v1 + the optional `forecast` field (docs/INSIGHTS.md -> Forecast)."""

MAX_FORECAST_MONTHS = 12
"""Seasonal-naive looks 12 monthly buckets back, so a longer horizon would
project from its own projections. One year is the honest limit."""

METRICS = ("spend", "income", "net")
GROUP_BYS = ("category", "merchant")  # "currency" dropped from the v1 enum (spec D1)
INTERVALS = ("day", "week", "month", "quarter", "year")
RANGE_TYPES = ("lastMonths", "yearToDate", "absolute", "all")

# txn.merchant landed as V5 in Phase 4b (MY-33): filters.merchants and groupBy: "merchant" now
# execute for real.
MERCHANT_ENABLED = True

MAX_MERCHANTS = 25
"""How many merchants one `filters.merchants` may name. Same number as the executor's MAX_GROUPS,
the one categorical bound the DSL already has: a merchant axis draws at most 25 groups, so a
filter naming more merchants than the axis can ever show is asking for a chart that cannot
exist — and the comma-delimited chip stops being usable long before 25."""

MAX_MERCHANT_LENGTH = 100
"""`txn.merchant` is CHECK (char_length(merchant) <= 100) (docs/SCHEMA.md "txn"), and the filter
is literal equality, so a longer value can never match a row: rejecting it costs no
expressiveness."""


@dataclass(frozen=True)
class Range:
    type: str
    n: int | None = None
    start: date | None = None  # the plan's "from" — `from` is a Python keyword
    end: date | None = None  # the plan's "to"


@dataclass(frozen=True)
class Filters:
    category_id: int | None = None
    include_descendants: bool = True
    merchants: tuple[str, ...] | None = None
    currency: str | None = None


@dataclass(frozen=True)
class Forecast:
    """Plan v2's only addition: how many monthly buckets to project."""

    months: int


@dataclass(frozen=True)
class Plan:
    version: int
    metric: str
    filters: Filters
    group_by: str | None
    interval: str | None
    range: Range
    forecast: Forecast | None = None

    def to_json(self) -> dict:
        """The "normalized plan as executed" echoed in the envelope (docs/INSIGHTS.md → Result
        shapes). Defaults the executor applied are spelled out, so the explorer's chips show
        what actually ran rather than what was typed."""
        filters: dict = {}
        if self.filters.category_id is not None:
            filters["categoryId"] = self.filters.category_id
            filters["includeDescendants"] = self.filters.include_descendants
        if self.filters.merchants is not None:
            filters["merchants"] = list(self.filters.merchants)
        if self.filters.currency is not None:
            filters["currency"] = self.filters.currency
        payload = {
            "version": self.version,
            "metric": self.metric,
            "filters": filters,
            "groupBy": self.group_by,
            "interval": self.interval,
            "range": _range_to_json(self.range),
        }
        if self.forecast is not None:
            payload["forecast"] = {"months": self.forecast.months}
        return payload


def _range_to_json(rng: Range) -> dict:
    if rng.type == "lastMonths":
        return {"type": "lastMonths", "n": rng.n}
    if rng.type == "absolute":
        # validate_plan() gates parse_plan(), so an "absolute" range always has both dates.
        assert rng.start is not None and rng.end is not None
        return {"type": "absolute", "from": rng.start.isoformat(), "to": rng.end.isoformat()}
    return {"type": rng.type}


def _parse_forecast(raw: object) -> Forecast | None:
    """`validate_plan` has already checked the shape, so this only converts."""
    if not isinstance(raw, dict):
        return None
    return Forecast(months=int(raw["months"]))


def parse_plan(raw: dict) -> Plan:
    """Builds a Plan from a body `validation.validate_plan` already accepted, so every field is
    known to be present and well-typed here."""
    filters = raw.get("filters") or {}
    merchants = filters.get("merchants")
    rng = raw["range"]
    return Plan(
        version=raw["version"],
        metric=raw["metric"],
        filters=Filters(
            category_id=filters.get("categoryId"),
            include_descendants=filters.get("includeDescendants", True),
            merchants=tuple(merchants) if merchants is not None else None,
            currency=filters.get("currency"),
        ),
        group_by=raw.get("groupBy"),
        interval=raw.get("interval"),
        range=Range(
            type=rng["type"],
            n=rng.get("n"),
            start=date.fromisoformat(rng["from"]) if "from" in rng else None,
            end=date.fromisoformat(rng["to"]) if "to" in rng else None,
        ),
        forecast=_parse_forecast(raw.get("forecast")),
    )

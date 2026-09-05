"""The plan DSL v1 object model (docs/INSIGHTS.md "Plan DSL v1").

Frozen dataclasses rather than Pydantic models: the wire body is validated by
`validation.validate_plan`, which returns a *list* of problems, and Pydantic's fail-fast
exceptions would collapse that list into whichever error it hit first.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

SUPPORTED_VERSIONS: frozenset[int] = frozenset({1})
METRICS = ("spend", "income", "net")
GROUP_BYS = ("category", "merchant")  # "currency" dropped from the v1 enum (spec D1)
INTERVALS = ("day", "week", "month", "quarter", "year")
RANGE_TYPES = ("lastMonths", "yearToDate", "absolute", "all")

# txn.merchant lands as V5 in Phase 4b. Until then filters.merchants and groupBy: "merchant" are
# both rejected with one shared message (spec D2); flipping this to True is MY-33's switch.
MERCHANT_ENABLED = False


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
class Plan:
    version: int
    metric: str
    filters: Filters
    group_by: str | None
    interval: str | None
    range: Range

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
        return {
            "version": self.version,
            "metric": self.metric,
            "filters": filters,
            "groupBy": self.group_by,
            "interval": self.interval,
            "range": _range_to_json(self.range),
        }


def _range_to_json(rng: Range) -> dict:
    if rng.type == "lastMonths":
        return {"type": "lastMonths", "n": rng.n}
    if rng.type == "absolute":
        return {"type": "absolute", "from": rng.start.isoformat(), "to": rng.end.isoformat()}
    return {"type": rng.type}


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
    )

"""Strict structural validation of a plan (docs/INSIGHTS.md "Plan DSL v1").

Every violation becomes one human-readable string pinpointing the field — the same style as the
backend's BackupValidator — and an empty list means the plan is executable. Nothing is silently
ignored: a field the executor does not understand is a rejection, because a chart that quietly
dropped a filter is a wrong chart.

Range-dependent limits (the bucket cap) need the clock, which this signature deliberately does
not take; they live in `executor.execute`.
"""

from __future__ import annotations

import re
from datetime import date
from typing import TypeGuard

from analytics.plan import (
    GROUP_BYS,
    INTERVALS,
    MAX_FORECAST_MONTHS,
    MAX_MERCHANT_LENGTH,
    MAX_MERCHANTS,
    METRICS,
    RANGE_TYPES,
    SUPPORTED_VERSIONS,
)

TOP_LEVEL_FIELDS = ("version", "metric", "filters", "groupBy", "interval", "range", "forecast")
FILTER_FIELDS = ("categoryId", "includeDescendants", "merchants", "currency")
RANGE_FIELDS = {
    "lastMonths": ("type", "n"),
    "yearToDate": ("type",),
    "absolute": ("type", "from", "to"),
    "all": ("type",),
}

# Always fullmatch(): match() with `^...$` also accepts a trailing newline ("PLN\n"), which the
# backend's Currency code rule rejects.
CURRENCY = re.compile(r"[A-Z]{3}")


def validate_plan(raw: object, *, profile_id: int, conn) -> list[str]:
    """Returns a list of problem strings; empty means valid."""
    if not isinstance(raw, dict):
        return ["plan: must be a JSON object"]

    problems: list[str] = []
    for field in sorted(raw):
        if field not in TOP_LEVEL_FIELDS:
            problems.append(f"{field}: unknown field")

    _check_version(raw, problems)
    _check_enum(raw, "metric", METRICS, required=True, problems=problems)
    _check_enum(raw, "groupBy", GROUP_BYS, required=False, problems=problems)
    _check_enum(raw, "interval", INTERVALS, required=False, problems=problems)

    _check_filters(raw.get("filters"), profile_id, conn, problems)
    _check_range(raw.get("range"), problems)
    problems += forecast_problems(
        raw.get("forecast"), version=raw.get("version"), interval=raw.get("interval")
    )
    return problems


def forecast_problems(raw: object, *, version: object, interval: object) -> list[str]:
    """Plan-v2 `forecast` rules (docs/INSIGHTS.md -> Forecast).

    Two hard requirements: the plan must declare version 2 (a v1 plan carrying a
    v2 field would make `version` a lie about its own contents), and the time
    axis must be monthly, because the projection is seasonal-naive over months.
    """
    if raw is None:
        return []
    problems: list[str] = []
    if version != 2:
        problems.append("forecast: requires plan version 2")
    if not isinstance(raw, dict):
        problems.append('forecast: must be an object with a "months" field')
        return problems
    unknown = sorted(set(raw) - {"months"})
    if unknown:
        problems.append(f"forecast: unknown field(s) {', '.join(unknown)}")
    months = raw.get("months")
    # bool is a subclass of int, so `True` would otherwise pass as a horizon of 1.
    if (
        not isinstance(months, int)
        or isinstance(months, bool)
        or not 1 <= months <= MAX_FORECAST_MONTHS
    ):
        problems.append(f"forecast.months: must be an integer between 1 and {MAX_FORECAST_MONTHS}")
    if interval != "month":
        problems.append('forecast: requires interval "month"')
    return problems


def _is_int(value: object) -> TypeGuard[int]:
    """`isinstance(True, int)` is True and `1.0 == 1`, so neither an id nor a bucket count can
    be checked with isinstance. Python's bool-is-an-int is the trap; SQL has no such thing."""
    return type(value) is int


def _check_version(raw: dict, problems: list[str]) -> None:
    if "version" not in raw:
        problems.append("version: is required")
    elif not _is_int(raw["version"]):
        problems.append("version: must be an integer")
    elif raw["version"] not in SUPPORTED_VERSIONS:
        # Saved insights outlive the DSL; an unknown version is rejected, never guessed at.
        problems.append(f"version: unsupported plan version {raw['version']}")


def _check_enum(
    raw: dict, field: str, allowed: tuple[str, ...], *, required: bool, problems: list[str]
) -> None:
    value = raw.get(field)
    if value is None:
        if required:
            problems.append(f"{field}: is required")
        return
    if not isinstance(value, str) or value not in allowed:
        options = ", ".join(allowed) + ("" if required else ", or null")
        problems.append(f"{field}: must be one of {options}")


def _check_filters(filters: object, profile_id: int, conn, problems: list[str]) -> None:
    if filters is None:
        return
    if not isinstance(filters, dict):
        problems.append("filters: must be a JSON object")
        return

    for field in sorted(filters):
        if field not in FILTER_FIELDS:
            problems.append(f"filters.{field}: unknown field")

    category_id = filters.get("categoryId")
    if category_id is not None:
        if not _is_int(category_id):
            problems.append("filters.categoryId: must be an integer")
        elif not _category_exists(conn, profile_id, category_id):
            problems.append(f"filters.categoryId: {category_id} does not exist in this profile")

    include = filters.get("includeDescendants")
    if include is not None and not isinstance(include, bool):
        problems.append("filters.includeDescendants: must be true or false")
    # includeDescendants is meaningful only with categoryId (docs/INSIGHTS.md "Plan DSL v1"), but
    # the field is accepted without one and simply has no effect — a deliberate decision (Task 20
    # carry-forward), not an oversight. The frontend's defaultPlan() and every template gallery
    # entry (master plan Tasks 32/37) carry `includeDescendants: true` unconditionally, adding
    # `currency` alone without ever selecting a category chip; rejecting the pair would break the
    # explorer's default landing state. No information is lost either way — with no categoryId
    # the flag has nothing to apply to.

    merchants = filters.get("merchants")
    if merchants is not None:
        if not (
            isinstance(merchants, list)
            and merchants
            and all(isinstance(m, str) and m.strip() for m in merchants)
        ):
            problems.append("filters.merchants: must be a non-empty array of merchant names")
        else:
            # executor.py's rule for authenticated input: it must not choose how many objects
            # the server builds. Both bounds are reported, never fail-fast.
            if len(merchants) > MAX_MERCHANTS:
                problems.append(f"filters.merchants: at most {MAX_MERCHANTS} merchants")
            if any(len(m) > MAX_MERCHANT_LENGTH for m in merchants):
                problems.append(
                    "filters.merchants: each merchant must be at most "
                    f"{MAX_MERCHANT_LENGTH} characters"
                )

    currency = filters.get("currency")
    if currency is not None and not (isinstance(currency, str) and CURRENCY.fullmatch(currency)):
        problems.append("filters.currency: must be a three-letter ISO 4217 code")


def _category_exists(conn, profile_id: int, category_id: int) -> bool:
    """Profile-scoped by construction: another profile's category is simply not found, which is
    the same answer a deleted one gets (docs/INSIGHTS.md "Plans are loosely coupled")."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT 1 FROM category WHERE id = %s AND profile_id = %s", (category_id, profile_id)
        )
        return cur.fetchone() is not None


def _check_range(rng: object, problems: list[str]) -> None:
    if rng is None:
        problems.append("range: is required")
        return
    if not isinstance(rng, dict):
        problems.append("range: must be a JSON object")
        return

    kind = rng.get("type")
    if not isinstance(kind, str) or kind not in RANGE_TYPES:
        problems.append(f"range.type: must be one of {', '.join(RANGE_TYPES)}")
        return

    for field in sorted(rng):
        if field not in RANGE_FIELDS[kind]:
            problems.append(f"range.{field}: unknown field for a {kind} range")

    if kind == "lastMonths":
        n = rng.get("n")
        if not _is_int(n) or n < 1:
            problems.append("range.n: must be a positive integer")
    elif kind == "absolute":
        start = _parse_date(rng.get("from"), "range.from", problems)
        end = _parse_date(rng.get("to"), "range.to", problems)
        if start is not None and end is not None and start > end:
            problems.append("range: from must not be after to")


def _parse_date(value: object, at: str, problems: list[str]) -> date | None:
    if not isinstance(value, str):
        problems.append(f"{at}: is required, as an ISO date like 2026-01-31")
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        problems.append(f"{at}: is not an ISO date like 2026-01-31")
        return None

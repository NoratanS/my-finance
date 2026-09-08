"""The JSON schema handed to Ollama's `format` field, plus emission clean-up.

The schema is DERIVED from plan.py's enums, so a metric or interval can never
be added to the DSL without the model being told about it. It is a prompt-side
constraint, not a validator: `validation.validate_plan()` stays the single gate
(design delta D7).
"""

from __future__ import annotations

from analytics.plan import GROUP_BYS, INTERVALS, METRICS, RANGE_TYPES

# RANGE_TYPES is imported from analytics.plan, never retyped — see the import above.

# Ollama converts this schema to a grammar and constrains decoding with it
# (verified against https://docs.ollama.com/api/chat -> structured outputs), so
# the emission is JSON without prose or code fences to strip. The `range` union
# is expressed as ONE object with an enum discriminator plus optional members
# rather than `anyOf`: flat shapes are the reliably supported part of that
# conversion, and normalize_emission() + validate_plan() reject whatever the
# grammar lets through.
PLAN_JSON_SCHEMA: dict = {
    "type": "object",
    "properties": {
        "version": {"type": "integer"},
        "metric": {"type": "string", "enum": list(METRICS)},
        "filters": {
            "type": "object",
            "properties": {
                "categoryId": {"type": "integer"},
                "includeDescendants": {"type": "boolean"},
                "merchants": {"type": "array", "items": {"type": "string"}},
                "currency": {"type": "string"},
            },
        },
        "groupBy": {"type": "string", "enum": list(GROUP_BYS)},
        "interval": {"type": "string", "enum": list(INTERVALS)},
        "range": {
            "type": "object",
            "properties": {
                "type": {"type": "string", "enum": list(RANGE_TYPES)},
                "n": {"type": "integer"},
                "from": {"type": "string"},
                "to": {"type": "string"},
            },
            "required": ["type"],
        },
    },
    "required": ["version", "metric", "filters", "range"],
}

RANGE_MEMBERS: dict[str, tuple[str, ...]] = {
    "lastMonths": ("n",),
    "yearToDate": (),
    "absolute": ("from", "to"),
    "all": (),
}


def normalize_emission(raw: object) -> object:
    """Drop nulls, and the range members that do not belong to the range type.

    Constrained decoding happily fills every optional key it is offered, and a
    plan carrying `{"type": "yearToDate", "n": 12}` would be rejected by
    validate_plan as an unknown field. Cleaning here is dropping, never
    guessing: no default is invented, so an under-specified emission still
    fails validation and still triggers the one retry.
    """
    if not isinstance(raw, dict):
        return raw

    plan = {key: value for key, value in raw.items() if value is not None}

    filters = plan.get("filters")
    if isinstance(filters, dict):
        plan["filters"] = {key: value for key, value in filters.items() if value is not None}

    rng = plan.get("range")
    if isinstance(rng, dict):
        range_type = rng.get("type")
        # A missing or non-string "type" won't match any RANGE_MEMBERS key either way,
        # so this narrowing changes nothing at runtime — it just gives mypy a str.
        keep = RANGE_MEMBERS.get(range_type, ()) if isinstance(range_type, str) else ()
        plan["range"] = {
            key: value
            for key, value in rng.items()
            if value is not None and (key == "type" or key in keep)
        }

    return plan

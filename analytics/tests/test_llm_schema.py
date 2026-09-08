"""The prompt-side plan schema, and clean-up of what constrained decoding emits.

Neither needs a database nor a model: these run in CI (design delta D11).
"""

from copy import deepcopy

from analytics import plan
from analytics.llm import schema as llm_schema
from analytics.llm.schema import PLAN_JSON_SCHEMA, RANGE_MEMBERS, normalize_emission
from analytics.plan import GROUP_BYS, INTERVALS, METRICS, RANGE_TYPES


def test_schema_enums_are_derived_from_the_dsl():
    properties = PLAN_JSON_SCHEMA["properties"]
    assert properties["metric"]["enum"] == list(METRICS)
    assert properties["groupBy"]["enum"] == list(GROUP_BYS)
    assert properties["interval"]["enum"] == list(INTERVALS)
    assert properties["range"]["properties"]["type"]["enum"] == list(RANGE_TYPES)
    assert PLAN_JSON_SCHEMA["required"] == ["version", "metric", "filters", "range"]


def test_range_types_is_imported_from_plan_not_redefined():
    # The pre-flight ruling: a second copy of RANGE_TYPES drifts the moment the DSL
    # gains a range type. Identity (not just equality) proves schema.py imports the
    # same tuple object rather than hand-copying its values.
    assert llm_schema.RANGE_TYPES is plan.RANGE_TYPES


def test_range_members_covers_every_range_type():
    # RANGE_MEMBERS is a second, hand-typed map keyed by the same range types. Nothing
    # ties its keys to RANGE_TYPES structurally, so a new range type added to the DSL
    # without a matching RANGE_MEMBERS entry would silently strip every member from
    # that range (RANGE_MEMBERS.get(new_type, ()) defaults to "keep nothing") unless
    # this test catches the gap.
    assert set(RANGE_MEMBERS) == set(RANGE_TYPES)


def test_normalize_drops_nulls_at_the_top_level_and_inside_filters():
    cleaned = normalize_emission(
        {
            "version": 1,
            "metric": "spend",
            "filters": {"categoryId": 12, "currency": None, "merchants": None},
            "groupBy": None,
            "interval": "month",
            "range": {"type": "lastMonths", "n": 12},
        }
    )

    assert cleaned == {
        "version": 1,
        "metric": "spend",
        "filters": {"categoryId": 12},
        "interval": "month",
        "range": {"type": "lastMonths", "n": 12},
    }


def test_normalize_prunes_range_members_that_do_not_belong_to_the_type():
    cleaned = normalize_emission(
        {
            "version": 1,
            "metric": "spend",
            "filters": {},
            "range": {"type": "yearToDate", "n": 12, "from": "2026-01-01"},
        }
    )

    assert cleaned["range"] == {"type": "yearToDate"}


def test_normalize_keeps_the_bounds_of_an_absolute_range():
    cleaned = normalize_emission(
        {
            "version": 1,
            "metric": "spend",
            "filters": {},
            "range": {"type": "absolute", "from": "2026-01-01", "to": "2026-06-30", "n": 3},
        }
    )

    assert cleaned["range"] == {"type": "absolute", "from": "2026-01-01", "to": "2026-06-30"}


def test_normalize_leaves_unknown_fields_alone_for_the_one_validator():
    cleaned = normalize_emission(
        {
            "version": 1,
            "metric": "spend",
            "filters": {},
            "range": {"type": "all"},
            "split": "merchant",
        }
    )

    # validate_plan rejects `split`, not this function (design delta D7).
    assert cleaned["split"] == "merchant"


def test_normalize_passes_a_non_object_emission_straight_through():
    assert normalize_emission(["not", "a", "plan"]) == ["not", "a", "plan"]


def test_normalize_strips_all_members_for_an_unrecognized_or_missing_range_type():
    # RANGE_MEMBERS.get(type, ()) means an unknown/missing type keeps nothing but
    # "type" itself — never a guess at which members would have been valid. The
    # (still-broken) result is left for validate_plan to reject.
    unrecognized = normalize_emission(
        {"version": 1, "metric": "spend", "filters": {}, "range": {"type": "lastDays", "n": 7}}
    )
    assert unrecognized["range"] == {"type": "lastDays"}

    missing_type = normalize_emission(
        {"version": 1, "metric": "spend", "filters": {}, "range": {"n": 7}}
    )
    assert missing_type["range"] == {}


def test_normalize_leaves_non_dict_filters_and_range_untouched():
    # normalize_emission only descends into "filters"/"range" when they are dicts;
    # a malformed shape (e.g. the model emitting a string) is left alone for
    # validate_plan to reject, not coerced or dropped here.
    cleaned = normalize_emission(
        {"version": 1, "metric": "spend", "filters": "oops", "range": "oops"}
    )
    assert cleaned == {"version": 1, "metric": "spend", "filters": "oops", "range": "oops"}


def test_normalize_emission_does_not_mutate_its_input():
    # Task 9 hands the raw emission to normalize_emission and still reports the
    # original on failure, so cleaning has to be non-destructive. Every level
    # here carries a null and a foreign range member, so a normaliser that
    # edited in place would visibly shrink `raw`.
    raw = {
        "version": 1,
        "metric": "spend",
        "groupBy": None,
        "filters": {"categoryId": 4, "currency": None},
        "range": {"type": "yearToDate", "n": 12, "from": None},
    }
    before = deepcopy(raw)

    cleaned = normalize_emission(raw)

    assert raw == before, "normalize_emission edited the caller's dict"
    assert cleaned is not raw
    assert cleaned["filters"] is not raw["filters"]
    assert cleaned["range"] is not raw["range"]
    # And it did do its job, so the assertion above is not vacuous.
    assert "groupBy" not in cleaned
    assert cleaned["range"] == {"type": "yearToDate"}

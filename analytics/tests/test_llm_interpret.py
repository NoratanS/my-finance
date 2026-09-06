"""Prompt assembly, the single validation gate, and the retry-once-then-degrade path.

The client and the validator are both injected, so this runs in CI with no
model and no database (design delta D11).
"""

import json
from datetime import date

import pytest

from analytics.llm.client import OllamaError
from analytics.llm.interpret import (
    FEW_SHOT,
    CategoryRef,
    InterpretFailed,
    build_messages,
    interpret,
)
from analytics.llm.schema import PLAN_JSON_SCHEMA
from analytics.plan import GROUP_BYS, INTERVALS, METRICS, RANGE_TYPES, SUPPORTED_VERSIONS

TODAY = date(2026, 9, 4)
CATEGORIES = [CategoryRef(id=12, name="Groceries"), CategoryRef(id=14, name="Transport")]
GOOD_PLAN = {
    "version": 1,
    "metric": "spend",
    "filters": {"categoryId": 12, "includeDescendants": True},
    "interval": "month",
    "range": {"type": "lastMonths", "n": 12},
}


class FakeClient:
    """Returns queued emissions (or raises a queued exception), recording each call."""

    def __init__(self, *emissions):
        self.emissions = list(emissions)
        self.calls: list[list[dict]] = []

    def chat_json(self, messages, schema):
        assert schema is PLAN_JSON_SCHEMA
        self.calls.append(messages)
        emission = self.emissions.pop(0)
        if isinstance(emission, Exception):
            raise emission
        return emission


def accepts_everything(_plan):
    return []


def rejects_everything(_plan):
    return ["metric: unknown value"]


def test_the_prompt_carries_today_the_category_catalogue_and_the_few_shot_pairs():
    messages = build_messages("groceries", categories=CATEGORIES, current_plan=None, today=TODAY)

    system = messages[0]
    assert system["role"] == "system"
    assert "2026-09-04" in system["content"]
    assert "12: Groceries" in system["content"]
    assert "14: Transport" in system["content"]
    # system + one user/assistant pair per example + the question
    assert len(messages) == 1 + 2 * len(FEW_SHOT) + 1
    assert messages[-1] == {"role": "user", "content": "groceries"}


def test_a_follow_up_sends_the_current_plan_to_be_edited():
    messages = build_messages(
        "and only this year?", categories=CATEGORIES, current_plan=GOOD_PLAN, today=TODAY
    )

    last = messages[-1]["content"]
    assert json.dumps(GOOD_PLAN) in last
    assert "and only this year?" in last


def test_a_valid_emission_becomes_a_draft_with_a_category_note():
    client = FakeClient(GOOD_PLAN)

    draft = interpret(
        "monthly groceries",
        categories=CATEGORIES,
        current_plan=None,
        today=TODAY,
        client=client,
        validate=accepts_everything,
    )

    assert draft.plan == GOOD_PLAN
    assert len(client.calls) == 1
    assert draft.notes == [
        "Filtered to category 'Groceries' (id 12) — change the chip if that is the wrong one."
    ]


def test_the_emission_is_cleaned_before_it_is_validated():
    seen = []

    def record(plan):
        seen.append(plan)
        return []

    client = FakeClient({**GOOD_PLAN, "groupBy": None, "range": {"type": "all", "n": 12}})

    draft = interpret(
        "everything",
        categories=CATEGORIES,
        current_plan=None,
        today=TODAY,
        client=client,
        validate=record,
    )

    assert "groupBy" not in seen[0]
    assert seen[0]["range"] == {"type": "all"}
    assert draft.plan == seen[0]


def test_an_invalid_emission_is_retried_once_with_the_problems_quoted_back():
    client = FakeClient({"version": 1, "metric": "total"}, GOOD_PLAN)
    verdicts = [["metric: unknown value 'total'"], []]

    draft = interpret(
        "monthly groceries",
        categories=CATEGORIES,
        current_plan=None,
        today=TODAY,
        client=client,
        validate=lambda _plan: verdicts.pop(0),
    )

    assert len(client.calls) == 2
    retry_prompt = client.calls[1][-1]["content"]
    assert "metric: unknown value 'total'" in retry_prompt
    assert draft.plan == GOOD_PLAN
    assert draft.notes[0] == (
        "The first attempt was rejected (metric: unknown value 'total');"
        " this is the corrected plan."
    )


def test_two_invalid_emissions_surface_the_second_verdict_as_problems():
    client = FakeClient({"version": 1}, {"version": 2})
    verdicts = iter([["metric: unknown value"], ["range: from is after to"]])

    with pytest.raises(InterpretFailed) as raised:
        interpret(
            "gibberish",
            categories=CATEGORIES,
            current_plan=None,
            today=TODAY,
            client=client,
            validate=lambda _plan: next(verdicts),
        )

    # Two DISTINCT verdicts, so this cannot pass if the first were reported:
    # the user needs to see why the final attempt failed, not the first.
    assert raised.value.problems == ["range: from is after to"]
    assert len(client.calls) == 2


def test_an_unreachable_model_degrades_instead_of_exploding():
    client = FakeClient(OllamaError("chat call failed: connection refused"))

    with pytest.raises(InterpretFailed) as raised:
        interpret(
            "monthly groceries",
            categories=CATEGORIES,
            current_plan=None,
            today=TODAY,
            client=client,
            validate=accepts_everything,
        )

    assert "not reachable" in raised.value.problems[0]


def test_the_few_shot_examples_stay_inside_the_dsl():
    for _sentence, plan in FEW_SHOT:
        assert plan["version"] in SUPPORTED_VERSIONS
        assert plan["metric"] in METRICS
        assert plan.get("groupBy", None) in (*GROUP_BYS, None)
        assert plan.get("interval", None) in (*INTERVALS, None)
        assert plan["range"]["type"] in RANGE_TYPES


def test_an_ollama_error_on_the_retry_does_not_provoke_a_third_call():
    # The failure mode worth guarding: retrying on OllamaError as well as on a
    # validation verdict would make the loop unbounded exactly when the model is
    # down. FakeClient raises IndexError on a third call, so this pins the bound.
    client = FakeClient({"version": 1}, OllamaError("chat call failed: connection refused"))

    with pytest.raises(InterpretFailed) as raised:
        interpret(
            "monthly groceries",
            categories=CATEGORIES,
            current_plan=None,
            today=TODAY,
            client=client,
            validate=rejects_everything,
        )

    assert "not reachable" in raised.value.problems[0]
    assert len(client.calls) == 2


def test_a_profile_with_no_categories_still_builds_a_prompt():
    # A brand-new profile has an empty catalogue; the prompt must still be
    # well-formed rather than carrying an empty section the model has to guess at.
    messages = build_messages("monthly spending", categories=(), current_plan=None, today=TODAY)

    rendered = "\n".join(str(message["content"]) for message in messages)
    assert "(none yet)" in rendered

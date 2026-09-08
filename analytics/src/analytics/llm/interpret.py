"""Free text -> a draft plan, from one schema-constrained model call.

The model translates; it never queries and never computes (INSIGHTS.md ->
Principles, 2). Its emission is checked by the SAME validate_plan() the
executor runs (design delta D7) — passed in as a callable so the route can bind
it to the request's connection and profile, and so this module is testable with
neither a database nor a model.

An emission that fails validation is retried exactly once, with the problems
quoted back. A second failure raises InterpretFailed: the explorer opens on the
chips anyway, which is the whole point of the AI being an authoring layer
rather than a capability.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import date

from analytics.llm.client import OllamaClient, OllamaError
from analytics.llm.schema import PLAN_JSON_SCHEMA, normalize_emission

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class CategoryRef:
    """What the model is told about a profile: ids and names, nothing else."""

    id: int
    name: str


@dataclass(frozen=True)
class Draft:
    plan: dict
    notes: list[str]


class InterpretFailed(Exception):
    """No usable plan. Carries the problem list the caller returns to the UI."""

    def __init__(self, problems: list[str]) -> None:
        super().__init__("; ".join(problems))
        self.problems = list(problems)


SYSTEM = """You turn a personal-finance question into a query plan.

Answer with the plan JSON only — the response format is enforced, so emit no
prose and no explanation.

Rules:
- Today is {today}. Relative ranges are preferred over absolute dates.
- filters.categoryId must be one of the ids listed below, or left out entirely.
  The ids in the examples are made up; only the ids below exist.
- When you set filters.categoryId, set includeDescendants to true unless the
  question is explicitly about the category on its own.
- Never invent a merchant, an amount or a date that is not in the question.
- Leave a field out rather than guessing at it.

Categories in this profile (id: name):
{categories}"""


# Mirrors the first entries of the template gallery (frontend/src/insights/
# templates.ts) plus INSIGHTS.md's motivating query, so the model is shown the
# same vocabulary the chips teach by example. Keep the two in step.
FEW_SHOT: tuple[tuple[str, dict], ...] = (
    (
        "How much did I spend on Groceries each month over the last year?",
        {
            "version": 1,
            "metric": "spend",
            "filters": {"categoryId": 12, "includeDescendants": True},
            "interval": "month",
            "range": {"type": "lastMonths", "n": 12},
        },
    ),
    (
        "Where did my money go this month?",
        {
            "version": 1,
            "metric": "spend",
            "filters": {},
            "groupBy": "category",
            "range": {"type": "lastMonths", "n": 1},
        },
    ),
    (
        "Am I saving anything this year?",
        {
            "version": 1,
            "metric": "net",
            "filters": {},
            "interval": "month",
            "range": {"type": "yearToDate"},
        },
    ),
    (
        "monthly grocery spend, Lidl vs Biedronka, last 12 months",
        {
            "version": 1,
            "metric": "spend",
            "filters": {
                "categoryId": 12,
                "includeDescendants": True,
                "merchants": ["Lidl", "Biedronka"],
            },
            "groupBy": "merchant",
            "interval": "month",
            "range": {"type": "lastMonths", "n": 12},
        },
    ),
)


def build_messages(
    text: str,
    *,
    categories: Sequence[CategoryRef],
    current_plan: dict | None,
    today: date,
) -> list[dict]:
    """System rules + category catalogue + few-shot pairs + the question."""
    catalogue = "\n".join(f"{c.id}: {c.name}" for c in categories) or "(none yet)"
    messages: list[dict] = [
        {"role": "system", "content": SYSTEM.format(today=today.isoformat(), categories=catalogue)}
    ]
    for question, plan in FEW_SHOT:
        messages.append({"role": "user", "content": question})
        messages.append({"role": "assistant", "content": json.dumps(plan)})

    if current_plan is None:
        messages.append({"role": "user", "content": text})
    else:
        # Editing a JSON object is far more reliable for a small model than
        # re-deriving one (INSIGHTS.md -> "Refinement edits structured state").
        messages.append(
            {
                "role": "user",
                "content": (
                    f"Current plan:\n{json.dumps(current_plan)}\n\n"
                    f"Apply this change and return the whole plan:\n{text}"
                ),
            }
        )
    return messages


def interpret(
    text: str,
    *,
    categories: Sequence[CategoryRef],
    current_plan: dict | None,
    today: date,
    client: OllamaClient,
    validate: Callable[[object], list[str]],
) -> Draft:
    """One call, one retry, then give up and let the chips take over."""
    messages = build_messages(text, categories=categories, current_plan=current_plan, today=today)
    emission = _emit(client, messages)
    notes: list[str] = []

    problems = validate(emission)
    if problems:
        messages = [
            *messages,
            {"role": "assistant", "content": json.dumps(emission)},
            {
                "role": "user",
                "content": (
                    "That plan was rejected: " + "; ".join(problems)
                    + ". Return a corrected plan."
                ),
            },
        ]
        emission = _emit(client, messages)
        retry_problems = validate(emission)
        if retry_problems:
            raise InterpretFailed(retry_problems)
        notes.append(
            "The first attempt was rejected (" + "; ".join(problems)
            + "); this is the corrected plan."
        )

    notes.extend(_category_note(emission, categories))
    # `validate` is validate_plan (or a partial of it), which rejects a non-dict emission
    # as a problem string — reaching here with no unhandled problems means emission is a dict.
    assert isinstance(emission, dict)
    return Draft(plan=emission, notes=notes)


def _emit(client: OllamaClient, messages: list[dict]) -> object:
    try:
        return normalize_emission(client.chat_json(messages, PLAN_JSON_SCHEMA))
    except OllamaError as exc:
        # C6: the exception text (errno/DNS detail, or a raw model response embedded by
        # client.py) is diagnostic, not user-facing prose (docs/API.md "Errors": problems
        # strings are "safe to show a user"). Keep it out of InterpretFailed's problems and
        # log it here instead, with the exception attached, so it's still findable server-side.
        logger.warning("interpret: the language model call failed", exc_info=exc)
        raise InterpretFailed(["the language model is not reachable right now"]) from exc


def _category_note(plan: object, categories: Sequence[CategoryRef]) -> list[str]:
    """Name the category the model picked, so a wrong guess is obvious in the UI."""
    if not isinstance(plan, dict):
        return []
    filters = plan.get("filters")
    category_id = filters.get("categoryId") if isinstance(filters, dict) else None
    name = next((c.name for c in categories if c.id == category_id), None)
    if name is None:
        return []
    return [
        f"Filtered to category '{name}' (id {category_id}) —"
        " change the chip if that is the wrong one."
    ]

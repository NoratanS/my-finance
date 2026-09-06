"""Sentence -> plan against a REAL model. Local only (design delta D11).

CI never pulls or runs a model: everything here is skipped unless
RUN_LLM_GOLDEN=1, which only scripts/golden-llm.sh sets. Run it before merging
Phase 5 work, and again after an Ollama or model upgrade — small models are not
bit-stable across releases, and a regression there is caught here or nowhere.

This suite measures the MODEL, so the validator is deliberately a no-op: a plan
that misses is a failed assertion, not a silent retry. It needs no database
either — validate_plan()'s only DB-dependent check is that a categoryId exists
for the profile, which is not what this suite is about (that's covered, with a
real connection, by test_validation.py). A stub that accepts everything keeps
this suite honest about what it measures: emission quality, not the retry path
(covered without a model by test_llm_interpret.py) or category existence.
"""

from __future__ import annotations

import json
import os
from datetime import date
from pathlib import Path

import pytest

from analytics.config import get_settings
from analytics.llm.client import OllamaClient
from analytics.llm.interpret import CategoryRef, interpret

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_LLM_GOLDEN") != "1",
    reason="needs a real Ollama; run analytics/scripts/golden-llm.sh",
)

FIXTURES = json.loads(
    (Path(__file__).parent / "fixtures" / "golden_llm" / "sentences.json").read_text(
        encoding="utf-8"
    )
)
CATEGORIES = [CategoryRef(id=c["id"], name=c["name"]) for c in FIXTURES["categories"]]
TODAY = date.fromisoformat(FIXTURES["today"])


@pytest.mark.parametrize(
    "case", FIXTURES["cases"], ids=[case["sentence"][:40] for case in FIXTURES["cases"]]
)
def test_a_sentence_becomes_the_expected_plan(case):
    settings = get_settings()
    client = OllamaClient(base_url=settings.ollama_url, model=settings.ollama_model)

    draft = interpret(
        case["sentence"],
        categories=CATEGORIES,
        current_plan=case.get("currentPlan"),
        today=TODAY,
        client=client,
        validate=lambda _plan: [],
    )

    # Dict equality: key order is the model's business, content is ours. Both sides have
    # already been through normalize_emission (the model's side inside interpret(), the
    # fixture's side by hand when it was written) so this is a content comparison, not a
    # formatting one.
    assert draft.plan == case["plan"]

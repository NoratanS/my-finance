"""Real-model narration checks. Never run in CI (design delta D11).

    cd analytics && OLLAMA_URL=http://localhost:11434 \
        uv run pytest tests/test_llm_narration_local.py -v

CI runs the stubbed tests (test_llm_narrate*.py): a multi-gigabyte pull plus CPU
inference on every PR is minutes of runtime, and small models are not bit-stable
across releases — the classic route to a permanently red job everyone ignores.
The accepted risk is that an Ollama or model upgrade regresses narration and
only this suite notices, so run it before merging Phase 5 work and after
changing OLLAMA_MODEL.

These assertions are about the *model*, not the guard. `narrate` cannot return
an ungrounded caption by construction — it rejects, retries, then falls back —
so asserting that its output is grounded would pass forever. Instead the first
test calls the model directly and checks its raw answer, and the second checks
that the pipeline did not have to fall back.

Gated the same way as test_llm_golden.py (Task 13, MY-37): a module-level
`skipif` on RUN_LLM_GOLDEN, not a pytest marker. A marker plus `addopts` was
considered and rejected there because an env gate keeps the suite skipped
everywhere by default without every invocation needing `-m 'not ...'` added —
this suite reuses that same gate rather than inventing a second opt-in
mechanism for the same kind of model-dependent test.
"""

import os

import pytest
from envelopes import ALL_ENVELOPES

from analytics.config import get_settings
from analytics.llm.client import get_ollama_client
from analytics.llm.narrate import (
    build_narration_prompt,
    fallback_caption,
    first_sentence,
    narrate,
    narration_facts,
    ungrounded_numbers,
)

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_LLM_GOLDEN") != "1",
    reason="needs a live Ollama; see analytics/README.md, 'The local narration benchmark'",
)

IDS = ["value", "timeseries", "breakdown", "split"]


@pytest.fixture(scope="module")
def generate():
    client = get_ollama_client(get_settings())
    if client is None:
        pytest.skip("OLLAMA_URL is not set; nothing to benchmark")
    return client.generate


@pytest.mark.parametrize("envelope", ALL_ENVELOPES, ids=IDS)
def test_the_model_narrates_without_inventing_numbers(envelope, generate):
    facts = narration_facts(envelope)
    payload = {"envelope": envelope, "facts": facts}
    caption = first_sentence(generate(build_narration_prompt(payload)))
    assert caption != ""
    bad = ungrounded_numbers(caption, payload)
    # The list of offending tokens, not just pass/fail: "invented a percentage
    # that wasn't in the facts" tells Task 22 more about a candidate model
    # than "failed" does.
    assert bad == [], f"{caption!r} invented: {bad}"


@pytest.mark.parametrize("envelope", ALL_ENVELOPES, ids=IDS)
def test_the_model_beats_the_computed_caption(envelope, generate):
    facts = narration_facts(envelope)
    caption = narrate(envelope, generate=generate)
    assert caption != fallback_caption(facts), "the pipeline degraded — the model failed twice"

"""The narration pipeline with the model stubbed (D11 — CI never runs a model).

What is asserted here is the contract around the model, not the model: a
grounded answer is passed through untouched, an ungrounded one buys exactly one
retry that names the offending tokens, and anything worse degrades to the
sentence Python writes itself.
"""

import pytest
from envelopes import BREAKDOWN_ENVELOPE, VALUE_ENVELOPE

from analytics.llm.narrate import (
    build_narration_prompt,
    fallback_caption,
    first_sentence,
    narrate,
    narration_facts,
)


class StubModel:
    """Stands in for OllamaClient.generate: canned answers, recorded prompts."""

    def __init__(self, *answers: str):
        self.answers = list(answers)
        self.prompts: list[str] = []

    def __call__(self, prompt: str) -> str:
        self.prompts.append(prompt)
        return self.answers.pop(0) if self.answers else ""


class ExplodingModel:
    def __init__(self):
        self.calls = 0

    def __call__(self, prompt: str) -> str:
        self.calls += 1
        raise ConnectionError("connection refused")


def test_a_grounded_caption_is_returned_verbatim():
    model = StubModel("Lidl leads at 2793.48 PLN, 31.6% above Biedronka.")
    assert narrate(BREAKDOWN_ENVELOPE, generate=model) == (
        "Lidl leads at 2793.48 PLN, 31.6% above Biedronka."
    )
    assert len(model.prompts) == 1


def test_an_invented_number_buys_exactly_one_retry_that_names_it():
    model = StubModel(
        "Lidl leads at 2800.00 PLN, 40% above Biedronka.",
        "Lidl leads at 2793.48 PLN, 31.6% above Biedronka.",
    )
    assert narrate(BREAKDOWN_ENVELOPE, generate=model) == (
        "Lidl leads at 2793.48 PLN, 31.6% above Biedronka."
    )
    assert len(model.prompts) == 2
    assert "2800.00" in model.prompts[1]
    assert "40" in model.prompts[1]


def test_two_ungrounded_answers_degrade_to_the_computed_caption():
    model = StubModel("Lidl spent 2800.00 PLN.", "Lidl spent 2900.00 PLN.")
    assert narrate(BREAKDOWN_ENVELOPE, generate=model) == fallback_caption(
        narration_facts(BREAKDOWN_ENVELOPE)
    )
    assert len(model.prompts) == 2


def test_an_empty_answer_degrades_too():
    model = StubModel("", "   ")
    assert narrate(VALUE_ENVELOPE, generate=model) == "PLN total 1243.50."


def test_an_unreachable_model_degrades_without_a_second_attempt():
    model = ExplodingModel()
    assert narrate(VALUE_ENVELOPE, generate=model) == "PLN total 1243.50."
    assert model.calls == 1


def test_no_model_configured_never_calls_out():
    assert narrate(VALUE_ENVELOPE, generate=None) == "PLN total 1243.50."


def test_the_prompt_carries_the_data_and_forbids_arithmetic():
    facts = narration_facts(BREAKDOWN_ENVELOPE)
    prompt = build_narration_prompt({"envelope": BREAKDOWN_ENVELOPE, "facts": facts})
    assert '"2793.4800"' in prompt
    assert '"topGapPct": "31.6"' in prompt or '"topGapPct":"31.6"' in prompt
    assert "Never add, subtract, average, round or otherwise compute" in prompt
    assert "thousands separators" in prompt


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ('"Lidl leads."\n', "Lidl leads."),
        ("Lidl leads.\nAnd another thought.", "Lidl leads."),
        ("   ", ""),
    ],
)
def test_the_answer_is_trimmed_to_one_line(raw, expected):
    assert first_sentence(raw) == expected

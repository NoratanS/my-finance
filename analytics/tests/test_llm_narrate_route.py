"""POST /internal/v1/narrate — numbers in, one sentence out.

No database and no profile id: everything this route can say was already
computed by /internal/v1/execute. Every case goes through TestClient and
`app.dependency_overrides[get_ollama_client]`, the one documented override
point (also used by test_llm_capabilities.py and test_llm_interpret_route.py),
so no test contacts a real Ollama (D11).
"""

import pytest
from envelopes import BREAKDOWN_ENVELOPE, VALUE_ENVELOPE
from fastapi.testclient import TestClient

from analytics.config import get_settings
from analytics.llm.client import get_ollama_client
from analytics.main import app


@pytest.fixture
def client():
    app.dependency_overrides[get_ollama_client] = lambda: None
    yield TestClient(app)
    app.dependency_overrides.clear()


def auth() -> dict:
    return {"Authorization": f"Bearer {get_settings().analytics_token}"}


def test_narrate_requires_the_bearer_token(client):
    response = client.post("/internal/v1/narrate", json={"envelope": VALUE_ENVELOPE})
    assert response.status_code == 401


def test_the_route_captions_without_a_model(client):
    response = client.post(
        "/internal/v1/narrate", json={"envelope": VALUE_ENVELOPE}, headers=auth()
    )

    assert response.status_code == 200
    assert response.json() == {"caption": "PLN total 1243.50."}


def test_the_route_uses_the_model_when_one_is_configured(client):
    answer = "Lidl leads at 2793.48 PLN, 31.6% above Biedronka."
    app.dependency_overrides[get_ollama_client] = lambda: FakeOllama(answer)

    response = client.post(
        "/internal/v1/narrate", json={"envelope": BREAKDOWN_ENVELOPE}, headers=auth()
    )

    assert response.status_code == 200
    assert response.json() == {"caption": answer}


def test_a_model_that_invents_a_number_cannot_reach_the_response(client):
    app.dependency_overrides[get_ollama_client] = lambda: FakeOllama("Lidl spent 9999.00 PLN.")

    response = client.post(
        "/internal/v1/narrate", json={"envelope": BREAKDOWN_ENVELOPE}, headers=auth()
    )

    assert response.status_code == 200
    caption = response.json()["caption"]
    assert "9999.00" not in caption
    assert caption == "PLN total 4916.64, led by Lidl at 2793.48."


def test_a_model_that_raises_still_gets_the_computed_caption(client):
    """`narrate` swallows the exception (analytics/src/analytics/llm/narrate.py) and
    degrades to fallback_caption; this proves it never reaches the app-wide 500
    handler on this route."""
    app.dependency_overrides[get_ollama_client] = lambda: FakeOllama(raises=True)

    response = client.post(
        "/internal/v1/narrate", json={"envelope": VALUE_ENVELOPE}, headers=auth()
    )

    assert response.status_code == 200
    assert response.json() == {"caption": "PLN total 1243.50."}


def test_an_empty_envelope_still_gets_a_sentence_not_a_500(client):
    response = client.post("/internal/v1/narrate", json={"envelope": {}}, headers=auth())

    assert response.status_code == 200
    assert response.json() == {"caption": "No data for this plan."}


class FakeOllama:
    def __init__(self, answer: str = "", *, raises: bool = False) -> None:
        self._answer = answer
        self._raises = raises

    def generate(self, prompt: str) -> str:
        if self._raises:
            raise RuntimeError("the ai profile fell over mid-generation")
        return self._answer

"""GET /internal/v1/capabilities in every state, with the Ollama client stubbed.

Bearer auth is Stage 1's contract and is covered by the execute tests
(test_execute.py); the state tests below override it so the capability logic
is the only thing under test. The auth tests at the bottom exercise the real
dependency, the same way test_execute.py does, to prove this route carries
the same bearer requirement as every other /internal/v1/* route.

Nothing here reaches a real Ollama (design delta D11): the "unreachable" case
uses httpx.MockTransport, exactly as analytics/tests/test_llm_client.py does,
and the other cases use a stub with no HTTP client at all.
"""

import httpx
import pytest
from fastapi.testclient import TestClient

from analytics.auth import require_token
from analytics.llm.client import OllamaClient, get_ollama_client
from analytics.main import app


class StubOllama:
    def __init__(self, model: str, present: bool) -> None:
        self.model = model
        self._present = present

    def has_model(self) -> bool:
        return self._present


@pytest.fixture
def client():
    app.dependency_overrides[require_token] = lambda: None
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_interpret_is_false_when_ollama_url_is_unset(client):
    app.dependency_overrides[get_ollama_client] = lambda: None

    response = client.get("/internal/v1/capabilities")

    assert response.status_code == 200
    assert response.json() == {"interpret": False, "model": None}


def test_interpret_is_false_when_the_model_is_not_pulled_yet(client):
    app.dependency_overrides[get_ollama_client] = lambda: StubOllama("qwen3:4b", present=False)

    response = client.get("/internal/v1/capabilities")

    assert response.status_code == 200
    assert response.json() == {"interpret": False, "model": None}


def test_interpret_is_true_and_names_the_model_when_it_is_present(client):
    app.dependency_overrides[get_ollama_client] = lambda: StubOllama("qwen3:4b", present=True)

    response = client.get("/internal/v1/capabilities")

    assert response.status_code == 200
    assert response.json() == {"interpret": True, "model": "qwen3:4b"}


def test_interpret_is_false_when_ollama_is_unreachable(client):
    """Configured but the container is absent or not answering: has_model() swallows the
    connection error and returns False (analytics/src/analytics/llm/client.py), so this
    is a 200, not a 500 — a capability probe that throws breaks the dashboard."""

    def refuse(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("name or service not known", request=request)

    real_client = OllamaClient(
        "http://ollama:11434",
        "qwen3:4b",
        client=httpx.Client(transport=httpx.MockTransport(refuse), base_url="http://ollama:11434"),
    )
    app.dependency_overrides[get_ollama_client] = lambda: real_client

    response = client.get("/internal/v1/capabilities")

    assert response.status_code == 200
    assert response.json() == {"interpret": False, "model": None}


# No require_token override below: these exercise the real bearer dependency, the same
# way test_execute.py's auth tests do for POST /internal/v1/execute.
unauthenticated_client = TestClient(app)


def test_capabilities_rejects_a_request_with_no_token():
    response = unauthenticated_client.get("/internal/v1/capabilities")

    assert response.status_code == 401


def test_capabilities_rejects_a_wrong_token():
    response = unauthenticated_client.get(
        "/internal/v1/capabilities",
        headers={"Authorization": "Bearer not-the-token"},
    )

    assert response.status_code == 401

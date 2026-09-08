"""POST /internal/v1/interpret — wiring, auth, degradation, and profile scoping.

The model is overridden away; the database is real (the categories the prompt
carries come from it), so this uses the migrated container the executor tests
already run against.
"""

import uuid

import pytest
from fastapi.testclient import TestClient

from analytics.config import get_settings
from analytics.db import get_conn
from analytics.llm.client import OllamaError, get_ollama_client
from analytics.main import app

GOOD_EMISSION = {
    "version": 1,
    "metric": "spend",
    "filters": {"categoryId": None, "includeDescendants": True},
    "interval": "month",
    "range": {"type": "lastMonths", "n": 12},
}


class FakeClient:
    def __init__(self, *emissions):
        self.emissions = list(emissions)
        self.calls: list[list[dict]] = []

    def chat_json(self, messages, schema):
        self.calls.append(messages)
        return self.emissions.pop(0)


@pytest.fixture
def profile(conn):
    """A user, a profile and two categories, created straight through SQL."""
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO app_user (email, password_hash, display_name)"
            " VALUES (%s, 'x', 'Kasia') RETURNING id",
            (f"interpret-{uuid.uuid4()}@example.com",),
        )
        user_id = cur.fetchone()[0]
        cur.execute(
            "INSERT INTO profile (user_id, name, default_currency)"
            " VALUES (%s, 'Personal', 'PLN') RETURNING id",
            (user_id,),
        )
        profile_id = cur.fetchone()[0]
        cur.execute(
            "INSERT INTO category (profile_id, parent_id, name)"
            " VALUES (%s, NULL, 'Groceries') RETURNING id",
            (profile_id,),
        )
        groceries = cur.fetchone()[0]
        cur.execute(
            "INSERT INTO category (profile_id, parent_id, name) VALUES (%s, NULL, 'Transport')",
            (profile_id,),
        )
    conn.commit()
    return {"id": profile_id, "groceries": groceries}


@pytest.fixture
def client(conn):
    app.dependency_overrides[get_conn] = lambda: conn
    yield TestClient(app)
    app.dependency_overrides.clear()


def auth() -> dict:
    return {"Authorization": f"Bearer {get_settings().analytics_token}"}


def use_model(fake: FakeClient) -> None:
    app.dependency_overrides[get_ollama_client] = lambda: fake


def test_a_sentence_comes_back_as_a_draft_plan_with_notes(client, profile):
    filters = {"categoryId": profile["groceries"], "includeDescendants": True}
    use_model(FakeClient({**GOOD_EMISSION, "filters": filters}))

    response = client.post(
        "/internal/v1/interpret",
        json={"profileId": profile["id"], "text": "monthly groceries", "currentPlan": None},
        headers=auth(),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["plan"]["metric"] == "spend"
    assert body["plan"]["filters"]["categoryId"] == profile["groceries"]
    assert "Groceries" in body["notes"][0]


def test_the_prompt_only_ever_lists_the_requested_profiles_categories(client, profile, conn):
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO app_user (email, password_hash, display_name)"
            " VALUES (%s, 'x', 'Other') RETURNING id",
            (f"other-{uuid.uuid4()}@example.com",),
        )
        other_user = cur.fetchone()[0]
        cur.execute(
            "INSERT INTO profile (user_id, name, default_currency)"
            " VALUES (%s, 'Other', 'EUR') RETURNING id",
            (other_user,),
        )
        other_profile = cur.fetchone()[0]
        cur.execute(
            "INSERT INTO category (profile_id, parent_id, name) VALUES (%s, NULL, 'Their Secrets')",
            (other_profile,),
        )
    conn.commit()
    fake = FakeClient({**GOOD_EMISSION, "filters": {}})
    use_model(fake)

    client.post(
        "/internal/v1/interpret",
        json={"profileId": profile["id"], "text": "anything", "currentPlan": None},
        headers=auth(),
    )

    system = fake.calls[0][0]["content"]
    assert "Groceries" in system
    assert "Their Secrets" not in system


def test_two_rejected_emissions_are_422_with_a_bare_problems_array(client, profile):
    bad = {
        "version": 1,
        "metric": "spend",
        "filters": {"categoryId": 999999},
        "range": {"type": "all"},
    }
    use_model(FakeClient(bad, bad))

    response = client.post(
        "/internal/v1/interpret",
        json={"profileId": profile["id"], "text": "nonsense", "currentPlan": None},
        headers=auth(),
    )

    assert response.status_code == 422
    assert response.json()["problems"]
    assert "detail" not in response.json()


def test_an_unreachable_model_does_not_leak_errno_or_exception_text(client, profile):
    # Live repro (C6): a DNS/connect failure inside chat_json used to surface as
    # problems: ["... [Errno -3] Temporary failure in name resolution)"]. Assert the
    # whole response body is clean, not just that some problems array came back.
    class UnreachableClient:
        def chat_json(self, messages, schema):
            raise OllamaError("chat call failed: [Errno -3] Temporary failure in name resolution")

    use_model(UnreachableClient())

    response = client.post(
        "/internal/v1/interpret",
        json={
            "profileId": profile["id"],
            "text": "how much did I spend on groceries",
            "currentPlan": None,
        },
        headers=auth(),
    )

    assert response.status_code == 422
    assert "Errno" not in response.text
    assert "name resolution" not in response.text


def test_interpretation_is_unavailable_when_no_model_is_configured(client, profile):
    app.dependency_overrides[get_ollama_client] = lambda: None

    response = client.post(
        "/internal/v1/interpret",
        json={"profileId": profile["id"], "text": "anything", "currentPlan": None},
        headers=auth(),
    )

    assert response.status_code == 422
    assert response.json()["problems"] == ["interpretation is not available on this instance"]


def test_the_route_needs_the_bearer_token(client, profile):
    use_model(FakeClient(GOOD_EMISSION))

    response = client.post(
        "/internal/v1/interpret",
        json={"profileId": profile["id"], "text": "anything", "currentPlan": None},
    )

    assert response.status_code == 401

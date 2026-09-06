"""The app-wide handler for anything with no more specific handler (main.py,
`unexpected_error_handler`).

Two different routes on purpose: the point of one app-level handler is that it
covers every route, not just the one where the gap was first noticed. One test
breaks /execute at the database, the other breaks /interpret at the model
client with something other than OllamaError.

TestClient re-raises an exception that reaches Starlette's ServerErrorMiddleware
even when a handler produced a response for it (it sends the response, then
re-raises so a real ASGI server still logs it) — raise_server_exceptions=False
is what lets these tests see the response instead of the exception.
"""

import uuid

import pytest
from fastapi.testclient import TestClient

from analytics.config import get_settings
from analytics.db import get_conn
from analytics.llm.client import get_ollama_client
from analytics.main import app

AUGUST_GROCERIES = {
    "version": 1,
    "metric": "spend",
    "filters": {"categoryId": 10, "includeDescendants": True, "currency": "PLN"},
    "groupBy": None,
    "interval": None,
    "range": {"type": "absolute", "from": "2026-08-01", "to": "2026-08-31"},
}


def auth() -> dict:
    return {"Authorization": f"Bearer {get_settings().analytics_token}"}


@pytest.fixture
def client():
    test_client = TestClient(app, raise_server_exceptions=False)
    yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def profile(conn):
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO app_user (email, password_hash, display_name)"
            " VALUES (%s, 'x', 'Kasia') RETURNING id",
            (f"error-handling-{uuid.uuid4()}@example.com",),
        )
        user_id = cur.fetchone()[0]
        cur.execute(
            "INSERT INTO profile (user_id, name, default_currency)"
            " VALUES (%s, 'Personal', 'PLN') RETURNING id",
            (user_id,),
        )
        profile_id = cur.fetchone()[0]
    conn.commit()
    return {"id": profile_id}


class ExplodingConn:
    """Stands in for a dropped connection or a psycopg error mid-query."""

    def cursor(self):
        raise RuntimeError("SELECT 1 FROM txn WHERE profile_id=42: connection lost")


class BrokenModelClient:
    """Raises something that is not OllamaError -- a bug, not a reachability problem."""

    def chat_json(self, messages, schema):
        raise RuntimeError("a bug in the client, not an unreachable model")


def test_a_database_error_on_execute_is_a_500_with_problems(client):
    app.dependency_overrides[get_conn] = lambda: ExplodingConn()

    response = client.post(
        "/internal/v1/execute",
        headers=auth(),
        json={"profileId": 1, "plan": AUGUST_GROCERIES},
    )

    assert response.status_code == 500
    assert response.json() == {"problems": ["an unexpected error occurred"]}


def test_a_non_ollama_error_from_the_model_on_interpret_is_a_500_with_problems(
    client, conn, profile
):
    app.dependency_overrides[get_conn] = lambda: conn
    app.dependency_overrides[get_ollama_client] = lambda: BrokenModelClient()

    response = client.post(
        "/internal/v1/interpret",
        headers=auth(),
        json={"profileId": profile["id"], "text": "anything", "currentPlan": None},
    )

    assert response.status_code == 500
    assert response.json() == {"problems": ["an unexpected error occurred"]}


def test_the_response_never_repeats_the_exception_message(client):
    app.dependency_overrides[get_conn] = lambda: ExplodingConn()

    response = client.post(
        "/internal/v1/execute",
        headers=auth(),
        json={"profileId": 1, "plan": AUGUST_GROCERIES},
    )

    assert "connection lost" not in response.text
    assert "txn" not in response.text


def test_the_exception_is_logged_server_side(client, caplog):
    app.dependency_overrides[get_conn] = lambda: ExplodingConn()

    with caplog.at_level("ERROR"):
        client.post(
            "/internal/v1/execute",
            headers=auth(),
            json={"profileId": 1, "plan": AUGUST_GROCERIES},
        )

    assert any("connection lost" in record.exc_text for record in caplog.records
               if record.exc_text)

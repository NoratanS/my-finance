"""The app-wide handler for anything with no more specific handler (main.py,
`unexpected_error_handler`).

TestClient re-raises an exception that reaches Starlette's ServerErrorMiddleware
even when a handler produced a response for it (it sends the response, then
re-raises so a real ASGI server still logs it) — raise_server_exceptions=False
is what lets these tests see the response instead of the exception.
"""

import pytest
from fastapi.testclient import TestClient

from analytics.config import get_settings
from analytics.db import get_conn
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


class ExplodingConn:
    """Stands in for a dropped connection or a psycopg error mid-query."""

    def cursor(self):
        raise RuntimeError("SELECT 1 FROM txn WHERE profile_id=42: connection lost")


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

    assert any("connection lost" in record.exc_text for record in caplog.records if record.exc_text)

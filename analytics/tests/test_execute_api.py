"""The route. Absolute ranges only: a handler that reads its own clock would otherwise make
these assertions change on the first of every month."""

from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from analytics.config import get_settings
from analytics.db import get_conn
from analytics.main import app

HEADERS = {"Authorization": "Bearer test-token"}

AUGUST_GROCERIES = {
    "version": 1,
    "metric": "spend",
    "filters": {"categoryId": 10, "includeDescendants": True, "currency": "PLN"},
    "groupBy": None,
    "interval": None,
    "range": {"type": "absolute", "from": "2026-08-01", "to": "2026-08-31"},
}


@pytest.fixture
def client(conn):
    app.dependency_overrides[get_conn] = lambda: conn
    app.dependency_overrides[get_settings] = lambda: SimpleNamespace(
        tz="UTC", analytics_token="test-token")
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def test_executes_a_plan_and_returns_the_envelope(client):
    response = client.post("/internal/v1/execute", headers=HEADERS,
                           json={"profileId": 1, "plan": AUGUST_GROCERIES})
    assert response.status_code == 200
    assert response.json()["results"] == [
        {"currency": "PLN", "shape": "value", "value": "200.0000"}]
    assert response.json()["meta"] == {"truncatedGroups": False}


def test_the_profile_id_scopes_the_query(client):
    """Profile 2 owns no category 10, so the same plan is a plan problem there — the id the
    backend forwards is the only thing that decides what is visible."""
    response = client.post("/internal/v1/execute", headers=HEADERS,
                           json={"profileId": 2, "plan": AUGUST_GROCERIES})
    assert response.status_code == 400
    assert response.json() == {
        "problems": ["filters.categoryId: 10 does not exist in this profile"]}


def test_a_rejected_plan_is_a_400_with_problems(client):
    response = client.post("/internal/v1/execute", headers=HEADERS,
                           json={"profileId": 1,
                                 "plan": {"version": 7, "metric": "spend",
                                          "range": {"type": "all"}}})
    assert response.status_code == 400
    assert response.json() == {"problems": ["version: unsupported plan version 7"]}


def test_a_body_that_is_not_a_plan_object_is_a_400_with_problems(client):
    response = client.post("/internal/v1/execute", headers=HEADERS,
                           json={"profileId": 1, "plan": "spend everything"})
    assert response.status_code == 400
    assert response.json() == {"problems": ["plan: must be a JSON object"]}


def test_the_bearer_token_is_required(client):
    response = client.post("/internal/v1/execute",
                           json={"profileId": 1, "plan": AUGUST_GROCERIES})
    assert response.status_code == 401

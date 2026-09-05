from fastapi.testclient import TestClient

from analytics.main import app

client = TestClient(app)

PLAN_REQUEST = {"profileId": 3, "plan": {"version": 1, "metric": "spend"}}


def test_execute_rejects_a_request_with_no_token():
    response = client.post("/internal/v1/execute", json=PLAN_REQUEST)

    assert response.status_code == 401


def test_execute_rejects_a_wrong_token():
    response = client.post(
        "/internal/v1/execute",
        json=PLAN_REQUEST,
        headers={"Authorization": "Bearer not-the-token"},
    )

    assert response.status_code == 401


def test_execute_accepts_the_token_and_answers_with_the_problems_shape(monkeypatch):
    monkeypatch.setenv("ANALYTICS_TOKEN", "token-under-test")

    response = client.post(
        "/internal/v1/execute",
        json=PLAN_REQUEST,
        headers={"Authorization": "Bearer token-under-test"},
    )

    assert response.status_code == 400
    assert response.json() == {"problems": ["the plan executor is not implemented yet"]}


def test_health_still_needs_no_token():
    response = client.get("/internal/health")

    assert response.status_code == 200

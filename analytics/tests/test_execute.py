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

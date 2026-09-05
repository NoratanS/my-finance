from fastapi.testclient import TestClient

from analytics.main import app

client = TestClient(app)


def test_health_answers_ok_without_a_token():
    response = client.get("/internal/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

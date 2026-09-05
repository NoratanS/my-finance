"""FastAPI app for the analytics service (docs/INSIGHTS.md → "The analytics service")."""

from fastapi import FastAPI

app = FastAPI(title="my-finance analytics")


@app.get("/internal/health")
def health() -> dict[str, str]:
    """Liveness for the compose healthcheck. Deliberately unauthenticated, for
    the same reason as the backend's /actuator/health: it reveals liveness, not
    data, and a healthcheck command must not carry a secret."""
    return {"status": "ok"}

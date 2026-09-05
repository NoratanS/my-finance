"""FastAPI app for the analytics service (docs/INSIGHTS.md → "The analytics service")."""

from fastapi import Depends, FastAPI

from analytics.auth import require_token

app = FastAPI(title="my-finance analytics")


@app.get("/internal/health")
def health() -> dict[str, str]:
    """Liveness for the compose healthcheck. Deliberately unauthenticated, for
    the same reason as the backend's /actuator/health: it reveals liveness, not
    data, and a healthcheck command must not carry a secret."""
    return {"status": "ok"}


@app.post("/internal/v1/execute", status_code=400, dependencies=[Depends(require_token)])
def execute() -> dict[str, list[str]]:
    """Placeholder for the plan executor: the contract's 400 problems shape,
    wired end to end so the backend and the explorer can be built against it.
    The request body is deliberately not modelled here — plan validation belongs
    to the executor, and a model at this layer would answer a malformed body
    with FastAPI's 422 shape instead of the contract's problems array."""
    return {"problems": ["the plan executor is not implemented yet"]}

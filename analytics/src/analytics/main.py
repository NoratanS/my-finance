"""FastAPI app for the analytics service (docs/INSIGHTS.md → "The analytics service")."""

import logging
from typing import Annotated, Any

import psycopg
from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from analytics.auth import require_token
from analytics.config import Settings, get_settings, today
from analytics.db import get_conn
from analytics.executor import PlanProblems, execute

logger = logging.getLogger(__name__)

app = FastAPI(title="my-finance analytics")


@app.get("/internal/health")
def health() -> dict[str, str]:
    """Liveness for the compose healthcheck. Deliberately unauthenticated, for
    the same reason as the backend's /actuator/health: it reveals liveness, not
    data, and a healthcheck command must not carry a secret."""
    return {"status": "ok"}


class ExecuteRequest(BaseModel):
    profile_id: int = Field(alias="profileId")
    # Any, not a model: the plan's own validator owns every rule about its shape (spec D7).
    # Two reasons it stays that way, neither of them "Pydantic can only report one error" —
    # it collects them all via ValidationError.errors():
    #   1. The problem strings are API contract. docs/API.md and docs/INSIGHTS.md pin the exact
    #      wording ("version: unsupported plan version 99") and tests assert it verbatim.
    #   2. Some rules need the database. validate_plan takes a connection because "categoryId
    #      exists in this profile" cannot be decided from the payload alone.
    plan: Any


@app.exception_handler(PlanProblems)
async def plan_problems_handler(request: Request, exc: PlanProblems) -> JSONResponse:
    """A rejected plan is a 400 problem list, which the backend re-raises as
    /errors/invalid-plan (docs/API.md → POST /api/insights/execute)."""
    return JSONResponse(status_code=400, content={"problems": exc.problems})


@app.exception_handler(Exception)
async def unexpected_error_handler(request: Request, exc: Exception) -> JSONResponse:
    """Every route's safety net: anything with no more specific handler — a DB error, a
    bug — becomes this instead of a bare 500 page.

    Registering for the bare `Exception` class, rather than a try/except in each route, is
    what makes this app-wide: Starlette dispatches by exception type, walking the MRO, so
    PlanProblems (its own handler above) and FastAPI's own HTTPException /
    RequestValidationError handlers all still win on their exact type and never reach here.

    Still a 500, not a softer code: the request was not necessarily bad, and inventing a
    different status would claim more than is known. The backend already treats any
    non-2xx, non-400 answer from /execute as analytics-unavailable (503)
    (AnalyticsClient.java), so this changes what's on the wire, not how the caller behaves.

    The exception itself — type, message, traceback — is logged here and nowhere else on
    this path; the body carries none of it, so nothing here can hand an attacker a stack
    trace, a SQL fragment, or a connection string.
    """
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path, exc_info=exc)
    return JSONResponse(status_code=500, content={"problems": ["an unexpected error occurred"]})


@app.post("/internal/v1/execute", dependencies=[Depends(require_token)])
def execute_plan(
    body: ExecuteRequest,
    conn: Annotated[psycopg.Connection, Depends(get_conn)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict:
    # The profile id is trusted precisely because nothing but the backend can reach this
    # service (docs/INSIGHTS.md, principle 3); every statement it reaches still carries it.
    return execute(conn, body.profile_id, body.plan, today=today(settings))

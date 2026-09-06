"""FastAPI app for the analytics service (docs/INSIGHTS.md → "The analytics service")."""

from functools import partial
from typing import Annotated, Any

import psycopg
from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from analytics.auth import require_token
from analytics.config import Settings, get_settings, today
from analytics.db import get_conn
from analytics.executor import PlanProblems, execute
from analytics.llm.client import OllamaClient, get_ollama_client
from analytics.llm.interpret import CategoryRef, InterpretFailed, interpret
from analytics.plan import MERCHANT_ENABLED
from analytics.validation import validate_plan

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


@app.post("/internal/v1/execute", dependencies=[Depends(require_token)])
def execute_plan(body: ExecuteRequest,
                 conn: Annotated[psycopg.Connection, Depends(get_conn)],
                 settings: Annotated[Settings, Depends(get_settings)]) -> dict:
    # The profile id is trusted precisely because nothing but the backend can reach this
    # service (docs/INSIGHTS.md, principle 3); every statement it reaches still carries it.
    return execute(conn, body.profile_id, body.plan,
                   today=today(settings), merchant_enabled=MERCHANT_ENABLED)


CATEGORY_NAMES_SQL = """
    SELECT id, name
      FROM category
     WHERE profile_id = %s
     ORDER BY name
"""


class InterpretRequest(BaseModel):
    profileId: int
    text: str
    currentPlan: dict | None = None


class InterpretResponse(BaseModel):
    plan: dict
    notes: list[str]


@app.post(
    "/internal/v1/interpret",
    response_model=InterpretResponse,
    dependencies=[Depends(require_token)],
)
def interpret_route(
    body: InterpretRequest,
    conn: Annotated[psycopg.Connection, Depends(get_conn)],
    settings: Annotated[Settings, Depends(get_settings)],
    client: Annotated[OllamaClient | None, Depends(get_ollama_client)],
):
    """Free text -> a draft plan the explorer opens as editable chips.

    The category catalogue is read here, from this service's own read-only
    connection: the backend never ships a category list over the wire, and the
    profile is the one it forwarded, never one a browser chose.

    Every failure is a 422 carrying problems, including an unreachable model —
    the explorer opens on the chips either way, and a 503 would claim the
    analytics service is down when it plainly is not.
    """
    if client is None:
        return JSONResponse(
            status_code=422,
            content={"problems": ["interpretation is not available on this instance"]},
        )

    with conn.cursor() as cur:
        cur.execute(CATEGORY_NAMES_SQL, (body.profileId,))
        categories = [CategoryRef(id=row[0], name=row[1]) for row in cur.fetchall()]

    validate = partial(
        validate_plan,
        profile_id=body.profileId,
        conn=conn,
        merchant_enabled=MERCHANT_ENABLED,
    )
    try:
        draft = interpret(
            body.text,
            categories=categories,
            current_plan=body.currentPlan,
            today=today(settings),
            client=client,
            validate=validate,
        )
    except InterpretFailed as exc:
        # A bare {"problems": [...]} body, like /internal/v1/execute's 400 —
        # HTTPException would wrap it in "detail".
        return JSONResponse(status_code=422, content={"problems": exc.problems})

    return InterpretResponse(plan=draft.plan, notes=draft.notes)


@app.get("/internal/v1/capabilities", dependencies=[Depends(require_token)])
def capabilities(
    client: Annotated[OllamaClient | None, Depends(get_ollama_client)],
) -> dict:
    """Is free-text interpretation available right now? (docs/INSIGHTS.md "Capability detection")

    Never an error: "no Ollama" and "model still downloading" are answers, not
    failures. The frontend shows templates + chips whenever this says false.
    """
    if client is None or not client.has_model():
        return {"interpret": False, "model": None}
    return {"interpret": True, "model": client.model}

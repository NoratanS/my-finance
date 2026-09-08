"""FastAPI app for the analytics service (docs/INSIGHTS.md → "The analytics service")."""

import logging
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
from analytics.llm.narrate import narrate
from analytics.plan import MERCHANT_ENABLED
from analytics.validation import validate_plan

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
    non-OllamaError from the model client, a bug — becomes this instead of a bare 500 page.

    Registering for the bare `Exception` class, rather than a try/except in each route, is
    what makes this app-wide: Starlette dispatches by exception type, walking the MRO, so
    PlanProblems (its own handler above) and FastAPI's own HTTPException /
    RequestValidationError handlers all still win on their exact type and never reach here.

    Still a 500, not a softer code: the request was not necessarily bad, and inventing a
    different status would claim more than is known. The backend already treats any
    non-2xx, non-400 answer from /execute as analytics-unavailable (503) and any non-2xx
    from /capabilities as "unavailable" (AnalyticsClient.java), so this changes what's on
    the wire, not how either caller behaves.

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
    return execute(
        conn, body.profile_id, body.plan, today=today(settings), merchant_enabled=MERCHANT_ENABLED
    )


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

    Every failure this route *anticipates* is a 422 carrying problems, including
    an unreachable model — the explorer opens on the chips either way, and a 503
    would claim the analytics service is down when it plainly is not.

    Anything it does not anticipate — a database error while reading the catalogue,
    or an exception from the model client other than OllamaError — is not handled
    here. It reaches the app-wide handler (`unexpected_error_handler` above) and
    comes back as a 500 problems body instead of either a 422 or a bare crash page.
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


class NarrateRequest(BaseModel):
    """Body of POST /internal/v1/narrate: an executed envelope, never rows."""

    envelope: dict[str, Any]


@app.post("/internal/v1/narrate", dependencies=[Depends(require_token)])
def narrate_endpoint(
    body: NarrateRequest,
    client: Annotated[OllamaClient | None, Depends(get_ollama_client)],
) -> dict[str, str]:
    """Caption an executed envelope (docs/INSIGHTS.md "The AI layer").

    No database, no profile id, no rows — the numbers were computed by
    /internal/v1/execute before this route was called, and the caption is
    checked against them before it is returned. With no Ollama configured the
    route still answers: `narrate` composes the sentence itself.

    The client arrives as a dependency, exactly as `/internal/v1/capabilities` and
    `/internal/v1/interpret` declare it, so tests override it the one documented way —
    `app.dependency_overrides[get_ollama_client]`. Resolving it inside the body instead
    would make that override silently do nothing on this route alone.
    """
    generate = None if client is None else client.generate
    return {"caption": narrate(body.envelope, generate=generate)}


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

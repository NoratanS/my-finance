# Insights — Stage 3: Phase 5 local AI layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Natural language as an optional *authoring shortcut* for Insights — and nothing
more. A machine that cannot run a local model loses convenience, never capability.

**Architecture:** An `ollama` container behind Docker Compose profile `ai`. The analytics
service owns the Ollama client, because it already owns the plan schema and the validator.
The founding rule is absolute: **the LLM never queries data and never does arithmetic.** It
does exactly two jobs — translate a typed sentence into a *draft* plan (schema-validated by
the same `validate_plan()` the executor uses, landing as editable chips, executed by the
deterministic pipeline like any other plan) and narrate results it receives as
already-computed numbers. A hallucination yields a wrong sentence or a rejected plan, never
a wrong number. A capabilities endpoint drives the UI: free text when a model is present,
templates and chips when it is not.

**Tech Stack:** As Stage 1, plus Ollama (model pinned by benchmark, `OLLAMA_MODEL`-configurable).

**Spec:** [`docs/superpowers/specs/2026-09-04-insights-implementation-design.md`](../specs/2026-09-04-insights-implementation-design.md)
— decisions D10 (default model chosen by benchmark, not assertion) and **D11 (no model runs
in CI, ever)** govern every test in this plan.

**Prerequisite:** Stages 1 and 2 complete and merged.

**Covers Linear:** MY-36, MY-37, MY-38 (under umbrella MY-35).

**Stage gate:** a typed sentence produces editable chips that execute; deleting the Ollama
container removes convenience and nothing else; CI never pulls a model.

---

## Global Constraints

Every task's requirements implicitly include this section. Values are copied
verbatim from the spec and from the committed design docs.

**Versions, pinned.** Java 21 · Spring Boot 4.1.0 (Spring Framework 7, **Jackson 3**) ·
Postgres `postgres:16-alpine` (identical tag in `docker-compose.yml`,
`deploy/release/docker-compose.yml`, `TestcontainersConfiguration.java`, and the Python
test harness) · Node 20 · React 19.2 · Vite 7 · TypeScript ~5.9.2 ·
Python 3.12+ (uv, ruff, pytest, psycopg, FastAPI) · `recharts@^3.10.1`.

**Jackson 3, not 2.** Databind is `tools.jackson.databind.json.JsonMapper` (an injectable
bean); annotations stay `com.fasterxml.jackson.annotation.*`; `JacksonException` is
`tools.jackson.core.JacksonException`. `@AutoConfigureMockMvc` lives in
`org.springframework.boot.webmvc.test.autoconfigure`. Starters are per-slice
(`spring-boot-starter-webmvc`, `-webmvc-test`, `-flyway`, `-flyway-test`, `-data-jpa-test`).

**No Lombok, anywhere.** Constructor injection with a single `final` field. DTOs are
`record`s; request records carry Bean Validation, response records carry a static
`from(entity)` factory.

**Profile scoping is a security boundary** (`ARCHITECTURE.md` §3). Never accept a
client-supplied profile id. `activeProfile.requireId()` at the top of every public
service method, including readers. Single-row access is
`findByIdAndProfileId(...).orElseThrow(...)`. A row in another profile is **404, never 403**.
Every hand-written SQL statement carries `profile_id` — in the outer query *and* in
both terms of any recursive CTE.

**Money.** `NUMERIC(19,4)` in the database, decimal **strings** on the wire, ISO 4217 code
alongside. Never floats, never client-side arithmetic. Aggregation is always per currency;
currencies never mix in one result. `COALESCE(SUM(t.amount), 0)` yields scale 0 and
serialises `"0"` — always cast `::numeric(19,4)` so an empty bucket is `"0.0000"`.

**Dates.** All ranges are inclusive on both ends. `txn.occurred_on` is a plain `DATE`.
Relative ranges resolve against an injectable clock in the instance's configured `TZ`,
never `date.today()` called inline, never `LocalDate.now()` without a `Clock`.

**TDD is mandatory** (CLAUDE.md) for anything with real logic — services, validation,
repository queries beyond trivial CRUD, hierarchy traversal, budget/plan calculations.
Failing test first, minimum code to pass, refactor green. Pure boilerplate (a bare
`@Entity`, a generated `JpaRepository` with no custom queries) may skip the cycle, and
the task says so in one line rather than silently omitting tests.

**Docs move with code** (CLAUDE.md). A change that diverges from `docs/SCHEMA.md`,
`docs/API.md`, `docs/INSIGHTS.md` or `ARCHITECTURE.md` updates that doc in the same
commit. Every non-trivial task appends a `docs/LESSONS.md` entry in the file's format —
`### lowercase-sentence title` under `## Entries`, with **What** / **Where** /
**Why it's this way** bullets, written for a Python-native reader. Repeated patterns
reference the earlier entry instead of restating it.

**Simplicity** (CLAUDE.md §2–§3). Minimum code that solves the problem. No speculative
abstraction, no unrequested configurability, no error handling for impossible states.
Touch only what the task requires; do not improve adjacent code. Match existing style
even where you would write it differently.

**Commits are conventional and frequent** — `feat(backend):`, `feat(analytics):`,
`feat(frontend):`, `test:`, `docs:`, `chore:`. One commit per task, at minimum.

---

## File Structure

One new package, three new routes, three small components. Everything else is
untouched — which is the design claim this stage has to keep.

```
analytics/src/analytics/llm/
    client.py      OllamaClient + get_ollama_client (returns None when OLLAMA_URL is unset)
    schema.py      the JSON schema the model is constrained to emit
    interpret.py   text -> draft plan; prompt assembly, one retry, then degrade
    narrate.py     envelope -> caption, and the grounding checker that gates it
analytics/benchmarks/bench_models.py     picks the default model (D10)
analytics/scripts/golden-llm.sh          the real-model suite — LOCAL ONLY (D11)

backend/.../dto/{CapabilitiesResponse,InterpretRequest,NarrationResponse}.java
backend/.../exception/InterpretFailedException.java
backend/.../service/{AnalyticsClient,InsightService}.java   three pass-throughs

frontend/src/insights/{AiSearchBox,Caption,FollowUp}.tsx
docker-compose.yml · deploy/release/*    the `ai` compose profile and the --ai launcher flag
```

The `llm/` package is the only code that knows a model exists. `validation.py` is
imported by `interpret.py` rather than duplicated, so a draft plan passes through
exactly the validator the executor uses — the single fact that keeps a hallucinated
plan from ever executing. `narrate.py` holds both the caption pipeline and the
grounding checker deliberately: the check is not a test helper, it is the thing that
runs in production before a caption is returned.

---

### Task 1: [MY-36] Ollama container behind the `ai` compose profile

**Files:**
- Modify: `docker-compose.yml` (add an `ollama:` service, an `ollama-models` named volume, and two `environment:` lines on the existing `analytics:` service)
- Modify: `.env.example` (add the `OLLAMA_MODEL` block)

**Interfaces:**
- Consumes: the `analytics:` service block added to `docker-compose.yml` by Stage 1 (MY-29), and its `environment:` map.
- Produces:
  - compose service `ollama`, gated by `profiles: ["ai"]`, listening on `11434` on the compose network only (no published port);
  - named volume `ollama-models` mounted at `/root/.ollama` (the model cache);
  - two environment variables the analytics container reads: `OLLAMA_URL` (compose default `http://ollama:11434`) and `OLLAMA_MODEL` (compose default `qwen3:4b`);
  - the invocation `docker compose --profile ai up -d`, which every later task and doc refers to.

- [ ] **Step 1: Verify the gap — the check that must fail**

Run: `cd /home/chris/side-projects/my-finance && docker compose --profile ai config --services | grep -x ollama`

Expected: FAIL — no output and exit status 1 (`grep` finds nothing; the `ai` profile has no services).

- [ ] **Step 2: Pin the Ollama image tag**

The repo pins every base image to a real version (`postgres:16-alpine`, `node:20-alpine`, …) and never uses `:latest`. Find the newest stable tag:

```bash
curl -s 'https://registry.hub.docker.com/v2/repositories/ollama/ollama/tags?page_size=50&ordering=last_updated' \
  | tr ',' '\n' | grep '"name"' | head -20
```

The blocks below are written with `0.13.0`. If the command prints a newer plain `MAJOR.MINOR.PATCH` tag (ignore `latest`, `rocm`, `-rc*`), use that tag instead — everywhere it appears in this task and in Task 6.

- [ ] **Step 3: Add the `ollama` service and the model-cache volume to `docker-compose.yml`**

Add this service block after the `analytics:` service, keeping the file's conventions (a `#` header comment saying *why*, `restart: unless-stopped`, no `ports:`, an explained healthcheck):

```yaml
  # Optional local AI (ARCHITECTURE.md section 6, docs/INSIGHTS.md "The AI
  # layer"). Started only by `docker compose --profile ai up`; with the
  # profile off, nothing here is pulled or run and the insights explorer
  # loses free-text search — never a capability.
  ollama:
    profiles: ["ai"]
    image: ollama/ollama:0.13.0
    restart: unless-stopped
    environment:
      # Read by `ollama pull` from inside the container (deploy/release/start.sh
      # --ai), so the model tag has exactly one source of truth: this file.
      OLLAMA_MODEL: ${OLLAMA_MODEL:-qwen3:4b}
    volumes:
      # The model is gigabytes. A named volume means a restart, or an image
      # upgrade, never re-downloads it.
      - ollama-models:/root/.ollama
    healthcheck:
      # The ollama CLI is in the image and talks to its own API; no wget/curl
      # needed (unlike the backend's alpine JRE base).
      test: ["CMD-SHELL", "ollama list >/dev/null 2>&1"]
      interval: 5s
      timeout: 3s
      retries: 20
      start_period: 10s
```

Extend the bottom `volumes:` block from

```yaml
volumes:
  postgres-data:
```

to

```yaml
volumes:
  postgres-data:
  ollama-models:
```

Then add these two lines to the **existing `analytics:` service's `environment:` map**, below the DB and `ANALYTICS_TOKEN` entries Stage 1 put there:

```yaml
      # Points at the ai-profile container. Without that profile the name does
      # not resolve, the capabilities probe answers interpret:false, and the
      # explorer stays on templates + chips — the documented degrade path.
      OLLAMA_URL: ${OLLAMA_URL:-http://ollama:11434}
      OLLAMA_MODEL: ${OLLAMA_MODEL:-qwen3:4b}
```

- [ ] **Step 4: Document the knob in `.env.example`**

Append to `/home/chris/side-projects/my-finance/.env.example`, matching the file's comment-paragraph-then-`KEY=value` style:

```
# Optional local AI (start it with `docker compose --profile ai up -d`).
# The model is downloaded on first use into the `ollama-models` volume —
# about 2.5 GB for the default — and reused after that. Any tag from
# https://ollama.com/library works; the default was chosen by benchmark
# (see analytics/benchmarks/results.md).
OLLAMA_MODEL=qwen3:4b
```

- [ ] **Step 5: Run the checks**

Run:

```bash
cd /home/chris/side-projects/my-finance
docker compose config --services | grep -qx ollama \
  && echo "FAIL: ollama runs without the profile" || echo "ok: ollama is profile-gated"
docker compose --profile ai config --services | grep -x ollama
docker compose --profile ai config | grep -E 'ollama-models|ollama/ollama:'
docker compose config | grep -E 'OLLAMA_(URL|MODEL)'
```

Expected: PASS — `ok: ollama is profile-gated`, then `ollama`, then the volume and image lines, then `OLLAMA_URL: http://ollama:11434` and `OLLAMA_MODEL: qwen3:4b` resolved on the **analytics** service even with the profile off.

- [ ] **Step 6: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add docker-compose.yml .env.example
git commit -m "feat(deploy): ollama container behind the 'ai' compose profile, with a model-cache volume"
```

---


### Task 2: [MY-36] `OllamaClient` in the analytics service

**Files:**
- Create: `analytics/src/analytics/llm/__init__.py`
- Create: `analytics/src/analytics/llm/client.py`
- Modify: `analytics/src/analytics/config.py` (two new `Settings` fields and their loader lines)
- Modify: `analytics/pyproject.toml` (add `httpx` to `[project] dependencies`)
- Test: `analytics/tests/test_llm_client.py`

**Interfaces:**
- Consumes: `analytics.config.Settings` and `analytics.config.get_settings() -> Settings` (Stage 1, MY-29). The two new fields are the ones the cross-stage contract already reserves: `ollama_url: str | None = None`, `ollama_model: str = "qwen3:4b"`. **Both must carry defaults** — Stage 1's `test_db.py` constructs `Settings` with only the three original fields.
- Produces, for MY-37 and MY-38:
  - `class OllamaError(Exception)` — raised by `generate` when the container does not answer.
  - `class OllamaClient` with `__init__(self, base_url: str, model: str, *, client: httpx.Client | None = None)`, attribute `model: str`, `has_model(self) -> bool`, and `generate(self, prompt: str, *, json_schema: dict[str, Any] | None = None) -> str`.
  - `def get_ollama_client(settings: Annotated[Settings, Depends(get_settings)]) -> OllamaClient | None` — a FastAPI dependency returning `None` when `OLLAMA_URL` is unset. Override it with `app.dependency_overrides[get_ollama_client]` in tests; **no test in this repo ever talks to a real Ollama** (design delta D11).

- [ ] **Step 1: Write the failing test**

Create `analytics/tests/test_llm_client.py`:

```python
"""OllamaClient against an injected httpx.MockTransport.

Nothing here reaches the network: CI never pulls or runs a model (design
delta D11), so every Ollama response in this repo's test suite is a stub.
"""

import json

import httpx
import pytest

from analytics.llm.client import OllamaClient, OllamaError


def tags_response(*names: str) -> httpx.Response:
    return httpx.Response(200, json={"models": [{"name": name} for name in names]})


def stubbed(handler) -> httpx.Client:
    return httpx.Client(transport=httpx.MockTransport(handler), base_url="http://ollama:11434")


def test_has_model_is_true_when_the_tag_is_present():
    client = OllamaClient(
        "http://ollama:11434",
        "qwen3:4b",
        client=stubbed(lambda request: tags_response("gemma3:4b", "qwen3:4b")),
    )

    assert client.has_model() is True


def test_has_model_treats_an_untagged_name_as_latest():
    client = OllamaClient(
        "http://ollama:11434",
        "qwen3",
        client=stubbed(lambda request: tags_response("qwen3:latest")),
    )

    assert client.has_model() is True


def test_has_model_is_false_while_the_model_is_still_pulling():
    client = OllamaClient(
        "http://ollama:11434",
        "qwen3:4b",
        client=stubbed(lambda request: tags_response("gemma3:4b")),
    )

    assert client.has_model() is False


def test_has_model_is_false_when_ollama_is_not_running():
    def refuse(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("name or service not known", request=request)

    client = OllamaClient("http://ollama:11434", "qwen3:4b", client=stubbed(refuse))

    assert client.has_model() is False


def test_has_model_is_false_on_a_server_error():
    client = OllamaClient(
        "http://ollama:11434",
        "qwen3:4b",
        client=stubbed(lambda request: httpx.Response(500, text="boom")),
    )

    assert client.has_model() is False


def test_generate_posts_a_non_streaming_request_and_returns_the_text():
    seen: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={"response": '{"version": 1}'})

    client = OllamaClient("http://ollama:11434", "qwen3:4b", client=stubbed(handler))

    assert client.generate("turn this into a plan") == '{"version": 1}'
    assert seen["url"] == "http://ollama:11434/api/generate"
    assert seen["body"] == {
        "model": "qwen3:4b",
        "prompt": "turn this into a plan",
        "stream": False,
    }


def test_generate_forwards_a_json_schema_as_the_format_field():
    seen: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={"response": "{}"})

    client = OllamaClient("http://ollama:11434", "qwen3:4b", client=stubbed(handler))
    schema = {"type": "object", "required": ["version"]}

    client.generate("prompt", json_schema=schema)

    assert seen["body"]["format"] == schema


def test_generate_raises_when_ollama_is_not_running():
    def refuse(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("name or service not known", request=request)

    client = OllamaClient("http://ollama:11434", "qwen3:4b", client=stubbed(refuse))

    with pytest.raises(OllamaError):
        client.generate("prompt")
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/chris/side-projects/my-finance/analytics && uv run pytest tests/test_llm_client.py -q`

Expected: FAIL with `ModuleNotFoundError: No module named 'analytics.llm'` during collection.

- [ ] **Step 3: Add the two settings fields**

In `analytics/src/analytics/config.py`, add these two fields to `Settings`, next to `database_url` / `analytics_token` / `tz` (the cross-stage contract already reserves the names, so they may exist as declarations only):

```python
    # Defaults are load-bearing, not decoration: Stage 1's analytics/tests/test_db.py
    # constructs Settings(database_url=..., analytics_token=..., tz=...) with exactly the
    # three original fields. Adding required fields here would break all five of its tests,
    # including the one that proves myfinance_ro cannot write.
    ollama_url: str | None = None      # OLLAMA_URL; unset or empty => interpretation is off
    ollama_model: str = "qwen3:4b"     # OLLAMA_MODEL; the tag the ai-profile container serves
```

and these two lines where `get_settings()` builds the `Settings` object from `os.environ`, matching the surrounding style:

```python
        ollama_url=os.environ.get("OLLAMA_URL") or None,
        ollama_model=os.environ.get("OLLAMA_MODEL", "qwen3:4b"),
```

- [ ] **Step 4: Add `httpx` as a runtime dependency**

In `analytics/pyproject.toml`, add `"httpx"` to `[project] dependencies` (it is already present transitively as a test dependency of FastAPI's `TestClient`; the service now imports it at runtime, so it must be declared):

```toml
dependencies = [
    "fastapi",
    "uvicorn[standard]",
    "psycopg[binary]>=3.2",
    "httpx",
]
```

Keep whatever entries Stage 1 already listed; only `"httpx"` is new. Then sync the environment:

```bash
cd /home/chris/side-projects/my-finance/analytics && uv sync
```

- [ ] **Step 5: Write the client**

Create the package marker — an empty file, same as `analytics/src/analytics/__init__.py`:

```bash
cd /home/chris/side-projects/my-finance
mkdir -p analytics/src/analytics/llm && touch analytics/src/analytics/llm/__init__.py
```

Create `analytics/src/analytics/llm/client.py`:

```python
"""Minimal Ollama HTTP client.

Only the two things the AI layer needs: is the configured model actually
present, and one non-streaming generation. The service keeps working with no
Ollama at all — every failure here degrades to "interpretation unavailable"
(docs/INSIGHTS.md "Capability detection").
"""

from __future__ import annotations

from typing import Annotated, Any

import httpx
from fastapi import Depends

from analytics.config import Settings, get_settings


class OllamaError(Exception):
    """Ollama did not answer: container absent, still starting, or model still pulling."""


def _tagged(model: str) -> str:
    """`qwen3` and `qwen3:latest` are the same model to Ollama; compare canonically."""
    return model if ":" in model else f"{model}:latest"


class OllamaClient:

    def __init__(self, base_url: str, model: str, *, client: httpx.Client | None = None) -> None:
        self.model = model
        # Connect fast, read slow: a missing `ai` profile must not stall the
        # capabilities probe (the backend gives it 10s), while generation on
        # CPU legitimately takes tens of seconds.
        self._client = client or httpx.Client(
            base_url=base_url, timeout=httpx.Timeout(60.0, connect=2.0)
        )

    def has_model(self) -> bool:
        """False for every reason interpretation could be unavailable — never raises."""
        try:
            response = self._client.get("/api/tags")
            response.raise_for_status()
        except httpx.HTTPError:
            return False
        wanted = _tagged(self.model)
        return any(
            _tagged(entry.get("name", "")) == wanted for entry in response.json().get("models", [])
        )

    def generate(self, prompt: str, *, json_schema: dict[str, Any] | None = None) -> str:
        """One completion. `json_schema` constrains the emission to that shape."""
        # think/temperature match chat_json: the default qwen3 is a thinking model, and a
        # discarded trace costs CPU seconds on every caption; temperature 0 is what makes a
        # caption reproducible, which the local narration suite in Task 21 depends on.
        body: dict[str, Any] = {
            "model": self.model,
            "prompt": prompt,
            "stream": False,
            "think": False,
            "options": {"temperature": 0},
        }
        if json_schema is not None:
            body["format"] = json_schema
        try:
            response = self._client.post("/api/generate", json=body)
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise OllamaError(str(exc)) from exc
        return response.json()["response"]


def get_ollama_client(
    settings: Annotated[Settings, Depends(get_settings)],
) -> OllamaClient | None:
    """FastAPI dependency. None means OLLAMA_URL is unset — this instance has no AI layer."""
    if not settings.ollama_url:
        return None
    return OllamaClient(settings.ollama_url, settings.ollama_model)
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd /home/chris/side-projects/my-finance/analytics && uv run pytest tests/test_llm_client.py -q`

Expected: PASS — 8 passed.

> The `generate` test must also assert the two decoding options, since the narration
> pipeline's reproducibility rests on them: add
> `assert seen["body"]["think"] is False` and
> `assert seen["body"]["options"] == {"temperature": 0}` to
> `test_generate_posts_a_non_streaming_request_and_returns_the_text`.

- [ ] **Step 7: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add analytics/src/analytics/llm/__init__.py analytics/src/analytics/llm/client.py \
        analytics/src/analytics/config.py analytics/pyproject.toml analytics/uv.lock \
        analytics/tests/test_llm_client.py
git commit -m "feat(analytics): OllamaClient (model presence + one generation), stubbed in tests"
```

---


### Task 3: [MY-36] `GET /internal/v1/capabilities` on the analytics service

**Files:**
- Modify: `analytics/src/analytics/main.py` (add the `/internal/v1/capabilities` route handler and its imports)
- Test: `analytics/tests/test_llm_capabilities.py`

- Modify: `docs/INSIGHTS.md` ("The analytics service" → Contract — one new bullet)

**Interfaces:**
- Consumes: `analytics.main.app` (the FastAPI app, Stage 1); the bearer dependency in `analytics/src/analytics/auth.py` that `POST /internal/v1/execute` already carries — referred to below as `require_token`; `OllamaClient` and `get_ollama_client` from Task 2.
- Produces: `GET /internal/v1/capabilities` → `200 {"interpret": bool, "model": str | null}`, bearer-authenticated like every other `/internal/v1/*` route. `model` is `null` whenever `interpret` is `false`. Consumed by the backend's `AnalyticsClient.capabilities()` (Task 4).
- No CI change: these tests run inside the existing `analytics` job in `.github/workflows/ci.yml` and need no model, no container, and no network (design delta D11).

- [ ] **Step 1: Write the failing test**

Create `analytics/tests/test_llm_capabilities.py`:

```python
"""GET /internal/v1/capabilities in both states, with the Ollama client stubbed.

Bearer auth is Stage 1's contract and is covered by the execute tests; this
module overrides it so the capability logic is the only thing under test.
"""

import pytest
from fastapi.testclient import TestClient

from analytics.auth import require_token
from analytics.llm.client import get_ollama_client
from analytics.main import app


class StubOllama:
    def __init__(self, model: str, present: bool) -> None:
        self.model = model
        self._present = present

    def has_model(self) -> bool:
        return self._present


@pytest.fixture
def client():
    app.dependency_overrides[require_token] = lambda: None
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_interpret_is_false_when_ollama_url_is_unset(client):
    app.dependency_overrides[get_ollama_client] = lambda: None

    response = client.get("/internal/v1/capabilities")

    assert response.status_code == 200
    assert response.json() == {"interpret": False, "model": None}


def test_interpret_is_false_when_the_model_is_not_pulled_yet(client):
    app.dependency_overrides[get_ollama_client] = lambda: StubOllama("qwen3:4b", present=False)

    response = client.get("/internal/v1/capabilities")

    assert response.status_code == 200
    assert response.json() == {"interpret": False, "model": None}


def test_interpret_is_true_and_names_the_model_when_it_is_present(client):
    app.dependency_overrides[get_ollama_client] = lambda: StubOllama("qwen3:4b", present=True)

    response = client.get("/internal/v1/capabilities")

    assert response.status_code == 200
    assert response.json() == {"interpret": True, "model": "qwen3:4b"}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/chris/side-projects/my-finance/analytics && uv run pytest tests/test_llm_capabilities.py -q`

Expected: FAIL with `assert 404 == 200` on the first test (the route does not exist yet).

- [ ] **Step 3: Add the route**

In `analytics/src/analytics/main.py`, add the import:

```python
from analytics.llm.client import OllamaClient, get_ollama_client
```

`Annotated` and `Depends` are already imported there (the execute route uses
both); if not, add `from typing import Annotated` and `from fastapi import Depends`.
Then add the handler, next to the other `/internal/v1/*` routes. Declare the bearer dependency **exactly the way the `POST /internal/v1/execute` handler declares it** — the form below is the `dependencies=[...]` style:

```python
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /home/chris/side-projects/my-finance/analytics && uv run pytest -q`

Expected: PASS — the three new tests plus the whole existing suite green.

- [ ] **Step 5: Record the route in `docs/INSIGHTS.md`**

`docs/INSIGHTS.md` → "The analytics service" → **Contract** currently lists only
`POST /internal/v1/execute` and `GET /internal/health`. CLAUDE.md requires the doc to move
with the code, and Task 17 later anchors its own edit *after* these bullets — so they have
to exist. Append to that list, matching the style of the `execute` bullet:

```markdown
  - `GET /internal/v1/capabilities` — `200 {"interpret": bool, "model": str | null}`. `interpret` is false when `OLLAMA_URL` is unset or the configured model is not pulled, and the frontend then offers templates and chips instead of free text — no capability exists only behind the model.
```

- [ ] **Step 6: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add analytics/src/analytics/main.py analytics/tests/test_llm_capabilities.py docs/INSIGHTS.md
git commit -m "feat(analytics): GET /internal/v1/capabilities reports interpretation availability"
```

---


### Task 4: [MY-36] Backend pass-through `GET /api/insights/capabilities`

**Files:**
- Create: `backend/src/main/java/com/myfinance/backend/dto/CapabilitiesResponse.java`
- Modify: `backend/src/main/java/com/myfinance/backend/service/AnalyticsClient.java` (add the `capabilities()` method and the `UNAVAILABLE` constant)
- Modify: `backend/src/main/java/com/myfinance/backend/service/InsightService.java` (add the `capabilities()` delegation)
- Modify: `backend/src/main/java/com/myfinance/backend/controller/InsightController.java` (add the `@GetMapping("/capabilities")` handler)
- Modify: `docs/API.md` (replace the forward-looking blockquote at the end of the "Insights" section)
- Test: `backend/src/test/java/com/myfinance/backend/controller/InsightCapabilitiesTest.java`

**Interfaces:**
- Consumes: `service/AnalyticsClient.java` and its `RestClient` field (Stage 1, MY-30 — named `restClient` below), `service/InsightService.java` and its `analyticsClient` field, `controller/InsightController.java` mapped at `/api/insights`, the property `analytics.base-url` from `config/AnalyticsProperties.java`, and the test harness `@IntegrationTest` + `TestFixtures` (`fixtures.user`, `fixtures.profile`, `fixtures.in(profile)`, `fixtures.as(user)`).
- Produces:
  - `record CapabilitiesResponse(boolean interpret, String model)` in `com.myfinance.backend.dto`;
  - `CapabilitiesResponse AnalyticsClient.capabilities()` — never throws, returns `(false, null)` on any transport or HTTP failure;
  - `GET /api/insights/capabilities` → `200 CapabilitiesResponse`, `401` unauthenticated. Authenticated but **not** profile-scoped: it reads no profile data, so no active profile is required and there is no `503`.

- [ ] **Step 1: Write the failing test**

Create `backend/src/test/java/com/myfinance/backend/controller/InsightCapabilitiesTest.java`:

```java
package com.myfinance.backend.controller;

import com.myfinance.backend.model.Profile;
import com.myfinance.backend.model.User;
import com.myfinance.backend.support.IntegrationTest;
import com.myfinance.backend.support.TestFixtures;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.io.IOException;
import java.io.OutputStream;
import java.io.UncheckedIOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * GET /api/insights/capabilities (docs/API.md "Insights"). The analytics service is a stub
 * HTTP server on a random port — no Python, no container, and above all no model: CI never
 * runs one (design delta D11).
 */
@IntegrationTest
class InsightCapabilitiesTest {

    // Started in a static initializer, not @BeforeAll: @DynamicPropertySource is evaluated
    // while the Spring context is built, which happens before any user @BeforeAll runs.
    private static final HttpServer ANALYTICS = startStub();

    private static volatile int stubStatus = 200;
    private static volatile String stubBody = "{\"interpret\":true,\"model\":\"qwen3:4b\"}";
    private static volatile String seenAuthorization;

    private static HttpServer startStub() {
        try {
            HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.createContext("/internal/v1/capabilities", exchange -> {
                seenAuthorization = exchange.getRequestHeaders().getFirst("Authorization");
                byte[] payload = stubBody.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().add("Content-Type", "application/json");
                exchange.sendResponseHeaders(stubStatus, payload.length);
                try (OutputStream body = exchange.getResponseBody()) {
                    body.write(payload);
                }
            });
            server.start();
            return server;
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    @DynamicPropertySource
    static void analyticsUrl(DynamicPropertyRegistry registry) {
        registry.add("analytics.base-url", () -> "http://127.0.0.1:" + ANALYTICS.getAddress().getPort());
    }

    @AfterAll
    static void stopStub() {
        ANALYTICS.stop(0);
    }

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private TestFixtures fixtures;

    private User user;
    private Profile profile;

    @BeforeEach
    void setUp() {
        stubStatus = 200;
        stubBody = "{\"interpret\":true,\"model\":\"qwen3:4b\"}";
        seenAuthorization = null;
        user = fixtures.user("kasia@example.com");
        profile = fixtures.profile(user, "Personal", "PLN");
    }

    @Test
    void reportsInterpretationAvailableAndForwardsTheInternalToken() throws Exception {
        mockMvc.perform(get("/api/insights/capabilities").with(fixtures.in(profile)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.interpret").value(true))
                .andExpect(jsonPath("$.model").value("qwen3:4b"));

        assertThat(seenAuthorization).startsWith("Bearer ");
    }

    @Test
    void reportsInterpretationUnavailableWhenTheAiLayerIsOff() throws Exception {
        stubBody = "{\"interpret\":false,\"model\":null}";

        mockMvc.perform(get("/api/insights/capabilities").with(fixtures.in(profile)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.interpret").value(false))
                .andExpect(jsonPath("$.model").doesNotExist());
    }

    /** A broken analytics service means interpretation is unavailable — the question asked. */
    @Test
    void degradesToUnavailableInsteadOf503WhenAnalyticsFails() throws Exception {
        stubStatus = 500;
        stubBody = "{\"error\":\"boom\"}";

        mockMvc.perform(get("/api/insights/capabilities").with(fixtures.in(profile)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.interpret").value(false))
                .andExpect(jsonPath("$.model").doesNotExist());
    }

    /** Instance-wide, not profile data: authenticated is enough, no active profile needed. */
    @Test
    void answersWithoutAnActiveProfile() throws Exception {
        mockMvc.perform(get("/api/insights/capabilities").with(fixtures.as(user)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.interpret").value(true));
    }

    @Test
    void requiresAuthentication() throws Exception {
        mockMvc.perform(get("/api/insights/capabilities"))
                .andExpect(status().isUnauthorized());
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/chris/side-projects/my-finance/backend && ./mvnw -B test -Dtest=InsightCapabilitiesTest`

Expected: FAIL with `Status expected:<200> but was:<400>` on `reportsInterpretationAvailableAndForwardsTheInternalToken`. Not a `404`: with no `/capabilities` mapping the request falls through to `@GetMapping("/{id}")`, `"capabilities"` fails conversion to `Long`, and the global type-mismatch handler answers `400` — the same mechanism `SubscriptionController` documents on its `status` parameter.

- [ ] **Step 3: Add the DTO**

Create `backend/src/main/java/com/myfinance/backend/dto/CapabilitiesResponse.java`:

```java
package com.myfinance.backend.dto;

/**
 * Whether this instance can turn free text into a plan, and which model answers
 * (docs/API.md "GET /api/insights/capabilities"). Deserialized from the analytics service's
 * {@code GET /internal/v1/capabilities} and returned to the SPA unchanged; {@code model} is
 * null whenever {@code interpret} is false.
 */
public record CapabilitiesResponse(boolean interpret, String model) {
}
```

- [ ] **Step 4: Add `capabilities()` to `AnalyticsClient`**

In `backend/src/main/java/com/myfinance/backend/service/AnalyticsClient.java`, add the import `com.myfinance.backend.dto.CapabilitiesResponse` and `org.springframework.web.client.RestClientException`, then this constant and method (the `restClient` field is the one the class already holds, with the bearer header configured on it):

```java
    private static final CapabilitiesResponse UNAVAILABLE = new CapabilitiesResponse(false, null);

    /**
     * Capability probe. Unlike {@link #execute}, a failure here is not a 503: "the analytics
     * service is unreachable" and "Ollama is not running" both mean interpretation is
     * unavailable, which is exactly what the caller asked. Answering false keeps the explorer
     * in templates-and-chips mode instead of showing an error for a feature nobody invoked.
     */
    public CapabilitiesResponse capabilities() {
        try {
            CapabilitiesResponse response = restClient.get()
                    .uri("/internal/v1/capabilities")
                    .retrieve()
                    .body(CapabilitiesResponse.class);
            return response != null ? response : UNAVAILABLE;
        } catch (RestClientException e) {
            return UNAVAILABLE;
        }
    }
```

- [ ] **Step 5: Delegate from the service and expose it on the controller**

In `backend/src/main/java/com/myfinance/backend/service/InsightService.java`, add the import `com.myfinance.backend.dto.CapabilitiesResponse` and:

```java
    /** Instance-wide, not profile-scoped: nothing here reads profile data. */
    public CapabilitiesResponse capabilities() {
        return analyticsClient.capabilities();
    }
```

In `backend/src/main/java/com/myfinance/backend/controller/InsightController.java`, add the import `com.myfinance.backend.dto.CapabilitiesResponse` and:

```java
    // Declared alongside "/{id}" is fine: an exact path segment always beats a path variable.
    @GetMapping("/capabilities")
    public CapabilitiesResponse capabilities() {
        return insightService.capabilities();
    }
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd /home/chris/side-projects/my-finance/backend && ./mvnw -B test -Dtest=InsightCapabilitiesTest`

Expected: PASS — 5 tests, 0 failures.

- [ ] **Step 7: Replace the forward-looking note in `docs/API.md` with the real contract**

In `docs/API.md`, at the end of the "Insights" section, this blockquote currently stands:

> Phase 5 adds `GET /api/insights/capabilities` (is NL interpretation
> available?), `POST /api/insights/interpret` (free text → draft plan), and a
> narration endpoint — contracts to be added to this section when that phase
> starts, per `INSIGHTS.md` → "The AI layer".

Replace it with:

````markdown
### `GET /api/insights/capabilities`

Phase 5. Does this instance have the optional local AI layer? The SPA asks
once and shapes the search window accordingly: free text when `interpret` is
`true`, the template gallery and chips when it is `false` (`INSIGHTS.md` →
"Capability detection" — no capability exists only behind the model).

**Response `200 OK`**

```json
{ "interpret": true, "model": "qwen3:4b" }
```

| Field | Type | Meaning |
|---|---|---|
| `interpret` | boolean | Free-text interpretation is available right now |
| `model` | string or null | The model answering, or `null` whenever `interpret` is `false` |

Instance-wide, not profile-scoped: it reads no profile data, so unlike every
other endpoint in this section it needs authentication but **no active
profile**.

| Status | When |
|---|---|
| `200` | Authenticated — including when the AI layer is off |
| `401` | Not authenticated |

There is deliberately **no `503`** here. "The analytics service is
unreachable" and "Ollama is not running" both mean interpretation is
unavailable, which is the question being asked; the probe answers
`{"interpret": false, "model": null}` and the explorer stays on templates and
chips. `POST /api/insights/execute` keeps its `503` — there, an unreachable
service is a failure to do the thing that was asked.

> Phase 5 also adds `POST /api/insights/interpret` (free text → draft plan)
> and a narration endpoint — contracts added to this section with those
> issues, per `INSIGHTS.md` → "The AI layer".
````

- [ ] **Step 8: Run the full backend suite**

Run: `cd /home/chris/side-projects/my-finance/backend && ./mvnw -B verify`

Expected: PASS — BUILD SUCCESS, no regressions in the existing controller tests.

- [ ] **Step 9: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add backend/src/main/java/com/myfinance/backend/dto/CapabilitiesResponse.java \
        backend/src/main/java/com/myfinance/backend/service/AnalyticsClient.java \
        backend/src/main/java/com/myfinance/backend/service/InsightService.java \
        backend/src/main/java/com/myfinance/backend/controller/InsightController.java \
        backend/src/test/java/com/myfinance/backend/controller/InsightCapabilitiesTest.java \
        docs/API.md
git commit -m "feat(backend): GET /api/insights/capabilities pass-through, degrading to interpret:false"
```

---


### Task 5: [MY-36] Frontend capability detection

**Files:**
- Modify: `frontend/src/api/types.ts` (add the `AiCapabilities` interface at the end, under a new `// — Insights (AI) —` divider comment)
- Modify: `frontend/src/api/hooks.ts` (add `useAiCapabilities`, and `AiCapabilities` to the type import list)
- Modify: `frontend/src/screens/Insights.tsx` (render the AI badge in the screen header)
- Test: `frontend/e2e/insights-ai.spec.ts`

**Interfaces:**
- Consumes: `GET /api/insights/capabilities` (Task 4); `api<T>()` from `src/api/client.ts`; `src/screens/Insights.tsx` and the `/insights` route (Stage 1, MY-32); the `.tag .tag-accent` classes already in `src/styles.css` (no new CSS — see contract R7, `styles.css` is a byte-identical copy of the design stylesheet and must not be edited).
- Produces, for MY-37: `interface AiCapabilities { interpret: boolean; model: string | null }` and `useAiCapabilities()` returning a React Query result over it, key `['ai-capabilities']`. MY-37's `src/insights/AiSearchBox.tsx` is rendered **only** when `useAiCapabilities().data?.interpret` is true; the template gallery and chip builder stay unconditional, so nothing is lost when the AI layer is off.

TDD note: this repo has no frontend unit-test runner (`frontend/package.json` has `dev` / `build` / `preview` / `e2e` only), so the failing-test cycle runs through Playwright, which stubs the endpoint at the browser and therefore needs no Ollama. Per contract R9 this is a **local** verification — CI runs `npm ci && npm run build` and does not run Playwright.

- [ ] **Step 1: Write the failing test**

Create `frontend/e2e/insights-ai.spec.ts`:

```ts
import { test, expect, type Page } from '@playwright/test';

// The AI badge in the insights header, in both capability states. The
// capabilities endpoint is stubbed in the browser, so this test needs the
// backend running (for register/login) but never an analytics service and
// never a model.

const PASSWORD = 'sturdy-password-1'; // the API requires >= 12 chars

async function registerAndPickProfile(page: Page, email: string) {
  await page.goto('/');
  await expect(page).toHaveURL(/\/auth/);
  await page.getByRole('link', { name: 'Create account' }).click();
  await page.getByLabel('Display name').fill('E2E AI');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/picker/);
  await page.getByRole('button', { name: 'New profile' }).click();
  await page.getByLabel('Profile name').fill('Personal');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByRole('button', { name: /Personal/ }).click();
  await expect(page).toHaveURL('/');
}

async function stubCapabilities(page: Page, body: { interpret: boolean; model: string | null }) {
  await page.route('**/api/insights/capabilities', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }),
  );
}

test('the insights header names the model when interpretation is available', async ({ page }) => {
  await registerAndPickProfile(page, `e2e-ai-on-${Date.now()}@example.com`);
  await stubCapabilities(page, { interpret: true, model: 'qwen3:4b' });

  await page.goto('/insights');

  await expect(page.getByText('AI · qwen3:4b')).toBeVisible();
});

test('with the AI layer off the explorer still works and shows no AI badge', async ({ page }) => {
  await registerAndPickProfile(page, `e2e-ai-off-${Date.now()}@example.com`);
  await stubCapabilities(page, { interpret: false, model: null });

  await page.goto('/insights');

  await expect(page.getByRole('heading', { name: 'Insights' })).toBeVisible();
  await expect(page.getByText(/^AI · /)).toHaveCount(0);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Start the backend in another terminal (`cd backend && DB_URL=jdbc:postgresql://localhost:5432/myfinance DB_USERNAME=postgres DB_PASSWORD=postgres ./mvnw spring-boot:run`), then run:

`cd /home/chris/side-projects/my-finance/frontend && npx playwright test e2e/insights-ai.spec.ts`

Expected: FAIL on the first test with `Error: expect(locator).toBeVisible() failed` for `getByText('AI · qwen3:4b')` — the badge does not exist yet. (The second test passes already; that is the point — the no-AI path must never regress.)

- [ ] **Step 3: Add the response type**

Append to `frontend/src/api/types.ts`:

```ts
// — Insights (AI) —

/** GET /api/insights/capabilities. `model` is null whenever `interpret` is false. */
export interface AiCapabilities {
  interpret: boolean;
  model: string | null;
}
```

- [ ] **Step 4: Add the hook**

Add `AiCapabilities,` to the `import type { ... } from './types';` list in `frontend/src/api/hooks.ts` (keep the list alphabetical — it goes first), and append the hook at the end of the file:

```ts
// — Insights (AI) —

/**
 * Is the optional local AI layer running? Instance-wide, so the key carries no
 * profile id (every other key here does) — and cached for five minutes, because
 * the answer only changes when someone restarts the stack with `--profile ai`.
 */
export function useAiCapabilities() {
  return useQuery({
    queryKey: ['ai-capabilities'],
    queryFn: () => api<AiCapabilities>('/api/insights/capabilities'),
    staleTime: 5 * 60_000,
  });
}
```

- [ ] **Step 5: Show it in the insights header**

In `frontend/src/screens/Insights.tsx`, add `useAiCapabilities` to the existing `from '../api/hooks'` import, call it at the top of the component:

```tsx
  const { data: capabilities } = useAiCapabilities();
```

and render the badge inside the existing header flex row, immediately after `<h2 style={{ margin: 0 }}>Insights</h2>` (Stage 1 renders an `h2`, not an `h1`), inside the same header row:

```tsx
        {capabilities?.interpret && (
          <span className="tag tag-accent">AI · {capabilities.model}</span>
        )}
```

Nothing else changes: with `interpret` false the screen renders exactly as it did before this task.

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd /home/chris/side-projects/my-finance/frontend && npx playwright test e2e/insights-ai.spec.ts`

Expected: PASS — 2 passed.

- [ ] **Step 7: Type-check the way CI does**

Run: `cd /home/chris/side-projects/my-finance/frontend && npm run build`

Expected: PASS — `tsc -b` clean, then a successful Vite build.

- [ ] **Step 8: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add frontend/src/api/types.ts frontend/src/api/hooks.ts \
        frontend/src/screens/Insights.tsx frontend/e2e/insights-ai.spec.ts
git commit -m "feat(frontend): useAiCapabilities() and the AI badge on the insights explorer"
```

---


### Task 6: [MY-36] Release bundle: `--ai` on both launchers

**Files:**
- Modify: `deploy/release/docker-compose.yml` (add the `ollama:` service, the `ollama-models` volume, and the two `OLLAMA_*` lines on the `analytics:` service)
- Modify: `deploy/release/.env.example` (add the `OLLAMA_MODEL` block)
- Modify: `deploy/release/start.sh` (argument parsing, profile-aware `pull`/`up`, model download)
- Modify: `deploy/release/start.bat` (the same, **keeping CRLF line endings** — `deploy/.gitattributes` pins them because `cmd.exe` misparses `goto` labels in LF-only files)
- Modify: `deploy/release/README.md` (an "Optional: local AI" section; the first-run paragraph)
- Modify: `README.md` (the tech-stack "AI insights" row, and the compose section)
- Modify: `ARCHITECTURE.md` (§6 "Local AI layer (Ollama, Phase 5)" — the launcher flag and the model cache)
- Modify: `docs/LESSONS.md` (append one entry)

**Interfaces:**
- Consumes: the `ollama` service shape, the `ollama-models` volume, and the `OLLAMA_URL` / `OLLAMA_MODEL` compose defaults from Task 1; the `analytics:` service Stage 1 (MY-29) added to `deploy/release/docker-compose.yml`; the existing `start.sh` / `start.bat` structure (Docker probes, `.env` generation, the `my-finance_postgres-data` upgrade guard, the `:wait` / `:ready` labels in the batch file).
- Produces: `./start.sh --ai` and `start.bat --ai` — the only way the release bundle can start the AI profile (contract R11: today both launchers run a bare `docker compose up -d`). Both download the model once into `ollama-models` and warn, without failing, if the download does not finish.

- [ ] **Step 1: Verify the gap — the checks that must fail**

Run:

```bash
cd /home/chris/side-projects/my-finance
docker compose -f deploy/release/docker-compose.yml --profile ai config --services | grep -x ollama
grep -c -- '--profile ai' deploy/release/start.sh deploy/release/start.bat
```

Expected: FAIL — the first command prints nothing and exits 1; the second prints `deploy/release/start.sh:0` and `deploy/release/start.bat:0`.

- [ ] **Step 2: Add `ollama` to the release compose file**

In `deploy/release/docker-compose.yml`, add after the `analytics:` service (same block as Task 1 — the release file differs only in that it pulls images rather than building them, and `ollama` is a third-party image either way):

```yaml
  # Optional local AI (ARCHITECTURE.md section 6). Started only by
  # `./start.sh --ai`, which adds `--profile ai`; without it nothing here is
  # pulled or run and the insights explorer loses free-text search, never a
  # capability.
  ollama:
    profiles: ["ai"]
    image: ollama/ollama:0.13.0
    restart: unless-stopped
    environment:
      # Read by `ollama pull` from inside the container (start.sh --ai), so
      # the model tag has exactly one source of truth: this file.
      OLLAMA_MODEL: ${OLLAMA_MODEL:-qwen3:4b}
    volumes:
      # The model is gigabytes. A named volume means a restart, or an image
      # upgrade, never re-downloads it.
      - ollama-models:/root/.ollama
    healthcheck:
      # The ollama CLI is in the image and talks to its own API; no wget/curl
      # needed (unlike the backend's alpine JRE base).
      test: ["CMD-SHELL", "ollama list >/dev/null 2>&1"]
      interval: 5s
      timeout: 3s
      retries: 20
      start_period: 10s
```

Extend the bottom volumes block to:

```yaml
volumes:
  postgres-data:
  ollama-models:
```

and add to the **existing `analytics:` service's `environment:` map**:

```yaml
      # Points at the ai-profile container. Without that profile the name does
      # not resolve, the capabilities probe answers interpret:false, and the
      # explorer stays on templates + chips — the documented degrade path.
      OLLAMA_URL: ${OLLAMA_URL:-http://ollama:11434}
      OLLAMA_MODEL: ${OLLAMA_MODEL:-qwen3:4b}
```

- [ ] **Step 3: Add the knob to `deploy/release/.env.example`**

Append, in the file's comment-then-`KEY=value` style:

```
# Optional local AI. Start it with `./start.sh --ai` (start.bat --ai on
# Windows); plain `./start.sh` never touches it. The model is downloaded on
# first use into a Docker volume — about 2.5 GB for the default — and reused
# after that. Any tag from https://ollama.com/library works.
OLLAMA_MODEL=qwen3:4b
```

- [ ] **Step 4: Add `--ai` to `start.sh`**

Insert this block after the `cd "$(dirname "$0")"` line and before the `command -v docker` check:

```bash
# Optional local AI: `./start.sh --ai` adds the compose `ai` profile (an
# ollama container plus its model cache). Without the flag nothing
# AI-related is pulled, started, or downloaded.
profile_args=""
want_ai=false
for arg in "$@"; do
  case "$arg" in
    --ai) profile_args="--profile ai"; want_ai=true ;;
    *)
      echo "Usage: ./start.sh [--ai]"
      echo "  --ai   also start the optional local AI container (see README.md)"
      exit 1
      ;;
  esac
done
```

Change the pull and the start to carry the profile — `$profile_args` is deliberately unquoted so that empty means "no extra argument" and `--profile ai` splits into two:

```bash
echo "Pulling images..."
# Unquoted on purpose: empty must expand to nothing, "--profile ai" to two words.
if ! docker compose $profile_args pull; then
```

```bash
echo "Starting my-finance..."
docker compose $profile_args up -d
```

Then insert the model download immediately after `docker compose $profile_args up -d`, before the `probe()` function:

```bash
if [ "$want_ai" = true ]; then
  # `up -d` returns before ollama accepts requests, and the model tag lives in
  # the compose file, so ask the container for it rather than re-parsing .env.
  printf "Waiting for the AI container"
  for _ in $(seq 1 30); do
    if docker compose $profile_args exec -T ollama ollama list >/dev/null 2>&1; then break; fi
    printf "."
    sleep 2
  done
  printf "\n"
  echo "Downloading the AI model. First run only: it is a few GB and is kept in"
  echo "a Docker volume, so later starts reuse it."
  # Single-quoted: $OLLAMA_MODEL is expanded by the container's shell, not here.
  if ! docker compose $profile_args exec -T ollama sh -c 'ollama pull $OLLAMA_MODEL'; then
    echo ""
    echo "Warning: the model download did not finish. my-finance runs fine without"
    echo "it — free-text search stays off until you re-run ./start.sh --ai."
  fi
fi
```

- [ ] **Step 5: Add `--ai` to `start.bat`, preserving CRLF**

Insert after `cd /d "%~dp0"`:

```bat
rem Optional local AI: `start.bat --ai` adds the compose "ai" profile (an
rem ollama container plus its model cache). Without the flag nothing
rem AI-related is pulled, started, or downloaded.
set PROFILE_ARGS=
set WANT_AI=0
if "%~1"=="--ai" (
  set PROFILE_ARGS=--profile ai
  set WANT_AI=1
)
if not "%~1"=="" if not "%~1"=="--ai" (
  echo Usage: start.bat [--ai]
  echo   --ai   also start the optional local AI container ^(see README.md^)
  pause
  exit /b 1
)
```

Change the two compose invocations:

```bat
echo Pulling images...
docker compose %PROFILE_ARGS% pull
```

```bat
echo Starting my-finance...
docker compose %PROFILE_ARGS% up -d
if "%WANT_AI%"=="1" goto aipull
goto appwait
```

Add the AI block and the label the normal path jumps to, immediately after that (before `echo Waiting for the app to come up...`):

```bat
:aipull
echo Waiting for the AI container...
set /a aitries=0
:aiwait
timeout /t 2 /nobreak >nul
docker compose %PROFILE_ARGS% exec -T ollama ollama list >nul 2>&1
if not errorlevel 1 goto aiready
set /a aitries+=1
if %aitries% lss 30 goto aiwait

:aiready
echo Downloading the AI model. First run only: it is a few GB and is kept in
echo a Docker volume, so later starts reuse it.
rem Double-quoted here so cmd passes $OLLAMA_MODEL through untouched; the
rem container's shell expands it.
docker compose %PROFILE_ARGS% exec -T ollama sh -c "ollama pull $OLLAMA_MODEL"
if errorlevel 1 (
  echo.
  echo Warning: the model download did not finish. my-finance runs fine without
  echo it - free-text search stays off until you re-run start.bat --ai.
)

:appwait
```

After saving, confirm the file is still CRLF:

```bash
cd /home/chris/side-projects/my-finance && git ls-files --eol deploy/release/start.bat
```

Expected: a line containing `w/crlf` (working-tree CRLF). If it says `w/lf`, run `unix2dos deploy/release/start.bat` (or re-save with CRLF) before committing.

- [ ] **Step 6: Run the checks**

Run:

```bash
cd /home/chris/side-projects/my-finance
bash -n deploy/release/start.sh
docker compose -f deploy/release/docker-compose.yml config --services | grep -qx ollama \
  && echo "FAIL: ollama runs without the profile" || echo "ok: ollama is profile-gated"
docker compose -f deploy/release/docker-compose.yml --profile ai config --services | grep -x ollama
grep -c -- '--profile ai' deploy/release/start.sh deploy/release/start.bat
git ls-files --eol deploy/release/start.bat
```

Expected: PASS — no syntax errors from `bash -n`; `ok: ollama is profile-gated`; `ollama`; `deploy/release/start.sh:1` and `deploy/release/start.bat:1`; `w/crlf`.

- [ ] **Step 7: Verify the real thing locally, once**

Run:

```bash
cd /home/chris/side-projects/my-finance
docker compose --profile ai up -d --build
docker compose --profile ai ps --services
docker compose --profile ai exec -T ollama sh -c 'ollama pull $OLLAMA_MODEL'
docker compose --profile ai exec -T analytics python -c \
  "import urllib.request,os,json; r=urllib.request.Request('http://localhost:8000/internal/v1/capabilities', headers={'Authorization':'Bearer '+os.environ['ANALYTICS_TOKEN']}); print(urllib.request.urlopen(r).read().decode())"
docker compose --profile ai down
docker compose up -d
docker compose exec -T analytics python -c \
  "import urllib.request,os,json; r=urllib.request.Request('http://localhost:8000/internal/v1/capabilities', headers={'Authorization':'Bearer '+os.environ['ANALYTICS_TOKEN']}); print(urllib.request.urlopen(r).read().decode())"
```

Expected: PASS — with the profile on and the model pulled, `{"interpret":true,"model":"qwen3:4b"}`; with the profile off, `{"interpret":false,"model":null}` (and no error, no hang: the connect timeout is 2s and the hostname simply does not resolve).

- [ ] **Step 8: Update the user-facing docs**

In `deploy/release/README.md`, add after the start-up instructions:

````markdown
## Optional: local AI

my-finance is complete without it: every insight can be built from templates
and chips. The AI layer adds one thing — typing a question in your own words
instead of clicking chips.

```
./start.sh --ai        # start.bat --ai on Windows
```

The first run downloads a language model (a few GB) into a Docker volume and
reuses it afterwards. It runs entirely on your machine; nothing is sent
anywhere. Change the model by editing `OLLAMA_MODEL` in `.env` and re-running
with `--ai`. Plain `./start.sh` never starts it; to stop one that is already
running, use `docker compose --profile ai down`.
````

In the root `README.md`:
- in the tech-stack table, change `| AI insights| Ollama *(planned, optional)* |` to `| AI insights| Ollama *(optional)* |`;
- in "Run the whole stack (Docker Compose)", add after the `docker compose up --build` line:

```markdown
Add the optional local AI layer with `docker compose --profile ai up --build`;
without the profile the app is fully functional and the insights explorer
offers templates and chips instead of free-text search.
```

In `ARCHITECTURE.md` §6, "Local AI layer (Ollama, Phase 5)", extend the second bullet so it ends:

```markdown
  ...No capability exists only behind the model. In the release bundle the
  profile is reached through `./start.sh --ai` (`start.bat --ai`), which is
  also what downloads the model on first run; the model lives in the
  `ollama-models` volume so restarts and image upgrades never re-download it.
```

- [ ] **Step 9: Append the LESSONS entry**

Append to the end of `docs/LESSONS.md`:

```markdown
### Compose profiles, and keeping an optional service genuinely optional

- **What** — `profiles:` keeps a container out of the default `up`, but the
  switch is only real if every entry point that starts the stack can reach it,
  and if the rest of the system treats the container's absence as an answer
  rather than an error.
- **Where** — `docker-compose.yml` and `deploy/release/docker-compose.yml`
  (the `ollama` service), `deploy/release/start.sh` / `start.bat` (`--ai`),
  `analytics/src/analytics/llm/client.py` (`get_ollama_client`,
  `OllamaClient.has_model`).
- **Why it's this way** — a service under `profiles: ["ai"]` is invisible to
  `docker compose up`: not pulled, not started, not even name-resolvable. That
  last part is the useful bit. The analytics container always gets
  `OLLAMA_URL=http://ollama:11434`, so with the profile off the DNS lookup
  simply fails, `has_model()` catches it and returns `False`, and the
  capabilities endpoint answers `{"interpret": false}` — one code path, no
  "is AI configured" flag to keep in sync. The launcher flag is the part that
  is easy to forget: the bundle's `start.sh` ran a bare `docker compose up -d`,
  so a compose profile with no `--ai` flag would have been unreachable for
  every user who is not editing YAML by hand. Python's `optional dependency,
  guarded import` habit is the same instinct one layer down — the difference
  is that here the guard has to exist in the shell script, the compose file,
  the Python client, and the React screen, and all four have to agree on what
  "off" looks like.
```

- [ ] **Step 10: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add deploy/release/docker-compose.yml deploy/release/.env.example \
        deploy/release/start.sh deploy/release/start.bat deploy/release/README.md \
        README.md ARCHITECTURE.md
git commit -m "feat(deploy): --ai flag on both launchers starts the ollama profile and pulls the model"
```

---


### Task 7: [MY-37] Plan emission schema + emission clean-up

**Files:**
- Create: `analytics/src/analytics/llm/schema.py`
- Test: `analytics/tests/test_llm_schema.py`

**Interfaces:**
- Consumes: `analytics.plan.METRICS`, `analytics.plan.GROUP_BYS`, `analytics.plan.INTERVALS` (MY-29 — the DSL enum tuples); the `analytics.llm` package (`llm/__init__.py`, created by MY-36).
- Produces:
  - `PLAN_JSON_SCHEMA: dict` — the JSON schema handed to Ollama's `format` field.
  - `RANGE_TYPES: tuple[str, ...]` = `("lastMonths", "yearToDate", "absolute", "all")`.
  - `RANGE_MEMBERS: dict[str, tuple[str, ...]]` — which optional keys belong to each range type.
  - `normalize_emission(raw: object) -> object` — drops `None` values and range members that do not belong to the emitted range type. Never invents a value.

This is real logic (a derived schema plus a normaliser), so TDD applies.

- [ ] **Step 1: Write the failing test**

```python
# analytics/tests/test_llm_schema.py
"""The prompt-side plan schema, and clean-up of what constrained decoding emits.

Neither needs a database nor a model: these run in CI (design delta D11).
"""

from analytics.llm.schema import PLAN_JSON_SCHEMA, RANGE_TYPES, normalize_emission
from analytics.plan import GROUP_BYS, INTERVALS, METRICS, RANGE_TYPES


def test_schema_enums_are_derived_from_the_dsl():
    properties = PLAN_JSON_SCHEMA["properties"]
    assert properties["metric"]["enum"] == list(METRICS)
    assert properties["groupBy"]["enum"] == list(GROUP_BYS)
    assert properties["interval"]["enum"] == list(INTERVALS)
    assert properties["range"]["properties"]["type"]["enum"] == list(RANGE_TYPES)
    assert PLAN_JSON_SCHEMA["required"] == ["version", "metric", "filters", "range"]


def test_normalize_drops_nulls_at_the_top_level_and_inside_filters():
    cleaned = normalize_emission(
        {
            "version": 1,
            "metric": "spend",
            "filters": {"categoryId": 12, "currency": None, "merchants": None},
            "groupBy": None,
            "interval": "month",
            "range": {"type": "lastMonths", "n": 12},
        }
    )

    assert cleaned == {
        "version": 1,
        "metric": "spend",
        "filters": {"categoryId": 12},
        "interval": "month",
        "range": {"type": "lastMonths", "n": 12},
    }


def test_normalize_prunes_range_members_that_do_not_belong_to_the_type():
    cleaned = normalize_emission(
        {
            "version": 1,
            "metric": "spend",
            "filters": {},
            "range": {"type": "yearToDate", "n": 12, "from": "2026-01-01"},
        }
    )

    assert cleaned["range"] == {"type": "yearToDate"}


def test_normalize_keeps_the_bounds_of_an_absolute_range():
    cleaned = normalize_emission(
        {
            "version": 1,
            "metric": "spend",
            "filters": {},
            "range": {"type": "absolute", "from": "2026-01-01", "to": "2026-06-30", "n": 3},
        }
    )

    assert cleaned["range"] == {"type": "absolute", "from": "2026-01-01", "to": "2026-06-30"}


def test_normalize_leaves_unknown_fields_alone_for_the_one_validator():
    cleaned = normalize_emission(
        {
            "version": 1, "metric": "spend", "filters": {},
            "range": {"type": "all"}, "split": "merchant",
        }
    )

    # validate_plan rejects `split`, not this function (design delta D7).
    assert cleaned["split"] == "merchant"


def test_normalize_passes_a_non_object_emission_straight_through():
    assert normalize_emission(["not", "a", "plan"]) == ["not", "a", "plan"]
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/chris/side-projects/my-finance/analytics && uv run pytest tests/test_llm_schema.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'analytics.llm.schema'`

- [ ] **Step 3: Write the schema module**

```python
# analytics/src/analytics/llm/schema.py
"""The JSON schema handed to Ollama's `format` field, plus emission clean-up.

The schema is DERIVED from plan.py's enums, so a metric or interval can never
be added to the DSL without the model being told about it. It is a prompt-side
constraint, not a validator: `validation.validate_plan()` stays the single gate
(design delta D7).
"""

from __future__ import annotations

from analytics.plan import GROUP_BYS, INTERVALS, METRICS, RANGE_TYPES

# RANGE_TYPES is imported from analytics.plan, never retyped — see the import above.

# Ollama converts this schema to a grammar and constrains decoding with it
# (verified against https://docs.ollama.com/api/chat -> structured outputs), so
# the emission is JSON without prose or code fences to strip. The `range` union
# is expressed as ONE object with an enum discriminator plus optional members
# rather than `anyOf`: flat shapes are the reliably supported part of that
# conversion, and normalize_emission() + validate_plan() reject whatever the
# grammar lets through.
PLAN_JSON_SCHEMA: dict = {
    "type": "object",
    "properties": {
        "version": {"type": "integer"},
        "metric": {"type": "string", "enum": list(METRICS)},
        "filters": {
            "type": "object",
            "properties": {
                "categoryId": {"type": "integer"},
                "includeDescendants": {"type": "boolean"},
                "merchants": {"type": "array", "items": {"type": "string"}},
                "currency": {"type": "string"},
            },
        },
        "groupBy": {"type": "string", "enum": list(GROUP_BYS)},
        "interval": {"type": "string", "enum": list(INTERVALS)},
        "range": {
            "type": "object",
            "properties": {
                "type": {"type": "string", "enum": list(RANGE_TYPES)},
                "n": {"type": "integer"},
                "from": {"type": "string"},
                "to": {"type": "string"},
            },
            "required": ["type"],
        },
    },
    "required": ["version", "metric", "filters", "range"],
}

RANGE_MEMBERS: dict[str, tuple[str, ...]] = {
    "lastMonths": ("n",),
    "yearToDate": (),
    "absolute": ("from", "to"),
    "all": (),
}


def normalize_emission(raw: object) -> object:
    """Drop nulls, and the range members that do not belong to the range type.

    Constrained decoding happily fills every optional key it is offered, and a
    plan carrying `{"type": "yearToDate", "n": 12}` would be rejected by
    validate_plan as an unknown field. Cleaning here is dropping, never
    guessing: no default is invented, so an under-specified emission still
    fails validation and still triggers the one retry.
    """
    if not isinstance(raw, dict):
        return raw

    plan = {key: value for key, value in raw.items() if value is not None}

    filters = plan.get("filters")
    if isinstance(filters, dict):
        plan["filters"] = {key: value for key, value in filters.items() if value is not None}

    rng = plan.get("range")
    if isinstance(rng, dict):
        keep = RANGE_MEMBERS.get(rng.get("type"), ())
        plan["range"] = {
            key: value
            for key, value in rng.items()
            if value is not None and (key == "type" or key in keep)
        }

    return plan
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /home/chris/side-projects/my-finance/analytics && uv run pytest tests/test_llm_schema.py -q && uv run ruff check .`
Expected: PASS (6 passed, ruff clean)

- [ ] **Step 5: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add analytics/src/analytics/llm/schema.py analytics/tests/test_llm_schema.py
git commit -m "feat(analytics): plan JSON schema for constrained emission, derived from the DSL enums"
```

---


### Task 8: [MY-37] Structured-output call on the Ollama client

**Files:**
- Modify: `analytics/src/analytics/llm/client.py` (add `OllamaError` if MY-36 did not already define it, add the `http`/`timeout` constructor wiring if absent, and add the `chat_json` method — change nothing else)
- Modify: `analytics/pyproject.toml` (via `uv add httpx`) and `analytics/uv.lock`
- Test: `analytics/tests/test_llm_client.py`

**Interfaces:**
- Consumes: `OllamaClient` and `OllamaError` from `analytics/src/analytics/llm/client.py` (Task 2) — constructor `OllamaClient(base_url: str, model: str, *, client: httpx.Client | None = None)`, storing the injected client on `self._client` and the tag on `self.model`. This task adds a method to that class and appends tests to that class's existing test file; it replaces nothing.
- Produces:
  - `OllamaClient.chat_json(messages: list[dict], schema: dict) -> dict` — one non-streaming `POST /api/chat` whose output is grammar-constrained to `schema`; returns the parsed object.
  - `OllamaError(RuntimeError)` — the model is unreachable, errored, or returned unparseable content.

- [ ] **Step 1: Write the failing test**

```python
# analytics/tests/test_llm_client.py
"""The one call this service makes to Ollama: schema in, JSON object out.

httpx.MockTransport stands in for the container, so this runs in CI with no
model anywhere (design delta D11).
"""

import json

import httpx
import pytest

from analytics.llm.client import OllamaClient, OllamaError


def stub_client(handler) -> OllamaClient:
    return OllamaClient(
        base_url="http://ollama:11434",
        model="qwen3:4b",
        http=httpx.Client(base_url="http://ollama:11434", transport=httpx.MockTransport(handler)),
    )


def ok(content: str):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"message": {"role": "assistant", "content": content}})

    return handler


def test_chat_json_posts_the_schema_in_format_and_parses_the_content():
    sent = {}

    def handler(request: httpx.Request) -> httpx.Response:
        sent["path"] = request.url.path
        sent["body"] = json.loads(request.content)
        emission = '{"version": 1, "metric": "spend"}'
        return httpx.Response(200, json={"message": {"content": emission}})

    result = stub_client(handler).chat_json([{"role": "user", "content": "hi"}], {"type": "object"})

    assert result == {"version": 1, "metric": "spend"}
    assert sent["path"] == "/api/chat"
    assert sent["body"]["model"] == "qwen3:4b"
    assert sent["body"]["stream"] is False
    assert sent["body"]["format"] == {"type": "object"}
    assert sent["body"]["options"]["temperature"] == 0
    assert sent["body"]["messages"] == [{"role": "user", "content": "hi"}]


def test_chat_json_raises_when_the_container_is_unreachable():
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused", request=request)

    with pytest.raises(OllamaError, match="chat call failed"):
        stub_client(handler).chat_json([], {"type": "object"})


def test_chat_json_raises_on_a_non_2xx_response():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, json={"error": "model not found"})

    with pytest.raises(OllamaError, match="chat call failed"):
        stub_client(handler).chat_json([], {"type": "object"})


def test_chat_json_raises_when_the_content_is_not_json():
    with pytest.raises(OllamaError, match="did not return JSON"):
        stub_client(ok("I think you want groceries!")).chat_json([], {"type": "object"})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/chris/side-projects/my-finance/analytics && uv run pytest tests/test_llm_client.py -q`
Expected: FAIL with `TypeError: OllamaClient.__init__() got an unexpected keyword argument 'http'` — or, if MY-36's constructor already takes `http`, with `AttributeError: 'OllamaClient' object has no attribute 'chat_json'`

- [ ] **Step 3: Declare httpx and add the method**

```bash
cd /home/chris/side-projects/my-finance/analytics && uv add httpx
```

`uv add` is a no-op re-pin when `httpx` is already a dependency (FastAPI's `TestClient` needs it), and it rewrites `uv.lock` — that lockfile is committed in the same commit, same discipline as the frontend's `package-lock.json`.

`OllamaError` and the constructor already exist — Task 2 created both. This task is
**strictly additive**: it adds one method and nothing else.

Do **not** rewrite `__init__`. Task 2's signature is
`(self, base_url: str, model: str, *, client: httpx.Client | None = None)`, it stores the
injected client on `self._client`, and it builds `httpx.Client(base_url=base_url,
timeout=httpx.Timeout(60.0, connect=2.0))` when none is passed. That 2-second connect
timeout is what stops a missing `ai` profile from stalling the capabilities probe, and
`self._client` is what `has_model()` and `generate()` already use — replacing the
constructor here would break both, and `has_model()` is what the capabilities route calls.

Then the method (`import json` and `import httpx` at the top of the module):

```python
    def chat_json(self, messages: list[dict], schema: dict) -> dict:
        """One non-streaming /api/chat call whose output is constrained to `schema`.

        `format` takes a JSON schema and Ollama constrains decoding with it
        (https://docs.ollama.com/api/chat -> structured outputs), which is why
        nothing here strips prose or code fences. `think: false` keeps a
        thinking model (the default qwen3) from spending CPU seconds on a trace
        we discard — a trace would land in `message.thinking` and never in
        `message.content`, so parsing is unaffected either way. `temperature: 0`
        makes the same sentence give the same plan, which is what the golden
        suite measures.
        """
        payload = {
            "model": self.model,
            "messages": messages,
            "stream": False,
            "format": schema,
            "think": False,
            "options": {"temperature": 0},
        }
        try:
            response = self._client.post("/api/chat", json=payload, timeout=self.timeout)
            response.raise_for_status()
            content = response.json()["message"]["content"]
        except (httpx.HTTPError, KeyError, ValueError) as exc:
            raise OllamaError(f"chat call failed: {exc}") from exc

        try:
            return json.loads(content)
        except json.JSONDecodeError as exc:
            raise OllamaError(f"model did not return JSON: {content[:200]}") from exc
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /home/chris/side-projects/my-finance/analytics && uv run pytest tests/test_llm_client.py -q && uv run ruff check .`
Expected: PASS (4 passed, ruff clean)

- [ ] **Step 5: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add analytics/pyproject.toml analytics/uv.lock analytics/src/analytics/llm/client.py analytics/tests/test_llm_client.py
git commit -m "feat(analytics): schema-constrained chat call on the Ollama client"
```

---


### Task 9: [MY-37] `interpret()` — prompt assembly, one validation, one retry, then degrade

**Files:**
- Create: `analytics/src/analytics/llm/interpret.py`
- Modify: `docs/LESSONS.md` (append one entry at the end, under `## Entries`)
- Test: `analytics/tests/test_llm_interpret.py`

**Interfaces:**
- Consumes: `OllamaClient.chat_json(messages, schema) -> dict` and `OllamaError` (Task 8); `PLAN_JSON_SCHEMA`, `normalize_emission` (Task 7); `analytics.plan.SUPPORTED_VERSIONS`, `METRICS`, `GROUP_BYS`, `INTERVALS` (MY-29).
- Produces:
  - `CategoryRef(id: int, name: str)` — frozen dataclass; ids + names only, never an amount.
  - `Draft(plan: dict, notes: list[str])` — frozen dataclass, the interpret result.
  - `InterpretFailed(Exception)` with `.problems: list[str]`.
  - `FEW_SHOT: tuple[tuple[str, dict], ...]` — four sentence/plan pairs mirroring the template gallery.
  - `build_messages(text: str, *, categories: Sequence[CategoryRef], current_plan: dict | None, today: date) -> list[dict]`
  - `interpret(text: str, *, categories: Sequence[CategoryRef], current_plan: dict | None, today: date, client: OllamaClient, validate: Callable[[object], list[str]]) -> Draft`

The `validate` callable is injected so the route can bind the real
`validate_plan` to the request's connection and profile, while these tests need
neither a database nor a model.

- [ ] **Step 1: Write the failing test**

```python
# analytics/tests/test_llm_interpret.py
"""Prompt assembly, the single validation gate, and the retry-once-then-degrade path.

The client and the validator are both injected, so this runs in CI with no
model and no database (design delta D11).
"""

import json
from datetime import date

import pytest

from analytics.llm.client import OllamaError
from analytics.llm.interpret import (
    FEW_SHOT,
    CategoryRef,
    InterpretFailed,
    build_messages,
    interpret,
)
from analytics.llm.schema import PLAN_JSON_SCHEMA, RANGE_TYPES
from analytics.plan import GROUP_BYS, INTERVALS, METRICS, RANGE_TYPES, SUPPORTED_VERSIONS

TODAY = date(2026, 9, 4)
CATEGORIES = [CategoryRef(id=12, name="Groceries"), CategoryRef(id=14, name="Transport")]
GOOD_PLAN = {
    "version": 1,
    "metric": "spend",
    "filters": {"categoryId": 12, "includeDescendants": True},
    "interval": "month",
    "range": {"type": "lastMonths", "n": 12},
}


class FakeClient:
    """Returns queued emissions (or raises a queued exception), recording each call."""

    def __init__(self, *emissions):
        self.emissions = list(emissions)
        self.calls: list[list[dict]] = []

    def chat_json(self, messages, schema):
        assert schema is PLAN_JSON_SCHEMA
        self.calls.append(messages)
        emission = self.emissions.pop(0)
        if isinstance(emission, Exception):
            raise emission
        return emission


def accepts_everything(_plan):
    return []


def rejects_everything(_plan):
    return ["metric: unknown value"]


def test_the_prompt_carries_today_the_category_catalogue_and_the_few_shot_pairs():
    messages = build_messages("groceries", categories=CATEGORIES, current_plan=None, today=TODAY)

    system = messages[0]
    assert system["role"] == "system"
    assert "2026-09-04" in system["content"]
    assert "12: Groceries" in system["content"]
    assert "14: Transport" in system["content"]
    # system + one user/assistant pair per example + the question
    assert len(messages) == 1 + 2 * len(FEW_SHOT) + 1
    assert messages[-1] == {"role": "user", "content": "groceries"}


def test_a_follow_up_sends_the_current_plan_to_be_edited():
    messages = build_messages(
        "and only this year?", categories=CATEGORIES, current_plan=GOOD_PLAN, today=TODAY
    )

    last = messages[-1]["content"]
    assert json.dumps(GOOD_PLAN) in last
    assert "and only this year?" in last


def test_a_valid_emission_becomes_a_draft_with_a_category_note():
    client = FakeClient(GOOD_PLAN)

    draft = interpret(
        "monthly groceries",
        categories=CATEGORIES,
        current_plan=None,
        today=TODAY,
        client=client,
        validate=accepts_everything,
    )

    assert draft.plan == GOOD_PLAN
    assert len(client.calls) == 1
    assert draft.notes == [
        "Filtered to category 'Groceries' (id 12) — change the chip if that is the wrong one."
    ]


def test_the_emission_is_cleaned_before_it_is_validated():
    seen = []

    def record(plan):
        seen.append(plan)
        return []

    client = FakeClient({**GOOD_PLAN, "groupBy": None, "range": {"type": "all", "n": 12}})

    draft = interpret(
        "everything",
        categories=CATEGORIES,
        current_plan=None,
        today=TODAY,
        client=client,
        validate=record,
    )

    assert "groupBy" not in seen[0]
    assert seen[0]["range"] == {"type": "all"}
    assert draft.plan == seen[0]


def test_an_invalid_emission_is_retried_once_with_the_problems_quoted_back():
    client = FakeClient({"version": 1, "metric": "total"}, GOOD_PLAN)
    verdicts = [["metric: unknown value 'total'"], []]

    draft = interpret(
        "monthly groceries",
        categories=CATEGORIES,
        current_plan=None,
        today=TODAY,
        client=client,
        validate=lambda _plan: verdicts.pop(0),
    )

    assert len(client.calls) == 2
    retry_prompt = client.calls[1][-1]["content"]
    assert "metric: unknown value 'total'" in retry_prompt
    assert draft.plan == GOOD_PLAN
    assert draft.notes[0] == (
        "The first attempt was rejected (metric: unknown value 'total');"
        " this is the corrected plan."
    )


def test_two_invalid_emissions_surface_the_second_verdict_as_problems():
    client = FakeClient({"version": 1}, {"version": 2})

    with pytest.raises(InterpretFailed) as raised:
        interpret(
            "gibberish",
            categories=CATEGORIES,
            current_plan=None,
            today=TODAY,
            client=client,
            validate=rejects_everything,
        )

    assert raised.value.problems == ["metric: unknown value"]
    assert len(client.calls) == 2


def test_an_unreachable_model_degrades_instead_of_exploding():
    client = FakeClient(OllamaError("chat call failed: connection refused"))

    with pytest.raises(InterpretFailed) as raised:
        interpret(
            "monthly groceries",
            categories=CATEGORIES,
            current_plan=None,
            today=TODAY,
            client=client,
            validate=accepts_everything,
        )

    assert "not reachable" in raised.value.problems[0]


def test_the_few_shot_examples_stay_inside_the_dsl():
    for _sentence, plan in FEW_SHOT:
        assert plan["version"] in SUPPORTED_VERSIONS
        assert plan["metric"] in METRICS
        assert plan.get("groupBy", None) in (*GROUP_BYS, None)
        assert plan.get("interval", None) in (*INTERVALS, None)
        assert plan["range"]["type"] in RANGE_TYPES
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/chris/side-projects/my-finance/analytics && uv run pytest tests/test_llm_interpret.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'analytics.llm.interpret'`

- [ ] **Step 3: Write the interpreter**

```python
# analytics/src/analytics/llm/interpret.py
"""Free text -> a draft plan, from one schema-constrained model call.

The model translates; it never queries and never computes (INSIGHTS.md ->
Principles, 2). Its emission is checked by the SAME validate_plan() the
executor runs (design delta D7) — passed in as a callable so the route can bind
it to the request's connection and profile, and so this module is testable with
neither a database nor a model.

An emission that fails validation is retried exactly once, with the problems
quoted back. A second failure raises InterpretFailed: the explorer opens on the
chips anyway, which is the whole point of the AI being an authoring layer
rather than a capability.
"""

from __future__ import annotations

import json
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import date

from analytics.llm.client import OllamaClient, OllamaError
from analytics.llm.schema import PLAN_JSON_SCHEMA, normalize_emission


@dataclass(frozen=True)
class CategoryRef:
    """What the model is told about a profile: ids and names, nothing else."""

    id: int
    name: str


@dataclass(frozen=True)
class Draft:
    plan: dict
    notes: list[str]


class InterpretFailed(Exception):
    """No usable plan. Carries the problem list the caller returns to the UI."""

    def __init__(self, problems: list[str]) -> None:
        super().__init__("; ".join(problems))
        self.problems = list(problems)


SYSTEM = """You turn a personal-finance question into a query plan.

Answer with the plan JSON only — the response format is enforced, so emit no
prose and no explanation.

Rules:
- Today is {today}. Relative ranges are preferred over absolute dates.
- filters.categoryId must be one of the ids listed below, or left out entirely.
  The ids in the examples are made up; only the ids below exist.
- When you set filters.categoryId, set includeDescendants to true unless the
  question is explicitly about the category on its own.
- Never invent a merchant, an amount or a date that is not in the question.
- Leave a field out rather than guessing at it.

Categories in this profile (id: name):
{categories}"""


# Mirrors the first entries of the template gallery (frontend/src/insights/
# templates.ts) plus INSIGHTS.md's motivating query, so the model is shown the
# same vocabulary the chips teach by example. Keep the two in step.
FEW_SHOT: tuple[tuple[str, dict], ...] = (
    (
        "How much did I spend on Groceries each month over the last year?",
        {
            "version": 1,
            "metric": "spend",
            "filters": {"categoryId": 12, "includeDescendants": True},
            "interval": "month",
            "range": {"type": "lastMonths", "n": 12},
        },
    ),
    (
        "Where did my money go this month?",
        {
            "version": 1,
            "metric": "spend",
            "filters": {},
            "groupBy": "category",
            "range": {"type": "lastMonths", "n": 1},
        },
    ),
    (
        "Am I saving anything this year?",
        {
            "version": 1,
            "metric": "net",
            "filters": {},
            "interval": "month",
            "range": {"type": "yearToDate"},
        },
    ),
    (
        "monthly grocery spend, Lidl vs Biedronka, last 12 months",
        {
            "version": 1,
            "metric": "spend",
            "filters": {
                "categoryId": 12,
                "includeDescendants": True,
                "merchants": ["Lidl", "Biedronka"],
            },
            "groupBy": "merchant",
            "interval": "month",
            "range": {"type": "lastMonths", "n": 12},
        },
    ),
)


def build_messages(
    text: str,
    *,
    categories: Sequence[CategoryRef],
    current_plan: dict | None,
    today: date,
) -> list[dict]:
    """System rules + category catalogue + few-shot pairs + the question."""
    catalogue = "\n".join(f"{c.id}: {c.name}" for c in categories) or "(none yet)"
    messages: list[dict] = [
        {"role": "system", "content": SYSTEM.format(today=today.isoformat(), categories=catalogue)}
    ]
    for question, plan in FEW_SHOT:
        messages.append({"role": "user", "content": question})
        messages.append({"role": "assistant", "content": json.dumps(plan)})

    if current_plan is None:
        messages.append({"role": "user", "content": text})
    else:
        # Editing a JSON object is far more reliable for a small model than
        # re-deriving one (INSIGHTS.md -> "Refinement edits structured state").
        messages.append(
            {
                "role": "user",
                "content": (
                    f"Current plan:\n{json.dumps(current_plan)}\n\n"
                    f"Apply this change and return the whole plan:\n{text}"
                ),
            }
        )
    return messages


def interpret(
    text: str,
    *,
    categories: Sequence[CategoryRef],
    current_plan: dict | None,
    today: date,
    client: OllamaClient,
    validate: Callable[[object], list[str]],
) -> Draft:
    """One call, one retry, then give up and let the chips take over."""
    messages = build_messages(text, categories=categories, current_plan=current_plan, today=today)
    emission = _emit(client, messages)
    notes: list[str] = []

    problems = validate(emission)
    if problems:
        messages = [
            *messages,
            {"role": "assistant", "content": json.dumps(emission)},
            {
                "role": "user",
                "content": (
                    "That plan was rejected: " + "; ".join(problems)
                    + ". Return a corrected plan."
                ),
            },
        ]
        emission = _emit(client, messages)
        retry_problems = validate(emission)
        if retry_problems:
            raise InterpretFailed(retry_problems)
        notes.append(
            "The first attempt was rejected (" + "; ".join(problems)
            + "); this is the corrected plan."
        )

    notes.extend(_category_note(emission, categories))
    return Draft(plan=emission, notes=notes)


def _emit(client: OllamaClient, messages: list[dict]) -> object:
    try:
        return normalize_emission(client.chat_json(messages, PLAN_JSON_SCHEMA))
    except OllamaError as exc:
        raise InterpretFailed([f"the language model is not reachable ({exc})"]) from exc


def _category_note(plan: object, categories: Sequence[CategoryRef]) -> list[str]:
    """Name the category the model picked, so a wrong guess is obvious in the UI."""
    if not isinstance(plan, dict):
        return []
    filters = plan.get("filters")
    category_id = filters.get("categoryId") if isinstance(filters, dict) else None
    name = next((c.name for c in categories if c.id == category_id), None)
    if name is None:
        return []
    return [
        f"Filtered to category '{name}' (id {category_id}) —"
        " change the chip if that is the wrong one."
    ]
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /home/chris/side-projects/my-finance/analytics && uv run pytest tests/test_llm_interpret.py -q && uv run ruff check .`
Expected: PASS (8 passed, ruff clean)

- [ ] **Step 5: Append the LESSONS.md entry**

Append at the end of `docs/LESSONS.md`, after the last entry, keeping the file's three-bullet shape:

```markdown
### Constrained decoding, and why there is still exactly one validator

- **What** — the model is handed a JSON schema in Ollama's `format` field, and
  its output is *still* checked by the same `validate_plan()` the executor runs.
- **Where** — `analytics/src/analytics/llm/schema.py` (the schema, derived from
  `plan.py`'s enums) and `analytics/src/analytics/llm/interpret.py`.
- **Why it's this way** — `format` is not validation: Ollama compiles the schema
  into a grammar and constrains token sampling with it, which gets you
  well-formed JSON with the right key names, and nothing more. It cannot know
  that category id 12 exists in *this* profile, that `merchants` needs the V5
  column, or that `from` must not be after `to`. So the schema is a prompt-side
  hint that removes the "parse the model's prose" problem, while the real gate
  stays the one validator the executor uses — bound to the request's connection
  and profile through a `functools.partial`, which is Python's answer to Spring
  injecting a scoped bean. Two validators would drift the moment the DSL bumps
  to v2. An emission that fails gets one retry with the problems quoted back,
  because small models correct a named mistake far more reliably than they
  avoid it; a second failure degrades to the chips rather than to an error page.
```

- [ ] **Step 6: Append the refinement lesson**

Append to the end of `docs/LESSONS.md`:

```markdown
### refinement as a JSON edit, not a second question

- **What** — a follow-up sends the plan it is editing along with the text, and
  the model returns the modified plan rather than a fresh one.
- **Where** — `analytics/src/analytics/llm/interpret.py` (`build_messages`, the
  `current_plan` branch) and the `currentPlan` field on `POST /api/insights/interpret`.
- **Why it's this way** — "and only this year?" carries almost none of the
  question it refines. A 4 GB model asked to re-derive "monthly grocery spend,
  Lidl vs Biedronka, last 12 months, PLN only" from those four words loses
  most of it; asked to change one field of a JSON object it is holding, it
  succeeds nearly always. The system-design point generalises beyond LLMs:
  when a step is unreliable, give it the smallest possible edit to make and
  keep the state it edits explicit — here the state is the plan, and it stays
  visible to the user as chips between every turn, so a bad edit is obvious
  and reversible instead of a mystery. It is also why this is one endpoint and
  not two: `interpret` with `currentPlan: null` and `interpret` with a plan
  are the same operation with a different starting point.
```

- [ ] **Step 7: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add analytics/src/analytics/llm/interpret.py analytics/tests/test_llm_interpret.py
git commit -m "feat(analytics): interpret free text into a draft plan, validated once and retried once"
```

---


### Task 10: [MY-37] `POST /internal/v1/interpret`

**Files:**
- Modify: `analytics/src/analytics/main.py` (add `InterpretRequest`/`InterpretResponse` models, `from analytics.llm.client import get_ollama_client` (MY-36 owns that dependency — do not redefine it), and the `interpret_route` handler — next to the existing `/internal/v1/execute` handler)
- Test: `analytics/tests/test_llm_interpret_route.py`

- Modify: `docs/INSIGHTS.md` ("The analytics service" → Contract — one new bullet)

**Interfaces:**
- Consumes:
  - `app` (the FastAPI instance), `get_conn` from `analytics/src/analytics/db.py`, `require_token` — the bearer dependency in `analytics/src/analytics/auth.py` (Stage 1, MY-29 Task 5; every `/internal/v1/*` route in all three stages declares exactly this name).
  - `get_settings() -> Settings` and `today(settings) -> date` from `analytics/src/analytics/config.py`; `Settings.ollama_url: str | None`, `Settings.ollama_model: str`, `Settings.analytics_token: str`.
  - `validate_plan(raw, *, profile_id: int, conn, merchant_enabled: bool) -> list[str]` from `analytics/src/analytics/validation.py`.
  - `MERCHANT_ENABLED` — **the same expression `POST /internal/v1/execute` passes to `execute(..., merchant_enabled=...)`** (MY-31; flipped by MY-33). Import that name; do not introduce a second source of truth. If that handler resolves it as a dependency rather than a module constant, take it as a dependency here too.
  - `CategoryRef`, `Draft`, `InterpretFailed`, `interpret` (Task 9); `OllamaClient` (Task 8).
- Produces:
  - `POST /internal/v1/interpret` — body `{"profileId": int, "text": str, "currentPlan": object | null}` → `200 {"plan": {...}, "notes": [...]}` or `422 {"problems": [...]}`; bearer-protected like every `/internal/v1/*` route.
  - Nothing new beyond the route: the Ollama dependency is **MY-36's** `get_ollama_client` from `analytics/src/analytics/llm/client.py`, imported here, never redefined. `main.py` gains `from analytics.llm.client import get_ollama_client` so `app.dependency_overrides[get_ollama_client]` in tests targets the same object the route declares.

- [ ] **Step 1: Write the failing test**

```python
# analytics/tests/test_llm_interpret_route.py
"""POST /internal/v1/interpret — wiring, auth, degradation, and profile scoping.

The model is overridden away; the database is real (the categories the prompt
carries come from it), so this uses the migrated container the executor tests
already run against.
"""

import uuid

import pytest
from fastapi.testclient import TestClient

from analytics.config import get_settings
from analytics.db import get_conn
from analytics.llm.client import get_ollama_client
from analytics.main import app

GOOD_EMISSION = {
    "version": 1,
    "metric": "spend",
    "filters": {"categoryId": None, "includeDescendants": True},
    "interval": "month",
    "range": {"type": "lastMonths", "n": 12},
}


class FakeClient:
    def __init__(self, *emissions):
        self.emissions = list(emissions)
        self.calls: list[list[dict]] = []

    def chat_json(self, messages, schema):
        self.calls.append(messages)
        return self.emissions.pop(0)


@pytest.fixture
def profile(conn):
    """A user, a profile and two categories, created straight through SQL."""
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO app_user (email, password_hash, display_name)"
            " VALUES (%s, 'x', 'Kasia') RETURNING id",
            (f"interpret-{uuid.uuid4()}@example.com",),
        )
        user_id = cur.fetchone()[0]
        cur.execute(
            "INSERT INTO profile (user_id, name, default_currency)"
            " VALUES (%s, 'Personal', 'PLN') RETURNING id",
            (user_id,),
        )
        profile_id = cur.fetchone()[0]
        cur.execute(
            "INSERT INTO category (profile_id, parent_id, name)"
            " VALUES (%s, NULL, 'Groceries') RETURNING id",
            (profile_id,),
        )
        groceries = cur.fetchone()[0]
        cur.execute(
            "INSERT INTO category (profile_id, parent_id, name) VALUES (%s, NULL, 'Transport')",
            (profile_id,),
        )
    conn.commit()
    return {"id": profile_id, "groceries": groceries}


@pytest.fixture
def client(conn):
    app.dependency_overrides[get_conn] = lambda: conn
    yield TestClient(app)
    app.dependency_overrides.clear()


def auth() -> dict:
    return {"Authorization": f"Bearer {get_settings().analytics_token}"}


def use_model(fake: FakeClient) -> None:
    app.dependency_overrides[get_ollama_client] = lambda: fake


def test_a_sentence_comes_back_as_a_draft_plan_with_notes(client, profile):
    filters = {"categoryId": profile["groceries"], "includeDescendants": True}
    use_model(FakeClient({**GOOD_EMISSION, "filters": filters}))

    response = client.post(
        "/internal/v1/interpret",
        json={"profileId": profile["id"], "text": "monthly groceries", "currentPlan": None},
        headers=auth(),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["plan"]["metric"] == "spend"
    assert body["plan"]["filters"]["categoryId"] == profile["groceries"]
    assert "Groceries" in body["notes"][0]


def test_the_prompt_only_ever_lists_the_requested_profiles_categories(client, profile, conn):
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO app_user (email, password_hash, display_name)"
            " VALUES (%s, 'x', 'Other') RETURNING id",
            (f"other-{uuid.uuid4()}@example.com",),
        )
        other_user = cur.fetchone()[0]
        cur.execute(
            "INSERT INTO profile (user_id, name, default_currency)"
            " VALUES (%s, 'Other', 'EUR') RETURNING id",
            (other_user,),
        )
        other_profile = cur.fetchone()[0]
        cur.execute(
            "INSERT INTO category (profile_id, parent_id, name) VALUES (%s, NULL, 'Their Secrets')",
            (other_profile,),
        )
    conn.commit()
    fake = FakeClient({**GOOD_EMISSION, "filters": {}})
    use_model(fake)

    client.post(
        "/internal/v1/interpret",
        json={"profileId": profile["id"], "text": "anything", "currentPlan": None},
        headers=auth(),
    )

    system = fake.calls[0][0]["content"]
    assert "Groceries" in system
    assert "Their Secrets" not in system


def test_two_rejected_emissions_are_422_with_a_bare_problems_array(client, profile):
    bad = {
        "version": 1, "metric": "spend",
        "filters": {"categoryId": 999999}, "range": {"type": "all"},
    }
    use_model(FakeClient(bad, bad))

    response = client.post(
        "/internal/v1/interpret",
        json={"profileId": profile["id"], "text": "nonsense", "currentPlan": None},
        headers=auth(),
    )

    assert response.status_code == 422
    assert response.json()["problems"]
    assert "detail" not in response.json()


def test_interpretation_is_unavailable_when_no_model_is_configured(client, profile):
    app.dependency_overrides[get_ollama_client] = lambda: None

    response = client.post(
        "/internal/v1/interpret",
        json={"profileId": profile["id"], "text": "anything", "currentPlan": None},
        headers=auth(),
    )

    assert response.status_code == 422
    assert response.json()["problems"] == ["interpretation is not available on this instance"]


def test_the_route_needs_the_bearer_token(client, profile):
    use_model(FakeClient(GOOD_EMISSION))

    response = client.post(
        "/internal/v1/interpret",
        json={"profileId": profile["id"], "text": "anything", "currentPlan": None},
    )

    assert response.status_code == 401
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/chris/side-projects/my-finance/analytics && uv run pytest tests/test_llm_interpret_route.py -q`
Expected: FAIL with `assert 404 == 200` on `test_a_sentence_comes_back_as_a_draft_plan_with_notes` — collection succeeds (`get_ollama_client` has existed in `analytics.llm.client` since Task 2), the route simply is not registered yet

- [ ] **Step 3: Add the dependency, the models and the handler**

In `analytics/src/analytics/main.py`, next to the `/internal/v1/execute` handler:

```python
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


@app.post("/internal/v1/interpret", response_model=InterpretResponse)
def interpret_route(
    body: InterpretRequest,
    conn: Annotated[Connection, Depends(get_conn)],
    settings: Annotated[Settings, Depends(get_settings)],
    client: Annotated[OllamaClient | None, Depends(get_ollama_client)],
    _: Annotated[None, Depends(require_token)],
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
        merchant_enabled=True,  # same literal the /internal/v1/execute handler passes after MY-33,
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
```

Type the `conn` parameter exactly the way the `/internal/v1/execute` handler
types its own connection parameter; the `Connection` annotation above assumes
`from psycopg import Connection`, so add that import if the execute handler
does not already have it.

Imports to add at the top of `main.py`:

```python
from functools import partial

from fastapi.responses import JSONResponse
from psycopg import Connection

from analytics.llm.client import OllamaClient, get_ollama_client
from analytics.llm.interpret import CategoryRef, InterpretFailed, interpret
from analytics.validation import validate_plan
```

`validate_plan` is the one that is easy to miss: Stage 1's `main.py` imports
`PlanProblems` and `execute` from `analytics.executor` and `MERCHANT_ENABLED` from
`analytics.plan`, but never `validate_plan` — the executor calls it internally. This
handler calls it directly, so without this line the first request raises
`NameError: name 'validate_plan' is not defined`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /home/chris/side-projects/my-finance/analytics && uv run pytest tests/test_llm_interpret_route.py -q && uv run ruff check .`
Expected: PASS (5 passed, ruff clean)

- [ ] **Step 5: Record the route in `docs/INSIGHTS.md`**

`docs/INSIGHTS.md` → "The analytics service" → **Contract** currently lists only
`POST /internal/v1/execute` and `GET /internal/health`. CLAUDE.md requires the doc to move
with the code, and Task 17 later anchors its own edit *after* these bullets — so they have
to exist. Append to that list, matching the style of the `execute` bullet:

```markdown
  - `POST /internal/v1/interpret` — body `{"profileId": 3, "text": "...", "currentPlan": {...} | null}` → `200 {"plan": {...}, "notes": [...]}`, or `422 {"problems": [...]}` when the model cannot be reached or emits a plan the validator rejects twice. The draft is validated by the same `validate_plan` the executor uses, and lands in the explorer as editable chips.
```

- [ ] **Step 6: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add analytics/src/analytics/main.py analytics/tests/test_llm_interpret_route.py docs/INSIGHTS.md
git commit -m "feat(analytics): POST /internal/v1/interpret, profile categories resolved server-side"
```

---


### Task 11: [MY-37] Backend pass-through `POST /api/insights/interpret`

**Files:**
- Create: `backend/src/main/java/com/myfinance/backend/dto/InterpretRequest.java`
- Create: `backend/src/main/java/com/myfinance/backend/exception/InterpretFailedException.java`
- Modify: `backend/src/main/java/com/myfinance/backend/service/AnalyticsClient.java` (add the `interpret` method and the `problemList` helper)
- Modify: `backend/src/main/java/com/myfinance/backend/service/InsightService.java` (add `interpret`)
- Modify: `backend/src/main/java/com/myfinance/backend/controller/InsightController.java` (add the `POST /interpret` mapping)
- Modify: `docs/API.md` (Insights section: new subsection, the Phase 5 blockquote, the `422` row of the status-code summary)
- Test: `backend/src/test/java/com/myfinance/backend/controller/InsightInterpretTest.java`

**Interfaces:**
- Consumes: `AnalyticsClient` (MY-30/MY-31) — a `@Service` holding `private final RestClient restClient;` built with the base URL from `AnalyticsProperties` and the bearer header applied by the builder, plus `private final JsonMapper jsonMapper;`. `InsightService` (MY-30) with `private final ActiveProfile activeProfile;` and `private final AnalyticsClient analyticsClient;`. `InsightController` with `@RequestMapping("/api/insights")`. `AnalyticsUnavailableException` (MY-30). `ApiException` and `@IntegrationTest` / `TestFixtures` as they exist.
- Produces:
  - `dto/InterpretRequest(String text, JsonNode currentPlan)` — **no `profileId` field**; the profile comes from the session.
  - `AnalyticsClient.interpret(Long profileId, String text, JsonNode currentPlan) -> JsonNode`
  - `InsightService.interpret(InterpretRequest request) -> JsonNode`
  - `InsightController.interpret(@Valid @RequestBody InterpretRequest) -> JsonNode` at `POST /api/insights/interpret`
  - `InterpretFailedException(List<String> problems)` → `422 /errors/interpret-failed`, `problems` extension.

- [ ] **Step 1: Write the failing test**

```java
// backend/src/test/java/com/myfinance/backend/controller/InsightInterpretTest.java
package com.myfinance.backend.controller;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.myfinance.backend.model.Profile;
import com.myfinance.backend.model.User;
import com.myfinance.backend.support.IntegrationTest;
import com.myfinance.backend.support.TestFixtures;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/**
 * POST /api/insights/interpret against a stub analytics service (a JDK
 * HttpServer on an ephemeral port) — the pass-through, the error translation,
 * and above all that the profile forwarded is the session's, never the body's.
 */
@IntegrationTest
class InsightInterpretTest {

    private static HttpServer analytics;
    private static volatile int stubStatus = 200;
    private static volatile String stubBody = "{}";
    private static volatile String receivedBody = "";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private TestFixtures fixtures;

    private User user;
    private Profile profile;

    @BeforeAll
    static void startStub() throws IOException {
        analytics = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        analytics.createContext("/internal/v1/interpret", exchange -> {
            receivedBody = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            byte[] out = stubBody.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(stubStatus, out.length);
            try (OutputStream body = exchange.getResponseBody()) {
                body.write(out);
            }
        });
        analytics.start();
    }

    @AfterAll
    static void stopStub() {
        analytics.stop(0);
    }

    @DynamicPropertySource
    static void analyticsBaseUrl(DynamicPropertyRegistry registry) {
        registry.add("analytics.base-url", () -> "http://127.0.0.1:" + analytics.getAddress().getPort());
    }

    @BeforeEach
    void setUp() {
        stubStatus = 200;
        stubBody = """
                {"plan": {"version": 1, "metric": "spend", "filters": {}, "range": {"type": "all"}},
                 "notes": ["Filtered to category 'Groceries' (id 12)."]}
                """;
        receivedBody = "";
        user = fixtures.user("kasia@example.com");
        profile = fixtures.profile(user, "Personal", "PLN");
    }

    private static String body(String text) {
        return """
                {"text": "%s", "currentPlan": null}
                """.formatted(text);
    }

    @Test
    void interpretPassesTheDraftThroughAndForwardsTheSessionProfile() throws Exception {
        mockMvc.perform(post("/api/insights/interpret").with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("monthly groceries")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.plan.metric").value("spend"))
                .andExpect(jsonPath("$.notes[0]", containsString("Groceries")));

        Assertions.assertThat(receivedBody)
                .contains("\"profileId\":" + profile.getId())
                .contains("monthly groceries");
    }

    @Test
    void interpretIgnoresAClientSuppliedProfileId() throws Exception {
        mockMvc.perform(post("/api/insights/interpret").with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"text\": \"anything\", \"profileId\": 999999}"))
                // Boot leaves FAIL_ON_UNKNOWN_PROPERTIES off, so the stray field is
                // dropped and this is a 200. If it turns out to be a 400, the property
                // under test holds even more strongly — flip the expectation.
                .andExpect(status().isOk());

        Assertions.assertThat(receivedBody)
                .contains("\"profileId\":" + profile.getId())
                .doesNotContain("999999");
    }

    @Test
    void analyticsRejectionBecomes422InterpretFailedWithProblems() throws Exception {
        stubStatus = 422;
        stubBody = "{\"problems\": [\"could not interpret\"]}";

        mockMvc.perform(post("/api/insights/interpret").with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("gibberish")))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.type").value("/errors/interpret-failed"))
                .andExpect(jsonPath("$.problems[0]").value("could not interpret"));
    }

    @Test
    void analyticsFailureBecomes503() throws Exception {
        stubStatus = 500;
        stubBody = "{}";

        mockMvc.perform(post("/api/insights/interpret").with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("anything")))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.type").value("/errors/analytics-unavailable"));
    }

    @Test
    void blankTextIs400() throws Exception {
        mockMvc.perform(post("/api/insights/interpret").with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("   ")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("/errors/validation-failed"));
    }

    @Test
    void interpretWithoutActiveProfileIs409() throws Exception {
        mockMvc.perform(post("/api/insights/interpret").with(fixtures.as(user))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("anything")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("/errors/no-active-profile"));
    }

    @Test
    void unauthenticatedIs401() throws Exception {
        mockMvc.perform(post("/api/insights/interpret")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("anything")))
                .andExpect(status().isUnauthorized());
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/chris/side-projects/my-finance/backend && ./mvnw test -Dtest=InsightInterpretTest`
Expected: FAIL at test-compile with `cannot find symbol: class InterpretRequest` (the DTO, the service method and the mapping do not exist yet)

- [ ] **Step 3: Add the DTO and the exception**

```java
// backend/src/main/java/com/myfinance/backend/dto/InterpretRequest.java
package com.myfinance.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import tools.jackson.databind.JsonNode;

/**
 * POST /api/insights/interpret — free text, plus the plan being refined (or
 * null for a fresh question).
 *
 * <p>There is deliberately no {@code profileId}: the analytics service is told
 * which profile to read by the backend, from the session (ARCHITECTURE.md §3).
 */
public record InterpretRequest(
        @NotBlank @Size(max = 500) String text,
        JsonNode currentPlan) {
}
```

```java
// backend/src/main/java/com/myfinance/backend/exception/InterpretFailedException.java
package com.myfinance.backend.exception;

import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;

/**
 * The model could not produce a usable plan (analytics answered 422). Not a
 * bug and not a bad request — the explorer opens on the chips instead.
 */
public class InterpretFailedException extends ApiException {

    private final List<String> problems;

    public InterpretFailedException(List<String> problems) {
        super(HttpStatus.UNPROCESSABLE_CONTENT, "interpret-failed", "Could not interpret that",
                "The model did not produce a usable plan; build the insight with the chips instead.");
        this.problems = List.copyOf(problems);
    }

    @Override
    protected void addExtensions(ProblemDetail problem) {
        problem.setProperty("problems", problems);
    }
}
```

- [ ] **Step 4: Add the client call, the service method and the mapping**

In `AnalyticsClient.java`:

```java
    /** POST /internal/v1/interpret — free text to a draft plan (Phase 5). */
    public JsonNode interpret(Long profileId, String text, JsonNode currentPlan) {
        ObjectNode body = jsonMapper.createObjectNode();
        body.put("profileId", profileId);
        body.put("text", text);
        body.set("currentPlan", currentPlan == null ? jsonMapper.nullNode() : currentPlan);
        try {
            return restClient.post()
                    .uri("/internal/v1/interpret")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .onStatus(status -> status.value() == 422,
                            (request, response) -> throwInterpretFailed(response))
                    .onStatus(HttpStatusCode::isError,
                            (request, response) -> {
                                throw new AnalyticsUnavailableException();
                            })
                    .body(JsonNode.class);
        } catch (ResourceAccessException ex) {
            throw new AnalyticsUnavailableException();
        }
    }

    /** The analytics service's {@code {"problems": [...]}} body, as an exception. */
    private void throwInterpretFailed(ClientHttpResponse response) throws IOException {
        JsonNode body = jsonMapper.readTree(response.getBody());
        List<String> problems = new ArrayList<>();
        for (JsonNode problem : body.path("problems").values()) {
            problems.add(problem.asString());
        }
        throw new InterpretFailedException(problems);
    }
```

Imports to add: `java.io.IOException`, `java.util.ArrayList`, `java.util.List`,
`org.springframework.http.HttpStatusCode`, `org.springframework.http.MediaType`,
`org.springframework.http.client.ClientHttpResponse`,
`org.springframework.web.client.ResourceAccessException`,
`tools.jackson.databind.JsonNode`, `tools.jackson.databind.node.ObjectNode`,
`com.myfinance.backend.exception.InterpretFailedException`.

In `InsightService.java`:

```java
    /** Free text -> a draft plan, for the profile the session says is active. */
    public JsonNode interpret(InterpretRequest request) {
        Long profileId = activeProfile.requireId();
        return analyticsClient.interpret(profileId, request.text(), request.currentPlan());
    }
```

In `InsightController.java`, next to the other exact-segment mappings:

```java
    /** Free text -> a draft plan the explorer opens as editable chips (Phase 5). */
    @PostMapping("/interpret")
    public JsonNode interpret(@Valid @RequestBody InterpretRequest request) {
        return insightService.interpret(request);
    }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd /home/chris/side-projects/my-finance/backend && ./mvnw test -Dtest=InsightInterpretTest`
Expected: PASS (Tests run: 7, Failures: 0, Errors: 0)

- [ ] **Step 6: Update `docs/API.md`**

In the Insights section, after `### DELETE /api/insights/{id}`, add:

````markdown
### `POST /api/insights/interpret`

Phase 5, optional. Free text in, a **draft plan** out — the plan lands in the
explorer as editable chips and is executed by the normal executor, exactly like
a hand-built one. Available only when `GET /api/insights/capabilities` reports
`interpret: true`.

**Request**

| Field | Type | Validation |
|---|---|---|
| `text` | string | `@NotBlank` `@Size(max = 500)` — the question, or the follow-up |
| `currentPlan` | object or null | The plan being refined; `null` for a fresh question. Editing a plan is far more reliable for a small model than re-deriving one |

There is deliberately **no `profileId`**: the backend forwards the session's
active profile, and the analytics service resolves that profile's category
names itself — no category list ever crosses this endpoint.

**Response `200 OK`**

```json
{
  "plan": { "version": 1, "metric": "spend", "filters": { "categoryId": 12 },
            "interval": "month", "range": { "type": "lastMonths", "n": 12 } },
  "notes": ["Filtered to category 'Groceries' (id 12) — change the chip if that is the wrong one."]
}
```

| Status | When |
|---|---|
| `200` | A draft plan was produced. It is a *draft*: nothing has executed yet |
| `400` | Validation failure (`text` blank or over 500 characters) |
| `401` / `409` | Not authenticated / no active profile |
| `422` | No usable plan after one retry, or interpretation is switched off on this instance (`/errors/interpret-failed`, with a `problems` array) — the UI says "couldn't interpret that" and opens the chips |
| `503` | Analytics service unreachable (`/errors/analytics-unavailable`) |

The model never queries data and never does arithmetic (`INSIGHTS.md` →
Principles): it emits a plan, that plan is validated by the executor's own
validator, and every number the user then sees comes from SQL.
````

Replace the trailing Phase 5 blockquote so it names only what is still missing:

```markdown
> Phase 5 also adds a narration endpoint (result envelope → caption) — contract
> to be added to this section when `MY-38` lands, per `INSIGHTS.md` → "The AI
> layer".
```

And in the status-code summary table, extend the `422` row:

```markdown
| `422` | Body is valid but violates a domain rule: depth limit, category cycle, invalid backup content, or free text the model could not turn into a plan |
```

- [ ] **Step 7: Run the full backend suite**

Run: `cd /home/chris/side-projects/my-finance/backend && ./mvnw -B verify`
Expected: PASS (BUILD SUCCESS)

- [ ] **Step 8: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add backend/src/main/java/com/myfinance/backend/dto/InterpretRequest.java \
        backend/src/main/java/com/myfinance/backend/exception/InterpretFailedException.java \
        backend/src/main/java/com/myfinance/backend/service/AnalyticsClient.java \
        backend/src/main/java/com/myfinance/backend/service/InsightService.java \
        backend/src/main/java/com/myfinance/backend/controller/InsightController.java \
        backend/src/test/java/com/myfinance/backend/controller/InsightInterpretTest.java \
        docs/API.md
git commit -m "feat(backend): POST /api/insights/interpret pass-through with 422 interpret-failed"
```

---


### Task 12: [MY-37] The AI search box

**Files:**
- Modify: `frontend/src/api/types.ts` (add `InterpretRequest` / `InterpretResponse` to the `// — Insights —` block)
- Modify: `frontend/src/api/hooks.ts` (add `useInterpret`)
- Create: `frontend/src/insights/AiSearchBox.tsx`
- Modify: `frontend/src/screens/Insights.tsx` (mount the box above the chip bar)

**Interfaces:**
- Consumes: `api<T>()` and `ApiError` from `frontend/src/api/client.ts`; `Plan` from `frontend/src/api/types.ts` (MY-32); `useAiCapabilities()` from `frontend/src/api/hooks.ts` (MY-36), returning `UseQueryResult<AiCapabilities>`; `Card` from `frontend/src/components/Card.tsx`; `Insights.tsx` (MY-32) exposes `const plan: Plan` and `const setPlan = (next: Plan) => void`; `setPlan` writes `?plan=` via `setSearchParams(..., { replace: true })` — it is **not** `useState`, so always pass a complete `Plan`, never a functional update.
- Produces:
  - `interface InterpretRequest { text: string; currentPlan: Plan | null }`
  - `interface InterpretResponse { plan: Plan; notes: string[] }`
  - `useInterpret()` — `UseMutationResult<InterpretResponse, unknown, InterpretRequest>`
  - `AiSearchBox({ onDraft }: { onDraft: (plan: Plan) => void })` — renders nothing when interpretation is unavailable.

**No test-first cycle here, stated per CLAUDE.md:** the frontend has no unit
test harness (its only automated test is `e2e/smoke.spec.ts` against a real
backend, and per R9 that suite is not in CI). Verification is `npm run build`,
which runs `tsc -b` with `strict` + `noUnusedLocals` before bundling, plus the
local run in Step 5.

- [ ] **Step 1: Run the design pass**

Invoke the `frontend-design` skill for the search window before writing the
component — design delta D9 calls for it here as it did for the chip builder.
Keep the tokens and classes from `src/styles.css` (theme is dark-only, R7); any
new class goes in `src/app.css`, never in `src/styles.css`.

- [ ] **Step 2: Add the DTO types**

At the end of the `// — Insights —` block in `frontend/src/api/types.ts`:

```ts
/** POST /api/insights/interpret — free text in, a draft plan out (Phase 5). */
export interface InterpretRequest {
  text: string;
  /** The plan being refined, or null for a fresh question. */
  currentPlan: Plan | null;
}

export interface InterpretResponse {
  plan: Plan;
  /** Human-readable things the interpreter did, e.g. which category it picked. */
  notes: string[];
}
```

- [ ] **Step 3: Add the hook**

In `frontend/src/api/hooks.ts`, next to `useExecutePlan` (and add
`InterpretRequest`, `InterpretResponse` to the existing `import type` list from
`./types`):

```ts
/** POST /api/insights/interpret — the AI search box's only call. Nothing cached changes. */
export function useInterpret() {
  return useMutation({
    mutationFn: (body: InterpretRequest) =>
      api<InterpretResponse>('/api/insights/interpret', { method: 'POST', body }),
  });
}
```

- [ ] **Step 4: Write the component and mount it**

```tsx
// frontend/src/insights/AiSearchBox.tsx
import { useState } from 'react';
import { ApiError } from '../api/client';
import { useAiCapabilities, useInterpret } from '../api/hooks';
import type { Plan } from '../api/types';
import { Card } from '../components/Card';

/**
 * Free-text authoring for an insight. The model only translates: the draft it
 * returns lands in the chip bar as ordinary editable state and runs through the
 * normal executor (INSIGHTS.md -> The AI layer).
 *
 * When interpretation is unavailable — no Ollama container on this instance —
 * the box renders nothing at all and the templates and chips below carry on
 * unchanged. No feature exists only behind the AI.
 */
export function AiSearchBox({ onDraft }: { onDraft: (plan: Plan) => void }) {
  const capabilities = useAiCapabilities();
  const interpret = useInterpret();
  const [text, setText] = useState('');
  const [notes, setNotes] = useState<string[]>([]);
  const [error, setError] = useState('');

  if (capabilities.data?.interpret !== true) return null;

  const ask = () => {
    const question = text.trim();
    if (question === '') return;
    setError('');
    interpret.mutate(
      { text: question, currentPlan: null },
      {
        onSuccess: (draft) => {
          setNotes(draft.notes);
          onDraft(draft.plan);
        },
        onError: (err) => {
          setNotes([]);
          if (err instanceof ApiError && err.type === '/errors/interpret-failed') {
            setError("Couldn't interpret that — build it with the chips below.");
          } else if (err instanceof ApiError && err.type === '/errors/analytics-unavailable') {
            setError("The analytics service isn't running.");
          } else {
            setError('Something went wrong — is the backend running?');
          }
        },
      },
    );
  };

  return (
    <Card style={{ padding: '18px 20px', marginBottom: 24 }}>
      <div className="kicker">Ask a question</div>
      <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
        <input
          id="ai-question"
          className="input"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') ask();
          }}
          placeholder="e.g. monthly grocery spend, Lidl vs Biedronka, last 12 months"
          aria-label="Ask about your money"
        />
        <button
          className="btn btn-primary"
          onClick={ask}
          disabled={interpret.isPending || text.trim() === ''}
        >
          {interpret.isPending ? 'Thinking…' : 'Ask'}
        </button>
      </div>
      {notes.length > 0 && (
        <ul className="text-muted" style={{ fontSize: 12, margin: '10px 0 0', paddingLeft: 18 }}>
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
      {error !== '' && (
        <div className="error-box" style={{ marginTop: 10, fontSize: 12 }}>
          {error}
        </div>
      )}
      <div className="text-muted" style={{ fontSize: 12, marginTop: 10 }}>
        The model only fills in the chips below — every number comes from your own transactions.
      </div>
    </Card>
  );
}
```

In `frontend/src/screens/Insights.tsx`, import it and mount it directly above
the chip bar, handing it the setter for the working plan. Stage 1 names it
`setPlan` (Tasks 33/36) and it writes `?plan=` through `setSearchParams(...,
{ replace: true })` rather than `useState`, so it always takes a complete `Plan`:

```tsx
import { AiSearchBox } from '../insights/AiSearchBox';
```
```tsx
      <AiSearchBox onDraft={setPlan} />
```

- [ ] **Step 5: Verify the build and the behaviour**

Run: `cd /home/chris/side-projects/my-finance/frontend && npm run build`
Expected: PASS (`tsc -b` clean, `vite build` writes `dist/`)

Then, locally, with the stack up (`docker compose --profile ai up -d`): the box
appears on `/insights`, a sentence fills the chips, and with the `ai` profile
stopped the box disappears while the chips still work.

- [ ] **Step 6: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add frontend/src/api/types.ts frontend/src/api/hooks.ts \
        frontend/src/insights/AiSearchBox.tsx frontend/src/screens/Insights.tsx
git commit -m "feat(frontend): AI search box — free text to draft chips, hidden when interpretation is off"
```

---


### Task 13: [MY-37] Golden sentence→plan suite, local only

**Files:**
- Create: `analytics/tests/fixtures/golden_llm/sentences.json`
- Create: `analytics/tests/test_llm_golden.py`
- Create: `analytics/scripts/golden-llm.sh`
- Modify: `analytics/README.md` (a "Golden LLM suite (local only)" section)
- Modify: `docs/LESSONS.md` (append one entry)

**Interfaces:**
- Consumes: `interpret`, `CategoryRef` (Task 9); `OllamaClient` (Task 8); `get_settings()` with `ollama_url` / `ollama_model` (MY-29 + MY-36); the `ollama` compose profile and its `OLLAMA_MODEL` env default (MY-36).
- Produces: `analytics/scripts/golden-llm.sh` — the only entry point that sets `RUN_LLM_GOLDEN=1`; nothing else runs a model, so CI never does (design delta D11).

- [ ] **Step 1: Write the failing golden test**

```python
# analytics/tests/test_llm_golden.py
"""Sentence -> plan against a REAL model. Local only (design delta D11).

CI never pulls or runs a model: everything here is skipped unless
RUN_LLM_GOLDEN=1, which only scripts/golden-llm.sh sets. Run it before merging
Phase 5 work, and again after an Ollama or model upgrade — small models are not
bit-stable across releases, and a regression there is caught here or nowhere.

This suite measures the MODEL, so the validator is deliberately a no-op: a plan
that misses is a failed assertion, not a silent retry.
"""

from __future__ import annotations

import json
import os
from datetime import date
from pathlib import Path

import pytest

from analytics.config import get_settings
from analytics.llm.client import OllamaClient
from analytics.llm.interpret import CategoryRef, interpret

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_LLM_GOLDEN") != "1",
    reason="needs a real Ollama; run analytics/scripts/golden-llm.sh",
)

FIXTURES = json.loads(
    (Path(__file__).parent / "fixtures" / "golden_llm" / "sentences.json")
    .read_text(encoding="utf-8")
)
CATEGORIES = [CategoryRef(id=c["id"], name=c["name"]) for c in FIXTURES["categories"]]
TODAY = date.fromisoformat(FIXTURES["today"])


@pytest.mark.parametrize(
    "case", FIXTURES["cases"], ids=[case["sentence"][:40] for case in FIXTURES["cases"]]
)
def test_a_sentence_becomes_the_expected_plan(case):
    settings = get_settings()
    client = OllamaClient(base_url=settings.ollama_url, model=settings.ollama_model)

    draft = interpret(
        case["sentence"],
        categories=CATEGORIES,
        current_plan=case.get("currentPlan"),
        today=TODAY,
        client=client,
        validate=lambda _plan: [],
    )

    # Dict equality: key order is the model's business, content is ours.
    assert draft.plan == case["plan"]
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /home/chris/side-projects/my-finance/analytics && RUN_LLM_GOLDEN=1 uv run pytest tests/test_llm_golden.py -q`
Expected: FAIL with `FileNotFoundError: ... tests/fixtures/golden_llm/sentences.json`

- [ ] **Step 3: Write the fixture set**

```json
{
  "today": "2026-09-04",
  "categories": [
    { "id": 12, "name": "Groceries" },
    { "id": 14, "name": "Transport" },
    { "id": 15, "name": "Eating out" },
    { "id": 16, "name": "Salary" }
  ],
  "cases": [
    {
      "sentence": "How much did I spend on groceries each month over the last year?",
      "plan": {
        "version": 1,
        "metric": "spend",
        "filters": { "categoryId": 12, "includeDescendants": true },
        "interval": "month",
        "range": { "type": "lastMonths", "n": 12 }
      }
    },
    {
      "sentence": "Where did my money go this month?",
      "plan": {
        "version": 1,
        "metric": "spend",
        "filters": {},
        "groupBy": "category",
        "range": { "type": "lastMonths", "n": 1 }
      }
    },
    {
      "sentence": "monthly grocery spend, Lidl vs Biedronka, last 12 months",
      "plan": {
        "version": 1,
        "metric": "spend",
        "filters": {
          "categoryId": 12,
          "includeDescendants": true,
          "merchants": ["Lidl", "Biedronka"]
        },
        "groupBy": "merchant",
        "interval": "month",
        "range": { "type": "lastMonths", "n": 12 }
      }
    },
    {
      "sentence": "What have I earned so far this year?",
      "plan": {
        "version": 1,
        "metric": "income",
        "filters": {},
        "range": { "type": "yearToDate" }
      }
    },
    {
      "sentence": "Am I saving money? Show net by month since the start of the year.",
      "plan": {
        "version": 1,
        "metric": "net",
        "filters": {},
        "interval": "month",
        "range": { "type": "yearToDate" }
      }
    },
    {
      "sentence": "transport spending between 1 January and 30 June 2026",
      "plan": {
        "version": 1,
        "metric": "spend",
        "filters": { "categoryId": 14, "includeDescendants": true },
        "range": { "type": "absolute", "from": "2026-01-01", "to": "2026-06-30" }
      }
    },
    {
      "sentence": "eating out, week by week, last 3 months",
      "plan": {
        "version": 1,
        "metric": "spend",
        "filters": { "categoryId": 15, "includeDescendants": true },
        "interval": "week",
        "range": { "type": "lastMonths", "n": 3 }
      }
    },
    {
      "sentence": "And only this year?",
      "currentPlan": {
        "version": 1,
        "metric": "spend",
        "filters": { "categoryId": 12, "includeDescendants": true },
        "interval": "month",
        "range": { "type": "lastMonths", "n": 12 }
      },
      "plan": {
        "version": 1,
        "metric": "spend",
        "filters": { "categoryId": 12, "includeDescendants": true },
        "interval": "month",
        "range": { "type": "yearToDate" }
      }
    }
  ]
}
```

- [ ] **Step 4: Write the local runner**

```bash
#!/usr/bin/env bash
# Sentence -> plan golden suite against a REAL model. Local only, never CI
# (design delta D11): a multi-gigabyte pull plus CPU inference on every PR is
# how a job goes permanently red and everyone learns to ignore it.
#
#   ./scripts/golden-llm.sh                            # the pinned default model
#   OLLAMA_MODEL=llama3.2:3b ./scripts/golden-llm.sh   # benchmark a candidate
set -eu

cd "$(dirname "$0")/.."

: "${OLLAMA_URL:=http://localhost:11434}"
: "${OLLAMA_MODEL:=qwen3:4b}"
export OLLAMA_URL OLLAMA_MODEL
export RUN_LLM_GOLDEN=1

if ! curl -fsS -o /dev/null "$OLLAMA_URL/api/version"; then
  echo "Error: no Ollama answering at $OLLAMA_URL."
  echo "Start it with: docker compose --profile ai up -d ollama"
  exit 1
fi

if ! curl -fsS "$OLLAMA_URL/api/tags" | grep -q "\"$OLLAMA_MODEL\""; then
  echo "Error: the model $OLLAMA_MODEL is not pulled."
  echo "Pull it with: docker compose --profile ai exec ollama ollama pull $OLLAMA_MODEL"
  exit 1
fi

echo "Golden suite against $OLLAMA_MODEL:"
uv run pytest tests/test_llm_golden.py -v
```

```bash
chmod +x /home/chris/side-projects/my-finance/analytics/scripts/golden-llm.sh
```

Add to `analytics/README.md`, after the existing test section:

````markdown
## Golden LLM suite (local only)

The sentence → plan fixtures in `tests/fixtures/golden_llm/` run against a real
model and are **never** part of CI (design delta D11 — CI stubs the Ollama
client and asserts prompt assembly, schema validation, and the
retry-once-then-degrade path instead).

```bash
docker compose --profile ai up -d ollama
cd analytics && ./scripts/golden-llm.sh
```

Run it before merging Phase 5 work, and after any Ollama or model upgrade.
Point it at a candidate model with `OLLAMA_MODEL=<tag> ./scripts/golden-llm.sh`.
````

- [ ] **Step 5: Run the suite, and check CI stays model-free**

Run: `cd /home/chris/side-projects/my-finance/analytics && ./scripts/golden-llm.sh`
Expected: PASS (8 passed)

Run: `cd /home/chris/side-projects/my-finance/analytics && uv run pytest -q`
Expected: PASS with the golden cases reported as skipped (`8 skipped`) — this is the check that CI never touches a model.

- [ ] **Step 6: Append the LESSONS.md entry**

Append at the end of `docs/LESSONS.md`:

```markdown
### A test suite that is deliberately not in CI

- **What** — the sentence → plan golden fixtures run only from a script that
  sets `RUN_LLM_GOLDEN=1`; CI runs the stubbed tests and never pulls a model.
- **Where** — `analytics/scripts/golden-llm.sh`, `analytics/tests/test_llm_golden.py`
  (the `pytest.mark.skipif` at the top), and design delta D11.
- **Why it's this way** — the reflex from `pytest`-and-`tox` habits is that every
  test belongs in CI, and the reflex is wrong here for two reasons. A
  multi-gigabyte model pull plus CPU inference on every pull request costs
  minutes, and small models are not bit-stable across releases — the classic
  route to a permanently red job that everyone learns to ignore, which is worse
  than no job. So the suite changes role: it is a **benchmark**, run by hand,
  and it is what picked the default `OLLAMA_MODEL` (D10) rather than a sentence
  in a design doc asserting one. The gate is an environment variable rather
  than a pytest marker plus `addopts`, because skipping is then the default
  everywhere — nobody can forget the `-m "not golden"`. The accepted risk is
  written down: a regression from an Ollama or model upgrade is caught when
  someone runs the script, and at no other time.
```

- [ ] **Step 7: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add analytics/tests/test_llm_golden.py analytics/tests/fixtures/golden_llm/sentences.json \
        analytics/scripts/golden-llm.sh analytics/README.md analytics/src/analytics/config.py \
        docker-compose.yml deploy/release/docker-compose.yml .env.example deploy/release/.env.example \
       
git commit -m "test(analytics): local-only sentence-to-plan golden suite; pin the benchmarked model"
```

### Task 14: [MY-38] The narration grounding check

**Files:**
- Create: `analytics/src/analytics/llm/narrate.py` (module docstring + the number-extraction and grounding functions only; Tasks 2 and 3 append to the same file)
- Test: `analytics/tests/test_llm_narrate_grounding.py`

**Interfaces:**
- Consumes: nothing — stdlib only (`re`, `decimal`).
- Produces:
  - `number_tokens(text: str) -> list[str]` — every number-like token in a string, as written, in order.
  - `numbers_in(value: object) -> set[Decimal]` — every number reachable in a JSON-ish structure, including inside strings, skipping machine ids.
  - `ungrounded_numbers(caption: str, payload: object) -> list[str]` — the caption tokens no payload number rounds to. Empty list means the sentence quotes only figures it was given.

- [ ] **Step 1: Write the failing test**

Create `analytics/tests/test_llm_narrate_grounding.py`:

```python
"""The check that makes "the AI cannot produce a wrong number" true.

A caption is accepted only when every number-like token in it is a number the
model was actually shown. These tests pin the rules down so nobody "fixes"
them later:

* Rounding is allowed, in the safe direction only: a caption number is
  grounded when some payload number rounds to it at the precision the caption
  used — half an ulp of that precision. "212" is fine for 212.4567;
  "212.5" is not.
* Nothing is derived. The checker does no arithmetic at all. Percentages and
  averages are grounded because `narration_facts` (Task 15) computed them into
  the payload, not because the checker recomputes them from pairs of values.
* U+2212 MINUS SIGN normalises to "-": the frontend renders it
  (`lib/money.ts` `formatSigned`), so a model shown that text may echo it.
* A digit-group separator ("2 793,48", "1,234.50") makes the caption fail.
  Deliberate: "1,234" is 1234 in one locale and 1.234 in another, and
  grounding the wrong reading is exactly the failure this module exists to
  prevent. The cost is a dropped caption, never a wrong number.
* Machine ids — `categoryId`, a group's `key`, the plan `version` — ground
  nothing. A sentence saying "14" because 14 happens to be a category id is
  not quoting the data.
"""

from decimal import Decimal

import pytest

from analytics.llm.narrate import number_tokens, numbers_in, ungrounded_numbers

PAYLOAD = {
    "envelope": {
        "plan": {
            "version": 1,
            "metric": "spend",
            "filters": {"categoryId": 47, "currency": "PLN"},
            "groupBy": "merchant",
            "interval": None,
            "range": {"type": "lastMonths", "n": 12},
        },
        "results": [
            {
                "currency": "PLN",
                "shape": "breakdown",
                "groups": [
                    {"key": "Lidl", "label": "Lidl", "value": "2793.4800"},
                    {"key": "Biedronka", "label": "Biedronka", "value": "2123.1600"},
                ],
            }
        ],
        "meta": {"truncatedGroups": False},
    },
    "facts": [
        {
            "currency": "PLN",
            "shape": "breakdown",
            "groups": 2,
            "total": "4916.64",
            "items": [
                {"label": "Lidl", "total": "2793.48", "sharePct": "56.8"},
                {"label": "Biedronka", "total": "2123.16", "sharePct": "43.2"},
            ],
            "topGapPct": "31.6",
        }
    ],
}


@pytest.mark.parametrize(
    "caption",
    [
        "Lidl leads at 2793.48 PLN, 31.6% above Biedronka.",
        "Lidl spent 2793 PLN over the last 12 months.",
        "Groceries totalled 4916.64 PLN across 2 merchants.",
        "Biedronka took 43.2% of the 4916.64 PLN spent.",
        "Spending is concentrated in two supermarkets.",
    ],
)
def test_captions_quoting_the_payload_are_grounded(caption):
    assert ungrounded_numbers(caption, PAYLOAD) == []


@pytest.mark.parametrize(
    ("caption", "expected"),
    [
        ("Lidl leads at 2800.00 PLN.", ["2800.00"]),
        ("Lidl is 40% above Biedronka.", ["40"]),
        ("Spending fell 12.5% year on year.", ["12.5"]),
        ("Lidl spent 2 793,48 PLN.", ["793,48"]),
        ("The top category is 47.", ["47"]),
        ("Lidl took 2793.48 PLN and an invented 999.00.", ["999.00"]),
    ],
)
def test_invented_numbers_are_reported(caption, expected):
    assert ungrounded_numbers(caption, PAYLOAD) == expected


def test_a_minus_sign_from_the_ui_is_not_a_new_number():
    payload = {"results": [{"currency": "PLN", "shape": "value", "value": "-243.5000"}]}
    assert ungrounded_numbers("Net was −243.50 PLN.", payload) == []


def test_number_tokens_reads_a_period_as_a_year_and_a_bucket():
    assert number_tokens("2026-07 and 2026-Q3") == ["2026", "07", "2026", "3"]


def test_numbers_in_skips_machine_ids():
    payload = {"categoryId": 47, "key": "14", "version": 1, "label": "Route 66"}
    assert numbers_in(payload) == {Decimal("66")}


def test_booleans_are_not_numbers():
    assert numbers_in({"truncatedGroups": False}) == set()
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/chris/side-projects/my-finance/analytics && uv run pytest tests/test_llm_narrate_grounding.py -q`

Expected: FAIL with `ModuleNotFoundError: No module named 'analytics.llm.narrate'` (collection error on the import line).

- [ ] **Step 3: Create the module with the grounding check**

Create `analytics/src/analytics/llm/narrate.py`:

```python
"""Grounded narration: Python owns every number, the model only writes the sentence.

`INSIGHTS.md` principle 2 — "the LLM never queries data and never does
arithmetic" — is impossible to enforce by prompting alone: a 4 GB model asked
for "24% below Lidl" will happily compute 24% wrongly. So the narration
endpoint hands the model an executed envelope plus a block of figures computed
here, and afterwards re-reads the sentence it gets back: every number token in
it must be a number that was in the payload. A caption that invents one is not
narration, and it does not ship.
"""

from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation

# A number token: an optional sign, digits, and at most one decimal separator.
# The lookbehind is what stops "2026-07" yielding "-07" and "2793.48" yielding
# a second token "48" — a separator that follows a digit is not a sign.
_NUMBER = re.compile(r"(?<![\d.,])-?\d+(?:[.,]\d+)?")

# U+2212 MINUS SIGN is what the frontend renders (frontend/src/lib/money.ts,
# formatSigned); a model shown that text may echo it back.
_MINUS = "−"

# Machine-facing ids are not figures. A caption citing "14" because 14 is a
# category id is not quoting the data, so these keys ground nothing.
_NOT_FIGURES = frozenset({"categoryId", "key", "version"})


def number_tokens(text: str) -> list[str]:
    """Every number-like token in a string, exactly as written, in order."""
    return _NUMBER.findall(text.replace(_MINUS, "-"))


def _to_decimal(token: str) -> Decimal | None:
    try:
        return Decimal(token.replace(",", "."))
    except InvalidOperation:
        return None


def _collect(value: object, found: set[Decimal]) -> None:
    if isinstance(value, dict):
        for name, child in value.items():
            if name not in _NOT_FIGURES:
                _collect(child, found)
    elif isinstance(value, list):
        for child in value:
            _collect(child, found)
    elif isinstance(value, bool):
        return  # bool is an int in Python; True is not the number 1 here
    elif isinstance(value, (int, float, Decimal)):
        found.add(Decimal(str(value)))
    elif isinstance(value, str):
        for token in number_tokens(value):
            number = _to_decimal(token)
            if number is not None:
                found.add(number)


def numbers_in(value: object) -> set[Decimal]:
    """Every number reachable in a JSON-ish structure, including inside strings.

    Money arrives as strings ("243.5000") and periods as strings ("2026-07"),
    so string leaves are scanned too: a caption that says "2026-07" or "July
    2026" is quoting the data, not inventing.
    """
    found: set[Decimal] = set()
    _collect(value, found)
    return found


def _grounds(candidate: Decimal, value: Decimal) -> bool:
    """True when `value` rounds to `candidate` at the precision the caption used."""
    places = max(0, -candidate.as_tuple().exponent)
    tolerance = Decimal(1).scaleb(-places) / 2
    return abs(value - candidate) <= tolerance


def ungrounded_numbers(caption: str, payload: object) -> list[str]:
    """The caption's number tokens that no number in `payload` rounds to.

    An empty list means every figure in the sentence came from the data — the
    whole guarantee. The model chooses words, never values.
    """
    allowed = numbers_in(payload)
    bad: list[str] = []
    for token in number_tokens(caption):
        candidate = _to_decimal(token)
        if candidate is None or not any(_grounds(candidate, value) for value in allowed):
            bad.append(token)
    return bad
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /home/chris/side-projects/my-finance/analytics && uv run pytest tests/test_llm_narrate_grounding.py -q`

Expected: PASS (15 passed).

- [ ] **Step 5: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add analytics/src/analytics/llm/narrate.py analytics/tests/test_llm_narrate_grounding.py
git commit -m "feat(analytics): reject captions that cite numbers the model was not given"
```

---


### Task 15: [MY-38] Narration facts, and the caption Python writes itself

**Files:**
- Create: `analytics/tests/envelopes.py` (shared envelope constants for every narration test)
- Modify: `analytics/src/analytics/llm/narrate.py` (append `narration_facts`, `_group_facts`, `fallback_caption` and the `ROUND_HALF_UP` import)
- Test: `analytics/tests/test_llm_narrate_facts.py`

**Interfaces:**
- Consumes: `ungrounded_numbers(caption: str, payload: object) -> list[str]` (Task 14).
- Produces:
  - `narration_facts(envelope: dict) -> list[dict]` — one fact dict per currency result: `currency`, `shape`, and whichever of `total`, `buckets`, `interval`, `perBucketAverage`, `firstPeriod`, `lastPeriod`, `changePct`, `groups`, `items` (`label`/`total`/`sharePct`/`perBucketAverage`), `topGapPct` apply. Money strings at 2 dp, percentages at 1 dp.
  - `fallback_caption(facts: list[dict]) -> str` — a caption built with no model, grounded by construction.
  - `analytics/tests/envelopes.py` exporting `VALUE_ENVELOPE`, `TIMESERIES_ENVELOPE`, `BREAKDOWN_ENVELOPE`, `SPLIT_ENVELOPE` (all four result shapes from `INSIGHTS.md` → Result shapes).

- [ ] **Step 1: Write the shared envelopes**

Create `analytics/tests/envelopes.py`:

```python
"""Executed envelopes, one per result shape (docs/INSIGHTS.md "Result shapes").

Plain module rather than fixtures because the narration tests parametrize over
them. It sits next to the test files, so pytest's default `prepend` import mode
puts `analytics/tests` on `sys.path` and `from envelopes import ...` resolves.
"""

VALUE_ENVELOPE = {
    "plan": {
        "version": 1,
        "metric": "spend",
        "filters": {"currency": "PLN"},
        "groupBy": None,
        "interval": None,
        "range": {"type": "yearToDate"},
    },
    "results": [{"currency": "PLN", "shape": "value", "value": "1243.5000"}],
    "meta": {"truncatedGroups": False},
}

TIMESERIES_ENVELOPE = {
    "plan": {
        "version": 1,
        "metric": "spend",
        "filters": {"currency": "PLN"},
        "groupBy": None,
        "interval": "month",
        "range": {"type": "lastMonths", "n": 3},
    },
    "results": [
        {
            "currency": "PLN",
            "shape": "timeseries",
            "points": [
                {"period": "2026-07", "value": "100.0000"},
                {"period": "2026-08", "value": "200.0000"},
                {"period": "2026-09", "value": "150.0000"},
            ],
        }
    ],
    "meta": {"truncatedGroups": False},
}

BREAKDOWN_ENVELOPE = {
    "plan": {
        "version": 1,
        "metric": "spend",
        "filters": {"categoryId": 47, "currency": "PLN"},
        "groupBy": "merchant",
        "interval": None,
        "range": {"type": "lastMonths", "n": 12},
    },
    "results": [
        {
            "currency": "PLN",
            "shape": "breakdown",
            "groups": [
                {"key": "Lidl", "label": "Lidl", "value": "2793.4800"},
                {"key": "Biedronka", "label": "Biedronka", "value": "2123.1600"},
            ],
        }
    ],
    "meta": {"truncatedGroups": False},
}

SPLIT_ENVELOPE = {
    "plan": {
        "version": 1,
        "metric": "spend",
        "filters": {"currency": "PLN"},
        "groupBy": "merchant",
        "interval": "month",
        "range": {"type": "lastMonths", "n": 2},
    },
    "results": [
        {
            "currency": "PLN",
            "shape": "timeseriesSplit",
            "series": [
                {
                    "key": "Biedronka",
                    "label": "Biedronka",
                    "points": [
                        {"period": "2026-08", "value": "100.0000"},
                        {"period": "2026-09", "value": "120.0000"},
                    ],
                },
                {
                    "key": "Lidl",
                    "label": "Lidl",
                    "points": [
                        {"period": "2026-08", "value": "300.0000"},
                        {"period": "2026-09", "value": "200.0000"},
                    ],
                },
            ],
        }
    ],
    "meta": {"truncatedGroups": False},
}

ALL_ENVELOPES = [VALUE_ENVELOPE, TIMESERIES_ENVELOPE, BREAKDOWN_ENVELOPE, SPLIT_ENVELOPE]
```

Create `analytics/tests/test_llm_narrate_facts.py`:

```python
"""Every figure a caption could want, computed in Python before the model sees it.

Note `SPLIT_ENVELOPE`: the series arrive Biedronka-first but rank Lidl-first,
so `perBucketAverage` landing on the wrong label is a live bug this file
catches.
"""

import pytest
from envelopes import (
    ALL_ENVELOPES,
    BREAKDOWN_ENVELOPE,
    SPLIT_ENVELOPE,
    TIMESERIES_ENVELOPE,
    VALUE_ENVELOPE,
)

from analytics.llm.narrate import fallback_caption, narration_facts, ungrounded_numbers


def test_a_single_value_yields_only_a_total():
    assert narration_facts(VALUE_ENVELOPE) == [
        {"currency": "PLN", "shape": "value", "total": "1243.50"}
    ]


def test_a_timeseries_yields_buckets_average_and_change():
    assert narration_facts(TIMESERIES_ENVELOPE) == [
        {
            "currency": "PLN",
            "shape": "timeseries",
            "interval": "month",
            "buckets": 3,
            "total": "450.00",
            "perBucketAverage": "150.00",
            "firstPeriod": "2026-07",
            "lastPeriod": "2026-09",
            "changePct": "50.0",
        }
    ]


def test_a_breakdown_yields_shares_and_the_gap_to_the_runner_up():
    assert narration_facts(BREAKDOWN_ENVELOPE) == [
        {
            "currency": "PLN",
            "shape": "breakdown",
            "groups": 2,
            "total": "4916.64",
            "items": [
                {"label": "Lidl", "total": "2793.48", "sharePct": "56.8"},
                {"label": "Biedronka", "total": "2123.16", "sharePct": "43.2"},
            ],
            "topGapPct": "31.6",
        }
    ]


def test_a_split_ranks_series_and_averages_each_over_the_same_buckets():
    assert narration_facts(SPLIT_ENVELOPE) == [
        {
            "currency": "PLN",
            "shape": "timeseriesSplit",
            "interval": "month",
            "buckets": 2,
            "groups": 2,
            "total": "720.00",
            "items": [
                {
                    "label": "Lidl",
                    "total": "500.00",
                    "sharePct": "69.4",
                    "perBucketAverage": "250.00",
                },
                {
                    "label": "Biedronka",
                    "total": "220.00",
                    "sharePct": "30.6",
                    "perBucketAverage": "110.00",
                },
            ],
            "topGapPct": "127.3",
        }
    ]


def test_an_empty_result_list_has_no_facts_and_a_plain_sentence():
    assert narration_facts({"plan": {}, "results": [], "meta": {}}) == []
    assert fallback_caption([]) == "No data for this plan."


@pytest.mark.parametrize(
    ("envelope", "expected"),
    [
        (VALUE_ENVELOPE, "PLN total 1243.50."),
        (TIMESERIES_ENVELOPE, "PLN total 450.00, averaging 150.00 per month."),
        (BREAKDOWN_ENVELOPE, "PLN total 4916.64, led by Lidl at 2793.48."),
        (SPLIT_ENVELOPE, "PLN total 720.00, led by Lidl at 500.00."),
    ],
)
def test_the_model_free_caption_reads_as_a_sentence(envelope, expected):
    assert fallback_caption(narration_facts(envelope)) == expected


@pytest.mark.parametrize("envelope", ALL_ENVELOPES)
def test_the_model_free_caption_is_itself_grounded(envelope):
    facts = narration_facts(envelope)
    payload = {"envelope": envelope, "facts": facts}
    assert ungrounded_numbers(fallback_caption(facts), payload) == []


def test_currencies_never_mix_in_one_clause():
    envelope = {
        "plan": {"version": 1, "interval": None},
        "results": [
            {"currency": "PLN", "shape": "value", "value": "100.0000"},
            {"currency": "EUR", "shape": "value", "value": "25.0000"},
        ],
        "meta": {"truncatedGroups": False},
    }
    assert fallback_caption(narration_facts(envelope)) == "PLN total 100.00; EUR total 25.00."
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/chris/side-projects/my-finance/analytics && uv run pytest tests/test_llm_narrate_facts.py -q`

Expected: FAIL with `ImportError: cannot import name 'fallback_caption' from 'analytics.llm.narrate'`.

- [ ] **Step 3: Append the facts and the model-free caption**

In `analytics/src/analytics/llm/narrate.py`, change the decimal import at the top to:

```python
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
```

and append to the end of the file:

```python
_MONEY = Decimal("0.01")
_PCT = Decimal("0.1")


def _money(value: Decimal) -> str:
    return str(value.quantize(_MONEY, rounding=ROUND_HALF_UP))


def _pct(part: Decimal, whole: Decimal) -> str | None:
    """A percentage as a 1 dp string, or None when there is nothing to divide by."""
    if whole == 0:
        return None
    return str((part / whole * 100).quantize(_PCT, rounding=ROUND_HALF_UP))


def _group_facts(totals: list[tuple[str, Decimal]]) -> dict:
    """Totals, shares and the gap to the runner-up — for breakdown and split alike.

    Ranked by absolute value, matching how the executor sorts a breakdown, so
    "leads"/"top" mean the same thing in the caption as on the chart.
    """
    ranked = sorted(totals, key=lambda item: abs(item[1]), reverse=True)
    grand = sum((total for _, total in ranked), Decimal(0))
    items = []
    for label, total in ranked:
        item = {"label": label, "total": _money(total)}
        share = _pct(total, grand)
        if share is not None:
            item["sharePct"] = share
        items.append(item)
    facts: dict = {"groups": len(ranked), "total": _money(grand), "items": items}
    if len(ranked) >= 2 and ranked[1][1] != 0:
        facts["topGapPct"] = _pct(ranked[0][1] - ranked[1][1], abs(ranked[1][1]))
    return facts


def narration_facts(envelope: dict) -> list[dict]:
    """Per-currency figures a caption may cite, all computed here.

    This is where the arithmetic the model is forbidden to do actually happens:
    totals, per-bucket averages, shares of the total, the change across the
    range, the gap between the top two. The model gets them as data and can
    only quote them.
    """
    interval = (envelope.get("plan") or {}).get("interval")
    facts: list[dict] = []
    for result in envelope.get("results", []):
        shape = result["shape"]
        fact: dict = {"currency": result["currency"], "shape": shape}
        if shape == "value":
            fact["total"] = _money(Decimal(result["value"]))
        elif shape == "timeseries":
            points = result["points"]
            values = [Decimal(point["value"]) for point in points]
            total = sum(values, Decimal(0))
            if interval is not None:
                fact["interval"] = interval
            fact["buckets"] = len(points)
            fact["total"] = _money(total)
            if points:
                fact["perBucketAverage"] = _money(total / len(points))
                fact["firstPeriod"] = points[0]["period"]
                fact["lastPeriod"] = points[-1]["period"]
                change = _pct(values[-1] - values[0], abs(values[0]))
                if change is not None:
                    fact["changePct"] = change
        elif shape == "breakdown":
            fact.update(
                _group_facts(
                    [(g["label"], Decimal(g["value"])) for g in result["groups"]]
                )
            )
        elif shape == "timeseriesSplit":
            series = result["series"]
            buckets = len(series[0]["points"]) if series else 0
            if interval is not None:
                fact["interval"] = interval
            fact["buckets"] = buckets
            fact.update(
                _group_facts(
                    [
                        (one["label"],
                         sum((Decimal(p["value"]) for p in one["points"]), Decimal(0)))
                        for one in series
                    ]
                )
            )
            if buckets:
                # Read each average off the item's own total: _group_facts reorders
                # by rank, so zipping against series order mislabels the averages.
                for item in fact["items"]:
                    item["perBucketAverage"] = _money(Decimal(item["total"]) / buckets)
        facts.append(fact)
    return facts


def fallback_caption(facts: list[dict]) -> str:
    """A caption built with no model — every figure comes straight from `facts`.

    The degrade path. A model that is absent, unreachable, or that keeps
    inventing numbers costs the user phrasing, never the caption: "no feature
    exists only behind the AI" (docs/INSIGHTS.md, "The AI layer").
    """
    parts = []
    for fact in facts:
        piece = f"{fact['currency']} total {fact['total']}"
        if "perBucketAverage" in fact:
            piece += f", averaging {fact['perBucketAverage']} per {fact.get('interval', 'bucket')}"
        items = fact.get("items", [])
        if items:
            piece += f", led by {items[0]['label']} at {items[0]['total']}"
        parts.append(piece)
    if not parts:
        return "No data for this plan."
    return "; ".join(parts) + "."
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /home/chris/side-projects/my-finance/analytics && uv run pytest tests/test_llm_narrate_facts.py tests/test_llm_narrate_grounding.py -q`

Expected: PASS (both files green; the `test_the_model_free_caption_is_itself_grounded` cases prove Task 14 and Task 15 agree).

- [ ] **Step 5: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add analytics/src/analytics/llm/narrate.py analytics/tests/envelopes.py analytics/tests/test_llm_narrate_facts.py
git commit -m "feat(analytics): compute narration facts and the model-free caption"
```

---


### Task 16: [MY-38] The narration pipeline — prompt, retry once, degrade

**Files:**
- Modify: `analytics/src/analytics/llm/narrate.py` (append `CAPTION_RULES`, `build_narration_prompt`, `build_retry_prompt`, `first_sentence`, `narrate`; add the `json`, `logging` and `Callable` imports)
- Test: `analytics/tests/test_llm_narrate.py`

**Interfaces:**
- Consumes: `narration_facts`, `fallback_caption` (Task 15), `ungrounded_numbers` (Task 14).
- Produces:
  - `build_narration_prompt(payload: dict) -> str`
  - `build_retry_prompt(payload: dict, caption: str, ungrounded: list[str]) -> str`
  - `first_sentence(raw: str) -> str`
  - `narrate(envelope: dict, *, generate: Callable[[str], str] | None) -> str` — always returns a grounded caption. `generate` is injected, so CI never touches Ollama (D11).

- [ ] **Step 1: Write the failing test**

Create `analytics/tests/test_llm_narrate.py`:

```python
"""The narration pipeline with the model stubbed (D11 — CI never runs a model).

What is asserted here is the contract around the model, not the model: a
grounded answer is passed through untouched, an ungrounded one buys exactly one
retry that names the offending tokens, and anything worse degrades to the
sentence Python writes itself.
"""

import pytest
from envelopes import BREAKDOWN_ENVELOPE, VALUE_ENVELOPE

from analytics.llm.narrate import (
    build_narration_prompt,
    fallback_caption,
    first_sentence,
    narration_facts,
    narrate,
)


class StubModel:
    """Stands in for OllamaClient.generate: canned answers, recorded prompts."""

    def __init__(self, *answers: str):
        self.answers = list(answers)
        self.prompts: list[str] = []

    def __call__(self, prompt: str) -> str:
        self.prompts.append(prompt)
        return self.answers.pop(0) if self.answers else ""


class ExplodingModel:
    def __init__(self):
        self.calls = 0

    def __call__(self, prompt: str) -> str:
        self.calls += 1
        raise ConnectionError("connection refused")


def test_a_grounded_caption_is_returned_verbatim():
    model = StubModel("Lidl leads at 2793.48 PLN, 31.6% above Biedronka.")
    assert narrate(BREAKDOWN_ENVELOPE, generate=model) == (
        "Lidl leads at 2793.48 PLN, 31.6% above Biedronka."
    )
    assert len(model.prompts) == 1


def test_an_invented_number_buys_exactly_one_retry_that_names_it():
    model = StubModel(
        "Lidl leads at 2800.00 PLN, 40% above Biedronka.",
        "Lidl leads at 2793.48 PLN, 31.6% above Biedronka.",
    )
    assert narrate(BREAKDOWN_ENVELOPE, generate=model) == (
        "Lidl leads at 2793.48 PLN, 31.6% above Biedronka."
    )
    assert len(model.prompts) == 2
    assert "2800.00" in model.prompts[1]
    assert "40" in model.prompts[1]


def test_two_ungrounded_answers_degrade_to_the_computed_caption():
    model = StubModel("Lidl spent 2800.00 PLN.", "Lidl spent 2900.00 PLN.")
    assert narrate(BREAKDOWN_ENVELOPE, generate=model) == fallback_caption(
        narration_facts(BREAKDOWN_ENVELOPE)
    )
    assert len(model.prompts) == 2


def test_an_empty_answer_degrades_too():
    model = StubModel("", "   ")
    assert narrate(VALUE_ENVELOPE, generate=model) == "PLN total 1243.50."


def test_an_unreachable_model_degrades_without_a_second_attempt():
    model = ExplodingModel()
    assert narrate(VALUE_ENVELOPE, generate=model) == "PLN total 1243.50."
    assert model.calls == 1


def test_no_model_configured_never_calls_out():
    assert narrate(VALUE_ENVELOPE, generate=None) == "PLN total 1243.50."


def test_the_prompt_carries_the_data_and_forbids_arithmetic():
    facts = narration_facts(BREAKDOWN_ENVELOPE)
    prompt = build_narration_prompt({"envelope": BREAKDOWN_ENVELOPE, "facts": facts})
    assert '"2793.4800"' in prompt
    assert '"topGapPct": "31.6"' in prompt or '"topGapPct":"31.6"' in prompt
    assert "Never add, subtract, average, round or otherwise compute" in prompt
    assert "thousands separators" in prompt


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ('"Lidl leads."\n', "Lidl leads."),
        ("Lidl leads.\nAnd another thought.", "Lidl leads."),
        ("   ", ""),
    ],
)
def test_the_answer_is_trimmed_to_one_line(raw, expected):
    assert first_sentence(raw) == expected
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/chris/side-projects/my-finance/analytics && uv run pytest tests/test_llm_narrate.py -q`

Expected: FAIL with `ImportError: cannot import name 'build_narration_prompt' from 'analytics.llm.narrate'`.

- [ ] **Step 3: Append the pipeline**

In `analytics/src/analytics/llm/narrate.py`, extend the imports at the top to:

```python
from __future__ import annotations

import json
import logging
import re
from collections.abc import Callable
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

logger = logging.getLogger(__name__)
```

and append to the end of the file:

```python
CAPTION_RULES = (
    "Write one sentence of at most 20 words describing the chart this data draws.\n"
    "Rules:\n"
    "- Use only numbers that appear in the JSON above, copied digit for digit.\n"
    "- Never add, subtract, average, round or otherwise compute a number yourself.\n"
    "- Write numbers without thousands separators.\n"
    "- Answer with the sentence only: no preamble, no quotes, no markdown.\n"
)


def build_narration_prompt(payload: dict) -> str:
    """The whole prompt: the data, then the rules. Nothing about the profile."""
    return "Data (JSON):\n" + json.dumps(payload, ensure_ascii=False) + "\n\n" + CAPTION_RULES


def build_retry_prompt(payload: dict, caption: str, ungrounded: list[str]) -> str:
    """The one retry, told exactly which tokens were rejected."""
    problem = (
        "it used numbers that are not in the data: " + ", ".join(ungrounded)
        if ungrounded
        else "it was empty"
    )
    return (
        build_narration_prompt(payload)
        + f'\nYour previous answer ("{caption}") was rejected because {problem}.\n'
        + "Rewrite it using only numbers that appear in the JSON above.\n"
    )


def first_sentence(raw: str) -> str:
    """The model's answer trimmed to one line, without wrapping quotes."""
    stripped = raw.strip()
    if not stripped:
        return ""
    return stripped.splitlines()[0].strip().strip('"').strip()


def narrate(envelope: dict, *, generate: Callable[[str], str] | None) -> str:
    """A caption for an executed envelope. Always grounded, always returns.

    Tries the model at most twice — once, then once more with the offending
    tokens quoted back — and degrades to `fallback_caption` when it is absent,
    unreachable, or still inventing numbers.
    """
    facts = narration_facts(envelope)
    if generate is None:
        return fallback_caption(facts)

    payload = {"envelope": envelope, "facts": facts}
    prompt = build_narration_prompt(payload)
    for _ in range(2):
        try:
            caption = first_sentence(generate(prompt))
        except Exception as exc:  # noqa: BLE001 - narration is convenience, never a 500
            logger.warning("narration model call failed, using the computed caption: %s", exc)
            break
        ungrounded = ungrounded_numbers(caption, payload)
        if caption and not ungrounded:
            return caption
        logger.info("rejected caption %r (ungrounded: %s)", caption, ungrounded)
        prompt = build_retry_prompt(payload, caption, ungrounded)
    return fallback_caption(facts)
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /home/chris/side-projects/my-finance/analytics && uv run pytest tests/test_llm_narrate.py -q && uv run ruff check src tests`

Expected: PASS, and ruff reports `All checks passed!`.

- [ ] **Step 5: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add analytics/src/analytics/llm/narrate.py analytics/tests/test_llm_narrate.py
git commit -m "feat(analytics): narration pipeline — prompt, one retry, then degrade"
```

---


### Task 17: [MY-38] `POST /internal/v1/narrate`

**Files:**
- Modify: `analytics/src/analytics/main.py` (add `NarrateRequest` and the `narrate_endpoint` route beside the existing `/internal/v1/interpret` route; add the two imports)
- Modify: `docs/INSIGHTS.md` ("The analytics service" → **Contract** bullet list: add the narrate entry)
- Test: `analytics/tests/test_llm_narrate_route.py`

**Interfaces:**
- Consumes:
  - `analytics.llm.narrate.narrate(envelope, *, generate) -> str` (Task 16)
  - `analytics.llm.client.get_ollama_client(settings: Settings) -> OllamaClient | None` (returns `None` when `OLLAMA_URL` is unset) and `OllamaClient.generate(self, prompt: str, *, json_schema: dict | None = None) -> str` — both from Task 2
  - `analytics.auth.require_token` — the bearer dependency (stage 1, contract §1)
  - `analytics.config.get_settings`, `analytics.config.Settings` (contract §3)
- Produces:
  - route `POST /internal/v1/narrate` → `200 {"caption": "..."}`, `401` without a bearer token
  - `analytics.main.NarrateRequest` (pydantic, field `envelope: dict[str, Any]`)
  - `analytics.main.narrate_endpoint(body, settings) -> dict[str, str]`

- [ ] **Step 1: Write the failing test**

Create `analytics/tests/test_llm_narrate_route.py`:

```python
"""POST /internal/v1/narrate — numbers in, one sentence out.

No database and no profile id: everything this route can say was already
computed by /internal/v1/execute. The 401 case goes over HTTP; the 200 cases
call the handler directly, with `get_ollama_client` patched, so no model and no
network are involved (D11).
"""

from types import SimpleNamespace

from envelopes import BREAKDOWN_ENVELOPE, VALUE_ENVELOPE
from fastapi.testclient import TestClient

from analytics import main
from analytics.main import app


def test_narrate_requires_the_bearer_token():
    response = TestClient(app).post("/internal/v1/narrate", json={"envelope": VALUE_ENVELOPE})
    assert response.status_code == 401


def test_the_route_captions_without_a_model(monkeypatch):
    app.dependency_overrides[get_ollama_client] = (lambda: lambda settings: None)
    body = main.NarrateRequest(envelope=VALUE_ENVELOPE)
    assert main.narrate_endpoint(body, settings=None) == {"caption": "PLN total 1243.50."}


def test_the_route_uses_the_model_when_one_is_configured(monkeypatch):
    answer = "Lidl leads at 2793.48 PLN, 31.6% above Biedronka."
    monkeypatch.setattr(
        main, "get_ollama_client", lambda settings: SimpleNamespace(generate=lambda prompt: answer)
    )
    body = main.NarrateRequest(envelope=BREAKDOWN_ENVELOPE)
    assert main.narrate_endpoint(body, settings=None) == {"caption": answer}


def test_a_model_that_invents_a_number_cannot_reach_the_response(monkeypatch):
    monkeypatch.setattr(
        main,
        "get_ollama_client",
        lambda settings: SimpleNamespace(generate=lambda prompt: "Lidl spent 9999.00 PLN."),
    )
    body = main.NarrateRequest(envelope=BREAKDOWN_ENVELOPE)
    caption = main.narrate_endpoint(body, settings=None)["caption"]
    assert "9999.00" not in caption
    assert caption == "PLN total 4916.64, led by Lidl at 2793.48."
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/chris/side-projects/my-finance/analytics && uv run pytest tests/test_llm_narrate_route.py -q`

Expected: FAIL with `AttributeError: module 'analytics.main' has no attribute 'NarrateRequest'` (and the 401 case failing with `404` because the route is not registered).

- [ ] **Step 3: Register the route**

In `analytics/src/analytics/main.py`, add to the import block:

```python
from analytics.llm.narrate import narrate
```

(`get_ollama_client` is already imported by MY-36's capabilities route; add `from analytics.llm.client import get_ollama_client` if it is not.)

Then, directly after the `/internal/v1/interpret` route, add:

```python
class NarrateRequest(BaseModel):
    """Body of POST /internal/v1/narrate: an executed envelope, never rows."""

    envelope: dict[str, Any]


@app.post("/internal/v1/narrate", dependencies=[Depends(require_token)])
def narrate_endpoint(
    body: NarrateRequest,
    client: Annotated[OllamaClient | None, Depends(get_ollama_client)],
    _: Annotated[None, Depends(require_token)],
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
    return {"caption": narrate(body.envelope, generate=None if client is None else client.generate)}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /home/chris/side-projects/my-finance/analytics && uv run pytest -q`

Expected: PASS — the whole analytics suite, including stage 1's executor golden tests.

- [ ] **Step 5: Record the contract in `docs/INSIGHTS.md`**

In `docs/INSIGHTS.md`, section "The analytics service", under **Contract** (internal, versioned by path), add after the `/internal/v1/interpret` bullet:

```markdown
  - `POST /internal/v1/narrate` — body `{ "envelope": { ...an execute response... } }`
    → `200` with `{ "caption": "..." }`. Numbers, never rows: the caption is
    checked against the envelope it was given and any figure that is not in
    there is retried once and then replaced by a sentence the service composes
    itself, so a caption comes back whether or not the `ai` profile is running.
```

- [ ] **Step 6: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add analytics/src/analytics/main.py analytics/tests/test_llm_narrate_route.py docs/INSIGHTS.md
git commit -m "feat(analytics): POST /internal/v1/narrate"
```

---


### Task 18: [MY-38] `POST /api/insights/narrate` — execute, then caption the envelope

**Files:**
- Create: `backend/src/main/java/com/myfinance/backend/dto/NarrationResponse.java`
- Modify: `backend/src/main/java/com/myfinance/backend/service/AnalyticsClient.java` (add the `narrate` method)
- Modify: `backend/src/main/java/com/myfinance/backend/service/InsightService.java` (add the `narrate` method)
- Modify: `backend/src/main/java/com/myfinance/backend/controller/InsightController.java` (add the `/narrate` mapping)
- Modify: `docs/API.md` ("Insights" section: new `### POST /api/insights/narrate` subsection after the interpret one; delete the trailing "Phase 5 adds …" blockquote)
- Test: `backend/src/test/java/com/myfinance/backend/controller/InsightNarrationTest.java`

**Interfaces:**
- Consumes:
  - `InsightService.execute(JsonNode plan) -> JsonNode` — stage 1 (MY-31): resolves the active profile server-side, enforces D7's "is it a JSON object" check, throws `InvalidPlanException` / `AnalyticsUnavailableException` — Stage 1, MY-30 Task 17.
  - `AnalyticsClient` fields `restClient` (a `RestClient` built from `AnalyticsProperties`) and `jsonMapper` (`tools.jackson.databind.json.JsonMapper`) — stage 1; and `AnalyticsUnavailableException` (contract §4, R1).
  - Config properties `analytics.base-url`, `analytics.token` (R6).
- Produces:
  - `AnalyticsClient.narrate(JsonNode envelope) -> String` (contract §4, exact)
  - `InsightService.narrate(JsonNode plan) -> NarrationResponse`
  - `dto/NarrationResponse(String caption)`
  - `POST /api/insights/narrate` → `200 {"caption": "..."}`

- [ ] **Step 1: Write the failing test**

Create `backend/src/test/java/com/myfinance/backend/controller/InsightNarrationTest.java`:

```java
package com.myfinance.backend.controller;

import com.myfinance.backend.model.Profile;
import com.myfinance.backend.model.User;
import com.myfinance.backend.support.IntegrationTest;
import com.myfinance.backend.support.TestFixtures;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.UncheckedIOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * POST /api/insights/narrate (docs/API.md "Insights"). The analytics service is replaced by a
 * JDK HttpServer, so the test needs neither Python nor a model; what it pins is the contract the
 * backend relies on — the plan is executed first, the caption is asked for the envelope that came
 * back, and the profile id crossing the internal network is the session's, never the body's.
 */
@IntegrationTest
class InsightNarrationTest {

    private static final String PLAN = """
            {"version":1,"metric":"spend","filters":{"currency":"PLN"},
             "groupBy":null,"interval":null,"range":{"type":"yearToDate"}}""";

    private static final String ENVELOPE = """
            {"plan":{"version":1,"metric":"spend","filters":{"currency":"PLN"},
             "groupBy":null,"interval":null,"range":{"type":"yearToDate"}},
             "results":[{"currency":"PLN","shape":"value","value":"1243.5000"}],
             "meta":{"truncatedGroups":false}}""";

    private static final List<String> CALLS = new ArrayList<>();
    private static final List<String> BODIES = new ArrayList<>();
    private static final HttpServer ANALYTICS = startStub();

    private static HttpServer startStub() {
        try {
            HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
            server.createContext("/internal/v1/", InsightNarrationTest::handle);
            server.start();
            return server;
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static void handle(HttpExchange exchange) throws IOException {
        String path = exchange.getRequestURI().getPath();
        try (InputStream in = exchange.getRequestBody()) {
            BODIES.add(new String(in.readAllBytes(), StandardCharsets.UTF_8));
        }
        CALLS.add(path + " " + exchange.getRequestHeaders().getFirst("Authorization"));
        String payload = path.endsWith("/narrate")
                ? "{\"caption\":\"PLN total 1243.50.\"}"
                : ENVELOPE;
        byte[] bytes = payload.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        exchange.sendResponseHeaders(200, bytes.length);
        try (OutputStream out = exchange.getResponseBody()) {
            out.write(bytes);
        }
    }

    @DynamicPropertySource
    static void analyticsStub(DynamicPropertyRegistry registry) {
        registry.add("analytics.base-url", () -> "http://localhost:" + ANALYTICS.getAddress().getPort());
        registry.add("analytics.token", () -> "test-analytics-token");
    }

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private TestFixtures fixtures;

    private Profile profile;

    @BeforeEach
    void setUp() {
        CALLS.clear();
        BODIES.clear();
        User user = fixtures.user("kasia@example.com");
        profile = fixtures.profile(user, "Personal", "PLN");
    }

    @Test
    void narrateExecutesThePlanThenCaptionsTheEnvelope() throws Exception {
        mockMvc.perform(post("/api/insights/narrate").with(fixtures.in(profile))
                        .contentType(APPLICATION_JSON).content(PLAN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.caption").value("PLN total 1243.50."));

        assertThat(CALLS).containsExactly(
                "/internal/v1/execute Bearer test-analytics-token",
                "/internal/v1/narrate Bearer test-analytics-token");
        assertThat(BODIES.get(0)).contains("\"profileId\":" + profile.getId());
        assertThat(BODIES.get(1)).contains("\"envelope\"").contains("1243.5000");
    }

    @Test
    void narrateScopesToTheSessionProfileNotTheBody() throws Exception {
        User other = fixtures.user("bartek@example.com");
        Profile otherProfile = fixtures.profile(other, "Other", "PLN");

        mockMvc.perform(post("/api/insights/narrate").with(fixtures.in(profile))
                        .contentType(APPLICATION_JSON).content(PLAN))
                .andExpect(status().isOk());

        assertThat(BODIES.get(0))
                .contains("\"profileId\":" + profile.getId())
                .doesNotContain("\"profileId\":" + otherProfile.getId());
    }

    @Test
    void narrateRejectsABodyThatIsNotAPlanObject() throws Exception {
        mockMvc.perform(post("/api/insights/narrate").with(fixtures.in(profile))
                        .contentType(APPLICATION_JSON).content("[1,2,3]"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("/errors/invalid-plan"));

        assertThat(CALLS).isEmpty();
    }

    @Test
    void narrateRequiresAnActiveProfile() throws Exception {
        User user = fixtures.user("no-profile@example.com");

        mockMvc.perform(post("/api/insights/narrate").with(fixtures.as(user))
                        .contentType(APPLICATION_JSON).content(PLAN))
                .andExpect(status().isConflict());

        assertThat(CALLS).isEmpty();
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/chris/side-projects/my-finance/backend && ./mvnw -q -Dtest=InsightNarrationTest test`

Expected: FAIL — `narrateExecutesThePlanThenCaptionsTheEnvelope` gets `Status expected:<200> but was:<405>` (no `/narrate` mapping on `InsightController`).

- [ ] **Step 3: Add the DTO and the client call**

Create `backend/src/main/java/com/myfinance/backend/dto/NarrationResponse.java`:

```java
package com.myfinance.backend.dto;

/**
 * POST /api/insights/narrate. One field on purpose: the caption is the only thing the model
 * contributes. Every number in it was checked against the executed envelope by the analytics
 * service before it was returned (docs/INSIGHTS.md "The AI layer").
 */
public record NarrationResponse(String caption) {
}
```

In `backend/src/main/java/com/myfinance/backend/service/AnalyticsClient.java`, add these imports if absent —

```java
import com.myfinance.backend.exception.AnalyticsUnavailableException;
import org.springframework.http.MediaType;
import org.springframework.web.client.RestClientException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;
```

— and add the method (mirroring how `execute` handles transport failures; the new part is the body shape and reading `caption`):

```java
    /**
     * POST /internal/v1/narrate — a caption for an already-executed envelope. The analytics
     * service is handed numbers, never rows, so there is nothing there for a model to compute
     * wrongly; it returns a sentence it has already checked against those numbers.
     */
    public String narrate(JsonNode envelope) {
        ObjectNode body = jsonMapper.createObjectNode();
        body.set("envelope", envelope);
        try {
            JsonNode response = restClient.post()
                    .uri("/internal/v1/narrate")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .body(JsonNode.class);
            return response == null ? "" : response.path("caption").asString("");
        } catch (RestClientException e) {
            throw new AnalyticsUnavailableException();
        }
    }
```

- [ ] **Step 4: Add the service method and the endpoint**

In `backend/src/main/java/com/myfinance/backend/service/InsightService.java`, add (importing `com.myfinance.backend.dto.NarrationResponse`):

```java
    /**
     * A caption for what a plan's results show (docs/API.md "POST /api/insights/narrate").
     * The plan is executed here rather than trusting an envelope from the browser: a caption is
     * only worth anything if its numbers are this profile's real numbers, and re-running a
     * millisecond query is cheaper than a second place where client-supplied figures could reach
     * the user (docs/INSIGHTS.md, principle 2). Reusing {@code execute} also reuses the profile
     * resolution and the "is it a JSON object" check.
     */
    public NarrationResponse narrate(JsonNode plan) {
        JsonNode envelope = execute(plan);
        return new NarrationResponse(analyticsClient.narrate(envelope));
    }
```

In `backend/src/main/java/com/myfinance/backend/controller/InsightController.java`, add (importing `com.myfinance.backend.dto.NarrationResponse`):

```java
    /** POST /api/insights/narrate — one sentence about what this plan's results show. */
    @PostMapping("/narrate")
    public NarrationResponse narrate(@RequestBody JsonNode plan) {
        return insightService.narrate(plan);
    }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd /home/chris/side-projects/my-finance/backend && ./mvnw -q -Dtest=InsightNarrationTest test`

Expected: PASS (4 tests).

- [ ] **Step 6: Document the endpoint in `docs/API.md`**

In `docs/API.md`, section "Insights", insert after the `### POST /api/insights/interpret` subsection added by MY-37:

````markdown
### `POST /api/insights/narrate`

One sentence describing what a plan's results show — the caption rendered beside
the chart. Body: a bare plan object, exactly like `POST /api/insights/execute`.

The backend **executes the plan again** and narrates the envelope that comes
back; it never accepts an envelope from the browser. Re-running a millisecond
query is cheaper than a second place where client-supplied figures could reach
the user, and it keeps `INSIGHTS.md`'s principle 2 ("every number a user sees
was produced by SQL against real rows") true end to end.

**Response `200 OK`**

```json
{ "caption": "Lidl leads at 2793.48 PLN, 31.6% above Biedronka." }
```

Every number in the caption is checked against the executed envelope before the
sentence is accepted; a model that invents one is retried once and then replaced
by a sentence the analytics service composes itself. A caption therefore comes
back whether or not the `ai` compose profile is running — the model only
improves the wording.

| Status | When |
|---|---|
| `200` | Captioned |
| `400` | Not a JSON object, or executor-rejected plan (`/errors/invalid-plan` with `problems`) — narration re-executes, so every execute rule applies unchanged |
| `401` / `409` | Not authenticated / no active profile |
| `503` | Analytics service unreachable (`/errors/analytics-unavailable`) |
````

Then delete the trailing blockquote that starts `> Phase 5 adds ...` at the end of the Insights section, if MY-36/MY-37 have not already removed it — all three Phase 5 endpoints are now documented.

- [ ] **Step 7: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add backend/src/main/java/com/myfinance/backend/dto/NarrationResponse.java backend/src/main/java/com/myfinance/backend/service/AnalyticsClient.java backend/src/main/java/com/myfinance/backend/service/InsightService.java backend/src/main/java/com/myfinance/backend/controller/InsightController.java backend/src/test/java/com/myfinance/backend/controller/InsightNarrationTest.java docs/API.md
git commit -m "feat(backend): POST /api/insights/narrate — execute, then caption the envelope"
```

---


### Task 19: [MY-38] The caption beside the chart

**Files:**
- Modify: `frontend/src/api/types.ts` (add `NarrationResponse` to the `// — Insights —` block)
- Modify: `frontend/src/api/hooks.ts` (add `useNarrate` next to `useExecutePlan`)
- Create: `frontend/src/insights/Caption.tsx`
- Modify: `frontend/src/screens/Insights.tsx` (render `<Caption>` under the current result)
- Test: `frontend/e2e/insights-ai.spec.ts` (**append** — Task 5 created this file; reuse its helpers)

**Interfaces:**
- Consumes: `api<T>(path, options)` and `ApiError` from `../api/client`; the `Plan` type (contract §5); `useExecutePlan()`; MY-32's `Insights` screen holding the current plan in state.
- Produces:
  - `interface NarrationResponse { caption: string }` in `api/types.ts`
  - `useNarrate()` — `useMutation<NarrationResponse, Error, Plan>`
  - `<Caption plan={plan} />` from `src/insights/Caption.tsx`

- [ ] **Step 1: Write the failing test**

**Append to** `frontend/e2e/insights-ai.spec.ts` — Task 5 created it and owns its two
capability-badge tests, one of which (`with the AI layer off the explorer still works and
shows no AI badge`) is the only automated proof of this stage's gate. Overwriting the file
would silently delete it.

Reuse Task 5's existing `PASSWORD` constant and its `registerAndPickProfile(page, email)`
helper rather than declaring a parallel `registerAndLogin` / `createProfileAndEnter` pair,
and **extend** Task 5's `stubCapabilities(page, caps)` into `stubInsightsApi(page, caps)` by
adding the `execute`, `narrate` and `insights` routes to it — one helper, one shape, so
Task 20's follow-up test has a single set to build on. The imports below are already at the
top of the file; add only what is missing:

```ts
import { test, expect, type Page } from '@playwright/test';

// The Phase 5 layer of the insights explorer. The REAL backend is used for auth
// (as every spec here does), but /api/insights/* is fulfilled in the browser, so
// this spec needs neither the analytics service nor a model. What it checks is
// this layer's own promise — the caption appears beside the chart it describes,
// and a follow-up edits the plan rather than starting over. Executor behaviour
// has golden tests in analytics/tests and is deliberately not re-tested here.

const PASSWORD = 'sturdy-password-1'; // the API requires >= 12 chars

const ENVELOPE = {
  plan: {
    version: 1,
    metric: 'spend',
    filters: { currency: 'PLN' },
    groupBy: null,
    interval: 'month',
    range: { type: 'lastMonths', n: 12 },
  },
  results: [
    {
      currency: 'PLN',
      shape: 'timeseries',
      points: [
        { period: '2026-08', value: '980.2100' },
        { period: '2026-09', value: '1243.5000' },
      ],
    },
  ],
  meta: { truncatedGroups: false },
};

const CAPTION = 'PLN total 2223.71, averaging 1111.86 per month.';

async function registerAndLogin(page: Page, email: string, displayName: string) {
  await page.goto('/');
  await expect(page).toHaveURL(/\/auth/);
  await page.getByRole('link', { name: 'Create account' }).click();
  await page.getByLabel('Display name').fill(displayName);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/picker/);
}

async function createProfileAndEnter(page: Page, name: string) {
  await page.getByRole('button', { name: 'New profile' }).click();
  await page.getByLabel('Profile name').fill(name);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  // Creating does not switch; clicking the new card does.
  await page.getByRole('button', { name: new RegExp(name) }).click();
  await expect(page.getByRole('link', { name: 'Insights' })).toBeVisible();
}

async function stubInsightsApi(page: Page) {
  await page.route('**/api/insights/capabilities', (route) =>
    route.fulfill({ json: { interpret: true, model: 'qwen3:4b' } }),
  );
  await page.route('**/api/insights/execute', (route) => route.fulfill({ json: ENVELOPE }));
  await page.route('**/api/insights/narrate', (route) =>
    route.fulfill({ json: { caption: CAPTION } }),
  );
  await page.route('**/api/insights', (route) => route.fulfill({ json: [] }));
}

test('the caption appears beside the chart it describes', async ({ page }) => {
  await stubInsightsApi(page);
  await registerAndLogin(page, `e2e-caption-${Date.now()}@example.com`, 'Caption Tester');
  await createProfileAndEnter(page, 'Captions');

  await page.getByRole('link', { name: 'Insights' }).click();

  // Nothing is asserted until the user asks — a caption is not free output.
  await expect(page.getByText(CAPTION)).toHaveCount(0);

  await page.getByRole('button', { name: 'Explain this chart' }).click();
  await expect(page.getByText(CAPTION)).toBeVisible();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (backend must be up on :8080, per `frontend/playwright.config.ts`): `cd /home/chris/side-projects/my-finance/frontend && npm run e2e -- insights-ai.spec.ts`

Expected: FAIL with `Error: locator.click: Timeout ... waiting for getByRole('button', { name: 'Explain this chart' })` — the button does not exist yet.

- [ ] **Step 3: Add the type and the hook**

In `frontend/src/api/types.ts`, in the `// — Insights —` block, add:

```ts
/** POST /api/insights/narrate — one sentence about a plan's results. */
export interface NarrationResponse {
  caption: string;
}
```

In `frontend/src/api/hooks.ts`, next to `useExecutePlan`, add (extending the existing `import type { ... } from './types'` line with `NarrationResponse`):

```ts
/**
 * POST /api/insights/narrate. The backend re-executes the plan, so the caption
 * always describes this profile's real numbers; no invalidation, nothing is written.
 */
export function useNarrate() {
  return useMutation({
    mutationFn: (plan: Plan) =>
      api<NarrationResponse>('/api/insights/narrate', { method: 'POST', body: plan }),
  });
}
```

- [ ] **Step 4: Add the caption component and render it**

Create `frontend/src/insights/Caption.tsx`:

```tsx
import { useNarrate } from '../api/hooks';
import type { Plan } from '../api/types';

/**
 * The one-sentence caption beside a chart. Every number in it was computed by
 * the analytics service and checked against the executed envelope before the
 * sentence was accepted (docs/INSIGHTS.md "The AI layer") — the model chose the
 * words, never the values.
 */
export function Caption({ plan }: { plan: Plan }) {
  const narrate = useNarrate();
  // Only show a caption that was asked for THIS plan: editing a chip must not
  // leave the previous question's sentence sitting beside the new chart.
  const fresh =
    narrate.data !== undefined && JSON.stringify(narrate.variables) === JSON.stringify(plan);

  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 12 }}>
      <button
        className="btn btn-ghost"
        style={{ minHeight: 28, padding: '2px 10px', fontSize: 13 }}
        disabled={narrate.isPending}
        onClick={() => narrate.mutate(plan)}
        aria-label="Explain this chart"
      >
        {narrate.isPending ? 'explaining…' : 'explain'}
      </button>
      {fresh && narrate.data && (
        <p className="text-muted" style={{ margin: 0, fontSize: 13 }}>
          {narrate.data.caption}
        </p>
      )}
      {narrate.isError && (
        <span className="text-muted" style={{ fontSize: 13 }}>
          the analytics service isn’t running
        </span>
      )}
    </div>
  );
}
```

In `frontend/src/screens/Insights.tsx`, add the import

```tsx
import { Caption } from '../insights/Caption';
```

and place the component immediately after the `<ResultRenderer …/>` element that draws the current result, passing the same plan object the explorer sends to `useExecutePlan()`:

```tsx
<Caption plan={plan} />
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd /home/chris/side-projects/my-finance/frontend && npm run build && npm run e2e -- insights-ai.spec.ts`

Expected: PASS — `tsc -b` clean (an unused import or a type error fails the build before Vite runs), and the caption spec green.

- [ ] **Step 6: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add frontend/src/api/types.ts frontend/src/api/hooks.ts frontend/src/insights/Caption.tsx frontend/src/screens/Insights.tsx frontend/e2e/insights-ai.spec.ts
git commit -m "feat(frontend): grounded caption beside the insight chart"
```

---


### Task 20: [MY-38] The follow-up input in the explorer

**Files:**
- Create: `frontend/src/insights/FollowUp.tsx`
- Modify: `frontend/src/screens/Insights.tsx` (render `<FollowUp>` under the chip bar)
- Test: `frontend/e2e/insights-ai.spec.ts` (append one test)

**Interfaces:**
- Consumes:
  - `useInterpret()` — MY-37: `useMutation<{ plan: Plan; notes: string[] }, Error, { text: string; currentPlan: Plan | null }>`. Hook name is contract §5; the variables shape mirrors contract §2's request body, and Task 11 is where it is defined.
  - `ApiError` from `../api/client`; MY-32's plan state setter on the `Insights` screen.
- Produces: `<FollowUp currentPlan={plan} onPlan={setPlan} />` from `src/insights/FollowUp.tsx`.

- [ ] **Step 1: Write the failing test**

Append to `frontend/e2e/insights-ai.spec.ts`:

```ts
test('a follow-up edits the plan instead of starting over', async ({ page }) => {
  await stubInsightsApi(page);

  const sent: Array<{ text: string; currentPlan: unknown }> = [];
  await page.route('**/api/insights/interpret', async (route) => {
    sent.push(route.request().postDataJSON());
    await route.fulfill({
      json: { plan: { ...ENVELOPE.plan, range: { type: 'yearToDate' } }, notes: [] },
    });
  });

  await registerAndLogin(page, `e2e-followup-${Date.now()}@example.com`, 'Follow-up Tester');
  await createProfileAndEnter(page, 'Follow-ups');
  await page.getByRole('link', { name: 'Insights' }).click();

  await page.getByLabel('Follow-up question').fill('and only this year?');
  await page.getByRole('button', { name: 'refine' }).click();

  // The input clears on success — the chips now hold the refined plan.
  await expect(page.getByLabel('Follow-up question')).toHaveValue('');
  expect(sent).toHaveLength(1);
  expect(sent[0].text).toBe('and only this year?');
  // The whole point: the follow-up travels with the plan it is editing.
  // defaultPlan() sets interval: null and groupBy: 'category' (Stage 1 Task 31), so assert
    // the fields the explorer actually starts with — not an interval nothing selected.
    expect(sent[0].currentPlan).toMatchObject({ metric: 'spend', groupBy: 'category' });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/chris/side-projects/my-finance/frontend && npm run e2e -- insights-ai.spec.ts`

Expected: FAIL with `Error: locator.fill: Timeout ... waiting for getByLabel('Follow-up question')` — the input does not exist yet (the caption test from Task 19 still passes).

- [ ] **Step 3: Add the follow-up component and render it**

Create `frontend/src/insights/FollowUp.tsx`:

```tsx
import { useState } from 'react';
import { ApiError } from '../api/client';
import { useAiCapabilities, useInterpret } from '../api/hooks';
import type { Plan } from '../api/types';

/**
 * "And only this year?" — a follow-up edits the plan rather than re-deriving it:
 * the current plan travels with the text, the model returns the modified plan,
 * and it lands back in the chips, where the user can see and undo every
 * intermediate state (docs/INSIGHTS.md "The AI layer").
 */
export function FollowUp({
  currentPlan,
  onPlan,
}: {
  currentPlan: Plan;
  onPlan: (plan: Plan) => void;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const capabilities = useAiCapabilities();
  const interpret = useInterpret();

  // No capability may exist only behind the model (INSIGHTS.md, "Capability
  // detection"). Without it every submit here would 422, so the input does not
  // render at all — same guard AiSearchBox uses. Hooks stay above the return.
  if (capabilities.data?.interpret !== true) return null;

  const submit = () => {
    const followUp = text.trim();
    if (!followUp) return;
    setError('');
    interpret.mutate(
      { text: followUp, currentPlan },
      {
        onSuccess: (result) => {
          onPlan(result.plan);
          setText('');
        },
        onError: (err) => {
          setError(err instanceof ApiError ? err.detail : 'Could not refine this insight.');
        },
      },
    );
  };

  return (
    <div className="field" style={{ marginTop: 12 }}>
      <label htmlFor="insight-followup">Follow-up</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          id="insight-followup"
          className="input"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          placeholder="e.g. and only this year?"
          aria-label="Follow-up question"
        />
        <button className="btn btn-secondary" disabled={interpret.isPending} onClick={submit}>
          {interpret.isPending ? 'refining…' : 'refine'}
        </button>
      </div>
      {error && (
        <div className="error-box" style={{ marginTop: 6, fontSize: 12 }}>
          {error}
        </div>
      )}
    </div>
  );
}
```

In `frontend/src/screens/Insights.tsx`, add the import

```tsx
import { FollowUp } from '../insights/FollowUp';
```

and render it directly under the chip bar (`<ChipBar …/>`), wired to the explorer's own plan state — the same setter the chips call:

```tsx
<FollowUp currentPlan={plan} onPlan={setPlan} />
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /home/chris/side-projects/my-finance/frontend && npm run build && npm run e2e -- insights-ai.spec.ts`

Expected: PASS — both specs green, `tsc -b` clean.

- [ ] **Step 5: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add frontend/src/insights/FollowUp.tsx frontend/src/screens/Insights.tsx frontend/e2e/insights-ai.spec.ts
git commit -m "feat(frontend): follow-up input refines the current plan"
```

---


### Task 21: [MY-38] The local narration benchmark, and the lesson

**Files:**
- Create: `analytics/tests/test_llm_narration_local.py`
- Modify: `analytics/README.md` (how to run the local suite)
- Modify: `docs/LESSONS.md` (append one entry)

This task has no failing-test-first cycle: the deliverable *is* a test suite, and per D11 it never runs in CI. It is verified by two runs — deselected by default, green against a live model.

**Interfaces:**
- Consumes:
  - `analytics.llm.narrate.{narration_facts, build_narration_prompt, first_sentence, ungrounded_numbers, fallback_caption, narrate}` (Tasks 1–3)
  - `analytics.llm.client.get_ollama_client`, `analytics.config.get_settings` (MY-36 / stage 1)
  - the `RUN_LLM_GOLDEN=1` environment gate MY-37 established in Task 13 (a marker plus `addopts` was explicitly rejected there, because an env gate makes skipping the default everywhere) (`[tool.pytest.ini_options] markers` + `addopts = "-m 'not local_llm'"`).
- Produces: `analytics/tests/test_llm_narration_local.py`, run with `uv run pytest -m local_llm`.

- [ ] **Step 1: Write the local benchmark**

Create `analytics/tests/test_llm_narration_local.py`:

```python
"""Real-model narration checks. Never run in CI (D11).

    cd analytics && uv run pytest -m local_llm

CI runs the stubbed tests (test_llm_narrate*.py): a multi-gigabyte pull plus CPU
inference on every PR is minutes of runtime, and small models are not bit-stable
across releases — the classic route to a permanently red job everyone ignores.
The accepted risk is that an Ollama or model upgrade regresses narration and
only this suite notices, so run it before merging Phase 5 work and after
changing OLLAMA_MODEL.

These assertions are about the *model*, not the guard. `narrate` cannot return
an ungrounded caption by construction — it rejects, retries, then falls back —
so asserting that its output is grounded would pass forever. Instead the first
test calls the model directly and checks its raw answer, and the second checks
that the pipeline did not have to fall back.
"""

import pytest
from envelopes import ALL_ENVELOPES

from analytics.config import get_settings
from analytics.llm.client import get_ollama_client
from analytics.llm.narrate import (
    build_narration_prompt,
    fallback_caption,
    first_sentence,
    narrate,
    narration_facts,
    ungrounded_numbers,
)

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_LLM_GOLDEN") != "1",
    reason="needs a live Ollama; run analytics/scripts/golden-llm.sh",
)

IDS = ["value", "timeseries", "breakdown", "split"]


@pytest.fixture(scope="module")
def generate():
    client = get_ollama_client(get_settings())
    if client is None:
        pytest.skip("OLLAMA_URL is not set; nothing to benchmark")
    return client.generate


@pytest.mark.parametrize("envelope", ALL_ENVELOPES, ids=IDS)
def test_the_model_narrates_without_inventing_numbers(envelope, generate):
    facts = narration_facts(envelope)
    payload = {"envelope": envelope, "facts": facts}
    caption = first_sentence(generate(build_narration_prompt(payload)))
    assert caption != ""
    assert ungrounded_numbers(caption, payload) == [], caption


@pytest.mark.parametrize("envelope", ALL_ENVELOPES, ids=IDS)
def test_the_model_beats_the_computed_caption(envelope, generate):
    facts = narration_facts(envelope)
    caption = narrate(envelope, generate=generate)
    assert caption != fallback_caption(facts), "the pipeline degraded — the model failed twice"
```

- [ ] **Step 2: Verify CI's default run does not touch it**

Run: `cd /home/chris/side-projects/my-finance/analytics && uv run pytest -q`

Expected: PASS with `8 deselected` in the summary line — the marker keeps the benchmark out of the default run, which is what CI executes.

- [ ] **Step 3: Verify it skips cleanly with no model configured**

Run: `cd /home/chris/side-projects/my-finance/analytics && env -u OLLAMA_URL uv run pytest -m local_llm -q`

Expected: PASS with `8 skipped` — "OLLAMA_URL is not set; nothing to benchmark".

- [ ] **Step 4: Run it against the real model**

Run: `cd /home/chris/side-projects/my-finance && docker compose --profile ai up -d ollama && cd analytics && OLLAMA_URL=http://localhost:11434 uv run pytest -m local_llm -q`

Expected: PASS (8 passed). A failure here is a real finding, not flakiness: either the prompt needs tightening or the pinned `OLLAMA_MODEL` (D10) is a worse choice than the benchmark thought.

- [ ] **Step 5: Document how to run it**

In `analytics/README.md`, under the testing section, add:

````markdown
### The local narration benchmark

`uv run pytest` runs everything except the `local_llm` mark, which is what CI
runs — no model is ever pulled there (D11). The Phase 5 suites need a live
Ollama and are run by hand before merging AI-layer work:

```
docker compose --profile ai up -d ollama
cd analytics && OLLAMA_URL=http://localhost:11434 uv run pytest -m local_llm
```

`test_llm_narration_local.py` checks that the model narrates all four result
shapes without inventing a number, and that the pipeline never has to fall back
to the caption Python composes itself.
````

- [ ] **Step 6: Append the lesson**

Append to the end of `docs/LESSONS.md`:

```markdown
### grounding an LLM: let it choose words, never values

- **What** — narration is checked, not trusted: every number-like token in a
  generated caption must be a number the model was actually shown, or the
  sentence is thrown away.
- **Where** — `analytics/src/analytics/llm/narrate.py` (`narration_facts`,
  `ungrounded_numbers`, `narrate`) and `POST /api/insights/narrate` in
  `controller/InsightController`.
- **Why it's this way** — "the model never does arithmetic" is easy to write in
  a design doc and impossible to enforce by prompting: a 4 GB model asked for
  "24% below Lidl" will happily compute 24% wrongly. So Python computes every
  figure a caption could want — totals, per-bucket averages, shares, the gap
  between the top two — hands them to the model as data next to the envelope,
  and afterwards re-reads the sentence: each number token must round-match
  something in that payload at the precision the sentence used ("212" is
  allowed for 212.4567, "2800" is not allowed for 2793.48). A rejected caption
  is retried once with the offending tokens quoted back, then replaced by a
  sentence Python writes itself, so the failure mode is duller prose rather
  than a wrong number. The backend re-executes the plan instead of accepting an
  envelope from the browser, which keeps the same property across the network
  boundary. Coming from Python, this is the familiar instinct of validating at
  a boundary rather than trusting the caller — the twist is that the untrusted
  caller is a text generator and the schema is "these exact decimals", so the
  validator has to know about rounding, sign characters and digit-group
  separators, and every one of those choices errs toward dropping the sentence.
```

- [ ] **Step 7: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add analytics/tests/test_llm_narration_local.py analytics/README.md
git commit -m "test(analytics): local narration benchmark against a real model"
```

### Task 22: [MY-36] Benchmark the candidate models and pin the default

**Sequencing: run this task after the MY-37 tasks have landed.** It calls
`POST /internal/v1/interpret` and scores MY-37's sentence → plan golden
corpus; neither exists until then. It is written here because the *default it
pins* belongs to MY-36's compose files.

**Files:**
- Create: `analytics/benchmarks/bench_models.py`
- Create: `analytics/benchmarks/results.md`
- Modify: `docker-compose.yml`, `.env.example`, `deploy/release/docker-compose.yml`, `deploy/release/.env.example` (only if a candidate other than `qwen3:4b` wins)
- Modify: `docs/LESSONS.md` (append one entry)

**Interfaces:**
- Consumes, from MY-37: `POST /internal/v1/interpret` with body `{"profileId": int, "text": str, "currentPlan": object | null}` returning `200 {"plan": {...}, "notes": [...]}` or `422 {"problems": [...]}` (fixed by the cross-stage contract §2); and MY-37's golden corpus at `analytics/tests/fixtures/golden_llm/sentences.json` — an **object** `{"today": str, "categories": [{"id", "name"}], "cases": [{"sentence": str, "plan": {...}}]}`, written by Task 13 Step 3. Note it is not a bare array and the sentence key is `sentence`, not `text`.
- Consumes, from Task 1 / Task 6: the `OLLAMA_MODEL` compose default and the `ollama` service.
- Produces: `analytics/benchmarks/bench_models.py` (a local-only script — **never** wired into CI, per design delta D11), `analytics/benchmarks/results.md` with the measured comparison, and the pinned `OLLAMA_MODEL` default.

- [ ] **Step 1: Write the benchmark script**

Create `analytics/benchmarks/bench_models.py`:

```python
"""Score one Ollama model against the sentence -> plan golden corpus.

Local only. CI never pulls or runs a model (design delta D11), so this script
is not imported by any test and has no CI job. Run it once per candidate,
restarting the analytics container on that model in between -- see the loop in
the task that added this file, and the results table in results.md.

    uv run python benchmarks/bench_models.py --label qwen3:4b \\
        --profile-id 1 --token "$ANALYTICS_TOKEN"
"""

from __future__ import annotations

import argparse
import json
import pathlib
import time

import httpx


def normalise(plan: object) -> str:
    """Field order and whitespace are not part of a plan; sort keys before comparing."""
    return json.dumps(plan, sort_keys=True, separators=(",", ":"))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--label", required=True, help="the model tag being measured, e.g. qwen3:4b"
    )
    parser.add_argument("--profile-id", type=int, required=True, help="a seeded dev profile id")
    parser.add_argument("--token", required=True, help="ANALYTICS_TOKEN of the running service")
    parser.add_argument("--url", default="http://localhost:8000")
    parser.add_argument(
        "--fixtures",
        type=pathlib.Path,
        default=pathlib.Path("tests/fixtures/golden_llm/sentences.json"),
        help="MY-37's golden corpus: {\"cases\": [{\"sentence\": ..., \"plan\": {...}}, ...]}",
    )
    args = parser.parse_args()

    data = json.loads(args.fixtures.read_text(encoding="utf-8"))
    cases = data["cases"]
    client = httpx.Client(
        base_url=args.url,
        timeout=httpx.Timeout(180.0, connect=5.0),
        headers={"Authorization": f"Bearer {args.token}"},
    )

    exact = 0
    rejected = 0
    elapsed: list[float] = []
    for case in cases:
        started = time.perf_counter()
        response = client.post(
            "/internal/v1/interpret",
            json={
                "profileId": args.profile_id,
                "text": case["sentence"],
                "currentPlan": case.get("currentPlan"),
            },
        )
        elapsed.append(time.perf_counter() - started)
        if response.status_code != 200:
            rejected += 1
            print(f"  reject  {case['text']}")
            continue
        got = response.json()["plan"]
        if normalise(got) == normalise(case["plan"]):
            exact += 1
        else:
            print(f"  differ  {case['text']}")
            print(f"          want {normalise(case['plan'])}")
            print(f"          got  {normalise(got)}")

    mean = sum(elapsed) / len(elapsed) if elapsed else 0.0
    print(f"\n| {args.label} | {exact}/{len(cases)} | {rejected} | {mean:.1f} |")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Verify the script runs and reads the corpus**

Run: `cd /home/chris/side-projects/my-finance/analytics && uv run python benchmarks/bench_models.py --help`

Expected: PASS — argparse prints the usage and the docstring, listing `--label`, `--profile-id`, `--token`, `--url`, `--fixtures`.

- [ ] **Step 3: Create the results file**

Create `analytics/benchmarks/results.md`:

````markdown
# Local model comparison

Design delta D10: `INSIGHTS.md` said "a small instruct model ~2–4 GB,
configurable" without naming one, so the default is chosen by measurement
rather than assertion. MY-37's sentence → plan golden corpus is the benchmark:
each candidate is asked to interpret every fixture sentence, and the returned
plan is compared to the expected one key-sorted (field order is not part of a
plan).

**Exact** is the only score that matters — a plan that differs is a plan the
user has to fix by hand, which is exactly the work the AI layer exists to
save. **Rejected** counts `422`s, where the emission failed schema validation
twice and the explorer fell back to chips. **Mean** is seconds per sentence on
the author's hardware, and is a tiebreaker, not a criterion.

Re-run after an Ollama upgrade or a model change:

```bash
cd analytics
for m in qwen3:4b gemma3:4b llama3.1:8b; do
  docker compose --profile ai exec -T ollama ollama pull "$m"
  OLLAMA_MODEL="$m" docker compose --profile ai up -d --force-recreate analytics
  uv run python benchmarks/bench_models.py --label "$m" --profile-id 1 --token "$ANALYTICS_TOKEN"
done
```

| Model | Exact | Rejected | Mean (s) |
|---|---|---|---|
````

- [ ] **Step 4: Run the benchmark for the three candidates**

Start the stack with the AI profile and a dev profile that has categories and
transactions (the interpreter resolves category names from the database), then:

```bash
cd /home/chris/side-projects/my-finance
export ANALYTICS_TOKEN=$(sed -n 's/^ANALYTICS_TOKEN=//p' .env)
cd analytics
for m in qwen3:4b gemma3:4b llama3.1:8b; do
  docker compose -f ../docker-compose.yml --profile ai exec -T ollama ollama pull "$m"
  OLLAMA_MODEL="$m" docker compose -f ../docker-compose.yml --profile ai up -d --force-recreate analytics
  uv run python benchmarks/bench_models.py --label "$m" --profile-id 1 --token "$ANALYTICS_TOKEN"
done
```

Paste the three printed table rows under the table header in
`analytics/benchmarks/results.md`, and add one sentence below the table naming
the winner and why (highest **Exact**; mean latency breaks a tie).

- [ ] **Step 5: Pin the winner as the default**

If a candidate other than `qwen3:4b` won, replace the default in all four
places — they must agree or the launcher pulls one model and the service asks
for another:

```bash
cd /home/chris/side-projects/my-finance
grep -rn 'qwen3:4b' docker-compose.yml .env.example \
     deploy/release/docker-compose.yml deploy/release/.env.example
```

Change every hit to the winning tag (`${OLLAMA_MODEL:-<winner>}` twice per
compose file, `OLLAMA_MODEL=<winner>` once per `.env.example`), then confirm:

```bash
docker compose config | grep OLLAMA_MODEL
docker compose -f deploy/release/docker-compose.yml --profile ai config | grep OLLAMA_MODEL
```

Expected: PASS — the same tag in every line of both outputs.

- [ ] **Step 6: Append the LESSONS entry**

Append to the end of `docs/LESSONS.md`, replacing `qwen3:4b` with the winning
tag if a different candidate won:

```markdown
### Picking a local model by benchmark, and why it never runs in CI

- **What** — the golden fixture set that tests the interpreter doubles as a
  model benchmark, which turns "which model?" from an opinion into a
  measurement — and that same benchmark is deliberately excluded from CI.
- **Where** — `analytics/benchmarks/bench_models.py` and
  `analytics/benchmarks/results.md`; the pinned default is `OLLAMA_MODEL` in
  `docker-compose.yml` and `deploy/release/docker-compose.yml`.
- **Why it's this way** — the design said "a small instruct model, ~2–4 GB,
  configurable" and named none, which is the kind of gap that gets filled by
  whoever writes the code first. Since the sentence → plan tests already
  assert an exact expected plan per sentence, running them against a candidate
  *is* a score; three candidates and an afternoon replace the argument. The
  opposite decision is the interesting one: this benchmark never becomes a CI
  job. A multi-gigabyte pull plus CPU inference on every pull request costs
  minutes, and small models are not bit-stable across releases — that is the
  classic recipe for a permanently red job everyone learns to ignore. CI
  instead stubs the client entirely (`analytics/tests/test_llm_client.py`,
  `test_llm_capabilities.py`), which is the Python habit of mocking the
  network boundary rather than the logic behind it. The accepted cost, written
  down so it is a decision and not an oversight: a regression caused by an
  Ollama or model upgrade is caught only when someone re-runs this benchmark.
```

- [ ] **Step 7: Verify nothing model-shaped leaked into CI**

Run:

```bash
cd /home/chris/side-projects/my-finance
grep -rn 'ollama\|OLLAMA\|benchmarks/' .github/workflows/ || echo "ok: CI never touches a model"
cd analytics && uv run pytest -q
```

Expected: PASS — `ok: CI never touches a model`, then the full analytics suite green without an Ollama container running.

- [ ] **Step 8: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add analytics/benchmarks/bench_models.py analytics/benchmarks/results.md \
        docker-compose.yml .env.example \
        deploy/release/docker-compose.yml deploy/release/.env.example \
       
git commit -m "chore(analytics): benchmark candidate models and pin the OLLAMA_MODEL default (D10)"
```

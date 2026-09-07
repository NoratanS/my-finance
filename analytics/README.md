# analytics

The my-finance analytics service (`docs/INSIGHTS.md` → "The analytics
service"): a read-only executor for saved insight plans. Python 3.12,
FastAPI, `uv` for dependencies.

## Internal-only, on purpose

The service publishes no port and nginx has no route to it. The backend is
the only caller, over the compose network at `http://analytics:8000`: it
authenticates the session, resolves the active profile server-side, and
forwards the profile id with a static bearer token (`ANALYTICS_TOKEN`).
Defense in depth, so a misconfigured network still doesn't expose an
unauthenticated SQL-adjacent service. `GET /internal/health` is the one
unauthenticated route — it is the compose healthcheck, and a healthcheck
must not carry a secret.

It connects to Postgres as `myfinance_ro`, the read-only role created by the
backend's `V4__insights.sql` migration, so "analytics can't write" is a
database guarantee rather than a code convention.

## Development

```bash
cd analytics
uv sync
uv run uvicorn analytics.main:app --reload --port 8000
```

## Lint and tests

```bash
cd analytics
uv run ruff check .
uv run pytest
```

The executor's tests are DB-backed: `testcontainers-python` starts a `postgres:16-alpine`
container, applies the backend's own Flyway migrations (`backend/src/main/resources/db/migration`)
so the executor is never tested against a hand-written schema, and loads
`tests/fixtures/seed.sql`. Docker must be running; nothing else needs setting up.

    uv run pytest

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

### The local narration benchmark

`uv run pytest` (no env vars) skips this suite by design — it needs a live
Ollama, and D11 keeps CI free of one. `tests/test_llm_narration_local.py` is
gated the same way as the golden suite above, `RUN_LLM_GOLDEN=1`, and is run
by hand before merging AI-layer work:

```bash
docker compose --profile ai up -d ollama
cd analytics
RUN_LLM_GOLDEN=1 OLLAMA_URL=http://localhost:11434 \
    uv run pytest tests/test_llm_narration_local.py -v
```

It checks that the model narrates all four result shapes (`value`,
`timeseries`, `breakdown`, `timeseriesSplit`) without inventing a number, and
that the pipeline never has to fall back to the caption Python composes
itself. Point `OLLAMA_MODEL` at a candidate the same way as the golden suite.

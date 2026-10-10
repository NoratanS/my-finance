# analytics

The my-finance analytics service (`docs/INSIGHTS.md` → "The analytics
service"): a read-only executor for saved insight plans. Python 3.12,
FastAPI, `uv` for dependencies.

## Internal-only, on purpose

The service publishes no port and nginx has no route to it. The backend is
the only caller, over the compose network at `http://analytics:8000`: it
resolves the active profile and forwards the profile id. Nothing else can
reach the service, which is why it trusts that id. `GET /internal/health` is
the compose healthcheck.

It connects to Postgres as `myfinance_ro`, the read-only role created by the
backend's migration, so "analytics can't write" is a database guarantee
rather than a code convention.

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

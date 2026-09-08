"""Shared fixtures for the analytics test suite.

The executor is only ever trusted against the schema the backend actually ships, so the
container is migrated with the backend's own Flyway files (spec assumption A5) rather than a
hand-written copy that can drift. Flyway is a Java tool; applying the same .sql files in version
order with the one placeholder substituted gives the same schema without a JVM.
"""

from __future__ import annotations

import re
from datetime import date
from pathlib import Path

import psycopg
import pytest

# testcontainers.postgres is deprecated as of 4.15 in favour of testcontainers.community.postgres,
# but pyproject.toml only floors testcontainers at >=4.8, and the community module doesn't exist
# in those older releases — so the deprecated path is kept deliberately, not by oversight. If a
# dependency upgrade ever breaks this import, move to testcontainers.community.postgres and raise
# the floor in pyproject.toml to match.
from testcontainers.postgres import PostgresContainer

from analytics.config import get_settings

SETTINGS_ENV_VARS = ("DATABASE_URL", "ANALYTICS_TOKEN", "TZ", "OLLAMA_URL", "OLLAMA_MODEL")


@pytest.fixture(autouse=True)
def clear_settings_cache(monkeypatch):
    """get_settings() is lru_cached, so a test that changes the environment must
    not leak its Settings into the next one.

    Also clears the five Settings env vars from the process environment before
    each test: Settings is a pydantic_settings.BaseSettings, so a direct
    Settings(...) construction (e.g. test_db.py's _settings()) now reads any of
    these left over in the shell for the fields it omits — a stray exported
    OLLAMA_URL would otherwise switch interpretation on nondeterministically.
    """
    for var in SETTINGS_ENV_VARS:
        monkeypatch.delenv(var, raising=False)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


REPO_ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = REPO_ROOT / "backend" / "src" / "main" / "resources" / "db" / "migration"
SEED = Path(__file__).parent / "fixtures" / "seed.sql"

# V4__insights.sql carries ${dbAnalyticsPassword} (docs/INSIGHTS.md "Read-only role"). Flyway
# substitutes it from spring.flyway.placeholders.*; this harness must supply the same value or
# the migration fails on a syntax error.
PLACEHOLDERS = {"dbAnalyticsPassword": "myfinance-ro"}

FROZEN_TODAY = date(2026, 9, 15)


def _version(path: Path) -> int:
    """V10__x.sql sorts after V9__x.sql only if the number is compared as a number."""
    return int(re.match(r"V(\d+)__", path.name).group(1))


# seed.sql supplies every id explicitly with OVERRIDING SYSTEM VALUE, which leaves the
# GENERATED ALWAYS identity sequences sitting at 1. Any later test that inserts WITHOUT an
# id would then generate 1 and collide with the seed's own row. Push the sequences past the
# fixture range once, here, so both styles of insert can coexist.
SEEDED_TABLES = ("app_user", "profile", "category", "txn", "budget", "subscription", "insight")


def _advance_identity_sequences(cur) -> None:
    for table in SEEDED_TABLES:
        cur.execute("SELECT setval(pg_get_serial_sequence(%s, 'id'), 10000, false)", (table,))


def _apply(cur, script: str) -> None:
    for key, value in PLACEHOLDERS.items():
        script = script.replace("${" + key + "}", value)
    # No parameters, so psycopg uses the simple query protocol and accepts a multi-statement
    # script — including V4's dollar-quoted DO block — in one round trip.
    cur.execute(script)


@pytest.fixture(scope="session")
def dsn() -> str:
    # Same tag as docker-compose.yml and the backend's TestcontainersConfiguration (contract R13).
    with PostgresContainer("postgres:16-alpine", driver=None) as container:
        url = container.get_connection_url()
        with psycopg.connect(url, autocommit=True) as conn, conn.cursor() as cur:
            for migration in sorted(MIGRATIONS.glob("V*__*.sql"), key=_version):
                _apply(cur, migration.read_text(encoding="utf-8"))
            _apply(cur, SEED.read_text(encoding="utf-8"))
            _advance_identity_sequences(cur)
        yield url


@pytest.fixture
def conn(dsn: str):
    """A fresh connection per test. The executor only reads, so there is nothing to clean up."""
    with psycopg.connect(dsn, autocommit=True) as connection:
        yield connection


@pytest.fixture
def today() -> date:
    """The injectable clock, frozen (spec D6/A7) so relative ranges are reproducible."""
    return FROZEN_TODAY


@pytest.fixture(scope="session")
def merchant_seed(dsn: str) -> None:
    """Phase 4b merchant rows under profile 9000 (tests/fixtures/seed_merchants.sql)."""
    seed = (Path(__file__).parent / "fixtures" / "seed_merchants.sql").read_text()
    with psycopg.connect(dsn, autocommit=True) as owner:
        owner.execute(seed)

"""The analytics service's only database credential, and the guarantee behind it.

docs/INSIGHTS.md principle 4: "read-only as a database guarantee" — the same
philosophy as the composite FKs, a rule the schema enforces so code cannot forget
it. This file is where that claim is actually checked.
"""

import psycopg
import pytest
from psycopg.conninfo import make_conninfo

from analytics.config import Settings
from analytics.db import get_conn

# V4__insights.sql creates this role with the password Flyway substitutes into
# ${dbAnalyticsPassword}; tests/conftest.py substitutes the same dev default.
RO_USER = "myfinance_ro"
RO_PASSWORD = "myfinance-ro"


def read_only_dsn(dsn: str) -> str:
    """The container's DSN, re-pointed at the restricted role."""
    return make_conninfo(dsn, user=RO_USER, password=RO_PASSWORD)


def _settings(dsn: str) -> Settings:
    return Settings(database_url=dsn, analytics_token="test-token", tz="UTC")


def test_get_conn_yields_a_usable_connection_and_closes_it(dsn):
    generator = get_conn(_settings(read_only_dsn(dsn)))
    connection = next(generator)

    with connection.cursor() as cur:
        cur.execute("SELECT 1")
        assert cur.fetchone()[0] == 1

    with pytest.raises(StopIteration):
        next(generator)
    assert connection.closed


def test_the_connection_is_marked_read_only(dsn):
    generator = get_conn(_settings(read_only_dsn(dsn)))
    connection = next(generator)
    try:
        assert connection.read_only is True
    finally:
        generator.close()


def test_the_analytics_role_can_read_every_table_it_needs(dsn):
    with psycopg.connect(read_only_dsn(dsn), autocommit=True) as conn, conn.cursor() as cur:
        for table in ("txn", "category", "profile", "budget", "subscription", "insight"):
            cur.execute(f"SELECT count(*) FROM {table}")
            assert cur.fetchone()[0] >= 0


def test_the_analytics_role_cannot_write(dsn):
    """The guarantee. If this ever passes an INSERT, the grant in V4 has regressed."""
    with psycopg.connect(read_only_dsn(dsn), autocommit=True) as conn, conn.cursor() as cur:
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            cur.execute(
                "INSERT INTO txn (profile_id, category_id, amount, currency, txn_type, occurred_on)"
                " VALUES (1, 10, 1.0000, 'PLN', 'EXPENSE', DATE '2026-09-15')"
            )


def test_the_analytics_role_cannot_delete_or_update(dsn):
    with psycopg.connect(read_only_dsn(dsn), autocommit=True) as conn, conn.cursor() as cur:
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            cur.execute("UPDATE txn SET amount = 0 WHERE profile_id = 1")
    with psycopg.connect(read_only_dsn(dsn), autocommit=True) as conn, conn.cursor() as cur:
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            cur.execute("DELETE FROM txn WHERE profile_id = 1")

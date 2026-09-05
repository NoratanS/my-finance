"""Proves the harness itself: the backend's migrations applied, the placeholder substituted,
the seed loaded, and the clock frozen. Everything else in this suite builds on those four facts.
"""

from datetime import date


def test_seed_rows_are_loaded_and_profile_scoped(conn):
    with conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM txn WHERE profile_id = 1")
        assert cur.fetchone()[0] == 41
        cur.execute("SELECT count(*) FROM category WHERE profile_id = 1")
        assert cur.fetchone()[0] == 37
        cur.execute("SELECT count(*) FROM txn WHERE profile_id = 2")
        assert cur.fetchone()[0] == 1


def test_v4_created_the_read_only_role(conn):
    """One query proving both that V4 ran and that ${dbAnalyticsPassword} was substituted:
    an unsubstituted placeholder is a syntax error, so the role would not exist."""
    with conn.cursor() as cur:
        cur.execute("SELECT 1 FROM pg_roles WHERE rolname = 'myfinance_ro'")
        assert cur.fetchone() is not None


def test_the_clock_is_frozen(today):
    assert today == date(2026, 9, 15)

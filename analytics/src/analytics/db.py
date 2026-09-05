"""The analytics service's database access — read-only, one connection per request.

The credential is `myfinance_ro`, created by the backend's V4__insights.sql with
SELECT and nothing else (docs/SCHEMA.md "The read-only analytics role"). The
connection is *also* marked read-only at the session level: the grant is the real
guarantee, this is the belt-and-braces half, and it makes an accidental write fail
here rather than at the server with a less obvious message.
"""

from collections.abc import Iterator
from typing import Annotated

import psycopg
from fastapi import Depends

from analytics.config import Settings, get_settings


def get_conn(
    settings: Annotated[Settings, Depends(get_settings)],
) -> Iterator[psycopg.Connection]:
    """One connection per request, closed when the request ends.

    No pool: a personal instance issues a handful of executions a minute and the
    connect cost is milliseconds on the compose network. Add one when execute
    latency is measurably annoying, not before (CLAUDE.md section 2).
    """
    with psycopg.connect(settings.database_url, autocommit=True) as connection:
        connection.read_only = True
        yield connection

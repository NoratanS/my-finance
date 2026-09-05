"""Environment-driven settings and the executor's clock (docs/INSIGHTS.md)."""

import datetime
import os
from dataclasses import dataclass
from functools import lru_cache
from zoneinfo import ZoneInfo

# Dev default matching docker-compose.yml: the read-only role, its dev-default
# password, and the dev database name.
DEFAULT_DATABASE_URL = "postgresql://myfinance_ro:myfinance-ro@localhost:5432/myfinance"


@dataclass(frozen=True)
class Settings:
    """Every value has a working dev default, the same convention
    docker-compose.yml uses for the backend's DB_URL / DB_USERNAME."""

    database_url: str
    analytics_token: str
    tz: str


@lru_cache
def get_settings() -> Settings:
    return Settings(
        database_url=os.environ.get("DATABASE_URL", DEFAULT_DATABASE_URL),
        analytics_token=os.environ.get("ANALYTICS_TOKEN", "dev-analytics-token"),
        tz=os.environ.get("TZ", "UTC"),
    )


def today(settings: Settings) -> datetime.date:
    """The instance's local date, not UTC: txn.occurred_on is a plain DATE the
    user enters in their own time, so a purchase at 23:30 must not fall into
    tomorrow's bucket for an instance running east of UTC."""
    return datetime.datetime.now(ZoneInfo(settings.tz)).date()

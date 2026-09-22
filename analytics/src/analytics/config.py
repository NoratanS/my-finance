"""Environment-driven settings and the executor's clock (docs/INSIGHTS.md)."""

import datetime
from functools import lru_cache
from zoneinfo import ZoneInfo

from pydantic_settings import BaseSettings, SettingsConfigDict

# Dev default matching docker-compose.yml: the read-only role, its dev-default
# password, and the dev database name.
DEFAULT_DATABASE_URL = "postgresql://myfinance_ro:myfinance-ro@localhost:5432/myfinance"


class Settings(BaseSettings):
    """Every value has a working dev default, the same convention
    docker-compose.yml uses for the backend's DB_URL / DB_USERNAME.

    Field names match their env vars case-insensitively (DATABASE_URL,
    ANALYTICS_TOKEN, TZ) — pydantic-settings' default behaviour — so no explicit
    aliases are needed.
    """

    # frozen=True: the original was @dataclass(frozen=True); analytics_token is the
    # shared secret guarding the internal service boundary, so this stays immutable
    # after construction rather than a runtime-mutable settings object.
    model_config = SettingsConfigDict(frozen=True)

    database_url: str = DEFAULT_DATABASE_URL
    analytics_token: str = "dev-analytics-token"
    tz: str = "UTC"


@lru_cache
def get_settings() -> Settings:
    return Settings()


def today(settings: Settings) -> datetime.date:
    """The instance's local date, not UTC: txn.occurred_on is a plain DATE the
    user enters in their own time, so a purchase at 23:30 must not fall into
    tomorrow's bucket for an instance running east of UTC."""
    return datetime.datetime.now(ZoneInfo(settings.tz)).date()

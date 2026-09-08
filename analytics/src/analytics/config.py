"""Environment-driven settings and the executor's clock (docs/INSIGHTS.md)."""

import datetime
from functools import lru_cache
from zoneinfo import ZoneInfo

from pydantic import field_validator
from pydantic_settings import BaseSettings

# Dev default matching docker-compose.yml: the read-only role, its dev-default
# password, and the dev database name.
DEFAULT_DATABASE_URL = "postgresql://myfinance_ro:myfinance-ro@localhost:5432/myfinance"


class Settings(BaseSettings):
    """Every value has a working dev default, the same convention
    docker-compose.yml uses for the backend's DB_URL / DB_USERNAME.

    Field names match their env vars case-insensitively (DATABASE_URL,
    ANALYTICS_TOKEN, TZ, OLLAMA_URL, OLLAMA_MODEL) — pydantic-settings' default
    behaviour — so no explicit aliases are needed.
    """

    database_url: str = DEFAULT_DATABASE_URL
    analytics_token: str = "dev-analytics-token"
    tz: str = "UTC"
    # Defaults are load-bearing, not decoration: Stage 1's analytics/tests/test_db.py
    # constructs Settings(database_url=..., analytics_token=..., tz=...) with exactly the
    # three original fields. Adding required fields here would break all five of its tests,
    # including the one that proves myfinance_ro cannot write.
    ollama_url: str | None = None      # OLLAMA_URL; unset or empty => interpretation is off
    ollama_model: str = "qwen3:4b"     # OLLAMA_MODEL; the tag the ai-profile container serves

    @field_validator("ollama_url", mode="before")
    @classmethod
    def _blank_ollama_url_means_none(cls, value: str | None) -> str | None:
        """A plain BaseSettings field would leave OLLAMA_URL="" as "" rather than
        None, which would not turn interpretation off."""
        return value or None


@lru_cache
def get_settings() -> Settings:
    return Settings()


def today(settings: Settings) -> datetime.date:
    """The instance's local date, not UTC: txn.occurred_on is a plain DATE the
    user enters in their own time, so a purchase at 23:30 must not fall into
    tomorrow's bucket for an instance running east of UTC."""
    return datetime.datetime.now(ZoneInfo(settings.tz)).date()

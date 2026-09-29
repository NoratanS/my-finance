import datetime

from analytics import config
from analytics.config import Settings, get_settings, today


class _FixedDatetime(datetime.datetime):
    """Stand-in for datetime.datetime whose now() always returns the same
    frozen instant, converted to whatever tzinfo is asked for."""

    _fixed_utc = datetime.datetime(2024, 6, 15, 23, 30, tzinfo=datetime.UTC)

    @classmethod
    def now(cls, tz=None):
        if tz is None:
            return cls._fixed_utc
        return cls._fixed_utc.astimezone(tz)


class _FakeDatetimeModule:
    """Replaces the `datetime` name in analytics.config's namespace, since
    config.py does `import datetime` and calls `datetime.datetime.now(tz)`."""

    datetime = _FixedDatetime


def test_today_uses_the_configured_timezone(monkeypatch):
    """today() must read the instant in settings.tz, not the server's own
    timezone — a 2024-06-15 23:30 UTC instant is already 2024-06-16 in
    Europe/Warsaw (UTC+2 in June), so this would fail if ZoneInfo(settings.tz)
    were ever swapped for UTC."""
    monkeypatch.setattr(config, "datetime", _FakeDatetimeModule)
    settings = Settings(database_url="unused", analytics_token="unused", tz="Europe/Warsaw")

    assert today(settings) == datetime.date(2024, 6, 16)


def test_settings_come_from_the_environment(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://myfinance_ro:s3cret@postgres:5432/myfinance")
    monkeypatch.setenv("ANALYTICS_TOKEN", "token-from-env")
    monkeypatch.setenv("TZ", "Europe/Warsaw")

    settings = get_settings()

    assert settings.database_url == "postgresql://myfinance_ro:s3cret@postgres:5432/myfinance"
    assert settings.analytics_token == "token-from-env"
    assert settings.tz == "Europe/Warsaw"


def test_settings_fall_back_to_dev_defaults(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("ANALYTICS_TOKEN", raising=False)
    monkeypatch.delenv("TZ", raising=False)

    settings = get_settings()

    assert settings.database_url.startswith("postgresql://myfinance_ro:")
    assert settings.analytics_token == "dev-analytics-token"
    assert settings.tz == "UTC"

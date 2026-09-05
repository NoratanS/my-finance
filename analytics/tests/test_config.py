from analytics.config import get_settings


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

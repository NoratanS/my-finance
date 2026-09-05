"""Fixtures shared by every analytics test."""

import pytest

from analytics.config import get_settings


@pytest.fixture(autouse=True)
def clear_settings_cache():
    """get_settings() is lru_cached, so a test that changes the environment must
    not leak its Settings into the next one."""
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()

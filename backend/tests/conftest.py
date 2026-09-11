import pytest

from app.config import get_settings


@pytest.fixture(autouse=True)
def _test_env(monkeypatch: pytest.MonkeyPatch):
    """Give every test a valid key and a zero tool delay, isolated from the real .env."""
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("WEATHER_DELAY_SECONDS", "0")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()

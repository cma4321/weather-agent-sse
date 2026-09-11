import os

import pytest

from app.config import get_settings

# Set at import time too (not just inside the fixture below): pytest imports test
# modules during collection, before any fixture runs. app.main builds a module-level
# `app = create_app()` on import, which needs a valid OPENAI_API_KEY at that point.
os.environ.setdefault("OPENAI_API_KEY", "test-key")
os.environ.setdefault("WEATHER_DELAY_SECONDS", "0")


@pytest.fixture(autouse=True)
def _test_env(monkeypatch: pytest.MonkeyPatch):
    """Give every test a valid key and a zero tool delay, isolated from the real .env."""
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("WEATHER_DELAY_SECONDS", "0")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()

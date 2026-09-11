from app.config import REPO_ROOT, Settings, get_settings


def test_defaults_when_only_key_is_set(monkeypatch):
    monkeypatch.delenv("WEATHER_DELAY_SECONDS")
    settings = Settings(_env_file=None, openai_api_key="k")
    assert settings.openai_api_key == "k"
    assert settings.openai_model == "gpt-4o-mini"
    assert settings.weather_delay_seconds == 2.0
    assert settings.cors_origin_list == ["http://localhost:3000"]


def test_env_overrides(monkeypatch):
    monkeypatch.setenv("OPENAI_MODEL", "gpt-x")
    monkeypatch.setenv("CORS_ORIGINS", "http://a:1, http://b:2")
    settings = Settings(_env_file=None)
    assert settings.openai_model == "gpt-x"
    assert settings.cors_origin_list == ["http://a:1", "http://b:2"]


def test_env_file_points_to_repo_root():
    assert (REPO_ROOT / ".env.example").is_file()
    assert Settings.model_config["env_file"] == REPO_ROOT / ".env"


def test_get_settings_is_cached():
    assert get_settings() is get_settings()

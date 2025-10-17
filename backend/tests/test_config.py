"""Test configuration management."""


from app.config import Settings, get_settings


def test_settings_defaults():
    """Test default configuration values."""
    settings = Settings()

    assert settings.FLASK_ENV == "development"
    assert settings.DEBUG is True
    assert settings.SECRET_KEY == "dev-secret-key-change-in-production"


def test_settings_from_env(monkeypatch):
    """Test configuration from environment variables."""
    monkeypatch.setenv("FLASK_ENV", "production")
    monkeypatch.setenv("DEBUG", "false")
    monkeypatch.setenv("SECRET_KEY", "prod-secret")

    settings = Settings()

    assert settings.FLASK_ENV == "production"
    assert settings.DEBUG is False
    assert settings.SECRET_KEY == "prod-secret"


def test_database_url_property():
    """Test SQLALCHEMY_DATABASE_URI property."""
    settings = Settings(DATABASE_URL="postgresql://test:test@localhost/test")

    assert settings.SQLALCHEMY_DATABASE_URI == "postgresql://test:test@localhost/test"


def test_get_settings_cached():
    """Test that get_settings returns cached instance."""
    settings1 = get_settings()
    settings2 = get_settings()

    assert settings1 is settings2


def test_settings_testing_env_override(tmp_path, monkeypatch):
    """Settings should load testing override env file when FLASK_ENV=testing."""
    base_env = tmp_path / ".env"
    override_env = tmp_path / ".env.test"

    base_env.write_text("DATABASE_URL=postgresql://base\n")
    override_env.write_text("DATABASE_URL=postgresql://override\n")

    monkeypatch.setenv("FLASK_ENV", "testing")

    import app.config as config

    config.get_settings.cache_clear()
    monkeypatch.setattr(config, "BASE_DIR", tmp_path)
    monkeypatch.setattr(config, "DEFAULT_ENV_FILES", (base_env,))
    monkeypatch.setattr(config, "ENV_FILE_OVERRIDES", {"testing": (override_env,)})

    try:
        settings = config.get_settings()
        assert settings.DATABASE_URL == "postgresql://override"
    finally:
        # Ensure later tests see fresh settings values rather than the override copy.
        config.get_settings.cache_clear()


def test_settings_extra_env_ignored(monkeypatch):
    """Extra environment variables should be ignored."""
    monkeypatch.setenv("SOME_UNRELATED_SETTING", "42")

    settings = Settings()

    assert not hasattr(settings, "SOME_UNRELATED_SETTING")

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

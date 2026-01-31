"""Test configuration management."""

from app.config import Environment, Settings


def test_environment_defaults(monkeypatch):
    """Test Environment loads default values."""
    # Clear environment variables that would override defaults
    monkeypatch.delenv("FLASK_ENV", raising=False)
    monkeypatch.delenv("DEBUG", raising=False)
    monkeypatch.delenv("SECRET_KEY", raising=False)

    env = Environment()

    assert env.FLASK_ENV == "development"
    assert env.DEBUG is True
    assert env.SECRET_KEY == "dev-secret-key-change-in-production"


def test_environment_from_env_vars(monkeypatch):
    """Test Environment loads from environment variables."""
    monkeypatch.setenv("FLASK_ENV", "production")
    monkeypatch.setenv("DEBUG", "false")
    monkeypatch.setenv("SECRET_KEY", "prod-secret")

    env = Environment()

    assert env.FLASK_ENV == "production"
    assert env.DEBUG is False
    assert env.SECRET_KEY == "prod-secret"


def test_settings_load_default_values(monkeypatch):
    """Test Settings.load() with default environment."""
    # Clear environment variables that would override defaults
    monkeypatch.delenv("FLASK_ENV", raising=False)
    monkeypatch.delenv("DEBUG", raising=False)
    monkeypatch.delenv("SECRET_KEY", raising=False)

    settings = Settings.load()

    assert settings.flask_env == "development"
    assert settings.debug is True
    assert settings.secret_key == "dev-secret-key-change-in-production"
    assert settings.sse_heartbeat_interval == 5  # Development default


def test_settings_load_production_heartbeat():
    """Test Settings.load() sets heartbeat to 30 in production."""
    env = Environment(FLASK_ENV="production")
    settings = Settings.load(env)

    assert settings.sse_heartbeat_interval == 30


def test_settings_load_testing_ai_mode():
    """Test Settings.load() forces ai_testing_mode=True in testing."""
    env = Environment(FLASK_ENV="testing", AI_TESTING_MODE=False)
    settings = Settings.load(env)

    assert settings.ai_testing_mode is True


def test_settings_load_explicit_ai_testing_mode():
    """Test Settings.load() respects explicit AI_TESTING_MODE in development."""
    env = Environment(FLASK_ENV="development", AI_TESTING_MODE=True)
    settings = Settings.load(env)

    assert settings.ai_testing_mode is True


def test_settings_load_engine_options():
    """Test Settings.load() builds engine options from pool settings."""
    env = Environment(DB_POOL_SIZE=10, DB_POOL_MAX_OVERFLOW=20, DB_POOL_TIMEOUT=15)
    settings = Settings.load(env)

    assert settings.sqlalchemy_engine_options["pool_size"] == 10
    assert settings.sqlalchemy_engine_options["max_overflow"] == 20
    assert settings.sqlalchemy_engine_options["pool_timeout"] == 15
    assert settings.sqlalchemy_engine_options["pool_pre_ping"] is True


def test_settings_direct_construction():
    """Test constructing Settings directly (for tests)."""
    settings = Settings(
        database_url="sqlite://",
        secret_key="test-key",
        flask_env="testing",
        debug=True,
        cors_origins=["http://localhost"],
        s3_endpoint_url="http://localhost:9000",
        s3_access_key_id="admin",
        s3_secret_access_key="password",
        s3_bucket_name="test-bucket",
        s3_region="us-east-1",
        s3_use_ssl=False,
        max_image_size=10000000,
        max_file_size=100000000,
        allowed_image_types=["image/jpeg"],
        allowed_file_types=["application/pdf"],
        thumbnail_storage_path="/tmp/thumbnails",
        download_cache_base_path="/tmp/cache",
        download_cache_cleanup_hours=24,
        celery_broker_url="pyamqp://guest@localhost//",
        celery_result_backend="db+postgresql+psycopg://postgres:@localhost:5432/test",
        ai_provider="openai",
        openai_api_key="",
        openai_model="gpt-5-mini",
        openai_reasoning_effort="low",
        openai_verbosity="medium",
        openai_max_output_tokens=None,
        ai_analysis_cache_path=None,
        ai_cleanup_cache_path=None,
        ai_testing_mode=True,
        mouser_search_api_key="",
        task_max_workers=4,
        task_timeout_seconds=300,
        task_cleanup_interval_seconds=600,
        metrics_update_interval=60,
        graceful_shutdown_timeout=600,
        drain_auth_key="",
        frontend_version_url="http://localhost:3000/version.json",
        sse_heartbeat_interval=1,
        sse_gateway_url="http://localhost:3001",
        sse_callback_secret="",
        db_pool_size=20,
        db_pool_max_overflow=30,
        db_pool_timeout=10,
        db_pool_echo=False,
        diagnostics_enabled=False,
        diagnostics_slow_query_threshold_ms=100,
        diagnostics_slow_request_threshold_ms=500,
        diagnostics_log_all_queries=False,
    )

    assert settings.database_url == "sqlite://"
    assert settings.secret_key == "test-key"


def test_settings_model_copy_update():
    """Test Settings.model_copy with update dict (test fixture pattern)."""
    base_settings = Settings.load()
    updated = base_settings.model_copy(update={
        "database_url": "sqlite://",
        "sqlalchemy_engine_options": {"poolclass": "StaticPool"},
    })

    assert updated.database_url == "sqlite://"
    assert updated.sqlalchemy_engine_options["poolclass"] == "StaticPool"


def test_to_flask_config():
    """Test Settings.to_flask_config() creates FlaskConfig."""
    settings = Settings.load()
    flask_config = settings.to_flask_config()

    assert flask_config.SECRET_KEY == settings.secret_key
    assert flask_config.SQLALCHEMY_DATABASE_URI == settings.database_url
    assert flask_config.SQLALCHEMY_TRACK_MODIFICATIONS is False
    assert flask_config.SQLALCHEMY_ENGINE_OPTIONS == settings.sqlalchemy_engine_options


def test_settings_extra_env_ignored(monkeypatch):
    """Extra environment variables should be ignored."""
    monkeypatch.setenv("SOME_UNRELATED_SETTING", "42")

    env = Environment()

    assert not hasattr(env, "SOME_UNRELATED_SETTING")


def test_settings_is_testing_property():
    """Test is_testing property."""
    settings = Settings.load(Environment(FLASK_ENV="testing"))
    assert settings.is_testing is True

    settings = Settings.load(Environment(FLASK_ENV="development"))
    assert settings.is_testing is False


def test_settings_real_ai_allowed_property():
    """Test real_ai_allowed property."""
    settings = Settings.load(Environment(AI_TESTING_MODE=True))
    assert settings.real_ai_allowed is False

    # Use FLASK_ENV=development to prevent Settings.load() from forcing ai_testing_mode=True
    settings = Settings.load(Environment(FLASK_ENV="development", AI_TESTING_MODE=False))
    assert settings.real_ai_allowed is True

"""Configuration management using Pydantic settings.

This module implements a two-layer configuration system:
1. Environment: Loads raw values from environment variables (UPPER_CASE)
2. Settings: Clean application settings with lowercase fields and derived values

Usage:
    # Production: Load from environment
    settings = Settings.load()

    # Tests: Construct directly with test values
    settings = Settings(database_url="sqlite://", secret_key="test", ...)
"""

from pathlib import Path
from typing import Any

from pydantic import BaseModel, ConfigDict, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Project root directory (parent of app/)
_PROJECT_ROOT = Path(__file__).resolve().parent.parent

# Default secret key that must be changed in production
_DEFAULT_SECRET_KEY = "dev-secret-key-change-in-production"


class Environment(BaseSettings):
    """Raw environment variable loading.

    This class loads values directly from environment variables with UPPER_CASE names.
    It should not contain any derived values or transformation logic.
    """

    model_config = SettingsConfigDict(
        env_file=_PROJECT_ROOT / ".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # Flask settings
    SECRET_KEY: str = Field(default=_DEFAULT_SECRET_KEY)
    FLASK_ENV: str = Field(default="development")
    DEBUG: bool = Field(default=True)

    # Database settings
    DATABASE_URL: str = Field(
        default="postgresql+psycopg://postgres:postgres@localhost:5432/electronics_inventory",
        description="PostgreSQL connection string",
    )

    # CORS settings
    CORS_ORIGINS: list[str] = Field(
        default=["http://localhost:3000"], description="Allowed CORS origins"
    )

    # S3/Ceph storage configuration
    S3_ENDPOINT_URL: str = Field(
        default="http://localhost:9000",
        description="Ceph RGW S3-compatible endpoint"
    )
    S3_ACCESS_KEY_ID: str = Field(
        default="admin",
        description="S3 access key"
    )
    S3_SECRET_ACCESS_KEY: str = Field(
        default="password",
        description="S3 secret key"
    )
    S3_BUCKET_NAME: str = Field(
        default="electronics-inventory-part-attachments",
        description="Single bucket for all documents"
    )
    S3_REGION: str = Field(
        default="us-east-1",
        description="S3 region for boto3"
    )
    S3_USE_SSL: bool = Field(
        default=False,
        description="SSL for S3 connections (False for local Ceph)"
    )

    # Document processing settings
    MAX_IMAGE_SIZE: int = Field(
        default=10 * 1024 * 1024,  # 10MB
        description="Maximum image file size in bytes"
    )
    MAX_FILE_SIZE: int = Field(
        default=100 * 1024 * 1024,  # 100MB
        description="Maximum file size in bytes"
    )
    ALLOWED_IMAGE_TYPES: list[str] = Field(
        default=["image/jpeg", "image/png", "image/webp", "image/svg+xml"],
        description="Allowed image MIME types"
    )
    ALLOWED_FILE_TYPES: list[str] = Field(
        default=["application/pdf"],
        description="Allowed file MIME types (excluding images)"
    )
    THUMBNAIL_STORAGE_PATH: str = Field(
        default="/tmp/thumbnails",
        description="Path for disk-based thumbnail storage"
    )

    # Download cache settings
    DOWNLOAD_CACHE_BASE_PATH: str = Field(
        default="/tmp/download_cache",
        description="Base path for download cache storage"
    )
    DOWNLOAD_CACHE_CLEANUP_HOURS: int = Field(
        default=24,
        description="Hours after which cached downloads are cleaned up"
    )

    # Celery settings
    CELERY_BROKER_URL: str = Field(
        default="pyamqp://guest@localhost//",
        description="RabbitMQ broker URL for Celery",
    )
    CELERY_RESULT_BACKEND: str = Field(
        default="db+postgresql+psycopg://postgres:@localhost:5432/electronics_inventory",
        description="PostgreSQL result backend for Celery",
    )

    # AI Provider settings
    AI_PROVIDER: str = Field(
        default="openai",
        description="AI provider to use ('openai')"
    )

    # OpenAI settings
    OPENAI_API_KEY: str = Field(
        default="", description="OpenAI API key for AI features"
    )
    OPENAI_MODEL: str = Field(
        default="gpt-5-mini", description="OpenAI model to use for AI analysis"
    )
    OPENAI_REASONING_EFFORT: str = Field(
        default="low", description="OpenAI reasoning effort level (low/medium/high)"
    )
    OPENAI_VERBOSITY: str = Field(
        default="medium", description="OpenAI response verbosity (low/medium/high)"
    )
    OPENAI_MAX_OUTPUT_TOKENS: int | None = Field(
        default=None, description="Maximum output tokens for OpenAI responses"
    )
    AI_ANALYSIS_CACHE_PATH: str | None = Field(
        default=None,
        description="Path to a JSON file for caching AI analysis responses. "
        "If the file exists, its contents are returned instead of calling the AI. "
        "If the file doesn't exist, the AI response is saved there for future replay."
    )
    AI_CLEANUP_CACHE_PATH: str | None = Field(
        default=None,
        description="Path to a JSON file for caching AI cleanup responses. "
        "If the file exists, its contents are returned instead of calling the AI. "
        "If the file doesn't exist, the AI response is saved there for future replay."
    )

    # Global AI settings
    AI_TESTING_MODE: bool = Field(
        default=False,
        description="When true, AI endpoints return dummy task IDs for testing without calling real AI",
    )

    # Mouser API settings
    MOUSER_SEARCH_API_KEY: str = Field(
        default="", description="Mouser Search API key for part search integration"
    )

    # Task management settings
    TASK_MAX_WORKERS: int = Field(
        default=4,
        description="Maximum number of concurrent background tasks"
    )
    TASK_TIMEOUT_SECONDS: int = Field(
        default=300,
        description="Task execution timeout in seconds (5 minutes)"
    )
    TASK_CLEANUP_INTERVAL_SECONDS: int = Field(
        default=600,
        description="How often to clean up completed tasks in seconds (10 minutes)"
    )

    # Prometheus metrics settings
    METRICS_UPDATE_INTERVAL: int = Field(
        default=60,
        description="Metrics background update interval in seconds"
    )

    # Graceful shutdown settings
    GRACEFUL_SHUTDOWN_TIMEOUT: int = Field(
        default=600,
        description="Maximum seconds to wait for tasks during shutdown (10 minutes)"
    )
    DRAIN_AUTH_KEY: str = Field(
        default="",
        description="Bearer token for authenticating drain endpoint access"
    )

    # SSE version notification settings
    FRONTEND_VERSION_URL: str = Field(
        default="http://localhost:3000/version.json",
        description="URL to fetch frontend version information"
    )
    SSE_HEARTBEAT_INTERVAL: int = Field(
        default=5,
        description="SSE heartbeat interval in seconds (5 for development, 30 for production)"
    )

    # SSE Gateway integration settings
    SSE_GATEWAY_URL: str = Field(
        default="http://localhost:3001",
        description="SSE Gateway base URL for internal send endpoint"
    )
    SSE_CALLBACK_SECRET: str = Field(
        default="",
        description="Shared secret for authenticating SSE Gateway callbacks (required in production)"
    )

    # Database connection pool settings
    DB_POOL_SIZE: int = Field(
        default=20,
        description="Number of persistent connections in the pool"
    )
    DB_POOL_MAX_OVERFLOW: int = Field(
        default=30,
        description="Max temporary connections above pool_size"
    )
    DB_POOL_TIMEOUT: int = Field(
        default=10,
        description="Seconds to wait for a connection before timeout"
    )
    DB_POOL_ECHO: bool | str = Field(
        default=False,
        description="Log connection pool checkout/checkin events. Use 'debug' for verbose output."
    )

    # OIDC Authentication settings
    BASEURL: str = Field(
        default="http://localhost:3000",
        description="Base URL for the application (used for redirect URI and cookie security)"
    )
    OIDC_ENABLED: bool = Field(
        default=False,
        description="Enable OIDC authentication"
    )
    OIDC_ISSUER_URL: str | None = Field(
        default=None,
        description="OIDC issuer URL (e.g., https://auth.example.com/realms/ei)"
    )
    OIDC_CLIENT_ID: str | None = Field(
        default=None,
        description="OIDC client ID"
    )
    OIDC_CLIENT_SECRET: str | None = Field(
        default=None,
        description="OIDC client secret (confidential client)"
    )
    OIDC_SCOPES: str = Field(
        default="openid profile email",
        description="Space-separated OIDC scopes"
    )
    OIDC_AUDIENCE: str | None = Field(
        default=None,
        description="Expected 'aud' claim in JWT (defaults to client_id if not set)"
    )
    OIDC_CLOCK_SKEW_SECONDS: int = Field(
        default=30,
        description="Clock skew tolerance for token validation"
    )
    OIDC_COOKIE_NAME: str = Field(
        default="access_token",
        description="Cookie name for storing JWT access token"
    )
    OIDC_COOKIE_SECURE: bool | None = Field(
        default=None,
        description="Secure flag for cookie (inferred from BASEURL if None)"
    )
    OIDC_COOKIE_SAMESITE: str = Field(
        default="Lax",
        description="SameSite attribute for cookie"
    )
    OIDC_REFRESH_COOKIE_NAME: str = Field(
        default="refresh_token",
        description="Cookie name for storing refresh token"
    )

    # Request diagnostics settings
    DIAGNOSTICS_ENABLED: bool = Field(
        default=False,
        description="Enable request timing and query profiling diagnostics"
    )
    DIAGNOSTICS_SLOW_QUERY_THRESHOLD_MS: int = Field(
        default=100,
        description="Log queries taking longer than this (milliseconds)"
    )
    DIAGNOSTICS_SLOW_REQUEST_THRESHOLD_MS: int = Field(
        default=500,
        description="Log requests taking longer than this (milliseconds)"
    )
    DIAGNOSTICS_LOG_ALL_QUERIES: bool = Field(
        default=False,
        description="Log all queries (verbose, use for debugging only)"
    )


class Settings(BaseModel):
    """Application settings with lowercase fields and derived values.

    This class represents the final, resolved application configuration.
    All field names are lowercase for consistency.

    For production, use Settings.load() to load from environment.
    For tests, construct directly with test values (defaults provided for convenience).
    """

    model_config = ConfigDict(from_attributes=True)

    # Flask settings
    secret_key: str = _DEFAULT_SECRET_KEY
    flask_env: str = "development"
    debug: bool = True

    # Database settings
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/electronics_inventory"

    # CORS settings
    cors_origins: list[str] = Field(default=["http://localhost:3000"])

    # S3/Ceph storage configuration
    s3_endpoint_url: str = "http://localhost:9000"
    s3_access_key_id: str = "admin"
    s3_secret_access_key: str = "password"
    s3_bucket_name: str = "electronics-inventory-part-attachments"
    s3_region: str = "us-east-1"
    s3_use_ssl: bool = False

    # Document processing settings
    max_image_size: int = 10 * 1024 * 1024  # 10MB
    max_file_size: int = 100 * 1024 * 1024  # 100MB
    allowed_image_types: list[str] = Field(default=["image/jpeg", "image/png", "image/webp", "image/svg+xml"])
    allowed_file_types: list[str] = Field(default=["application/pdf"])
    thumbnail_storage_path: str = "/tmp/thumbnails"

    # Download cache settings
    download_cache_base_path: str = "/tmp/download_cache"
    download_cache_cleanup_hours: int = 24

    # Celery settings
    celery_broker_url: str = "pyamqp://guest@localhost//"
    celery_result_backend: str = "db+postgresql+psycopg://postgres:@localhost:5432/electronics_inventory"

    # AI Provider settings
    ai_provider: str = "openai"
    openai_api_key: str = ""
    openai_model: str = "gpt-5-mini"
    openai_reasoning_effort: str = "low"
    openai_verbosity: str = "medium"
    openai_max_output_tokens: int | None = None
    ai_analysis_cache_path: str | None = None
    ai_cleanup_cache_path: str | None = None
    ai_testing_mode: bool = False  # Resolved: True if flask_env == "testing" via load()

    # Mouser API settings
    mouser_search_api_key: str = ""

    # Task management settings
    task_max_workers: int = 4
    task_timeout_seconds: int = 300
    task_cleanup_interval_seconds: int = 600

    # Prometheus metrics settings
    metrics_update_interval: int = 60

    # Graceful shutdown settings
    graceful_shutdown_timeout: int = 600
    drain_auth_key: str = ""

    # SSE version notification settings
    frontend_version_url: str = "http://localhost:3000/version.json"
    sse_heartbeat_interval: int = 5  # Resolved: 30 for production via load()

    # SSE Gateway integration settings
    sse_gateway_url: str = "http://localhost:3001"
    sse_callback_secret: str = ""

    # Database connection pool settings
    db_pool_size: int = 20
    db_pool_max_overflow: int = 30
    db_pool_timeout: int = 10
    db_pool_echo: bool | str = False

    # OIDC Authentication settings
    baseurl: str = "http://localhost:3000"
    oidc_enabled: bool = False
    oidc_issuer_url: str | None = None
    oidc_client_id: str | None = None
    oidc_client_secret: str | None = None
    oidc_scopes: str = "openid profile email"
    oidc_audience: str | None = None  # Resolved: falls back to oidc_client_id via load()
    oidc_clock_skew_seconds: int = 30
    oidc_cookie_name: str = "access_token"
    oidc_cookie_secure: bool = False  # Resolved: inferred from baseurl via load()
    oidc_cookie_samesite: str = "Lax"
    oidc_refresh_cookie_name: str = "refresh_token"

    # Request diagnostics settings
    diagnostics_enabled: bool = False
    diagnostics_slow_query_threshold_ms: int = 100
    diagnostics_slow_request_threshold_ms: int = 500
    diagnostics_log_all_queries: bool = False

    # SQLAlchemy engine options (regular field, not property)
    sqlalchemy_engine_options: dict[str, Any] = Field(default_factory=dict)

    @property
    def is_testing(self) -> bool:
        """Check if running in testing environment."""
        return self.flask_env == "testing"

    @property
    def is_production(self) -> bool:
        """Check if running in production environment."""
        return self.flask_env == "production"

    @property
    def real_ai_allowed(self) -> bool:
        """Determine whether real AI analysis is permitted."""
        return not self.ai_testing_mode

    def to_flask_config(self) -> "FlaskConfig":
        """Create Flask configuration object from settings."""
        return FlaskConfig(
            SECRET_KEY=self.secret_key,
            SQLALCHEMY_DATABASE_URI=self.database_url,
            SQLALCHEMY_TRACK_MODIFICATIONS=False,
            SQLALCHEMY_ENGINE_OPTIONS=self.sqlalchemy_engine_options,
        )

    def validate_production_config(self) -> None:
        """Validate that required configuration is set for production.

        Raises:
            ConfigurationError: If required settings are missing or insecure
        """
        from app.exceptions import ConfigurationError

        errors: list[str] = []

        # SECRET_KEY must be changed from default in production
        if self.is_production and self.secret_key == _DEFAULT_SECRET_KEY:
            errors.append(
                "SECRET_KEY must be set to a secure value in production "
                "(current value is the insecure default)"
            )

        # SSE_CALLBACK_SECRET required in production for authenticating gateway callbacks
        if self.is_production and not self.sse_callback_secret:
            errors.append(
                "SSE_CALLBACK_SECRET must be set in production "
                "for authenticating SSE Gateway callbacks"
            )

        # OIDC settings required when OIDC is enabled (any environment)
        if self.oidc_enabled:
            if not self.oidc_issuer_url:
                errors.append(
                    "OIDC_ISSUER_URL is required when OIDC_ENABLED=True"
                )
            if not self.oidc_client_id:
                errors.append(
                    "OIDC_CLIENT_ID is required when OIDC_ENABLED=True"
                )
            if not self.oidc_client_secret:
                errors.append(
                    "OIDC_CLIENT_SECRET is required when OIDC_ENABLED=True"
                )

        if errors:
            raise ConfigurationError(
                "Configuration validation failed:\n  - " + "\n  - ".join(errors)
            )

    @classmethod
    def load(cls, env: Environment | None = None) -> "Settings":
        """Load settings from environment variables.

        This method:
        1. Loads Environment from environment variables
        2. Computes derived values (sse_heartbeat_interval, ai_testing_mode)
        3. Builds default SQLAlchemy engine options
        4. Constructs and returns a Settings instance

        Args:
            env: Optional Environment instance (for testing). If None, loads from environment.

        Returns:
            Settings instance with all values resolved
        """
        if env is None:
            env = Environment()

        # Compute sse_heartbeat_interval: 30 for production, else use env value
        sse_heartbeat_interval = (
            30 if env.FLASK_ENV == "production" else env.SSE_HEARTBEAT_INTERVAL
        )

        # Compute ai_testing_mode: force True if testing, else use env value
        ai_testing_mode = True if env.FLASK_ENV == "testing" else env.AI_TESTING_MODE

        # Resolve OIDC audience: fall back to client_id if not explicitly set
        oidc_audience = env.OIDC_AUDIENCE or env.OIDC_CLIENT_ID

        # Resolve OIDC cookie secure: explicit setting takes priority, else infer from baseurl
        if env.OIDC_COOKIE_SECURE is not None:
            oidc_cookie_secure = env.OIDC_COOKIE_SECURE
        else:
            oidc_cookie_secure = env.BASEURL.startswith("https://")

        # Build default SQLAlchemy engine options
        sqlalchemy_engine_options = {
            "pool_size": env.DB_POOL_SIZE,
            "max_overflow": env.DB_POOL_MAX_OVERFLOW,
            "pool_timeout": env.DB_POOL_TIMEOUT,
            "pool_pre_ping": True,  # Verify connections before use
            "echo_pool": env.DB_POOL_ECHO,
        }

        return cls(
            secret_key=env.SECRET_KEY,
            flask_env=env.FLASK_ENV,
            debug=env.DEBUG,
            database_url=env.DATABASE_URL,
            cors_origins=env.CORS_ORIGINS,
            s3_endpoint_url=env.S3_ENDPOINT_URL,
            s3_access_key_id=env.S3_ACCESS_KEY_ID,
            s3_secret_access_key=env.S3_SECRET_ACCESS_KEY,
            s3_bucket_name=env.S3_BUCKET_NAME,
            s3_region=env.S3_REGION,
            s3_use_ssl=env.S3_USE_SSL,
            max_image_size=env.MAX_IMAGE_SIZE,
            max_file_size=env.MAX_FILE_SIZE,
            allowed_image_types=env.ALLOWED_IMAGE_TYPES,
            allowed_file_types=env.ALLOWED_FILE_TYPES,
            thumbnail_storage_path=env.THUMBNAIL_STORAGE_PATH,
            download_cache_base_path=env.DOWNLOAD_CACHE_BASE_PATH,
            download_cache_cleanup_hours=env.DOWNLOAD_CACHE_CLEANUP_HOURS,
            celery_broker_url=env.CELERY_BROKER_URL,
            celery_result_backend=env.CELERY_RESULT_BACKEND,
            ai_provider=env.AI_PROVIDER,
            openai_api_key=env.OPENAI_API_KEY,
            openai_model=env.OPENAI_MODEL,
            openai_reasoning_effort=env.OPENAI_REASONING_EFFORT,
            openai_verbosity=env.OPENAI_VERBOSITY,
            openai_max_output_tokens=env.OPENAI_MAX_OUTPUT_TOKENS,
            ai_analysis_cache_path=env.AI_ANALYSIS_CACHE_PATH,
            ai_cleanup_cache_path=env.AI_CLEANUP_CACHE_PATH,
            ai_testing_mode=ai_testing_mode,
            mouser_search_api_key=env.MOUSER_SEARCH_API_KEY,
            task_max_workers=env.TASK_MAX_WORKERS,
            task_timeout_seconds=env.TASK_TIMEOUT_SECONDS,
            task_cleanup_interval_seconds=env.TASK_CLEANUP_INTERVAL_SECONDS,
            metrics_update_interval=env.METRICS_UPDATE_INTERVAL,
            graceful_shutdown_timeout=env.GRACEFUL_SHUTDOWN_TIMEOUT,
            drain_auth_key=env.DRAIN_AUTH_KEY,
            frontend_version_url=env.FRONTEND_VERSION_URL,
            sse_heartbeat_interval=sse_heartbeat_interval,
            sse_gateway_url=env.SSE_GATEWAY_URL,
            sse_callback_secret=env.SSE_CALLBACK_SECRET,
            db_pool_size=env.DB_POOL_SIZE,
            db_pool_max_overflow=env.DB_POOL_MAX_OVERFLOW,
            db_pool_timeout=env.DB_POOL_TIMEOUT,
            db_pool_echo=env.DB_POOL_ECHO,
            baseurl=env.BASEURL,
            oidc_enabled=env.OIDC_ENABLED,
            oidc_issuer_url=env.OIDC_ISSUER_URL,
            oidc_client_id=env.OIDC_CLIENT_ID,
            oidc_client_secret=env.OIDC_CLIENT_SECRET,
            oidc_scopes=env.OIDC_SCOPES,
            oidc_audience=oidc_audience,
            oidc_clock_skew_seconds=env.OIDC_CLOCK_SKEW_SECONDS,
            oidc_cookie_name=env.OIDC_COOKIE_NAME,
            oidc_cookie_secure=oidc_cookie_secure,
            oidc_cookie_samesite=env.OIDC_COOKIE_SAMESITE,
            oidc_refresh_cookie_name=env.OIDC_REFRESH_COOKIE_NAME,
            diagnostics_enabled=env.DIAGNOSTICS_ENABLED,
            diagnostics_slow_query_threshold_ms=env.DIAGNOSTICS_SLOW_QUERY_THRESHOLD_MS,
            diagnostics_slow_request_threshold_ms=env.DIAGNOSTICS_SLOW_REQUEST_THRESHOLD_MS,
            diagnostics_log_all_queries=env.DIAGNOSTICS_LOG_ALL_QUERIES,
            sqlalchemy_engine_options=sqlalchemy_engine_options,
        )


class FlaskConfig:
    """Flask-specific configuration for app.config.from_object().

    This is a simple DTO with the UPPER_CASE attributes Flask and Flask-SQLAlchemy expect.
    Create via Settings.to_flask_config().
    """

    def __init__(
        self,
        SECRET_KEY: str,
        SQLALCHEMY_DATABASE_URI: str,
        SQLALCHEMY_TRACK_MODIFICATIONS: bool,
        SQLALCHEMY_ENGINE_OPTIONS: dict[str, Any],
    ) -> None:
        self.SECRET_KEY = SECRET_KEY
        self.SQLALCHEMY_DATABASE_URI = SQLALCHEMY_DATABASE_URI
        self.SQLALCHEMY_TRACK_MODIFICATIONS = SQLALCHEMY_TRACK_MODIFICATIONS
        self.SQLALCHEMY_ENGINE_OPTIONS = SQLALCHEMY_ENGINE_OPTIONS

"""Configuration management using Pydantic settings."""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
    )

    # Flask settings
    SECRET_KEY: str = Field(default="dev-secret-key-change-in-production")
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

    # OpenAI settings
    OPENAI_API_KEY: str = Field(
        default="", description="OpenAI API key for AI features"
    )
    OPENAI_MODEL: str = Field(
        default="gpt-5-mini", description="OpenAI model to use for AI analysis"
    )
    OPENAI_REASONING_EFFORT: str = Field(
        default="medium", description="OpenAI reasoning effort level (low/medium/high)"
    )
    OPENAI_VERBOSITY: str = Field(
        default="medium", description="OpenAI response verbosity (low/medium/high)"
    )
    OPENAI_MAX_OUTPUT_TOKENS: int | None = Field(
        default=None, description="Maximum output tokens for OpenAI responses"
    )
    OPENAI_STORE_REQUESTS: bool = Field(
        default=False, description="Store OpenAI API requests/responses for debugging (defaults to True in testing)"
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

    @property
    def SQLALCHEMY_DATABASE_URI(self) -> str:
        """SQLAlchemy database URI."""
        return self.DATABASE_URL

    @property
    def SQLALCHEMY_TRACK_MODIFICATIONS(self) -> bool:
        """Disable SQLAlchemy track modifications."""
        return False

    @property
    def is_testing(self) -> bool:
        """Check if running in testing environment."""
        return self.FLASK_ENV == "testing"
    
    @staticmethod
    def _default_store_requests() -> bool:
        """Default value for OPENAI_STORE_REQUESTS - True in testing, False otherwise."""
        import os
        return os.getenv("FLASK_ENV") == "testing"


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()

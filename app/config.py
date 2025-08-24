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

    # S3 settings for Ceph
    S3_ENDPOINT_URL: str = Field(
        default="http://localhost:9000", description="Ceph RGW S3 endpoint"
    )
    AWS_ACCESS_KEY_ID: str = Field(default="minioadmin")
    AWS_SECRET_ACCESS_KEY: str = Field(default="minioadmin")
    S3_FORCE_PATH_STYLE: bool = Field(default=True)
    S3_BUCKET_DOCS: str = Field(default="inventory-docs")
    S3_BUCKET_IMAGES: str = Field(default="inventory-images")

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


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()

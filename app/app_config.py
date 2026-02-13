"""Application-specific configuration for Electronics Inventory.

This module implements app-specific configuration that is separate from the
infrastructure configuration in config.py. This separation supports Copier
template extraction: infrastructure config stays in Settings, while
domain-specific config (document processing, AI, Mouser) lives here.

The same two-layer pattern is used:
1. AppEnvironment: Loads raw values from environment variables (UPPER_CASE)
2. AppSettings: Clean application settings with lowercase fields and derived values
"""

from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Project root directory (parent of app/)
_PROJECT_ROOT = Path(__file__).resolve().parent.parent


class AppEnvironment(BaseSettings):
    """Raw environment variable loading for app-specific settings.

    This class loads values directly from environment variables with UPPER_CASE names.
    It should not contain any derived values or transformation logic.
    """

    model_config = SettingsConfigDict(
        env_file=_PROJECT_ROOT / ".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # Document processing
    MAX_IMAGE_SIZE: int = Field(
        default=10 * 1024 * 1024,  # 10MB
        description="Maximum image file size in bytes",
    )
    MAX_FILE_SIZE: int = Field(
        default=100 * 1024 * 1024,  # 100MB
        description="Maximum file size in bytes",
    )
    ALLOWED_IMAGE_TYPES: list[str] = Field(
        default=["image/jpeg", "image/png", "image/webp", "image/svg+xml"],
        description="Allowed image MIME types",
    )
    ALLOWED_FILE_TYPES: list[str] = Field(
        default=["application/pdf"],
        description="Allowed file MIME types (excluding images)",
    )
    THUMBNAIL_STORAGE_PATH: str = Field(
        default="/tmp/thumbnails",
        description="Path for disk-based thumbnail storage",
    )

    # Download cache
    DOWNLOAD_CACHE_BASE_PATH: str = Field(
        default="/tmp/download_cache",
        description="Base path for download cache storage",
    )
    DOWNLOAD_CACHE_CLEANUP_HOURS: int = Field(
        default=24,
        description="Hours after which cached downloads are cleaned up",
    )

    # AI provider
    AI_PROVIDER: str = Field(
        default="openai",
        description="AI provider to use ('openai')",
    )
    OPENAI_API_KEY: str = Field(
        default="",
        description="OpenAI API key for AI features",
    )
    OPENAI_MODEL: str = Field(
        default="gpt-5-mini",
        description="OpenAI model to use for AI analysis",
    )
    OPENAI_REASONING_EFFORT: str = Field(
        default="low",
        description="OpenAI reasoning effort level (low/medium/high)",
    )
    OPENAI_VERBOSITY: str = Field(
        default="medium",
        description="OpenAI response verbosity (low/medium/high)",
    )
    OPENAI_MAX_OUTPUT_TOKENS: int | None = Field(
        default=None,
        description="Maximum output tokens for OpenAI responses",
    )
    AI_ANALYSIS_CACHE_PATH: str | None = Field(
        default=None,
        description="Path to a JSON file for caching AI analysis responses. "
        "If the file exists, its contents are returned instead of calling the AI. "
        "If the file doesn't exist, the AI response is saved there for future replay.",
    )
    AI_CLEANUP_CACHE_PATH: str | None = Field(
        default=None,
        description="Path to a JSON file for caching AI cleanup responses. "
        "If the file exists, its contents are returned instead of calling the AI. "
        "If the file doesn't exist, the AI response is saved there for future replay.",
    )
    AI_TESTING_MODE: bool = Field(
        default=False,
        description="When true, AI endpoints return dummy task IDs for testing without calling real AI",
    )

    # Mouser API
    MOUSER_SEARCH_API_KEY: str = Field(
        default="",
        description="Mouser Search API key for part search integration",
    )


class AppSettings(BaseModel):
    """Application-specific settings for Electronics Inventory.

    This class represents the final, resolved app-specific configuration.
    All field names are lowercase for consistency.

    For production, use AppSettings.load() to load from environment.
    For tests, construct directly with test values (defaults provided for convenience).
    """

    model_config = ConfigDict(from_attributes=True)

    # Document processing
    max_image_size: int = Field(
        default=10 * 1024 * 1024,
        description="Maximum image file size in bytes",
    )
    max_file_size: int = Field(
        default=100 * 1024 * 1024,
        description="Maximum file size in bytes",
    )
    allowed_image_types: list[str] = Field(
        default=["image/jpeg", "image/png", "image/webp", "image/svg+xml"],
        description="Allowed image MIME types",
    )
    allowed_file_types: list[str] = Field(
        default=["application/pdf"],
        description="Allowed file MIME types (excluding images)",
    )
    thumbnail_storage_path: str = Field(
        default="/tmp/thumbnails",
        description="Path for disk-based thumbnail storage",
    )

    # Download cache
    download_cache_base_path: str = Field(
        default="/tmp/download_cache",
        description="Base path for download cache storage",
    )
    download_cache_cleanup_hours: int = Field(
        default=24,
        description="Hours after which cached downloads are cleaned up",
    )

    # AI provider
    ai_provider: str = Field(
        default="openai",
        description="AI provider to use ('openai')",
    )
    openai_api_key: str = Field(
        default="",
        description="OpenAI API key for AI features",
    )
    openai_model: str = Field(
        default="gpt-5-mini",
        description="OpenAI model to use for AI analysis",
    )
    openai_reasoning_effort: str = Field(
        default="low",
        description="OpenAI reasoning effort level (low/medium/high)",
    )
    openai_verbosity: str = Field(
        default="medium",
        description="OpenAI response verbosity (low/medium/high)",
    )
    openai_max_output_tokens: int | None = Field(
        default=None,
        description="Maximum output tokens for OpenAI responses",
    )
    ai_analysis_cache_path: str | None = Field(
        default=None,
        description="Path to a JSON file for caching AI analysis responses",
    )
    ai_cleanup_cache_path: str | None = Field(
        default=None,
        description="Path to a JSON file for caching AI cleanup responses",
    )
    ai_testing_mode: bool = Field(
        default=False,
        description="When true, AI endpoints return dummy task IDs for testing without calling real AI",
    )

    # Mouser API
    mouser_search_api_key: str = Field(
        default="",
        description="Mouser Search API key for part search integration",
    )

    @property
    def real_ai_allowed(self) -> bool:
        """Determine whether real AI analysis is permitted."""
        return not self.ai_testing_mode

    @classmethod
    def load(cls, env: "AppEnvironment | None" = None, flask_env: str = "development") -> "AppSettings":
        """Load app settings from environment variables.

        Args:
            env: Optional AppEnvironment instance (for testing). If None, loads from environment.
            flask_env: Flask environment string, used to derive ai_testing_mode.

        Returns:
            AppSettings instance with all values resolved
        """
        if env is None:
            env = AppEnvironment()

        # Compute ai_testing_mode: force True if testing, else use env value
        ai_testing_mode = True if flask_env == "testing" else env.AI_TESTING_MODE

        return cls(
            max_image_size=env.MAX_IMAGE_SIZE,
            max_file_size=env.MAX_FILE_SIZE,
            allowed_image_types=env.ALLOWED_IMAGE_TYPES,
            allowed_file_types=env.ALLOWED_FILE_TYPES,
            thumbnail_storage_path=env.THUMBNAIL_STORAGE_PATH,
            download_cache_base_path=env.DOWNLOAD_CACHE_BASE_PATH,
            download_cache_cleanup_hours=env.DOWNLOAD_CACHE_CLEANUP_HOURS,
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
        )

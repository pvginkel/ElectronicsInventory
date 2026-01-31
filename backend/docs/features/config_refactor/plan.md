# Configuration System Refactor - Technical Plan

## 0) Research Log & Findings

### Areas Researched

**Current Configuration System (`app/config.py`)**
- The `Settings` class inherits from `pydantic_settings.BaseSettings` and loads directly from environment variables
- Uses UPPER_CASE field names matching environment variables throughout
- Contains mixed concerns: environment loading, property derivation (`SQLALCHEMY_DATABASE_URI`, `SQLALCHEMY_ENGINE_OPTIONS`), validation
- Has mutable override mechanism (`set_engine_options_override`) for tests
- Uses `@lru_cache` on `get_settings()` for singleton behavior
- Contains a `@model_validator` for environment-specific defaults (SSE_HEARTBEAT_INTERVAL, AI_TESTING_MODE)
- No Fernet key derivation (not present in this codebase, unlike IoTSupport reference)

**Configuration Usage Patterns**
- Services receive `Settings` via dependency injection through `ServiceContainer`
- Container wires `config.provided.FIELD_NAME` for specific fields (e.g., `TASK_MAX_WORKERS`, `GRACEFUL_SHUTDOWN_TIMEOUT`)
- API modules access config via `Provide[ServiceContainer.config]`
- All field access uses UPPER_CASE names throughout the codebase

**Test Fixtures**
- Tests in `tests/conftest.py` construct `Settings` directly with explicit field values
- Use `set_engine_options_override()` for SQLite pool configuration
- Model copying with `settings.model_copy()` followed by direct attribute mutation for per-test isolation
- Template connection pattern: `settings.DATABASE_URL = "sqlite://"` after model_copy()

**get_settings() Usage**
- Used in `run.py`, `app/__init__.py`, and `app/database.py` for application bootstrap
- The DI container receives the settings instance from `get_settings()` and provides singleton behavior
- `@lru_cache` ensures single instance per process

**Environment-Specific Defaults**
- SSE_HEARTBEAT_INTERVAL: 5 for development, 30 for production
- AI_TESTING_MODE: True when FLASK_ENV=testing
- Applied via `@model_validator(mode="after")` in current Settings class

### Key Findings

1. **Field naming transition**: All existing code uses UPPER_CASE field names. The refactor to lowercase will require updating ~30+ usage sites across service container, API modules, and service layer.

2. **Test isolation pattern**: Tests use `model_copy()` to create independent settings instances. Current tests mutate `DATABASE_URL` after copying, which conflicts with frozen models. Solution: use `model_copy(update={"database_url": "..."})` pattern instead of direct attribute assignment.

3. **Engine options override**: Only used in tests for SQLite static pool configuration. Can be replaced by making `sqlalchemy_engine_options` a regular field.

4. **get_settings() usage**: Used in three bootstrap files. The DI container already provides singleton behavior, so `@lru_cache` is redundant after the settings instance is passed to the container.

5. **No Fernet key derivation**: Unlike the IoTSupport reference, this codebase has no device provisioning or secret encryption requirements, so no Fernet key derivation logic is needed.

6. **FlaskConfig pattern**: The reference implementation shows `Settings.to_flask_config()` creates a `FlaskConfig` class for Flask's `app.config.from_object()` pattern, replacing the current property-based approach.

---

## 1) Intent & Scope

**User intent**

Refactor the configuration system to cleanly separate environment variable loading from application settings, following the established pattern from the IoTSupport project. This creates a clear boundary between raw environment input (UPPER_CASE) and resolved application configuration (lowercase), eliminates the mutable override mechanism for tests, and removes the redundant `@lru_cache` pattern.

**Prompt quotes**

- "Create Environment class (pydantic-settings BaseSettings) for raw environment variable loading with UPPER_CASE fields"
- "Refactor Settings class to be a clean Pydantic BaseModel with lowercase fields and no env loading"
- "Implement Settings.load() classmethod that loads Environment, transforms values (apply environment-specific defaults, build engine options), and returns Settings"
- "Create FlaskConfig class for Flask-specific configuration (UPPER_CASE attributes for app.config.from_object())"
- "Make sqlalchemy_engine_options a regular field on Settings (not a property)"
- "Remove set_engine_options_override mechanism - tests construct Settings directly"
- "Remove get_settings() function with @lru_cache - rely on DI container singleton"
- "Update all usages of config throughout the codebase to use new lowercase field names"

**In scope**

- Create new `Environment` class for raw env var loading with UPPER_CASE fields
- Refactor `Settings` to Pydantic `BaseModel` with lowercase fields
- Implement `Settings.load()` transformation classmethod
- Centralize environment-specific defaults (SSE_HEARTBEAT_INTERVAL, AI_TESTING_MODE) in `Settings.load()`
- Make `sqlalchemy_engine_options` a regular field
- Create `FlaskConfig` class and `Settings.to_flask_config()` method
- Remove `set_engine_options_override()` mechanism
- Remove `get_settings()` function
- Update all config field access to lowercase names in service container and services
- Update test fixtures to construct Settings directly using `model_copy(update={...})` pattern

**Out of scope**

- Changes to environment variable names (they remain UPPER_CASE in the environment)
- Changes to the DI container architecture beyond field name updates
- Changes to production validation logic (stays as-is, no validation in this codebase)
- Database migrations
- API contract changes
- Fernet key derivation (not needed in this codebase)

**Assumptions / constraints**

- All configuration access goes through DI container or explicit `Settings.load()` call
- Tests can construct `Settings` directly, bypassing `Settings.load()`
- No backwards compatibility needed (BFF pattern per CLAUDE.md)
- Settings should be immutable-by-convention but NOT frozen (`frozen=True`) to support test fixture patterns
- Environment-specific defaults are applied during Settings.load() transformation

---

## 1a) User Requirements Checklist

**User Requirements Checklist**

- [ ] Create Environment class (pydantic-settings BaseSettings) for raw environment variable loading with UPPER_CASE fields
- [ ] Refactor Settings class to be a clean Pydantic BaseModel with lowercase fields and no env loading
- [ ] Implement Settings.load() classmethod that loads Environment, transforms values (apply environment-specific defaults, build engine options), and returns Settings
- [ ] Create FlaskConfig class for Flask-specific configuration (UPPER_CASE attributes for app.config.from_object())
- [ ] Add Settings.to_flask_config() method that creates FlaskConfig
- [ ] Make sqlalchemy_engine_options a regular field on Settings (not a property)
- [ ] Remove set_engine_options_override mechanism - tests construct Settings directly
- [ ] Remove get_settings() function with @lru_cache - rely on DI container singleton
- [ ] Update all usages of config throughout the codebase to use new lowercase field names
- [ ] Update test fixtures to construct Settings directly with test values using model_copy(update={...}) pattern

---

## 2) Affected Areas & File Map

### Core Configuration

- Area: `app/config.py`
- Why: Complete rewrite - split into Environment and Settings classes, add load() classmethod, add FlaskConfig, remove get_settings()
- Evidence: `app/config.py:18-312` — entire Settings class and get_settings function

### Application Factory

- Area: `app/__init__.py`
- Why: Update get_settings() call to Settings.load(), update flask config initialization
- Evidence: `app/__init__.py:13,24` — `from app.config import get_settings` and `settings = get_settings()`

### Entry Point

- Area: `run.py`
- Why: Update get_settings() call to Settings.load(), update FLASK_ENV access to lowercase
- Evidence: `run.py:11,21` — `from app.config import get_settings`, `settings = get_settings()`

### Database Module

- Area: `app/database.py`
- Why: Update get_settings() call to Settings.load(), update DATABASE_URL access to lowercase
- Evidence: `app/database.py:17,60` — `from app.config import get_settings`, `settings = get_settings()`

### Service Container

- Area: `app/services/container.py`
- Why: Update config.provided field references to lowercase (28 field references across providers)
- Evidence: `app/services/container.py:64,128,134,135,141,165` — Examples: `config.provided.real_ai_allowed`, `config.provided.GRACEFUL_SHUTDOWN_TIMEOUT`, `config.provided.DOWNLOAD_CACHE_BASE_PATH`, `config.provided.DOWNLOAD_CACHE_CLEANUP_HOURS`, `config.provided.MAX_FILE_SIZE`, `config.provided.SSE_GATEWAY_URL`
- Before/After example:
```python
# Before
shutdown_coordinator = providers.Singleton(
    ShutdownCoordinator,
    graceful_shutdown_timeout=config.provided.GRACEFUL_SHUTDOWN_TIMEOUT,
)
temp_file_manager = providers.Singleton(
    TempFileManager,
    base_path=config.provided.DOWNLOAD_CACHE_BASE_PATH,
    cleanup_age_hours=config.provided.DOWNLOAD_CACHE_CLEANUP_HOURS,
    shutdown_coordinator=shutdown_coordinator
)

# After
shutdown_coordinator = providers.Singleton(
    ShutdownCoordinator,
    graceful_shutdown_timeout=config.provided.graceful_shutdown_timeout,
)
temp_file_manager = providers.Singleton(
    TempFileManager,
    base_path=config.provided.download_cache_base_path,
    cleanup_age_hours=config.provided.download_cache_cleanup_hours,
    shutdown_coordinator=shutdown_coordinator
)
```

### Services Using Settings

- Area: `app/services/ai_service.py`
- Why: Update field access to lowercase (AI_PROVIDER, OPENAI_*, AI_ANALYSIS_CACHE_PATH, AI_CLEANUP_CACHE_PATH)
- Evidence: File uses Settings type and accesses config fields

- Area: `app/services/datasheet_extraction_service.py`
- Why: Update field access to lowercase
- Evidence: File imports Settings and uses config

- Area: `app/services/duplicate_search_service.py`
- Why: Update field access to lowercase
- Evidence: File imports Settings and uses config

- Area: `app/services/mouser_service.py`
- Why: Update field access to lowercase (MOUSER_SEARCH_API_KEY)
- Evidence: File imports Settings and uses config

- Area: `app/services/s3_service.py`
- Why: Update field access to lowercase (S3_* fields)
- Evidence: File imports Settings and uses s3 config

- Area: `app/services/image_service.py`
- Why: Update field access to lowercase (MAX_IMAGE_SIZE, ALLOWED_IMAGE_TYPES, THUMBNAIL_STORAGE_PATH)
- Evidence: File imports Settings and uses image config

- Area: `app/services/document_service.py`
- Why: Update field access to lowercase (ALLOWED_FILE_TYPES, MAX_FILE_SIZE)
- Evidence: File imports Settings and uses document config

- Area: `app/services/attachment_set_service.py`
- Why: Update field access to lowercase
- Evidence: File imports Settings and uses config

- Area: `app/services/html_document_handler.py`
- Why: Update field access to lowercase
- Evidence: File imports Settings and uses config

- Area: `app/services/version_service.py`
- Why: Update field access to lowercase (FRONTEND_VERSION_URL, SSE_HEARTBEAT_INTERVAL)
- Evidence: File imports Settings and uses version/SSE config

- Area: `app/services/diagnostics_service.py`
- Why: Update field access to lowercase (DIAGNOSTICS_* fields)
- Evidence: File imports Settings and uses diagnostics config

### API Modules

- Area: `app/api/ai_parts.py`
- Why: Update field access to lowercase
- Evidence: `app/api/ai_parts.py:12` — imports Settings

- Area: `app/api/health.py`
- Why: Update field access to lowercase
- Evidence: `app/api/health.py:10` — imports Settings

- Area: `app/api/sse.py`
- Why: Update field access to lowercase (SSE_CALLBACK_SECRET)
- Evidence: `app/api/sse.py:10` — imports Settings

### Test Fixtures

- Area: `tests/conftest.py`
- Why: Update to construct Settings directly without set_engine_options_override, use lowercase fields, use model_copy(update={...}) pattern
- Evidence: `tests/conftest.py:49-99` — _build_test_settings, template_connection fixture

- Area: `tests/test_config.py`
- Why: Update tests for new Settings.load() and Environment classes, update field names to lowercase
- Evidence: `tests/test_config.py:4,38-62` — Settings import and get_settings() tests

- Area: `tests/api/test_testing.py`
- Why: Update Settings construction to use lowercase fields
- Evidence: `tests/api/test_testing.py:19` — Settings import

- Area: `tests/test_*.py` (all service test files)
- Why: Update Settings construction to use lowercase fields
- Evidence: Multiple test files import Settings and construct test instances

---

## 3) Data Model / Contracts

### Environment Class (new)

- Entity / contract: `Environment` (pydantic-settings BaseSettings)
- Shape:
```python
class Environment(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # All UPPER_CASE fields matching env vars
    SECRET_KEY: str = "dev-secret-key-change-in-production"
    FLASK_ENV: str = "development"
    DEBUG: bool = True
    DATABASE_URL: str = "postgresql+psycopg://postgres:postgres@localhost:5432/electronics_inventory"
    CORS_ORIGINS: list[str] = ["http://localhost:3000"]

    # S3 configuration
    S3_ENDPOINT_URL: str = "http://localhost:9000"
    S3_ACCESS_KEY_ID: str = "admin"
    S3_SECRET_ACCESS_KEY: str = "password"
    S3_BUCKET_NAME: str = "electronics-inventory-part-attachments"
    S3_REGION: str = "us-east-1"
    S3_USE_SSL: bool = False

    # Document processing
    MAX_IMAGE_SIZE: int = 10 * 1024 * 1024
    MAX_FILE_SIZE: int = 100 * 1024 * 1024
    ALLOWED_IMAGE_TYPES: list[str] = ["image/jpeg", "image/png", "image/webp", "image/svg+xml"]
    ALLOWED_FILE_TYPES: list[str] = ["application/pdf"]
    THUMBNAIL_STORAGE_PATH: str = "/tmp/thumbnails"

    # Download cache
    DOWNLOAD_CACHE_BASE_PATH: str = "/tmp/download_cache"
    DOWNLOAD_CACHE_CLEANUP_HOURS: int = 24

    # Celery
    CELERY_BROKER_URL: str = "pyamqp://guest@localhost//"
    CELERY_RESULT_BACKEND: str = "db+postgresql+psycopg://postgres:@localhost:5432/electronics_inventory"

    # AI provider
    AI_PROVIDER: str = "openai"
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-5-mini"
    OPENAI_REASONING_EFFORT: str = "low"
    OPENAI_VERBOSITY: str = "medium"
    OPENAI_MAX_OUTPUT_TOKENS: int | None = None
    AI_ANALYSIS_CACHE_PATH: str | None = None
    AI_CLEANUP_CACHE_PATH: str | None = None
    AI_TESTING_MODE: bool = False

    # Mouser API
    MOUSER_SEARCH_API_KEY: str = ""

    # Task management
    TASK_MAX_WORKERS: int = 4
    TASK_TIMEOUT_SECONDS: int = 300
    TASK_CLEANUP_INTERVAL_SECONDS: int = 600

    # Metrics
    METRICS_UPDATE_INTERVAL: int = 60

    # Graceful shutdown
    GRACEFUL_SHUTDOWN_TIMEOUT: int = 600
    DRAIN_AUTH_KEY: str = ""

    # SSE version notification
    FRONTEND_VERSION_URL: str = "http://localhost:3000/version.json"
    SSE_HEARTBEAT_INTERVAL: int = 5

    # SSE Gateway
    SSE_GATEWAY_URL: str = "http://localhost:3001"
    SSE_CALLBACK_SECRET: str = ""

    # Database pool
    DB_POOL_SIZE: int = 20
    DB_POOL_MAX_OVERFLOW: int = 30
    DB_POOL_TIMEOUT: int = 10
    DB_POOL_ECHO: bool | str = False

    # Diagnostics
    DIAGNOSTICS_ENABLED: bool = False
    DIAGNOSTICS_SLOW_QUERY_THRESHOLD_MS: int = 100
    DIAGNOSTICS_SLOW_REQUEST_THRESHOLD_MS: int = 500
    DIAGNOSTICS_LOG_ALL_QUERIES: bool = False
```
- Refactor strategy: New class, no backward compatibility needed
- Evidence: `app/config.py:18-262` — current Settings class field definitions

### Settings Class (refactored)

- Entity / contract: `Settings` (Pydantic BaseModel, NOT frozen)
- Shape:
```python
class Settings(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    # Note: Not frozen=True because tests need model_copy(update={...}) to work

    # All lowercase fields with resolved values
    secret_key: str
    flask_env: str
    debug: bool
    database_url: str
    cors_origins: list[str]

    # S3 configuration (lowercase)
    s3_endpoint_url: str
    s3_access_key_id: str
    s3_secret_access_key: str
    s3_bucket_name: str
    s3_region: str
    s3_use_ssl: bool

    # Document processing (lowercase)
    max_image_size: int
    max_file_size: int
    allowed_image_types: list[str]
    allowed_file_types: list[str]
    thumbnail_storage_path: str

    # Download cache (lowercase)
    download_cache_base_path: str
    download_cache_cleanup_hours: int

    # Celery (lowercase)
    celery_broker_url: str
    celery_result_backend: str

    # AI provider (lowercase)
    ai_provider: str
    openai_api_key: str
    openai_model: str
    openai_reasoning_effort: str
    openai_verbosity: str
    openai_max_output_tokens: int | None
    ai_analysis_cache_path: str | None
    ai_cleanup_cache_path: str | None
    ai_testing_mode: bool  # Resolved: True if flask_env == "testing"

    # Mouser API (lowercase)
    mouser_search_api_key: str

    # Task management (lowercase)
    task_max_workers: int
    task_timeout_seconds: int
    task_cleanup_interval_seconds: int

    # Metrics (lowercase)
    metrics_update_interval: int

    # Graceful shutdown (lowercase)
    graceful_shutdown_timeout: int
    drain_auth_key: str

    # SSE version notification (lowercase, resolved heartbeat)
    frontend_version_url: str
    sse_heartbeat_interval: int  # Resolved: 30 for production, 5 otherwise

    # SSE Gateway (lowercase)
    sse_gateway_url: str
    sse_callback_secret: str

    # Database pool (lowercase)
    db_pool_size: int
    db_pool_max_overflow: int
    db_pool_timeout: int
    db_pool_echo: bool | str

    # Diagnostics (lowercase)
    diagnostics_enabled: bool
    diagnostics_slow_query_threshold_ms: int
    diagnostics_slow_request_threshold_ms: int
    diagnostics_log_all_queries: bool

    # SQLAlchemy engine options (regular field, not property)
    sqlalchemy_engine_options: dict[str, Any] = Field(default_factory=dict)

    @property
    def is_testing(self) -> bool:
        """Check if running in testing environment."""
        return self.flask_env == "testing"

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

    @classmethod
    def load(cls) -> "Settings":
        """Load from environment, transform, validate, return instance."""
        # Implementation in section 5
```
- Refactor strategy: Complete refactor of existing class, no backward compatibility needed
- Evidence: `app/config.py:18-293` — current Settings class

### FlaskConfig Class (new)

- Entity / contract: `FlaskConfig` (simple DTO for Flask config)
- Shape:
```python
class FlaskConfig:
    """Flask-specific configuration for app.config.from_object().

    This is a simple DTO with UPPER_CASE attributes Flask expects.
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
```
- Refactor strategy: New class replacing property-based Flask config
- Evidence: IoTSupport reference `app/config.py:492-510` — FlaskConfig implementation

---

## 4) API / Integration Surface

No external API changes. This is an internal refactoring.

The only integration change is how the application bootstraps:

- Surface: Application startup (`app/__init__.py`, `run.py`, `app/database.py`)
- Inputs: Environment variables
- Outputs: Configured `Settings` instance passed to DI container
- Errors: No validation errors in this codebase (no production validation logic)
- Evidence: `app/__init__.py:24` — settings = get_settings()

---

## 5) Algorithms & State Machines

### Settings.load() Transformation Flow

- Flow: Environment to Settings transformation
- Steps:
  1. Load `Environment` from environment variables (pydantic-settings handles .env file)
  2. Compute `sse_heartbeat_interval`: use 30 if `FLASK_ENV == "production"`, else use `SSE_HEARTBEAT_INTERVAL` value
  3. Compute `ai_testing_mode`: force True if `FLASK_ENV == "testing"`, else use `AI_TESTING_MODE` value
  4. Build default `sqlalchemy_engine_options` dict from database pool settings
  5. Construct Settings instance with all lowercase field names mapped from Environment UPPER_CASE fields
  6. Return Settings instance
- States / transitions: None (single-pass transformation)
- Hotspots: No performance concerns; all transformations are simple conditionals and dict construction
- Evidence: `app/config.py:208-215` — current @model_validator for environment-specific defaults

---

## 6) Derived State & Invariants

- Derived value: `sse_heartbeat_interval`
  - Source: `SSE_HEARTBEAT_INTERVAL` env var (default 5) + `FLASK_ENV` env var
  - Writes / cleanup: None (read-only after construction)
  - Guards: Always has a value (default or environment-derived)
  - Invariant: `sse_heartbeat_interval` is 30 for production, 5 for development/testing
  - Evidence: `app/config.py:193-196,210-212` — field definition and model_validator

- Derived value: `ai_testing_mode`
  - Source: `AI_TESTING_MODE` env var (default False) + `FLASK_ENV` env var
  - Writes / cleanup: None (read-only after construction)
  - Guards: Always has a value (default or environment-derived)
  - Invariant: `ai_testing_mode` is always True when `FLASK_ENV == "testing"`
  - Evidence: `app/config.py:148-151,213-214` — field definition and model_validator

- Derived value: `sqlalchemy_engine_options`
  - Source: Database pool settings (DB_POOL_SIZE, DB_POOL_MAX_OVERFLOW, DB_POOL_TIMEOUT, DB_POOL_ECHO)
  - Writes / cleanup: None (read-only after construction)
  - Guards: Always constructed during Settings.load() with sensible defaults
  - Invariant: `sqlalchemy_engine_options` is a dict with pool configuration keys
  - Evidence: `app/config.py:267-278` — current property implementation

---

## 7) Consistency, Transactions & Concurrency

- Transaction scope: Not applicable - Settings is immutable-by-convention after construction
- Atomic requirements: Settings.load() must complete atomically or fail entirely (no partial state)
- Retry / idempotency: Settings.load() is idempotent given same environment
- Ordering / concurrency controls: Settings is safe for concurrent read access; production code should treat it as immutable
- Evidence: `app/config.py:18` — BaseSettings inheritance implies construction-time validation

---

## 8) Errors & Edge Cases

- Failure: Invalid environment variable types (e.g., non-integer for TASK_MAX_WORKERS)
- Surface: `Settings.load()` during application startup
- Handling: Pydantic raises ValidationError with details; application fails to start
- Guardrails: Pydantic type validation enforces correctness
- Evidence: Pydantic BaseSettings validates types automatically

- Failure: Missing .env file
- Surface: `Environment` loading during Settings.load()
- Handling: Uses default values; no error (pydantic-settings behavior)
- Guardrails: All fields have defaults
- Evidence: `app/config.py:21-25` — env_file in SettingsConfigDict

- Failure: Test constructs Settings with invalid field types
- Surface: Direct Settings construction in tests
- Handling: Pydantic raises ValidationError
- Guardrails: Type validation ensures test data correctness
- Evidence: Pydantic BaseModel validates constructor arguments

---

## 9) Observability / Telemetry

No new metrics or telemetry for this refactoring. The configuration loading happens at startup before metrics are initialized.

Existing startup behavior will continue to work without changes.

---

## 10) Background Work & Shutdown

No background workers affected by this change. Settings is loaded once at startup and used throughout the application lifecycle.

---

## 11) Security & Permissions

- Concern: Sensitive configuration values (secrets, passwords)
- Touchpoints: `Settings.load()` transformation, `Environment` loading
- Mitigation: Settings is immutable-by-convention; secrets remain in memory only; production code should never mutate settings
- Residual risk: Configuration values visible in memory dumps (acceptable, same as current state)
- Evidence: `app/config.py:29,49-56,119,154` — SECRET_KEY, S3 credentials, OPENAI_API_KEY, MOUSER_SEARCH_API_KEY

---

## 12) UX / UI Impact

Not applicable - this is a backend-only refactoring with no user-facing changes.

---

## 13) Deterministic Test Plan

### Settings.load() Unit Tests

- Surface: `Settings.load()` classmethod
- Test file: `tests/test_config.py` (update existing file)
- Scenarios:
  - Given environment with all default values, When Settings.load() called, Then returns Settings with correct lowercase fields (`tests/test_config.py::test_load_default_values`)
  - Given FLASK_ENV=production, When Settings.load() called, Then sse_heartbeat_interval equals 30 (`tests/test_config.py::test_heartbeat_production`)
  - Given FLASK_ENV=development, When Settings.load() called, Then sse_heartbeat_interval equals 5 (`tests/test_config.py::test_heartbeat_development`)
  - Given FLASK_ENV=testing, When Settings.load() called, Then ai_testing_mode is True (`tests/test_config.py::test_ai_testing_mode_auto`)
  - Given FLASK_ENV=development and AI_TESTING_MODE=True, When Settings.load() called, Then ai_testing_mode is True (`tests/test_config.py::test_ai_testing_mode_explicit`)
  - Given database pool settings, When Settings.load() called, Then sqlalchemy_engine_options contains pool configuration (`tests/test_config.py::test_engine_options_from_pool_settings`)
- Fixtures / hooks: Environment variable mocking via `monkeypatch.setenv()`, temporary .env files via `tmp_path`
- Gaps: None
- Evidence: `tests/conftest.py:49-65` — existing test settings construction patterns

### Environment Class Unit Tests

- Surface: `Environment` class (pydantic-settings)
- Test file: `tests/test_config.py`
- Scenarios:
  - Given .env file present, When Environment constructed, Then loads values from file (`tests/test_config.py::test_environment_loads_env_file`)
  - Given env vars set, When Environment constructed, Then env vars override .env file (`tests/test_config.py::test_environment_env_var_priority`)
  - Given extra env vars present, When Environment constructed, Then ignores extras (`tests/test_config.py::test_environment_ignores_extra`)
- Fixtures / hooks: `tmp_path` for .env file, `monkeypatch.setenv()` for env vars
- Gaps: None
- Evidence: `app/config.py:21-26` — current SettingsConfigDict

### Direct Settings Construction Tests

- Surface: `Settings` constructor (for test usage)
- Test file: `tests/test_config.py`
- Scenarios:
  - Given all required fields provided, When Settings constructed directly, Then instance is created with provided values (`tests/test_config.py::test_settings_direct_construction`)
  - Given sqlalchemy_engine_options provided, When Settings constructed, Then options are used directly (`tests/test_config.py::test_settings_engine_options`)
  - Given Settings instance, When model_copy with update called, Then new instance has updated values (`tests/test_config.py::test_settings_model_copy_update`)
- Fixtures / hooks: None needed
- Gaps: None
- Evidence: `tests/conftest.py:49-65` — existing direct construction pattern

### FlaskConfig Tests

- Surface: `Settings.to_flask_config()` method
- Test file: `tests/test_config.py`
- Scenarios:
  - Given Settings instance, When to_flask_config() called, Then FlaskConfig has UPPER_CASE attributes (`tests/test_config.py::test_to_flask_config`)
  - Given FlaskConfig instance, When used with Flask app.config.from_object(), Then Flask receives correct config (`tests/test_config.py::test_flask_config_integration`)
- Fixtures / hooks: None needed
- Gaps: None
- Evidence: IoTSupport reference shows FlaskConfig pattern

### Test Fixture Migration Pattern

The test fixtures in `tests/conftest.py` must be updated to use `model_copy(update={...})` instead of direct attribute assignment:

```python
# Before (direct attribute assignment after model_copy)
settings = _build_test_settings().model_copy()
settings.DATABASE_URL = "sqlite://"
settings.set_engine_options_override({
    "poolclass": StaticPool,
    "creator": lambda: conn,
})

# After (model_copy with update dict)
base_settings = _build_test_settings()
settings = base_settings.model_copy(update={
    "database_url": "sqlite://",
    "sqlalchemy_engine_options": {
        "poolclass": StaticPool,
        "creator": lambda: conn,
    },
})
```

Note: `model_copy(update={...})` returns a new instance with updated values. The model is not frozen to allow this pattern.

### Service and API Integration Tests

- Surface: Services and API endpoints using Settings
- Scenarios:
  - Given services with Settings, When accessing config fields, Then lowercase field names work correctly
  - Given AI service with Settings, When checking real_ai_allowed, Then property works correctly
- Fixtures / hooks: Existing service and API test fixtures
- Gaps: None - existing tests will validate after field name updates
- Evidence: Extensive test coverage throughout `tests/services/` and `tests/api/`

---

## 14) Implementation Slices

### Slice 1: Create Environment and Settings classes

- Goal: New configuration architecture without breaking existing code
- Touches: `app/config.py`
- Dependencies: None; can add new classes alongside existing code initially

### Slice 2: Implement Settings.load() with transformations

- Goal: Central transformation logic including environment-specific defaults
- Touches: `app/config.py` (Settings.load method)
- Dependencies: Slice 1

### Slice 3: Add FlaskConfig class and to_flask_config() method

- Goal: Flask configuration DTO
- Touches: `app/config.py`
- Dependencies: Slice 2

### Slice 4: Update application bootstrap

- Goal: Application uses new Settings.load() instead of get_settings()
- Touches: `app/__init__.py`, `run.py`, `app/database.py`
- Dependencies: Slices 2-3

### Slice 5: Update service container to lowercase fields

- Goal: DI container uses lowercase field names for all provider wiring
- Touches: `app/services/container.py`
- Dependencies: Slice 2

### Slice 6: Update service layer to lowercase fields

- Goal: All services use lowercase field names
- Touches: All service files that import or use Settings
- Dependencies: Slice 2

### Slice 7: Update API layer to lowercase fields

- Goal: All API modules use lowercase field names
- Touches: `app/api/ai_parts.py`, `app/api/health.py`, `app/api/sse.py`
- Dependencies: Slice 2

### Slice 8: Update test fixtures

- Goal: Tests construct Settings directly using model_copy(update={...}) pattern
- Touches: `tests/conftest.py`, all test files importing Settings
- Dependencies: Slices 2-7

### Slice 9: Remove deprecated code

- Goal: Remove get_settings(), set_engine_options_override(), old properties, model_validator
- Touches: `app/config.py`
- Dependencies: Slice 8

---

## 15) Risks & Open Questions

### Risks

- Risk: Large number of files to update may introduce typos or missed references
- Impact: Test failures or runtime errors
- Mitigation: Use grep/search to find all UPPER_CASE field references; run full test suite after each slice

- Risk: Tests may have hidden dependencies on current Settings behavior
- Impact: Test failures requiring additional fixes
- Mitigation: Run tests incrementally during implementation; address failures as they arise

- Risk: Settings.load() called multiple times could mask environment changes
- Impact: Unexpected behavior if environment changes after first load
- Mitigation: Document that Settings.load() reads environment once; DI container holds singleton

### Open Questions

None - requirements are clear and implementation path is well-defined based on the IoTSupport reference implementation.

---

## 16) Confidence

Confidence: High - The refactoring is well-scoped, follows an established pattern from the IoTSupport project, and all code paths are testable. The change brief provides clear requirements, and the codebase has good test coverage to catch regressions. The reference implementation provides a proven pattern to follow.

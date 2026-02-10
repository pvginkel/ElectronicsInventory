# Copier Template Extraction — Refactoring Analysis

This document identifies refactorings needed to cleanly extract a Copier template from the Electronics Inventory backend. Each refactoring is self-contained, ordered by priority, and designed to be implemented independently.

---

## Classification Legend

Throughout this document, components are classified as:

- **TEMPLATE** — Generic infrastructure; belongs in the Copier template
- **APP-SPECIFIC** — Domain logic; stays in the generated app
- **NEEDS-REFACTORING** — Currently mixed; must be separated before template extraction

---

## R1: Use Flask's Error Handler Registry

**Priority:** High — Foundational change that other refactorings build on

### Current State

Two parallel systems handle exceptions:

1. `app/utils/error_handling.py` — `@handle_api_errors` decorator applied to every endpoint. Contains a monolithic ~160-line `try/except` chain that catches all 11 exception types, marks the session for rollback, logs with stack trace, and returns a rich response envelope (with `correlationId` and `code`).

2. `app/utils/flask_error_handlers.py` — Flask-native `@app.errorhandler()` registrations for `ValidationError`, `IntegrityError`, 404, 405, 500.

These substantially duplicate each other. The `IntegrityError` string-matching logic is copy-pasted between them. The decorator exists because the Flask handlers weren't given the full responsibility — but Flask's `@app.errorhandler` **is already a registry pattern**. Each exception type can have a handler registered independently, and Flask dispatches to the right one automatically.

### Proposed Change

**Remove `@handle_api_errors` entirely.** Let exceptions propagate naturally to Flask's error handler registry. Expand `flask_error_handlers.py` (or split into per-feature registration functions) to handle all exception types.

#### Step 1: Move all exception handling to Flask error handlers

`register_error_handlers(app)` already exists and is called from `create_app()`. Expand it to cover everything currently in the decorator, using the richer `_build_error_response()` envelope:

```python
def register_error_handlers(app: Flask) -> None:
    """Register Flask error handlers. Called from create_app()."""

    @app.errorhandler(RecordNotFoundException)
    def handle_not_found(e: RecordNotFoundException):
        return _build_error_response(e.message, {...}, code=e.error_code, status_code=404)

    @app.errorhandler(AuthenticationException)
    def handle_auth(e: AuthenticationException):
        return _build_error_response(e.message, {...}, code=e.error_code, status_code=401)

    # ... etc for each exception type
```

#### Step 2: Make registration modular

Instead of one giant function, each feature provides its own registration function:

```python
# app/utils/flask_error_handlers.py — TEMPLATE (always present)
def register_core_error_handlers(app: Flask) -> None:
    """Handles ValidationError, BadRequest, IntegrityError, 404, 405, 500."""

# app/exceptions.py — TEMPLATE (common business exceptions)
def register_business_error_handlers(app: Flask) -> None:
    """Handles BusinessLogicException and common subclasses."""

# App-specific modules register their own:
def register_inventory_error_handlers(app: Flask) -> None:
    """Handles InsufficientQuantityException, CapacityExceededException, etc."""
```

`create_app()` calls these in order. Adding a new exception type means adding a handler in the module that defines it — no need to touch the core error handling code.

#### Step 3: Simplify session rollback

Currently `@handle_api_errors` swallows the exception and sets `db_session.info['needs_rollback'] = True` because teardown sees `exc=None`. With Flask error handlers, the exception propagates through Flask's machinery and `teardown_request` receives the actual exception in its `exc` parameter. The `needs_rollback` flag becomes unnecessary:

```python
# Before (current):
@app.teardown_request
def close_session(exc: Exception | None) -> None:
    needs_rollback = db_session.info.get('needs_rollback', False)
    if exc or needs_rollback:
        db_session.rollback()

# After (simplified):
@app.teardown_request
def close_session(exc: Exception | None) -> None:
    if exc:
        db_session.rollback()
    else:
        db_session.commit()
```

#### Step 4: Centralize exception logging

Add a single catch-all handler for logging, or log in the generic `Exception` handler:

```python
@app.errorhandler(Exception)
def handle_generic_exception(e: Exception):
    logger.error("Unhandled exception: %s", e, exc_info=True)
    return _build_error_response("Internal server error", {...}, status_code=500)
```

For business exceptions, logging at ERROR level with full stack trace (as the current decorator does) may be too noisy. Consider logging business exceptions at WARNING or INFO, and only unexpected exceptions at ERROR.

#### Step 5: Remove `@handle_api_errors` from all endpoints

Every endpoint currently has this decorator. Remove it — Flask handles everything now. The `IncludeParameterError` workaround in `app/api/parts.py:51-55` also becomes unnecessary; just register it as a Flask error handler or let it inherit from a handled base class.

### What's Template vs App-Specific

| Component | Classification |
|-----------|---------------|
| `_build_error_response()` helper | TEMPLATE |
| `register_core_error_handlers()` — ValidationError, BadRequest, IntegrityError, 404/405/500 | TEMPLATE |
| `register_business_error_handlers()` — BusinessLogicException catch-all + common subclasses (RecordNotFoundException, AuthenticationException, etc.) | TEMPLATE |
| App-specific exception handlers (InsufficientQuantityException, CapacityExceededException) | APP-SPECIFIC |
| Session teardown (simplified, no `needs_rollback` flag) | TEMPLATE |
| Exception logging in catch-all handler | TEMPLATE |

### What Gets Deleted

- `@handle_api_errors` decorator — the entire function
- `needs_rollback` flag mechanism — replaced by Flask passing `exc` to teardown
- All `@handle_api_errors` annotations on endpoints (~25 files)
- `IncludeParameterError` inline handling in `parts.py`
- Duplicated `IntegrityError` logic (exists only once now)

### Design Notes

- **Flask handles MRO automatically.** If `InsufficientQuantityException(BusinessLogicException)` has no registered handler, Flask falls back to `BusinessLogicException`'s handler. No custom MRO walking needed.
- **Registration order doesn't matter.** Flask matches the most specific exception type in the class hierarchy.
- **Testing is straightforward.** Flask test client exercises the error handlers naturally — no decorator mocking needed.
- **Verify `teardown_request` receives `exc`** when `@app.errorhandler` handles the exception. Flask's documentation confirms this: teardown functions always receive the exception, even when an error handler returns a valid response. However, this should be validated with a test early in the implementation.

---

## R2: Template-Owned App Factory with App Hooks

**Priority:** High — Controls how features are conditionally loaded

### Current State

`app/__init__.py:create_app()` has several coupling points:

1. **Hardcoded wire list** (lines 133-139): 18 API modules enumerated manually.
2. **Hardcoded blueprint registration** (lines 182-209): 6 blueprints registered directly on the Flask app (outside `/api`).
3. **Hardcoded background service startup** (lines 231-264): TempFileManager, S3 bucket ensure, MetricsService polling, DiagnosticsService — all unconditional.
4. **Pool diagnostics inline** (lines 52-120): 68 lines of SQLAlchemy pool event logging buried in the factory.

`app/api/__init__.py` duplicates the coupling: 18 blueprint imports (lines 159-176) and 18 `register_blueprint()` calls (lines 178-195) mirror the wire list.

### Proposed Change

#### 2a: Template-owned `create_app()`

`create_app()` becomes stable template code that **does not change** between apps. It lives in a template-owned location and calls into the app at three well-defined hook points via `app/startup.py`:

```python
# Template-owned create_app() — does not change per app
def create_app(settings=None, skip_background_services=False):
    app = App(__name__)

    # Load/validate config (TEMPLATE)
    if settings is None:
        settings = Settings.load()
    settings.validate_production_config()
    app.config.from_object(settings.to_flask_config())

    # Init DB, SessionLocal (TEMPLATE)
    db.init_app(app)
    from app import models  # noqa: F401
    # ... SessionLocal creation, pool diagnostics ...

    # SpectTree (TEMPLATE)
    configure_spectree(app)

    # Container — app provides the class (HOOK 1)
    from app.startup import create_container
    container = create_container()
    container.config.override(settings)
    container.session_maker.override(SessionLocal)
    container.wire(packages=['app.api'])
    app.container = container

    # CORS, RequestID (TEMPLATE)
    CORS(app, origins=settings.cors_origins)
    RequestID(app)

    # Testing log capture (TEMPLATE)
    if settings.is_testing:
        # ... log handler setup ...

    # Error handlers — template first, then app (HOOK 2)
    register_core_error_handlers(app)       # ValidationError, IntegrityError, 404/405/500
    register_business_error_handlers(app)   # BusinessLogicException hierarchy
    from app.startup import register_error_handlers
    register_error_handlers(app)            # App-specific exceptions

    # Main API blueprint
    # (api/__init__.py creates api_bp, registers auth hooks when use_oidc,
    #  and registers auth_bp on api_bp — all TEMPLATE code)
    from app.api import api_bp
    app.register_blueprint(api_bp)

    # Template blueprints registered directly on app (outside /api)
    app.register_blueprint(health_bp)
    app.register_blueprint(metrics_bp)
    app.register_blueprint(testing_bp)
    # {% if use_sse %}
    app.register_blueprint(sse_bp)
    # {% endif %}
    # {% if use_s3 %}
    app.register_blueprint(cas_bp)
    # {% endif %}

    # App blueprints (HOOK 3)
    from app.startup import register_blueprints
    register_blueprints(api_bp, app)

    # Session teardown (TEMPLATE)
    @app.teardown_request
    def close_session(exc): ...

    # Background services + lifecycle STARTUP event (TEMPLATE)
    if not skip_background_services:
        # Template infra: temp files, S3 bucket, metrics thread, diagnostics
        # ...
        # Fire STARTUP lifecycle event — app services react
        lifecycle = container.lifecycle_coordinator()
        lifecycle.fire_startup()

    return app
```

#### 2b: App hook contract (`app/startup.py`)

The app provides exactly three functions:

```python
# app/startup.py — the app's contract with the template

from flask import Blueprint, Flask
from app.services.container import ServiceContainer


def create_container() -> ServiceContainer:
    """Create and return the app's service container."""
    return ServiceContainer()


def register_blueprints(api_bp: Blueprint, app: Flask) -> None:
    """Register app-specific blueprints."""
    from app.api.parts import parts_bp
    from app.api.boxes import boxes_bp
    from app.api.icons import icons_bp
    # ...

    api_bp.register_blueprint(parts_bp)
    api_bp.register_blueprint(boxes_bp)
    # ...

    # Non-/api blueprints (registered directly on app)
    app.register_blueprint(icons_bp)


def register_error_handlers(app: Flask) -> None:
    """Register app-specific exception-to-HTTP handlers."""
    from app.exceptions import InsufficientQuantityException, CapacityExceededException

    @app.errorhandler(InsufficientQuantityException)
    def handle_insufficient_qty(e):
        return _build_error_response(e.message, {...}, code=e.error_code, status_code=409)

    # ... etc
```

Blueprint registration is explicit — the developer lists exactly what gets registered. No auto-discovery, no manifest.

#### 2c: Wire modules via package scanning

The `wire_modules` duplication disappears. Instead of maintaining a parallel list:

```python
container.wire(packages=['app.api'])
```

`dependency-injector` wires all modules in the `app.api` package recursively. Blueprint registration in `app/startup.py` controls what exists; wiring just follows.

#### 2d: Lifecycle coordinator with STARTUP event

Extend the existing `ShutdownCoordinator` (renamed to `LifecycleCoordinator`) to include a `STARTUP` lifecycle event. This replaces the need for an `on_startup` app hook.

**Rename:** `LifetimeEvent` → `LifecycleEvent`, `ShutdownCoordinatorProtocol` → `LifecycleCoordinatorProtocol`, `ShutdownCoordinator` → `LifecycleCoordinator`, `register_lifetime_notification` → `register_lifecycle_notification`.

**Add event:**

```python
class LifecycleEvent(str, Enum):
    STARTUP = "startup"                 # NEW — fired before Flask accepts requests
    PREPARE_SHUTDOWN = "prepare-shutdown"
    SHUTDOWN = "shutdown"
    AFTER_SHUTDOWN = "after-shutdown"
```

**Add method on the coordinator:**

```python
def fire_startup(self) -> None:
    """Fire the STARTUP lifecycle event. Called by create_app() after
    all infrastructure is ready but before Flask accepts requests."""
    self._raise_lifecycle_event(LifecycleEvent.STARTUP)
```

**Services register for STARTUP in their `__init__`** — exactly the same pattern they already use for shutdown:

```python
class VersionService:
    def __init__(self, lifecycle_coordinator, connection_manager, ...):
        lifecycle_coordinator.register_lifecycle_notification(self._on_lifecycle_event)

    def _on_lifecycle_event(self, event: LifecycleEvent) -> None:
        match event:
            case LifecycleEvent.STARTUP:
                # Eager init: register SSE observer callback
                self._register_observer()
            case LifecycleEvent.PREPARE_SHUTDOWN:
                self._stop_polling()
```

**App-specific startup work** (URL interceptors, dashboard metrics polling callback, etc.) moves into the domain services that own it, triggered by `STARTUP`. No centralized startup function needed.

This means `create_app()` fires a single `lifecycle.fire_startup()` call, and each service reacts to the event. Adding new startup behavior never requires touching `create_app()` or `app/startup.py`.

#### 2e: Extract pool diagnostics

Move the 68-line pool logging block (lines 52-120) to `app/utils/pool_diagnostics.py`:

```python
def setup_pool_logging(engine, settings):
    """Attach SQLAlchemy pool checkout/checkin event logging."""
    if not settings.db_pool_echo:
        return
    # ... existing logic
```

Called from `create_app()` as a one-liner.

### What's Template vs App-Specific

| Component | Classification |
|-----------|---------------|
| `create_app()` (entire function) | TEMPLATE — does not change per app |
| `app/startup.py` (3 hook functions) | APP-SPECIFIC |
| `LifecycleCoordinator` + `STARTUP` event | TEMPLATE |
| `app/api/__init__.py` (api_bp + auth hooks + auth_bp registration) | TEMPLATE (auth behind `use_oidc`) |
| Blueprints on Flask app (health, metrics, testing, sse, cas) | TEMPLATE (sse/cas behind feature flags) |
| App blueprints (parts, boxes, kits, icons, etc.) | APP-SPECIFIC |
| `container.wire(packages=['app.api'])` | TEMPLATE |
| Pool diagnostics utility | TEMPLATE |
| Session teardown handler | TEMPLATE |

### `app/api/__init__.py` Simplification

With this pattern, `app/api/__init__.py` drops all app-specific blueprint imports and `register_blueprint()` calls. It retains:

1. `api_bp` creation
2. `before_request_authentication` / `after_request_set_cookies` auth hooks (behind `use_oidc` in the template)
3. `auth_bp` import and registration on `api_bp` (behind `use_oidc`)

App-specific blueprint registration (parts, boxes, kits, inventory, etc.) moves to `app/startup.register_blueprints()`.

### Summary of Changes from Current State

| Current | After |
|---------|-------|
| `wire_modules` list (18 entries) in `__init__.py` | `container.wire(packages=['app.api'])` |
| 18 app-specific blueprint imports + registrations in `api/__init__.py` | App-specific ones moved to `app/startup.register_blueprints()`; `auth_bp` stays (behind `use_oidc`) |
| 6 blueprint registrations on Flask app in `__init__.py` | Template blueprints (health, metrics, testing, sse, cas) stay in `create_app()` behind feature flags |
| Hardcoded service startup in `create_app()` (lines 231-264) | Template infra in `create_app()` + `LifecycleEvent.STARTUP` for app services |
| 68-line pool diagnostics inline | Extracted to `pool_diagnostics.py` |

---

## R3: Feature-Flagged Configuration

**Priority:** High — Required for Copier template variables to work

### Current State

`app/config.py` contains config for all features (database, OIDC, S3, SSE, AI, Mouser, Celery, diagnostics, tasks, metrics). There are no feature flags to disable optional subsystems — they're always configured even if unused. Celery config (lines 116-124) is dead code.

### Proposed Change

1. **Remove dead Celery config** (`CELERY_BROKER_URL`, `CELERY_RESULT_BACKEND`).

2. **Group config by feature.** The existing config is already roughly grouped; formalize it with comments and ensure each group maps to a Copier feature flag:

   | Config Group | Copier Flag | Always Present? |
   |-------------|------------|-----------------|
   | Flask core (SECRET_KEY, DEBUG, CORS) | — | Yes |
   | Database (DATABASE_URL, pool settings) | `use_database` | No |
   | OIDC (issuer, client, cookies) | `use_oidc` | No |
   | S3 (endpoint, credentials, bucket) | `use_s3` | No |
   | SSE (gateway URL, heartbeat) | `use_sse` | No |
   | Metrics (update interval) | — | Yes |
   | Shutdown (timeout, drain key) | — | Yes |
   | Tasks (workers, timeout) | — | Yes |
   | Diagnostics (thresholds) | — | Yes |
   | AI (OpenAI key, model) | — | No (app-specific) |
   | Mouser (API key) | — | No (app-specific) |

3. **In the Copier template**, config sections behind feature flags are wrapped in Jinja conditionals:
   ```
   {% if use_oidc %}
   # OIDC Authentication
   OIDC_ENABLED: bool = False
   ...
   {% endif %}
   ```

4. **Production validation** (`Settings.validate_production_config()`) should only check OIDC settings when `oidc_enabled` is True (it already does this — no change needed).

### What's Template vs App-Specific

| Component | Classification |
|-----------|---------------|
| Flask/DB/CORS/Shutdown/Metrics/Tasks/Diagnostics config | TEMPLATE |
| OIDC config block | TEMPLATE (behind `use_oidc` flag) |
| S3 config block | TEMPLATE (behind `use_s3` flag) |
| SSE config block | TEMPLATE (behind `use_sse` flag) |
| AI/Mouser config | APP-SPECIFIC |
| Celery config | DELETE |
| `Environment` → `Settings` two-layer pattern | TEMPLATE |
| `validate_production_config()` | TEMPLATE |

---

## R4: Rename `EI_` Metric Prefix on Auth Services

**Priority:** Medium — Concrete code change, no design decisions

### Current State

Auth services use Electronics Inventory-specific metric names:
- `EI_AUTH_VALIDATION_TOTAL`
- `EI_AUTH_VALIDATION_DURATION_SECONDS`
- `EI_JWKS_REFRESH_TOTAL`
- `EI_OIDC_TOKEN_EXCHANGE_TOTAL`
- `EI_AUTH_TOKEN_REFRESH_TOTAL`

All other infrastructure services (MetricsService, ConnectionManager, TaskService, LifecycleCoordinator) already use generic metric names. The auth services are the only exception.

### Proposed Change

Rename to generic names:
- `EI_AUTH_VALIDATION_TOTAL` → `AUTH_VALIDATION_TOTAL`
- `EI_AUTH_VALIDATION_DURATION_SECONDS` → `AUTH_VALIDATION_DURATION_SECONDS`
- `EI_JWKS_REFRESH_TOTAL` → `JWKS_REFRESH_TOTAL`
- `EI_OIDC_TOKEN_EXCHANGE_TOTAL` → `OIDC_TOKEN_EXCHANGE_TOTAL`
- `EI_AUTH_TOKEN_REFRESH_TOTAL` → `AUTH_TOKEN_REFRESH_TOTAL`

Update the Grafana dashboard queries that reference these metrics. Update any tests that assert on metric names.

### Note on Service Container

The service container (`app/services/container.py`) is **app-owned**. The template generates the initial scaffold based on which Copier flags are enabled at generation time (`use_database`, `use_oidc`, `use_s3`, `use_sse`). After generation, it's just Python — no runtime flags, no inheritance, no magic. The developer maintains it like any other file.

No refactoring of the current container is needed. The previous attempt failed because it used inheritance to share the container between template and app. The right approach: the template generates the file once; the developer adds domain providers; template updates are applied manually using version control diffs and release notes.

---

## R5: Test Infrastructure Separation

**Priority:** Medium — Needed for the template test suite

### Current State

`tests/conftest.py` contains both generic infrastructure and domain-specific fixtures interleaved. Key issues:

1. `pytest_configure()` unconditionally checks S3 availability and aborts if unavailable.
2. The `app` fixture's cleanup block hardcodes specific background services to shut down.
3. `oidc_app` fixture patches `app.services.auth_service.PyJWKClient` with a hardcoded module path.
4. Domain fixtures (`make_attachment_set`, `sample_part`) live alongside infrastructure fixtures.

### Proposed Change

#### 5a: S3 Check Controlled by Copier Flag

The S3 availability check in `pytest_configure()` is wrapped in a Jinja conditional in the template:

```
{% if use_s3 %}
def pytest_configure(config):
    _assert_s3_available()
{% endif %}
```

If the app was generated with `use_s3=true`, the check runs unconditionally — no runtime flag, no environment variable. If `use_s3=false`, the code isn't in the generated file at all.

#### 5b: Generic Background Service Cleanup

Replace the hardcoded service cleanup in the `app` fixture with a lifecycle coordinator call:

```python
# Instead of:
#   app.container.metrics_service().shutdown()
#   app.container.temp_file_manager().stop_cleanup_thread()
#   app.container.task_service().shutdown()
# Use:
lifecycle = app.container.lifecycle_coordinator()
lifecycle.shutdown()
```

This uses the lifecycle coordinator for its intended purpose. Services that registered for shutdown events get cleaned up automatically — no hardcoded service list.

#### 5c: Three `conftest.py` Files

The Copier template project has three distinct test configurations:

```
copier-flask-template/                    # The "mother" project
├── tests/                                # (1) Mother project test suite
│   ├── conftest.py                       #     Own conftest — completely separate
│   ├── test_error_handling.py            #     Tests template infrastructure code
│   ├── test_auth.py                      #     (runs against the generated test app)
│   ├── test_health.py
│   ├── test_metrics.py
│   ├── test_lifecycle.py
│   └── test_task_service.py
│
├── template/                             # The Copier template (Jinja files)
│   ├── tests/
│   │   └── conftest.py.jinja             # (2) Template conftest — rendered into user apps
│   └── ...                               #     Contains Jinja conditionals for flags
│
└── generated-test-app/                   # Generated with all flags enabled
    ├── tests/
    │   ├── conftest.py                   # (3) Rendered from (2) — plain Python
    │   └── test_items.py                 #     Test app's own domain tests
    └── ...
```

**Conftest #1: Mother project** (`tests/conftest.py`)
- Completely separate from the other two.
- Sets up whatever the mother project needs to run its tests against the generated test app.
- May generate/refresh the test app as a session-scoped fixture, or rely on it being pre-generated.

**Conftest #2: Template** (`template/tests/conftest.py.jinja`)
- A Jinja-templated file with conditionals (`{% if use_database %}`, `{% if use_s3 %}`, etc.).
- Rendered by Copier into every user app and the generated test app.
- Provides the generic fixtures (app, session, container, client, OIDC mocks, etc.).
- After rendering, it's plain Python — no runtime flags.

**Conftest #3: Generated test app** (`generated-test-app/tests/conftest.py`)
- The rendered output of conftest #2 with all flags enabled.
- Contains all fixtures (database, S3, OIDC, SSE) since the test app enables everything.
- May include additional domain fixtures for the test app's example entity.

**Key rule:** Template infrastructure tests (auth, health, metrics, lifecycle, error handling, etc.) live in conftest #1 / the mother project. They are **never** copied into user apps. They run against the generated test app to verify the template's infrastructure works correctly.

User apps only get conftest #3 (rendered from #2) and write their own domain tests.

### Generic fixtures provided by conftest #2 (the template conftest)

| Fixture | Scope | Purpose | Flag |
|---------|-------|---------|------|
| `clear_prometheus_registry` | function, autouse | Clean Prometheus collectors | — |
| `template_connection` | session | SQLite in-memory template DB | `use_database` |
| `app` | function | Flask app with cloned DB | `use_database` |
| `session` | function | Request-scoped SQLAlchemy session | `use_database` |
| `container` | function | DI container with overrides | — |
| `client` | function | Flask test client | — |
| `runner` | function | Flask CLI test runner | — |
| `generate_test_jwt` | function | RSA key pair + JWT factory | `use_oidc` |
| `mock_oidc_discovery` | function | OIDC discovery mock | `use_oidc` |
| `oidc_app` | function | Flask app with OIDC enabled | `use_oidc` |
| `sample_image_file`, `sample_pdf_bytes` | function | Test file generation | `use_s3` |
| `SSEClient` helper | — | SSE stream parser | `use_sse` |
| `background_task_runner` | function | Thread management for async tests | — |
| `StubLifecycleCoordinator` | — | Protocol-based stub (in testing_utils) | — |
| `TestLifecycleCoordinator` | — | Controllable stub (in testing_utils) | — |

---

## R6: CLI Generalization

**Priority:** Medium — CLI is the entry point for database management

### Current State

`app/cli.py` has two commands:

1. `upgrade-db` — 85% generic (Alembic orchestration), 15% domain (calls `sync_master_data_from_setup()` for electronics types).
2. `load-test-data` — 80% generic (DB recreation, progress reporting), 20% domain (loads electronics-specific JSON fixtures).

### Proposed Change

#### 6a: Master Data Sync as a Hook

The `upgrade-db` command calls `sync_master_data_from_setup()` after migrations. Make this a pluggable hook:

```python
# Template provides:
def upgrade_db(recreate: bool) -> None:
    upgrade_database(recreate=recreate)
    run_post_migration_hooks()  # App registers hooks

# App registers:
register_post_migration_hook(sync_master_data_from_setup)
```

Or simply: the template generates `upgrade-db` with a clearly marked extension point where the app adds its own post-migration logic. Since Copier updates the file, a comment like `# APP: Add post-migration hooks below` makes the boundary clear.

#### 6b: Test Data Loading Pattern

The `load-test-data` command is useful for any app, but the data is domain-specific. The template provides the command skeleton (DB recreation, safety check, progress reporting). The app provides a `TestDataService.load_full_dataset()` implementation.

The command itself can stay in the template as long as the service it calls is app-specific.

### What's Template vs App-Specific

| Component | Classification |
|-----------|---------------|
| CLI framework (argparse, safety flags) | TEMPLATE |
| `upgrade-db` orchestration | TEMPLATE |
| `sync_master_data_from_setup()` call | APP-SPECIFIC (hook) |
| `load-test-data` command skeleton | TEMPLATE |
| `TestDataService.load_full_dataset()` | APP-SPECIFIC |
| `app/data/setup/types.txt` | APP-SPECIFIC |
| `app/data/test_data/*.json` | APP-SPECIFIC |
| `app/database.py` (Alembic operations) | TEMPLATE |

---

## Utils Classification Summary

| File | Classification | Notes |
|------|---------------|-------|
| `error_handling.py` | DELETE (after R1) | Replaced by Flask error handlers |
| `flask_error_handlers.py` | TEMPLATE (after R1) | All exception-to-HTTP mapping lives here |
| `auth.py` | TEMPLATE (behind `use_oidc`) | `@public`, `@allow_roles`, JWT utils |
| `shutdown_coordinator.py` | TEMPLATE (renamed in R2d) | Becomes `lifecycle_coordinator.py` |
| `temp_file_manager.py` | TEMPLATE | Fully generic |
| `spectree_config.py` | TEMPLATE | OpenAPI setup |
| `empty_string_normalization.py` | TEMPLATE | SQLAlchemy hook |
| `text_utils.py` | TEMPLATE | String utilities |
| `sse_utils.py` | TEMPLATE (behind `use_sse`) | SSE formatting |
| `cas_url.py` | TEMPLATE (behind `use_s3`) | CAS URL building |
| `request_parsing.py` | TEMPLATE | Query param parsing |
| `reset_lock.py` | TEMPLATE | Thread-safe lock |
| `log_capture.py` | TEMPLATE | SSE log streaming |
| `pool_diagnostics.py` | TEMPLATE (new, R2e) | Extracted from app factory |
| `image_processing.py` | TEMPLATE (behind `use_s3`) | PIL image utils |
| `mime_handling.py` | TEMPLATE (behind `use_s3`) | MIME detection |
| `url_utils.py` | TEMPLATE | URL parsing |
| `url_metadata.py` | APP-SPECIFIC | Depends on DownloadCacheService |
| `file_parsers.py` | APP-SPECIFIC | Domain-specific file loading |
| `url_interceptors.py` | APP-SPECIFIC | Domain-specific URL rewriting |
| `ai/` directory | APP-SPECIFIC | AI runner abstractions |

---

## API Endpoints Classification

| Endpoint | Classification | Notes |
|----------|---------------|-------|
| `health.py` | TEMPLATE | Kubernetes readiness/liveness + drain |
| `metrics.py` | TEMPLATE | Prometheus scraping |
| `testing.py` | TEMPLATE (skeleton) | DB reset; domain features are app-specific |
| `sse.py` | TEMPLATE (behind `use_sse`) | SSE gateway callbacks |
| `cas.py` | TEMPLATE (behind `use_s3`) | Content-addressable storage |
| `auth.py` | TEMPLATE (behind `use_oidc`) | Login/logout/callback |
| `icons.py` | APP-SPECIFIC | Static icon preview |
| All domain endpoints | APP-SPECIFIC | parts, boxes, inventory, kits, etc. |

---

## Services Classification

| Service | Classification | Notes |
|---------|---------------|-------|
| `LifecycleCoordinator` (was `ShutdownCoordinator`) | TEMPLATE | Extended with STARTUP event (R2d) |
| `MetricsService` | TEMPLATE | Fully generic after recent refactoring |
| `ConnectionManager` | TEMPLATE (behind `use_sse`) | Fully generic |
| `TempFileManager` | TEMPLATE | Fully generic |
| `TaskService` | TEMPLATE | Generic; SSE coupling is acceptable |
| `AuthService` | TEMPLATE (behind `use_oidc`) | Rename `EI_` metric prefix |
| `OidcClientService` | TEMPLATE (behind `use_oidc`) | Rename `EI_` metric prefix |
| `S3Service` | TEMPLATE (behind `use_s3`) | Generic S3 operations |
| `ImageService` | TEMPLATE (behind `use_s3`) | Generic image processing |
| `DownloadCacheService` | APP-SPECIFIC | Used by domain services |
| `SetupService` | APP-SPECIFIC | Electronics types sync |
| `TestDataService` | APP-SPECIFIC | Electronics test data |
| `TestingService` | TEMPLATE (skeleton) | DB reset is generic |
| `VersionService` | TEMPLATE (behind `use_sse`) | SSE deployment notifications |
| `DiagnosticsService` | TEMPLATE | Request timing/profiling |
| `DashboardService` | APP-SPECIFIC | Inventory dashboard |
| All domain services | APP-SPECIFIC | 20+ services |

---

## Recommended Implementation Order

### Phase 1: Foundation (R1, R3)
- **R1** Flask error handler migration — unblocks clean separation of error handling
- **R3** Feature-flagged config — remove dead Celery config, group by feature

### Phase 2: Lifecycle & App Factory (R2)
- **R2d** Lifecycle coordinator (rename + STARTUP event) — prerequisite for clean app factory
- **R2e** Extract pool diagnostics — standalone, no dependencies
- **R2a** Template-owned `create_app()` with app hooks
- **R2b** App hook contract (`app/startup.py`)
- **R2c** Wire modules via package scanning

### Phase 3: Metric Rename (R4)
- **R4** Rename `EI_` metric prefix on auth services

### Phase 4: Tests & CLI (R5, R6)
- **R5** Test infrastructure separation (uses lifecycle coordinator for cleanup)
- **R6** CLI generalization


---

## Template Project Structure

The Copier template project ("mother project") has three parts:

### 1. The template (`template/`)

Jinja-templated source files rendered by Copier into user apps. Contains conditionals for `use_database`, `use_oidc`, `use_s3`, `use_sse`. After rendering, it's plain Python — no flags.

### 2. The generated test app (`generated-test-app/`)

A fully functional app generated from the template with **all flags enabled**. It:

- Defines a minimal domain model (e.g., a single `Item` entity with CRUD)
- Registers one domain service and one API blueprint
- Includes a `ServiceContainer` with infrastructure providers + one domain provider
- Has its own `conftest.py` (rendered from the template conftest) and domain tests

This app exists so the mother project's test suite has something to run against.

### 3. The mother project test suite (`tests/`)

Tests that verify all template infrastructure works correctly:
- Error handling (Flask error handlers, exception mapping)
- Auth flow (OIDC, public/authenticated endpoints, token refresh)
- Health/metrics endpoints
- Lifecycle coordinator (startup + shutdown events)
- Background task execution
- SSE event delivery

These tests run against the generated test app. They live **only** in the mother project — they are never copied into user apps. See R5c for the three `conftest.py` files and their relationships.

---

## Copier Template Variables (Confirmed)

```yaml
project_name:         # e.g., "my-app-backend"
project_description:  # Short description
author_name:          # Author
author_email:         # Email
workspace_name:       # Container path, e.g., "ElectronicsInventory"
use_database:         # PostgreSQL + Alembic (default: true)
use_oidc:             # OIDC authentication (default: false)
use_s3:               # S3/Ceph storage (default: false)
use_sse:              # SSE Gateway integration (default: false)
```

These map to conditional sections in config, container, blueprints, and test fixtures.

# Development Guidelines - Electronics Inventory Backend

This document defines the code architecture, patterns, and testing requirements for the Electronics Inventory project. Follow these guidelines to ensure consistency and maintainability.

## Project Architecture

This Flask backend implements a **hobby electronics parts inventory system** as described in `docs/product_brief.md`. The architecture follows a layered pattern with clear separation of concerns:

```
app/
├── api/          # HTTP endpoints and request handling
├── services/     # Business logic layer
├── models/       # SQLAlchemy database models
├── schemas/      # Pydantic request/response schemas
└── utils/        # Shared utilities and error handling
```

## Sandbox Environment

- Backend and frontend worktrees are bind-mounted into `/work` inside the container.
- Each repository’s `.git` directory is mapped read-only, so staging or committing must happen outside the sandbox.
- The container includes the standard project toolchain; request Dockerfile updates if more tooling is needed.
- With Git safeguarded externally, no additional safety guardrails are enforced beyond the project’s own guidelines.

## Deprecation and Backwards Compatibility

This app follows the BFF pattern—the backend serves only this frontend. Changes to the backend are immediately accompanied by frontend updates, so:

- Make breaking changes freely; no backwards compatibility needed.
- Remove replaced/unused code and endpoints entirely (no deprecation markers).
- Don't include migration hints in error messages.
- Document frontend impact in `docs/features/<FEATURE>/frontend_impact.md` when the frontend dev needs update instructions.

**No tombstones.** When code is replaced or removed, delete it completely. Never leave behind:
- Empty or near-empty files with "moved to X" or "see Y instead" docstrings.
- Commented-out code or `# removed` markers.
- Stub functions/classes that only raise `NotImplementedError` or redirect to another module.
- Re-exports or aliases kept solely for old import paths.
- Variables prefixed with `_unused_` or similar to silence linters.

If something is dead, delete it. **When moving code, update every caller to use the new import path directly.** Never add re-exports at the old location to avoid touching callers — that's not a refactoring, it's hiding the mess. The number of files changed is not a cost; incomplete migrations are.

## Code Organization Patterns

### 1. API Layer (`app/api/`)

API endpoints handle HTTP concerns only - no business logic.

**Pattern:**
- Each resource gets its own module (e.g., `parts.py`, `boxes.py`)
- Use Flask blueprints with URL prefixes
- Validate requests with Pydantic schemas via `@api.validate`
- Delegate all business logic to service classes
- Exceptions propagate to Flask's `@app.errorhandler` registry (no per-endpoint decorator needed)
- Return data using response schemas

**Example structure:**
```python
@parts_bp.route("", methods=["POST"])
@api.validate(json=PartCreateSchema, resp=SpectreeResponse(HTTP_201=PartResponseSchema))
@inject
def create_part(part_service=Provide[ServiceContainer.part_service]):
    data = PartCreateSchema.model_validate(request.get_json())
    part = part_service.create_part(**data.model_dump())
    return PartResponseSchema.model_validate(part).model_dump(), 201
```

### 2. Service Layer (`app/services/`)

Services contain all business logic and database operations using instance-based dependency injection.

**Requirements:**
- Services are instance-based classes. For services that need database access, inject the session via the constructor and store it as `self.db`.
- Return SQLAlchemy model instances, not dicts
- Raise typed exceptions (`RecordNotFoundException`, `InvalidOperationException`)
- No HTTP-specific code (no Flask imports)
- Services can depend on other services via dependency injection

**Example pattern:**
```python
class PartService:
    def __init__(self, db: Session, attachment_set_service: AttachmentSetService):
        self.db = db
        self.attachment_set_service = attachment_set_service

    def create_part(self, description: str, **kwargs) -> Part:
        # Validation and business logic here
        part = Part(description=description, **kwargs)
        self.db.add(part)
        self.db.flush()  # Get ID immediately if needed
        return part
```

### 3. Model Layer (`app/models/`)

SQLAlchemy models represent database entities.

**Requirements:**
- One file per model (e.g., `part.py`, `box.py`)
- Use typed annotations with `Mapped[Type]`
- Include relationships with proper lazy loading
- Add `__repr__` methods for debugging
- Use proper cascade settings for relationships
- Include timestamps (`created_at`, `updated_at`) where appropriate
- Follow the numbering scheme for schema migration files

### 4. Schema Layer (`app/schemas/`)

Pydantic schemas for request/response validation.

**Naming conventions:**
- `*CreateSchema` - Creating new resources
- `*UpdateSchema` - Updating existing resources  
- `*ResponseSchema` - Full API responses with relationships
- `*ListSchema` - Lightweight listings

**Requirements:**
- Use `Field()` with descriptions and examples
- Set `model_config = ConfigDict(from_attributes=True)` for ORM integration
- For calculated/derived properties: define them as `@property` on the SQLAlchemy model, then declare a regular `Field()` in the schema. Pydantic's `from_attributes=True` will read model properties automatically. Avoid `@computed_field` in schemas as it doesn't integrate well with OpenAPI/SpectTree.
- Include proper type hints and optional fields

## File Placement Rules

### New Features
When implementing new features:

1. **Models first** - Create SQLAlchemy model in `app/models/`
2. **Services** - Business logic in `app/services/` 
3. **Schemas** - Request/response validation in `app/schemas/`
4. **API endpoints** - HTTP layer in `app/api/`
5. **Database migration** - Alembic migration in `alembic/versions/`

### Utilities
- Error handling: `app/utils/error_handling.py`
- Shared validation: `app/utils/` 
- Configuration: `app/config.py`

## Testing Requirements (Definition of Done)

**Every piece of code must have comprehensive tests.** No feature is complete without tests.

### Test Organization
- Tests mirror the `app/` structure in `tests/`
- Test files named `test_{module_name}.py`
- Test classes named `TestServiceName` or `TestApiEndpoint`

### Service Testing
**Required test coverage for services:**
- ✅ All public methods
- ✅ Success paths with various input combinations  
- ✅ Error conditions and exception handling
- ✅ Edge cases (empty data, boundary conditions)
- ✅ Database constraints and validation

**Example service test structure:**
```python
class TestPartService:
    def test_create_part_minimal(self, app: Flask, session: Session, container: ServiceContainer):
        # Get service instance from container
        service = container.part_service()
        # Test creating with minimum required fields
        
    def test_create_part_full_data(self, app: Flask, session: Session, container: ServiceContainer):
        # Get service instance from container
        service = container.part_service()
        # Test creating with all fields populated
        
    def test_get_part_nonexistent(self, app: Flask, session: Session, container: ServiceContainer):
        # Test error handling
        service = container.part_service()
        with pytest.raises(RecordNotFoundException):
            service.get_part("INVALID")
```

### API Testing
**Required test coverage for APIs:**
- ✅ All HTTP endpoints and methods
- ✅ Request validation (invalid payloads, missing fields)
- ✅ Response format validation
- ✅ HTTP status codes
- ✅ Error responses

### Database Testing
- ✅ Model constraints and relationships
- ✅ Cascade behavior
- ✅ Data integrity

### Readability Comments
- Add short “guidepost” comments in non-trivial functions to outline the flow or highlight invariants.
- Keep existing explanatory comments unless they are clearly wrong; prefer updating over deleting.
- Focus on intent-level commentary (why/what) rather than narrating obvious statements (how).

## Code Quality Standards

### Linting and Formatting
Before committing, run:
```bash
poetry run ruff check .      # Linting
poetry run mypy .           # Type checking
poetry run pytest          # Full test suite
```

### Type Hints
- Use type hints for all function parameters and return types

### Time Measurements
- **NEVER use `time.time()` for measuring durations or relative time**
- Always use `time.perf_counter()` for duration measurements and performance timing
- `time.time()` is only appropriate for absolute timestamps (e.g., logging when something occurred)
- Example:
  ```python
  # WRONG - time.time() can be affected by system clock adjustments
  start = time.time()
  do_work()
  duration = time.time() - start
  
  # CORRECT - perf_counter() is monotonic and precise
  start = time.perf_counter()
  do_work()
  duration = time.perf_counter() - start
  ```

### Error Handling Philosophy
- **Fail fast and fail often** - Don't swallow exceptions or hide errors from users
- Use custom exceptions from `app.exceptions`
- Include context in error messages
- Let Flask's `@app.errorhandler` registry convert exceptions to HTTP responses
- **Avoid defensive try/catch blocks** that silently continue on errors
- If an operation fails, the user should know about it immediately

## Database Patterns

### Relationships
- Use `lazy="selectin"` for commonly accessed relationships
- Set proper cascade options: `cascade="all, delete-orphan"` for owned entities
- Use foreign key constraints

### Queries
- Build queries with `select()` statements
- Use `scalar_one_or_none()` for single results that may not exist
- Use `scalars().all()` for multiple results
- Always handle the case where records don't exist

### Enumerations
- Model domain enums in SQLAlchemy with `native_enum=False` (or explicit check constraints) so they are stored as text in the database.
- **Do not create PostgreSQL native ENUM types.** They make migrations and reset workflows brittle; prefer plain string columns with constrained values instead.

## S3 Storage Consistency

- Persist attachment rows (and cover updates) before hitting S3. Flush the session, then perform uploads so a failure rolls the transaction back instead of leaving orphaned blobs.
- On deletes, remove the row, handle cover reassignment, flush, then attempt S3 deletion. Log and swallow storage errors because S3 cleanup is best-effort.
- When copying attachments, create and flush the cloned row first, then copy the object in S3 and surface any failure as an `InvalidOperationException`.

## Development Workflow

1. **Plan** - Understand requirements from `docs/product_brief.md`
2. **Model** - Design database schema and relationships
3. **Service** - Implement business logic with comprehensive error handling
4. **Test services** - Write thorough service tests first
5. **API** - Create HTTP endpoints that delegate to services  
6. **Test APIs** - Validate HTTP behavior and response formats
7. **Lint/Type check** - Ensure code quality standards
8. **Integration test** - Verify end-to-end functionality

## Key Project Concepts

Reference `docs/product_brief.md` for domain understanding:

- **Parts** have unique 4-character IDs and live in **Locations** within numbered **Boxes**
- **Inventory tracking** with quantity history
- **Projects** plan builds and track part requirements
- **Smart organization** suggests optimal part placement
- **Search** across all part attributes and documentation

## Prometheus Metrics Infrastructure

The application uses a **decentralized** Prometheus metrics pattern where each service defines and records its own metrics at module level.

### Architecture

- **Module-level metric definitions** - Each service/module defines its Prometheus `Counter`, `Gauge`, and `Histogram` objects as module-level constants. Python's module caching ensures each metric is registered exactly once.
- **MetricsService** (`app/services/metrics_service.py`) - Thin background-polling service. Its only responsibilities are `register_for_polling(name, callback)` to invoke callbacks on a timer, and shutdown integration. It does NOT define or wrap any metrics.
- **`/metrics` endpoint** (`app/api/metrics.py`) - Calls `prometheus_client.generate_latest()` directly; no DI injection needed.
- **Dashboard polling** (`app/services/metrics/dashboard_metrics.py`) - A polling callback registered with MetricsService that updates inventory gauges periodically.

### Adding Metrics to New Features

1. **Define metrics at module level** in the owning service or module:
```python
from prometheus_client import Counter, Histogram

MY_REQUESTS_TOTAL = Counter(
    "my_requests_total",
    "Total requests processed",
    ["status"],
)
MY_DURATION_SECONDS = Histogram(
    "my_duration_seconds",
    "Request processing duration",
)
```

2. **Record metrics directly** in the service method:
```python
import time

start = time.perf_counter()
# ... do work ...
duration = time.perf_counter() - start

MY_REQUESTS_TOTAL.labels(status="success").inc()
MY_DURATION_SECONDS.observe(duration)
```

3. **Use appropriate metric types**:
   - `Counter` - Cumulative totals (requests processed, errors)
   - `Gauge` - Current state values (active connections, queue depth)
   - `Histogram` - Duration measurements (request latency, processing time)

### Testing Metrics

Use the `before/after` pattern with the counter's internal API to assert on metric changes. The `clear_prometheus_registry` autouse fixture unregisters collectors between tests, so use `counter.labels(...)._value.get()` instead of `REGISTRY.get_sample_value()`:

```python
from app.services.my_service import MY_REQUESTS_TOTAL

before = MY_REQUESTS_TOTAL.labels(status="success")._value.get()
# ... exercise code ...
after = MY_REQUESTS_TOTAL.labels(status="success")._value.get()
assert after - before == 1.0
```

### Key Metric Locations

- **Auth validation**: `app/services/auth_service.py` (EI_AUTH_VALIDATION_TOTAL, EI_AUTH_VALIDATION_DURATION_SECONDS)
- **OIDC token exchange**: `app/services/oidc_client_service.py` (EI_OIDC_TOKEN_EXCHANGE_TOTAL, EI_AUTH_TOKEN_REFRESH_TOTAL)
- **SSE connections**: `app/services/connection_manager.py` (SSE_GATEWAY_*)
- **AI analysis**: `app/utils/ai/openai/openai_runner.py` (AI_ANALYSIS_*)
- **Duplicate search**: `app/services/duplicate_search_service.py` (AI_DUPLICATE_SEARCH_*)
- **Mouser API**: `app/services/mouser_service.py` (MOUSER_API_*)
- **Inventory**: `app/services/inventory_service.py` (INVENTORY_QUANTITY_CHANGES_TOTAL)
- **Kits**: `app/services/kit_service.py` (KITS_CREATED_TOTAL, KITS_ACTIVE_COUNT, KITS_ARCHIVED_COUNT)
- **Pick lists**: `app/services/kit_pick_list_service.py`, `app/services/pick_list_report_service.py`
- **Tasks**: `app/services/task_service.py` (ACTIVE_TASKS_AT_SHUTDOWN)
- **Shutdown**: `app/utils/shutdown_coordinator.py` (APPLICATION_SHUTTING_DOWN, GRACEFUL_SHUTDOWN_DURATION_SECONDS)
- **Dashboard polling**: `app/services/metrics/dashboard_metrics.py` (INVENTORY_TOTAL_PARTS, etc.)
- **Parts API**: `app/api/parts.py` (PART_KIT_USAGE_REQUESTS_TOTAL)

## Dependencies

- **Flask** - Web framework
- **SQLAlchemy** - ORM and database abstraction
- **Pydantic** - Request/response validation 
- **Alembic** - Database migrations
- **SpectTree** - OpenAPI documentation generation
- **PostgreSQL** - Primary database
- **pytest** - Testing framework
- **dependency-injector** - Dependency injection container
- **prometheus-client** - Prometheus metrics (decentralized, module-level)

Focus on creating well-tested, maintainable code that follows these established patterns. The goal is a robust parts inventory system that stays organized and scales with your electronics hobby.

## Dependency Injection

### Service Container

The project uses `dependency-injector` to manage service dependencies through a centralized container (`app/services/container.py`):

```python
class ServiceContainer(containers.DeclarativeContainer):
    # Database session provider
    db_session = providers.Dependency(instance_of=Session)
    
    # Service providers
    part_service = providers.Factory(PartService, db=db_session)
    inventory_service = providers.Factory(
        InventoryService, 
        db=db_session,
        part_service=part_service  # Service dependency
    )
```

### Service Dependencies

Services that depend on other services receive them via constructor injection:

```python
class InventoryService:
    def __init__(self, db: Session, part_service: PartService):
        self.db = db
        self.part_service = part_service
```

Factory services that need database access receive the session via the constructor. Singletons that need database access should implement the following pattern:

```python
# db_session() returns a context local session (new if this is the first
# call in the context).
session = self.container.db_session()

try:
    # Do something with the session...

    session.commit()

except Exception:
    # Rollback the session on exception.
    session.rollback()
    raise

finally:
    # Important: reset the session in a finally block. This ensures that
    # the next call to container.db_session() creates a fresh session.
    self.container.db_session.reset()
```

### API Injection

API endpoints use the `@inject` decorator to receive services:

```python
from dependency_injector.wiring import Provide, inject
from app.services.container import ServiceContainer

@inject
def create_part(part_service=Provide[ServiceContainer.part_service]):
    # Use injected service instance
    return part_service.create_part(...)
```

### Container Wiring

The service container is wired to API modules in the application factory (`app/__init__.py`):

```python
# Initialize service container
container = ServiceContainer()
container.wire(modules=[
    'app.api.parts', 'app.api.boxes', 'app.api.inventory', 
    'app.api.types', 'app.api.testing'
])
```

## Graceful Shutdown Integration

Services with background threads or long-running operations must integrate with the graceful shutdown coordinator to ensure clean shutdowns during Kubernetes deployments.

### When to Integrate

Services need shutdown integration if they:
- Run background threads (cleanup, metrics updates, etc.)
- Have long-running operations that should complete before shutdown
- Need to stop accepting new requests during shutdown

### Integration Patterns

**Constructor pattern:**
```python
def __init__(self, shutdown_coordinator: ShutdownCoordinatorProtocol, ...):
    self.shutdown_coordinator = shutdown_coordinator
    # Register for notifications and/or waiters
```

**Two registration types:**

1. **Lifetime notifications** (immediate, non-blocking):
   ```python
   shutdown_coordinator.register_lifetime_notification(self._on_lifetime_event)
   
   def _on_lifetime_event(self, event: LifetimeEvent) -> None:
       match event:
           case LifetimeEvent.PREPARE_SHUTDOWN:
               # Stop accepting new work, set shutdown flags
           case LifetimeEvent.SHUTDOWN: 
               # Final cleanup
   ```

2. **Shutdown waiters** (block shutdown until complete):
   ```python
   shutdown_coordinator.register_shutdown_waiter("ServiceName", self._wait_for_completion)
   
   def _wait_for_completion(self, timeout: float) -> bool:
       # Wait for operations to complete within timeout
       # Return True if ready, False if timeout
   ```

### Examples

- **TaskService**: Uses both notification (stop accepting tasks) and waiter (wait for task completion)
- **MetricsService**: Uses only notification (stop background thread, record shutdown metrics)
- **TempFileManager**: Uses only notification (stop cleanup thread)

### Testing

- Use `StubShutdownCoordinator` for unit tests (dependency injection only)
- Use `TestShutdownCoordinator` for integration tests (simulates shutdown behavior)
- Both available in `tests.testing_utils`

## Test Data Management

**IMPORTANT**: The project includes a comprehensive fixed test dataset that must be kept up to date with any schema or business logic changes.

### Loading Test Data
Use the CLI to recreate the database with a consistent, realistic development dataset:

```bash
# Recreate database and load fixed test dataset
poetry run python -m app.cli load-test-data --yes-i-am-sure
```

This command:
1. Drops all tables and recreates the database schema (like `upgrade-db --recreate`)
2. Loads fixed test data from JSON files in `app/data/test_data/`
3. Creates 10 boxes with realistic electronics organization
4. Loads ~50 realistic electronics parts with proper relationships

### Dataset Maintenance Requirements

**When making schema changes:**
1. Update the JSON files in `app/data/test_data/` to reflect new fields or relationships
2. Ensure test data exercises new constraints and validations
3. Test `load-test-data` command after migrations to verify compatibility
4. Add new realistic data examples for any new entity types or attributes

**When adding business logic:**
1. Update test data JSON files to include edge cases for new functionality
2. Ensure fixed data creates realistic scenarios for testing new features
3. Verify that all JSON data maintains referential integrity

**The fixed test dataset should always:**
- Reflect realistic electronics inventory scenarios with proper part organization
- Exercise all database constraints and relationships
- Provide diverse, predictable data for comprehensive testing
- Include edge cases (empty locations, various quantities, different part types)
- Be consistent and reproducible across all development environments

**Test Data Files Location**: `app/data/test_data/`
- `boxes.json` - Storage box configurations  
- `parts.json` - Realistic electronics parts data
- `part_locations.json` - Part distribution across storage locations
- `quantity_history.json` - Historical stock changes

**Note**: Electronics part categories are loaded from `app/data/setup/types.txt` during database initialization, not from test data files.

## Database Initialization & Type Sync

The system automatically syncs electronics part types from `app/data/setup/types.txt` during database upgrades. This ensures all environments have consistent type definitions without manual intervention.

### Production Database Setup
For a new production database:
```bash
# Creates database schema AND automatically loads all 99 predefined types
poetry run python -m app.cli upgrade-db
```

### Schema Updates  
For subsequent migrations:
```bash
# Applies new migrations AND syncs any new types from setup file
poetry run python -m app.cli upgrade-db
```

### Development Workflow
For development with test data:
```bash  
# Loads schema, syncs types from setup file, and loads realistic test data
poetry run python -m app.cli load-test-data --yes-i-am-sure
```

The type sync is fully **idempotent** - running multiple times will only add missing types, never create duplicates.

## Command Templates

The repository includes command templates for specific development workflows:

- When writing a product brief: @docs/commands/create_brief.md
- When planning a new feature: @docs/commands/plan_feature.md
- When reviewing a plan: @docs/commands/review_plan.md
- When doing code review: @docs/commands/code_review.md
- When planning or implementing a new feature, reference the product brief at @docs/product_brief.md

Use these files when the user asks you to perform the applicable action.

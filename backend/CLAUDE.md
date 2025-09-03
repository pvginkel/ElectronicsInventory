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

## Code Organization Patterns

### 1. API Layer (`app/api/`)

API endpoints handle HTTP concerns only - no business logic.

**Pattern:**
- Each resource gets its own module (e.g., `parts.py`, `boxes.py`)
- Use Flask blueprints with URL prefixes
- Validate requests with Pydantic schemas via `@api.validate`
- Delegate all business logic to service classes
- Handle errors with `@handle_api_errors` decorator
- Return data using response schemas

**Example structure:**
```python
@parts_bp.route("", methods=["POST"])
@api.validate(json=PartCreateSchema, resp=SpectreeResponse(HTTP_201=PartResponseSchema))
@handle_api_errors
@inject
def create_part(part_service=Provide[ServiceContainer.part_service]):
    data = PartCreateSchema.model_validate(request.get_json())
    part = part_service.create_part(**data.model_dump())
    return PartResponseSchema.model_validate(part).model_dump(), 201
```

### 2. Service Layer (`app/services/`)

Services contain all business logic and database operations using instance-based dependency injection.

**Requirements:**
- Services are instance-based classes that inherit from `BaseService`
- Database session injected via constructor (stored as `self.db`)
- Return SQLAlchemy model instances, not dicts
- Raise typed exceptions (`RecordNotFoundException`, `InvalidOperationException`)
- No HTTP-specific code (no Flask imports)
- Services can depend on other services via dependency injection

**Example pattern:**
```python
class PartService(BaseService):
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
- Use `@computed_field` for calculated properties
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
- Use `| None` for optional types (not `Optional[]`)
- Import types in `TYPE_CHECKING` blocks when needed for forward references

### Error Handling Philosophy
- **Fail fast and fail often** - Don't swallow exceptions or hide errors from users
- Use custom exceptions from `app.exceptions`
- Include context in error messages
- Let `@handle_api_errors` convert exceptions to HTTP responses
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

## Dependencies

- **Flask** - Web framework
- **SQLAlchemy** - ORM and database abstraction
- **Pydantic** - Request/response validation 
- **Alembic** - Database migrations
- **SpectTree** - OpenAPI documentation generation
- **PostgreSQL** - Primary database
- **pytest** - Testing framework
- **dependency-injector** - Dependency injection container

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
class InventoryService(BaseService):
    def __init__(self, db: Session, part_service: PartService):
        super().__init__(db)
        self.part_service = part_service
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

**JSON Data Files Location**: `app/data/test_data/`
- `types.json` - Electronics part categories
- `boxes.json` - Storage box configurations  
- `parts.json` - Realistic electronics parts data
- `part_locations.json` - Part distribution across storage locations
- `quantity_history.json` - Historical stock changes

## Command Templates

The repository includes command templates for specific development workflows:

- When writing a product brief: @docs/commands/create_brief.md
- When planning a new feature: @docs/commands/plan_feature.md
- When doing code review: @docs/commands/code_review.md
- When planning or implementing a new feature, reference the product brief at @docs/product_brief.md

Use these files when the user asks you to perform the applicable action.
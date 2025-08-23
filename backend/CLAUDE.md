# Electronics Inventory Backend - Claude Development Context

## Project Overview
This is the Flask backend for a hobby electronics parts inventory management system. See @docs/product_brief.md for complete feature requirements and @docs/technical_design.md for full technical specifications.

## Key Development Context

### Stack Summary
- **Python 3.12** + **Flask 3.x** + **SQLAlchemy 2.x** + **PostgreSQL**
- **Pydantic v2** for typed request/response models
- **Spectree** for OpenAPI documentation
- **Celery** + **RabbitMQ** for background jobs
- **Ceph S3** (boto3) for file storage
- **Poetry** for dependency management

### Core Data Model
- **Parts**: 4-letter IDs (e.g., "BZQP"), manufacturer codes, categories, descriptions, tags
- **Storage**: Numbered boxes with numbered locations (e.g., "7-3" = Box 7, Location 3)
- **Quantities**: Parts can exist in multiple locations with different quantities
- **Documents**: PDFs, images, links stored in S3 and referenced in database

### Development Commands
```bash
# Setup
poetry install
poetry shell

# Run locally
python -m flask run --debug

# Testing
pytest
pytest --cov

# Code quality
ruff check .
ruff format .
mypy .
```

### Implementation Patterns

#### Service Layer Architecture
- **Static service classes** with no instance state (e.g., `BoxService`)
- **Explicit session dependency injection** - all methods take `db: Session` parameter
- **ORM object returns** - services return SQLAlchemy models, APIs convert to Pydantic DTOs
- **Session lifecycle management** - use `flush()` for immediate ID access, `expire()` for relationship reloading

#### Database Design Patterns
- **Dual key pattern** - auto-incrementing surrogate keys (`id`) + sequential business keys (`box_no`) 
- **Surrogate keys for relationships** - FKs reference `id` columns for performance
- **Business keys for logic** - APIs and business logic use business keys (`box_no`, not `id`)
- **Eager loading configuration** - use `lazy="selectin"` for relationships that are always accessed

#### API Layer Patterns
- **Centralized error handling** via `@handle_api_errors` decorator
- **Structured JSON responses** with consistent `{"error": "...", "details": "..."}` format
- **Pydantic validation** with `from_attributes=True` for ORM-to-DTO conversion
- **Flask `g.db` session** pattern for per-request database sessions

#### Testing Architecture
- **Class-based test organization** (`TestBoxService`, `TestBoxAPI`) 
- **Fixture dependency injection** - app, session, client fixtures in `conftest.py`
- **In-memory SQLite** for test isolation (`DATABASE_URL="sqlite:///:memory:"`)
- **Comprehensive test categories**: unit (service), integration (API), constraints (database), validation (edge cases)

### Key Business Rules
1. **Part IDs**: Auto-generated 4 uppercase letters, guaranteed unique
2. **Zero quantity cleanup**: When total quantity reaches zero, all location assignments are cleared
3. **Location suggestions**: Prefer same-category boxes, then designated category boxes, then first available
4. **Search**: Single search box across all text fields using PostgreSQL pg_trgm

### API Structure
- Blueprints per resource: `/parts`, `/boxes`, `/locations`, `/search`, `/shopping-list`, `/projects`
- All requests/responses use Pydantic v2 models
- OpenAPI docs available at `/docs` (Spectree integration pending)
- No direct S3 uploads - all file handling through backend

### File Storage
- S3 buckets: `inventory-docs` (PDFs), `inventory-images` (images)
- All uploads go through backend API, not direct to S3
- Frontend uses PDF.js for PDF viewing

### Background Jobs (Celery)
- AI tagging from descriptions/manufacturer codes
- Category suggestions
- Photo-based part number extraction
- Datasheet discovery and fetching
- Reorganization plan generation

This file provides context for development work. Refer to the full documentation in `docs/` for complete requirements and specifications.

## Command Templates

The repository includes command templates for specific development workflows:

- When writing a product brief: @docs/commands/create_brief.md
- When planning a new feature: @docs/commands/plan_feature.md
- When doing code review: @docs/commands/code_review.md
- When planning or implementing a new feature, reference the product brief at @docs/product_brief.md

Use these files when the user asks you to perform the applicable action.
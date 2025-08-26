# Backend Stack (Flask + PostgreSQL) — Finalized

## Core

* **Python 3.12**
* **Flask 3.x** (pure WSGI)
* **SQLAlchemy 2.x** + **Alembic** (DB models & migrations; SQLA 2-style typing)
* **psycopg 3** (PostgreSQL driver)
* **pydantic v2** + **pydantic-settings** (typed request/response models & typed config)
* **OpenAPI** via **Spectree** (Flask plugin that reads Pydantic models)
* **CORS**: `flask-cors` (allow only your frontend origin)

## Architecture

* Backend follows a BFF pattern. Breaking changes can be made and the frontend will always be brought in line.

## Object/BLOB Storage (Ceph S3)

* **boto3** S3 client configured with your **Ceph RGW endpoint**

  * Use `endpoint_url` + `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`
  * Set `S3_FORCE_PATH_STYLE=true` (common for Ceph)
  * Uploads and downloads always to throught he backend. No pre-signed POST/PUT URLs.
* Buckets:

  * `inventory-docs` (PDFs)
  * `inventory-images` (images)
  * Optional: enable **versioning** in Ceph for accidental overwrites.

## Background Jobs

* **Celery** (choose Celery over RQ to avoid Redis)

  * **Broker:** **RabbitMQ** (stable on Kubernetes)
  * **Result backend:** PostgreSQL (via SQLAlchemy URL) or RPC (if you prefer no results persistence)
  * Uses: AI tagging, category suggestions, datasheet discovery/ingest, image thumbnailing, reorg-plan generation.
* Why Celery:

  * Doesn’t force Redis; works great with RabbitMQ on K8s.
  * Mature ecosystem, retries, scheduling, routing.

## AI (Offloaded to OpenAI)

* **openai** Python SDK only.
* MVP jobs:

  1. **Auto-tag** from description/manufacturer code
  2. **Category suggestion** (maps to your types)
  3. **Vision from photo**: extract likely part number / hints, propose docs to fetch
  4. **Datasheet discovery**: model proposes candidate URLs; API fetches & stores PDFs in S3

## Serving & Networking

* **Waitress** as the WSGI server inside the API container
* **NGINX** as reverse proxy (sits with the React frontend; also acts as K8s Ingress/Service front if you prefer a single host)
* **No rate limits** (internal network)

## Search (single search box)

* PostgreSQL **pg\_trgm** + GIN indexes across:

  * `parts.id4`, `manufacturer_code`, `description`, `tags[]`, `seller`, `documents.original_filename`
* Optional: combine with `to_tsvector` (simple English) for reasonable ranking.
* Endpoint: `GET /search?q=...` returns parts with key fields & locations.

# Typed Data Model (high-level, implemented patterns)

* `parts` (**CHAR(4)** `id4` PK, `manufacturer_code`, `type_id`, `description`, `image_url`, `tags` TEXT\[], `seller`, `seller_link`, `created_at`, `updated_at`) - *Not yet implemented*
* `boxes` (`id` INT AUTOINCREMENT PK, `box_no` INT UNIQUE, `description` STR, `capacity` INT, `created_at`, `updated_at`)
* `locations` (`id` INT AUTOINCREMENT PK, `box_id` INT FK→boxes.id, `box_no` INT, `loc_no` INT, **UNIQUE(box\_no, loc\_no)**)
* `part_locations` (`part_id4` FK→parts, `box_no`, `loc_no`, `qty`, **UNIQUE(part\_id4, box\_no, loc\_no)**) - *Not yet implemented*
* `types` (`id` PK, `name` UNIQUE) - *Not yet implemented*
* `documents` (`id` PK, `part_id4`, `kind` ENUM(pdf,image,link), `s3_key`, `public_url?`, `original_filename`, `created_at`) - *Not yet implemented*
* `history` (`id` PK, `part_id4`, `delta_qty`, `at`) - *Not yet implemented*
* `shopping_list` (`id` PK, `maybe_part_id4` NULL, `manufacturer_code`, `description`, `type_id`, `desired_qty`, `seller`, `seller_link`, `notes`, `created_at`) - *Not yet implemented*
* `projects` (`id` PK, `name`, `notes`, `created_at`) - *Not yet implemented*
* `project_requirements` (`project_id`, `part_id4 OR placeholder`, `required_qty`) - *Not yet implemented*

**Typing Implementation:**

* SQLAlchemy 2.0 **annotated** models (`Mapped[T]`, `mapped_column(...)`)
* Pydantic v2 **typed DTOs** for every request/response
* mypy strict mode (see below) enforced in CI

**Surrogate vs Business Keys Implementation:**
* Uses **dual key pattern**: auto-incrementing surrogate keys (`id`) for performance + business keys (`box_no`) for logic
* Business keys are auto-generated sequentially (not user-provided)
* All relationships use surrogate keys internally
* All business logic and APIs use business keys externally

**ID policy:** 4 uppercase letters (`A–Z`). Generate, try insert, **retry on unique violation** (DB enforces uniqueness). - *For parts (not yet implemented)*

# API Conventions (typed, implemented patterns)

* **Blueprints** per resource (`/parts`, `/boxes`, `/locations`, `/search`, `/shopping-list`, `/projects`, `/reorg`, `/ai/suggest`)
* Request/response models: **Pydantic v2**
* Validation & docs: **Spectree** generates OpenAPI (Swagger UI at `/docs`)
* No direct-to-S3 uploads: frontend uploads to the backend and backend handles S3 key + metadata itself
* Services return ORM objects. API classes convert these to Pydantic DTO objects which are used in OpenAPI and returned by the API endpoint methods.

## Implemented API Patterns

### Error Handling
* **Centralized error handling** via `@handle_api_errors` decorator in `app/utils/error_handling.py`
* **Structured error responses** with consistent JSON format: `{"error": "...", "details": "..."}`
* **HTTP status code mapping**: 400 (validation), 404 (not found), 409 (conflict), 500 (server error)
* **User-friendly messages** for database constraint violations (unique, foreign key, not null)

### Request/Response Flow
1. **Request validation**: Pydantic schemas validate incoming JSON automatically
2. **Service layer**: Static methods take explicit Session parameter, return ORM objects
3. **Response serialization**: Pydantic DTOs with `from_attributes=True` convert ORM to JSON
4. **Transaction management**: Flask `g.db` session per request pattern

### Service Layer Architecture
* **Static service classes** (no instance state)
* **Explicit session dependency injection** - all service methods take `db: Session`
* **ORM object return types** - services return SQLAlchemy models, not DTOs
* **Session lifecycle management** - flush() for immediate ID access, expire() for relationship reloading
* **Business logic encapsulation** - complex operations (capacity changes) handled in services

# Dev Experience (implemented patterns)

* **Dependency & env**

  * **Poetry** (most widely adopted workflow on teams using Flask today)
  * **pydantic-settings** for typed config from env
  * `.env` for local, mounted as Kubernetes **Secret** in prod
* **Formatting & linting**

  * **ruff** (linter + import sort + format; you can skip black if you use ruff's formatter)
  * **mypy** (`--strict`) with `sqlalchemy2-stubs` installed
* **Testing**

  * **pytest** + **pytest-cov** - **✅ Implemented with comprehensive test suite**
  * **testcontainers-python** for ephemeral PostgreSQL & RabbitMQ in CI - *Not yet configured*
* **IDE**

  * VS Code extensions: Python, Pylance, Mypy Type Checker, Docker, YAML, Even Better TOML
  * Settings: enable "Type Checking Mode: strict" in workspace
* **CI (GitHub Actions)**

  * Jobs: `ruff`, `mypy`, `pytest` (with testcontainers), `docker build` (multi-arch optional), `helm lint` (see below) - *Not yet configured*
* **Docker (no Makefile, no pre-commit)**

  * **Multi-stage** Dockerfile:

    1. builder: install Poetry, export lock to wheels
    2. runtime: copy wheels + app, run Waitress
  * Healthcheck: `/health` endpoint

## Testing Patterns Implemented

### Test Architecture
* **pytest** with class-based test organization (`TestBoxService`, `TestBoxAPI`)
* **Fixture-based dependency injection** - app, session, client fixtures in `conftest.py`
* **In-memory SQLite** for test database isolation (`DATABASE_URL="sqlite:///:memory:"`)
* **Session management** - dedicated test session fixtures with proper transaction handling

### Test Categories
1. **Unit tests** (`test_box_service.py`) - Test service layer methods directly
2. **API integration tests** (`test_box_api.py`) - Test HTTP endpoints with JSON payloads
3. **Database constraint tests** (`test_database_constraints.py`) - Test unique constraints and relationships
4. **Validation tests** (`test_capacity_validation.py`) - Test edge cases and error conditions

### Test Data Patterns
* **Factory methods** in service layer for test data creation
* **Explicit session management** - separate session fixture for isolation
* **Transaction boundaries** - commit/rollback handling in fixtures
* **Eager loading testing** - verify relationship loading behavior

# Key Implementation Notes (gotchas handled)

* **PDF viewing**: handled fully in the **frontend** (PDF.js). API just stores/serves S3 URLs or proxies if you want to keep S3 private.
* **No Redis**: not used at all (neither cache nor queue).
* **Search relevance**: combine `pg_trgm` similarity with basic full-text; cap results; return top-N with lightweight fields for speed.
* **Reorg plan**: compute in Celery (it can be O(n log n)); store a generated plan row with an expiry; idempotent apply.

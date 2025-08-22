# Backend Stack (Flask + PostgreSQL) — Finalized

## Core

* **Python 3.12**
* **Flask 3.x** (pure WSGI)
* **SQLAlchemy 2.x** + **Alembic** (DB models & migrations; SQLA 2-style typing)
* **psycopg 3** (PostgreSQL driver)
* **pydantic v2** + **pydantic-settings** (typed request/response models & typed config)
* **OpenAPI** via **Spectree** (Flask plugin that reads Pydantic models)
* **CORS**: `flask-cors` (allow only your frontend origin)

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

# Typed Data Model (high-level, unchanged intent)

* `parts` (**CHAR(4)** `id4` PK, `manufacturer_code`, `type_id`, `description`, `image_url`, `tags` TEXT\[], `seller`, `seller_link`, `created_at`, `updated_at`)
* `boxes` (`box_no` INT PK, `capacity` INT)
* `locations` (`box_no` INT FK→boxes, `loc_no` INT, **UNIQUE(box\_no, loc\_no)**)
* `part_locations` (`part_id4` FK→parts, `box_no`, `loc_no`, `qty`, **UNIQUE(part\_id4, box\_no, loc\_no)**)
* `types` (`id` PK, `name` UNIQUE)
* `documents` (`id` PK, `part_id4`, `kind` ENUM(pdf,image,link), `s3_key`, `public_url?`, `original_filename`, `created_at`)
* `history` (`id` PK, `part_id4`, `delta_qty`, `at`)
* `shopping_list` (`id` PK, `maybe_part_id4` NULL, `manufacturer_code`, `description`, `type_id`, `desired_qty`, `seller`, `seller_link`, `notes`, `created_at`)
* `projects` (`id` PK, `name`, `notes`, `created_at`)
* `project_requirements` (`project_id`, `part_id4 OR placeholder`, `required_qty`)

**Typing:**

* SQLAlchemy 2.0 **annotated** models (`Mapped[T]`, `mapped_column(...)`)
* Pydantic v2 **typed DTOs** for every request/response
* mypy strict mode (see below) enforced in CI

**ID policy:** 4 uppercase letters (`A–Z`). Generate, try insert, **retry on unique violation** (DB enforces uniqueness).

# API Conventions (typed)

* **Blueprints** per resource (`/parts`, `/boxes`, `/locations`, `/search`, `/shopping-list`, `/projects`, `/reorg`, `/ai/suggest`)
* Request/response models: **Pydantic v2**
* Validation & docs: **Spectree** generates OpenAPI (Swagger UI at `/docs`)
* No direct-to-S3 uploads: frontend uploads to the backend and backend handles S3 key + metadata itself

# Dev Experience

* **Dependency & env**

  * **Poetry** (most widely adopted workflow on teams using Flask today)
  * **pydantic-settings** for typed config from env
  * `.env` for local, mounted as Kubernetes **Secret** in prod
* **Formatting & linting**

  * **ruff** (linter + import sort + format; you can skip black if you use ruff’s formatter)
  * **mypy** (`--strict`) with `sqlalchemy2-stubs` installed
* **Testing**

  * **pytest** + **pytest-cov**
  * **testcontainers-python** for ephemeral PostgreSQL & RabbitMQ in CI
* **IDE**

  * VS Code extensions: Python, Pylance, Mypy Type Checker, Docker, YAML, Even Better TOML
  * Settings: enable “Type Checking Mode: strict” in workspace
* **CI (GitHub Actions)**

  * Jobs: `ruff`, `mypy`, `pytest` (with testcontainers), `docker build` (multi-arch optional), `helm lint` (see below)
* **Docker (no Makefile, no pre-commit)**

  * **Multi-stage** Dockerfile:

    1. builder: install Poetry, export lock to wheels
    2. runtime: copy wheels + app, run Waitress
  * Healthcheck: `/healthz` endpoint

# Key Implementation Notes (gotchas handled)

* **PDF viewing**: handled fully in the **frontend** (PDF.js). API just stores/serves S3 URLs or proxies if you want to keep S3 private.
* **No Redis**: not used at all (neither cache nor queue).
* **Search relevance**: combine `pg_trgm` similarity with basic full-text; cap results; return top-N with lightweight fields for speed.
* **Reorg plan**: compute in Celery (it can be O(n log n)); store a generated plan row with an expiry; idempotent apply.

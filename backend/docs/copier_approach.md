# Copier Template Creation — Approach

This document outlines the approach for creating the Copier template project after all refactorings from `copier_template_analysis.md` (R1-R6) have been implemented. It covers the template project structure, build order, porting strategy, and ongoing maintenance.

---

## 1. Overview

The goal is a **Copier template** that generates Flask backend projects sharing the same infrastructure stack (Flask + SQLAlchemy + dependency-injector + Pydantic + Spectree). Generated projects are plain Python — no runtime dependency on the template, no base classes, no shared library. Template updates are pulled into existing projects via `copier update`, which performs a three-way merge.

**Key principle:** The template generates code, not abstractions. Each generated project is self-contained and can diverge freely. The template is a starting point and an update channel, not a framework.

---

## 2. Prerequisites

All refactorings from `copier_template_analysis.md` must be implemented in the Electronics Inventory backend first:

| Refactoring | Why it must come first |
|-------------|----------------------|
| **R1** Flask error handler migration | Error handling must be modular (template vs app handlers) before extraction |
| **R2** Template-owned app factory with hooks | `create_app()`, `app/startup.py`, lifecycle coordinator must be in final form |
| **R3** Feature-flagged config | Config groups must map cleanly to Copier variables |
| **R4** `EI_` metric rename | Auth metrics must be generic before inclusion in template |
| **R5** Test infrastructure separation | Three-conftest architecture must be validated |
| **R6** CLI generalization | CLI hooks must be in place |

After R1-R6 are implemented, the EI backend itself is the reference implementation. The template is extracted from it.

---

## 3. File Ownership Model

Every file in a generated project falls into one of two categories. Getting this right determines whether `copier update` works smoothly or creates constant merge conflicts.

### Template-maintained files

Owned by the template. Updated via `copier update`. The app developer should avoid editing these files beyond what's necessary — changes will create merge conflicts on the next update.

These files contain **no app-specific code**. They are generic infrastructure that works identically across all projects.

**Examples:** `app/__init__.py` (create_app), `app/config.py`, `app/utils/lifecycle_coordinator.py`, `app/api/health.py`, `app/services/metrics_service.py`, `tests/conftest.py`, `pyproject.toml`, `alembic/env.py`.

### App-maintained files

Generated once as a scaffold. The app developer owns them from that point forward. `copier update` will **not** overwrite these files (configured via `_skip_if_exists` in copier.yml).

These files are where the app's domain logic lives. The template provides a working starting point; the developer extends it.

**Examples:** `app/startup.py`, `app/services/container.py`, `app/exceptions.py` (app-specific subclasses), domain models, domain services, domain API blueprints, `app/data/`.

### Grey area: exceptions.py

The base exception hierarchy (BusinessLogicException, RecordNotFoundException, AuthenticationException, etc.) is template code. App-specific exceptions (InsufficientQuantityException, CapacityExceededException) are app code. Two approaches:

1. **Single file, app-maintained.** Template generates `exceptions.py` with all base classes as a scaffold. App adds below. Simple, but base class changes require manual merge on template updates.
2. **Split files.** Template maintains `app/exceptions/base.py` with common exceptions. App creates `app/exceptions/domain.py` for its own. Clean separation, but more files.

Recommend approach 1 for simplicity — base exceptions rarely change, and when they do, the diff is small.

---

## 4. Template Project Layout

```
copier-flask-template/
├── copier.yml                          # Template configuration + variables
│
├── template/                           # Jinja-templated source files
│   ├── app/
│   │   ├── __init__.py.jinja           # create_app() — TEMPLATE-MAINTAINED
│   │   ├── app.py                      # Custom Flask class
│   │   ├── config.py.jinja             # Settings with feature conditionals
│   │   ├── extensions.py               # db = SQLAlchemy()
│   │   ├── exceptions.py.jinja         # Base exception hierarchy — APP-MAINTAINED
│   │   ├── database.py.jinja           # Alembic operations (behind use_database)
│   │   ├── startup.py.jinja            # App hook scaffold — APP-MAINTAINED
│   │   ├── cli.py.jinja                # CLI commands
│   │   │
│   │   ├── api/
│   │   │   ├── __init__.py.jinja       # api_bp + auth hooks (behind use_oidc)
│   │   │   ├── health.py               # Kubernetes probes
│   │   │   ├── metrics.py              # Prometheus endpoint
│   │   │   ├── testing.py.jinja        # DB reset skeleton
│   │   │   ├── auth.py                 # (behind use_oidc)
│   │   │   ├── sse.py                  # (behind use_sse)
│   │   │   └── cas.py                  # (behind use_s3)
│   │   │
│   │   ├── services/
│   │   │   ├── container.py.jinja      # Scaffold with infra providers — APP-MAINTAINED
│   │   │   ├── metrics_service.py
│   │   │   ├── task_service.py
│   │   │   ├── testing_service.py.jinja
│   │   │   ├── diagnostics_service.py
│   │   │   ├── auth_service.py         # (behind use_oidc)
│   │   │   ├── oidc_client_service.py  # (behind use_oidc)
│   │   │   ├── connection_manager.py   # (behind use_sse)
│   │   │   ├── version_service.py      # (behind use_sse)
│   │   │   ├── s3_service.py           # (behind use_s3)
│   │   │   ├── image_service.py        # (behind use_s3)
│   │   │   └── temp_file_manager.py
│   │   │
│   │   ├── utils/
│   │   │   ├── flask_error_handlers.py # Core + business error handlers
│   │   │   ├── lifecycle_coordinator.py
│   │   │   ├── pool_diagnostics.py     # (behind use_database)
│   │   │   ├── spectree_config.py
│   │   │   ├── auth.py                 # (behind use_oidc)
│   │   │   ├── sse_utils.py            # (behind use_sse)
│   │   │   ├── cas_url.py              # (behind use_s3)
│   │   │   ├── image_processing.py     # (behind use_s3)
│   │   │   ├── mime_handling.py         # (behind use_s3)
│   │   │   └── ... (other generic utils)
│   │   │
│   │   ├── schemas/                    # (empty — app populates)
│   │   └── models/
│   │       └── __init__.py             # (behind use_database)
│   │
│   ├── tests/
│   │   ├── conftest.py.jinja           # Template conftest — TEMPLATE-MAINTAINED
│   │   └── testing_utils.py            # Lifecycle coordinator stubs
│   │
│   ├── alembic/                        # (behind use_database)
│   │   ├── env.py.jinja
│   │   ├── script.py.mako
│   │   └── versions/
│   │       └── .gitkeep
│   │
│   ├── alembic.ini.jinja              # (behind use_database)
│   ├── pyproject.toml.jinja
│   ├── Dockerfile.jinja
│   ├── .env.example.jinja
│   ├── .env.test.jinja
│   └── run.py                          # Dev server entry point
│
├── generated-test-app/                 # Pre-generated app (all flags enabled)
│   ├── app/
│   │   ├── __init__.py                 # Rendered create_app()
│   │   ├── startup.py                  # Hooks for test domain (Item CRUD)
│   │   ├── services/
│   │   │   └── container.py            # Infra + ItemService provider
│   │   ├── models/
│   │   │   └── item.py                 # Minimal domain model
│   │   ├── schemas/
│   │   │   └── item_schema.py          # CRUD schemas
│   │   └── api/
│   │       └── items.py                # Single domain blueprint
│   ├── tests/
│   │   ├── conftest.py                 # Rendered from template conftest
│   │   └── test_items.py               # Domain tests for Item CRUD
│   └── ...
│
├── tests/                              # Mother project test suite
│   ├── conftest.py                     # Mother project fixtures
│   ├── test_error_handling.py
│   ├── test_auth.py
│   ├── test_health.py
│   ├── test_metrics.py
│   ├── test_lifecycle.py
│   ├── test_task_service.py
│   └── test_sse.py
│
├── pyproject.toml                      # Mother project dependencies
└── README.md
```

---

## 5. Copier Configuration

### copier.yml

```yaml
_subdirectory: template
_templates_suffix: .jinja
_skip_if_exists:
  - app/startup.py
  - app/services/container.py
  - app/exceptions.py

# --- Questions ---

project_name:
  type: str
  help: "Project name (e.g., my-app-backend)"

project_description:
  type: str
  help: "Short project description"
  default: "A Flask backend application"

author_name:
  type: str
  help: "Author name"

author_email:
  type: str
  help: "Author email"

workspace_name:
  type: str
  help: "Container workspace path (e.g., MyProject)"

use_database:
  type: bool
  default: true
  help: "Include PostgreSQL + SQLAlchemy + Alembic"

use_oidc:
  type: bool
  default: false
  help: "Include OIDC authentication (BFF cookie pattern)"

use_s3:
  type: bool
  default: false
  help: "Include S3/Ceph object storage"

use_sse:
  type: bool
  default: false
  help: "Include SSE Gateway integration"
```

### Key settings

- **`_subdirectory: template`** — Template files live in `template/`, not the repo root. This keeps the mother project's own files (tests/, pyproject.toml) separate from what gets rendered.
- **`_templates_suffix: .jinja`** — Only files ending in `.jinja` are processed as Jinja templates. Plain files (`.py`, `.toml`) are copied as-is.
- **`_skip_if_exists`** — App-maintained files are never overwritten by `copier update`. The developer owns them after first generation.

### Conditional file exclusion

Files that should only exist when a feature flag is enabled need to be excluded when the flag is off. Copier supports this via `_exclude` with Jinja expressions:

```yaml
_exclude:
  # OIDC files
  - "{% if not use_oidc %}app/api/auth.py{% endif %}"
  - "{% if not use_oidc %}app/services/auth_service.py{% endif %}"
  - "{% if not use_oidc %}app/services/oidc_client_service.py{% endif %}"
  - "{% if not use_oidc %}app/utils/auth.py{% endif %}"
  # S3 files
  - "{% if not use_s3 %}app/api/cas.py{% endif %}"
  - "{% if not use_s3 %}app/services/s3_service.py{% endif %}"
  - "{% if not use_s3 %}app/services/image_service.py{% endif %}"
  # ... etc
```

For files with feature-conditional **sections** (not entire files), the `.jinja` suffix handles it — the Jinja blocks inside the file control what's rendered.

---

## 6. Jinja Templating Patterns

### Pattern 1: Entire file conditional

For files that only exist with a feature flag, exclude them via `_exclude` in copier.yml (see above). The file itself is plain Python — no Jinja needed in its content.

### Pattern 2: Conditional code blocks

For files that always exist but have optional sections:

```python
# app/config.py.jinja

class Settings:
    # Core settings (always present)
    secret_key: str
    debug: bool = False

{% if use_database %}
    # Database
    database_url: str
    db_pool_size: int = 5
{% endif %}

{% if use_oidc %}
    # OIDC Authentication
    oidc_enabled: bool = False
    oidc_issuer_url: str = ""
{% endif %}
```

After rendering with `use_database=true, use_oidc=false`:

```python
class Settings:
    # Core settings (always present)
    secret_key: str
    debug: bool = False

    # Database
    database_url: str
    db_pool_size: int = 5
```

### Pattern 3: Conditional imports

```python
# app/services/container.py.jinja

from dependency_injector import containers, providers
{% if use_database %}
from sqlalchemy.orm import Session
{% endif %}
{% if use_oidc %}
from app.services.auth_service import AuthService
{% endif %}
```

### Pattern 4: Variable substitution

```python
# pyproject.toml.jinja

[tool.poetry]
name = "{{ project_name }}"
description = "{{ project_description }}"
authors = ["{{ author_name }} <{{ author_email }}>"]
```

### Pattern 5: Whitespace control

Use Jinja's whitespace control (`-`) to avoid blank lines in rendered output:

```python
{%- if use_oidc %}
from app.services.auth_service import AuthService
{%- endif %}
```

### Naming convention

- Files with Jinja content: `filename.py.jinja` (processed by Copier, output as `filename.py`)
- Files without Jinja: `filename.py` (copied as-is)
- Only add `.jinja` when the file actually contains template directives

---

## 7. Build Order

Build the template incrementally, validating at each step. Each step adds files to `template/`, extends the test app, and adds mother project tests.

### Step 1: Core (no feature flags)

The minimal Flask app that always works, regardless of flags.

**Template files:**
- `app/__init__.py.jinja` (create_app with hook calls)
- `app/app.py`, `app/extensions.py`
- `app/config.py.jinja` (core settings only)
- `app/startup.py.jinja` (scaffold with empty hooks)
- `app/services/container.py.jinja` (minimal scaffold)
- `app/exceptions.py.jinja` (base exception hierarchy)
- `app/utils/flask_error_handlers.py` (core + business error handlers)
- `app/utils/lifecycle_coordinator.py`
- `app/services/metrics_service.py`, `app/services/task_service.py`
- `app/services/temp_file_manager.py`, `app/services/diagnostics_service.py`
- `app/api/__init__.py.jinja` (api_bp, no auth hooks yet)
- `app/api/health.py`, `app/api/metrics.py`, `app/api/testing.py.jinja`
- `tests/conftest.py.jinja` (basic fixtures)
- `tests/testing_utils.py`
- `pyproject.toml.jinja` (core dependencies)
- `copier.yml`

**Test app:** Minimal Flask app, no domain model. Just verifies the app starts and health endpoint works.

**Mother project tests:** App creation, health endpoint, metrics endpoint, error handling, lifecycle coordinator startup + shutdown.

**Validation:** Generate a project with all flags off. Run the test suite. Everything passes.

### Step 2: Database (`use_database`)

**Add to template:**
- Database sections in `app/config.py.jinja`
- `app/database.py.jinja` (Alembic operations + post-migration hook)
- `app/cli.py.jinja` (upgrade-db, load-test-data)
- `app/utils/pool_diagnostics.py`
- `alembic/` directory, `alembic.ini.jinja`
- Database fixtures in `tests/conftest.py.jinja`
- Database providers in `app/services/container.py.jinja`

**Test app:** Add an `Item` model, `ItemService`, `items` API blueprint. Add an Alembic migration. Add domain tests.

**Mother project tests:** Database creation, migration, CLI commands, session lifecycle, teardown.

**Validation:** Generate with `use_database=true`. Run migrations. Run tests. Generate with `use_database=false`. Verify no database code present.

### Step 3: OIDC (`use_oidc`)

**Add to template:**
- OIDC sections in `app/config.py.jinja`
- `app/api/auth.py`, `app/services/auth_service.py`, `app/services/oidc_client_service.py`
- `app/utils/auth.py` (@public, @allow_roles, JWT utilities)
- Auth hooks in `app/api/__init__.py.jinja`
- OIDC providers in `app/services/container.py.jinja`
- OIDC fixtures in `tests/conftest.py.jinja`

**Test app:** Add OIDC providers to container. Mark items endpoint as authenticated.

**Mother project tests:** Port the existing 119 auth tests. Public endpoint access, authenticated endpoint rejection, token refresh, role checks.

**Validation:** Generate with `use_oidc=true`. Run auth tests. Generate without. Verify no auth code.

### Step 4: S3 (`use_s3`)

**Add to template:**
- S3 sections in `app/config.py.jinja`
- `app/api/cas.py`, `app/services/s3_service.py`, `app/services/image_service.py`
- `app/utils/cas_url.py`, `app/utils/image_processing.py`, `app/utils/mime_handling.py`
- S3 providers in `app/services/container.py.jinja`
- S3 fixtures in `tests/conftest.py.jinja`

**Test app:** Add an image upload endpoint to the items API.

**Mother project tests:** S3 bucket operations, CAS URL generation, image processing.

**Validation:** Generate with `use_s3=true`. Run S3 tests. Generate without. Verify no S3 code.

### Step 5: SSE (`use_sse`)

**Add to template:**
- SSE sections in `app/config.py.jinja`
- `app/api/sse.py`, `app/services/connection_manager.py`, `app/services/version_service.py`
- `app/utils/sse_utils.py`, `app/utils/log_capture.py`
- SSE providers in `app/services/container.py.jinja`
- SSE fixtures in `tests/conftest.py.jinja`

**Test app:** Wire SSE providers. No domain-specific SSE events needed.

**Mother project tests:** SSE callback endpoint, connection manager lifecycle, version service startup event.

**Validation:** Generate with `use_sse=true`. Run SSE tests. Generate without. Verify no SSE code.

### Step 6: All-flags validation

Generate the test app with **all flags enabled**. Run the full mother project test suite. This is the generated-test-app that lives in the repo.

Generate a project with **no flags** (only core). Verify it's a working minimal app.

Generate with every combination of flags (2^4 = 16 combinations). Verify each starts and passes basic health checks. This can be automated as a matrix test in CI.

---

## 8. The Generated Test App

The generated test app (`generated-test-app/`) is a real, functional app that exercises all template features. It exists in the mother project repo and is the target the mother project tests run against.

### Domain model

A single `Item` entity with enough complexity to exercise the template's patterns:

```python
class Item(db.Model):
    id: Mapped[str]                # 4-char auto-generated ID
    name: Mapped[str]
    description: Mapped[str | None]
    quantity: Mapped[int]
    category: Mapped[str | None]
    image_cas_url: Mapped[str | None]  # exercises S3/CAS
    created_at: Mapped[datetime]
    updated_at: Mapped[datetime]
```

### What it exercises

| Template feature | How the test app uses it |
|-----------------|-------------------------|
| Database + Alembic | Item table, migration, CRUD |
| OIDC | Items endpoint requires authentication |
| S3/CAS | Image upload on item creation |
| SSE | (wired but no domain events) |
| Error handling | RecordNotFoundException on missing items |
| Lifecycle | ItemService registers for STARTUP |
| Metrics | Item creation counter |
| CLI | `load-test-data` loads sample items |

### Maintenance

The test app is **not generated by CI** — it lives in the repo as committed code. When the template changes, the test app must be regenerated (or manually updated) and committed. This ensures the mother project tests always have a stable target.

---

## 9. Mother Project Test Suite

The mother project tests verify that template infrastructure works correctly. They run against the generated test app. They are never copied into user apps.

### Test organization

| Test file | What it verifies |
|-----------|-----------------|
| `test_error_handling.py` | Flask error handler registry, exception-to-HTTP mapping, correlation IDs, session rollback on error |
| `test_auth.py` | OIDC flow, @public endpoints, @allow_roles, token refresh, cookie handling |
| `test_health.py` | Readiness/liveness probes, drain mode |
| `test_metrics.py` | Prometheus endpoint, metric registration, polling |
| `test_lifecycle.py` | STARTUP event fires, PREPARE_SHUTDOWN/SHUTDOWN sequence, waiter timeout |
| `test_task_service.py` | Background task execution, shutdown drain |
| `test_sse.py` | SSE callback endpoint, connection tracking |
| `test_cli.py` | upgrade-db, load-test-data commands |
| `test_config.py` | Settings validation, feature flag groups |
| `test_template_generation.py` | Generate with various flag combinations, verify output |

### conftest.py (mother project)

Separate from the template conftest. Sets up the generated test app as the test target:

```python
import sys
sys.path.insert(0, "generated-test-app")

from app import create_app

@pytest.fixture
def app():
    return create_app(settings=test_settings)
```

### Test strategy

- Tests import from the generated test app, not from `template/`.
- Each test file is independent — can run in isolation.
- No domain assertions (no "Item has name X"). Only infrastructure assertions ("404 returns JSON with error key", "STARTUP event fires before requests").

---

## 10. Dependency Management

### pyproject.toml.jinja

The template's pyproject.toml uses Jinja to conditionally include dependencies:

```toml
[tool.poetry]
name = "{{ project_name }}"
description = "{{ project_description }}"
authors = ["{{ author_name }} <{{ author_email }}>"]

[tool.poetry.dependencies]
python = "^3.11"
flask = "^3.0.0"
pydantic = "^2.5.0"
pydantic-settings = "^2.1.0"
spectree = "^1.2.0"
flask-cors = "^4.0.0"
dependency-injector = "^4.48.1"
flask-log-request-id = "^0.10.1"
prometheus-flask-exporter = "^0.23.0"
waitress = "^3.0.0"
paste = "^3.10.1"
{% if use_database %}
flask-sqlalchemy = "^3.1.0"
alembic = "^1.13.0"
psycopg = {extras = ["binary"], version = "^3.1.0"}
{% endif %}
{% if use_oidc %}
pyjwt = "^2.11.0"
cryptography = "^46.0.4"
itsdangerous = "^2.1.0"
{% endif %}
{% if use_s3 %}
boto3 = "^1.34.0"
pillow = "^10.2.0"
python-magic = "^0.4.27"
{% endif %}
{% if use_sse %}
# (no additional dependencies — SSE uses stdlib + existing deps)
{% endif %}
```

### What's excluded from the template

These are EI-specific and not included in the template's pyproject.toml:
- `openai`, `anthropic` (AI features)
- `celery` (dead code, removed in R3)
- `beautifulsoup4` (domain-specific parsing)
- `reportlab` (PDF generation)
- `httpx` (used by AI functions)
- `requests` (used by domain services)
- `validators` (used by domain services)

Apps add their own domain dependencies after generation.

---

## 11. Porting the Electronics Inventory Backend

After the template is built and validated, port the EI backend to use it.

### Approach: Generate + overlay

1. **Generate** a new project from the template with all flags enabled:
   ```bash
   copier copy ./copier-flask-template ./electronics-inventory-new \
     --data project_name=electronics-inventory-backend \
     --data use_database=true \
     --data use_oidc=true \
     --data use_s3=true \
     --data use_sse=true
   ```

2. **Copy app-maintained files** from the refactored EI backend into the generated project:
   - `app/startup.py` (replace scaffold with EI's hooks)
   - `app/services/container.py` (replace scaffold with EI's full container)
   - `app/exceptions.py` (replace with EI's full exception hierarchy)
   - All domain code: `app/models/`, `app/schemas/`, `app/api/` domain blueprints, `app/services/` domain services
   - `app/utils/` app-specific utils (file_parsers, url_interceptors, url_metadata, ai/)
   - `app/data/` (setup data, test data)
   - `alembic/versions/` (existing migrations)
   - `tests/` (existing test files — keep alongside template conftest)

3. **Verify template-maintained files** match the refactored EI backend. Since the template was extracted from EI, they should be identical. Diff and resolve any discrepancies.

4. **Run the full EI test suite.** All existing tests must pass. If they don't, the template extraction introduced a regression — fix it in the template and re-generate.

5. **Initialize Copier tracking:**
   ```bash
   cd electronics-inventory-new
   copier update --trust  # Creates .copier-answers.yml
   ```

### Alternative: In-place adoption

Instead of generating a new project, apply Copier to the existing EI repo:

```bash
cd /work/ElectronicsInventory/backend
copier copy ./copier-flask-template . --overwrite
```

This overwrites template-maintained files and creates `.copier-answers.yml`. App-maintained files (in `_skip_if_exists`) are left untouched. This approach preserves git history but requires careful review of the overwritten files.

**Recommendation:** Use generate + overlay for the first port. It's cleaner and makes differences obvious. Switch to in-place for subsequent apps that already exist.

---

## 12. Template Update Workflow

### How copier update works

When the template is updated (new feature, bug fix, infrastructure change):

1. Developer runs `copier update` in their project.
2. Copier compares: (a) the template version the project was generated from, (b) the new template version, (c) the project's current files.
3. It performs a three-way merge. Clean merges apply automatically. Conflicts are marked with conflict markers (like git).
4. Developer resolves any conflicts and commits.

### What merges cleanly

- Template-maintained files the developer hasn't modified → automatic merge.
- New files added to the template → created in the project.
- Files removed from the template → flagged for review.

### What causes conflicts

- Template-maintained files the developer modified (e.g., added a monkey-patch to `create_app()`).
- Structural changes to template-maintained files (e.g., reordering `create_app()` steps).

### What's skipped

- App-maintained files (`_skip_if_exists`) → never touched by update.
- These files diverge freely from the template scaffold.

### Release notes

For each template release, publish a changelog that covers:

1. **Breaking changes** — What the developer needs to manually update in app-maintained files (container.py, startup.py, exceptions.py).
2. **New features** — What was added, what variables were introduced.
3. **Migration guide** — Step-by-step for changes that `copier update` can't handle automatically.

Breaking changes in app-maintained files (e.g., a new required provider in container.py, a new hook in startup.py) must be documented explicitly because `copier update` won't touch those files.

### Versioning

Tag template releases with semantic versioning. Copier tracks which version each project was generated from in `.copier-answers.yml`. This enables clean three-way merges across version jumps.

---

## 13. Risks and Mitigations

### Risk 1: Jinja rendering produces invalid Python

**Impact:** Generated project has syntax errors.
**Mitigation:** The all-flags test app is committed and tested in CI. Add a CI job that generates projects with every flag combination (16 total) and runs `python -m py_compile` on every `.py` file.

### Risk 2: Template-maintained files accumulate app-specific patches

**Impact:** `copier update` creates frequent merge conflicts.
**Mitigation:** Enforce discipline: app-specific code goes in app-maintained files only. If a developer needs to patch a template file, consider whether the template should provide a hook instead. Treat recurring patches as feature requests for the template.

### Risk 3: Container.py drift across apps

**Impact:** When the template adds a new infrastructure provider, existing apps must manually add it.
**Mitigation:** Release notes document required container changes. Provide a diff or code snippet the developer can apply. Accept that container.py is app-maintained and will require manual updates — this is the cost of avoiding inheritance.

### Risk 4: Test app falls out of sync with template

**Impact:** Mother project tests pass but template changes break real apps.
**Mitigation:** CI regenerates the test app from the template and diffs against the committed version. Any difference fails the build, forcing the developer to update the committed test app.

### Risk 5: Copier's three-way merge doesn't handle complex refactors

**Impact:** A large template refactor (e.g., restructuring create_app) produces unusable merge output.
**Mitigation:** For large structural changes, document a manual migration path. Consider bumping the major version and treating it as a "re-generate and overlay" event rather than a `copier update`.

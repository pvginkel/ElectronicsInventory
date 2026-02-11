# R3: Feature-Flagged Configuration — Technical Plan

## 0) Research Log & Findings

**Areas researched:**

1. **`app/config.py`** (lines 1--607) — Examined both the `Environment` class (raw env-var loading) and the `Settings` class (resolved app config), plus the `Settings.load()` factory and `FlaskConfig` DTO. The file currently has loose section comments (e.g., `# Flask settings`, `# Celery settings`) but no grouping that maps to Copier feature flags.

2. **Celery usage across the entire codebase** — Searched all files under `app/` and `tests/` for any reference to `celery`, `celery_broker_url`, or `celery_result_backend`. Findings:
   - `app/config.py:116-124` and `351-353` define the fields.
   - `app/config.py:543-544` passes them through in `Settings.load()`.
   - `tests/conftest.py:107-109` sets them in `_build_test_settings()`.
   - `tests/test_config.py:107-108` sets them in `test_settings_direct_construction`.
   - `.env.example:26-27` documents them.
   - No service, API endpoint, background worker, or any other runtime code reads these fields. They are confirmed dead code.

3. **Test fixtures constructing Settings objects** — Identified every call site that constructs `Settings(...)` directly. Most pass only a subset of fields (relying on defaults), so removing the Celery fields will only require updating the two explicit call sites above plus the config test that asserts direct construction.

4. **Copier template analysis** — `docs/copier_template_analysis.md` describes the broader refactoring roadmap. R3 is a preparatory refactoring that groups config fields by feature flag so the Copier template can wrap each group in `{% if use_X %}` Jinja blocks.

5. **Existing field groupings** — Current section comments in both `Environment` and `Settings` are informal and inconsistent. The plan maps every field to one of the Copier feature groups: core (always present), `use_database`, `use_oidc`, `use_s3`, `use_sse`, or app-specific.

**Conflicts and resolutions:**

- The `diagnostics_*` fields relate to database query profiling but also to general request timing. Since they only function with a database present, they are grouped under `use_database`.
- The `drain_auth_key` and `graceful_shutdown_timeout` fields are infrastructure concerns that exist regardless of feature flags. They belong in core.
- The `baseurl` field is used by OIDC cookie configuration but is also a general app URL. Since its only consumer in the codebase is OIDC cookie secure inference (`Settings.load()` line 513), it is grouped under `use_oidc`.
- The `cors_origins` field is always needed (it configures Flask-CORS for the BFF). It belongs in core.

---

## 1) Intent & Scope

**User intent**

Prepare `app/config.py` for Copier template extraction by removing dead Celery configuration and reorganizing all config fields under clear section comments that map to Copier feature flags.

**Prompt quotes**

"Remove dead Celery config -- `CELERY_BROKER_URL` and `CELERY_RESULT_BACKEND` fields exist in both `Environment` and `Settings` but are never referenced anywhere in the application."

"Group config by feature -- Organize configuration fields with clear section comments that map each group to a Copier feature flag (`use_database`, `use_oidc`, `use_s3`, `use_sse`)."

"This is a pure refactoring of `app/config.py` -- no behavior changes, no new features."

**In scope**

- Delete `CELERY_BROKER_URL` and `CELERY_RESULT_BACKEND` from `Environment`, `Settings`, and `Settings.load()`
- Remove Celery fields from test fixtures that construct `Settings` objects
- Remove Celery lines from `.env.example`
- Reorganize fields in `Environment` and `Settings` with section comments that map to feature flags: core, `use_database`, `use_oidc`, `use_s3`, `use_sse`, and app-specific
- Reorder field assignments in `Settings.load()` to match the new grouping
- Verify all existing tests pass

**Out of scope**

- Adding Jinja template blocks or Copier configuration
- Changing any runtime behavior or adding new fields
- Modifying services, API endpoints, or models
- Changing the `FlaskConfig` DTO or `validate_production_config()` logic

**Assumptions / constraints**

- The Celery fields are truly dead code. The grep across the full codebase confirms no runtime consumer exists.
- The field grouping is a comment-level reorganization. Field order within a Pydantic model does not affect behavior.
- All test fixtures that construct `Settings(...)` with explicit Celery fields will be updated to remove those arguments.

---

## 1a) User Requirements Checklist

**User Requirements Checklist**

- [ ] Remove dead Celery config (`CELERY_BROKER_URL`, `CELERY_RESULT_BACKEND`) from both `Environment` and `Settings` classes, and from `Settings.load()`
- [ ] Remove Celery fields from test fixtures that construct Settings objects
- [ ] Group config fields in both `Environment` and `Settings` with clear section comments mapping to Copier feature flags
- [ ] Config groups map to: core (always present), `use_database`, `use_oidc`, `use_s3`, `use_sse`, and app-specific
- [ ] No behavioral changes — all existing functionality remains intact
- [ ] All existing tests pass after the refactoring

---

## 2) Affected Areas & File Map

- Area: `app/config.py` / `Environment` class
- Why: Remove Celery fields and reorganize all fields with feature-flag section comments.
- Evidence: `app/config.py:116-124` — `CELERY_BROKER_URL` and `CELERY_RESULT_BACKEND` field definitions. Lines 28-306 contain all `Environment` fields with loose grouping.

- Area: `app/config.py` / `Settings` class
- Why: Remove Celery fields and reorganize all fields with feature-flag section comments.
- Evidence: `app/config.py:351-353` — `celery_broker_url` and `celery_result_backend` field definitions. Lines 309-416 contain all `Settings` fields.

- Area: `app/config.py` / `Settings.load()` method
- Why: Remove Celery field assignments from the `cls(...)` constructor call and reorder remaining assignments to match the new grouping.
- Evidence: `app/config.py:543-544` — `celery_broker_url=env.CELERY_BROKER_URL` and `celery_result_backend=env.CELERY_RESULT_BACKEND` in the return statement.

- Area: `tests/conftest.py` / `_build_test_settings()` function
- Why: Remove `celery_broker_url` and `celery_result_backend` keyword arguments from the `Settings(...)` constructor call.
- Evidence: `tests/conftest.py:107-109` — `celery_broker_url="pyamqp://guest@localhost//"` and `celery_result_backend="db+postgresql+psycopg://..."`.

- Area: `tests/test_config.py` / `test_settings_direct_construction()` function
- Why: Remove `celery_broker_url` and `celery_result_backend` keyword arguments from the `Settings(...)` constructor call.
- Evidence: `tests/test_config.py:107-108` — `celery_broker_url="pyamqp://guest@localhost//"` and `celery_result_backend="db+postgresql+psycopg://..."`.

- Area: `.env.example`
- Why: Remove the Celery environment variable documentation lines.
- Evidence: `.env.example:25-27` — `# Celery configuration`, `CELERY_BROKER_URL=...`, `CELERY_RESULT_BACKEND=...`.

---

## 3) Data Model / Contracts

- Entity / contract: `Environment` (Pydantic BaseSettings)
- Shape: Remove `CELERY_BROKER_URL: str` and `CELERY_RESULT_BACKEND: str`. All other fields remain unchanged; only their ordering and section comments change.
- Refactor strategy: Straight deletion. No consumers exist. No backwards compatibility needed (BFF pattern per CLAUDE.md).
- Evidence: `app/config.py:116-124` — the two field definitions with their `Field(...)` metadata.

- Entity / contract: `Settings` (Pydantic BaseModel)
- Shape: Remove `celery_broker_url: str` and `celery_result_backend: str`. All other fields remain unchanged; only their ordering and section comments change.
- Refactor strategy: Straight deletion. Test fixtures that pass these fields explicitly will be updated to remove the arguments. Fixtures that rely on defaults are unaffected.
- Evidence: `app/config.py:351-353` — the two field definitions with default values.

---

## 4) API / Integration Surface

No API, CLI, or integration surface changes. This is a config-file-only refactoring. No endpoints, background jobs, or external contracts are affected.

---

## 5) Algorithms & State Machines

- Flow: `Settings.load()` configuration resolution
- Steps:
  1. Load `Environment` from env vars (or accept injected instance).
  2. Compute derived values: `sse_heartbeat_interval`, `ai_testing_mode`, `oidc_audience`, `oidc_cookie_secure`.
  3. Build `sqlalchemy_engine_options` dict.
  4. Construct `Settings(...)` with all resolved values.
- States / transitions: None. This is a straight-line factory method.
- Hotspots: None. Called once at startup.
- Evidence: `app/config.py:479-586` — the entire `Settings.load()` method.

The algorithm is unchanged. The only modification is removing two keyword arguments (`celery_broker_url`, `celery_result_backend`) from step 4 and reordering the remaining arguments to match the new feature-flag grouping.

---

## 6) Derived State & Invariants

This refactoring does not introduce, modify, or remove any derived state. The existing derived values (`sse_heartbeat_interval`, `ai_testing_mode`, `oidc_audience`, `oidc_cookie_secure`, `sqlalchemy_engine_options`) are untouched.

Justification for "none new": The change is purely structural (field deletion and comment reorganization). No new fields, no new derivation logic, no new persistence effects.

The three existing derived values that matter:

- Derived value: `sse_heartbeat_interval`
  - Source: `env.FLASK_ENV` and `env.SSE_HEARTBEAT_INTERVAL`
  - Writes / cleanup: None; read-only config consumed by SSE service.
  - Guards: Hardcoded to 30 for production; otherwise uses env value.
  - Invariant: Must equal 30 when `flask_env == "production"`.
  - Evidence: `app/config.py:498-501`

- Derived value: `ai_testing_mode`
  - Source: `env.FLASK_ENV` and `env.AI_TESTING_MODE`
  - Writes / cleanup: None; read-only config consumed by AI service.
  - Guards: Forced to `True` when `flask_env == "testing"`.
  - Invariant: Must be `True` in testing environment regardless of explicit setting.
  - Evidence: `app/config.py:504`

- Derived value: `oidc_cookie_secure`
  - Source: `env.OIDC_COOKIE_SECURE` and `env.BASEURL`
  - Writes / cleanup: None; read-only config consumed by auth middleware.
  - Guards: Explicit setting takes priority; otherwise inferred from HTTPS prefix.
  - Invariant: Must be `True` when `BASEURL` starts with `https://` and no explicit override.
  - Evidence: `app/config.py:510-513`

---

## 7) Consistency, Transactions & Concurrency

- Transaction scope: Not applicable. This change affects only configuration loading at startup. No database transactions, no session usage.
- Atomic requirements: None. Configuration is loaded once and immutably stored.
- Retry / idempotency: Not applicable.
- Ordering / concurrency controls: Not applicable.
- Evidence: `app/config.py:479-586` — `Settings.load()` runs once during `create_app()`.

---

## 8) Errors & Edge Cases

- Failure: A test fixture still passes `celery_broker_url=...` after the field is removed.
- Surface: Test collection / Pydantic validation at test startup.
- Handling: Pydantic will raise `ValidationError` for unexpected keyword arguments since `Settings` does not set `extra="allow"`. This will be caught immediately during test runs.
- Guardrails: The grep-based audit (section 0) identified exactly two test call sites. Both will be updated.
- Evidence: `tests/conftest.py:107-109`, `tests/test_config.py:107-108`

- Failure: A `.env` file in a developer's local environment still sets `CELERY_BROKER_URL`.
- Surface: `Environment` class Pydantic loading.
- Handling: `Environment` uses `extra="ignore"` (`app/config.py:39`), so unrecognized env vars are silently ignored. No error will occur.
- Guardrails: The `extra="ignore"` setting is already in place. `.env.example` will be updated to remove the Celery lines, guiding developers to clean up.
- Evidence: `app/config.py:35-40` — `SettingsConfigDict(extra="ignore")`

---

## 9) Observability / Telemetry

No observability changes. This refactoring does not add, remove, or modify any metrics, logs, or traces. No runtime behavior changes.

---

## 10) Background Work & Shutdown

No background work or shutdown changes. Celery was dead code; its removal does not affect any running workers or lifecycle hooks.

---

## 11) Security & Permissions

Not applicable. No authentication, authorization, or data exposure changes. The removed Celery fields contained connection strings that were never used at runtime.

---

## 12) UX / UI Impact

Not applicable. This is a backend config refactoring with no frontend impact.

---

## 13) Deterministic Test Plan

- Surface: `app/config.py` — `Environment` and `Settings` classes
- Scenarios:
  - Given the existing test suite, When all tests are run after the refactoring, Then all tests pass with identical behavior (no Celery-related assertions exist since the fields were never consumed).
  - Given `tests/test_config.py::test_settings_direct_construction`, When the Celery keyword arguments are removed from the constructor call, Then the test still validates all remaining fields and passes.
  - Given `tests/test_config.py::test_environment_defaults`, When `Environment()` is constructed, Then no `CELERY_BROKER_URL` or `CELERY_RESULT_BACKEND` attributes exist on the instance.
  - Given `tests/conftest.py::_build_test_settings`, When the Celery keyword arguments are removed, Then the returned `Settings` object is valid and all downstream test fixtures function correctly.
  - Given a developer's `.env` file still containing `CELERY_BROKER_URL=...`, When `Environment()` is loaded, Then the unknown variable is silently ignored (due to `extra="ignore"`).
- Fixtures / hooks: No new fixtures needed. Existing fixtures (`test_settings`, `_build_test_settings`) are updated by removing two keyword arguments each.
- Gaps: None. The refactoring is purely subtractive and structural. No new behavior to test.
- Evidence: `tests/test_config.py:86-137` — `test_settings_direct_construction`. `tests/conftest.py:79-155` — `_build_test_settings`.

---

## 14) Implementation Slices

This is a small, single-slice change. No phased delivery is needed.

- Slice: Remove Celery and regroup config
- Goal: Clean, feature-flag-organized config ready for Copier template extraction.
- Touches: `app/config.py`, `tests/conftest.py`, `tests/test_config.py`, `.env.example`
- Dependencies: None. This is independent of other R-series refactorings.

---

## 15) Risks & Open Questions

- Risk: A field is accidentally moved to the wrong feature-flag group, causing confusion during later Copier extraction.
- Impact: Low. Comments are advisory; the code still works. Wrong grouping would be caught during template extraction review.
- Mitigation: The field-to-group mapping is documented below for review.

- Risk: An undetected reference to Celery fields exists outside the searched paths (e.g., in a script or Dockerfile).
- Impact: Low. The grep covered all Python files. Dockerfiles and shell scripts do not reference Python config fields.
- Mitigation: Full-repo grep confirmed zero runtime references. `.env.example` is the only non-Python file affected.

- Risk: Reordering fields in `Settings` changes Pydantic serialization order in `model_dump()`.
- Impact: None. No code depends on field ordering in `model_dump()` output. JSON key order is not contractual.
- Mitigation: Pydantic field order affects `model_dump()` output order but not behavior. No consumer depends on this.

**Proposed field-to-group mapping:**

| Group | `Environment` fields | `Settings` fields |
|-------|---------------------|-------------------|
| **Core (always present)** | `SECRET_KEY`, `FLASK_ENV`, `DEBUG`, `CORS_ORIGINS`, `TASK_MAX_WORKERS`, `TASK_TIMEOUT_SECONDS`, `TASK_CLEANUP_INTERVAL_SECONDS`, `METRICS_UPDATE_INTERVAL`, `GRACEFUL_SHUTDOWN_TIMEOUT`, `DRAIN_AUTH_KEY` | `secret_key`, `flask_env`, `debug`, `cors_origins`, `task_max_workers`, `task_timeout_seconds`, `task_cleanup_interval_seconds`, `metrics_update_interval`, `graceful_shutdown_timeout`, `drain_auth_key` |
| **use_database** | `DATABASE_URL`, `DB_POOL_SIZE`, `DB_POOL_MAX_OVERFLOW`, `DB_POOL_TIMEOUT`, `DB_POOL_ECHO`, `DIAGNOSTICS_ENABLED`, `DIAGNOSTICS_SLOW_QUERY_THRESHOLD_MS`, `DIAGNOSTICS_SLOW_REQUEST_THRESHOLD_MS`, `DIAGNOSTICS_LOG_ALL_QUERIES` | `database_url`, `db_pool_size`, `db_pool_max_overflow`, `db_pool_timeout`, `db_pool_echo`, `diagnostics_enabled`, `diagnostics_slow_query_threshold_ms`, `diagnostics_slow_request_threshold_ms`, `diagnostics_log_all_queries`, `sqlalchemy_engine_options` (defaults to empty dict; populated via `load()` when database is configured) |
| **use_oidc** | `BASEURL`, `OIDC_ENABLED`, `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_SCOPES`, `OIDC_AUDIENCE`, `OIDC_CLOCK_SKEW_SECONDS`, `OIDC_COOKIE_NAME`, `OIDC_COOKIE_SECURE`, `OIDC_COOKIE_SAMESITE`, `OIDC_REFRESH_COOKIE_NAME` | `baseurl`, `oidc_enabled`, `oidc_issuer_url`, `oidc_client_id`, `oidc_client_secret`, `oidc_scopes`, `oidc_audience`, `oidc_clock_skew_seconds`, `oidc_cookie_name`, `oidc_cookie_secure`, `oidc_cookie_samesite`, `oidc_refresh_cookie_name` |
| **use_s3** | `S3_ENDPOINT_URL`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME`, `S3_REGION`, `S3_USE_SSL` | `s3_endpoint_url`, `s3_access_key_id`, `s3_secret_access_key`, `s3_bucket_name`, `s3_region`, `s3_use_ssl` |
| **use_sse** | `FRONTEND_VERSION_URL`, `SSE_HEARTBEAT_INTERVAL`, `SSE_GATEWAY_URL`, `SSE_CALLBACK_SECRET` | `frontend_version_url`, `sse_heartbeat_interval`, `sse_gateway_url`, `sse_callback_secret` |
| **App-specific** | `MAX_IMAGE_SIZE`, `MAX_FILE_SIZE`, `ALLOWED_IMAGE_TYPES`, `ALLOWED_FILE_TYPES`, `THUMBNAIL_STORAGE_PATH`, `DOWNLOAD_CACHE_BASE_PATH`, `DOWNLOAD_CACHE_CLEANUP_HOURS`, `AI_PROVIDER`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_REASONING_EFFORT`, `OPENAI_VERBOSITY`, `OPENAI_MAX_OUTPUT_TOKENS`, `AI_ANALYSIS_CACHE_PATH`, `AI_CLEANUP_CACHE_PATH`, `AI_TESTING_MODE`, `MOUSER_SEARCH_API_KEY` | `max_image_size`, `max_file_size`, `allowed_image_types`, `allowed_file_types`, `thumbnail_storage_path`, `download_cache_base_path`, `download_cache_cleanup_hours`, `ai_provider`, `openai_api_key`, `openai_model`, `openai_reasoning_effort`, `openai_verbosity`, `openai_max_output_tokens`, `ai_analysis_cache_path`, `ai_cleanup_cache_path`, `ai_testing_mode`, `mouser_search_api_key` |

No open questions remain. All ambiguities were resolved during research (see section 0, "Conflicts and resolutions").

---

## 16) Confidence

Confidence: High — This is a straightforward deletion of confirmed dead code and a comment-level reorganization of existing fields, with exactly four files to modify and zero behavioral changes.

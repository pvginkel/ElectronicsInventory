# R3: Feature-Flagged Configuration — Requirements Verification

## Summary

All 6 checklist items from plan section 1a have been verified as **PASS**.

## Checklist Verification

### 1. Remove dead Celery config from Environment, Settings, and Settings.load()
**Status: PASS**

- Codebase-wide grep for `celery` and `CELERY` in `*.py` files returns zero results in `app/config.py`.
- `Environment` class (`app/config.py:37-250`): no `CELERY_BROKER_URL` or `CELERY_RESULT_BACKEND` fields.
- `Settings` class (`app/config.py:302-394`): no `celery_broker_url` or `celery_result_backend` fields.
- `Settings.load()` (`app/config.py:468-577`): no celery parameters in the `cls(...)` constructor call.
- `.env.example`: Celery lines removed.

### 2. Remove Celery fields from test fixtures that construct Settings objects
**Status: PASS**

- `tests/conftest.py::_build_test_settings()`: no celery keyword arguments present.
- `tests/test_config.py::test_settings_direct_construction()`: no celery keyword arguments present.

### 3. Group config fields with clear section comments mapping to Copier feature flags
**Status: PASS**

Section comments verified in both classes:
- `Environment`: "Core (always present)", "Database (use_database)", "OIDC Authentication (use_oidc)", "S3/Ceph storage (use_s3)", "SSE (use_sse)", "App-specific"
- `Settings`: Matching section comments with identical grouping.
- `Settings.load()`: Field assignments reordered to match grouping.

### 4. Config groups map to: core, use_database, use_oidc, use_s3, use_sse, and app-specific
**Status: PASS**

All fields verified against the mapping table in plan section 15:
- Core: SECRET_KEY, FLASK_ENV, DEBUG, CORS_ORIGINS, task/metrics/shutdown settings
- use_database: DATABASE_URL, pool settings, diagnostics, sqlalchemy_engine_options
- use_oidc: BASEURL, all OIDC_* settings
- use_s3: all S3_* settings
- use_sse: FRONTEND_VERSION_URL, SSE_* settings
- App-specific: document processing, download cache, AI, Mouser

### 5. No behavioral changes
**Status: PASS**

- All derived value computations unchanged (sse_heartbeat_interval, ai_testing_mode, oidc_audience, oidc_cookie_secure, sqlalchemy_engine_options).
- All properties unchanged (is_testing, is_production, real_ai_allowed).
- `validate_production_config()` and `to_flask_config()` unchanged.
- `FlaskConfig` DTO unchanged.

### 6. All existing tests pass after the refactoring
**Status: PASS**

- `tests/test_config.py`: 24/24 passed
- Auth tests (102 tests): all passed
- ruff check: clean on all modified files
- mypy: clean on all modified files

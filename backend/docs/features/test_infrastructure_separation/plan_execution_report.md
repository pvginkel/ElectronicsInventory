# Plan Execution Report: Test Infrastructure Separation (R5)

## Status

**DONE** -- The plan was implemented successfully. All requirements verified, code review passed with GO, all tests pass.

## Summary

Implemented R5 (Test Infrastructure Separation) from the Copier template analysis. The refactoring prepares the test infrastructure for clean extraction into a Copier template by:

1. **Replacing hardcoded service shutdown with lifecycle coordinator** -- The `app`, `oidc_app`, and `sse_server` fixture teardowns now use a single `app.container.lifecycle_coordinator().shutdown()` call instead of three hardcoded per-service shutdown calls. This is more thorough (covers all registered services, not just three hardcoded ones) and fixed a latent bug where `TempFileManager.stop_cleanup_thread()` was silently failing because the method is actually private (`_stop_cleanup_thread()`).

2. **Separating domain fixtures from infrastructure fixtures** -- Domain-specific fixtures (`sample_part`, `make_attachment_set`, `make_attachment_set_flask`, document/image test fixtures) were moved from `tests/conftest.py` and `tests/test_document_fixtures.py` into a new `tests/domain_fixtures.py` file. Infrastructure fixtures (app creation, session management, Prometheus cleanup, OIDC mocking, SSE server) remain in `tests/conftest.py`, ready for template extraction.

### Files Changed

| File | Action | Description |
|------|--------|-------------|
| `tests/conftest.py` | Modified | Lifecycle coordinator shutdown in 3 fixtures; removed domain fixture definitions; updated import block |
| `tests/test_document_fixtures.py` | Deleted | Content moved to domain_fixtures.py |
| `tests/domain_fixtures.py` | Created | Combined domain fixtures from conftest.py and test_document_fixtures.py |

## Code Review Summary

- **Decision:** GO
- **Confidence:** High
- **Blocker:** 0
- **Major:** 0
- **Minor:** 2 (both resolved)
  1. Over-cautious comment about VersionService mock ordering -- simplified
  2. AttachmentSet import hoisting -- noted as improvement, no change needed

## Verification Results

### Linting (`poetry run ruff check .`)
3 pre-existing errors in unrelated files. No new errors from this change.

### Type Checking (`poetry run mypy .`)
```
Success: no issues found in 276 source files
```

### Test Suite (`poetry run pytest`)
```
1350 passed, 4 skipped, 30 deselected, 3 warnings in 283.05s
```

### Requirements Verification
All 7 checklist items from section 1a of the plan verified as PASS.

## Outstanding Work & Suggested Improvements

No outstanding work required. The refactoring is complete and all tests pass.

For future reference when creating the Copier template:
- The S3 availability check in `pytest_configure()` will need to be wrapped in a `{% if use_s3 %}` Jinja conditional in the template conftest
- The `_build_test_settings()` function contains both infrastructure and domain-specific settings (AI, Mouser) -- the template version will only include infrastructure settings
- The OIDC fixtures (`mock_oidc_discovery`, `mock_jwks`, `generate_test_jwt`, `oidc_app`) will go behind `{% if use_oidc %}` in the template conftest
- The SSE fixtures will go behind `{% if use_sse %}` in the template conftest

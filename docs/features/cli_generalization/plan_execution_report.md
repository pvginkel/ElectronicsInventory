# Plan Execution Report: CLI Generalization (R6)

## Status

**DONE** -- The plan was implemented successfully. All requirements verified, code review passed with GO.

## Summary

Extracted all domain-specific logic from `app/cli.py` into two new hook functions in `app/startup.py`, making the CLI module suitable as a Copier template skeleton with zero domain model imports. The refactoring is mechanical and preserves all existing behavior identically.

### What was implemented

1. **`post_migration_hook(app)` in `app/startup.py`** -- Syncs master data (electronics part types) after database migrations. Non-fatal error handling: catches exceptions and prints a warning.

2. **`load_test_data_hook(app)` in `app/startup.py`** -- Syncs master data, loads test dataset via `TestDataService.load_full_dataset()`, resets PostgreSQL `boxes_box_no_seq` sequence, and prints a formatted dataset summary. Fatal error handling: exceptions propagate to the CLI handler.

3. **Refactored `app/cli.py`** -- Removed all 14 domain model imports, `sync_master_data_from_setup` import, and `import sqlalchemy as sa`. Both `handle_upgrade_db` and `handle_load_test_data` now delegate to the hooks with single function calls.

4. **Rewrote `tests/test_cli.py`** -- 8 tests verifying CLI orchestration via monkeypatched hooks.

5. **Created `tests/test_startup.py`** -- 9 tests verifying hook internals (session lifecycle, error handling, dialect-specific behavior).

### Files changed

| File | Change |
|------|--------|
| `app/startup.py` | Added `post_migration_hook`, `load_test_data_hook`, domain model imports |
| `app/cli.py` | Replaced inline domain logic with hook calls, removed domain imports |
| `tests/test_cli.py` | Rewritten for hook-based approach |
| `tests/test_startup.py` | New file with hook-level tests |

## Code Review Summary

- **Decision**: GO
- **Blockers**: 0
- **Majors**: 0
- **Minors**: 1 (Unicode escape sequences replacing literal emojis -- resolved)
- All findings resolved

## Verification Results

### Ruff
```
$ poetry run ruff check .
app/services/kit_service.py:418:9: F841 (pre-existing)
app/services/task_service.py:293:13: F841 (pre-existing)
tests/test_graceful_shutdown_integration.py:156:16: UP038 (pre-existing)
```
3 pre-existing errors only; no new issues introduced.

### Mypy
```
$ poetry run mypy .
Success: no issues found in 277 source files
```

### Test Suite
```
$ poetry run pytest tests/test_cli.py tests/test_startup.py -v
17 passed in 0.03s
```

Broader regression test (138 tests across 8 test files):
```
$ poetry run pytest tests/test_cli.py tests/test_startup.py tests/test_config.py tests/test_health_api.py tests/test_metrics_api.py tests/test_metrics_service.py tests/middleware/test_correlation_id.py tests/test_transaction_rollback.py -v
138 passed in 10.92s
```

### Requirements Verification
All 6 checklist items from the plan (section 1a) verified as PASS. See `requirements_verification.md`.

## Outstanding Work & Suggested Improvements

No outstanding work required. All plan requirements implemented, all code review findings resolved.

**Optional future improvements** (not required):
- The 15 domain model imports at module level in `app/startup.py` could be moved inside `load_test_data_hook()` to avoid loading them during normal app startup. The cost is negligible since models are already imported transitively, but it would be cleaner for the Copier template separation.
- The `post_migration_hook` warning-only error handling could be upgraded to use the `logging` module for better observability in production.

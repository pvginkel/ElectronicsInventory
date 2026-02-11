# Requirements Verification: CLI Generalization (R6)

**Status: ALL 6 REQUIREMENTS PASSED**

## Requirement 1: Move `sync_master_data_from_setup()` call from `handle_upgrade_db()` into post-migration hook in `app/startup.py`

**PASS**

- `app/startup.py:135-153` -- `post_migration_hook(app)` function implemented with non-fatal error handling
- `app/cli.py:144` -- Hook is called after migrations complete
- `tests/test_cli.py:103-116` -- CLI test verifies unconditional hook invocation
- `tests/test_startup.py:91-106` -- Hook-level test verifies sync and commit

## Requirement 2: Move all app-specific logic from `handle_load_test_data()` into hook in `app/startup.py`

**PASS**

- `app/startup.py:156-273` -- `load_test_data_hook(app)` contains all moved logic:
  - Lines 172-176: Master data sync
  - Lines 180-181: Test data service call
  - Lines 188-196: PostgreSQL sequence reset
  - Lines 200-270: Dataset summary with all 15 domain model queries
- `app/cli.py:187` -- Hook is called after database recreation
- `tests/test_startup.py:155-188` -- Success path test
- `tests/test_startup.py:190-215` -- Database-specific behavior tests

## Requirement 3: CLI template code has no domain model imports

**PASS**

- `app/cli.py:1-20` -- Only generic imports (argparse, sys, Flask, app.database functions, app.startup hooks)
- Zero matches for `from app.models` or `from app.services` in cli.py
- All 15 domain model imports moved to `app/startup.py:22-36`

## Requirement 4: CLI command skeletons remain as generic template code

**PASS**

- `app/cli.py:80-106` -- Safety checks and validation intact
- `app/cli.py:93-141` -- Progress reporting and database status checks intact
- All database operations use generic infrastructure from `app.database`
- CLI handlers contain only orchestration logic, zero domain dependencies

## Requirement 5: Update `tests/test_cli.py` to verify hook-based approach

**PASS**

- `tests/test_cli.py:30-92` -- `TestHandleLoadTestData` (4 tests)
- `tests/test_cli.py:100-168` -- `TestHandleUpgradeDb` (4 tests)
- Tests monkeypatch hooks instead of internal domain functions
- New `tests/test_startup.py` -- `TestPostMigrationHook` (3 tests) + `TestLoadTestDataHook` (6 tests)
- All 17 tests pass

## Requirement 6: `app/database.py` retains `sync_master_data_from_setup()` unchanged

**PASS**

- `app/database.py:177` -- Function preserved unchanged
- `app/startup.py:21` -- Hooks import it from database.py
- `app/cli.py` -- Zero direct calls to the function

# Change Brief: CLI Generalization (R6)

## Summary

Generalize the CLI commands (`upgrade-db` and `load-test-data`) in `app/cli.py` to separate template-generic infrastructure from app-specific domain logic, as part of the Copier template extraction preparation.

## Current State

`app/cli.py` contains two commands that mix generic database orchestration with Electronics Inventory-specific domain logic:

1. **`upgrade-db`** — Runs Alembic migrations (generic), then calls `sync_master_data_from_setup()` directly from `app/database.py` (app-specific: syncs electronics part types from `app/data/setup/types.txt`).

2. **`load-test-data`** — Recreates the database and applies migrations (generic), syncs master data (app-specific), loads test data via `TestDataService.load_full_dataset()` (app-specific), resets PostgreSQL sequences (app-specific), and prints a domain-specific summary with hardcoded model imports for 14+ EI domain models.

## Required Changes

### 6a: Post-Migration Hook

Move the `sync_master_data_from_setup()` call out of `handle_upgrade_db()` and into an app-specific hook in `app/startup.py`. The CLI command should call this hook after migrations complete, so the template code never imports or knows about `SetupService` or `types.txt`.

### 6b: Test Data Loading Generalization

Move the app-specific parts of `handle_load_test_data()` into hooks in `app/startup.py`:
- The master data sync call
- The `TestDataService.load_full_dataset()` call
- The PostgreSQL sequence reset
- The dataset summary (all 14+ domain model imports and count queries)

The CLI command skeleton (safety checks, DB recreation, progress reporting) stays as template code.

### Testing

Update `tests/test_cli.py` to verify the new hook-based approach works correctly. Ensure the existing test still passes and add coverage for the new hooks.

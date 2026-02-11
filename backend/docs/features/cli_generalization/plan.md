# Plan: CLI Generalization

## 0) Research Log & Findings

**Areas researched:**

- **`app/cli.py`** (lines 1-354): The two CLI commands `handle_upgrade_db` and `handle_load_test_data`. The file imports 14 domain models (lines 19-33) and `sync_master_data_from_setup` from `app/database.py` (line 16). The `handle_upgrade_db` function calls `sync_master_data_from_setup` directly at lines 160-168. The `handle_load_test_data` function contains all the domain-specific logic at lines 210-313: master data sync, `TestDataService.load_full_dataset()`, PostgreSQL sequence reset, and the full dataset summary with model-level queries.

- **`app/startup.py`** (lines 1-106): Already has the hook-based pattern with `create_container()`, `register_blueprints()`, and `register_error_handlers()`. This is the natural home for two new hooks: `post_migration_hook()` and `load_test_data_hook()`.

- **`app/database.py`** (lines 177-189): Contains `sync_master_data_from_setup()` which instantiates `SetupService` and calls `sync_types_from_setup()`. The change brief states this function stays in `app/database.py`; the CLI just stops calling it directly.

- **`app/__init__.py`** (lines 1-214): The app factory already calls hooks from `app/startup.py`. This file is not directly changed.

- **`app/services/container.py`** (lines 81-335): The `ServiceContainer` has `test_data_service` (line 146) and `setup_service` (line 119) providers, both Factory-scoped on `db_session`. The startup hooks will use the container from `app.container` to obtain these services.

- **`tests/test_cli.py`** (lines 1-68): Has one test (`test_handle_load_test_data_reports_target_database`) that monkeypatches `check_db_connection`, `upgrade_database`, and `sync_master_data_from_setup` and uses a `_DummySession` and `_DummyTestDataService`. This test will need updating because the CLI will no longer call `sync_master_data_from_setup` directly and the summary logic will move to the hook.

**Findings of special interest:**

- The current CLI already creates the Flask app with `skip_background_services=True` (line 333), so the container is available but background threads are not started. The hooks in `startup.py` can safely use `app.container` to get sessions and services.
- The `handle_load_test_data` function obtains a session via `app.container.session_maker()()` (line 211), which is a direct sessionmaker call -- not the `db_session` ContextLocalSingleton. The new hooks should follow this same pattern since they run outside of a request context.
- The PostgreSQL sequence reset (lines 223-232) uses raw SQL and the session bind's dialect name. This is domain-specific and belongs in the hook.

**Conflict resolution:**

- The change brief says `app/database.py` retains `sync_master_data_from_setup()` as-is. The hooks in `startup.py` will import and call it from there. The CLI will stop importing it.

---

## 1) Intent & Scope

**User intent**

Separate template-generic CLI infrastructure (argument parsing, safety checks, database recreation, progress reporting) from Electronics Inventory-specific domain logic (master data sync, test data loading, sequence resets, dataset summaries) so that `app/cli.py` can be used as a Copier template skeleton with no domain model imports.

**Prompt quotes**

"Move `sync_master_data_from_setup()` call from `handle_upgrade_db()` into an app-specific post-migration hook in `app/startup.py`"

"Move all app-specific logic from `handle_load_test_data()` (master data sync, test data loading, sequence reset, dataset summary) into a hook in `app/startup.py`"

"CLI template code (`app/cli.py`) should have no imports of domain models or domain-specific services"

**In scope**

- Add a `post_migration_hook(app)` function to `app/startup.py` that calls `sync_master_data_from_setup`
- Add a `load_test_data_hook(app)` function to `app/startup.py` that handles master data sync, test data loading, sequence reset, and dataset summary printing
- Refactor `handle_upgrade_db` and `handle_load_test_data` in `app/cli.py` to call these hooks instead of inlining domain logic
- Remove all domain model imports and `sync_master_data_from_setup` import from `app/cli.py`
- Update `tests/test_cli.py` for the hook-based approach

**Out of scope**

- Changes to `app/database.py` (the `sync_master_data_from_setup` function stays as-is)
- Changes to the service container or DI wiring
- Any other CLI commands or Copier template extraction work
- Changes to the `upgrade_database()` function itself

**Assumptions / constraints**

- The hooks will receive the Flask `app` object, which provides access to `app.container` for obtaining sessions and services.
- The hooks run inside `with app.app_context():` blocks, which are already established by the CLI handlers.
- `app/startup.py` is the project's designated extension point for app-specific hooks, as established by the existing pattern (`create_container`, `register_blueprints`, `register_error_handlers`).

---

## 1a) User Requirements Checklist

**User Requirements Checklist**

- [ ] Move `sync_master_data_from_setup()` call from `handle_upgrade_db()` into an app-specific post-migration hook in `app/startup.py`
- [ ] Move all app-specific logic from `handle_load_test_data()` (master data sync, test data loading, sequence reset, dataset summary) into a hook in `app/startup.py`
- [ ] CLI template code (`app/cli.py`) should have no imports of domain models or domain-specific services
- [ ] The CLI command skeletons (safety checks, DB recreation, progress reporting) remain as generic template code in `app/cli.py`
- [ ] Update `tests/test_cli.py` to verify the new hook-based approach works correctly
- [ ] `app/database.py` retains `sync_master_data_from_setup()` as-is (it is app-specific code that stays; the CLI just stops calling it directly)

---

## 2) Affected Areas & File Map (with repository evidence)

- Area: `app/startup.py` -- new functions `post_migration_hook` and `load_test_data_hook`
- Why: This is the designated extension point for app-specific hooks; it will receive the two new hook functions. Note: unlike the existing three hooks (called by `create_app()` in `app/__init__.py`), the two new hooks are called by the CLI handlers in `app/cli.py`. They share the same module because they are all app-specific code that differs between projects.
- Evidence: `app/startup.py:1-7` -- module docstring states "These functions are called by the template-owned create_app() factory at well-defined hook points." The docstring should be updated to also mention CLI hook points.

- Area: `app/cli.py` -- `handle_upgrade_db()` function
- Why: Must replace the inline `sync_master_data_from_setup` call (lines 160-168) with a call to `post_migration_hook`.
- Evidence: `app/cli.py:159-168` -- "Phase 2: Sync master data unconditionally" section with direct session creation and sync call.

- Area: `app/cli.py` -- `handle_load_test_data()` function
- Why: Must replace domain-specific logic (lines 213-313) with a call to `load_test_data_hook`.
- Evidence: `app/cli.py:210-313` -- master data sync, TestDataService call, sequence reset, and dataset summary with 14+ model imports.

- Area: `app/cli.py` -- module-level imports
- Why: Must remove all 14 domain model imports (lines 19-33) and the `sync_master_data_from_setup` import (line 16). Must add import for startup hooks.
- Evidence: `app/cli.py:12-33` -- imports of `sync_master_data_from_setup`, `Box`, `Kit`, `KitContent`, `KitPickList`, `KitPickListLine`, `KitShoppingListLink`, `Location`, `Part`, `PartLocation`, `QuantityHistory`, `Seller`, `ShoppingList`, `ShoppingListLine`, `ShoppingListSellerNote`, `Type`.

- Area: `tests/test_cli.py`
- Why: Current test monkeypatches `cli.sync_master_data_from_setup` and uses a `_DummyTestDataService` via the container stub. Test must be updated to monkeypatch the new hooks instead.
- Evidence: `tests/test_cli.py:62` -- `monkeypatch.setattr(cli, "sync_master_data_from_setup", lambda session: None)`

- Area: `tests/test_startup.py` (new file)
- Why: Hook-level unit tests for `post_migration_hook` and `load_test_data_hook` should live in a dedicated file mirroring the `app/startup.py` module, per the project convention that "tests mirror the `app/` structure in `tests/`".
- Evidence: `CLAUDE.md` (Test Organization) -- "Tests mirror the `app/` structure in `tests/`"

---

## 3) Data Model / Contracts

- Entity / contract: `post_migration_hook` callable signature
- Shape: `post_migration_hook(app: Flask) -> None` -- receives the Flask app, obtains a session from `app.container.session_maker()()`, calls `sync_master_data_from_setup(session)`, commits, and closes the session. Prints progress/status to stdout. **Error handling:** The entire sync operation is wrapped in try/except; on failure, a warning is printed and the hook returns normally (non-fatal). The session is always closed in a `finally` block.
- Refactor strategy: Direct replacement; no backwards compatibility needed. The CLI calls the hook unconditionally after migrations.
- Evidence: `app/cli.py:159-168` -- current inline logic that will be extracted.

- Entity / contract: `load_test_data_hook` callable signature
- Shape: `load_test_data_hook(app: Flask) -> None` -- receives the Flask app, obtains a session from `app.container.session_maker()()`, calls `sync_master_data_from_setup(session)`, invokes `test_data_service.load_full_dataset()`, resets PostgreSQL sequences, prints dataset summary, and closes the session. **Error handling:** Exceptions from any step (sync, test data load, sequence reset) propagate to the caller without being caught. The calling CLI handler (`handle_load_test_data`) catches exceptions and exits with code 1. This is intentionally different from `post_migration_hook` -- sync failure during test data loading is fatal because test data depends on the synced types. The session is always closed in a `finally` block.
- Refactor strategy: Direct replacement; no backwards compatibility needed. The CLI calls the hook after database recreation.
- Evidence: `app/cli.py:210-313` -- current inline logic that will be extracted.

**Session management note:** Both hooks create a manual session via `app.container.session_maker()()` for `sync_master_data_from_setup` and summary queries. However, `test_data_service` obtained from `app.container.test_data_service()` receives its session through the container's `db_session` ContextLocalSingleton (`app/services/container.py:87-89,146`), which is a separate session object. This dual-session pattern mirrors the existing code at `app/cli.py:211-220` and is intentional -- `test_data_service` needs its full DI-wired dependency chain (including `s3_service`), which is only available through the container. Do not consolidate these sessions.

No database schema changes, no new tables, no migrations required.

---

## 4) API / Integration Surface

- Surface: CLI command `upgrade-db`
- Inputs: `--recreate` flag, `--yes-i-am-sure` safety flag
- Outputs: Console output showing migration progress, master data sync status. Behavior is identical to current -- only the internal call path changes.
- Errors: Same as current: database connection failure exits with code 1; migration failure exits with code 1; master data sync failure prints warning but continues.
- Evidence: `app/cli.py:96-168` -- `handle_upgrade_db` function.

- Surface: CLI command `load-test-data`
- Inputs: `--yes-i-am-sure` safety flag
- Outputs: Console output showing database recreation, test data loading, and dataset summary. Behavior is identical to current.
- Errors: Same as current: database connection failure exits with code 1; missing safety flag exits with code 1; test data loading failure exits with code 1.
- Evidence: `app/cli.py:171-317` -- `handle_load_test_data` function.

---

## 5) Algorithms & State Machines (step-by-step)

- Flow: `handle_upgrade_db` with post-migration hook
- Steps:
  1. Check database connectivity; exit 1 on failure.
  2. Print target database URI.
  3. Validate `--recreate` / `--yes-i-am-sure` flags.
  4. Show current revision and pending migration count.
  5. If migrations are pending or `--recreate`, apply migrations via `upgrade_database()` (generic template code). Otherwise, print "up to date".
  6. **Unconditionally** call `post_migration_hook(app)` -- this runs regardless of whether migrations were applied or skipped. This is the single new step replacing the inline sync.
- States / transitions: None.
- Hotspots: None; this is a sequential CLI command.
- Evidence: `app/cli.py:96-168`

- Flow: `handle_load_test_data` with test data hook
- Steps:
  1. Check database connectivity; exit 1 on failure.
  2. Print target database URI.
  3. Validate `--yes-i-am-sure` flag.
  4. Call `upgrade_database(recreate=True)` and report progress (generic template code).
  5. Call `load_test_data_hook(app)` -- this single call replaces the inline master data sync, test data loading, sequence reset, and summary printing.
- States / transitions: None.
- Hotspots: None; this is a sequential CLI command.
- Evidence: `app/cli.py:171-317`

- Flow: `post_migration_hook` internals (in `app/startup.py`)
- Steps:
  1. Create a session via `app.container.session_maker()()`.
  2. Call `sync_master_data_from_setup(session)`.
  3. Commit the session.
  4. On failure, print a warning (non-fatal, same as current behavior).
  5. Close the session in a `finally` block.
- States / transitions: None.
- Hotspots: None.
- Evidence: `app/cli.py:160-168` -- current logic to be moved.

- Flow: `load_test_data_hook` internals (in `app/startup.py`)
- Steps:
  1. Create a session via `app.container.session_maker()()`.
  2. Call `sync_master_data_from_setup(session)` and commit. **No try/except** -- sync failure is fatal and propagates to the caller.
  3. Obtain `test_data_service` from `app.container.test_data_service()`. Note: `test_data_service` uses a different session (the container's `db_session` ContextLocalSingleton) -- this is the existing pattern and is intentional.
  4. Print "Loading fixed test dataset..." and call `test_data_service.load_full_dataset()`.
  5. Check if the database dialect is PostgreSQL; if so, reset the `boxes_box_no_seq` sequence.
  6. Print "Test data loaded successfully".
  7. Query all domain models for counts and print the formatted dataset summary.
  8. Close the session in a `finally` block.
- States / transitions: None.
- Hotspots: None.
- Evidence: `app/cli.py:210-313` -- current logic to be moved.

---

## 6) Derived State & Invariants (stacked bullets)

This is a pure code-organization refactoring with no new derived state. The three entries below document the invariants that must be preserved through the refactoring.

- Derived value: Master data (types) in database
  - Source: `app/data/setup/types.txt` parsed by `SetupService.sync_types_from_setup()`
  - Writes / cleanup: Inserts new `Type` rows into the database; idempotent.
  - Guards: `sync_master_data_from_setup` is called after every migration run (both `upgrade-db` and `load-test-data`). The hook must preserve this guarantee.
  - Invariant: After any CLI database command completes, all types from `types.txt` exist in the `types` table.
  - Evidence: `app/cli.py:162`, `app/database.py:177-189`

- Derived value: PostgreSQL `boxes_box_no_seq` sequence value
  - Source: Maximum `box_no` from the `boxes` table after test data load.
  - Writes / cleanup: `setval()` call aligns the sequence with loaded fixture data.
  - Guards: Only executes on PostgreSQL (dialect check). Must remain in the `load_test_data_hook`.
  - Invariant: After `load-test-data`, the next auto-generated `box_no` does not collide with loaded test data.
  - Evidence: `app/cli.py:223-232`

- Derived value: Dataset summary counts
  - Source: `session.query(Model).count()` for 15 domain models.
  - Writes / cleanup: Read-only; prints to stdout.
  - Guards: None needed (read-only operation).
  - Invariant: The summary is printed after test data loading completes and reflects the actual loaded state.
  - Evidence: `app/cli.py:236-310`

---

## 7) Consistency, Transactions & Concurrency

- Transaction scope: Each hook creates its own manual session via `session_maker()()`, performs work, and commits/closes. Same pattern as the current inline code. Note: `load_test_data_hook` operates with two sessions -- a manual session for `sync_master_data_from_setup`/commit/summary queries, and an implicit session via the container's `db_session` ContextLocalSingleton for `test_data_service`. This dual-session pattern is inherited from the existing code at `app/cli.py:211-220` and must be preserved to maintain `test_data_service`'s DI-wired dependency chain.
- Atomic requirements: `sync_master_data_from_setup` must flush within the same session that commits. `load_full_dataset()` handles its own transactional logic via its own session. These are preserved unchanged.
- Retry / idempotency: `sync_types_from_setup` is already idempotent (checks existing types before inserting). No change.
- Ordering / concurrency controls: CLI commands are single-threaded; no concurrency concerns. The hooks run sequentially within the CLI handler.
- Evidence: `app/cli.py:160-168` (upgrade-db session), `app/cli.py:211-313` (load-test-data session), `app/services/container.py:87-89,146` (db_session ContextLocalSingleton and test_data_service Factory), `app/services/setup_service.py:20-51` (idempotent sync).

---

## 8) Errors & Edge Cases

- Failure: Master data sync fails during `upgrade-db`
- Surface: `post_migration_hook` in `app/startup.py`
- Handling: Print warning message, do not exit. Same as current behavior at `app/cli.py:165`.
- Guardrails: The warning is visible in CLI output. The migration itself is already committed.
- Evidence: `app/cli.py:164-166` -- `except Exception as e: print(f"Warning: Failed to sync master data: {e}")`

- Failure: Master data sync fails during `load-test-data`
- Surface: `load_test_data_hook` in `app/startup.py`
- Handling: Let the exception propagate. The calling CLI handler catches it and exits with code 1. Same as current behavior at `app/cli.py:315-317`.
- Guardrails: The outer try/except in `handle_load_test_data` catches and reports the error.
- Evidence: `app/cli.py:315-317` -- `except Exception as e: print(f"Failed to load test data: {e}", file=sys.stderr)`

- Failure: `load_full_dataset()` fails (e.g., missing JSON files, S3 unavailable)
- Surface: `load_test_data_hook` in `app/startup.py`
- Handling: Exception propagates to the CLI handler, which exits with code 1. Same as current.
- Guardrails: Error message printed to stderr.
- Evidence: `app/cli.py:315-317`

- Failure: Hook import fails (typo, missing function)
- Surface: `app/cli.py` at import time
- Handling: Python ImportError at CLI startup. Caught immediately by the developer.
- Guardrails: Existing tests will fail if the hook function is missing or renamed.
- Evidence: N/A -- new risk introduced by the refactoring, mitigated by tests.

---

## 9) Observability / Telemetry

No new metrics, logs, or traces. This is a code-organization refactoring of CLI commands. The existing print statements (progress messages, warnings, summary) are preserved and moved to the hooks. No Prometheus metrics are involved in CLI commands.

---

## 10) Background Work & Shutdown

No background work or shutdown hooks are affected. The CLI already creates the Flask app with `skip_background_services=True` (`app/cli.py:333`), so no background threads are started. The new hooks in `app/startup.py` are synchronous functions called inline by the CLI handlers.

---

## 11) Security & Permissions

Not applicable. The CLI commands are local administrative operations with no authentication or authorization concerns.

---

## 12) UX / UI Impact

Not applicable. This is a backend-only CLI refactoring. The CLI commands produce identical user-visible output before and after the change. No frontend impact.

---

## 13) Deterministic Test Plan (new/changed behavior only)

- Surface: `handle_upgrade_db` via `post_migration_hook` (in `tests/test_cli.py`)
- Scenarios:
  - Given a Flask app with a stubbed container and a monkeypatched `post_migration_hook`, When `handle_upgrade_db` is called with no pending migrations, Then `post_migration_hook` is still called (master data sync is unconditional).
  - Given a Flask app with a stubbed container and a monkeypatched `post_migration_hook`, When `handle_upgrade_db` is called with migrations applied, Then `post_migration_hook` is called after migrations complete.
  - Given `post_migration_hook` raises an exception, When `handle_upgrade_db` calls it, Then the exception is caught and a warning is printed (non-fatal).
- Fixtures / hooks: Monkeypatch `app.startup.post_migration_hook` (or the imported reference in `cli`). Monkeypatch `check_db_connection`, `upgrade_database`, `get_current_revision`, `get_pending_migrations` as in the existing test pattern.
- Gaps: None.
- Evidence: `tests/test_cli.py:49-68` -- existing test pattern.

- Surface: `handle_load_test_data` via `load_test_data_hook` (in `tests/test_cli.py`)
- Scenarios:
  - Given a Flask app with a stubbed container and a monkeypatched `load_test_data_hook`, When `handle_load_test_data` is called with `confirmed=True`, Then the target database URI is printed, `upgrade_database(recreate=True)` is called, and `load_test_data_hook` is called.
  - Given `load_test_data_hook` raises an exception, When `handle_load_test_data` calls it, Then the error is printed to stderr and sys.exit(1) is called.
  - Given `confirmed=False`, When `handle_load_test_data` is called, Then it exits with code 1 before reaching the hook.
- Fixtures / hooks: Monkeypatch `app.startup.load_test_data_hook` (or the imported reference in `cli`). Monkeypatch `check_db_connection` and `upgrade_database`.
- Gaps: None.
- Evidence: `tests/test_cli.py:49-68` -- existing test; the `_DummyTestDataService` and `_DummySession` stubs may be simplified or removed since the hook abstracts the domain logic.

- Surface: `post_migration_hook` function in `app/startup.py` (in `tests/test_startup.py`)
- Scenarios:
  - Given a Flask app with a container that provides a working session and `sync_master_data_from_setup` succeeds, When `post_migration_hook` is called, Then master data is synced and the session is committed and closed.
  - Given `sync_master_data_from_setup` raises an exception, When `post_migration_hook` is called, Then a warning is printed and the session is closed (non-fatal).
- Fixtures / hooks: Monkeypatch `sync_master_data_from_setup` in the `app.startup` module (or `app.database`). Use a minimal Flask app with a stubbed container providing a dummy session.
- Gaps: None.
- Evidence: `app/cli.py:160-168` -- current behavior to replicate.

- Surface: `load_test_data_hook` function in `app/startup.py` (in `tests/test_startup.py`)
- Scenarios:
  - Given a Flask app with a container that provides a working session and test data service, When `load_test_data_hook` is called, Then master data is synced, test data is loaded, and a dataset summary is printed.
  - Given the database is PostgreSQL, When `load_test_data_hook` is called, Then the `boxes_box_no_seq` sequence is reset.
  - Given the database is SQLite, When `load_test_data_hook` is called, Then the sequence reset step is skipped (no error).
  - Given `sync_master_data_from_setup` raises an exception, When `load_test_data_hook` is called, Then the exception propagates (not caught) and the session is closed via `finally`.
- Fixtures / hooks: Monkeypatch `sync_master_data_from_setup`. Use a `_DummySession` and `_DummyTestDataService` (moved from the existing test or recreated). Stub `app.container.session_maker` and `app.container.test_data_service`.
- Gaps: None.
- Evidence: `app/cli.py:210-313` -- current behavior to replicate; `tests/test_cli.py:10-47` -- existing stubs.

---

## 14) Implementation Slices

- Slice: Add hooks to `app/startup.py`
- Goal: Create `post_migration_hook(app)` and `load_test_data_hook(app)` with the extracted domain logic.
- Touches: `app/startup.py`
- Dependencies: None; these are new functions that can be written first.

- Slice: Refactor `app/cli.py` to call hooks
- Goal: Replace inline domain logic with hook calls; remove all domain model imports.
- Touches: `app/cli.py`
- Dependencies: Depends on slice 1 (hooks must exist).

- Slice: Update tests
- Goal: Update `tests/test_cli.py` to monkeypatch hooks instead of domain functions; add hook-level unit tests in `tests/test_startup.py`.
- Touches: `tests/test_cli.py`, `tests/test_startup.py` (new file)
- Dependencies: Depends on slices 1 and 2.

---

## 15) Risks & Open Questions

- Risk: The `load_test_data_hook` session management differs subtly from the current inline code (e.g., commit timing, exception handling).
- Impact: Test data loading could fail or leave the database in an inconsistent state.
- Mitigation: Copy the session management pattern exactly from the current code. Run `load-test-data --yes-i-am-sure` against a real database after implementation.

- Risk: The `import sqlalchemy as sa` in `app/cli.py` (used for `sa.text()` in the sequence reset) is generic infrastructure, but it was only used for domain-specific logic. If not removed, it becomes a dead import.
- Impact: Linting failure from `ruff`.
- Mitigation: Remove the `import sqlalchemy as sa` from `app/cli.py` since it moves to `app/startup.py`.

- Risk: The existing test monkeypatches `cli.sync_master_data_from_setup` by name. After the refactoring, this attribute no longer exists on the `cli` module, which would cause the old test to fail if not updated.
- Impact: Test suite breakage.
- Mitigation: Update the test to monkeypatch the hook functions instead. This is covered in slice 3.

No open questions remain. All design decisions are straightforward extractions of existing code into hooks following the established pattern in `app/startup.py`.

---

## 16) Confidence

Confidence: High -- this is a mechanical extraction of existing, well-understood code into hooks following an established pattern already used by three other hooks in `app/startup.py`. No behavioral changes, no new data flows, no schema changes.

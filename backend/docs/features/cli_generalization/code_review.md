# Code Review: CLI Generalization (R6)

## 1) Summary & Decision

**Readiness**

This change cleanly extracts domain-specific logic from `app/cli.py` into two hook functions in `app/startup.py` (`post_migration_hook` and `load_test_data_hook`), achieving the stated goal of making the CLI module template-generic. The extraction is mechanical and preserves all existing behavior: session management patterns, error handling semantics (non-fatal in upgrade-db, fatal in load-test-data), PostgreSQL sequence resets, and the dataset summary. All 14 domain model imports and the `sync_master_data_from_setup` import have been removed from `app/cli.py`. The test suite has been completely rewritten with proper layering: CLI-level tests in `tests/test_cli.py` (8 tests) verify orchestration by monkeypatching the hooks, while hook-level tests in `tests/test_startup.py` (9 tests) exercise the hook internals with stubbed sessions and services. All 17 tests pass, ruff reports no issues, and mypy finds no type errors.

**Decision**

`GO` -- The implementation is a faithful, well-tested extraction that conforms to the plan. No blockers or major issues found.

## 2) Conformance to Plan (with evidence)

**Plan alignment**

- `Plan section 1 (Intent)` -- "CLI template code should have no imports of domain models or domain-specific services" ↔ `app/cli.py:1-17` -- The module now imports only from `app.database` (generic infrastructure) and `app.startup` (hook entry points). All 14 model imports and the `sync_master_data_from_setup` import have been removed, and `import sqlalchemy as sa` is gone.
- `Plan section 2 (File Map): app/startup.py new functions` ↔ `app/startup.py:135-273` -- Both `post_migration_hook` and `load_test_data_hook` are implemented with the exact signatures specified (`(app: Flask) -> None`).
- `Plan section 3 (Contracts): post_migration_hook non-fatal error handling` ↔ `app/startup.py:150-151` -- Exception is caught, warning printed, execution continues.
- `Plan section 3 (Contracts): load_test_data_hook fatal error handling` ↔ `app/startup.py:173-272` -- No try/except around sync or load calls; exceptions propagate to the CLI handler's outer try/except at `app/cli.py:189-191`.
- `Plan section 3 (Contracts): dual-session pattern` ↔ `app/startup.py:163-167,172,180` -- Manual session via `session_maker()()` for sync/summary; container-provided session for `test_data_service`. Docstring explicitly documents this.
- `Plan section 5 (Algorithms): upgrade-db unconditionally calls hook` ↔ `app/cli.py:143-144` -- `post_migration_hook(app)` is called outside any conditional block, after both the migration-applied and up-to-date branches.
- `Plan section 5 (Algorithms): load-test-data calls hook after recreation` ↔ `app/cli.py:186-187` -- `load_test_data_hook(app)` called after `upgrade_database(recreate=True)`.
- `Plan section 6 (Invariants): sequence reset preserved` ↔ `app/startup.py:183-196` -- PostgreSQL dialect check and `setval` call are faithfully moved from the original `app/cli.py:223-232`.
- `Plan section 13 (Test Plan): hook-level tests in tests/test_startup.py` ↔ `tests/test_startup.py:1-267` -- All planned scenarios are covered (success path, sync failure, test data failure, PostgreSQL sequence reset, SQLite skip, session cleanup on failure).
- `Plan section 13 (Test Plan): CLI-level tests in tests/test_cli.py` ↔ `tests/test_cli.py:1-169` -- All planned scenarios are covered (hook called unconditionally, hook called after migrations, hook failure exits, unconfirmed exits, target database printed).

**Gaps / deviations**

- `Plan section 2 (File Map): docstring update` -- The plan noted "The docstring should be updated to also mention CLI hook points." The implementation delivers this at `app/startup.py:1-16` with a comprehensive docstring listing both create_app() hooks and CLI hooks. No gap.
- No deviations from the plan were identified. The implementation is a faithful realization of all plan commitments.

## 3) Correctness -- Findings (ranked)

No Blocker or Major findings.

- Title: `Minor -- Unicode escape sequences replace literal emoji in CLI print statements`
- Evidence: `app/cli.py:88` -- `"\u274c Cannot connect to database..."` replaces what was previously a literal emoji character.
- Impact: Purely cosmetic. The rendered output is identical. This appears to be an automatic normalization (likely by the editor or formatter). All emoji characters throughout the file were converted to their `\uXXXX` or `\UXXXXXXXX` escape equivalents.
- Fix: None required. The output is visually identical.
- Confidence: High

## 4) Over-Engineering & Refactoring Opportunities

No over-engineering observed. The change is a minimal, mechanical extraction.

- Hotspot: `app/startup.py:199-270` -- The dataset summary block is ~70 lines of count queries and formatted printing.
- Evidence: `app/startup.py:199-270` -- 15 individual `session.query(Model).count()` calls followed by a multi-level formatted summary.
- Suggested refactor: This could be extracted into a private `_print_dataset_summary(session)` helper to keep `load_test_data_hook` focused on orchestration. However, this is inherited from the original code and does not represent newly introduced complexity.
- Payoff: Marginal readability improvement. Not a requirement for this change.

## 5) Style & Consistency

- Pattern: The hook functions in `app/startup.py` follow the same session lifecycle pattern as the original inline code in `app/cli.py`.
- Evidence: `app/startup.py:146-153` (`post_migration_hook`) and `app/startup.py:172-273` (`load_test_data_hook`) -- Both use `session_maker()()` with try/finally/close, matching the original pattern at the former `app/cli.py:160-168` and `app/cli.py:211-313`.
- Impact: Positive. The existing patterns are preserved without deviation.
- Recommendation: None required.

- Pattern: Test organization follows the project convention of mirroring `app/` structure in `tests/`.
- Evidence: `tests/test_startup.py` mirrors `app/startup.py`; `tests/test_cli.py` mirrors `app/cli.py`. The module docstrings clearly delineate responsibility: CLI tests verify orchestration, startup tests verify hook internals.
- Impact: Positive. Clean separation of concerns in tests.
- Recommendation: None required.

- Pattern: The `_DummySession` stub in `tests/test_startup.py` is richer than the old version in `tests/test_cli.py` (tracks `committed`, `closed`, `executed_statements`, configurable `dialect_name`).
- Evidence: `tests/test_startup.py:30-52` -- The stub is well-designed for the hook-level tests that need to verify session lifecycle.
- Impact: Positive. The old stubs in `tests/test_cli.py` are no longer needed because CLI tests only monkeypatch the hooks.
- Recommendation: None required.

## 6) Tests & Deterministic Coverage (new/changed behavior only)

- Surface: `post_migration_hook` (hook-level)
- Scenarios:
  - Given a working session and sync, When hook is called, Then sync is invoked, session is committed and closed (`tests/test_startup.py::TestPostMigrationHook::test_syncs_master_data_and_commits`)
  - Given sync raises, When hook is called, Then warning is printed and session is closed (`tests/test_startup.py::TestPostMigrationHook::test_sync_failure_prints_warning_and_continues`)
  - Given commit raises, When hook is called, Then session is still closed (`tests/test_startup.py::TestPostMigrationHook::test_session_closed_on_commit_failure`)
- Hooks: `_DummySession` stub with `committed`/`closed` tracking; monkeypatched `sync_master_data_from_setup`
- Gaps: None.
- Evidence: `tests/test_startup.py:88-144`

- Surface: `load_test_data_hook` (hook-level)
- Scenarios:
  - Given working session, service, and sync, When hook is called, Then sync runs, test data loads, summary is printed, session is closed (`tests/test_startup.py::TestLoadTestDataHook::test_success_path`)
  - Given PostgreSQL dialect, When hook is called, Then `setval` for `boxes_box_no_seq` is executed (`tests/test_startup.py::TestLoadTestDataHook::test_postgres_sequence_reset`)
  - Given SQLite dialect, When hook is called, Then sequence reset is skipped (`tests/test_startup.py::TestLoadTestDataHook::test_sqlite_skips_sequence_reset`)
  - Given sync raises, When hook is called, Then exception propagates and session is closed (`tests/test_startup.py::TestLoadTestDataHook::test_sync_failure_propagates`)
  - Given `load_full_dataset` raises, When hook is called, Then exception propagates and session is closed (`tests/test_startup.py::TestLoadTestDataHook::test_test_data_failure_propagates`)
  - Given summary queries raise, When hook is called, Then exception propagates and session is closed (`tests/test_startup.py::TestLoadTestDataHook::test_session_closed_on_summary_failure`)
- Hooks: `_DummySession` with configurable dialect and statement tracking; `_DummyTestDataService`; monkeypatched `sync_master_data_from_setup`
- Gaps: None.
- Evidence: `tests/test_startup.py:152-267`

- Surface: `handle_upgrade_db` (CLI-level)
- Scenarios:
  - Given no pending migrations, When handler runs, Then `post_migration_hook` is still called (`tests/test_cli.py::TestHandleUpgradeDb::test_calls_post_migration_hook_unconditionally`)
  - Given pending migrations, When handler runs, Then migrations are applied before hook (`tests/test_cli.py::TestHandleUpgradeDb::test_calls_post_migration_hook_after_migrations`)
  - Given any configuration, When handler runs, Then target database URI is printed (`tests/test_cli.py::TestHandleUpgradeDb::test_reports_target_database`)
  - Given `--recreate` without `--yes-i-am-sure`, When handler runs, Then exits with code 1 before hook (`tests/test_cli.py::TestHandleUpgradeDb::test_recreate_without_confirm_exits`)
- Hooks: Monkeypatched `check_db_connection`, `get_current_revision`, `get_pending_migrations`, `upgrade_database`, `post_migration_hook`
- Gaps: None.
- Evidence: `tests/test_cli.py:100-169`

- Surface: `handle_load_test_data` (CLI-level)
- Scenarios:
  - Given confirmed, When handler runs, Then target database URI is printed (`tests/test_cli.py::TestHandleLoadTestData::test_reports_target_database`)
  - Given confirmed, When handler runs, Then `load_test_data_hook` is called with the app (`tests/test_cli.py::TestHandleLoadTestData::test_calls_load_test_data_hook`)
  - Given hook raises, When handler runs, Then stderr shows error and exits with code 1 (`tests/test_cli.py::TestHandleLoadTestData::test_hook_failure_exits_with_code_1`)
  - Given unconfirmed, When handler runs, Then exits with code 1 before hook (`tests/test_cli.py::TestHandleLoadTestData::test_unconfirmed_exits_before_hook`)
- Hooks: Monkeypatched `check_db_connection`, `upgrade_database`, `load_test_data_hook`
- Gaps: None.
- Evidence: `tests/test_cli.py:30-92`

## 7) Adversarial Sweep

- Checks attempted: Session lifecycle (leak on exception), transaction scope (missing commit/rollback), DI wiring (hooks accessing container correctly), migrations/test data (schema drift), import breakage (removed imports still referenced), observability (metrics/timers)
- Evidence: `app/startup.py:146-153` (post_migration_hook session lifecycle), `app/startup.py:172-273` (load_test_data_hook session lifecycle), `app/cli.py:1-17` (clean imports), `tests/test_startup.py:129-144,217-267` (session-closed-on-failure tests)
- Why code held up:
  - **Session leak on exception:** Both hooks use try/finally with `session.close()`. The `post_migration_hook` catches all exceptions (non-fatal). The `load_test_data_hook` lets exceptions propagate but still closes the session in `finally`. Tests explicitly verify session closure in all failure paths (`test_session_closed_on_commit_failure`, `test_sync_failure_propagates`, `test_test_data_failure_propagates`, `test_session_closed_on_summary_failure`).
  - **Transaction scope:** `post_migration_hook` commits after sync; on failure the exception handler runs without committing (correct -- partial sync should not be committed). `load_test_data_hook` commits after sync, then delegates to `test_data_service` which manages its own session. The manual session is read-only for summary queries after that point.
  - **DI wiring:** The hooks access `app.container.session_maker()()` and `app.container.test_data_service()`, which are the same patterns used by the original inline code. No new DI providers are needed.
  - **Removed imports:** All 14 model imports and `sync_master_data_from_setup` were moved to `app/startup.py` and are no longer referenced in `app/cli.py`. The `import sqlalchemy as sa` was also correctly moved. Verified via `git diff` and ruff (no unused import warnings).
  - **Schema drift:** No schema changes; no migrations needed. `app/database.py` is untouched per the plan.
  - **Observability:** The CLI commands have no Prometheus metrics. Print statements are preserved faithfully (only the encoding changed from literal emoji to escape sequences, which render identically).

## 8) Invariants Checklist

- Invariant: After any `upgrade-db` run completes, all types from `types.txt` exist in the `types` table.
  - Where enforced: `app/startup.py:135-153` -- `post_migration_hook` calls `sync_master_data_from_setup(session)` unconditionally. `app/cli.py:143-144` -- hook is called outside any conditional block.
  - Failure mode: If `post_migration_hook` were placed inside the `if recreate or pending:` block, it would be skipped when no migrations are pending.
  - Protection: The hook call at `app/cli.py:144` is at the same indentation level as the `if`/`else` branches (outside both), ensuring it runs unconditionally. Test `test_calls_post_migration_hook_unconditionally` verifies this.
  - Evidence: `app/cli.py:122-144`, `tests/test_cli.py:103-116`

- Invariant: After `load-test-data`, the PostgreSQL `boxes_box_no_seq` sequence is aligned with the maximum loaded `box_no`.
  - Where enforced: `app/startup.py:183-196` -- dialect check and `setval` call.
  - Failure mode: If the dialect check were removed or inverted, the sequence would be out of sync, causing duplicate key errors on the next auto-generated box.
  - Protection: Tests `test_postgres_sequence_reset` and `test_sqlite_skips_sequence_reset` verify correct dialect-conditional behavior.
  - Evidence: `tests/test_startup.py:190-215`

- Invariant: Session is always closed after hook execution, regardless of success or failure.
  - Where enforced: `app/startup.py:152-153` (post_migration_hook finally block), `app/startup.py:272-273` (load_test_data_hook finally block).
  - Failure mode: If session.close() were outside the finally block, exceptions would leak sessions.
  - Protection: Five separate tests verify session closure on various failure paths: `test_session_closed_on_commit_failure`, `test_sync_failure_prints_warning_and_continues`, `test_sync_failure_propagates`, `test_test_data_failure_propagates`, `test_session_closed_on_summary_failure`.
  - Evidence: `tests/test_startup.py:129-144,108-127,217-231,233-249,251-267`

- Invariant: `app/cli.py` has no domain model imports (template-generic).
  - Where enforced: `app/cli.py:1-17` -- only imports from `app`, `app.database`, and `app.startup`.
  - Failure mode: If a domain import were accidentally re-added, the CLI could not be used as a Copier template skeleton.
  - Protection: Ruff linting passes with no unused imports. The `app.startup` import at `app/cli.py:17` is the sole bridge to domain-specific code.
  - Evidence: `app/cli.py:1-17`, ruff check output (clean)

## 9) Questions / Needs-Info

No unresolved questions. The change is a straightforward code extraction with no ambiguity in scope, behavior, or integration points.

## 10) Risks & Mitigations (top 3)

- Risk: The heavy model imports in `app/startup.py` (15 models at module level) could slow down `create_app()` for the three existing hooks that do not need them, since Python evaluates all module-level imports on first import.
- Mitigation: These models are already imported transitively during app startup (via blueprint registration and container creation). The incremental cost is negligible. If it becomes a concern in the future, the model imports could be made local to `load_test_data_hook`.
- Evidence: `app/startup.py:22-36`

- Risk: The dual-session pattern (manual session + container `db_session`) in `load_test_data_hook` is inherited complexity that could confuse future maintainers.
- Mitigation: The docstring at `app/startup.py:163-167` explicitly documents this pattern and why it exists. The plan (`plan.md` section 3) also explains it.
- Evidence: `app/startup.py:156-171`

- Risk: The `post_migration_hook` swallows all exceptions silently (only prints a warning). A persistent master data sync failure could go unnoticed.
- Mitigation: This is the existing behavior, deliberately preserved per the plan. The warning is printed to stdout. In a future iteration, this could be upgraded to a logging call for better observability.
- Evidence: `app/startup.py:150-151`

## 11) Confidence

Confidence: High -- This is a faithful, well-tested mechanical extraction with no behavioral changes. All 17 tests pass, ruff and mypy are clean, and the implementation matches the plan in every detail.

# Plan Review: CLI Generalization

## 1) Summary & Decision

**Readiness**

The plan is well-structured and correctly identifies the mechanical extraction of domain-specific logic from `app/cli.py` into hooks in `app/startup.py`. The research log accurately maps the affected files and their line ranges. The scope is conservative and appropriate for what is essentially a code-organization refactoring with no behavioral changes. The initial review identified two Major issues (inconsistent error handling contract between the two hooks, and undocumented dual-session pattern) and two Minor issues (algorithm step ambiguity and missing test file locations). All four have been resolved in the updated plan with explicit documentation of error handling asymmetry, session management strategy, unconditional hook invocation, and test file placement.

**Decision**

`GO` -- All conditions from the initial review have been addressed. The plan now has clear hook contracts with explicit error handling semantics, documented session management, unambiguous algorithm steps, and specified test file locations.

---

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `CLAUDE.md` (Code Organization Patterns) -- Pass -- `plan.md:83-85` -- Hooks placed in `app/startup.py`, which the plan correctly identifies as "the designated extension point for app-specific hooks" with evidence from the module docstring at `app/startup.py:1-6`. Plan now explicitly notes the different invocation pattern (CLI vs. app factory).
- `CLAUDE.md` (No tombstones / No backwards compat) -- Pass -- `plan.md:113,118` -- "Direct replacement; no backwards compatibility needed." All domain model imports are removed from `app/cli.py`, not left as re-exports.
- `CLAUDE.md` (Testing Requirements) -- Pass -- `plan.md:284-320` -- Test scenarios cover both hooks and both CLI handlers. All public methods get test coverage. Test file locations now specified: `tests/test_cli.py` for CLI handler tests, `tests/test_startup.py` for hook-level tests.
- `CLAUDE.md` (Dependency Injection) -- Pass -- `plan.md:15,121` -- Plan correctly notes the container provides `test_data_service` (Factory on `db_session`) and documents the dual-session pattern explicitly.
- `docs/product_brief.md` -- Pass -- Not directly relevant; this is an infrastructure refactoring with no domain behavior changes.
- `docs/commands/plan_feature.md` -- Pass -- All 16 required sections are present and populated.

**Fit with codebase**

- `app/startup.py` -- `plan.md:83-85` -- The plan now explicitly notes that the two new hooks are called by CLI handlers, not by `create_app()`, and recommends updating the module docstring to reflect this. This distinction is properly documented.
- `app/services/container.py:146` -- `plan.md:121` -- The dual-session pattern is now documented in section 3 with a dedicated "Session management note" and in section 7 (Consistency). The plan explicitly states "Do not consolidate these sessions."
- `tests/test_cli.py` -- `plan.md:99-101` -- The plan correctly identifies that the existing monkeypatch at `tests/test_cli.py:62` needs updating.

---

## 3) Open Questions & Ambiguities

All questions from the initial review have been resolved in the updated plan:

- The session management strategy is now explicitly documented in `plan.md:121` (section 3, Session management note) and `plan.md:224` (section 7).
- The unconditional hook invocation is now explicitly stated in `plan.md:152` with bold "Unconditionally" marker.
- Error handling asymmetry between hooks is now specified in `plan.md:112` (post_migration_hook: non-fatal) and `plan.md:117` (load_test_data_hook: fatal, propagates).

No new open questions.

---

## 4) Deterministic Backend Coverage (new/changed behavior only)

- Behavior: `post_migration_hook(app)` function in `app/startup.py`
- Scenarios:
  - Given a Flask app with a working session, When `post_migration_hook` is called and sync succeeds, Then master data is synced, session is committed, and session is closed (`tests/test_startup.py`)
  - Given sync raises an exception, When `post_migration_hook` is called, Then a warning is printed, session is closed, and the exception does not propagate (`tests/test_startup.py`)
- Instrumentation: None required (CLI command, no Prometheus metrics).
- Persistence hooks: No migrations needed. No test data changes.
- Gaps: None.
- Evidence: `plan.md:304-310`

- Behavior: `load_test_data_hook(app)` function in `app/startup.py`
- Scenarios:
  - Given a Flask app with working session and test data service, When `load_test_data_hook` is called, Then master data is synced, test data is loaded, sequence is reset (if PostgreSQL), and summary is printed (`tests/test_startup.py`)
  - Given PostgreSQL database, When hook runs, Then `boxes_box_no_seq` sequence is reset
  - Given SQLite database, When hook runs, Then sequence reset is skipped
  - Given `sync_master_data_from_setup` raises an exception, When `load_test_data_hook` is called, Then the exception propagates (not caught) and the session is closed via `finally` (`tests/test_startup.py`)
  - Given `load_full_dataset()` raises, When hook is called, Then the exception propagates to the caller
- Instrumentation: None required.
- Persistence hooks: No migrations needed. No test data changes.
- Gaps: None. The sync failure propagation scenario was added in the plan update at `plan.md:317`.
- Evidence: `plan.md:312-320`

- Behavior: `handle_upgrade_db` calling `post_migration_hook`
- Scenarios:
  - Given migrations applied, When `handle_upgrade_db` completes, Then `post_migration_hook` is called
  - Given no migrations needed, When `handle_upgrade_db` completes, Then `post_migration_hook` is still called (unconditional)
  - Given `post_migration_hook` raises, When `handle_upgrade_db` calls it, Then warning is printed (non-fatal)
- Instrumentation: None.
- Persistence hooks: None.
- Gaps: None.
- Evidence: `plan.md:286-293`

- Behavior: `handle_load_test_data` calling `load_test_data_hook`
- Scenarios:
  - Given `confirmed=True`, When `handle_load_test_data` runs, Then database is recreated and `load_test_data_hook` is called
  - Given hook raises, When `handle_load_test_data` runs, Then error is printed to stderr and exit(1)
  - Given `confirmed=False`, When `handle_load_test_data` runs, Then exit(1) before reaching hook
- Instrumentation: None.
- Persistence hooks: None.
- Gaps: None.
- Evidence: `plan.md:295-302`

---

## 5) Adversarial Sweep (must find >=3 credible issues or declare why none exist)

All findings from the initial review have been resolved. Documenting the attempted checks and why the plan holds:

- Checks attempted: Error handling asymmetry between `post_migration_hook` (non-fatal) and `load_test_data_hook` (fatal) for `sync_master_data_from_setup` failures.
- Evidence: `plan.md:112` specifies "wrapped in try/except; on failure, a warning is printed and the hook returns normally (non-fatal)." `plan.md:117` specifies "Exceptions from any step (sync, test data load, sequence reset) propagate to the caller without being caught." `plan.md:182` adds "No try/except -- sync failure is fatal and propagates to the caller."
- Why the plan holds: The error handling contract is now explicit and consistent across sections 3, 5, and 8.

- Checks attempted: Dual-session pattern (manual session vs. ContextLocalSingleton) leading to implementer confusion or incorrect session consolidation.
- Evidence: `plan.md:121` contains a dedicated "Session management note" explaining the pattern and ending with "Do not consolidate these sessions." `plan.md:183` notes the dual session in the algorithm. `plan.md:224` documents it in the Consistency section.
- Why the plan holds: The dual-session pattern is now documented in three locations with explicit warnings against consolidation.

- Checks attempted: Unconditional hook invocation in `handle_upgrade_db` being misread as conditional on migrations.
- Evidence: `plan.md:152` uses bold "Unconditionally" and adds "this runs regardless of whether migrations were applied or skipped."
- Why the plan holds: The algorithm step is now unambiguous.

- Checks attempted: Missing test file location for hook-level tests leading to tests only living in `test_cli.py`.
- Evidence: `plan.md:103-105` adds `tests/test_startup.py` as a new file in the affected areas. `plan.md:304,312` specify test file locations. `plan.md:337` specifies the test slice touches both files.
- Why the plan holds: Test organization is now explicit.

---

## 6) Derived-Value & Persistence Invariants (stacked entries)

- Derived value: Master data (types) in database
  - Source dataset: `app/data/setup/types.txt` (unfiltered, full file parse)
  - Write / cleanup triggered: INSERT of new `Type` rows via `SetupService.sync_types_from_setup()`
  - Guards: `sync_master_data_from_setup` called unconditionally after every migration (`post_migration_hook`) and at the start of test data loading (`load_test_data_hook`). Idempotent by design (checks existing types before inserting).
  - Invariant: After any CLI database command completes successfully, all types from `types.txt` exist in the `types` table.
  - Evidence: `plan.md:199-204`, `app/database.py:177-189`, `app/services/setup_service.py:20-51`

- Derived value: PostgreSQL `boxes_box_no_seq` sequence value
  - Source dataset: MAX(`box_no`) from `boxes` table (unfiltered, full table scan)
  - Write / cleanup triggered: `setval()` aligns the auto-increment sequence with loaded fixture data
  - Guards: Dialect check (`bind.dialect.name.startswith("postgres")`). Only executes in `load_test_data_hook`, not in `post_migration_hook`.
  - Invariant: After `load-test-data`, the next auto-generated `box_no` does not collide with loaded test data box numbers.
  - Evidence: `plan.md:206-211`, `app/cli.py:223-232`

- Derived value: Dataset summary counts
  - Source dataset: `session.query(Model).count()` for 15 domain models (unfiltered, full table counts)
  - Write / cleanup triggered: None (read-only, printed to stdout)
  - Guards: None needed. Runs after test data loading completes within the same session.
  - Invariant: Summary reflects the actual loaded state at the time of printing.
  - Evidence: `plan.md:213-218`, `app/cli.py:236-310`

All three entries use unfiltered source datasets. None drive persistent writes based on filtered views.

---

## 7) Risks & Mitigations (top 3)

- Risk: Session management in the hooks differs subtly from the current inline code (e.g., commit timing, finally-block cleanup).
- Mitigation: The plan now explicitly documents the session management pattern in section 3 and section 7, including the dual-session pattern and the requirement to close sessions in `finally` blocks. Implementation should copy the existing pattern exactly.
- Evidence: `plan.md:121,224`

- Risk: The existing test at `tests/test_cli.py:62` patches `cli.sync_master_data_from_setup`. After the refactoring, this import no longer exists on the `cli` module. If the test update is incomplete, the test suite will break.
- Mitigation: Covered in plan slice 3 (`plan.md:336-339`). The plan correctly identifies this risk at `plan.md:353-355`.
- Evidence: `plan.md:99-101`, `tests/test_cli.py:62`

- Risk: The `app/startup.py` module docstring describes hooks as "called by the template-owned create_app() factory" but the new hooks are called by CLI handlers.
- Mitigation: The plan at `plan.md:85` explicitly notes this and recommends updating the docstring.
- Evidence: `plan.md:83-85`, `app/startup.py:1-6`

---

## 8) Confidence

Confidence: High -- This is a well-scoped mechanical refactoring with clear boundaries. All review conditions have been addressed with explicit documentation of error handling semantics, session management, algorithm clarity, and test organization.

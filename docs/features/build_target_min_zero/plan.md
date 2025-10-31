### 0) Research Log & Findings
- Reviewed kit model constraints to confirm the database enforces `build_target >= 1`, which must be relaxed to permit zero (`app/models/kit.py:33-68`; `alembic/versions/017_create_kits_tables.py:31-88`).
- Inspected service-layer validation that currently rejects build targets below one during create/update (`app/services/kit_service.py:396-464`), and located unit tests that assert this behaviour (`tests/services/test_kit_service.py:358-364`).
- Verified the API request schemas enforce `ge=1` for build target fields (`app/schemas/kit.py:32-79`) and that the endpoints surface these schemas (`app/api/kits.py:91-162`).
- Audited downstream flows that multiply by `kit.build_target`, noting shopping list pushes and pick-list creation require strictly positive `requested_units` (`app/services/kit_shopping_list_service.py:211-279`; `app/services/kit_pick_list_service.py:40-146`), so a zero default could trigger guardrails—flagged as risk.
- Confirmed reservation math multiplies by `build_target` but otherwise tolerates zero (`app/services/kit_reservation_service.py:120-177`; `tests/services/test_kit_reservation_service.py:14-106`).

### 1) Intent & Scope
**User intent**

Allow kits to carry a build target of zero while keeping other behaviours intact.

**Prompt quotes**

"The minimum value for build targets is 0."

**In scope**

- Update validation and persistence layers so `build_target` accepts zero on create/update.
- Adjust schema, service, and model constraints plus add an Alembic migration.
- Refresh unit and API tests to exercise the new minimum.

**Out of scope**

- Frontend or UX adjustments reacting to zero defaults.
- Changing default build target values or broader kit workflow semantics.

**Assumptions / constraints**

Default build target remains 1; negative values stay invalid; shopping list and pick-list flows continue requiring positive requested units, so UI may need separate handling.

### 2) Affected Areas & File Map
- Area: `app/models/kit.py`
  - Why: Relax the table-level check constraint to allow zero.
  - Evidence: `app/models/kit.py:33-68`
- Area: `alembic/versions/018_update_kits_build_target_constraint.py`
  - Why: Drop/recreate the `kits` check constraint so existing data complies with the new minimum.
  - Evidence: `alembic/versions/017_create_kits_tables.py:31-88`
- Area: `app/services/kit_service.py`
  - Why: Service guards must only reject negatives and update messaging.
  - Evidence: `app/services/kit_service.py:396-464`
- Area: `app/schemas/kit.py`
  - Why: Request validation needs to accept zero for create/update payloads.
  - Evidence: `app/schemas/kit.py:32-79`
- Area: `app/data/test_data/kits.json`
  - Why: Provide at least one zero-target kit in the fixed dataset for regression coverage.
  - Evidence: `app/data/test_data/kits.json:1-18`
- Area: `tests/services/test_kit_service.py`
  - Why: Update expectations and add coverage for zero build targets.
  - Evidence: `tests/services/test_kit_service.py:358-364`
- Area: `tests/services/test_kit_reservation_service.py`
  - Why: Exercise cache aggregation when build targets drop to zero.
  - Evidence: `tests/services/test_kit_reservation_service.py:14-106`
- Area: `tests/services/test_kit_shopping_list_service.py`
  - Why: Assert defaulted requested units and metrics when the kit target is zero.
  - Evidence: `tests/services/test_kit_shopping_list_service.py:15-286`
- Area: `tests/api/test_kits_api.py`
  - Why: Ensure API accepts zero and still rejects negatives.
  - Evidence: `tests/api/test_kits_api.py:132-168`
- Area: `tests/test_database_constraints.py`
  - Why: Update constraint test to assert build targets can be zero but not negative.
  - Evidence: `tests/test_database_constraints.py:520-640`

### 3) Data Model / Contracts
- Entity / contract: `kits.build_target`
  - Shape: `{"build_target": int, constraints: build_target >= 0, default 1}`
  - Refactor strategy: Apply Alembic migration to relax the check without renaming the column; ensure downgrade restores previous guard.
  - Evidence: `app/models/kit.py:33-68`
- Entity / contract: `KitCreateSchema.build_target`
  - Shape: `{build_target: int >= 0, default 1}`
  - Refactor strategy: Update `Field(ge=0)` and keep schema description consistent; callers automatically benefit via Spectree validation.
  - Evidence: `app/schemas/kit.py:32-54`
- Entity / contract: `KitUpdateSchema.build_target`
  - Shape: `{build_target?: int >= 0}`
  - Refactor strategy: Mirror create-schema change; ensure partial updates still validate non-negative numbers only.
  - Evidence: `app/schemas/kit.py:57-79`
- Dataset contract: Fixed test data (`app/data/test_data/kits.json`)
  - Shape: Include representative kits, now adding at least one entry with `build_target=0`.
  - Refactor strategy: Update JSON and ensure `load-test-data` succeeds, keeping documentation/examples aligned.
  - Evidence: `app/data/test_data/kits.json:1-18`

### 4) API / Integration Surface
- Surface: `POST /kits`
  - Inputs: JSON body with `build_target` now accepting zero.
  - Outputs: 201 with persisted kit data reflecting zero target.
  - Errors: Continue returning 400 via schema validation for negatives; 409 for duplicate names unchanged.
  - Evidence: `app/api/kits.py:91-114`
- Surface: `PATCH /kits/<kit_id>`
  - Inputs: JSON patch with optional `build_target` accepting zero.
  - Outputs: 200 with updated kit payload including zero.
  - Errors: 400/409 semantics unchanged; service now only rejects negatives.
  - Evidence: `app/api/kits.py:135-163`

### 5) Algorithms & State Machines
- Flow: `KitService.create_kit` validation
  - Steps:
    1. Accept input payload and check build target.
    2. Reject when build target < 0; allow 0+.
    3. Persist kit and flush.
  - States / transitions: N/A.
  - Hotspots: None—simple guard change.
  - Evidence: `app/services/kit_service.py:396-428`
- Flow: `KitService.update_kit` metadata update
  - Steps:
    1. Fetch kit and check archive status.
    2. Apply build target when provided and ensure it is non-negative.
    3. Flush and return updated entity.
  - States / transitions: Active vs archived gating unchanged.
  - Hotspots: Ensuring we do not treat zero as noop.
  - Evidence: `app/services/kit_service.py:430-465`

### 6) Derived State & Invariants
- Derived value: `KitContent.total_required`
  - Source: `required_per_unit` and `kit.build_target` from inventory calculations.
  - Writes / cleanup: Set on content detail payload; zero targets should yield zero totals.
- Derived value: `KitReservationUsage.reserved_quantity`
  - Source: Calculated as `KitContent.required_per_unit * Kit.build_target`.
  - Writes / cleanup: Cached usage entries; zero targets should produce zero reservations without special handling. Add regression tests covering zero and positive transitions.
- Derived value: Shopping-list push `requested_units`
  - Source: Defaults to `kit.build_target` when units omitted.
  - Writes / cleanup: Drives needed quantity and link `requested_units`; zero defaults still trigger guardrails, so tests should confirm error messaging/metrics under zero defaults.

### 7) Edge Cases
- Create a kit with `build_target=0` and ensure persistence plus response succeed.
- Update an existing kit from positive to zero and verify audit timestamps/metrics still fire.
- Attempt to supply `build_target=-1` via schema/service to confirm rejections remain.
- Push kit contents to a shopping list with no `units` supplied while `build_target=0` to validate guard behaviour and metrics.
- Transition a kit from zero to positive build target and confirm reservation cache reflects the new totals.

### 8) Error Handling
- Service guards continue raising `InvalidOperationException` for negative targets with updated messaging; schema validation handles negatives pre-service.
- Downgrade path in migration must restore the former constraint to avoid silently permitting zeros if rolled back.

### 9) Telemetry
- Signal: `metrics_service.record_kit_created`
  - Type: counter
  - Trigger: Called after kit creation; zero-target kits should still increment without extra labels.
  - Labels / fields: Existing kit-level metrics remain unchanged.
  - Consumer: Prometheus dashboards already wired via MetricsService.
  - Evidence: `app/services/kit_service.py:425-428`

### 10) Background Work & Shutdown
- Worker / job: None—change does not introduce new background processing nor alter shutdown coordination.

### 11) Security & Permissions
- Not applicable; no auth or permission logic changes.

### 12) UX / UI Impact
- Entry point: Kit management UI (external)
  - Change: Backend now accepts zero; UI may need to allow users to enter 0 or adjust default prompts.
  - User interaction: Users might see zero pre-filled values; ensure downstream flows provide clear messaging if they attempt operations requiring positive units.
  - Dependencies: Frontend must align with `KitCreateSchema`/`KitUpdateSchema`.

### 13) Deterministic Test Plan
- Surface: `KitService`
  - Scenarios:
    - Given a valid payload with `build_target=0`, When `create_kit` runs, Then it persists and records metrics.
    - Given an existing kit, When updating build target to zero, Then the service returns zero without error.
    - Given a payload with `build_target=-1`, When `create_kit` runs, Then it raises `InvalidOperationException`.
  - Fixtures / hooks: Existing `kit_service` fixture and metrics stub.
  - Gaps: None.
  - Evidence: `tests/services/test_kit_service.py:353-394`
- Surface: `KitReservationService`
  - Scenarios:
    - Given kit contents with `build_target=0`, When listing reservations, Then each entry reports reserved quantity 0.
    - Given a kit updated from zero to positive, When refreshing reservations, Then cache reflects the new totals without stale data.
  - Fixtures / hooks: Existing service fixture with seeded parts/kits.
  - Gaps: None.
  - Evidence: `tests/services/test_kit_reservation_service.py:14-106`
- Surface: `KitShoppingListService`
  - Scenarios:
    - Given `units=None` and kit `build_target=0`, When pushing to a shopping list, Then service raises the guard error and metrics still record the attempt.
    - Given explicit `units=2`, When pushing, Then link persists with requested units and lines are generated.
  - Fixtures / hooks: Shopping list service fixtures with metrics stubs.
  - Gaps: None.
  - Evidence: `tests/services/test_kit_shopping_list_service.py:15-286`
- Surface: Kits API
  - Scenarios:
    - Given JSON `{build_target: 0}`, When POST /api/kits, Then status 201 with `build_target` zero.
    - Given kit with positive target, When PATCH to zero, Then status 200 and response shows zero.
    - Given negative `build_target`, When POST, Then schema validation returns 400.
  - Fixtures / hooks: Current Flask client/session fixtures.
  - Gaps: None.
  - Evidence: `tests/api/test_kits_api.py:132-168`
- Surface: Database constraint tests
  - Scenarios:
    - Given ORM insert with `build_target=-1`, When committing, Then constraint violation is raised.
    - Given ORM insert with `build_target=0`, When committing, Then transaction succeeds.
  - Fixtures / hooks: Existing `tests/test_database_constraints.py` patterns.
  - Gaps: None.
  - Evidence: `tests/test_database_constraints.py:520-640`

### 14) Implementation Slices
- Slice: Relax persistence constraints
  - Goal: Update model and migration so database accepts zero build targets.
  - Touches: `app/models/kit.py`, new Alembic migration.
  - Dependencies: None.
- Slice: Adjust validation & tests
  - Goal: Allow zero through schemas/services and update coverage.
  - Touches: `app/schemas/kit.py`, `app/services/kit_service.py`, relevant tests.
  - Dependencies: Migration ready to apply.
- Slice: Cover downstream services and dataset
  - Goal: Extend reservation/shopping-list tests, update DB constraint coverage, and refresh fixed test data with a zero-target kit.
  - Touches: `tests/services/test_kit_reservation_service.py`, `tests/services/test_kit_shopping_list_service.py`, `tests/test_database_constraints.py`, `app/data/test_data/kits.json`.
  - Dependencies: Core validation adjustments completed.

### 15) Risks & Open Questions
- Risk: Shopping-list push defaults to zero units for zero-target kits and currently raises an error; Mitigation: Add regression tests and confirm messaging remains clear (UI follow-up deferred).
- Risk: Existing fixtures or seed data may assume `ge=1`; Impact: Test brittleness; Mitigation: Update fixed dataset and rerun `load-test-data`.
- Question: Which seed kit should represent the zero-target case in test data?
  - Why it matters: Ensures predictable regression coverage across environments.
  - Owner / follow-up: Coordinate with data stewardship to select/add representative entry.

### 16) Confidence
Confidence: Medium — Change touches persistence, validation, and tests; behaviour is straightforward but downstream integrations need validation.

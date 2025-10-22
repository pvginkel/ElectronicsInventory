### 1) Summary & Decision
**Readiness**
Migration, model constraint, validation, and service guards now treat `build_target` as non-negative while downstream services and datasets include zero-target coverage (`alembic/versions/018_update_kits_build_target_constraint.py:19-44` — drop/create non-negative check; `app/models/kit.py:61-67` — table constraint mirror; `app/services/kit_service.py:404-464` — negative guard messages; `app/schemas/kit.py:49-78` — `Field(ge=0)`; `tests/api/test_kits_api.py:151-199`, `tests/services/test_kit_reservation_service.py:60-75`, `tests/services/test_kit_shopping_list_service.py:84-117` — exercised zero and error paths).

**Decision**
`GO` — No correctness or coverage gaps surfaced for the zero-target scenario; downstream guardrails still behave as planned.

### 2) Conformance to Plan (with evidence)
**Plan alignment**
- `Slice: Relax persistence constraints` ↔ `alembic/versions/018_update_kits_build_target_constraint.py:19-44` — swaps the check constraint to `build_target >= 0`; `app/models/kit.py:61-67` mirrors the new name and predicate.
- `Slice: Adjust validation & tests` ↔ `app/services/kit_service.py:404-464` — service now rejects only negatives; `app/schemas/kit.py:49-78` updates schema bounds; `tests/services/test_kit_service.py:353-394` covers create/update zero and negative cases.
- `Slice: Cover downstream services and dataset` ↔ `tests/services/test_kit_shopping_list_service.py:84-117` asserts zero-target pushes raise and emit metrics; `tests/services/test_kit_reservation_service.py:60-75` checks reservation math; `app/data/test_data/kits.json:22-25` seeds a zero-target kit; `tests/test_database_constraints.py:371-383` exercises the relaxed constraint.
- `Surface: Kits API` ↔ `tests/api/test_kits_api.py:151-199` verifies POST/PATCH accept zero and reject negatives.

**Gaps / deviations**
- None observed.

### 3) Correctness — Findings (ranked)
- None.

### 4) Over-Engineering & Refactoring Opportunities
- None noted.

### 5) Style & Consistency
- None — changes stay aligned with existing project patterns.

### 6) Tests & Deterministic Coverage (new/changed behavior only)
- Surface: KitService (create/update)
  - Scenarios:
    - Given a zero-target payload, When `create_kit` runs, Then it persists and records metrics (`tests/services/test_kit_service.py::test_create_kit_enforces_constraints_and_records_metrics`).
    - Given a kit update to zero, When `update_kit` executes, Then it returns zero and rejects negatives (`tests/services/test_kit_service.py::test_update_kit_prevents_noop_and_archive_guard`).
  - Hooks: `kit_service`, `metrics_stub`, SQLAlchemy session fixtures.
  - Gaps: None.
  - Evidence: `tests/services/test_kit_service.py:353-394`.
- Surface: Kits API
  - Scenarios:
    - Given JSON `build_target: 0`, When POST `/api/kits`, Then status 201 with zero target (`tests/api/test_kits_api.py::test_create_kit_endpoint`).
    - Given PATCH payload `{build_target: 0}`, When PATCH `/api/kits/<id>`, Then status 200 and zero response (`tests/api/test_kits_api.py::test_update_kit_endpoint`).
    - Given negative `build_target`, When POST/PATCH, Then validation returns 400 (`tests/api/test_kits_api.py::test_create_kit_endpoint`, `::test_update_kit_endpoint`).
  - Hooks: Flask client/session fixtures, dependency-injector container.
  - Gaps: None.
  - Evidence: `tests/api/test_kits_api.py:151-199`.
- Surface: KitReservationService
  - Scenarios:
    - Given a zero-target kit with contents, When aggregating reservations, Then totals and entries report zero (`tests/services/test_kit_reservation_service.py::test_reserved_totals_allow_zero_build_target`).
  - Hooks: Service container session fixture.
  - Gaps: None.
  - Evidence: `tests/services/test_kit_reservation_service.py:60-75`.
- Surface: KitShoppingListService
  - Scenarios:
    - Given `units=None` and zero-target kit, When pushing to shopping list, Then service raises and metrics log the error (`tests/services/test_kit_shopping_list_service.py::test_zero_build_target_defaults_raise_and_emit_metrics`).
  - Hooks: Container-wired service, custom metrics stub.
  - Gaps: None.
  - Evidence: `tests/services/test_kit_shopping_list_service.py:84-117`.
- Surface: Database constraint
  - Scenarios:
    - Given ORM insert with `build_target=0`, When committing, Then transaction succeeds; given `-1`, When committing, Then constraint violation occurs (`tests/test_database_constraints.py::test_kit_build_target_non_negative_constraint`).
  - Hooks: Flask app context with real `db.session`.
  - Gaps: None.
  - Evidence: `tests/test_database_constraints.py:371-383`.

### 7) Adversarial Sweep (must attempt ≥3 credible failures or justify none)
- Checks attempted:
  1) Force service-layer bypass by creating kits directly — guards plus DB check (`app/services/kit_service.py:404-462`, `alembic/versions/018_update_kits_build_target_constraint.py:19-29`) keep negatives out.
  2) Drive shopping list defaults through zero-target kit to detect silent zero lines — guard fires with metrics (`app/services/kit_shopping_list_service.py:226-233`, `tests/services/test_kit_shopping_list_service.py:84-117`).
  3) Rebuild reservation cache with zero target to spot stale quantities — query multiplies by build target and returns zero entries (`app/services/kit_reservation_service.py:136-175`, `tests/services/test_kit_reservation_service.py:60-75`).
- Evidence: See cited paths above.
- Why code held up: Each flow reuses existing guardrails (service validation, DB check constraints, reservation math) and the new tests confirm zero-target cases behave deterministically rather than slipping past the protections.

### 8) Invariants Checklist (stacked entries)
- Invariant: `kits.build_target` is never negative.
  - Where enforced: `app/services/kit_service.py:404-462`, `alembic/versions/018_update_kits_build_target_constraint.py:19-44`.
  - Failure mode: Negative targets would break reservation math and violate business rules.
  - Protection: Service guard rejects negatives and DB check blocks persistence; `tests/test_database_constraints.py:371-383` exercises both.
  - Evidence: `tests/services/test_kit_service.py:353-394`.
- Invariant: Shopping list pushes require at least one requested unit.
  - Where enforced: `app/services/kit_shopping_list_service.py:226-233`.
  - Failure mode: Creating zero-quantity list lines would confuse pickers and downstream pipelines.
  - Protection: Guard raises `InvalidOperationException`, metrics capture the error; `tests/services/test_kit_shopping_list_service.py:84-117` verifies behaviour.
  - Evidence: `tests/api/test_kits_api.py:186-198` ensures API rejects negatives before reaching service.
- Invariant: Reservation totals mirror `required_per_unit * build_target`.
  - Where enforced: `app/services/kit_reservation_service.py:136-175`.
  - Failure mode: Zero-target kits might incorrectly retain previous positive reservations.
  - Protection: Query recalculates reserved quantity each time and cache stores the computed zero; `tests/services/test_kit_reservation_service.py:60-75` confirms.
  - Evidence: `app/services/kit_reservation_service.py:168-175`.

### 9) Questions / Needs-Info
- None.

### 10) Risks & Mitigations (top 3)
- Risk: UI flows that rely on implicit kit build targets when pushing shopping lists will now hit the guard for zero targets, potentially surprising users (`app/services/kit_shopping_list_service.py:226-233`).
  - Mitigation: Ensure UI/API callers supply explicit `units` > 0 or surface friendly guidance when zero-target kits are pushed.
- Risk: Downgrade to revision 017 will fail if zero-target kits exist because the stricter check reactivates (`alembic/versions/018_update_kits_build_target_constraint.py:33-44`).
  - Mitigation: Document downgrade prerequisite or backfill positive values before running the downgrade.
- Risk: Any automation that reuses kit build targets for pick-list creation without prompting for units will encounter the existing `requested_units >= 1` guard (`app/services/kit_pick_list_service.py:44-74`).
  - Mitigation: Audit callers to ensure they pass explicit positive requested units when working with zero-target kits.

### 11) Confidence
Confidence: High — Changes are localized and covered by service, API, reservation, shopping-list, and constraint tests that exercise the new zero-target behaviour end-to-end.


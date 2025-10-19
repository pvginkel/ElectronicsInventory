### 1) Summary & Decision
**Readiness**
Centralized reservation math now lives in `KitReservationService` and is reused by kit detail, shopping list, and pick list flows (`app/services/kit_reservation_service.py:39-182`, `app/services/kit_service.py:124-168`, `app/services/kit_shopping_list_service.py:91-229`, `app/services/kit_pick_list_service.py:24-188`). The new `/parts/<key>/kit-reservations` debug route plus schemas expose the per-kit breakdown (`app/api/parts.py:171-197`, `app/schemas/kit_reservations.py:19-63`), and the archived-kit timestamp invariant is enforced via model/migration/tests (`app/models/kit.py:33-54`, `alembic/versions/021_enforce_archived_kits_timestamp.py:20-33`, `tests/test_database_constraints.py:381-405`). Fresh service/API coverage exercises success, error, and edge paths (`tests/services/test_kit_reservation_service.py:11-102`, `tests/services/test_kit_shopping_list_service.py:100-215`, `tests/services/test_kit_pick_list_service.py:93-214`, `tests/api/test_kits_api.py:214-305`, `tests/test_parts_api.py:1437-1511`).

**Decision**
GO — No correctness blockers surfaced; behaviour matches the approved plan with solid deterministic coverage.

### 2) Conformance to Plan (with evidence)
**Plan alignment**
- Plan §1 “Extend KitReservationService…” ↔ `app/services/kit_reservation_service.py:39-182` — adds usage dataclass, per-part caching, list/totals helpers.
- Plan §1 “Tighten kit/pick/shopping flows via shared helpers” ↔ `app/services/kit_service.py:124-168`, `app/services/kit_shopping_list_service.py:185-246`, `app/services/kit_pick_list_service.py:52-160` — each service now pulls reservations from the shared helper and enforces integer guards.
- Plan §1 “Add archived_at guard + migration” ↔ `app/models/kit.py:33-54`, `alembic/versions/021_enforce_archived_kits_timestamp.py:20-33`.
- Plan §1 “Implement debug endpoint + schemas/tests” ↔ `app/api/parts.py:171-197`, `app/schemas/kit_reservations.py:19-63`, `tests/test_parts_api.py:1437-1511`.

**Gaps / deviations**
- Plan Hotspots suggested caching keyed by `(tuple(sorted(part_ids)), exclude_kit_id)` (`docs/features/data_integrity_reserved_math/plan.md:175-180`). Implementation chooses to cache raw per-part usage and apply exclusion at sum time (`app/services/kit_reservation_service.py:39-182`). This still meets intent (no stale totals across exclusion contexts) but differs from the described keying.

### 3) Correctness — Findings (ranked)
None.

### 4) Over-Engineering & Refactoring Opportunities
None observed beyond the scope already addressed in this change.

### 5) Style & Consistency
No material inconsistencies detected; new code follows existing layering and error patterns.

### 6) Tests & Deterministic Coverage (new/changed behavior only)
- Surface: `KitReservationService`
  - Scenarios:
    - Given archived kits and self-exclusion, When requesting totals, Then archived/self kits are ignored (`tests/services/test_kit_reservation_service.py::test_reserved_totals_exclude_archived_and_subject`).
    - Given empty input, When requesting totals, Then an empty dict is returned (`tests/services/test_kit_reservation_service.py::test_reserved_totals_handles_empty_input`).
    - Given a part, When listing reservations, Then metadata and defensive copies are returned (`tests/services/test_kit_reservation_service.py::test_list_active_reservations_returns_metadata`).
  - Hooks: Direct service instantiation with real session; models seeded per test.
  - Gaps: None — covers exclusion, empties, metadata.

- Surface: `KitService.get_kit_detail`
  - Scenarios:
    - Given peer kits reserving parts, When fetching detail, Then reserved/available/active reservations reflect shared helper (`tests/services/test_kit_service.py::test_get_kit_detail_calculates_availability`).
    - API echo ensures reservation payload serialises (`tests/api/test_kits_api.py::test_kit_detail_includes_active_reservation_breakdown`).
  - Hooks: Inventory/metrics/reservation stubs to assert interactions.
  - Gaps: None.

- Surface: `KitShoppingListService.create_or_append_list`
  - Scenarios:
    - Given honor_reserved flag, When pushing, Then shortages subtract peer reservations (`tests/services/test_kit_shopping_list_service.py::test_honor_reserved_adjusts_needed_quantities`).
    - Given zero shortage, When pushing, Then result is noop (`tests/services/test_kit_shopping_list_service.py::test_zero_shortage_returns_noop`).
    - Given archived kit, When pushing, Then InvalidOperationException raised (`tests/services/test_kit_shopping_list_service.py::test_archived_kit_rejected`).
  - Hooks: Container-provided service using dependency injector wiring; monkeypatched inventory/reservation responses.
  - Gaps: None.

- Surface: `KitPickListService.create_pick_list`
  - Scenarios:
    - Given distributed stock, When creating pick list, Then lines partition across locations (`tests/services/test_kit_pick_list_service.py::test_create_pick_list_allocates_across_locations`).
    - Given insufficient stock after reservations, When creating, Then InvalidOperationException raised (`tests/services/test_kit_pick_list_service.py::test_create_pick_list_blocks_other_kit_reservations`).
    - Given invalid requested_units, When creating, Then validation error (`tests/services/test_kit_pick_list_service.py::test_create_pick_list_requires_sufficient_stock`).
  - Hooks: Real service with inventory + reservation collaborators, metrics stub.
  - Gaps: None.

- Surface: `GET /parts/<key>/kit-reservations`
  - Scenarios:
    - Given no kits, When querying, Then total_reserved 0 and empty list (`tests/test_parts_api.py::test_get_part_kit_reservations_empty`).
    - Given active/archived kits, When querying, Then only active kits appear with totals (`tests/test_parts_api.py::test_get_part_kit_reservations_with_active_kits`).
    - Given unknown part, When querying, Then 404 (`tests/test_parts_api.py::test_get_part_kit_reservations_not_found`).
  - Hooks: Flask test client with container services; session commits to persist kit content.
  - Gaps: None.

- Surface: Archived kit check constraint
  - Scenarios:
    - Given archived kit without timestamp, When committing, Then IntegrityError raised; With timestamp, commit succeeds (`tests/test_database_constraints.py::test_archived_kits_require_timestamp`).
  - Hooks: Direct SQLAlchemy session within app context.
  - Gaps: None.

### 7) Adversarial Sweep
- Checks attempted: (1) Migration/model/test alignment for archived timestamp (`alembic/versions/021_enforce_archived_kits_timestamp.py:20-33`, `app/models/kit.py:33-54`, `tests/test_database_constraints.py:381-405`); (2) Reservation cache freshness and defensive copies (`app/services/kit_reservation_service.py:39-168`, `tests/services/test_kit_reservation_service.py:57-80`); (3) Debug endpoint schema serialization of Enums (`app/api/parts.py:171-197`, `app/schemas/kit_reservations.py:19-63`, `tests/test_parts_api.py:1467-1506`).
- Evidence: Each check reflects exercised tests and code paths above.
- Why code held up: Constraint is enforced at DB, ORM, and test layers; reservation helper stores immutable entries and returns new lists, so repeated callers cannot mutate cache; API schema already used across kit endpoints so JSON enum handling stays consistent (tests assert string values).

### 8) Invariants Checklist
- Invariant: Archived kits must set `archived_at` when status is `archived`.
  - Where enforced: `app/models/kit.py:33-54`, `alembic/versions/021_enforce_archived_kits_timestamp.py:20-33`.
  - Failure mode: Status flip without timestamp would violate DB constraint.
  - Protection: Constraint + service archive logic + regression test (`tests/test_database_constraints.py:381-405`).
  - Evidence: Tests confirm IntegrityError on missing timestamp.

- Invariant: Reservation totals exclude archived kits and optional subject kit.
  - Where enforced: `app/services/kit_reservation_service.py:119-182`.
  - Failure mode: Including archived/self kit would inflate shortages and block availability.
  - Protection: Query filters `Kit.status == KitStatus.ACTIVE` and `_sum_reservations` skips `exclude_kit_id`; test asserts behaviour (`tests/services/test_kit_reservation_service.py:11-49`).
  - Evidence: Service tests cover both inclusion/exclusion paths.

- Invariant: Pick list creation only proceeds with positive units and sufficient stock after honoring reservations.
  - Where enforced: `app/services/kit_pick_list_service.py:52-160`.
  - Failure mode: Allowing zero/negative units or over-allocation would corrupt inventory.
  - Protection: Early InvalidOperationException checks and reservation-aware availability, backed by service tests (`tests/services/test_kit_pick_list_service.py:118-152`).
  - Evidence: Tests raise errors when invariants violated.

### 9) Questions / Needs-Info
None.

### 10) Risks & Mitigations (top 3)
- Risk: Reservation cache is per-service-instance; switching DI provider to singleton would require explicit invalidation to avoid stale data.
  - Mitigation: Keep `kit_reservation_service` as `providers.Factory` or add an explicit `clear_cache()` when mutating kit contents (`app/services/kit_reservation_service.py:35-57`, `app/services/container.py:57-104`).
  - Evidence: Cache initialised once per service instance without invalidation.

- Risk: Debug endpoint could return very large payloads if a part is referenced by many kits, impacting tooling latency.
  - Mitigation: Consider pagination or soft limits if usage grows (`app/api/parts.py:171-197`, `docs/features/data_integrity_reserved_math/plan.md:187-199`).
  - Evidence: Endpoint returns entire reservation list with no caps.

- Risk: Migration backfill uses `NOW()`, which is nondeterministic during multi-node deploys; replicas might show slight timestamp skew.
  - Mitigation: Acceptable for one-time backfill, but document expectation or standardise via UTC helper if more backfills need determinism (`alembic/versions/021_enforce_archived_kits_timestamp.py:20-27`).
  - Evidence: Migration issues `NOW()` directly in SQL text.

### 11) Confidence
Confidence: High — Behaviour is covered by focused service/API tests, and the implementation matches the planned architecture without exposing unresolved defects.

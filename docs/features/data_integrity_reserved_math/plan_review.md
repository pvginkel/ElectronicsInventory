**Summary & Decision**
**Readiness**
Plan covers the right surfaces but omits critical wiring (part lookup) and database/test validation work, so the implementation would get stuck.
**Decision**
`GO-WITH-CONDITIONS` — Must add the missing PartService lookup plan and deterministic database/test coverage before coding.

**Conformance & Fit**
**Conformance to refs**
- docs/epics/kits_feature_breakdown.md — Pass — docs/features/data_integrity_reserved_math/plan.md:21-24 — > "Add database-level guards so archived kits always carry an `archived_at` timestamp and keep schema/models in sync."
- Electronics Inventory Backend Development Guidelines — Fail — docs/features/data_integrity_reserved_math/plan.md:317-324 — > "- Gaps: None." (Migration introduces a new constraint but the plan does not schedule deterministic DB/tests.)
**Fit with codebase**
- app/services/part_service.py — docs/features/data_integrity_reserved_math/plan.md:239-241 — > "- Guardrails: Reuse PartService getters which raise `RecordNotFoundException`." Existing PartService only exposes key-based getters (app/services/part_service.py:80-119), so the plan assumes functionality that does not exist.
- tests/services/test_kit_shopping_list_service.py — docs/features/data_integrity_reserved_math/plan.md:326-330 — > "- Slice: Schema guard & migration... relevant fixture backfills." Current fixtures create archived kits without `archived_at` (tests/services/test_kit_shopping_list_service.py:173), which will violate the new check unless the plan adds updates.

**Open Questions & Ambiguities**
- Question: How will the reservation cache key differentiate calls that use different `exclude_kit_id` values? (docs/features/data_integrity_reserved_math/plan.md:163-178)
- Why it matters: A cache keyed only by part IDs would return stale totals and corrupt kit availability math whenever the caller excludes a different kit.
- Needed answer: Specify the cache key strategy (e.g., include both the part-id tuple and exclude-kit identifier) or note that caching is scoped to a single call without reuse.

**Deterministic Backend Coverage**
- Behavior: Archived kit status guard
  - Scenarios:
    - Given a kit archived without `archived_at`, When flushing the session, Then the database raises an integrity error (`tests/test_database_constraints.py::test_archived_kits_require_timestamp`).
  - Instrumentation: None.
  - Persistence hooks: Alembic migration plus `Kit` model update.
  - Gaps: Need a dedicated constraint test; currently marked "Gaps: None" (docs/features/data_integrity_reserved_math/plan.md:317-330).
  - Evidence: docs/features/data_integrity_reserved_math/plan.md:326-330.
- Behavior: GET /parts/<int:part_id>/kit-reservations
  - Scenarios:
    - Given a valid part ID with reservations, When calling the endpoint, Then the response lists contributing kits (`tests/test_parts_api.py::test_get_part_kit_reservations`).
    - Given an invalid part ID, When calling the endpoint, Then the response is 404 with the standard error payload (`tests/test_parts_api.py::test_get_part_kit_reservations_not_found`).
  - Instrumentation: None beyond existing HTTP metrics.
  - Persistence hooks: None (read-only), relies on KitReservationService helper.
  - Gaps: Ensure service lookup supports part IDs; current plan assumes existing getter (docs/features/data_integrity_reserved_math/plan.md:239-241).
  - Evidence: docs/features/data_integrity_reserved_math/plan.md:154-158, 317-324.

**Adversarial Sweep (≥3 issues)**
**[F1] Major — PartService lacks ID lookup**
**Evidence:** `docs/features/data_integrity_reserved_math/plan.md:239-241` — > "- Guardrails: Reuse PartService getters which raise `RecordNotFoundException`." / `app/services/part_service.py:80-119` — > "def get_part(self, part_key: str) -> Part: ..." (no ID-based accessor).
**Why it matters:** The new debug endpoint cannot resolve a part by ID, so implementation would fail or bypass service-layer validation.
**Fix suggestion:** Add a plan step to introduce `PartService.get_part_by_id` (or switch the endpoint to part keys) and update the coverage plan accordingly.
**Confidence:** High

**[F2] Major — Migration lacks deterministic validation**
**Evidence:** `docs/features/data_integrity_reserved_math/plan.md:326-339` — > "- Slice: Schema guard & migration..." alongside `docs/features/data_integrity_reserved_math/plan.md:317-324` — > "- Gaps: None." (no planned tests).
**Why it matters:** New check constraints must be enforced by pytest/alembic tests per guidelines; without them, regressions slip through and migrations may fail silently.
**Fix suggestion:** Schedule tests (e.g., in `tests/test_database_constraints.py`) asserting archived kits require timestamps and ensure `load-test-data` exercises the path.
**Confidence:** High

**[F3] Major — Test fixtures will violate new check**
**Evidence:** `docs/features/data_integrity_reserved_math/plan.md:326-330` — > "- Slice: Schema guard & migration..." / `tests/services/test_kit_shopping_list_service.py:173` — > "kit = Kit(name='Archived', build_target=1, status=KitStatus.ARCHIVED)" (no archived_at).
**Why it matters:** Once the check constraint lands, existing service tests will fail on flush, blocking implementation unless fixtures are updated.
**Fix suggestion:** Extend the plan to update all test fixtures/factories to set `archived_at` when status=ARCHIVED (or centralize via helper).
**Confidence:** High

**Derived-Value & Persistence Invariants**
- Derived value: KitContent availability fields
  - Source dataset: Reservation totals and inventory counts aggregated per part.
  - Write / cleanup triggered: Mutates in-memory KitContent attributes prior to serialization.
  - Guards: Exclude current kit via `exclude_kit_id`; clamp values with `max(..., 0)`.
  - Invariant: `reserved` excludes the active kit and `available + shortfall == total_required`.
  - Evidence: docs/features/data_integrity_reserved_math/plan.md:190-204.
- Derived value: Shopping list needed quantities
  - Source dataset: Requested units merged with inventory and reservation totals.
  - Write / cleanup triggered: Drives shopping list line creation/merge.
  - Guards: Skip zero shortages; enforce concept list precondition.
  - Invariant: All persisted lines have strictly positive `needed`.
  - Evidence: docs/features/data_integrity_reserved_math/plan.md:206-214.
- Derived value: KitShoppingListLink.is_stale flag
  - Source dataset: Compares `kit.updated_at` with `snapshot_kit_updated_at`.
  - Write / cleanup triggered: Updated during `_upsert_link` transaction.
  - Guards: Only active kits push; snapshot refreshed atomically.
  - Invariant: Archived kits do not produce fresh links.
  - Evidence: docs/features/data_integrity_reserved_math/plan.md:216-224.

**Risks & Mitigations**
- Risk: Migration fails on archived kits missing timestamps.
  - Mitigation: Backfill timestamps and update fixtures/data loaders to ensure compliance.
  - Evidence: docs/features/data_integrity_reserved_math/plan.md:326-330, tests/services/test_kit_shopping_list_service.py:173.
- Risk: Reservation cache returns wrong totals when excluding different kits.
  - Mitigation: Define cache key including `exclude_kit_id` or avoid caching across heterogeneous calls.
  - Evidence: docs/features/data_integrity_reserved_math/plan.md:163-178.
- Risk: Debug endpoint leaks inconsistent errors due to missing part lookup.
  - Mitigation: Add PartService ID getter with standard exceptions before wiring the API.
  - Evidence: docs/features/data_integrity_reserved_math/plan.md:239-241; app/services/part_service.py:80-119.

**Confidence**
Confidence: Medium — Core scope aligns with the epic, but missing plan steps for part lookup and migration/test coverage introduce high execution risk until addressed.

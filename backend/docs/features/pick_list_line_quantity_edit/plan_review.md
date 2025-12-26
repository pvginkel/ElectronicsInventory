# Plan Review — Pick List Line Quantity Edit

## 1) Summary & Decision

**Readiness**

The plan is well-structured, thorough, and demonstrates strong understanding of the codebase patterns. The feature scope is appropriately constrained (single-field update) with clear validation rules. The plan correctly identifies the database constraint conflict (>= 1 vs >= 0) and proposes a migration. Service and API patterns follow established conventions. Test coverage is comprehensive with explicit scenarios for success and error paths. The only gaps are minor: missing explicit test data migration consideration, unclear metrics method signature, and no discussion of derived property behavior with zero-quantity lines during pick list completion logic.

**Decision**

`GO-WITH-CONDITIONS` — The plan is ready for implementation after addressing the conditions: (1) confirm test data files don't need updates for the constraint change, (2) define the exact metrics method signature, (3) add explicit test scenario verifying completion logic ignores zero-quantity OPEN lines, and (4) clarify migration deployment ordering in the implementation notes.

---

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `CLAUDE.md` layering (API/Service/Model) — Pass — `plan.md:80-109` — Plan correctly separates model constraint update, service business logic in `update_line_quantity()`, schema validation, and API endpoint with `@handle_api_errors` decorator
- `CLAUDE.md` testing requirements — Pass — `plan.md:293-320` — Comprehensive service and API test scenarios covering success paths, validation errors, status checks, and edge cases (zero quantity)
- `CLAUDE.md` error handling philosophy — Pass — `plan.md:213-256` — Uses typed exceptions (`InvalidOperationException`, `RecordNotFoundException`), delegates to `@handle_api_errors` for HTTP conversion, no defensive try/catch swallowing
- `CLAUDE.md` database patterns — Pass — `plan.md:203-210` — Uses row-level locking via `_get_line_for_update()`, transaction scope at request boundary, atomic update with flush
- `product_brief.md` projects/kits — Pass — `plan.md:39-50` — Feature aligns with product brief section 10.7 "Projects (kits)" allowing quantity adjustments for build variants

**Fit with codebase**

- `app/models/kit_pick_list_line.py:48-50` — `plan.md:82-84` — Plan correctly identifies the `CheckConstraint` needing migration from `>= 1` to `>= 0`; migration approach is sound
- `app/services/kit_pick_list_service.py:434-458` — `plan.md:164-165, 434-458` — Plan reuses existing `_get_line_for_update()` helper with row lock; no new locking mechanism needed
- `app/api/pick_lists.py:111-133` — `plan.md:98-101` — Proposes PATCH endpoint following nested route pattern consistent with existing `/lines/<line_id>/pick` POST
- `app/schemas/pick_list.py:13-21` — `plan.md:91-93, 119-128` — New `PickListLineQuantityUpdateSchema` follows existing create schema pattern with `Field(ge=0)` for validation
- `app/models/kit_pick_list.py:114-128` — **Assumption**: Plan assumes derived properties (`total_quantity_to_pick`, `remaining_quantity`) correctly handle zero-quantity lines; `plan.md:180-199` confirms sums are safe with zero, but no explicit discussion of completion transition logic when zero-quantity OPEN lines exist

---

## 3) Open Questions & Ambiguities

- Question: Does the test data in `app/data/test_data/` include any pick list lines, and if so, do they need updating to remain valid after the constraint relaxation?
- Why it matters: Migration will succeed, but loading test data afterwards might fail if historical test data violates new business logic expectations or has hardcoded quantities that depend on the old constraint
- Needed answer: Audit test data files for pick list fixtures and confirm no updates required, or identify specific JSON entries needing adjustment

- Question: What is the exact method signature for `metrics_service.record_pick_list_line_quantity_updated()`?
- Why it matters: Plan references this method (`plan.md:170, 261-267`) but the method doesn't exist yet; signature ambiguity (old_qty, new_qty, delta) affects implementation and testing
- Needed answer: Define signature explicitly in the plan or in implementation notes; confirm whether to track delta as a separate field or compute it in the metrics service

- Question: How should completion logic behave when zero-quantity OPEN lines exist?
- Why it matters: `pick_line()` transitions pick list to COMPLETED when all lines are COMPLETED (`plan.md:318-323`, `kit_pick_list_service.py:318-323`); if a line has `quantity_to_pick=0` and remains OPEN, it blocks completion indefinitely unless the user "picks" it despite zero quantity
- Needed answer: Clarify if zero-quantity lines should be auto-completed on creation, or if users must explicitly mark them as picked to complete the pick list

---

## 4) Deterministic Backend Coverage (new/changed behavior only)

- Behavior: `KitPickListService.update_line_quantity()` (new method)
- Scenarios:
  - Given OPEN pick list with OPEN line qty=10, When update_line_quantity(5), Then line.quantity_to_pick=5 and pick_list.updated_at refreshed (`tests/services/test_kit_pick_list_service.py::test_update_line_quantity_success`)
  - Given OPEN line, When update_line_quantity(0), Then line.quantity_to_pick=0 and no exception (`tests/services/test_kit_pick_list_service.py::test_update_line_quantity_zero_allowed`)
  - Given COMPLETED line, When update_line_quantity(3), Then InvalidOperationException "cannot edit completed pick list line" (`tests/services/test_kit_pick_list_service.py::test_update_line_quantity_completed_line_rejected`)
  - Given OPEN line on COMPLETED pick list, When update_line_quantity(2), Then InvalidOperationException "cannot edit lines on completed pick list" (`tests/services/test_kit_pick_list_service.py::test_update_line_quantity_completed_pick_list_rejected`)
  - Given nonexistent line_id, When update_line_quantity(1), Then RecordNotFoundException (`tests/services/test_kit_pick_list_service.py::test_update_line_quantity_line_not_found`)
  - Given successful update from 10 to 5, When derived properties accessed, Then total_quantity_to_pick and remaining_quantity reflect new value (`tests/services/test_kit_pick_list_service.py::test_update_line_quantity_recalculates_totals`)
- Instrumentation: `metrics_service.record_pick_list_line_quantity_updated(line_id, old_qty, new_qty)` called after successful update (`plan.md:170, 261-267`)
- Persistence hooks: Database migration to relax constraint (`plan.md:86-88`); no test data migration mentioned; no new DI wiring needed (service already in container)
- Gaps: No explicit test scenario verifying completion logic with zero-quantity OPEN lines; missing confirmation that test data files don't need updates
- Evidence: `plan.md:293-304` (service scenarios), `plan.md:82-88` (migration), `plan.md:261-267` (metrics)

- Behavior: PATCH `/pick-lists/<pick_list_id>/lines/<line_id>` (new endpoint)
- Scenarios:
  - Given valid OPEN pick list and line, When PATCH {"quantity_to_pick": 3}, Then 200 with KitPickListDetailSchema (`tests/api/test_pick_lists_api.py::test_patch_line_quantity_success`)
  - Given valid request, When PATCH {"quantity_to_pick": 0}, Then 200 and line.quantity_to_pick=0 (`tests/api/test_pick_lists_api.py::test_patch_line_quantity_zero`)
  - Given missing quantity_to_pick, When PATCH {}, Then 400 Bad Request (`tests/api/test_pick_lists_api.py::test_patch_line_quantity_missing_field`)
  - Given negative quantity, When PATCH {"quantity_to_pick": -1}, Then 400 validation error (`tests/api/test_pick_lists_api.py::test_patch_line_quantity_negative`)
  - Given nonexistent pick_list_id, When PATCH, Then 404 (`tests/api/test_pick_lists_api.py::test_patch_line_quantity_pick_list_not_found`)
  - Given COMPLETED line, When PATCH, Then 409 Conflict (`tests/api/test_pick_lists_api.py::test_patch_line_quantity_completed_line`)
  - Given successful update, When response inspected, Then updated_at is recent and total_quantity_to_pick reflects change (`tests/api/test_pick_lists_api.py::test_patch_line_quantity_updates_timestamp_and_totals`)
- Instrumentation: Metrics recorded via service layer; API layer has no direct instrumentation
- Persistence hooks: Blueprint already wired (`pick_lists.py` imported in `app/__init__.py:132`)
- Gaps: None identified for API coverage
- Evidence: `plan.md:306-320` (API scenarios), `pick_lists.py:22` (blueprint), `plan.md:98-101` (endpoint location)

- Behavior: Database constraint relaxation (`ck_pick_list_lines_quantity_positive`)
- Scenarios:
  - Given new migration applied, When INSERT line with quantity_to_pick=0, Then no constraint violation (validated via service tests, not direct SQL)
  - Given old constraint, When INSERT line with quantity_to_pick=0, Then CHECK constraint violation (tested in reverse: confirm migration is required)
- Instrumentation: None (migration is schema change, not runtime behavior)
- Persistence hooks: Alembic migration file in `alembic/versions/`
- Gaps: No mention of test data migration; deployment ordering not explicit (must run migration before API deployment to avoid runtime errors)
- Evidence: `plan.md:86-88`, `plan.md:340-342` (deployment risk)

---

## 5) Adversarial Sweep (must find ≥3 credible issues or declare why none exist)

**Major — Derived property completion logic may conflict with zero-quantity lines**
**Evidence:** `plan.md:195-199` (completion invariant) + `kit_pick_list_service.py:318-323` (completion check) — "Completion logic must not be affected by zero-quantity lines (they remain OPEN until explicitly picked or pick list deleted)"
**Why it matters:** The service method `pick_line()` transitions the pick list to COMPLETED only when all lines have `status == COMPLETED`. If a user sets `quantity_to_pick=0` to skip a line, the line remains OPEN, blocking completion indefinitely. The plan assumes users will manually "pick" zero-quantity lines, but this is counterintuitive UX and not enforced.
**Fix suggestion:** Add explicit guidance in section 8 (Errors & Edge Cases) documenting that zero-quantity lines must still be explicitly picked to complete the pick list, or propose auto-completing zero-quantity lines immediately upon creation/update to avoid UX confusion.
**Confidence:** High

**Major — Missing test data migration consideration**
**Evidence:** `plan.md:86-88` (migration) + `CLAUDE.md:Test Data Management` — Plan identifies database migration to relax constraint but doesn't mention test data files in `app/data/test_data/`
**Why it matters:** If test data JSON files contain pick list line fixtures with hardcoded `quantity_to_pick` values, the constraint change is additive (allows more values), so existing data remains valid. However, if test data loading logic or business rules elsewhere depend on the old `>= 1` assumption, loading may fail subtly. The plan should confirm test data files are unaffected or identify updates needed.
**Fix suggestion:** Add explicit check in section 2 (Affected Areas) or section 15 (Risks) confirming test data files don't contain pick list fixtures, or if they do, that the constraint change requires no updates because it's additive.
**Confidence:** Medium

**Minor — Metrics method signature undefined**
**Evidence:** `plan.md:170` + `plan.md:261-267` — Plan references `metrics_service.record_pick_list_line_quantity_updated(line_id, old_qty, new_qty)` but method doesn't exist in `metrics_service.py`
**Why it matters:** Ambiguity in signature (should delta be passed separately? should labels include pick_list_id?) affects implementation and testing. The plan describes what to track but doesn't specify the exact method contract.
**Fix suggestion:** Add explicit method signature in section 9 (Observability / Telemetry) or in the service method description in section 5 (Algorithms), e.g., `record_pick_list_line_quantity_updated(line_id: int, old_quantity: int, new_quantity: int) -> None`.
**Confidence:** Medium

---

## 6) Derived-Value & Persistence Invariants (stacked entries)

- Derived value: `KitPickList.total_quantity_to_pick`
  - Source dataset: Unfiltered sum of `quantity_to_pick` across all lines (`kit_pick_list.py:114-116`)
  - Write / cleanup triggered: None (read-only property recomputed on access)
  - Guards: Property defined on model; schema reads via `from_attributes=True`; no guards needed (no writes)
  - Invariant: Sum must include zero-quantity lines in the total; setting a line to 0 reduces `total_quantity_to_pick` by the old value
  - Evidence: `plan.md:180-185`, `kit_pick_list.py:114-116`

- Derived value: `KitPickList.remaining_quantity`
  - Source dataset: Filtered sum (`total_quantity_to_pick - picked_quantity`) where `picked_quantity` sums only COMPLETED lines (`kit_pick_list.py:125-128`)
  - Write / cleanup triggered: None (read-only property)
  - Guards: Filtered by `line.is_completed` predicate; safe because no persistent writes or cleanup depend on this filtered view
  - Invariant: Zero-quantity OPEN lines contribute to `total_quantity_to_pick` but not to `picked_quantity`, so they increase `remaining_quantity` until picked
  - Evidence: `plan.md:186-192`, `kit_pick_list.py:125-128`

- Derived value: Pick list completion status (`KitPickListStatus.COMPLETED`)
  - Source dataset: Filtered check of all lines' status (`all(sibling.status is PickListLineStatus.COMPLETED for sibling in pick_list.lines)`)
  - Write / cleanup triggered: When last OPEN line is picked, pick list transitions to COMPLETED and sets `completed_at` (`kit_pick_list_service.py:318-323`)
  - Guards: Status check in `pick_line()` service method; no guard preventing zero-quantity OPEN lines from blocking completion
  - Invariant: Pick list cannot transition to COMPLETED while any line (including zero-quantity) remains OPEN; zero-quantity lines must be explicitly picked to complete the list
  - Evidence: `plan.md:195-199`, `kit_pick_list_service.py:318-323`

---

## 7) Risks & Mitigations (top 3)

- Risk: Database migration must deploy before API code to avoid constraint violations on PATCH requests with `quantity_to_pick=0`
- Mitigation: Document deployment order explicitly; run migration via `upgrade-db` before deploying new API code; add deployment note in section 15 or implementation guide
- Evidence: `plan.md:340-342` (migration ordering risk), `plan.md:76` (migration runs before endpoint deployed)

- Risk: Zero-quantity OPEN lines block pick list completion unless explicitly picked, creating counterintuitive UX
- Mitigation: Document behavior in change brief and plan; consider auto-completing zero-quantity lines on creation/update, or add frontend guidance to mark zero-quantity lines as "skipped" via pick action
- Evidence: `plan.md:195-199` (completion invariant), `kit_pick_list_service.py:318-323` (completion logic)

- Risk: Metrics method signature undefined; implementation may diverge from plan expectations
- Mitigation: Define exact signature in plan section 9 or in service method pseudocode; confirm whether to pass delta separately or compute in metrics service
- Evidence: `plan.md:170, 261-267` (metrics reference), missing definition in `metrics_service.py`

---

## 8) Confidence

Confidence: High — The plan is comprehensive, follows established patterns, and correctly identifies the core change (constraint relaxation + service method + API endpoint). The primary risks are minor (metrics signature, test data confirmation, completion UX) and do not block implementation. The constraint migration is low-risk because it's additive (allows more values). All major integration points (DI wiring, error handling, transactions) are correctly addressed with evidence.

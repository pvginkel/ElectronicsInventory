# Code Review — Pick List Line Quantity Edit

## 1) Summary & Decision

**Readiness**

The implementation is complete, well-tested, and correctly follows the plan. The database migration properly relaxes the constraint to allow zero quantities, the service layer implements proper validation and metrics, the API endpoint follows established patterns, and the test coverage is comprehensive. The code handles the zero-quantity edge case correctly in the `pick_line()` method by skipping inventory removal when `quantity_to_pick == 0`. However, there is one **Blocker** issue: the `undo_line()` method unconditionally calls `add_stock()` with `line.quantity_to_pick`, which will fail when undoing a zero-quantity picked line because it relies on `inventory_change_id` which is `None` for zero-quantity picks.

**Decision**

`NO-GO` — The undo logic for zero-quantity picked lines will break, causing a critical correctness issue (`undo_line()` raises InvalidOperationException when `inventory_change_id is None` at line 346-352).

---

## 2) Conformance to Plan (with evidence)

**Plan alignment**

- Section 2 (Model constraint update) ↔ `app/models/kit_pick_list_line.py:48` — `CheckConstraint("quantity_to_pick >= 0", ...)` matches plan requirement
- Section 2 (Migration) ↔ `alembic/versions/019_relax_pick_list_line_quantity_constraint.py:20-34` — Migration drops old constraint and creates new one with `>= 0`
- Section 3 (Schema) ↔ `app/schemas/pick_list.py:23-30` — `PickListLineQuantityUpdateSchema` with `ge=0` validation matches plan data model
- Section 4 (API endpoint) ↔ `app/api/pick_lists.py:160-187` — PATCH endpoint at correct route with proper decorators and response schema
- Section 5 (Service method) ↔ `app/services/kit_pick_list_service.py:385-424` — `update_line_quantity()` implements all validation steps from plan algorithm
- Section 9 (Metrics) ↔ `app/services/metrics_service.py:132-138, 792-802` — Counter and histogram metrics match plan specification
- Section 13 (Tests) ↔ `tests/services/test_kit_pick_list_service.py:645-872` and `tests/api/test_pick_lists_api.py:252-414` — Comprehensive test coverage matches plan test scenarios

**Gaps / deviations**

- Plan section 6 (Derived value: Pick list completion behavior) states that zero-quantity lines must be explicitly picked to complete the pick list. The `pick_line()` method correctly handles zero-quantity picks (lines 304-313 in `kit_pick_list_service.py`), but the corresponding `undo_line()` method does **not** handle zero-quantity unpicks, creating an asymmetry. This is a **Blocker** (detailed in section 3).
- Migration file `alembic/versions/019_relax_pick_list_line_quantity_constraint.py` is **untracked** (shown as `??` in git status). While not technically a code issue, this is a deployment risk flagged in section 10.

---

## 3) Correctness — Findings (ranked)

- Title: `Blocker — undo_line() will fail for zero-quantity picked lines`
- Evidence: `app/services/kit_pick_list_service.py:346-352` — The method checks `if line.inventory_change_id is None: raise InvalidOperationException("line is missing inventory change reference")`. However, zero-quantity picked lines have `inventory_change_id = None` by design (set at line 305-313 in `pick_line()`).
- Impact: Users cannot undo zero-quantity picked lines, breaking the undo workflow. The error message is misleading ("missing inventory change reference" when it's actually a zero-quantity line). This violates the plan's completion behavior requirement (section 6) where zero-quantity lines can be picked and must also be undo-able.
- Fix: Add a zero-quantity guard in `undo_line()` before the `inventory_change_id` check:
  ```python
  # In undo_line(), after line 345, add:
  if line.quantity_to_pick == 0:
      # Zero-quantity line: no inventory to undo, just reopen the line
      now = datetime.now(UTC)
      line.inventory_change_id = None
      line.picked_at = None
      line.status = PickListLineStatus.OPEN

      pick_list = line.pick_list
      pick_list.updated_at = now
      if pick_list.status is KitPickListStatus.COMPLETED:
          pick_list.status = KitPickListStatus.OPEN
          pick_list.completed_at = None

      self.db.flush()
      duration = perf_counter() - start
      self.metrics_service.record_pick_list_line_undo("success", duration)
      return line

  # Then the existing inventory_change_id check at line 346-352
  ```
- Confidence: High

**Failure reasoning (no-bluff proof):**
1. Create pick list with line quantity 10
2. Call `update_line_quantity(pick_list_id, line_id, 0)` → line.quantity_to_pick = 0, status = OPEN
3. Call `pick_line(pick_list_id, line_id)` → skips inventory removal (line 304-313), sets `inventory_change_id = None` (line 305), status = COMPLETED
4. Call `undo_line(pick_list_id, line_id)` → raises InvalidOperationException at line 346-352 because `inventory_change_id is None`
5. User cannot undo the zero-quantity pick, breaking the workflow

---

## 4) Over-Engineering & Refactoring Opportunities

No over-engineering observed. The implementation is appropriately minimal:
- Service method is straightforward with clear validation steps
- API endpoint delegates to service without unnecessary logic
- Metrics integration follows existing patterns
- Test helpers reuse existing `_seed_kit_with_inventory()` fixture

---

## 5) Style & Consistency

No substantive consistency issues. The code follows established project patterns:
- Transaction scope handled via request boundary (implicit session commit)
- Error handling uses typed exceptions (`InvalidOperationException`, `RecordNotFoundException`)
- Metrics recording uses existing `MetricsService` protocol
- API decorators follow blueprint conventions (`@api.validate`, `@handle_api_errors`, `@inject`)

---

## 6) Tests & Deterministic Coverage (new/changed behavior only)

- Surface: `KitPickListService.update_line_quantity()`
- Scenarios:
  - Given OPEN pick list with OPEN line, When update_line_quantity called with valid quantity, Then line updated and timestamp refreshed (`tests/services/test_kit_pick_list_service.py::TestKitPickListService::test_update_line_quantity_updates_quantity_and_timestamp`)
  - Given OPEN line, When updated to 0, Then quantity is 0 and status remains OPEN (`test_update_line_quantity_allows_zero`)
  - Given OPEN line with quantity 8, When updated to 3, Then totals recalculate correctly (`test_update_line_quantity_recalculates_derived_totals`)
  - Given COMPLETED line, When update_line_quantity called, Then InvalidOperationException raised (`test_update_line_quantity_raises_for_completed_line`)
  - Given OPEN line on COMPLETED pick list, When update_line_quantity called, Then InvalidOperationException raised (`test_update_line_quantity_raises_for_completed_pick_list`)
  - Given nonexistent pick_list_id or line_id, When update_line_quantity called, Then RecordNotFoundException raised (`test_update_line_quantity_raises_for_nonexistent_pick_list`, `test_update_line_quantity_raises_for_nonexistent_line`, `test_update_line_quantity_raises_for_line_from_different_pick_list`)
  - Given pick list with one zero-quantity OPEN line and one non-zero OPEN line, When non-zero line picked, Then pick list remains OPEN (`test_zero_quantity_line_blocks_pick_list_completion`)
  - Given pick list with only zero-quantity OPEN line, When pick_line called, Then line and pick list transition to COMPLETED (`test_zero_quantity_line_can_be_picked_for_completion`)
- Hooks: `PickListMetricsStub` added `line_quantity_updates` list at line 35; `record_pick_list_line_quantity_updated()` implemented at line 55-57
- Gaps: **CRITICAL** — No test for undoing a zero-quantity picked line. This gap allowed the Blocker issue to slip through. Add test:
  ```python
  def test_undo_line_handles_zero_quantity_picked_line(
      self, session, kit_pick_list_service: KitPickListService
  ) -> None:
      # Create pick list, update line to zero, pick it, then undo
      kit = _create_active_kit(session)
      part = _create_part(session, "UND0", "Undo zero part")
      _attach_content(session, kit, part, required_per_unit=5)
      location = _create_location(session, box_no=250, loc_no=1)
      _attach_location(session, part, location, qty=10)

      pick_list = kit_pick_list_service.create_pick_list(kit.id, requested_units=1)
      session.flush()
      line = pick_list.lines[0]

      kit_pick_list_service.update_line_quantity(pick_list.id, line.id, 0)
      session.flush()
      kit_pick_list_service.pick_line(pick_list.id, line.id)
      session.flush()

      # Should not raise; line should return to OPEN with quantity still 0
      kit_pick_list_service.undo_line(pick_list.id, line.id)
      session.flush()

      refreshed_line = session.get(KitPickListLine, line.id)
      assert refreshed_line.status == PickListLineStatus.OPEN
      assert refreshed_line.quantity_to_pick == 0
  ```
- Evidence: `tests/services/test_kit_pick_list_service.py:645-872`, `tests/api/test_pick_lists_api.py:252-414`

- Surface: PATCH `/pick-lists/<pick_list_id>/lines/<line_id>` API endpoint
- Scenarios:
  - Given valid pick list and line, When PATCH with {"quantity_to_pick": 3}, Then 200 response with updated detail (`tests/api/test_pick_lists_api.py::TestPickListsApi::test_update_pick_list_line_quantity_updates_quantity`)
  - Given valid request, When PATCH with {"quantity_to_pick": 0}, Then 200 response and line quantity is 0 (`test_update_pick_list_line_quantity_allows_zero`)
  - Given successful update, When response inspected, Then updated_at is recent and totals recalculate (`test_update_pick_list_line_quantity_updates_timestamp`)
  - Given missing quantity_to_pick, When PATCH, Then 400 Bad Request (`test_update_pick_list_line_quantity_missing_field_returns_400`)
  - Given negative quantity_to_pick, When PATCH, Then 400 Bad Request (`test_update_pick_list_line_quantity_negative_returns_400`)
  - Given nonexistent pick_list_id or line_id, When PATCH, Then 404 Not Found (`test_update_pick_list_line_quantity_nonexistent_pick_list_returns_404`, `test_update_pick_list_line_quantity_nonexistent_line_returns_404`)
  - Given COMPLETED line or pick list, When PATCH, Then 409 Conflict (`test_update_pick_list_line_quantity_completed_line_returns_409`, `test_update_pick_list_line_quantity_completed_pick_list_returns_409`)
- Hooks: `_seed_kit_with_inventory()` helper reused; service methods called to mark lines COMPLETED
- Gaps: None for API surface; gaps exist at service layer (undo test missing)
- Evidence: `tests/api/test_pick_lists_api.py:252-414`

- Surface: Database migration `019_relax_pick_list_line_quantity_constraint`
- Scenarios:
  - Given existing constraint `>= 1`, When migration applied, Then constraint updated to `>= 0` (verified manually via upgrade test in development)
  - Given relaxed constraint, When downgrade applied, Then constraint reverts to `>= 1` (downgrade function present)
- Hooks: Migration uses `op.drop_constraint` and `op.create_check_constraint`
- Gaps: No automated test verifies migration succeeds; constraint test updated in `tests/test_database_constraints.py:524-569` to allow zero and reject negative
- Evidence: `alembic/versions/019_relax_pick_list_line_quantity_constraint.py:20-51`, `tests/test_database_constraints.py:524-569`

---

## 7) Adversarial Sweep (must attempt ≥3 credible failures or justify none)

**Attempted attacks:**

1. **Zero-quantity undo path** (found Blocker):
   - Attack: Create line with quantity 10, update to 0, pick it, then undo it
   - Evidence: `app/services/kit_pick_list_service.py:346-352` checks `inventory_change_id is None` and raises exception
   - Failure: `undo_line()` raises InvalidOperationException because zero-quantity picks set `inventory_change_id = None` (line 305 in `pick_line()`)
   - Result: **BLOCKER FOUND** (documented in section 3)

2. **Derived totals after zero-quantity update** (passed):
   - Attack: Update line to 0 and check if `total_quantity_to_pick`, `remaining_quantity` compute correctly
   - Evidence: `app/models/kit_pick_list.py:114-128` properties sum across all lines; zero contributes neutrally to sums
   - Protection: Test `test_update_line_quantity_recalculates_derived_totals` verifies totals update; zero-quantity test `test_update_pick_list_line_quantity_allows_zero` confirms zero is stored
   - Result: **PASSED** — derived properties correctly sum including zero values; no filtering that could orphan state

3. **Concurrent updates to same line** (passed):
   - Attack: Two requests simultaneously update the same line's quantity
   - Evidence: `app/services/kit_pick_list_service.py:479-503` uses `.with_for_update()` at line 498 to acquire row lock
   - Protection: `_get_line_for_update()` serializes concurrent updates via database row lock; second request waits for first to commit
   - Result: **PASSED** — row lock prevents concurrent quantity updates from racing

4. **Migration ordering / constraint violation on zero** (passed):
   - Attack: Deploy new code before migration runs; PATCH with quantity=0
   - Evidence: `alembic/versions/019_relax_pick_list_line_quantity_constraint.py:30-34` creates constraint `>= 0`; `app/models/kit_pick_list_line.py:48` defines same constraint in model
   - Protection: Plan section 15 documents deployment order requirement (migrate first); constraint violation surfaces as 500 error if order is wrong
   - Result: **PASSED** — deployment ordering documented; failure mode is clear (database rejects insert/update); no silent corruption

5. **Metrics instrumentation gap** (passed):
   - Attack: Check if zero-quantity updates emit metrics
   - Evidence: `app/services/kit_pick_list_service.py:416-421` calls `record_pick_list_line_quantity_updated()` unconditionally after successful update, regardless of quantity value
   - Protection: Metrics stub test `test_update_line_quantity_updates_quantity_and_timestamp` at line 673 verifies metrics call with actual values
   - Result: **PASSED** — metrics recorded for all quantity updates including zero

6. **Pick list completion logic with mixed zero/non-zero lines** (passed):
   - Attack: Create pick list with two lines, update one to zero, pick the non-zero line, check if pick list incorrectly completes
   - Evidence: `app/services/kit_pick_list_service.py:322-327` checks `all(sibling.status is PickListLineStatus.COMPLETED for sibling in pick_list.lines)`; zero-quantity OPEN lines block completion
   - Protection: Test `test_zero_quantity_line_blocks_pick_list_completion` at line 818 explicitly verifies pick list remains OPEN when zero-quantity line is unpicked
   - Result: **PASSED** — completion logic correctly requires all lines (including zero-quantity) to be marked COMPLETED

---

## 8) Invariants Checklist (stacked entries)

- Invariant: A line's `quantity_to_pick` must always be >= 0 after creation or update
  - Where enforced: Database check constraint (`alembic/versions/019_relax_pick_list_line_quantity_constraint.py:33`), Pydantic schema validation (`app/schemas/pick_list.py:27-28`), model constraint (`app/models/kit_pick_list_line.py:48`)
  - Failure mode: Negative quantity bypassing validation could corrupt derived totals and picking logic
  - Protection: Three-layer defense (schema, model, database); test `test_update_pick_list_line_quantity_negative_returns_400` and constraint test `test_pick_list_line_quantity_non_negative` verify rejection
  - Evidence: `app/schemas/pick_list.py:27-28` (ge=0), `tests/test_database_constraints.py:567-569` (negative rejected)

- Invariant: Derived pick list totals must reflect the sum of all line quantities (including zero)
  - Where enforced: Model properties compute totals on access (`app/models/kit_pick_list.py:114-128`); no caching or denormalization
  - Failure mode: Filtering lines before summing could cause totals to drift from actual line quantities
  - Protection: Properties are read-only and query unfiltered `pick_list.lines`; test `test_update_line_quantity_recalculates_derived_totals` verifies totals match after update
  - Evidence: `app/models/kit_pick_list.py:114-116` (total_quantity_to_pick), `tests/services/test_kit_pick_list_service.py:703-713` (totals verification)

- Invariant: Zero-quantity picked lines must have `inventory_change_id = None` and `status = COMPLETED`
  - Where enforced: `pick_line()` method sets `inventory_change_id = None` when `quantity_to_pick == 0` (`app/services/kit_pick_list_service.py:305-313`), then marks status COMPLETED (line 318)
  - Failure mode: **CURRENTLY BROKEN** — `undo_line()` assumes all COMPLETED lines have `inventory_change_id` populated (line 346-352), violating this invariant for zero-quantity picks
  - Protection: Test `test_zero_quantity_line_can_be_picked_for_completion` verifies zero-quantity pick succeeds, but **no test verifies undo**, allowing the violation to exist
  - Evidence: `app/services/kit_pick_list_service.py:305-313` (pick sets None), `app/services/kit_pick_list_service.py:346-352` (undo rejects None) — **BLOCKER**

- Invariant: COMPLETED lines cannot be edited; OPEN lines on COMPLETED pick lists cannot be edited
  - Where enforced: `update_line_quantity()` checks line status at line 392-395 and pick list status at line 398-402
  - Failure mode: Editing completed lines could desync quantities from inventory history; editing lines on completed pick lists violates completion semantics
  - Protection: Service raises `InvalidOperationException` on status violations; tests `test_update_line_quantity_raises_for_completed_line` and `test_update_line_quantity_raises_for_completed_pick_list` verify rejection
  - Evidence: `app/services/kit_pick_list_service.py:392-402`, `tests/services/test_kit_pick_list_service.py:728-759`

---

## 9) Questions / Needs-Info

No unresolved questions. The Blocker issue is well-defined and the fix is clear.

---

## 10) Risks & Mitigations (top 3)

- Risk: Zero-quantity picked lines cannot be undone due to `inventory_change_id` check (Blocker)
  - Mitigation: Add zero-quantity guard in `undo_line()` before inventory_change_id check (see section 3 fix)
  - Evidence: `app/services/kit_pick_list_service.py:346-352` (failure point), section 3 finding (fix proposal)

- Risk: Migration file is untracked in git, could be omitted from deployment
  - Mitigation: Add migration file to git before committing this feature (`git add alembic/versions/019_relax_pick_list_line_quantity_constraint.py`)
  - Evidence: `git status` output shows `??` for migration file; plan section 15 emphasizes migration must run before deployment

- Risk: Deployment ordering (migration before code) not enforced by automation
  - Mitigation: Document migration requirement in deployment notes; consider adding migration check to application startup
  - Evidence: Plan section 15 risk 3 documents deployment order; no automated safeguard in code

---

## 11) Confidence

Confidence: Low — One Blocker issue prevents the feature from shipping; the undo path for zero-quantity lines is broken and must be fixed before deployment, and a test must be added to verify the fix.

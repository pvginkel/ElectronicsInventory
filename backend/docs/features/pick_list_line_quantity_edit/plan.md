# Pick List Line Quantity Edit — Technical Plan

## 0) Research Log & Findings

**Areas Researched**

- Pick list data model (`app/models/kit_pick_list.py`, `app/models/kit_pick_list_line.py`)
- Pick list service layer (`app/services/kit_pick_list_service.py`)
- Pick list API endpoints (`app/api/pick_lists.py`)
- Pick list schemas (`app/schemas/pick_list.py`)
- Existing PATCH endpoint patterns in `app/api/kits.py` for content updates
- Update schema patterns across the codebase (shopping list lines, kits, boxes)
- Service container and dependency injection wiring
- Test patterns in `tests/api/test_pick_lists_api.py`

**Key Findings**

1. **Model constraints**: `KitPickListLine.quantity_to_pick` has a database check constraint requiring `>= 1` (line 48-50 in `kit_pick_list_line.py`). This conflicts with the change brief's requirement to allow `quantity_to_pick >= 0`. The constraint must be updated via migration.

2. **Status validation**: The model has separate `OPEN` and `COMPLETED` statuses for both pick lists and lines. Lines track `inventory_change_id` when picked, linking to the quantity history entry created during picking.

3. **Derived properties**: The pick list model computes aggregates like `total_quantity_to_pick`, `picked_quantity`, and `remaining_quantity` from line quantities (lines 114-128). These are read from the model as properties and exposed through the schema as regular fields.

4. **Service patterns**: The existing `KitPickListService` uses `_get_line_for_update()` which locks the line row for updates. Service methods delegate to `inventory_service` for stock changes and `metrics_service` for observability.

5. **API patterns**: The existing `pick_lists_bp` follows a nested route structure: `/pick-lists/<pick_list_id>/lines/<line_id>/pick`. The change brief suggests `/pick-lists/<pick_list_id>/lines/<line_id>` with PATCH method, consistent with `/kits/<kit_id>/contents/<content_id>` PATCH pattern.

6. **Existing endpoints**: The blueprint is already wired in `app/__init__.py` at line 132 as `app.api.pick_lists`.

**Conflicts Resolved**

- Database constraint vs requirement: The change brief requires `quantity_to_pick >= 0` but the current constraint is `>= 1`. Resolution: update the constraint in a migration to allow `>= 0`, making zero a valid "skip this line" sentinel value.
- No other conflicts identified; the feature fits naturally into the existing architecture.

**Test Data Verification**

Reviewed `app/data/test_data/kit_pick_list_lines.json`. All existing test data lines have `quantity_to_pick` values of 1, 2, or 4 (all >= 1). The constraint change from `>= 1` to `>= 0` is additive (allows more values), so existing test data remains valid. No test data updates required.

---

## 1) Intent & Scope

**User intent**

Allow users to adjust the `quantity_to_pick` for individual pick list lines after creation, enabling partial builds or build variants that differ from the kit's default template quantities.

**Prompt quotes**

"Allow users to adjust quantities after creation"
"A kit defines 12 PhotoMOS relays as required, but for a specific build variant only 2 are needed"
"Quantity must be >= 0 (0 is allowed to skip picking a part without deleting the line)"
"Line must be in `OPEN` status (cannot edit already-picked lines)"
"Pick list must be in `OPEN` status"

**In scope**

- Add PATCH endpoint at `/pick-lists/<pick_list_id>/lines/<line_id>` accepting `quantity_to_pick`
- Validate pick list and line status (both must be `OPEN`)
- Validate quantity range (`>= 0`, no upper bound)
- Update line's `quantity_to_pick` field in database
- Update pick list's `updated_at` timestamp
- Return updated pick list detail payload
- Create database migration to relax check constraint from `>= 1` to `>= 0`
- Add comprehensive service and API tests for new behavior

**Out of scope**

- Deleting lines (use quantity 0 as workaround)
- Editing other line fields (location, part, kit_content)
- Recalculating or rebalancing allocations across multiple locations
- Changing quantities on `COMPLETED` lines or pick lists
- Optimistic concurrency control (version fields)

**Assumptions / constraints**

- The pick list allocation algorithm during creation is unchanged; this only edits post-creation.
- Setting quantity to 0 means "skip this line" but the line remains in the database for audit purposes.
- The frontend will handle UX for distinguishing zero-quantity lines from deleted/removed lines.
- No automatic reallocation when quantity is reduced; user must manually adjust other lines if needed.
- Database migration runs before the new endpoint is deployed.

---

## 2) Affected Areas & File Map

- Area: `app/models/kit_pick_list_line.py`
- Why: Relax check constraint to allow `quantity_to_pick >= 0`
- Evidence: `kit_pick_list_line.py:48-50` — `CheckConstraint("quantity_to_pick >= 1", ...)` must change to `>= 0`

- Area: `alembic/versions/<new_migration>.py`
- Why: Create migration to ALTER TABLE check constraint
- Evidence: Migration required to update `ck_pick_list_lines_quantity_positive` from `>= 1` to `>= 0`

- Area: `app/schemas/pick_list.py`
- Why: Add `PickListLineQuantityUpdateSchema` for PATCH request validation
- Evidence: `pick_list.py:13-21` — existing create schema pattern; update schema follows same conventions as `shopping_list_line.py:38-57`

- Area: `app/services/kit_pick_list_service.py`
- Why: Add `update_line_quantity()` method to validate and persist changes
- Evidence: `kit_pick_list_service.py:25-39` — service constructor already has db, metrics_service dependencies; new method follows patterns from `pick_line()` at line 284

- Area: `app/api/pick_lists.py`
- Why: Add PATCH endpoint `/pick-lists/<pick_list_id>/lines/<line_id>`
- Evidence: `pick_lists.py:111-133` — existing `/lines/<line_id>/pick` POST pattern; PATCH follows `kits.py:206-240` pattern

- Area: `tests/services/test_kit_pick_list_service.py`
- Why: Add service tests for `update_line_quantity()` covering success, validation, and error cases
- Evidence: Existing test file for pick list service

- Area: `tests/api/test_pick_lists_api.py`
- Why: Add API tests for PATCH endpoint covering status codes, request validation, and error conditions
- Evidence: `test_pick_lists_api.py:16-54` — existing test setup helper `_seed_kit_with_inventory()`

---

## 3) Data Model / Contracts

- Entity / contract: `KitPickListLine` model
- Shape: `quantity_to_pick` constraint updated from `>= 1` to `>= 0`
- Refactor strategy: Migration updates constraint in place; no back-compat needed (constraint change is additive, allows more values)
- Evidence: `kit_pick_list_line.py:48-50`

- Entity / contract: `PickListLineQuantityUpdateSchema` (new)
- Shape:
  ```json
  {
    "quantity_to_pick": 4
  }
  ```
  Field: `quantity_to_pick` (int, required, `>= 0`)
- Refactor strategy: New schema; no back-compat concerns
- Evidence: Pattern from `shopping_list_line.py:38-57` and `kit.py:260-275`

- Entity / contract: PATCH request body
- Shape: Same as `PickListLineQuantityUpdateSchema`
- Refactor strategy: New endpoint; no existing contract to break
- Evidence: `kits.py:206-240` PATCH pattern

- Entity / contract: PATCH response body
- Shape: `KitPickListDetailSchema` (existing)
- Refactor strategy: Reuse existing response schema; no changes needed
- Evidence: `pick_list.py:167-178` and `pick_lists.py:89-90`

---

## 4) API / Integration Surface

- Surface: PATCH `/pick-lists/<pick_list_id>/lines/<line_id>`
- Inputs:
  - Path: `pick_list_id` (int), `line_id` (int)
  - Body: `{"quantity_to_pick": <int>}` where int >= 0
- Outputs:
  - 200 OK: `KitPickListDetailSchema` (full pick list with updated line)
  - Side effect: `kit_pick_list_lines.quantity_to_pick` updated; `kit_pick_lists.updated_at` refreshed
- Errors:
  - 400: Invalid payload (missing field, negative quantity)
  - 404: Pick list or line not found
  - 409: Line or pick list status is COMPLETED (cannot edit after picking)
- Evidence: `pick_lists.py:111-133` (existing line actions); `kits.py:206-240` (PATCH pattern)

---

## 5) Algorithms & State Machines

- Flow: Update line quantity
- Steps:
  1. Validate request payload against `PickListLineQuantityUpdateSchema` (quantity_to_pick >= 0)
  2. Fetch line with `_get_line_for_update(pick_list_id, line_id)` (row lock for concurrency)
  3. Check line.status == OPEN; if COMPLETED raise InvalidOperationException
  4. Check line.pick_list.status == OPEN; if COMPLETED raise InvalidOperationException
  5. Update line.quantity_to_pick to new value
  6. Update line.pick_list.updated_at to current UTC timestamp
  7. Flush session
  8. Record metrics via `metrics_service.record_pick_list_line_quantity_updated(line_id, old_qty, new_qty)`
  9. Fetch and return detailed pick list via `get_pick_list_detail(pick_list_id)`
- States / transitions: Line and pick list must both be in OPEN status; no state transitions occur (remains OPEN)
- Hotspots: Row lock acquisition on line; simple update, no inventory operations or complex queries
- Evidence: `kit_pick_list_service.py:284-330` (pick_line flow); `kit_pick_list_service.py:434-458` (_get_line_for_update)

---

## 6) Derived State & Invariants

- Derived value: `KitPickList.total_quantity_to_pick`
  - Source: Sum of `quantity_to_pick` across all lines in `pick_list.lines` (unfiltered)
  - Writes / cleanup: Read-only derived property computed on access; no writes
  - Guards: Property defined on model (line 114-116); consumed by schema as regular field
  - Invariant: Must reflect sum of all line quantities including zero-quantity lines
  - Evidence: `kit_pick_list.py:114-116`

- Derived value: `KitPickList.remaining_quantity`
  - Source: `total_quantity_to_pick - picked_quantity` where `picked_quantity` sums quantities for COMPLETED lines only (filtered by status)
  - Writes / cleanup: Read-only property; no persistence
  - Guards: Computed from filtered view (COMPLETED lines); safe because no writes triggered
  - Invariant: Must correctly exclude zero-quantity OPEN lines from remaining count
  - Evidence: `kit_pick_list.py:125-128`

- Derived value: Pick list completion status
  - Source: All lines have `status == COMPLETED`
  - Writes / cleanup: When last OPEN line is picked, pick list transitions to COMPLETED and sets `completed_at`
  - Guards: Checked in `pick_line()` service method (line 318-323); no guard needed for quantity update since status doesn't change
  - Invariant: Completion logic must not be affected by zero-quantity lines (they remain OPEN until explicitly picked or pick list deleted)
  - Evidence: `kit_pick_list_service.py:318-323`

**Completion behavior with zero-quantity lines**: When a line's `quantity_to_pick` is set to 0, the line remains in `OPEN` status. To complete the pick list, users must explicitly call the `/pick` endpoint on zero-quantity lines. This "picks" 0 items (a no-op for inventory) but transitions the line to `COMPLETED`, allowing the pick list to complete. This is intentional: users who reduce quantity to 0 are choosing to skip the part, not delete the line, and must acknowledge the skip by marking it picked.

---

## 7) Consistency, Transactions & Concurrency

- Transaction scope: HTTP request boundary; service method wrapped in API endpoint transaction
- Atomic requirements: Line update and pick list timestamp update must succeed together or roll back
- Retry / idempotency: No idempotency key; retrying identical PATCH with same quantity is safe (simple field update); concurrent updates to different lines are safe (different rows); concurrent updates to same line serialized by row lock
- Ordering / concurrency controls: `_get_line_for_update()` uses `.with_for_update()` (line 453) for row-level lock; prevents concurrent quantity edits to same line
- Evidence: `kit_pick_list_service.py:434-458` (row lock); `kit_pick_list_service.py:325` (flush after updates)

---

## 8) Errors & Edge Cases

- Failure: `quantity_to_pick` field missing or not an integer
- Surface: PATCH API endpoint
- Handling: 400 Bad Request with Pydantic validation error; SpectTree automatic validation
- Guardrails: Schema validation via `@api.validate(json=PickListLineQuantityUpdateSchema)`
- Evidence: `pick_lists.py:26-34` (existing validation pattern)

- Failure: `quantity_to_pick` is negative (< 0)
- Surface: PATCH API endpoint
- Handling: 400 Bad Request with validation error "quantity_to_pick must be >= 0"
- Guardrails: Pydantic `Field(ge=0)` constraint in schema
- Evidence: `shopping_list_line.py:48` (ge constraint pattern)

- Failure: Pick list not found for given `pick_list_id`
- Surface: Service method `update_line_quantity()`
- Handling: RecordNotFoundException raised; converted to 404 by `@handle_api_errors`
- Guardrails: `_get_line_for_update()` raises RecordNotFoundException if line not found (line 457)
- Evidence: `kit_pick_list_service.py:455-457`

- Failure: Line not found or line belongs to different pick list
- Surface: Service method `update_line_quantity()`
- Handling: RecordNotFoundException raised (line doesn't match pick_list_id and line_id pair); converted to 404
- Guardrails: `_get_line_for_update()` filters by both pick_list_id and line_id (line 449-452)
- Evidence: `kit_pick_list_service.py:449-457`

- Failure: Line status is COMPLETED
- Surface: Service method `update_line_quantity()`
- Handling: InvalidOperationException "cannot edit completed pick list line"; converted to 409 Conflict
- Guardrails: Status check after fetching line with lock
- Evidence: `kit_pick_list_service.py:287-291` (similar check in pick_line)

- Failure: Pick list status is COMPLETED
- Surface: Service method `update_line_quantity()`
- Handling: InvalidOperationException "cannot edit lines on completed pick list"; converted to 409 Conflict
- Guardrails: Check line.pick_list.status after fetching
- Evidence: Similar pattern in `kit_pick_list_service.py:402-406` (status check on kit)

- Failure: Setting quantity to 0 on a line
- Surface: Service method and API
- Handling: Success; 0 is valid (means "skip this line")
- Guardrails: Constraint updated to allow >= 0; frontend handles UX
- Evidence: Change brief line 21-22

---

## 9) Observability / Telemetry

- Signal: `pick_list_line_quantity_updated`
- Type: Counter with histogram for delta
- Trigger: After successful quantity update in service method
- Labels / fields: `pick_list_id`, `line_id`, `old_quantity`, `new_quantity`, `delta` (new - old)
- Consumer: Metrics dashboard; track frequency and magnitude of quantity adjustments
- Evidence: `kit_pick_list_service.py:326-329` (existing metrics pattern for line actions)

**Method signature** (to add to `MetricsServiceProtocol` and `MetricsService`):
```python
def record_pick_list_line_quantity_updated(
    self, line_id: int, old_quantity: int, new_quantity: int
) -> None:
    """Record quantity adjustment on a pick list line."""
```
The method increments a counter and records the delta in a histogram. Labels: `line_id` for tracing.

---

## 10) Background Work & Shutdown

None. This is a synchronous HTTP request with no background threads, jobs, or shutdown coordination required.

---

## 11) Security & Permissions

Not applicable. Single-user application with no authentication or authorization layer.

---

## 12) UX / UI Impact

- Entry point: Pick list detail page (likely displays list of lines)
- Change: Add edit control on each OPEN line to adjust `quantity_to_pick`; disable control for COMPLETED lines; show visual indication for zero-quantity lines
- User interaction: User edits quantity field inline, submits via PATCH, sees updated pick list with recalculated totals
- Dependencies: Frontend must call PATCH endpoint and refresh detail view; must respect status validation (disable edit for COMPLETED)
- Evidence: Backend returns full detail schema with updated quantities and derived totals

---

## 13) Deterministic Test Plan

- Surface: `KitPickListService.update_line_quantity()`
- Scenarios:
  - Given an OPEN pick list with an OPEN line, When update_line_quantity called with valid quantity, Then line.quantity_to_pick updated and pick_list.updated_at refreshed
  - Given an OPEN line with quantity 10, When updated to 5, Then total_quantity_to_pick and remaining_quantity recalculated correctly
  - Given an OPEN line, When updated to 0, Then line.quantity_to_pick == 0 and no exception raised
  - Given a COMPLETED line, When update_line_quantity called, Then InvalidOperationException raised with message "cannot edit completed pick list line"
  - Given an OPEN line on COMPLETED pick list, When update_line_quantity called, Then InvalidOperationException raised with message "cannot edit lines on completed pick list"
  - Given nonexistent pick_list_id or line_id, When update_line_quantity called, Then RecordNotFoundException raised
  - Given a pick list with one zero-quantity OPEN line and one non-zero OPEN line, When the non-zero line is picked, Then pick list remains OPEN (zero-quantity line still blocks completion)
  - Given a pick list with only a zero-quantity OPEN line, When pick_line called on it, Then line transitions to COMPLETED, pick list transitions to COMPLETED, and no inventory change occurs (quantity=0)
- Fixtures / hooks: Existing `_seed_kit_with_inventory()` helper in API tests; service tests use container fixture and session
- Gaps: None; comprehensive coverage of success and error paths
- Evidence: `test_pick_lists_api.py:16-54` (test setup); `kit_pick_list_service.py:284-330` (pick_line tests provide pattern)

- Surface: PATCH `/pick-lists/<pick_list_id>/lines/<line_id>` API endpoint
- Scenarios:
  - Given valid pick list and line, When PATCH with {"quantity_to_pick": 3}, Then 200 response with KitPickListDetailSchema
  - Given valid request, When PATCH with {"quantity_to_pick": 0}, Then 200 response and line quantity is 0
  - Given missing quantity_to_pick in body, When PATCH, Then 400 Bad Request
  - Given negative quantity_to_pick, When PATCH, Then 400 Bad Request with validation error
  - Given nonexistent pick_list_id, When PATCH, Then 404 Not Found
  - Given nonexistent line_id, When PATCH, Then 404 Not Found
  - Given COMPLETED line, When PATCH, Then 409 Conflict
  - Given COMPLETED pick list, When PATCH, Then 409 Conflict
  - Given successful update, When response inspected, Then updated_at timestamp is recent and total_quantity_to_pick reflects new value
- Fixtures / hooks: `_seed_kit_with_inventory()` helper; mark lines as COMPLETED via service.pick_line() for error tests
- Gaps: None
- Evidence: `test_pick_lists_api.py:60-100` (existing endpoint tests)

---

## 14) Implementation Slices

Not applicable. This is a small, self-contained feature that should be implemented atomically in a single slice.

---

## 15) Risks & Open Questions

- Risk: Allowing zero quantity might confuse UX if not clearly distinguished from deleted lines
- Impact: Medium; users might not understand zero-quantity lines in UI
- Mitigation: Document in change brief; frontend team must handle visual distinction

- Risk: Derived properties (total_quantity_to_pick, remaining_quantity) must correctly handle zero-quantity lines
- Impact: Low; properties are simple sums; zero is neutral in arithmetic
- Mitigation: Add explicit test case verifying totals with zero-quantity line

- Risk: Database migration ordering if deployed before constraint relaxation
- Impact: High; PATCH requests with quantity=0 will fail with constraint violation
- Mitigation: Ensure migration runs before API deployment; document deployment order

**Deployment order**: The database migration (relaxing constraint to >= 0) MUST be applied before deploying the new API endpoint. Run `poetry run python -m app.cli upgrade-db` before starting the updated application. This is standard practice for additive schema changes.

---

## 16) Confidence

Confidence: High — The feature is a straightforward CRUD update on a single field with clear validation rules, following established patterns in the codebase. The primary risk is the database constraint migration, which is low-risk given the additive nature (relaxing from >= 1 to >= 0). All integration points (service, API, schemas, tests) have clear precedents.

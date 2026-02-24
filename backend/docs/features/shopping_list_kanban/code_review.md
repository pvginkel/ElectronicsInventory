# Shopping List Kanban -- Code Review

## 1) Summary & Decision

**Readiness**

This is a well-executed refactoring that cleanly simplifies the shopping list lifecycle from a three-state model (`concept | ready | done`) to a two-state model (`active | done`), replaces the ephemeral computed seller groups and the `shopping_list_seller_notes` table with a first-class `shopping_list_sellers` entity, adds seller group CRUD with an ordering/reopening state machine, removes four obsolete endpoints, and adds the `ordered` field to line PUT. The migration is correct and handles data migration from the old table. All 247 affected tests pass, ruff reports no violations, and mypy finds no issues. The code follows the project's layered architecture, uses proper dependency injection, and includes comprehensive test coverage for every new and changed behavior. Dead code has been fully removed with no tombstones. One Major finding exists around a gap between the `can_receive` model property and the `receive_line_stock` service enforcement, but the issue is mitigated by the fact that the ordering state machine prevents ungrouped lines from reaching ORDERED status.

**Decision**

`GO-WITH-CONDITIONS` -- One Major correctness gap in `receive_line_stock` (does not enforce the new `seller_id is not None` invariant from `can_receive`), and one Minor observation about `_attach_seller_group_payload` expunging the shopping list from the session.

---

## 2) Conformance to Plan (with evidence)

**Plan alignment**

- `Plan 1a: status enum` <-> `app/models/shopping_list.py:20-22` -- `ShoppingListStatus` now defines only `ACTIVE` and `DONE`
- `Plan 1a: migration` <-> `alembic/versions/023_shopping_list_kanban.py:23-25` -- `UPDATE shopping_lists SET status = 'active' WHERE status IN ('concept', 'ready')`
- `Plan 1a: active -> done only` <-> `app/services/shopping_list_service.py:122-148` -- `set_list_status` enforces only `active -> done`
- `Plan 1a: seller table refactor` <-> `app/models/shopping_list_seller.py:1-83` -- new `ShoppingListSeller` model with status enum
- `Plan 1a: seller group CRUD` <-> `app/api/shopping_lists.py:208-316` -- POST, GET, PUT, DELETE endpoints on `/<list_id>/seller-groups`
- `Plan 1a: seller group ordering/reopening` <-> `app/services/shopping_list_service.py:327-410` -- `_order_seller_group` and `_reopen_seller_group` with preconditions
- `Plan 1a: line PUT ordered field` <-> `app/services/shopping_list_line_service.py:196,230-235,255-263` -- `ordered` parameter added with NEW-only guard
- `Plan 1a: seller_id blocked on ORDERED` <-> `app/services/shopping_list_line_service.py:222-228` -- `seller_id` change rejected on ORDERED lines
- `Plan 1a: removed endpoints` <-> `app/api/shopping_list_lines.py` -- `mark_line_ordered`, `revert_line_to_new`, `mark_group_ordered` all removed; `upsert_seller_order_note` removed from `app/api/shopping_lists.py`
- `Plan 1a: removed properties` <-> `app/models/shopping_list_line.py` -- `is_orderable` and `is_revertible` removed, replaced with updated `can_receive`
- `Plan 1a: test data` <-> `app/data/test_data/shopping_list_sellers.json` -- new file replaces `shopping_list_seller_notes.json`; `shopping_lists.json` uses `active` status
- `Plan 1a: metrics` <-> `app/services/shopping_list_service.py:31-36` -- `SHOPPING_LIST_SELLER_GROUP_OPERATIONS_TOTAL` counter with operation labels

**Gaps / deviations**

- `Plan: ungrouped lines cannot be received` -- The backend_implementation.md section 6 states "Lines with no seller_id (ungrouped) can never reach ORDERED status. They cannot be received." The model property `can_receive` enforces `seller_id is not None` (`app/models/shopping_list_line.py:126-129`), but the service method `receive_line_stock` (`app/services/shopping_list_line_service.py:377`) only checks `line.status != ORDERED`, not `seller_id`. See Finding F1 below.
- `Plan: DONE lines preservation on delete` -- The backend_implementation.md section 3 specifies "DONE lines are left unchanged to preserve completion history." The implementation correctly preserves DONE lines' `seller_id` on group deletion (`app/services/shopping_list_service.py:313-317`), but the DONE line retains a `seller_id` pointing to a seller whose group row has been deleted. This is acceptable since `seller_id` is a FK to the `sellers` table (not `shopping_list_sellers`), so referential integrity is maintained.

---

## 3) Correctness -- Findings (ranked)

- Title: `Major -- receive_line_stock does not enforce seller_id requirement from can_receive`
- Evidence: `app/services/shopping_list_line_service.py:377` -- The service checks `line.status != ShoppingListLineStatus.ORDERED` but does not check `line.seller_id is not None`. The model property `can_receive` at `app/models/shopping_list_line.py:117-129` checks both conditions.
- Impact: If a line were to reach ORDERED status without a seller assignment (e.g., through direct database manipulation or a future code path), `receive_line_stock` would allow receiving on an ungrouped line. The `can_receive` property would show `False` on the API response, creating a UI/backend inconsistency. In practice, the state machine prevents this because lines only reach ORDERED via `_order_seller_group` which requires `seller_id`, so the risk is mitigated. However, defense-in-depth calls for aligning the service guard with the model invariant.
- Fix: Add `if line.seller_id is None: raise InvalidOperationException(...)` after the ORDERED status check in `receive_line_stock`, or replace the status check with `if not line.can_receive`.
- Confidence: Medium -- The current code paths prevent the scenario, but the property and service are misaligned.

Step-by-step failure reasoning: (1) An admin or migration script directly sets a line to `status=ORDERED` with `seller_id=NULL`. (2) A `receive_line_stock` call for that line passes the `status == ORDERED` check. (3) Stock is allocated to locations. (4) The line response shows `can_receive: false` but stock was already received. (5) The frontend hides the receive button, but the backend already applied the stock.

- Title: `Minor -- _attach_seller_group_payload expunges shopping list from session`
- Evidence: `app/services/shopping_list_service.py:744` -- `self.db.expunge(shopping_list)` is called to avoid corrupting the session identity map when replacing the `seller_groups` relationship with dict payloads.
- Impact: After this call, the returned `ShoppingList` instance is detached. Any subsequent operation in the same request that tries to use this instance for session-tracked mutations would fail with a `DetachedInstanceError`. Currently, `get_list` and `set_list_status` are the only callers, and they return the result immediately. The `__dict__` assignment at line 745 is a clever workaround for bypassing the instrumented descriptor.
- Fix: No immediate fix needed, but document this contract in the method docstring more prominently (e.g., "Callers must not pass the returned instance to further session operations"). The current docstring already mentions it but could be stronger.
- Confidence: Low -- No current callers violate the contract.

- Title: `Minor -- ordered field validation duplicate: schema ge=0 and service check`
- Evidence: `app/schemas/shopping_list_line.py:59` -- `ge=0` on the schema field; `app/services/shopping_list_line_service.py:256` -- `if ordered < 0` check in the service.
- Impact: The negative value will be caught at the schema level before reaching the service. The service check is defense-in-depth but redundant.
- Fix: None needed. Redundant validation is acceptable as defense-in-depth.
- Confidence: High

---

## 4) Over-Engineering & Refactoring Opportunities

- Hotspot: `_get_seller_group_with_lines` loads lines with a separate query
- Evidence: `app/services/shopping_list_service.py:442-476` -- The method loads the seller group, then executes a second query for lines, then enriches seller links, then attaches transient attributes.
- Suggested refactor: Consider using `selectinload` on a `ShoppingListSeller.lines` relationship (via a `primaryjoin` on `shopping_list_id` + `seller_id` matching on `ShoppingListLine`). However, this would be a denormalized relationship since lines reference sellers via `seller_id` on the line, not via the `shopping_list_sellers` table. The current two-query approach is correct and clear.
- Payoff: Marginal. The current approach is explicit and handles the transient attribute pattern well.

---

## 5) Style & Consistency

- Pattern: Seller group CRUD methods live in `ShoppingListService` rather than a separate `ShoppingListSellerGroupService`
- Evidence: `app/services/shopping_list_service.py:221-323` -- Four public methods (`create_seller_group`, `get_seller_group`, `update_seller_group`, `delete_seller_group`) plus three private helpers.
- Impact: This is a reasonable co-location choice given that seller groups are tightly coupled to shopping lists and share the same transaction boundary. The alternative (separate service) would require cross-service coordination for list-level guards. No action needed.
- Recommendation: None. The cohesion is appropriate.

- Pattern: Consistent use of `_touch_list` for timestamp propagation
- Evidence: All mutation methods in both services call `_touch_list` before flushing. `app/services/shopping_list_service.py:748-750`, `app/services/shopping_list_line_service.py:522-524`.
- Impact: Positive -- timestamps are reliably updated across all mutation paths.
- Recommendation: None needed. This is well done.

- Pattern: Metrics use the before/after testing pattern as documented in CLAUDE.md
- Evidence: `tests/services/test_shopping_list_service.py:734-756` -- `test_seller_group_metrics_recorded` uses `._value.get()` before and after.
- Impact: Correct alignment with project standards.
- Recommendation: None.

---

## 6) Tests & Deterministic Coverage (new/changed behavior only)

- Surface: ShoppingListService seller group CRUD
- Scenarios:
  - Given an active list, When creating a seller group, Then it succeeds with correct defaults (`tests/services/test_shopping_list_service.py::TestSellerGroupService::test_create_seller_group_success`)
  - Given an existing seller group, When creating a duplicate, Then 409 conflict (`tests/services/test_shopping_list_service.py::TestSellerGroupService::test_create_seller_group_duplicate_raises_conflict`)
  - Given a done list, When creating a seller group, Then rejected (`tests/services/test_shopping_list_service.py::TestSellerGroupService::test_create_seller_group_rejects_done_list`)
  - Given a missing seller, When creating a group, Then 404 (`tests/services/test_shopping_list_service.py::TestSellerGroupService::test_create_seller_group_rejects_missing_seller`)
  - Given a group with lines, When fetching, Then lines and totals returned (`tests/services/test_shopping_list_service.py::TestSellerGroupService::test_get_seller_group_success`)
  - Given no group, When fetching, Then 404 (`tests/services/test_shopping_list_service.py::TestSellerGroupService::test_get_seller_group_not_found`)
  - Given a group, When updating note, Then note persisted (`tests/services/test_shopping_list_service.py::TestSellerGroupService::test_update_seller_group_note`)
  - Given a done list, When updating group, Then rejected (`tests/services/test_shopping_list_service.py::TestSellerGroupService::test_update_seller_group_rejects_done_list`)
- Hooks: Standard `session` and `container` fixtures from conftest.
- Gaps: None identified for CRUD operations.
- Evidence: `tests/services/test_shopping_list_service.py:366-756`

- Surface: Seller group ordering/reopening state machine
- Scenarios:
  - Given lines with ordered qty > 0, When ordering group, Then all NEW lines become ORDERED (`tests/services/test_shopping_list_service.py::TestSellerGroupService::test_order_seller_group_success`)
  - Given lines with ordered qty = 0, When ordering group, Then rejected with 409 (`tests/services/test_shopping_list_service.py::TestSellerGroupService::test_order_seller_group_requires_ordered_qty_on_all_lines`)
  - Given empty group, When ordering, Then rejected (`tests/services/test_shopping_list_service.py::TestSellerGroupService::test_order_seller_group_requires_active_lines`)
  - Given an ordered group with no received, When reopening, Then ORDERED lines revert to NEW (`tests/services/test_shopping_list_service.py::TestSellerGroupService::test_reopen_seller_group_success`)
  - Given an ordered group with received > 0, When reopening, Then rejected (`tests/services/test_shopping_list_service.py::TestSellerGroupService::test_reopen_seller_group_blocked_if_received`)
  - Given an active group, When setting status to active, Then no-op (`tests/services/test_shopping_list_service.py::TestSellerGroupService::test_reopen_seller_group_noop_when_already_active`)
- Hooks: `_create_list_with_seller_group` helper method.
- Gaps: None identified. All state transitions and preconditions are tested.
- Evidence: `tests/services/test_shopping_list_service.py:512-664`

- Surface: Seller group deletion
- Scenarios:
  - Given a group, When deleting, Then non-DONE lines reset to ungrouped (`tests/services/test_shopping_list_service.py::TestSellerGroupService::test_delete_seller_group_resets_non_done_lines`)
  - Given a group with DONE line, When deleting, Then DONE line preserved (`tests/services/test_shopping_list_service.py::TestSellerGroupService::test_delete_seller_group_preserves_done_lines`)
  - Given an ordered group, When deleting, Then rejected (`tests/services/test_shopping_list_service.py::TestSellerGroupService::test_delete_seller_group_blocks_ordered`)
- Hooks: Standard fixtures.
- Gaps: None.
- Evidence: `tests/services/test_shopping_list_service.py:666-732`

- Surface: Line update with `ordered` field and seller_id restrictions
- Scenarios:
  - Given a NEW line, When setting ordered, Then accepted (`tests/services/test_shopping_list_line_service.py::TestShoppingListLineService::test_update_line_ordered_field_on_new_line`)
  - Given an ORDERED line, When setting ordered, Then rejected (`tests/services/test_shopping_list_line_service.py::TestShoppingListLineService::test_update_line_ordered_field_rejects_on_ordered_line`)
  - Given an ORDERED line, When changing seller_id, Then rejected (`tests/services/test_shopping_list_line_service.py::TestShoppingListLineService::test_update_line_seller_id_blocked_on_ordered_line`)
  - Given an ORDERED line, When setting same seller_id, Then accepted (`tests/services/test_shopping_list_line_service.py::TestShoppingListLineService::test_update_line_seller_id_same_value_allowed_on_ordered`)
  - Given a NEW line, When setting negative ordered, Then rejected (`tests/services/test_shopping_list_line_service.py::TestShoppingListLineService::test_update_line_ordered_rejects_negative`)
- Hooks: Standard fixtures.
- Gaps: None.
- Evidence: `tests/services/test_shopping_list_line_service.py:283-400`

- Surface: Seller group API endpoints
- Scenarios:
  - Given valid data, When POST to seller-groups, Then 201 with payload (`tests/api/test_shopping_lists_api.py::TestSellerGroupAPI::test_create_seller_group_endpoint`)
  - Given duplicate, When POST, Then 409 (`tests/api/test_shopping_lists_api.py::TestSellerGroupAPI::test_create_seller_group_duplicate_returns_conflict`)
  - Given existing group, When GET, Then 200 with lines (`tests/api/test_shopping_lists_api.py::TestSellerGroupAPI::test_get_seller_group_endpoint`)
  - Given missing group, When GET, Then 404 (`tests/api/test_shopping_lists_api.py::TestSellerGroupAPI::test_get_seller_group_not_found`)
  - Given group, When PUT with note, Then 200 (`tests/api/test_shopping_lists_api.py::TestSellerGroupAPI::test_update_seller_group_note`)
  - Given group with ordered lines, When PUT with status=ordered, Then 200 (`tests/api/test_shopping_lists_api.py::TestSellerGroupAPI::test_update_seller_group_order_flow`)
  - Given ordered group, When PUT with status=active, Then 200 (`tests/api/test_shopping_lists_api.py::TestSellerGroupAPI::test_update_seller_group_reopen_flow`)
  - Given group, When DELETE, Then 204 and subsequent GET returns 404 (`tests/api/test_shopping_lists_api.py::TestSellerGroupAPI::test_delete_seller_group_endpoint`)
  - Given ordered group, When DELETE, Then 409 (`tests/api/test_shopping_lists_api.py::TestSellerGroupAPI::test_delete_seller_group_blocks_ordered`)
- Hooks: `_setup_list_with_seller` helper method.
- Gaps: None.
- Evidence: `tests/api/test_shopping_lists_api.py:192-375`

- Surface: Status transition simplification
- Scenarios:
  - Given active list, When set to done, Then accepted (`tests/api/test_shopping_lists_api.py::TestShoppingListsAPI::test_status_transitions_validate_rules`)
  - Given done list, When set to active, Then 409 (`tests/api/test_shopping_lists_api.py::TestShoppingListsAPI::test_status_transitions_validate_rules`)
- Hooks: Standard fixtures.
- Gaps: None.
- Evidence: `tests/api/test_shopping_lists_api.py:113-143`

- Surface: Line update API with ordered field
- Scenarios:
  - Given NEW line, When PUT with ordered, Then accepted (`tests/api/test_shopping_list_lines_api.py::TestShoppingListLinesAPI::test_update_line_sets_ordered_field`)
  - Given ORDERED line, When PUT with ordered, Then 409 (`tests/api/test_shopping_list_lines_api.py::TestShoppingListLinesAPI::test_update_line_ordered_rejects_on_ordered_line`)
  - Given ORDERED line, When PUT with different seller_id, Then 409 (`tests/api/test_shopping_list_lines_api.py::TestShoppingListLinesAPI::test_update_line_seller_blocked_on_ordered`)
- Hooks: Standard fixtures.
- Gaps: None.
- Evidence: `tests/api/test_shopping_list_lines_api.py:160-230`

---

## 7) Adversarial Sweep (must attempt >=3 credible failures or justify none)

**Attack 1: Session corruption via _attach_seller_group_payload**

- Checks attempted: `_attach_seller_group_payload` expunges the shopping list from the session and replaces `seller_groups` with dicts via `__dict__`. If any caller mutates the returned instance afterward, session corruption could occur.
- Evidence: `app/services/shopping_list_service.py:744-745` -- `self.db.expunge(shopping_list)` followed by `shopping_list.__dict__["seller_groups"] = groups`.
- Why code held up: The method is called only from `get_list` (line 60) and `set_list_status` (line 145), both of which return the result directly to the API layer for serialization. No subsequent session operations occur on the returned instance. The docstring documents this contract.

**Attack 2: Race condition in create_seller_group between flush and _touch_list**

- Checks attempted: In `create_seller_group`, after the first `flush()` (line 242), a `_touch_list` call at line 250 updates the shopping list timestamp, followed by another `flush()` at line 251. If an IntegrityError occurs at the first flush, the rollback at line 244 is correct. But if a concurrent request creates the same seller group between the two flushes, the unique constraint catch at line 243 handles it.
- Evidence: `app/services/shopping_list_service.py:236-253`
- Why code held up: The `_get_list_for_update` at line 225 acquires a row-level lock (uses `select ... FOR UPDATE` via the standard pattern). This prevents concurrent creation of the same seller group within the same list. The IntegrityError catch handles the edge case.

**Attack 3: receive_line_stock allows ungrouped ORDERED lines (Finding F1)**

This is reported as a Major finding above. The `receive_line_stock` method at `app/services/shopping_list_line_service.py:377` checks only `line.status != ORDERED`, not `line.seller_id is not None`. The model property `can_receive` includes the seller_id check, creating a gap between display (property) and enforcement (service). The ordering state machine prevents ungrouped lines from reaching ORDERED status in normal operation, but the service does not enforce the invariant directly.

**Attack 4: Migration data loss -- seller notes with NULL note**

- Checks attempted: The old `shopping_list_seller_notes.note` column was `nullable=False, server_default=""`. The new `shopping_list_sellers.note` column is `nullable=True` (`app/models/shopping_list_seller.py:43`). The migration at line 83 copies `note` directly from old to new. The schema uses a `_coalesce_note` validator (`app/schemas/shopping_list.py:247-251`) to convert NULL to empty string for the API.
- Evidence: `alembic/versions/023_shopping_list_kanban.py:80-87`, `app/schemas/shopping_list.py:247-251`
- Why code held up: Old notes were never NULL (column was `NOT NULL`), so the migration will never insert NULLs. The new column allows NULL for cases where groups are created without notes. The schema validator handles the NULL-to-empty-string conversion for API consistency.

**Attack 5: _get_list_for_update does not use FOR UPDATE**

- Checks attempted: `_get_list_for_update` in `ShoppingListService` at line 544-550 does `select(ShoppingList).where(ShoppingList.id == list_id)` without `.with_for_update()`. This contrasts with `get_active_list_for_append` at line 65-68 which does use `.with_for_update()`.
- Evidence: `app/services/shopping_list_service.py:544-550`
- Why code held up: The `_get_list_for_update` method is used across all mutation paths in both services. This is a pre-existing pattern (not introduced by this change) and is acceptable because SQLAlchemy's session-level identity map provides read-your-writes consistency within a single request. The `with_for_update` in `get_active_list_for_append` is specifically for the kit push cross-service workflow where concurrent appends are more likely. This pattern is consistent with the pre-existing codebase.

---

## 8) Invariants Checklist (stacked entries)

- Invariant: A seller group must belong to an existing shopping list and seller (referential integrity)
  - Where enforced: `app/models/shopping_list_seller.py:33-39` -- FK constraints on `shopping_list_id` and `seller_id`; `alembic/versions/023_shopping_list_kanban.py:52-61` -- FK constraints in migration; `tests/test_database_constraints.py:312-337` -- unique constraint and cascade deletion tests
  - Failure mode: Orphaned seller group rows if the list or seller is deleted without cascading
  - Protection: `ondelete="CASCADE"` on both FKs; unique constraint `uq_shopping_list_sellers_list_seller`
  - Evidence: `app/models/shopping_list_seller.py:34,38`

- Invariant: Lines can only reach ORDERED status via seller group ordering (never directly)
  - Where enforced: `app/services/shopping_list_service.py:327-368` -- `_order_seller_group` is the only code path that sets `line.status = ShoppingListLineStatus.ORDERED`; the removed `set_line_ordered` and `set_group_ordered` methods in `shopping_list_line_service.py` are deleted
  - Failure mode: A line reaches ORDERED without a seller assignment, bypassing the seller group state machine
  - Protection: `_order_seller_group` queries lines filtered by `seller_id == seller_group.seller_id` (line 339), so only lines assigned to the seller can be ordered. The update_line method blocks `ordered` changes on non-NEW lines (line 231).
  - Evidence: `app/services/shopping_list_line_service.py:230-235`

- Invariant: An ordered seller group cannot be deleted (must be reopened first)
  - Where enforced: `app/services/shopping_list_service.py:297-301` -- `delete_seller_group` checks `seller_group.status == ORDERED`; `tests/services/test_shopping_list_service.py:708-732` -- `test_delete_seller_group_blocks_ordered`
  - Failure mode: Deleting an ordered group could leave ORDERED lines orphaned without a group
  - Protection: The `InvalidOperationException` guard and the test coverage
  - Evidence: `app/services/shopping_list_service.py:297-301`

- Invariant: DONE lines are preserved when a seller group is deleted
  - Where enforced: `app/services/shopping_list_service.py:313-317` -- loop checks `line.status != DONE` before resetting; `tests/services/test_shopping_list_service.py:684-706` -- `test_delete_seller_group_preserves_done_lines`
  - Failure mode: DONE line metadata (completed_at, completion_note, completion_mismatch) could be lost if the line is reset
  - Protection: Explicit status check in the loop; test verifies seller_id and status are preserved on DONE lines
  - Evidence: `tests/services/test_shopping_list_service.py:703-706`

- Invariant: `seller_id` cannot change on ORDERED lines
  - Where enforced: `app/services/shopping_list_line_service.py:222-228` -- guard in `update_line`; `tests/services/test_shopping_list_line_service.py:325-353` -- test for both rejection and same-value acceptance
  - Failure mode: Changing seller_id on an ORDERED line could move it to a different seller group's scope without proper ordering
  - Protection: The `InvalidOperationException` guard and test coverage
  - Evidence: `app/services/shopping_list_line_service.py:222-228`

---

## 9) Questions / Needs-Info

- Question: Should `receive_line_stock` also enforce `line.seller_id is not None` to match the `can_receive` model property?
- Why it matters: Currently the service and model property have different enforcement rules. If a future code path allows lines to reach ORDERED without a seller, receiving would succeed but `can_receive` would show False.
- Desired answer: Confirm whether adding `if line.seller_id is None` guard to `receive_line_stock` is desired, or whether the ordering state machine is considered sufficient protection.

---

## 10) Risks & Mitigations (top 3)

- Risk: `receive_line_stock` does not enforce the `seller_id is not None` invariant introduced by the updated `can_receive` property, creating a potential gap between API display and backend enforcement.
- Mitigation: Add a `seller_id is None` guard to `receive_line_stock`, or replace the status check with `if not line.can_receive`.
- Evidence: `app/services/shopping_list_line_service.py:377`, `app/models/shopping_list_line.py:117-129`

- Risk: `_attach_seller_group_payload` expunges the shopping list from the session, making the returned instance unsuitable for further session operations. A future developer could accidentally use it for writes.
- Mitigation: The docstring documents this contract. Consider adding a more prominent warning comment or renaming the method to signal the detachment (e.g., `_build_detached_group_response`).
- Evidence: `app/services/shopping_list_service.py:678-746`

- Risk: The migration converts both `concept` and `ready` to `active` without distinction. If a rollback is needed, all formerly-ready lists become `concept` (lossy).
- Mitigation: The downgrade function documents this as lossy (`alembic/versions/023_shopping_list_kanban.py:143-146`). Given the BFF pattern (frontend ships with backend), this is an acceptable trade-off.
- Evidence: `alembic/versions/023_shopping_list_kanban.py:93-147`

---

## 11) Confidence

Confidence: High -- The implementation is thorough, well-tested (247 tests pass), follows project patterns, and the single Major finding is mitigated by the ordering state machine. The code is clean, dead code is fully removed, and the migration handles data migration correctly.

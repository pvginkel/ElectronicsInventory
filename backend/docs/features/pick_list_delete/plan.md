# Pick List Delete Endpoint — Technical Plan

## 0) Research Log & Findings

**Areas Researched:**
- KitPickList model and relationships (app/models/kit_pick_list.py:27-135)
- KitPickListLine model and relationships (app/models/kit_pick_list_line.py:36-132)
- KitPickListService implementation (app/services/kit_pick_list_service.py:25-476)
- Pick list API endpoints (app/api/pick_lists.py:19-136)
- Related models: Kit, KitContent, QuantityHistory, Location, PartLocation
- Similar delete implementations: kits, shopping_lists, parts, boxes, types, sellers
- Existing test patterns for pick lists (tests/api/test_pick_lists_api.py, tests/services/test_kit_pick_list_service.py)

**Key Findings:**

1. **Cascade relationships already configured:** The KitPickList model has `cascade="all, delete-orphan"` configured for lines relationship at app/models/kit_pick_list.py:70-76. SQLAlchemy will handle line cleanup automatically when parent pick list is deleted.

2. **Foreign key cascades in place:**
   - KitPickListLine has `ondelete="CASCADE"` on pick_list_id (app/models/kit_pick_list_line.py:60-61)
   - KitPickList has `ondelete="CASCADE"` on kit_id (app/models/kit_pick_list.py:33-36)
   - Lines have `ondelete="SET NULL"` for inventory_change_id (app/models/kit_pick_list_line.py:83-86)

3. **No delete endpoint exists:** The pick list API currently supports:
   - POST `/kits/<kit_id>/pick-lists` - Create pick list
   - GET `/kits/<kit_id>/pick-lists` - List pick lists for kit
   - GET `/pick-lists/<pick_list_id>` - Get pick list detail
   - POST `/pick-lists/<pick_list_id>/lines/<line_id>/pick` - Pick a line
   - POST `/pick-lists/<pick_list_id>/lines/<line_id>/undo` - Undo a line

   No DELETE operation exists. Users cannot remove pick lists they no longer need.

4. **Pick list lifecycle states:** Pick lists have two states:
   - OPEN: lines can still be picked or undone
   - COMPLETED: all lines have been picked

   Deletion should work regardless of status (consistent with kit delete pattern).

5. **Inventory implications:** When lines are picked, inventory is deducted and recorded in QuantityHistory. The line stores inventory_change_id reference. When a pick list with completed lines is deleted:
   - The inventory_change_id on lines will be SET NULL (based on FK constraint)
   - The QuantityHistory records remain intact (no cascade delete)
   - This preserves audit trail of inventory changes

6. **Similar patterns in codebase:**
   - KitService.delete_kit deletes kit and cascades to pick lists (app/services/kit_service.py:518-526)
   - ShoppingListService.delete_list manually deletes lines then parent (app/services/shopping_list_service.py:95-104)
   - All delete endpoints return HTTP 204 on success, 404 for missing resource
   - **No delete operations record metrics** (consistent pattern across shopping_list, part, box, type, seller, kit)

7. **No business constraints needed:** Unlike some resources (parts must have qty=0, boxes must be empty), pick lists have no inherent constraints blocking deletion. A pick list can be deleted whether OPEN or COMPLETED, and whether lines have been picked or not.

8. **Metrics pattern:** Pick list operations (create, pick_line, undo_line, detail_request, list_request) record metrics, but following the established pattern, delete operations do NOT record metrics.

**Conflicts Identified:**
- None. Cascade configuration is complete and consistent. Foreign key with SET NULL on inventory_change_id preserves audit trail while allowing deletion. No competing lifecycle rules exist.

---

## 1) Intent & Scope

**User intent**

Provide a permanent deletion mechanism for pick lists. This allows users to remove pick lists they no longer need from the database, whether the pick list is in progress, completed, or abandoned. This complements the existing pick list workflow by enabling cleanup of historical or unwanted pick lists.

**Prompt quotes**

"Can you write a plan to implement a delete endpoint for pick lists"

**In scope**

- HTTP DELETE endpoint at `/api/pick-lists/<pick_list_id>`
- Service method `KitPickListService.delete_pick_list(pick_list_id: int) -> None`
- Cascade deletion of all child records (pick list lines)
- Preservation of QuantityHistory records referenced by picked lines (audit trail)
- HTTP 404 response when pick list does not exist
- Support deletion regardless of pick list status (OPEN or COMPLETED)
- Support deletion regardless of line status (lines can be OPEN or COMPLETED)
- Comprehensive unit and integration tests covering success and error paths

**Out of scope**

- UI/frontend changes (backend-only feature)
- Reverting inventory deductions when deleting completed lines (inventory changes are permanent; deletion removes the pick list record only)
- Constraint checks beyond existence (pick lists can be deleted in any state)
- Metrics/telemetry for deletions (consistent with other delete endpoints)
- Bulk delete operations
- Automatic undo of picked lines before deletion (picked inventory stays deducted)

**Assumptions / constraints**

- SQLAlchemy cascade relationships already configured will handle line deletion
- QuantityHistory records remain intact when pick list is deleted (SET NULL on FK preserves audit trail)
- No special business logic needed to prevent deletion — pick lists can be deleted in any status
- Delete operations are idempotent at service layer (RecordNotFoundException for missing pick lists)
- Deletion is permanent and cannot be undone
- Picked lines that have deducted inventory will NOT automatically undo when pick list is deleted — inventory deductions are permanent unless explicitly undone before deletion
- No active transaction/locking conflicts expected beyond normal database operation

---

## 2) Affected Areas & File Map (with repository evidence)

- Area: `app/services/kit_pick_list_service.py` (KitPickListService class)
- Why: Add `delete_pick_list(pick_list_id: int) -> None` method to handle business logic and database deletion
- Evidence: app/services/kit_pick_list_service.py:25-476 — Service contains create_pick_list, get_pick_list_detail, list_pick_lists_for_kit, pick_line, undo_line but no delete method

---

- Area: `app/api/pick_lists.py` (pick_lists_bp blueprint)
- Why: Add HTTP DELETE endpoint for `/api/pick-lists/<pick_list_id>` route
- Evidence: app/api/pick_lists.py:19-136 — Create, list, detail, pick, undo endpoints exist but no DELETE route defined

---

- Area: `tests/services/test_kit_pick_list_service.py` (TestKitPickListService class)
- Why: Add service-level tests for delete_pick_list covering success, not-found, and cascade behavior for various pick list states
- Evidence: tests/services/test_kit_pick_list_service.py:145-522 — Existing service tests for create, pick, undo operations

---

- Area: `tests/api/test_pick_lists_api.py` (TestPickListsApi class)
- Why: Add API-level tests for DELETE endpoint covering HTTP status codes and error responses
- Evidence: tests/api/test_pick_lists_api.py:57-188 — Existing API tests for pick list endpoints

---

## 3) Data Model / Contracts

- Entity / contract: KitPickList (app/models/kit_pick_list.py)
- Shape: No changes to model schema. Deletion removes rows from `kit_pick_lists` table and cascades to:
  - `kit_pick_list_lines` (via `ondelete="CASCADE"` on pick_list_id)
  - Lines' `inventory_change_id` set to NULL (via `ondelete="SET NULL"`)
  - `quantity_history` records remain intact (no cascade from lines)
- Refactor strategy: No backwards compatibility concerns. Cascade relationships already configured. Deletion is a new operation that doesn't affect existing workflows. QuantityHistory preservation maintains audit trail.
- Evidence: app/models/kit_pick_list.py:70-76 — Relationship with cascade="all, delete-orphan"; app/models/kit_pick_list_line.py:59-62 — ondelete="CASCADE" on pick_list_id; app/models/kit_pick_list_line.py:83-86 — ondelete="SET NULL" on inventory_change_id

---

## 4) API / Integration Surface

- Surface: DELETE `/api/pick-lists/<int:pick_list_id>`
- Inputs: `pick_list_id` (path parameter, integer)
- Outputs:
  - HTTP 204 (no content) on successful deletion
  - HTTP 404 with `ErrorResponseSchema` if pick list not found
- Errors:
  - 404: Pick list with specified ID does not exist
  - No retry semantics needed (idempotent at service layer)
- Evidence: app/api/kits.py:456-471 — Similar DELETE pattern for kits; app/api/shopping_lists.py:163-178 — DELETE pattern for shopping lists; app/api/pick_lists.py:72-87 — Existing GET endpoint structure

---

## 5) Algorithms & State Machines (step-by-step)

- Flow: Delete pick list
- Steps:
  1. Receive DELETE request with pick_list_id
  2. Inject kit_pick_list_service from ServiceContainer
  3. Call kit_pick_list_service.delete_pick_list(pick_list_id)
  4. Service loads pick list by ID using self.db.get(KitPickList, pick_list_id)
  5. If pick list is None, raise RecordNotFoundException("Pick list", pick_list_id)
  6. Call self.db.delete(pick_list)
  7. Call self.db.flush() to execute deletion
  8. SQLAlchemy cascade deletes all lines automatically (cascade="all, delete-orphan")
  9. Lines' inventory_change_id set to NULL (SET NULL FK constraint)
  10. QuantityHistory records remain in database (audit trail preserved)
  11. API handler returns ("", 204) on success
  12. Error handler converts RecordNotFoundException to 404 response
- States / transitions: No state machine. Simple deletion flow regardless of pick list status (OPEN or COMPLETED).
- Hotspots:
  - Database cascade operations may take slightly longer for pick lists with many lines
  - No expected performance issues (cascade handled by DB constraints)
  - No inventory reversal performed (picked inventory remains deducted)
- Evidence: app/services/kit_service.py:518-526 — Similar simple deletion pattern; app/services/kit_pick_list_service.py:175-204 — Existing get_pick_list_detail helper pattern

---

## 6) Derived State & Invariants

- Derived value: Pick list badge counts on kits
  - Source: Computed from KitPickList records with status != COMPLETED in kit overview queries
  - Writes / cleanup: Badge counts derived on-demand in list_kits() query. Deleting pick list updates badge count on next query.
  - Guards: No special guards needed. Badge computation filters out deleted pick lists naturally.
  - Invariant: Badge counts always reflect existing non-completed pick lists. After deletion, count decreases.
  - Evidence: app/services/kit_service.py:75-82 — Pick list badge subquery filters by status; app/models/kit_pick_list.py:33-36 — ondelete="CASCADE"

---

- Derived value: Pick list line counts and aggregates (line_count, open_line_count, completed_line_count, etc.)
  - Source: Computed properties on KitPickList model from lines relationship
  - Writes / cleanup: No persistent writes. Properties computed on-demand from lines. Deletion removes pick list and lines.
  - Guards: No guards needed. Properties are request-scoped and computed from relationship.
  - Invariant: Line counts always computed from current lines. After deletion, pick list and lines no longer exist.
  - Evidence: app/models/kit_pick_list.py:99-128 — Computed properties for line counts; app/models/kit_pick_list.py:70-76 — cascade="all, delete-orphan"

---

- Derived value: Reserved quantities from open pick list lines
  - Source: Computed in _load_open_line_reservations by summing quantity_to_pick for OPEN lines per location
  - Writes / cleanup: No persistent writes. Used during pick list creation to avoid double-allocating inventory. Deletion frees up reserved quantities.
  - Guards: No guards needed. Reservation computation runs at creation time, not deletion time.
  - Invariant: Reserved quantities reflect current OPEN lines. After deletion, lines no longer count toward reservations.
  - Evidence: app/services/kit_pick_list_service.py:451-475 — Reservation computation; app/models/kit_pick_list_line.py:59-62 — ondelete="CASCADE"

---

## 7) Consistency, Transactions & Concurrency

- Transaction scope: Single service method call within Flask request transaction. delete_pick_list loads pick list, calls db.delete, and flushes within same transaction. API layer commits on success or rolls back on exception.
- Atomic requirements: Pick list deletion and all line deletions must succeed together or roll back together. SQLAlchemy cascade relationships ensure atomicity. QuantityHistory records remain (SET NULL on FK).
- Retry / idempotency: Deletion is idempotent at service layer (raises RecordNotFoundException on second attempt). No special idempotency keys needed.
- Ordering / concurrency controls: No explicit locks. Standard database row-level locking during DELETE sufficient. No optimistic concurrency needed (delete is final operation).
- Evidence: app/services/kit_service.py:518-526 — Similar delete pattern with flush(); app/extensions.py — Flask-SQLAlchemy transaction management

---

## 8) Errors & Edge Cases

- Failure: Pick list does not exist (invalid pick_list_id)
- Surface: DELETE `/api/pick-lists/<pick_list_id>`
- Handling: Service raises RecordNotFoundException("Pick list", pick_list_id). API error handler converts to HTTP 404 with JSON body `{"error": "Pick list <id> not found"}`
- Guardrails: Service performs existence check via db.get(). Test coverage for 404 response.
- Evidence: app/services/kit_pick_list_service.py:191-192 — Existing RecordNotFoundException pattern; app/utils/error_handling.py — @handle_api_errors decorator converts exceptions to HTTP responses

---

- Failure: Database cascade deletion fails (unlikely with correct schema)
- Surface: DELETE `/api/pick-lists/<pick_list_id>`
- Handling: SQLAlchemy raises IntegrityError or OperationalError. Transaction rolls back. API returns HTTP 500 with generic error message.
- Guardrails: Rely on cascade relationships being correctly configured. Test coverage for cascade behavior.
- Evidence: app/models/kit_pick_list.py:70-76 — Cascade configuration; app/models/kit_pick_list_line.py:59-62 — ondelete="CASCADE"

---

- Failure: User expects inventory to be restored when deleting completed pick list
- Surface: DELETE `/api/pick-lists/<pick_list_id>`
- Handling: This is expected behavior, not a failure. Deletion removes pick list record but does NOT undo inventory deductions. User must explicitly call undo endpoints for picked lines before deletion if they want to restore inventory.
- Guardrails: Document that deletion does not reverse inventory changes. Frontend should warn users if deleting a pick list with completed lines.
- Evidence: app/services/kit_pick_list_service.py:332-379 — undo_line explicitly restores inventory; deletion does not

---

## 9) Observability / Telemetry

No metrics or telemetry will be recorded for pick list deletions. This is consistent with all other top-level resource delete operations in the codebase:
- shopping_list.delete_list (app/services/shopping_list_service.py:95-104) — no metrics
- part_service.delete_part (app/services/part_service.py:128-142) — no metrics
- box_service.delete_box (app/services/box_service.py:124-141) — no metrics
- type_service.delete_type (app/services/type_service.py:51-63) — no metrics
- seller_service.delete_seller (app/services/seller_service.py:93-117) — no metrics
- kit_service.delete_kit (app/services/kit_service.py:518-526) — no metrics

While pick list lifecycle operations (create, pick_line, undo_line, detail_request, list_request) do record metrics, delete operations follow the established pattern of other resource deletions in the system.

---

## 10) Background Work & Shutdown

No background work or shutdown handling required. Deletion is a synchronous operation within request transaction.

---

## 11) Security & Permissions (if applicable)

- Concern: Authorization
- Touchpoints: DELETE `/api/pick-lists/<pick_list_id>` endpoint
- Mitigation: No authentication/authorization currently implemented in this backend (single-user system per product brief). No changes needed.
- Residual risk: Acceptable. Product brief specifies single-user context with no login required.
- Evidence: docs/product_brief.md:12 — "You (single user). No login required."

---

## 12) UX / UI Impact (if applicable)

No UX/UI changes. This is a backend API feature. Frontend can call DELETE `/api/pick-lists/<pick_list_id>` when user requests pick list deletion.

**Important frontend consideration:** The frontend SHOULD warn users when deleting a pick list with completed (picked) lines, because deletion does NOT automatically undo inventory deductions. The inventory changes remain permanent unless explicitly undone before deletion.

---

## 13) Deterministic Test Plan (new/changed behavior only)

- Surface: KitPickListService.delete_pick_list(pick_list_id)
- Scenarios:
  - Given an OPEN pick list exists with no picked lines, When delete_pick_list is called, Then pick list and all lines are removed from database
  - Given a COMPLETED pick list exists with all lines picked, When delete_pick_list is called, Then pick list and all lines are removed but QuantityHistory records remain
  - Given a pick list exists with mixed OPEN and COMPLETED lines, When delete_pick_list is called, Then pick list and all lines are removed
  - Given a pick list exists with inventory_change_id references on picked lines, When delete_pick_list is called, Then lines are deleted and inventory_change_id on deleted lines becomes irrelevant (SET NULL FK)
  - Given pick_list_id does not exist, When delete_pick_list is called, Then RecordNotFoundException is raised
  - Given a pick list is deleted, When listing pick lists for the parent kit, Then deleted pick list does not appear in results
  - Given a pick list is deleted, When querying kit badge counts, Then badge count decreases appropriately
- Fixtures / hooks: Use existing session fixture, KitPickList/KitPickListLine/Kit/Part/KitContent/Location models, PickListMetricsStub
- Gaps: None.
- Evidence: tests/services/test_kit_pick_list_service.py:270-300 — Existing pick_line test pattern; tests/services/test_kit_pick_list_service.py:302-335 — undo_line test pattern with inventory checks

---

- Surface: DELETE `/api/pick-lists/<pick_list_id>`
- Scenarios:
  - Given a pick list exists, When DELETE /api/pick-lists/<pick_list_id> is called, Then HTTP 204 is returned and pick list is deleted
  - Given pick_list_id does not exist, When DELETE /api/pick-lists/<pick_list_id> is called, Then HTTP 404 is returned with error message
  - Given a pick list with lines exists, When DELETE is called, Then HTTP 204 is returned and all records (pick list and lines) are removed
  - Given a pick list is deleted, When GET /api/pick-lists/<pick_list_id> is called, Then HTTP 404 is returned
- Fixtures / hooks: Use existing client fixture, session fixture, _seed_kit_with_inventory helper pattern
- Gaps: None. Coverage matches other delete endpoints.
- Evidence: tests/api/test_pick_lists_api.py:60-74 — Existing create_pick_list test; tests/api/test_pick_lists_api.py:185-188 — Existing 404 handling test

---

## 14) Implementation Slices

Not needed for this feature. Single cohesive change: add service method, API endpoint, and tests.

---

## 15) Risks & Open Questions

**Risks:**

- Risk: Cascade deletion fails due to misconfigured relationships
- Impact: Orphaned line records left in database
- Mitigation: Verify cascade relationships are correct in models. Add test that checks line records are deleted. Review app/models/kit_pick_list.py:70-76 and app/models/kit_pick_list_line.py:59-62.

---

- Risk: Users accidentally delete pick lists with completed lines expecting inventory to be restored
- Impact: Inventory remains deducted; users must manually re-add stock if deletion was accidental
- Mitigation: Document clearly that deletion does NOT undo inventory deductions. Frontend should display warning when deleting pick lists with completed lines. Users should explicitly undo picked lines before deletion if they want to restore inventory. No status restriction will be enforced (pick lists can be deleted regardless of status).

---

- Risk: Deleting pick list orphans QuantityHistory records with no referencing pick list lines
- Impact: QuantityHistory records remain but context (which pick list created them) is lost
- Mitigation: This is by design. SET NULL on inventory_change_id preserves audit trail while allowing deletion. QuantityHistory timestamp and part/location information remain for audit purposes. If stronger linkage is needed, can be addressed in future iteration.

---

- Risk: No metrics/audit trail for deletions
- Impact: Cannot track how often pick lists are deleted or diagnose issues
- Mitigation: Accepted as consistent with other delete endpoints (shopping_list, part, box, type, seller, kit). No metrics will be added. If audit trail becomes necessary, can be added in future iteration following existing lifecycle metrics pattern.

---

**Open Questions:**

None. All design decisions have been resolved:
- Pick lists can be deleted in any status (OPEN or COMPLETED) — no status restriction
- Pick lists can be deleted regardless of line status (OPEN or COMPLETED)
- Deletion does NOT automatically undo inventory deductions — explicit undo required before deletion
- QuantityHistory records are preserved (SET NULL FK) — audit trail maintained
- No metrics will be recorded — consistent with other delete endpoints

---

## 16) Confidence

Confidence: High — Implementation is straightforward following established patterns. Cascade relationships are already correctly configured. Similar delete operations exist in the codebase providing clear examples (kit delete, shopping list delete). Risk of orphaned line records is low given existing foreign key constraints and cascade settings. QuantityHistory preservation via SET NULL FK is already configured and maintains audit trail appropriately.

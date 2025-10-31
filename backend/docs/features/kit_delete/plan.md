# Kit Delete Endpoint — Technical Plan

## 0) Research Log & Findings

**Areas Researched:**
- Kit model and relationships (app/models/kit.py:28-114)
- Kit service implementation (app/services/kit_service.py:33-661)
- Kit API endpoints (app/api/kits.py:39-454)
- Related models: KitContent, KitPickList, KitShoppingListLink, KitPickListLine
- Similar delete implementations: shopping_list, parts, boxes, types, sellers
- Existing test patterns for kits

**Key Findings:**
1. **Cascade relationships already configured:** The Kit model has `cascade="all, delete-orphan"` configured for all child relationships (contents, pick_lists, shopping_list_links) at app/models/kit.py:70-88. SQLAlchemy will handle orphan cleanup automatically.

2. **Foreign key cascades in place:** Child models use `ondelete="CASCADE"` on their kit_id foreign keys:
   - KitContent: app/models/kit_content.py:34
   - KitPickList: app/models/kit_pick_list.py:34
   - KitShoppingListLink: app/models/kit_shopping_list_link.py:32

3. **No delete endpoint exists:** Archive/unarchive endpoints exist (app/api/kits.py:416-453) but no DELETE operation. Users cannot permanently remove kits from the database.

4. **Similar patterns in codebase:**
   - ShoppingListService.delete_list manually deletes child lines then parent (app/services/shopping_list_service.py:95-104)
   - Parts, boxes, types, sellers all have DELETE endpoints following same pattern
   - All return HTTP 204 on success, 404 for missing resource
   - **None of these delete operations record metrics**

5. **No special business constraints needed:** Unlike parts (must have qty=0) or boxes (must be empty), kits have no inherent constraints that should block deletion. Archive status exists for soft-deletion use cases.

6. **Metrics pattern for delete operations:** All top-level resource delete operations (shopping_list, part, box, type, seller) do NOT record metrics. While kit lifecycle operations (create, archive, unarchive) do record metrics, delete operations follow the established pattern of no metrics tracking.

**Conflicts Identified:**
- None. The cascade configuration is consistent and complete. No competing lifecycle rules exist that would complicate deletion.

---

## 1) Intent & Scope

**User intent**

Provide a permanent deletion mechanism for kits. This complements the existing archive/unarchive workflow by allowing users to completely remove kit records from the database when they are no longer needed.

**Prompt quotes**

"We're missing a delete endpoint for kits."

**In scope**

- HTTP DELETE endpoint at `/api/kits/<kit_id>`
- Service method `KitService.delete_kit(kit_id: int) -> None`
- Cascade deletion of all child records (contents, pick_lists, shopping_list_links)
- HTTP 404 response when kit does not exist
- Comprehensive unit and integration tests covering success and error paths

**Out of scope**

- UI/frontend changes (backend-only feature)
- Soft-delete semantics (archive/unarchive already provides this)
- Constraint checks beyond existence (kits can be deleted regardless of active/archived status)
- Metrics/telemetry for deletions (consistent with other delete endpoints: shopping_list, part, box, type, seller)
- Bulk delete operations

**Assumptions / constraints**

- SQLAlchemy cascade relationships already configured correctly will handle child record deletion
- No special business logic needed to prevent deletion — kits can be deleted in any status (active or archived)
- Delete operations are idempotent at service layer (RecordNotFoundException for missing kits)
- Deletion is permanent and cannot be undone (consistent with other delete operations)
- No active transaction/locking conflicts expected beyond normal database operation

---

## 2) Affected Areas & File Map (with repository evidence)

- Area: `app/services/kit_service.py` (KitService class)
- Why: Add `delete_kit(kit_id: int) -> None` method to handle business logic and database deletion
- Evidence: app/services/kit_service.py:33-661 — Service contains create/update/archive but no delete method

---

- Area: `app/api/kits.py` (kits_bp blueprint)
- Why: Add HTTP DELETE endpoint for `/api/kits/<kit_id>` route
- Evidence: app/api/kits.py:416-453 — Archive/unarchive endpoints exist but no DELETE route defined

---

- Area: `tests/services/test_kit_service.py` (TestKitService class)
- Why: Add service-level tests for delete_kit covering success, not-found, and cascade behavior
- Evidence: tests/services/test_kit_service.py:195-578 — Existing service tests for create, update, archive operations

---

- Area: `tests/api/test_kits_api.py` (TestKitsApi class)
- Why: Add API-level tests for DELETE endpoint covering HTTP status codes and error responses
- Evidence: tests/api/test_kits_api.py:101-589 — Existing API tests for lifecycle endpoints

---

## 3) Data Model / Contracts

- Entity / contract: Kit (app/models/kit.py)
- Shape: No changes to model schema. Deletion removes rows from `kits` table and cascades to:
  - `kit_contents` (via `ondelete="CASCADE"`)
  - `kit_pick_lists` (via `ondelete="CASCADE"`)
  - `kit_shopping_list_links` (via `ondelete="CASCADE"`)
  - `kit_pick_list_lines` (via cascade through pick_lists)
- Refactor strategy: No backwards compatibility concerns. Cascade relationships already configured. Deletion is a new operation that doesn't affect existing workflows.
- Evidence: app/models/kit.py:70-88 — Relationships with cascade="all, delete-orphan"; child models at kit_content.py:34, kit_pick_list.py:34, kit_shopping_list_link.py:32 use ondelete="CASCADE"

---

## 4) API / Integration Surface

- Surface: DELETE `/api/kits/<int:kit_id>`
- Inputs: `kit_id` (path parameter, integer)
- Outputs:
  - HTTP 204 (no content) on successful deletion
  - HTTP 404 with `ErrorResponseSchema` if kit not found
- Errors:
  - 404: Kit with specified ID does not exist
  - No retry semantics needed (idempotent at service layer)
- Evidence: app/api/kits.py:238-256 — Similar DELETE pattern for kit contents; app/api/shopping_lists.py:163-178 — DELETE pattern for shopping lists

---

## 5) Algorithms & State Machines (step-by-step)

- Flow: Delete kit
- Steps:
  1. Receive DELETE request with kit_id
  2. Inject kit_service from ServiceContainer
  3. Call kit_service.delete_kit(kit_id)
  4. Service loads kit by ID using self.db.get(Kit, kit_id)
  5. If kit is None, raise RecordNotFoundException("Kit", kit_id)
  6. Call self.db.delete(kit)
  7. Call self.db.flush() to execute deletion
  8. SQLAlchemy cascade deletes child records automatically
  9. API handler returns ("", 204) on success
  10. Error handler converts RecordNotFoundException to 404 response
- States / transitions: No state machine. Simple deletion flow.
- Hotspots:
  - Database cascade operations may take slightly longer for kits with many contents/pick lists
  - No expected performance issues (cascade handled by DB constraints)
- Evidence: app/services/shopping_list_service.py:95-104 — Similar simple deletion pattern; app/services/kit_service.py:524-529 — Existing _get_kit_for_update helper pattern

---

## 6) Derived State & Invariants

- Derived value: Kit shopping list badge counts
  - Source: Computed from KitShoppingListLink records in kit overview queries
  - Writes / cleanup: Badge counts derived on-demand in list_kits() query. Deleting kit removes all links, so badges become moot.
  - Guards: No special guards needed. Cascade deletion removes link records before any badge queries could run.
  - Invariant: Badge counts always reflect existing link records. After kit deletion, no links exist.
  - Evidence: app/services/kit_service.py:62-73 — Badge count subquery; app/models/kit_shopping_list_link.py:32 — ondelete="CASCADE"

---

- Derived value: Kit pick list badge counts
  - Source: Computed from KitPickList records with status != COMPLETED
  - Writes / cleanup: Badge counts derived on-demand. Deletion cascades pick lists.
  - Guards: No guards needed. Cascade handles orphan removal.
  - Invariant: Badge counts always match non-completed pick lists. After deletion, no pick lists remain.
  - Evidence: app/services/kit_service.py:75-82 — Pick list badge subquery; app/models/kit_pick_list.py:34 — ondelete="CASCADE"

---

- Derived value: Kit content availability calculations (total_required, shortfall, etc.)
  - Source: Computed in get_kit_detail from kit.contents, inventory, reservations
  - Writes / cleanup: No persistent writes. Deletion removes kit and contents.
  - Guards: No guards needed. Computed values are request-scoped.
  - Invariant: Availability always computed from current contents. After deletion, no contents exist.
  - Evidence: app/services/kit_service.py:164-201 — Availability calculation logic; app/models/kit_content.py:34 — ondelete="CASCADE"

---

## 7) Consistency, Transactions & Concurrency

- Transaction scope: Single service method call within Flask request transaction. delete_kit loads kit, calls db.delete, and flushes within same transaction. API layer commits on success or rolls back on exception.
- Atomic requirements: Kit deletion and all child record deletions must succeed together or roll back together. SQLAlchemy cascade relationships ensure atomicity.
- Retry / idempotency: Deletion is idempotent at service layer (raises RecordNotFoundException on second attempt). No special idempotency keys needed.
- Ordering / concurrency controls: No explicit locks. Standard database row-level locking during DELETE sufficient. No optimistic concurrency needed (delete is final operation).
- Evidence: app/services/kit_service.py:383-393 — Similar delete pattern for kit contents with flush(); app/extensions.py — Flask-SQLAlchemy transaction management

---

## 8) Errors & Edge Cases

- Failure: Kit does not exist (invalid kit_id)
- Surface: DELETE `/api/kits/<kit_id>`
- Handling: Service raises RecordNotFoundException("Kit", kit_id). API error handler converts to HTTP 404 with JSON body `{"error": "Kit <id> not found"}`
- Guardrails: Service performs existence check via db.get(). Test coverage for 404 response.
- Evidence: app/services/kit_service.py:524-529 — Existing RecordNotFoundException pattern; app/utils/error_handling.py — @handle_api_errors decorator converts exceptions to HTTP responses

---

- Failure: Database cascade deletion fails (unlikely with correct schema)
- Surface: DELETE `/api/kits/<kit_id>`
- Handling: SQLAlchemy raises IntegrityError or OperationalError. Transaction rolls back. API returns HTTP 500 with generic error message.
- Guardrails: Rely on cascade relationships being correctly configured. Test coverage for cascade behavior.
- Evidence: app/models/kit.py:70-88 — Cascade configuration; app/services/kit_service.py:282-296 — Similar IntegrityError handling pattern in create_content

---

## 9) Observability / Telemetry

No metrics or telemetry will be recorded for kit deletions. This is consistent with all other top-level resource delete operations in the codebase:
- shopping_list.delete_list (app/services/shopping_list_service.py:95-104) — no metrics
- part_service.delete_part (app/services/part_service.py:128-142) — no metrics
- box_service.delete_box (app/services/box_service.py:124-141) — no metrics
- type_service.delete_type (app/services/type_service.py:51-63) — no metrics
- seller_service.delete_seller (app/services/seller_service.py:93-117) — no metrics

While kit lifecycle operations (create, archive, unarchive) do record metrics, delete operations follow the established pattern of other resource deletions in the system.

---

## 10) Background Work & Shutdown

No background work or shutdown handling required. Deletion is a synchronous operation within request transaction.

---

## 11) Security & Permissions (if applicable)

- Concern: Authorization
- Touchpoints: DELETE `/api/kits/<kit_id>` endpoint
- Mitigation: No authentication/authorization currently implemented in this backend (single-user system per product brief). No changes needed.
- Residual risk: Acceptable. Product brief specifies single-user context with no login required.
- Evidence: docs/product_brief.md:12 — "You (single user). No login required."

---

## 12) UX / UI Impact (if applicable)

No UX/UI changes. This is a backend API feature. Frontend can call DELETE `/api/kits/<kit_id>` when user requests kit deletion.

---

## 13) Deterministic Test Plan (new/changed behavior only)

- Surface: KitService.delete_kit(kit_id)
- Scenarios:
  - Given a kit exists, When delete_kit is called with valid kit_id, Then kit is removed from database
  - Given a kit exists with contents, When delete_kit is called, Then kit and all contents are removed
  - Given a kit exists with pick lists, When delete_kit is called, Then kit and all pick lists (and lines) are removed
  - Given a kit exists with shopping list links, When delete_kit is called, Then kit and all links are removed
  - Given an active kit exists, When delete_kit is called, Then kit is removed (no status restriction)
  - Given an archived kit exists, When delete_kit is called, Then kit is removed (no status restriction)
  - Given kit_id does not exist, When delete_kit is called, Then RecordNotFoundException is raised
- Fixtures / hooks: Use existing session fixture, Kit/Part/KitContent/KitPickList/KitShoppingListLink models
- Gaps: None.
- Evidence: tests/services/test_kit_service.py:560-578 — Existing delete_content test pattern; tests/services/test_kit_service.py:161-193 — Fixture setup patterns

---

- Surface: DELETE `/api/kits/<kit_id>`
- Scenarios:
  - Given a kit exists, When DELETE /api/kits/<kit_id> is called, Then HTTP 204 is returned and kit is deleted
  - Given kit_id does not exist, When DELETE /api/kits/<kit_id> is called, Then HTTP 404 is returned with error message
  - Given a kit with child records, When DELETE is called, Then HTTP 204 is returned and all records are removed
- Fixtures / hooks: Use existing client fixture, session fixture, seed data helpers
- Gaps: None. Coverage matches other delete endpoints.
- Evidence: tests/api/test_kits_api.py:547-553 — Existing delete_kit_content endpoint test; tests/api/test_kits_api.py:78-99 — Helper function pattern _seed_kit_with_content

---

## 14) Implementation Slices

Not needed for this feature. Single cohesive change: add service method, API endpoint, and tests.

---

## 15) Risks & Open Questions

**Risks:**

- Risk: Cascade deletion fails due to misconfigured relationships
- Impact: Orphaned records left in database (contents, pick lists, links)
- Mitigation: Verify cascade relationships are correct in models. Add test that checks child records are deleted. Review app/models/kit.py:70-88 and child model foreign keys.

---

- Risk: Users accidentally delete kits they meant to archive
- Impact: Permanent data loss
- Mitigation: Document that delete is permanent. Frontend should implement confirmation dialog (out of scope for backend). Archive workflow already exists for reversible removal. No status restriction will be enforced (kits can be deleted regardless of active/archived status), consistent with other resource delete operations.

---

- Risk: No metrics/audit trail for deletions
- Impact: Cannot track how often kits are deleted or diagnose issues
- Mitigation: Accepted as consistent with other delete endpoints (shopping_list, part, box, type, seller). No metrics will be added. If audit trail becomes necessary, can be added in future iteration following existing lifecycle metrics pattern.

**Open Questions:**

None. All design decisions have been resolved:
- Kits can be deleted in any status (active or archived) — no status restriction
- No metrics will be recorded — consistent with other delete endpoints

---

## 16) Confidence

Confidence: High — Implementation is straightforward following established patterns. Cascade relationships are already correctly configured. Similar delete operations exist in the codebase providing clear examples. Risk of orphaned records is low given existing foreign key constraints and cascade settings.

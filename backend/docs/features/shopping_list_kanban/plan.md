# Shopping List Kanban -- Technical Plan

## 0) Research Log & Findings

### Areas researched

**Shopping list status model.** The `ShoppingListStatus` enum in `app/models/shopping_list.py:21-27` currently defines `CONCEPT`, `READY`, and `DONE`. The status column uses `native_enum=False` (stored as text), so the migration only needs a simple `UPDATE` to remap existing rows. The `set_list_status` method in `app/services/shopping_list_service.py:114-170` enforces the complex CONCEPT-to-READY-to-DONE state machine with preconditions (line count checks, ordered line checks). All of this logic is deleted and replaced with a single `active -> done` transition.

**Seller notes table.** The `shopping_list_seller_notes` table (`app/models/shopping_list_seller_note.py`) stores per-seller order notes linked by `(shopping_list_id, seller_id)`. This is entirely replaced by a new `shopping_list_sellers` table that adds a `status` column (`active | ordered`) and retains `note`. The migration must copy existing note data into the new table.

**Seller group computation.** Seller groups are currently computed dynamically in `ShoppingListService._build_seller_groups()` (`app/services/shopping_list_service.py:550-594`). This is replaced by the new `shopping_list_sellers` table serving as the source of truth for seller group membership and status.

**Line ordering endpoints.** Three endpoints slated for removal: `POST /shopping-list-lines/{line_id}/order` (`app/api/shopping_list_lines.py:134-159`), `POST /shopping-list-lines/{line_id}/revert` (`app/api/shopping_list_lines.py:162-188`), and `POST /shopping-lists/{list_id}/seller-groups/{group_ref}/order` (`app/api/shopping_list_lines.py:191-232`). The order-note upsert endpoint at `app/api/shopping_lists.py:202-235` is also removed.

**Kit integration.** The `kit_shopping_list_service.py` and `kit_service.py` reference `ShoppingListStatus.CONCEPT` for append workflows and badge statuses. These must be updated to use `ACTIVE`. The `get_concept_list_for_append` method in `shopping_list_service.py:55-70` enforces CONCEPT status; it becomes `get_active_list_for_append` enforcing ACTIVE status.

**Test data.** Shopping list test data in `app/data/test_data/shopping_lists.json` uses `concept` and `ready` status values. The `shopping_list_seller_notes.json` file must be renamed/restructured to match the new `shopping_list_sellers` table. The test data loading in `app/services/test_data_service.py:704-746` must be updated.

### Conflicts and resolutions

**`is_orderable` / `is_revertible` properties.** These model properties on `ShoppingListLine` (`app/models/shopping_list_line.py:117-141`) check for `READY` status and line ordering conditions. Since ordering is now via seller groups, these properties are removed. The schema fields that reference them (`app/schemas/shopping_list_line.py:150-157`) are also removed.

**`add_part_to_concept_list` / `merge_line_for_concept_list`.** These methods in `shopping_list_line_service.py:106-191` check for `CONCEPT` status. They become `add_part_to_active_list` / `merge_line_for_active_list` checking for `ACTIVE`.

**Ungrouped seller bucket.** The backend_implementation.md specifies that ungrouped lines (seller_id = NULL) remain virtual with no DB row. This is clean since seller group CRUD only operates on real seller_id values.

---

## 1) Intent & Scope

**User intent**

Refactor the shopping list backend to support a Kanban-style UI. The three-state lifecycle (`concept | ready | done`) is collapsed to two states (`active | done`). The ephemeral computed seller groups and the separate `shopping_list_seller_notes` table are replaced by a first-class `shopping_list_sellers` entity with its own status and CRUD endpoints. Individual line ordering/reverting endpoints are removed in favor of atomic seller group ordering. The line PUT endpoint gains an `ordered` field.

**Prompt quotes**

"Replace shopping list status enum `concept | ready | done` with `active | done`"
"Refactor `shopping_list_seller_notes` table into `shopping_list_sellers` with `seller_id`, `note`, `status` (active | ordered), and timestamps"
"Seller group PUT ordering precondition: all lines must have `ordered > 0`; reject 409 otherwise"
"Remove `POST /shopping-list-lines/{line_id}/order` endpoint"
"Mutation endpoints return the mutated resource, not the full shopping list"

**In scope**

- Status enum change from `concept | ready | done` to `active | done` with Alembic migration
- New `shopping_list_sellers` table and model replacing `shopping_list_seller_notes`
- Seller group CRUD endpoints (POST, GET, PUT, DELETE)
- Seller group ordering/reopening state machine with preconditions
- Line PUT gains `ordered` field; `seller_id` change blocked on ORDERED lines
- Remove four obsolete endpoints (line order, line revert, group order, order-note upsert)
- Removal of `is_orderable` / `is_revertible` properties
- Ungrouped line restrictions (no ORDERED status, no receiving)
- Test data updates for new schema
- Comprehensive service and API tests

**Out of scope**

- Bulk assignment endpoint (explicitly deferred per backend_implementation.md section 4)
- Frontend changes (documented separately)
- Shopping list search or filtering changes

**Assumptions / constraints**

- The `ShoppingListStatus` enum is stored as text (`native_enum=False`), so migration is a straightforward UPDATE.
- The `ShoppingListLineStatus` enum (`new | ordered | done`) is unchanged.
- The BFF pattern means breaking API changes are shipped in lockstep with the frontend.
- Existing `done` shopping lists are unaffected by the status migration.

---

## 1a) User Requirements Checklist

**User Requirements Checklist**

- [ ] Replace shopping list status enum `concept | ready | done` with `active | done`
- [ ] Migrate existing `concept` and `ready` lists to `active` (Alembic migration)
- [ ] `active -> done` is the only status transition; no preconditions enforced
- [ ] Refactor `shopping_list_seller_notes` table into `shopping_list_sellers` with `seller_id`, `note`, `status` (active | ordered), and timestamps
- [ ] Seller group POST: create empty seller group; 409 if already exists
- [ ] Seller group GET: return `ShoppingListSellerGroupSchema` with lines, totals, order note
- [ ] Seller group PUT: update note and/or status; ordering transitions all lines to ORDERED atomically; reopening reverts ORDERED lines to NEW
- [ ] Seller group PUT ordering precondition: all lines must have `ordered > 0`; reject 409 otherwise
- [ ] Seller group PUT reopen precondition: no line may have `received > 0`; reject 409 otherwise
- [ ] Seller group DELETE: blocked if group is `ordered` (409); moves lines to unassigned, clears `ordered` to 0, resets status to `new`
- [ ] Remove `POST /shopping-list-lines/{line_id}/order` endpoint
- [ ] Remove `POST /shopping-list-lines/{line_id}/revert` endpoint
- [ ] Remove `POST /shopping-lists/{list_id}/seller-groups/{group_ref}/order` endpoint
- [ ] Remove `PUT /shopping-lists/{list_id}/seller-groups/{seller_id}/order-note` endpoint
- [ ] Add `ordered` field to line PUT endpoint; only settable when line status is NEW
- [ ] Block `seller_id` change on ORDERED lines (409)
- [ ] Ungrouped lines (no seller_id) cannot reach ORDERED status or be received
- [ ] Mutation endpoints return the mutated resource, not the full shopping list
- [ ] Update `ShoppingListSellerGroupSchema` to include `completed`/`status` field from the new table
- [ ] Migrate existing seller notes data into the new `shopping_list_sellers` table
- [ ] Update test data files for schema changes
- [ ] Comprehensive service and API tests for all new/changed behavior

---

## 2) Affected Areas & File Map

- Area: `app/models/shopping_list.py` -- ShoppingList model and ShoppingListStatus enum
- Why: Replace `CONCEPT | READY | DONE` enum with `ACTIVE | DONE`; update default/server_default; remove docstring reference to "concept".
- Evidence: `app/models/shopping_list.py:21-27` -- enum definition; `app/models/shopping_list.py:37-47` -- column default.

- Area: `app/models/shopping_list_seller_note.py` -- DELETE entire file
- Why: Replaced by new `shopping_list_sellers` model.
- Evidence: `app/models/shopping_list_seller_note.py:1-67` -- entire model.

- Area: `app/models/shopping_list_seller.py` -- NEW file
- Why: New `ShoppingListSeller` model with `shopping_list_id`, `seller_id`, `note`, `status` (active/ordered), timestamps.
- Evidence: Design spec in `docs/features/shopping_list_kanban/backend_implementation.md:24-36`.

- Area: `app/models/shopping_list_line.py` -- ShoppingListLine model
- Why: Remove `is_orderable` and `is_revertible` properties; update `can_receive` to also check `seller_id is not None`; remove import of `ShoppingListStatus.READY`.
- Evidence: `app/models/shopping_list_line.py:117-141` -- properties; `app/models/shopping_list_line.py:144-147` -- can_receive.

- Area: `app/models/shopping_list.py` -- ShoppingList relationship
- Why: Rename `seller_notes` relationship to `seller_groups` pointing at new `ShoppingListSeller` model.
- Evidence: `app/models/shopping_list.py:63-68` -- existing seller_notes relationship.

- Area: `app/models/__init__.py`
- Why: Replace `ShoppingListSellerNote` import with `ShoppingListSeller`.
- Evidence: `app/models/__init__.py:21` -- current import.

- Area: `app/services/shopping_list_service.py`
- Why: Rewrite `set_list_status` to support only `active -> done`; remove CONCEPT/READY transition logic; rename `get_concept_list_for_append` to `get_active_list_for_append`; remove `upsert_seller_note`, `get_seller_order_notes`, `group_lines_by_seller`, `_build_seller_groups`, `_sort_seller_notes`, `_attach_ready_payload`; add new seller group CRUD methods; update `_load_list_with_lines` to load `ShoppingListSeller` instead of `ShoppingListSellerNote`.
- Evidence: `app/services/shopping_list_service.py:114-170` -- set_list_status; `app/services/shopping_list_service.py:315-381` -- upsert_seller_note; `app/services/shopping_list_service.py:550-594` -- _build_seller_groups.

- Area: `app/services/shopping_list_line_service.py`
- Why: Remove `set_line_ordered`, `set_line_new`, `set_group_ordered` methods; add `ordered` field handling to `update_line` with ORDERED-line guards; add `seller_id` change blocking on ORDERED lines; rename `add_part_to_concept_list` to `add_part_to_active_list`; rename `merge_line_for_concept_list` to `merge_line_for_active_list`; update status checks from `CONCEPT` to `ACTIVE`; add ungrouped line guard on `receive_line_stock`.
- Evidence: `app/services/shopping_list_line_service.py:295-380` -- set_line_ordered/set_line_new; `app/services/shopping_list_line_service.py:508-591` -- set_group_ordered; `app/services/shopping_list_line_service.py:106-133` -- add_part_to_concept_list; `app/services/shopping_list_line_service.py:193-257` -- update_line.

- Area: `app/api/shopping_lists.py`
- Why: Remove `upsert_seller_order_note` endpoint; add seller group CRUD endpoints (POST, GET, PUT, DELETE); remove seller note schema imports; update status update schema example.
- Evidence: `app/api/shopping_lists.py:202-235` -- upsert_seller_order_note endpoint.

- Area: `app/api/shopping_list_lines.py`
- Why: Remove `mark_line_ordered`, `revert_line_to_new`, `mark_group_ordered` endpoints; update `update_shopping_list_line` to pass `ordered` field; remove imports for deleted schemas.
- Evidence: `app/api/shopping_list_lines.py:134-232` -- three endpoints to remove.

- Area: `app/schemas/shopping_list.py`
- Why: Update `ShoppingListSellerGroupSchema` to include `status` field from new table and `completed` derived field; replace `ShoppingListSellerOrderNoteSchema` references; update `ShoppingListStatusUpdateSchema` example from READY to ACTIVE; update `ShoppingListListSchema.seller_notes` to `seller_groups`; remove `has_ordered_lines` computed field from list schema (or update); update `ShoppingListResponseSchema` similarly.
- Evidence: `app/schemas/shopping_list.py:195-235` -- ShoppingListSellerGroupSchema; `app/schemas/shopping_list.py:53-59` -- status update schema.

- Area: `app/schemas/shopping_list_line.py`
- Why: Remove `ShoppingListLineOrderSchema`, `ShoppingListLineStatusUpdateSchema`, `ShoppingListGroupOrderLineSchema`, `ShoppingListGroupOrderSchema`; remove `is_orderable` and `is_revertible` fields from `ShoppingListLineResponseSchema`; add `ordered` to `ShoppingListLineUpdateSchema`.
- Evidence: `app/schemas/shopping_list_line.py:218-264` -- schemas to remove; `app/schemas/shopping_list_line.py:150-157` -- is_orderable/is_revertible fields.

- Area: `app/schemas/shopping_list_seller_note.py` -- DELETE entire file
- Why: Replaced by seller group schema additions in `shopping_list.py`.
- Evidence: `app/schemas/shopping_list_seller_note.py:1-38` -- entire file.

- Area: `app/schemas/shopping_list_seller.py` -- NEW file (or inline in shopping_list.py)
- Why: New request/response schemas for seller group CRUD (create, update schemas).
- Evidence: Design spec sections 3 (CRUD endpoints).

- Area: `app/services/container.py`
- Why: No structural change needed. `ShoppingListService` constructor signature is unchanged (still takes `db` and `part_seller_service`). `ShoppingListLineService` constructor unchanged.
- Evidence: `app/services/container.py:149-153` -- shopping_list_service provider; `app/services/container.py:229-235` -- shopping_list_line_service provider.

- Area: `app/services/kit_shopping_list_service.py`
- Why: Update `ShoppingListStatus.CONCEPT` references to `ACTIVE`; update `get_concept_list_for_append` call to `get_active_list_for_append`.
- Evidence: `app/services/kit_shopping_list_service.py:260` -- get_concept_list_for_append call; `app/services/kit_shopping_list_service.py:466-467` -- CONCEPT fallback.

- Area: `app/services/kit_service.py`
- Why: Update `ShoppingListStatus.CONCEPT` and `READY` references to `ACTIVE`; update `_shopping_badge_statuses` to return only `(ACTIVE,)`.
- Evidence: `app/services/kit_service.py:261-262` -- CONCEPT fallback; `app/services/kit_service.py:617-620` -- badge statuses.

- Area: `app/schemas/kit.py`
- Why: Update `ShoppingListStatus.READY` example value to `ACTIVE`.
- Evidence: `app/schemas/kit.py:313-315` -- status field example.

- Area: `app/schemas/part_shopping_list.py`
- Why: Update `ShoppingListStatus.CONCEPT` example value to `ACTIVE`.
- Evidence: `app/schemas/part_shopping_list.py:27` -- example value.

- Area: `app/startup.py`
- Why: Replace `ShoppingListSellerNote` import with `ShoppingListSeller`.
- Evidence: `app/startup.py:43` -- import of ShoppingListSellerNote.

- Area: `app/services/test_data_service.py`
- Why: Replace `ShoppingListSellerNote` import and `load_shopping_list_seller_notes` with `ShoppingListSeller` and `load_shopping_list_sellers`; update summary query.
- Evidence: `app/services/test_data_service.py:31` -- import; `app/services/test_data_service.py:72` -- method call; `app/services/test_data_service.py:283` -- summary query; `app/services/test_data_service.py:704-746` -- method.

- Area: `alembic/versions/023_shopping_list_kanban.py` -- NEW file
- Why: Alembic migration to: (1) update `concept`/`ready` statuses to `active`; (2) create `shopping_list_sellers` table; (3) migrate data from `shopping_list_seller_notes` to `shopping_list_sellers`; (4) drop `shopping_list_seller_notes` table.
- Evidence: Current head is `022` (`alembic/versions/022_add_seller_logo_s3_key.py`).

- Area: `app/data/test_data/shopping_lists.json`
- Why: Change `"concept"` and `"ready"` status values to `"active"`.
- Evidence: `app/data/test_data/shopping_lists.json:6,9` -- current status values.

- Area: `app/data/test_data/shopping_list_seller_notes.json` -- RENAME to `shopping_list_sellers.json`
- Why: New file structure to match `shopping_list_sellers` table schema (adds `status` field).
- Evidence: `app/data/test_data/shopping_list_seller_notes.json:1-17` -- current content.

- Area: `app/data/test_data/shopping_list_lines.json`
- Why: The "Bench Replenishment" list currently has ORDERED lines with `seller_id: null`. Under the new model ungrouped lines cannot be ORDERED. These need to be assigned to sellers or changed to NEW status.
- Evidence: `app/data/test_data/shopping_list_lines.json:27-37` -- ORDERED line with null seller_id.

- Area: `tests/services/test_shopping_list_service.py`
- Why: Rewrite tests for new status transitions; add seller group CRUD tests; remove CONCEPT/READY transition tests.
- Evidence: `tests/services/test_shopping_list_service.py:16-80` -- existing tests referencing CONCEPT/READY.

- Area: `tests/services/test_shopping_list_line_service.py`
- Why: Remove tests for `set_line_ordered`, `set_line_new`, `set_group_ordered`; add tests for `ordered` field in `update_line`; add seller_id change blocking tests.
- Evidence: Existing test file.

- Area: `tests/api/test_shopping_lists_api.py`
- Why: Remove order-note endpoint tests; add seller group API tests; update status transition tests.
- Evidence: Existing test file.

- Area: `tests/api/test_shopping_list_lines_api.py`
- Why: Remove line order/revert/group-order endpoint tests; add `ordered` field in PUT tests.
- Evidence: Existing test file.

- Area: `tests/services/test_kit_shopping_list_service.py`
- Why: Update references from CONCEPT to ACTIVE in test expectations.
- Evidence: File references `ShoppingListStatus`.

- Area: `tests/services/test_kit_service.py`
- Why: Update badge status expectations from CONCEPT/READY to ACTIVE.
- Evidence: File references `ShoppingListStatus`.

- Area: `tests/test_test_data_service.py`
- Why: Update assertions that reference CONCEPT/READY statuses or seller notes.
- Evidence: File references `ShoppingListStatus`.

- Area: `tests/test_database_constraints.py`
- Why: Update any constraint tests referencing the old shopping_list_seller_notes table or CONCEPT/READY statuses.
- Evidence: File references `ShoppingListStatus`.

- Area: `tests/test_parts_api.py`
- Why: Update `ShoppingListStatus.CONCEPT` and `READY` references to `ACTIVE` in shopping list membership test helpers and assertions.
- Evidence: `tests/test_parts_api.py:894-1157` -- 7 references to `ShoppingListStatus.READY` and `set_list_status` calls.

- Area: `tests/api/test_parts_api.py`
- Why: Update `ShoppingListStatus.CONCEPT` references to `ACTIVE` in test setup that creates ShoppingList instances.
- Evidence: `tests/api/test_parts_api.py:181,264` -- constructs `ShoppingList(status=ShoppingListStatus.CONCEPT)`.

- Area: `tests/api/test_kits_api.py`
- Why: Update `ShoppingListStatus.CONCEPT` and `READY` references to `ACTIVE` in fixtures and assertions.
- Evidence: `tests/api/test_kits_api.py:15-638` -- 7 references including fixture setup and status assertions.

---

## 3) Data Model / Contracts

- Entity / contract: `shopping_lists.status` column
- Shape:
  ```
  status VARCHAR -- was: 'concept' | 'ready' | 'done'
                 -- now: 'active' | 'done'
  default: 'active'
  ```
- Refactor strategy: Alembic UPDATE migrates `concept` and `ready` to `active`. The Python enum is replaced in-place. No backwards compatibility needed (BFF pattern).
- Evidence: `app/models/shopping_list.py:21-27` -- enum; `app/models/shopping_list.py:37-47` -- column definition.

- Entity / contract: `shopping_list_sellers` table (NEW, replaces `shopping_list_seller_notes`)
- Shape:
  ```
  shopping_list_sellers:
    id           INTEGER PRIMARY KEY AUTOINCREMENT
    shopping_list_id  INTEGER FK shopping_lists(id) CASCADE
    seller_id         INTEGER FK sellers(id) CASCADE
    note              TEXT DEFAULT ''
    status            VARCHAR DEFAULT 'active'  -- 'active' | 'ordered'
    created_at        DATETIME DEFAULT now()
    updated_at        DATETIME DEFAULT now()
    UNIQUE(shopping_list_id, seller_id)
  ```
- Refactor strategy: Migration creates new table, copies data from `shopping_list_seller_notes` (all with status `active`), drops old table. This matches the BFF approach.
- Evidence: `app/models/shopping_list_seller_note.py:18-66` -- old model; `docs/features/shopping_list_kanban/backend_implementation.md:24-36` -- new spec.

- Entity / contract: `ShoppingListSeller` SQLAlchemy model (NEW)
- Shape:
  ```python
  class ShoppingListSellerStatus(StrEnum):
      ACTIVE = "active"
      ORDERED = "ordered"

  class ShoppingListSeller(db.Model):
      __tablename__ = "shopping_list_sellers"
      id, shopping_list_id, seller_id, note, status, created_at, updated_at
      relationships: shopping_list, seller
  ```
- Refactor strategy: Direct replacement of ShoppingListSellerNote. All callers updated.
- Evidence: `docs/features/shopping_list_kanban/backend_implementation.md:24-36`.

- Entity / contract: `ShoppingListSellerGroupSchema` (response)
- Shape:
  ```json
  {
    "group_key": "4",
    "seller_id": 4,
    "seller": { "id": 4, "name": "DigiKey", "website": "...", "logo_url": "..." },
    "lines": [ ... ],
    "totals": { "needed": 12, "ordered": 8, "received": 0 },
    "note": "Bundle shipping note",
    "status": "active",
    "completed": false
  }
  ```
- Refactor strategy: The `order_note` field (which was a full `ShoppingListSellerOrderNoteSchema`) is replaced by a flat `note` string and a `status` field. A `completed` boolean is derived (all lines DONE).
- Evidence: `app/schemas/shopping_list.py:212-235` -- existing schema.

- Entity / contract: `ShoppingListSellerGroupCreateSchema` (request, NEW)
- Shape:
  ```json
  { "seller_id": 4 }
  ```
- Refactor strategy: New schema.
- Evidence: `docs/features/shopping_list_kanban/backend_implementation.md:48-52`.

- Entity / contract: `ShoppingListSellerGroupUpdateSchema` (request, NEW)
- Shape:
  ```json
  { "note": "...", "status": "ordered" }
  ```
  Both fields optional.
- Refactor strategy: New schema.
- Evidence: `docs/features/shopping_list_kanban/backend_implementation.md:57-65`.

- Entity / contract: `ShoppingListLineUpdateSchema` (changed)
- Shape:
  ```json
  { "seller_id": 5, "needed": 6, "note": "...", "ordered": 10 }
  ```
  `ordered` is a new optional field, ge=0.
- Refactor strategy: Direct addition.
- Evidence: `app/schemas/shopping_list_line.py:38-57` -- existing schema.

- Entity / contract: `ShoppingListLineResponseSchema` (changed)
- Shape: Remove `is_orderable` and `is_revertible` fields.
- Refactor strategy: Direct removal; BFF pattern allows breaking changes.
- Evidence: `app/schemas/shopping_list_line.py:150-157`.

---

## 4) API / Integration Surface

- Surface: `POST /api/shopping-lists/{list_id}/seller-groups`
- Inputs: `{ "seller_id": int }`
- Outputs: `ShoppingListSellerGroupSchema` (201)
- Errors: 404 (list not found, seller not found); 409 (seller group already exists, list is done)
- Evidence: `docs/features/shopping_list_kanban/backend_implementation.md:43-52`.

- Surface: `GET /api/shopping-lists/{list_id}/seller-groups/{seller_id}`
- Inputs: Path params `list_id`, `seller_id`
- Outputs: `ShoppingListSellerGroupSchema` (200) with lines, totals, note, status
- Errors: 404 (list not found, seller group not found)
- Evidence: `docs/features/shopping_list_kanban/backend_implementation.md:54-55`.

- Surface: `PUT /api/shopping-lists/{list_id}/seller-groups/{seller_id}`
- Inputs: `{ "note": "...", "status": "ordered" | "active" }` (both optional)
- Outputs: `ShoppingListSellerGroupSchema` (200)
- Errors: 404 (not found); 409 (ordering: lines with ordered==0; reopening: lines with received>0; list is done)
- Evidence: `docs/features/shopping_list_kanban/backend_implementation.md:57-65`.

- Surface: `DELETE /api/shopping-lists/{list_id}/seller-groups/{seller_id}`
- Inputs: Path params only
- Outputs: 204 No Content
- Errors: 404 (not found); 409 (group is ordered -- must reopen first)
- Evidence: `docs/features/shopping_list_kanban/backend_implementation.md:67-71`.

- Surface: `PUT /api/shopping-lists/{list_id}/status` (CHANGED)
- Inputs: `{ "status": "active" | "done" }`
- Outputs: `ShoppingListResponseSchema` (200)
- Errors: 404; 409 (done lists cannot change status; `active -> done` only)
- Evidence: `app/api/shopping_lists.py:178-199` -- existing endpoint.

- Surface: `PUT /api/shopping-list-lines/{line_id}` (CHANGED)
- Inputs: `{ "seller_id": int | null, "needed": int, "note": str, "ordered": int }` (all optional)
- Outputs: `ShoppingListLineResponseSchema` (200)
- Errors: 409 (seller_id change on ORDERED line; ordered set on non-NEW line; list is done; line is done)
- Evidence: `app/api/shopping_list_lines.py:60-85` -- existing endpoint.

- Surface: `POST /api/shopping-list-lines/{line_id}/order` -- REMOVED
- Inputs: N/A
- Outputs: N/A
- Errors: N/A
- Evidence: `app/api/shopping_list_lines.py:134-159`.

- Surface: `POST /api/shopping-list-lines/{line_id}/revert` -- REMOVED
- Inputs: N/A
- Outputs: N/A
- Errors: N/A
- Evidence: `app/api/shopping_list_lines.py:162-188`.

- Surface: `POST /api/shopping-lists/{list_id}/seller-groups/{group_ref}/order` -- REMOVED
- Inputs: N/A
- Outputs: N/A
- Errors: N/A
- Evidence: `app/api/shopping_list_lines.py:191-232`.

- Surface: `PUT /api/shopping-lists/{list_id}/seller-groups/{seller_id}/order-note` -- REMOVED
- Inputs: N/A
- Outputs: N/A
- Errors: N/A
- Evidence: `app/api/shopping_lists.py:202-235`.

---

## 5) Algorithms & State Machines

- Flow: Shopping List Status State Machine (simplified)
- Steps:
  1. New list is created with status `active`.
  2. User may transition `active -> done` at any time via PUT status endpoint.
  3. No preconditions are enforced on the `done` transition.
  4. `done` is terminal -- no further status changes are allowed.
  5. Metadata updates are blocked on done lists.
- States / transitions: `ACTIVE -> DONE` (only transition). No reverse.
- Hotspots: None -- single transition with no side effects.
- Evidence: `docs/features/shopping_list_kanban/backend_implementation.md:12-18`.

- Flow: Seller Group Ordering
- Steps:
  1. User creates a seller group via POST (empty, status `active`).
  2. User assigns lines to the seller group by setting `seller_id` on individual lines via PUT line.
  3. User sets `ordered` quantity on each line via PUT line (must be NEW status).
  4. User orders the group via PUT seller group with `status: "ordered"`.
  5. Precondition check: all lines in group must have `ordered > 0`. Reject 409 if not.
  6. All lines in the group atomically transition from NEW to ORDERED.
  7. The seller group status is set to `ordered`.
  8. After ordering, `ordered` and `seller_id` are locked on ORDERED lines.
- States / transitions: Seller group: `active -> ordered -> active (reopen)`. Line: `NEW -> ORDERED` (via group ordering) and `ORDERED -> NEW` (via group reopening).
- Hotspots: The atomic transition of all lines must happen in a single flush. The precondition check and status update must be within the same transaction to prevent TOCTOU races.
- Evidence: `docs/features/shopping_list_kanban/backend_implementation.md:96-120`.

- Flow: Seller Group Reopening
- Steps:
  1. User sends PUT seller group with `status: "active"`.
  2. Precondition check: no line in the group may have `received > 0`. Reject 409 if any do.
  3. All ORDERED lines in the group revert to NEW.
  4. The seller group status is set to `active`.
- States / transitions: Seller group: `ordered -> active`. Lines: `ORDERED -> NEW`.
- Hotspots: Same atomicity requirement as ordering.
- Evidence: `docs/features/shopping_list_kanban/backend_implementation.md:62-65`.

- Flow: Seller Group Deletion
- Steps:
  1. User sends DELETE seller group.
  2. Precondition: group status must not be `ordered`. Reject 409 if it is.
  3. For each line in the group that is NOT in DONE status: set `seller_id = NULL`, set `ordered = 0`, set `status = NEW`. DONE lines are left unchanged -- their `seller_id`, `ordered`, `status`, `completed_at`, `completion_mismatch`, and `completion_note` fields are preserved to protect completion history.
  4. Delete the `shopping_list_sellers` row.
- States / transitions: Non-DONE lines revert to ungrouped/NEW. DONE lines retain their existing state.
- Hotspots: Must clear line state before deleting the group row. The DONE-line exclusion prevents corruption of completion metadata (`completed_at`, `completion_note`, `completion_mismatch`).
- Evidence: `docs/features/shopping_list_kanban/backend_implementation.md:67-71`.

- Flow: Build Seller Groups from Persisted Data (replaces `_build_seller_groups` and `_attach_ready_payload`)
- Steps:
  1. Query `ShoppingListSeller` rows for the given `shopping_list_id`, eagerly loading the `seller` relationship.
  2. For each `ShoppingListSeller` row, query lines where `shopping_list_lines.seller_id == seller.id` and `shopping_list_lines.shopping_list_id == list_id`. Compute totals (sum of `needed`, `ordered`, `received`).
  3. Build the ungrouped virtual bucket: query lines where `seller_id IS NULL` for the list. Compute totals. The ungrouped bucket has no `ShoppingListSeller` row, so its `note` is empty, `status` is not applicable, and `completed` is derived from line statuses.
  4. Assemble `ShoppingListSellerGroupSchema` entries: named groups from step 2 (sorted alphabetically by seller name), ungrouped bucket from step 3 (sorted last). Each entry includes the `note` and `status` from the `ShoppingListSeller` row, plus the derived `completed` flag (all lines DONE).
  5. Attach the assembled list as `shopping_list.seller_groups` transient attribute for schema serialization.
- States / transitions: None; this is a read-only query-time computation.
- Hotspots: The line grouping can be done in a single query with `selectinload` on lines (already loaded by `_load_list_with_lines`), then partitioned in Python by `seller_id`. No N+1 queries needed.
- Evidence: Replaces `app/services/shopping_list_service.py:531-594` (`_attach_ready_payload` and `_build_seller_groups`). Uses `ShoppingListSeller` rows from the new `shopping_list_sellers` table instead of computing groups dynamically from line `seller_id` values.

---

## 6) Derived State & Invariants

- Derived value: Seller group `completed` flag
  - Source: All lines in the seller group filtered by `status == DONE`.
  - Writes / cleanup: Read-only derived field on the response schema; no persistence.
  - Guards: Computed at query time from line statuses; no stale cache.
  - Invariant: `completed == True` iff every line in the group has `status == DONE`.
  - Evidence: Schema design in section 3 of this plan.

- Derived value: Seller group `totals` (needed, ordered, received)
  - Source: Sum of `needed`, `ordered`, `received` across all lines where `seller_id` matches.
  - Writes / cleanup: Read-only aggregation computed at query time.
  - Guards: Computed from line data within the same session/transaction.
  - Invariant: Totals must reflect the current state of all lines in the group.
  - Evidence: `app/schemas/shopping_list.py:195-209` -- existing ShoppingListSellerGroupTotalsSchema.

- Derived value: `line_counts` on ShoppingList
  - Source: Counts of lines by status, queried from `shopping_list_lines`.
  - Writes / cleanup: Transient attribute attached via `_attach_line_counts`.
  - Guards: Computed fresh each time from the database via `_counts_for_lists`.
  - Invariant: Counts must match the actual status distribution of lines.
  - Evidence: `app/services/shopping_list_service.py:412-440`.

- Derived value: `can_receive` on ShoppingListLine
  - Source: Line `status == ORDERED` AND `seller_id is not None`.
  - Writes / cleanup: Read-only property driving UI state.
  - Guards: The new requirement adds `seller_id is not None` to the existing ORDERED check.
  - Invariant: Ungrouped lines (no seller) can never be received.
  - Evidence: `app/models/shopping_list_line.py:144-147` -- existing property; `docs/features/shopping_list_kanban/backend_implementation.md:117-119` -- ungrouped constraint.

---

## 7) Consistency, Transactions & Concurrency

- Transaction scope: Each API request runs within a single SQLAlchemy session managed by the DI container's `ContextLocalSingleton`. The session auto-commits via Flask's request teardown. All seller group ordering/reopening mutations happen within a single `flush()` call.
- Atomic requirements: Seller group ordering must atomically (1) validate all line preconditions, (2) update all line statuses, and (3) update the seller group status. If any line fails validation, no changes are persisted. This is achieved by doing all checks before any writes, then calling a single `flush()`.
- Retry / idempotency: POST seller group uses the `(shopping_list_id, seller_id)` unique constraint -- duplicate creates return 409 (not silently ignored). PUT seller group is idempotent (setting status to current status is a no-op).
- Ordering / concurrency controls: No explicit locking beyond SQLAlchemy's session-level isolation. The precondition checks and writes happen within the same transaction, preventing TOCTOU issues under default READ COMMITTED isolation.
- Evidence: `app/services/shopping_list_service.py:96-100` -- IntegrityError handling pattern; `app/services/shopping_list_line_service.py:508-591` -- existing group ordering pattern (to be adapted).

---

## 8) Errors & Edge Cases

- Failure: Seller group already exists for this list
- Surface: POST seller group
- Handling: 409 ResourceConflictException
- Guardrails: UNIQUE constraint on `(shopping_list_id, seller_id)`; catch IntegrityError.
- Evidence: `docs/features/shopping_list_kanban/backend_implementation.md:50`.

- Failure: Ordering a seller group where some lines have `ordered == 0`
- Surface: PUT seller group with `status: "ordered"`
- Handling: 409 InvalidOperationException with message identifying the issue
- Guardrails: Pre-flight check iterating all lines before any status change.
- Evidence: `docs/features/shopping_list_kanban/backend_implementation.md:60-61`.

- Failure: Reopening a seller group where some lines have `received > 0`
- Surface: PUT seller group with `status: "active"`
- Handling: 409 InvalidOperationException
- Guardrails: Pre-flight check on all lines.
- Evidence: `docs/features/shopping_list_kanban/backend_implementation.md:63-64`.

- Failure: Deleting an `ordered` seller group
- Surface: DELETE seller group
- Handling: 409 InvalidOperationException ("must reopen first")
- Guardrails: Status check before deletion.
- Evidence: `docs/features/shopping_list_kanban/backend_implementation.md:69`.

- Failure: Changing `seller_id` on an ORDERED line
- Surface: PUT shopping list line
- Handling: 409 InvalidOperationException
- Guardrails: Check `line.status == ORDERED` before allowing seller_id change.
- Evidence: `docs/features/shopping_list_kanban/backend_implementation.md:87-88`.

- Failure: Setting `ordered` on a non-NEW line
- Surface: PUT shopping list line
- Handling: 409 InvalidOperationException
- Guardrails: Check `line.status == NEW` before allowing ordered change.
- Evidence: `docs/features/shopping_list_kanban/backend_implementation.md:106-107`.

- Failure: Receiving stock on an ungrouped line
- Surface: POST receive (existing endpoint)
- Handling: 409 InvalidOperationException ("stock updates are only allowed when the line is ordered")
- Guardrails: Existing check for `line.status != ORDERED` already handles this since ungrouped lines can never reach ORDERED.
- Evidence: `app/services/shopping_list_line_service.py:444-448`.

- Failure: Operating on a done shopping list
- Surface: All mutation endpoints
- Handling: 409 InvalidOperationException
- Guardrails: Existing guard checks `shopping_list.status == DONE` at the top of each mutation.
- Evidence: `app/services/shopping_list_line_service.py:69-73`.

---

## 9) Observability / Telemetry

- Signal: `SHOPPING_LIST_LINES_MARKED_ORDERED_TOTAL`
- Type: Counter
- Trigger: When seller group ordering transitions lines to ORDERED. Label `mode="seller_group"`.
- Labels / fields: `mode` (was `single` / `group`; now only `seller_group`)
- Consumer: Existing Prometheus scrape and dashboard.
- Evidence: `app/services/shopping_list_line_service.py:26-30` -- existing metric definition. This metric is moved to the shopping_list_service where the seller group ordering logic now lives, or stays in line service if a thin wrapper is used.

- Signal: `SHOPPING_LIST_SELLER_GROUP_OPERATIONS_TOTAL` (NEW)
- Type: Counter
- Trigger: On each seller group CRUD operation (create, order, reopen, delete).
- Labels / fields: `operation` (create, order, reopen, delete)
- Consumer: Prometheus dashboard.
- Evidence: New metric following the decentralized pattern from `CLAUDE.md`.

No new background work, traces, or alerts are required for this feature.

---

## 10) Background Work & Shutdown

No background workers, threads, or jobs are introduced by this feature. The existing shopping list infrastructure does not use background processing. No shutdown integration changes are needed.

---

## 11) Security & Permissions

No security changes. The shopping list endpoints are already behind the OIDC authentication `before_request` hook on `api_bp`. The new seller group endpoints are registered on the same `shopping_lists_bp` blueprint under `api_bp` and inherit the same authentication.

---

## 12) UX / UI Impact

- Entry point: Shopping list detail page
- Change: The status model changes from a three-phase workflow (Concept -> Ready -> Done) to a two-phase model (Active -> Done). The Ready phase is absorbed into Active. Seller groups become persistent entities with their own CRUD lifecycle instead of being computed groupings.
- User interaction: Users manage seller groups explicitly (create, assign lines, order, reopen, delete) instead of the system computing groups from line seller assignments. The ordering flow moves from per-line to per-seller-group.
- Dependencies: Frontend must be updated in lockstep per the BFF pattern. Document impact in `docs/features/shopping_list_kanban/frontend_impact.md`.
- Evidence: `docs/features/shopping_list_kanban/backend_implementation.md:155-177` -- endpoint change summary.

---

## 13) Deterministic Test Plan

- Surface: ShoppingListService -- seller group CRUD
- Scenarios:
  - Given an active list and a valid seller, When creating a seller group, Then a new ShoppingListSeller row exists with status `active` and empty note.
  - Given an active list with an existing seller group for seller X, When creating a seller group for seller X again, Then 409 is raised.
  - Given a seller group with lines, When GET seller group, Then response includes lines, totals, note, and status.
  - Given a seller group with all lines having `ordered > 0`, When PUT status `ordered`, Then all lines become ORDERED and group status becomes `ordered`.
  - Given a seller group with one line having `ordered == 0`, When PUT status `ordered`, Then 409 is raised and no lines change.
  - Given an ordered seller group with no received lines, When PUT status `active`, Then all ORDERED lines become NEW and group status becomes `active`.
  - Given an ordered seller group with a line having `received > 0`, When PUT status `active`, Then 409 is raised.
  - Given a seller group with only a note update, When PUT with `note` only, Then note is updated, status unchanged.
  - Given an active seller group with lines, When DELETE, Then non-DONE lines become ungrouped (seller_id=NULL, ordered=0, status=NEW), group row is deleted.
  - Given an active seller group with a mix of NEW and DONE lines, When DELETE, Then only the NEW lines are reset to ungrouped; DONE lines retain their seller_id, ordered, status, completed_at, completion_mismatch, and completion_note.
  - Given an ordered seller group, When DELETE, Then 409 is raised.
  - Given a done shopping list, When creating a seller group, Then 409 is raised.
- Fixtures / hooks: Existing test infrastructure (session, container fixtures). Helper functions to create a shopping list + lines + seller group in one call.
- Gaps: None.
- Evidence: `tests/services/test_shopping_list_service.py` -- existing test structure.

- Surface: ShoppingListService -- status transitions
- Scenarios:
  - Given a new list, When created, Then status is `active`.
  - Given an active list, When set status to `done`, Then status becomes `done`.
  - Given a done list, When set status to `active`, Then 409 is raised.
  - Given an active list, When set status to `active` (no-op), Then no error, status unchanged.
- Fixtures / hooks: Standard session/container.
- Gaps: None.
- Evidence: `tests/services/test_shopping_list_service.py:19-60` -- existing tests to refactor.

- Surface: ShoppingListLineService -- update_line with `ordered` field
- Scenarios:
  - Given a NEW line, When update with `ordered=5`, Then line.ordered becomes 5.
  - Given an ORDERED line, When update with `ordered=10`, Then 409 is raised.
  - Given a DONE line, When update with `ordered=5`, Then 409 is raised.
  - Given a NEW line with `ordered=0`, When update with `ordered=0`, Then no change, no error.
- Fixtures / hooks: Standard plus helper to create list+line.
- Gaps: None.
- Evidence: `app/services/shopping_list_line_service.py:193-257` -- update_line.

- Surface: ShoppingListLineService -- seller_id blocking on ORDERED lines
- Scenarios:
  - Given an ORDERED line with seller_id=4, When update with seller_id=5, Then 409 is raised.
  - Given a NEW line with seller_id=4, When update with seller_id=5, Then seller_id changes.
  - Given a NEW line with seller_id=4, When update with seller_id=null, Then seller_id becomes null.
- Fixtures / hooks: Standard plus ordered-line setup helper.
- Gaps: None.
- Evidence: `docs/features/shopping_list_kanban/backend_implementation.md:86-91`.

- Surface: ShoppingListLineService -- ungrouped line restrictions
- Scenarios:
  - Given a line with seller_id=null, When receive stock, Then 409 because line cannot be ORDERED.
  - Given a line with seller_id=null, When ordering via seller group, Then this line is not part of any group, so no change.
  - Given an ORDERED line with seller_id=null (should not normally occur but protects against data inconsistency), When checking `can_receive`, Then `can_receive` returns False because `seller_id is None`.
- Fixtures / hooks: Standard.
- Gaps: None.
- Evidence: `docs/features/shopping_list_kanban/backend_implementation.md:117-119`, `app/models/shopping_list_line.py:143-147`.

- Surface: Seller Group API endpoints
- Scenarios:
  - Given an active list, When POST /seller-groups with valid seller_id, Then 201 with seller group response.
  - Given a list with a seller group, When GET /seller-groups/{seller_id}, Then 200 with full group data.
  - Given a seller group, When PUT /seller-groups/{seller_id} with note update, Then 200 with updated note.
  - Given a seller group with valid ordered lines, When PUT with status=ordered, Then 200 with all lines ORDERED.
  - Given an ordered group, When PUT with status=active, Then 200 with lines reverted.
  - Given an active group, When DELETE, Then 204 and lines are ungrouped.
  - When hitting removed endpoints (order, revert, group-order, order-note), Then 404 or 405.
- Fixtures / hooks: Client fixture, database seeding.
- Gaps: None.
- Evidence: `tests/api/test_shopping_lists_api.py` -- existing API test patterns.

- Surface: Line PUT API with `ordered` field
- Scenarios:
  - Given a NEW line, When PUT with `ordered: 10`, Then 200 with ordered=10.
  - Given an ORDERED line, When PUT with `ordered: 5`, Then 409.
  - Given an ORDERED line, When PUT with `seller_id: 5`, Then 409.
  - Given a NEW line, When PUT with `seller_id: null`, Then 200 with seller_id cleared.
- Fixtures / hooks: Standard API test fixtures.
- Gaps: None.
- Evidence: `tests/api/test_shopping_list_lines_api.py`.

- Surface: Alembic migration 023
- Scenarios:
  - Given a database at revision 022 with concept/ready/done lists and seller notes, When running upgrade, Then concept and ready become active, seller_notes data is in shopping_list_sellers with status=active, old table is dropped.
  - Given the database at revision 023, When running downgrade, Then shopping_list_sellers data is copied back to shopping_list_seller_notes, active statuses revert to concept, table is recreated.
- Fixtures / hooks: Migration testing with a test database.
- Gaps: Downgrade path for status is lossy (active maps back to concept since we cannot distinguish the original); this is acceptable for a hobby project.
- Evidence: `alembic/versions/022_add_seller_logo_s3_key.py` -- current head.

---

## 14) Implementation Slices

- Slice: 1 -- Data model and migration
- Goal: New `ShoppingListSeller` model, updated `ShoppingListStatus` enum, Alembic migration 023.
- Touches: `app/models/shopping_list.py`, `app/models/shopping_list_seller.py` (new), `app/models/shopping_list_seller_note.py` (delete), `app/models/shopping_list_line.py`, `app/models/__init__.py`, `alembic/versions/023_shopping_list_kanban.py` (new).
- Dependencies: None. This slice must land first.

- Slice: 2 -- Service layer refactoring
- Goal: Updated `ShoppingListService` with seller group CRUD and simplified status transitions; updated `ShoppingListLineService` with `ordered` field, seller_id blocking, removed old endpoints.
- Touches: `app/services/shopping_list_service.py`, `app/services/shopping_list_line_service.py`, `app/services/kit_shopping_list_service.py`, `app/services/kit_service.py`.
- Dependencies: Slice 1 (models).

- Slice: 3 -- Schema layer updates
- Goal: New/updated Pydantic schemas for seller groups, updated line schemas, removed dead schemas.
- Touches: `app/schemas/shopping_list.py`, `app/schemas/shopping_list_line.py`, `app/schemas/shopping_list_seller_note.py` (delete), `app/schemas/shopping_list_seller.py` (new or inline), `app/schemas/kit.py`, `app/schemas/part_shopping_list.py`.
- Dependencies: Slice 1 (models, enums).

- Slice: 4 -- API layer changes
- Goal: New seller group endpoints; updated line PUT; removed old endpoints.
- Touches: `app/api/shopping_lists.py`, `app/api/shopping_list_lines.py`, `app/startup.py`.
- Dependencies: Slices 2 and 3 (services, schemas).

- Slice: 5 -- Test data and supporting infrastructure
- Goal: Updated test data files; updated test data service; updated DI container if needed.
- Touches: `app/data/test_data/shopping_lists.json`, `app/data/test_data/shopping_list_lines.json`, `app/data/test_data/shopping_list_sellers.json` (renamed), `app/services/test_data_service.py`.
- Dependencies: Slice 1 (models).

- Slice: 6 -- Tests
- Goal: Comprehensive service and API tests for all new/changed behavior.
- Touches: `tests/services/test_shopping_list_service.py`, `tests/services/test_shopping_list_line_service.py`, `tests/api/test_shopping_lists_api.py`, `tests/api/test_shopping_list_lines_api.py`, `tests/services/test_kit_shopping_list_service.py`, `tests/services/test_kit_service.py`, `tests/test_test_data_service.py`, `tests/test_database_constraints.py`, `tests/test_parts_api.py`, `tests/api/test_parts_api.py`, `tests/api/test_kits_api.py`.
- Dependencies: All prior slices.

---

## 15) Risks & Open Questions

- Risk: Test data has ORDERED lines with null seller_id that become invalid under new rules.
- Impact: `load-test-data` command fails; tests that rely on this data break.
- Mitigation: Fix test data in slice 5 by assigning sellers to previously-ungrouped ORDERED lines, or demoting them to NEW status. The "Bench Replenishment" list line for part QRST (ordered, seller_id=null) must be assigned a seller or made NEW.

- Risk: Kit shopping list integration references CONCEPT status in multiple places.
- Impact: Kit push-to-shopping-list workflows break if CONCEPT references are not updated to ACTIVE.
- Mitigation: Grep is exhaustive (23 files identified). Update all CONCEPT and READY references systematically in slice 2. Run full test suite to catch any missed references.

- Risk: Migration 023 drops `shopping_list_seller_notes` table; if any code path still references it, runtime errors occur.
- Impact: 500 errors on any endpoint that touches seller notes.
- Mitigation: Delete the old model file (`shopping_list_seller_note.py`) and schema file (`shopping_list_seller_note.py`) in slice 1/3. Rely on import errors at startup to catch any stale references.

- Risk: Metrics migration -- `SHOPPING_LIST_LINES_MARKED_ORDERED_TOTAL` labels change.
- Impact: Existing Prometheus dashboards may reference old label values.
- Mitigation: Update the `mode` label from `single`/`group` to `seller_group`. This is a minor dashboard update. The counter name stays the same.

### Open Questions

No open questions remain. All design decisions are captured in `docs/features/shopping_list_kanban/backend_implementation.md` and the requirements checklist above.

---

## 16) Confidence

Confidence: High -- All design decisions are pre-made in the backend implementation document, the codebase patterns are well-established, and the affected surface area is fully mapped with evidence.

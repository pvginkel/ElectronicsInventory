# Shopping List Kanban — Backend Implementation Decisions

This document records the design decisions made between the backend and frontend developers. It serves as the contract specification for the frontend developer.

## Source Requirements

The frontend requirements are in `frontend/docs/features/shopping_list_kanban/backend_requirements.md`. This document captures where the backend implementation diverges from or refines those requirements.

---

## 1. Status Simplification

**Decision**: Replace `concept | ready | done` with `active | done`.

- `active → done` is the only allowed transition.
- No preconditions on the `done` transition. The UI shows a warning if there are outstanding items, but the backend does not enforce it.
- Migration: all existing `concept` and `ready` lists become `active`.
- The `CONCEPT → READY` transition (which required at least one line) and the `READY → CONCEPT` revert (which was blocked if any lines were ORDERED) are both removed. Seller group status and line status provide sufficient protection.

---

## 2. Seller Group Persistence

**Decision**: Refactor `shopping_list_seller_notes` into `shopping_list_sellers`.

The new table stores:
- `shopping_list_id` (FK)
- `seller_id` (FK)
- `note` (text, default empty string)
- `status` (`active | ordered`)
- Timestamps

This replaces the computed seller groups. The "ungrouped" bucket (lines with `seller_id = NULL`) remains virtual — there is no DB row for it.

The `upsert_seller_order_note` endpoint and `shopping_list_seller_notes` table are removed entirely.

---

## 3. Seller Group CRUD Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/shopping-lists/{list_id}/seller-groups` | Create an empty seller group |
| GET | `/api/shopping-lists/{list_id}/seller-groups/{seller_id}` | Get a single seller group |
| PUT | `/api/shopping-lists/{list_id}/seller-groups/{seller_id}` | Update note and/or status |
| DELETE | `/api/shopping-lists/{list_id}/seller-groups/{seller_id}` | Remove seller group |

### POST (Create)
- Body: `{ "seller_id": <int> }`
- Precondition: Seller group must not already exist for this list. Return 409 if it does.
- Creates a seller group with status `active` and no lines.
- Response: `ShoppingListSellerGroupSchema`

### GET
- Returns `ShoppingListSellerGroupSchema` with lines, totals, and order note.

### PUT (Update)
- Body: `{ "note": "...", "status": "active" | "ordered" }` (both optional)
- **Setting status to `ordered`**:
  - Precondition: All lines in the group must have `ordered > 0`. Reject with 409 if any line has `ordered == 0`.
  - Effect: All lines in the group transition from NEW to ORDERED.
- **Setting status to `active`** (reopening):
  - Precondition: No line in the group may have `received > 0`. Reject with 409 if any do.
  - Effect: All ORDERED lines in the group revert to NEW.
  - **Frontend note**: The UI should remove/disable the reopen button when any line in the group has received items, and show a message explaining why.
- Response: `ShoppingListSellerGroupSchema`

### DELETE
- Precondition: Group must not be `ordered`. Reject with 409 (user must reopen first).
- Effect: For non-DONE lines in the group: sets `seller_id = NULL`, clears `ordered` to 0, and resets line status to `new`. DONE lines are left unchanged to preserve completion history (`completed_at`, `completion_note`, `completion_mismatch`). Removes the seller group row.
- Response: 204

---

## 4. Bulk Assignment — Not Implementing

The `POST .../assign-remaining` endpoint from the frontend requirements is not being implemented. Instead, the frontend uses the existing individual `PUT /api/shopping-list-lines/{line_id}` endpoint to assign sellers to lines one at a time.

If this becomes a performance problem, we can add a generic bulk line update endpoint later.

---

## 5. Line Seller Reassignment

**Decision**: No auto-clear of `ordered` when `seller_id` changes. The UI handles the workflow.

Constraints enforced by the backend:
- `seller_id` cannot be changed on a line with status `ORDERED` (reject with 409).
- `seller_id` can be freely changed on NEW lines.

Since lines only become ORDERED via seller group ordering, and seller group ordering locks the group, this is inherently safe.

---

## 6. Line Ordering Flow Changes

**Decision**: Lines are ordered via seller group status, not individually.

### Removed endpoints
- `POST /api/shopping-list-lines/{line_id}/order` — replaced by seller group PUT with `status: "ordered"`
- `POST /api/shopping-list-lines/{line_id}/revert` — replaced by seller group PUT with `status: "active"`
- `POST /api/shopping-lists/{list_id}/seller-groups/{group_ref}/order` — replaced by seller group PUT

### Changed endpoint
- `PUT /api/shopping-list-lines/{line_id}` now accepts `ordered` in the body.
  - Can only be set when line status is NEW.
  - Once the line is ORDERED (via seller group), `ordered` is locked and cannot be changed.

### Workflow
1. User assigns a line to a seller group (via PUT line with `seller_id`).
2. User sets the `ordered` quantity on each line (via PUT line with `ordered`).
3. User orders the seller group (via PUT seller group with `status: "ordered"`).
4. All lines in the group atomically transition to ORDERED.
5. Receiving proceeds per-line as before.
6. Line completion proceeds as before.

### Ungrouped lines
- Lines with no `seller_id` (ungrouped) can never reach ORDERED status.
- They cannot be received.
- The user must assign them to a seller group first.

---

## 7. Mutation Endpoint Responses

**Decision**: Mutation endpoints return the resource that was mutated, not the full shopping list.

- Seller group endpoints return `ShoppingListSellerGroupSchema`.
- Line endpoints return `ShoppingListLineResponseSchema` (unchanged).
- Shopping list status change returns `ShoppingListResponseSchema` (unchanged).

The frontend fetches the full shopping list separately if it needs the complete picture.

---

## 8. Seller Links and Logo URLs

**Already implemented.** No backend changes needed.

- `seller_link` on shopping list lines is already populated from the `part_sellers` link table.
- `logo_url` is already included in `SellerListSchema` used in seller group summaries and line responses.

---

## 9. Line `ordered` Field Semantics

The `ordered` field on a shopping list line serves as the "planned order quantity" while the line is NEW, and becomes the "confirmed order quantity" when the seller group is ordered. The value is set before ordering and locked after.

- Can be set to 0 to indicate "not yet decided" (default).
- Must be > 0 before the seller group can be ordered.
- Cannot be modified once the line is ORDERED. Use `received` to track what actually arrived, and `completion_mismatch` / `completion_note` for discrepancies at completion time.

---

## 10. Summary of Endpoint Changes

### New endpoints
| Method | Path | Response |
|--------|------|----------|
| POST | `/api/shopping-lists/{list_id}/seller-groups` | `ShoppingListSellerGroupSchema` |
| GET | `/api/shopping-lists/{list_id}/seller-groups/{seller_id}` | `ShoppingListSellerGroupSchema` |
| PUT | `/api/shopping-lists/{list_id}/seller-groups/{seller_id}` | `ShoppingListSellerGroupSchema` |
| DELETE | `/api/shopping-lists/{list_id}/seller-groups/{seller_id}` | 204 |

### Removed endpoints
| Method | Path | Reason |
|--------|------|--------|
| POST | `/api/shopping-list-lines/{line_id}/order` | Replaced by seller group ordering |
| POST | `/api/shopping-list-lines/{line_id}/revert` | Replaced by seller group reopening |
| POST | `/api/shopping-lists/{list_id}/seller-groups/{group_ref}/order` | Replaced by seller group PUT |
| PUT | `/api/shopping-lists/{list_id}/seller-groups/{seller_id}/order-note` | Folded into seller group PUT |

### Changed endpoints
| Method | Path | Change |
|--------|------|--------|
| PUT | `/api/shopping-lists/{list_id}/status` | Accepts `active \| done` instead of `concept \| ready \| done` |
| PUT | `/api/shopping-list-lines/{line_id}` | Now accepts `ordered` field; `seller_id` change blocked when ORDERED |

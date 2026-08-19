# Shopping List Kanban — Backend Requirements

This document specifies the backend API changes needed to support the frontend Kanban redesign of the shopping list detail view. It is written from the frontend's perspective — the backend developer should use this as a contract specification.

## 1. Status Simplification

### Change
Replace the `concept | ready | done` tristate with `active | done`.

### Why
The Kanban board works identically for both the compiling phase (no seller columns) and the ordering phase (with seller columns). The distinction between `concept` and `ready` is no longer meaningful in the UI.

### API Impact
- `PUT /api/shopping-lists/{list_id}/status` accepts `{ status: 'active' | 'done' }`.
- `GET /api/shopping-lists` and `GET /api/shopping-lists/{list_id}` return `status: 'active' | 'done'`.
- Existing lists with `concept` or `ready` status should be migrated to `active` (or the backend can alias them).
- The `Mark Ready` transition is removed entirely.

### Migration
- All `concept` and `ready` lists become `active`.
- The frontend will include a mapping layer during rollout that treats `concept` and `ready` as `active`, so the backend migration doesn't need to be atomic with the frontend deployment.

---

## 2. Seller Group Completion

### New Concept
A seller group (all lines assigned to a specific seller on a shopping list) can be marked as "completed," meaning the order has been placed with that seller. Lines in a completed group enter receiving mode.

### New Endpoints

#### `POST /api/shopping-lists/{list_id}/seller-groups/{seller_id}/complete`
- **Purpose**: Mark a seller group as completed (order placed with this seller).
- **Preconditions**: All lines in the group must be in `ordered` status (i.e., they have an ordered quantity set). If any line is still `new`, reject with 409.
- **Effect**: Sets a `completed` flag on the seller group. Lines remain in their current status but are now receivable.
- **Response**: Full `ShoppingListResponseSchema` (same shape as `GET /api/shopping-lists/{list_id}`).

#### `POST /api/shopping-lists/{list_id}/seller-groups/{seller_id}/reopen`
- **Purpose**: Undo completion of a seller group (rare — user forgot to add something).
- **Preconditions**: Group must be completed. May want to reject if any lines have already been received (or allow it — your call, but document the behavior).
- **Effect**: Clears the `completed` flag. Lines return to normal ordering mode.
- **Response**: Full `ShoppingListResponseSchema`.

### Schema Change
The seller group object in the shopping list response needs a new field:
```json
{
  "seller_groups": [
    {
      "group_key": "seller-5",
      "seller_id": 5,
      "seller_name": "Mouser",
      "seller_website": "https://mouser.com",
      "order_note": "...",
      "completed": false,  // <-- NEW FIELD
      "totals": { ... },
      "lines": [ ... ]
    }
  ]
}
```

---

## 3. Seller Group Management

### New Endpoints

#### `POST /api/shopping-lists/{list_id}/seller-groups`
- **Purpose**: Create an empty seller column (before any lines are assigned to it).
- **Body**: `{ "seller_id": <int> }`
- **Preconditions**: Seller group must not already exist for this list. Return 409 if it does.
- **Effect**: Creates a seller group placeholder with zero lines.
- **Response**: Full `ShoppingListResponseSchema`.
- **Why needed**: The user creates seller columns by selecting a seller from a dropdown. They may create the column before dragging any cards into it.

#### `DELETE /api/shopping-lists/{list_id}/seller-groups/{seller_id}`
- **Purpose**: Remove a seller column, moving all its lines back to unassigned.
- **Preconditions**: Group must not be completed. If it is, reject with 409 (the user must reopen first).
- **Effect**: Sets `seller_id = null` on all lines in the group. Clears `ordered` amount on any lines that had one (resets status to `new`). Removes the seller group.
- **Response**: Full `ShoppingListResponseSchema`.

---

## 4. Bulk Assignment

### New Endpoint

#### `POST /api/shopping-lists/{list_id}/seller-groups/{seller_id}/assign-remaining`
- **Purpose**: Move all unassigned lines (lines with `seller_id = null`) to this seller's column.
- **Body**: None.
- **Effect**: Sets `seller_id` to the specified seller for all unassigned lines.
- **Response**: Full `ShoppingListResponseSchema`.
- **Notes**: This is the "Assign remaining" action in the UI's overflow menu. Lines don't get an ordered amount — they're just moved into the seller column with their existing data.

---

## 5. Line Seller Reassignment Behavior

### Existing Endpoint Change
`PUT /api/shopping-list-lines/{line_id}` already accepts `seller_id` in the body. The Kanban board uses this to move individual cards between columns.

### Behavioral Clarification Needed
When `seller_id` changes on a line that has `ordered > 0`:
- **Recommendation**: The backend should automatically reset `ordered` to 0 and `status` to `new`. The frontend will show a confirmation dialog before sending the request, but the cleanup should happen server-side for data integrity.
- **Alternative**: The frontend sends both `seller_id` and `ordered_qty: null` in the same request. Less clean since it requires the frontend to handle the cleanup.

Please confirm which approach the backend will take.

---

## 6. Seller Links on Lines

### Context
The backend is refactoring seller links from a single field on the part entity to a link table (`part_seller_links`). This means a part can have links to multiple sellers.

### What the Frontend Needs
When returning shopping list line data, include the seller link URL for the line's assigned seller:

```json
{
  "lines": [
    {
      "id": 42,
      "part": { "id": 1, "key": "R-10K", ... },
      "seller": { "id": 5, "name": "Mouser", ... },
      "seller_link": "https://mouser.com/product/12345",  // <-- URL from part_seller_links for this part + this seller
      ...
    }
  ]
}
```

- `seller_link` should be `null` if:
  - The line has no seller assigned, OR
  - The part has no seller link for the assigned seller.
- This field may already exist in the current API schema. If so, ensure it's populated from the new link table.

---

## 7. Seller Logo URL

### What the Frontend Needs
The seller summary objects throughout the API should include the seller's logo URL:

```json
{
  "seller": {
    "id": 5,
    "name": "Mouser",
    "website": "https://mouser.com",
    "logo_url": "/api/sellers/5/logo"  // or whatever the current URL pattern is
  }
}
```

This may already be present in the `SellerListSchema`. Ensure it's included in:
- Seller group summaries in the shopping list response.
- Seller summaries on individual lines.

---

## 8. Summary of New Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/shopping-lists/{list_id}/seller-groups` | Create empty seller column |
| DELETE | `/api/shopping-lists/{list_id}/seller-groups/{seller_id}` | Remove seller column (move lines to unassigned) |
| POST | `/api/shopping-lists/{list_id}/seller-groups/{seller_id}/complete` | Mark seller group as order-placed |
| POST | `/api/shopping-lists/{list_id}/seller-groups/{seller_id}/reopen` | Undo seller group completion |
| POST | `/api/shopping-lists/{list_id}/seller-groups/{seller_id}/assign-remaining` | Move all unassigned lines to this seller |

### Existing Endpoints (behavioral changes)
| Method | Path | Change |
|--------|------|--------|
| PUT | `/api/shopping-list-lines/{line_id}` | Clear ordered/status when seller_id changes (if approach confirmed) |
| PUT | `/api/shopping-lists/{list_id}/status` | Accept `active \| done` instead of `concept \| ready \| done` |

---

## 9. Open Questions for Backend Developer

1. **Auto-clear ordered on seller change**: When a line's `seller_id` is changed via PUT and the line has `ordered > 0`, should the backend automatically reset `ordered` to 0 and `status` to `new`? (Recommended: yes.)

2. **Complete with `new` lines**: When completing a seller group, what should happen to lines that are still in `new` status (no ordered amount set)? Options:
   - a) Reject the completion (409) — frontend disables the button when `new` lines exist. **(Recommended)**
   - b) Auto-order them at their `needed` amount.

3. **Reopen with received lines**: When reopening a seller group, should it be allowed if some lines have already been received? The frontend can handle both cases — just document the behavior.

4. **Delete completed column**: Should deleting a completed seller column be allowed, or must it be reopened first? (Frontend currently assumes reopen-first is required.)

5. **Empty seller group persistence**: When a seller column is created via `POST /seller-groups` with no lines, is it persisted as a real entity? Or is it ephemeral and only exists while the list response includes it? (Frontend needs it to persist across page reloads.)

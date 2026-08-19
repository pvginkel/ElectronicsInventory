# Shopping List Kanban Redesign — Change Brief

## Context

The shopping list detail screen is being redesigned from its current table-based layout (with an explicit concept → ready → done state machine) to a Kanban/swim-lane board. This coincides with a backend refactoring that moves seller links from the part entity into a link table, allowing parts to have multiple seller links.

The backend work has been delivered. The backend implementation decisions are documented in `backend/docs/features/shopping_list_kanban/backend_implementation.md`.

## What Needs to Change

Replace the shopping list detail view with a horizontal Kanban board where:

- The **leftmost column** ("Unassigned") holds all items not yet assigned to a seller.
- **Seller columns** appear to the right, one per seller. Each represents the shopping cart being built with that seller.
- A **skeleton column** on the far right lets the user create new seller columns by selecting a seller from a searchable dropdown.
- **Cards** represent shopping list lines. They are **dragged** between columns to assign/reassign parts to sellers.

### Card Design (progressive disclosure by column)

**Unassigned card:** part key (bold), part description (muted, truncated), part cover image, editable "needed" field, editable "note" field (3-line max, ellipsis, expand on hover), trash icon to delete.

**Seller card (ordering — seller group status `active`):** same as unassigned, plus editable "ordered" field (displays 0 as em dash "—"), plus seller link icon (external link to the seller's page for this specific part — only shown if the part has a seller link for that column's seller). Trash icon visible while line status is `new`.

**Seller card (receiving — seller group status `ordered`):** part key, description, cover image, read-only "ordered" and "received" fields, a receive/check button to mark the line as received (opens the existing Update Stock dialog). No needed field, no note, no delete. The check button disappears once the line is completed (the line has a completion status controlled by the Update Stock dialog's "complete item" option).

### Inline Editing

All editable fields use a hover-to-reveal-border, click-to-edit pattern:
- Mouse not hovering: plain label.
- Mouse hovering over value: subtle border appears (looks like an input field).
- Click: transforms to an actual input, content selected and focused.
- Blur/Enter: saves. Escape: reverts.

The `ordered` field is edited via `PUT /api/shopping-list-lines/{line_id}` with the `ordered` body field. This is only allowed when the line status is `new`. Once the seller group is ordered, the `ordered` field becomes read-only.

### Column Headers

- **Unassigned:** title, item count badge, [+] Add Part button.
- **Seller (ordering, group status `active`):** seller name, seller icon, item count, seller website link, order note icon (with dot indicator if note exists), complete button (orders the seller group). Behind a ⋯ menu: "Assign remaining" (moves all unassigned cards to this column one-by-one), "Delete list" (moves all cards back to unassigned and removes the column).
- **Seller (receiving, group status `ordered`):** visual indicator in the header showing the column is ordered (e.g. green check, different border color). A "Reopen" action (behind ⋯ menu) to undo the order — only available when no lines in the group have received items. The cards switch to receiving mode.

### Drag and Drop

- Entire card is draggable. Cursor: grab/grabbing.
- As card hovers over a target column, a placeholder appears at the sorted position (cards always maintain sort order within columns — no manual reordering).
- Dropping on background cancels the drag (card returns to original position).
- Cards in `ordered` status cannot be dragged (seller change is blocked by backend).
- Cards in `new` status with `ordered > 0`: when moving off a seller column, a confirmation dialog is shown ("The ordered amount will be cleared. Are you sure?"). On confirm, the frontend clears `ordered` to 0 before changing `seller_id`.
- Horizontal scroll of the board when dragging near edges or by dragging the board background.
- Mobile: long-press (600ms) to initiate drag.

### Ordered Amount Styling

- Orange text (amber-600) when ordered amount is greater than zero and less than needed amount.
- Tooltip explaining the orange color: "Ordered quantity is less than needed."
- Em dash "—" displayed when ordered amount is 0 (not yet set).

### Add Part

The [+] Add Part button appears on both the unassigned column header AND on seller column headers. When used on a seller column, the new card is created directly in that seller's column (line created with `seller_id` set).

### Shopping List Status

The backend has simplified the status model to `active | done`. The concept/ready distinction is removed. The Kanban board is the view for `active` lists. `done` lists are read-only.

### Seller Group Lifecycle

Seller groups are persisted in the `shopping_list_sellers` table with status `active | ordered`:

1. **Create**: `POST /api/shopping-lists/{list_id}/seller-groups` creates an empty column.
2. **Order**: `PUT /api/shopping-lists/{list_id}/seller-groups/{seller_id}` with `status: "ordered"` — requires all lines to have `ordered > 0`. Atomically transitions all lines to ORDERED.
3. **Reopen**: PUT with `status: "active"` — blocked if any line has `received > 0`. Reverts all ORDERED lines to NEW.
4. **Delete**: `DELETE /api/shopping-lists/{list_id}/seller-groups/{seller_id}` — blocked if group is ordered. Moves non-DONE lines to unassigned, clears their ordered amounts.
5. **Note**: PUT with `note` field updates the order note.

### Mutation Response Strategy

Seller group mutations return `ShoppingListSellerGroupSchema` (not the full list). Line mutations return `ShoppingListLineResponseSchema`. The frontend invalidates the full shopping list query cache after mutations to keep the board consistent.

### Layout

- All columns have the same width.
- Columns scroll vertically independently.
- Board scrolls horizontally when columns exceed viewport width.
- Board fills the remaining viewport height below the header.

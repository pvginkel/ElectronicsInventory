# Toast System Improvements – Undo Button Strategy

## Summary

This document identifies operations where **undo buttons improve workflow** by removing friction from confirmation dialogs during active editing/curation tasks.

**Key Principle:** Use undo for frequent operations during active workflows. Keep confirmation dialogs for rare, deliberate actions (type/seller/box deletion, list deletion, etc.).

---

## Current Implementation

### Kit Archive (Reference Pattern)
- **Location**: `src/components/kits/kit-archive-controls.tsx:131-138`
- **Toast message**: `Archived "{kit.name}"`
- **Pattern**:
  - No confirmation dialog
  - Success toast with undo button: `{ id: 'undo', label: 'Undo', onClick: handleUndo }`
  - Optimistic updates with TanStack Query state snapshots
  - Undo triggers reverse mutation (unarchive)
  - Tracks undo in-flight state with refs to prevent duplicates
  - Restores snapshots on error

---

## Recommended Undo Implementations

### 1. Shopping List Line Deletion
- **Location**: `src/routes/shopping-lists/$listId.tsx:200-218`
- **Current toast**: `Removed part from Concept list`
- **Current behavior**: Has confirmation dialog
- **Proposed change**:
  - **Remove confirmation dialog**
  - Add undo button to success toast
  - Undo re-adds the line with same part, quantity, and notes
- **Why undo is better**: Users iterate quickly through lists, cleaning up and removing items. Confirmation dialogs slow down this editing flow. Undo allows speed without risk.
- **Frequency**: High during list curation
- **Implementation**:
  - Store deleted line data (lineId, partKey, quantity, note) before mutation
  - Undo uses existing "add line" mutation to restore
  - Optimistically restore in UI on undo
- **Backend support**: Use existing add-line API

### 2. Kit Part Removal
- **Location**: `src/hooks/use-kit-contents.ts:777-814`
- **Current toast**: `Removed part from kit`
- **Current behavior**: Likely has confirmation dialog
- **Proposed change**:
  - **Remove confirmation dialog**
  - Add undo button to success toast
  - Undo re-adds the part with same requiredPerUnit and note
- **Why undo is better**: When curating a kit BOM, users make rapid decisions about what stays/goes. Confirmation interrupts this editing flow. Undo enables fast iteration.
- **Frequency**: High during kit creation/editing
- **Implementation**:
  - Store content data (contentId, partId, partKey, requiredPerUnit, note, version) before deletion
  - Undo uses existing "add content" mutation to restore
  - Optimistically restore in UI on undo
- **Backend support**: Use existing add-content API

### 3. Shopping List Group Ordering
- **Location**: `src/routes/shopping-lists/$listId.tsx:348-378`
- **Current toast**: `Marked {count} lines Ordered for {seller}`
- **Current behavior**: No confirmation (data entry operation)
- **Proposed change**:
  - Add undo button to success toast
  - Undo reverts all lines in the group back to previous ordered quantities (typically 0 / "New" status)
- **Why undo is better**: **Batch operation risk** - one click affects 5-15 lines. Easy to click wrong seller group (Mouser vs. Digikey). Manually reverting each line is tedious.
- **Frequency**: Medium-High during order placement workflow
- **Implementation**:
  - Store previous state of all lines in the group before mutation (lineId → orderedQuantity map)
  - Undo uses existing order-group or batch order-line mutation to restore previous quantities
  - May need to batch-revert optimistically in UI
- **Backend support**: Existing order-line API should support reverting; may need batch endpoint for efficiency

### 4. Kit Archive
- **Location**: `src/components/kits/kit-archive-controls.tsx:131-138`
- **Status**: ✅ **Already implemented**
- **Keep as-is**: Reference implementation for new undo patterns

---

## Operations That Keep Confirmation Dialogs

These are **rare, deliberate operations** where confirmation dialogs are appropriate:

- **Type deletion** - Foundational taxonomy; rare operation
- **Seller deletion** - Reference data; rare operation
- **Box deletion** - Storage infrastructure; rare operation
- **Shopping list deletion** - Contains substantial work; very rare, ultra-destructive
- **Kit deletion** - Not currently mentioned, but presumably exists and should keep confirmation

**Why keep confirmations**: These operations are infrequent and carry high impact. Users should pause and confirm intent.

---

## Backend Support Requirements

### Shopping List Status Transitions

**Recommendation**: Backend should support reverting shopping list status transitions without needing undo buttons.

Specifically:
- **Done → Ready**: Users should be able to revert a "Done" list back to "Ready" status
  - **Current**: `updateStatusMutation` exists but may only support forward transitions
  - **Proposed**: Extend status update API to support backward transitions (Done → Ready, Ready → Concept)
  - **Why**: Status transitions are deliberate actions where undo feels awkward. Better to provide explicit UI controls for reverting status (e.g., "Reopen List" button on Done list detail view).

**Location**: `src/components/shopping-lists/list-delete-confirm.tsx:76-143`

**Current toast**: `Marked shopping list "{list.name}" as Done`

**Alternative to undo**: Add dedicated UI action in Done lists view to revert status back to Ready.

---

## Implementation Pattern (All New Undos)

Follow the kit archive reference implementation:

1. **Remove confirmation dialog** (for line/part deletions only)
2. **Store mutation context** before executing:
   - For deletions: Store full object data (part, quantity, notes, etc.)
   - For batch operations: Store previous state of all affected records
3. **Add toast action on success**:
   ```typescript
   showSuccess('Operation completed', {
     action: {
       id: 'undo',
       label: 'Undo',
       testId: `scope.toast.undo.${id}`,
       onClick: handleUndo,
     },
   });
   ```
4. **Implement `handleUndo`**:
   - Track in-flight state with ref (prevent duplicate undos)
   - Call reverse mutation (restore deleted item, revert batch changes, etc.)
   - Use existing "add" or "update" APIs to restore state
5. **Optimistic updates**:
   - Optimistically apply changes to UI via TanStack Query cache
   - Store snapshots for rollback on error
6. **Error handling**: Restore UI snapshot if mutation fails

---

## Testing Requirements

For each undo implementation, add Playwright specs:

- **Happy path**: Perform action, click undo, verify state restored
- **Toast timeout**: Verify undo button disappears with toast (15s default)
- **Concurrent mutations**: Verify undo doesn't conflict with other in-flight operations
- **Navigation**: Verify undo works correctly if user navigates away and back
- **Backend errors**: Verify graceful handling if undo mutation fails
- **Instrumentation**: Verify test events emitted for both primary action and undo

Follow existing instrumentation patterns (Form events for undo actions, metadata includes `undo: true` flag).

---

## Implementation Order

Recommended sequence (easiest → most complex):

1. **Shopping list line deletion** (single-record, straightforward)
2. **Kit part removal** (single-record, similar pattern)
3. **Shopping list group ordering** (batch operation, more complex state management)

**Estimated effort**: 1-2 days each, including backend changes and Playwright coverage.

---

## Summary Table

| Operation | Current Pattern | Proposed Pattern | Backend Change Needed |
|-----------|----------------|------------------|----------------------|
| Kit archive | Undo button ✅ | Keep as-is | None |
| Shopping list line deletion | Confirmation dialog | **Remove dialog, add undo** | None (use existing add-line API) |
| Kit part removal | Confirmation dialog | **Remove dialog, add undo** | None (use existing add-content API) |
| Shopping list group ordering | No confirmation | **Add undo button** | None (use existing order-line API) |
| Shopping list mark done | Confirmation dialog | **Keep dialog, add Reopen action in Done view** | Support Done → Ready status transition |

---

## Out of Scope

All other operations retain their current patterns:
- **Create operations** (kits, lists, parts, boxes, sellers): No undo needed; manual deletion available
- **Update operations** (metadata, settings): No undo needed; users can re-edit
- **Rare deletions** (types, sellers, boxes, lists): Keep confirmation dialogs
- **Individual line ordering**: No undo needed; existing "Revert to New" UI sufficient
- **Workflow completions**: No undo needed; deliberate endpoint actions

---

## Appendix: Complete Success Toast Inventory

(For reference only - not all candidates for undo)

**Shopping Lists** (`src/routes/shopping-lists/$listId.tsx`):
- Line 213: Removed part from Concept list ← **Undo candidate**
- Line 233: List details updated
- Line 247: List marked Ready
- Line 303/305: Marked ordered / cleared ordered
- Line 327: Reverted to New
- Line 367: Marked group ordered ← **Undo candidate**
- Line 416: Received parts
- Line 474: Line completed
- Line 492: Returned to Concept

**Kit Contents** (`src/hooks/use-kit-contents.ts`):
- Line 561: Added part to kit
- Line 702: Updated kit part
- Line 802: Removed part from kit ← **Undo candidate**

**Kit Archive** (`src/components/kits/kit-archive-controls.tsx`):
- Line 131: Archived ← **Already has undo ✅**
- Line 85/87: Unarchived

**Other Components**:
- Types: Created, updated, deleted (keep confirmation)
- Sellers: Created, updated, deleted (keep confirmation)
- Boxes: Created, updated, deleted (keep confirmation)
- Kits: Created, updated, unlinked from shopping list
- Shopping lists: Created, deleted (keep confirmation), marked done
- Parts: Duplicated
- Pick lists: Created, completed

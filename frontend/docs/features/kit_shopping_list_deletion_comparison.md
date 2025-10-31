# Kit Content vs Shopping List Line Deletion - Implementation Comparison

## Executive Summary

This document compares the deletion implementations between kit content deletion and shopping list line deletion to identify differences and prepare a plan to align them. Both features now use immediate deletion with undo (toast action), but kit content deletion includes loading state tracking that shopping list line deletion lacks.

**Key Finding**: Kit content deletion has `pendingDeleteId` state and shows a "Removing..." badge during deletion, while shopping list line deletion proceeds immediately without any loading state UI feedback.

---

## 1. Kit Content Deletion Implementation

### Hook: `/work/frontend/src/hooks/use-kit-contents.ts`

#### State Variables (Lines 169-171)
```typescript
const [confirmRowId, setConfirmRowId] = useState<number | null>(null);
const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
const [isDeleteSubmitting, setIsDeleteSubmitting] = useState(false);
```

- `confirmRowId`: Legacy state (no longer used for confirmation dialog)
- `pendingDeleteId`: **Tracks which content row is currently being deleted**
- `isDeleteSubmitting`: **Global flag indicating a delete operation is in progress**

#### Undo Snapshot Structure (Lines 174-181)
```typescript
interface DeletedContentSnapshot {
  contentId: number;
  kitId: number;
  partId: number;
  partKey: string;
  requiredPerUnit: number;
  note: string | null;
}
const deletedContentSnapshotsRef = useRef<Map<number, DeletedContentSnapshot>>(new Map());
const undoInFlightRef = useRef(false);
```

**Note**: Uses `Map` to support concurrent deletions, with `contentId` as the key.

#### `openDelete` Function (Lines 821-896)

**Flow**:
1. Archive check (lines 823-826)
2. **Capture snapshot** immediately (lines 829-836)
3. **Set loading state** (lines 839-840):
   ```typescript
   setIsDeleteSubmitting(true);
   setPendingDeleteId(row.id);
   ```
4. Track instrumentation submit event (lines 841-846)
5. Execute mutation (lines 849-852)
6. **On success** (lines 853-870):
   - Clear loading state: `setPendingDeleteId(null)` and `setIsDeleteSubmitting(false)`
   - Track success instrumentation
   - Show toast with undo action
   - Refetch query
7. **On error** (lines 872-884):
   - Clear loading state
   - Remove snapshot (snapshot cleanup on failure)
   - Track error instrumentation
   - Show exception toast

#### Undo Handler: `handleUndoDeleteContent` (Lines 769-819)

**Flow**:
1. Check if undo already in flight (guard with `undoInFlightRef`)
2. Retrieve snapshot from Map by `contentId`
3. Set undo in-flight flag
4. Track restore submit event
5. Call create mutation to restore content
6. **On success**: Track success, show toast, refetch, cleanup snapshot
7. **On error**: Track error, show exception, clear in-flight flag

**Key Detail**: Uses the **create mutation** to restore deleted content (line 787-795).

---

### UI Component: `/work/frontend/src/components/kits/kit-bom-table.tsx`

#### Props Flow (Lines 137-141)
```typescript
const pendingDeleteId = overlays.pendingDeleteId;
// ...
const isDeleting = pendingDeleteId === row.id;
```

The `isDeleting` flag is derived from comparing `row.id` with `pendingDeleteId`.

#### Display Row Props (Lines 180-188)
```typescript
interface KitBOMDisplayRowProps {
  row: KitContentRow;
  pendingUpdate?: PendingUpdateDraft;
  isDeleting: boolean;           // ← Deletion loading state
  disableActions: boolean;
  readOnly: boolean;
  onEdit: (row: KitContentRow) => void;
  onDelete: (row: KitContentRow) => void;
}
```

#### UI Rendering (Lines 279-283)
```typescript
{isDeleting ? (
  <Badge variant="outline" className="inline-flex items-center gap-1 text-xs">
    <Loader2 className="h-3 w-3 animate-spin" />
    Removing…
  </Badge>
) : null}
```

**Visual Feedback**: A badge with spinner appears in the Actions column while deletion is in progress.

#### Button Disabling (Line 207)
```typescript
const disableRowActions = disableActions || Boolean(pendingUpdate) || isDeleting;
```

**Behavior**: Edit and Delete buttons are disabled while `isDeleting` is true.

---

## 2. Shopping List Line Deletion Implementation

### Route File: `/work/frontend/src/routes/shopping-lists/$listId.tsx`

#### State Variables (Lines 99-110)
```typescript
const undoInFlightRef = useRef(false);
interface DeletedLineSnapshot {
  lineId: number;
  listId: number;
  partId: number;
  partKey: string;
  needed: number;
  sellerId: number | null;
  note: string | null;
}
const deletedLineSnapshotsRef = useRef<Map<number, DeletedLineSnapshot>>(new Map());
```

**No `pendingDeleteId` or `isDeleteSubmitting` state variables.**

#### Undo Handler: `handleUndoDeleteLine` (Lines 231-286)

**Flow** (very similar to kit implementation):
1. Guard with `undoInFlightRef`
2. Retrieve snapshot from Map by `lineId`
3. Set undo in-flight flag
4. Track restore submit event (formId: `'ShoppingListLine:restore'`)
5. Call `addLineMutation` to restore the line
6. **On success**: Clear undo flag, cleanup snapshot, track success, show toast, invalidate query
7. **On error**: Clear undo flag, track error, show exception

**Key Detail**: Uses the **add line mutation** (`addLineMutation.mutateAsync`) to restore deleted line (lines 249-258).

#### `handleDeleteLine` Function (Lines 288-339)

**Flow**:
1. **Capture snapshot** immediately (lines 290-299)
2. Track submit instrumentation (lines 301-305)
3. **Execute deletion mutation** (lines 307-312) — **No loading state set**
4. **On success** (lines 314-327):
   - Track success instrumentation
   - Show toast with undo action
5. **On error** (lines 328-338):
   - Remove snapshot (cleanup on failure)
   - Track error instrumentation
   - Show exception

**Critical Difference**: No `setIsDeleteSubmitting` or `setPendingDeleteId` calls. Deletion proceeds without visible loading state.

---

### UI Component: `/work/frontend/src/components/shopping-lists/concept-line-row.tsx`

#### Props (Lines 11-16)
```typescript
interface ConceptLineRowProps {
  line: ShoppingListConceptLine;
  onEdit: (line: ShoppingListConceptLine) => void;
  onDelete: (line: ShoppingListConceptLine) => void;
  highlighted?: boolean;         // ← For scroll-into-view highlighting
}
```

**No `isDeleting` or loading state prop.**

#### Row Rendering (Lines 38-138)
- Delete button (lines 124-134) has no disabled state based on deletion in progress
- No badge or visual feedback during deletion
- Buttons are always enabled (no disabling during deletion)

---

## 3. Key Differences Summary

| Aspect | Kit Content Deletion | Shopping List Line Deletion |
|--------|---------------------|----------------------------|
| **Loading State Tracking** | ✅ `pendingDeleteId`, `isDeleteSubmitting` | ❌ None |
| **Visual Feedback** | ✅ "Removing..." badge with spinner | ❌ None |
| **Button Disabling** | ✅ Edit/Delete disabled during deletion | ❌ Always enabled |
| **Snapshot Structure** | `DeletedContentSnapshot` (6 fields) | `DeletedLineSnapshot` (7 fields) |
| **Undo Mechanism** | Create mutation to restore | Add line mutation to restore |
| **Concurrent Deletion Support** | ✅ Map-based snapshots | ✅ Map-based snapshots |
| **Instrumentation** | `KitContent:delete`, `KitContent:restore` | `ShoppingListLine:delete`, `ShoppingListLine:restore` |
| **Toast Test ID** | `kits.detail.toast.undo.${contentId}` | `shopping-lists.concept.toast.undo.${lineId}` |
| **Toast Message** | "Removed part from kit" | "Removed part from Concept list" |
| **Undo Toast Message** | "Restored part to kit" | "Restored line to Concept list" |

---

## 4. Code Alignment Recommendations

### Option A: Add Loading State to Shopping List Line Deletion (Match Kit Pattern)

**Changes Needed**:

1. **Add state variables** in `/work/frontend/src/routes/shopping-lists/$listId.tsx`:
   ```typescript
   const [pendingDeleteLineId, setPendingDeleteLineId] = useState<number | null>(null);
   const [isLineDeleteSubmitting, setIsLineDeleteSubmitting] = useState(false);
   ```

2. **Update `handleDeleteLine`** to set loading state:
   ```typescript
   const handleDeleteLine = useCallback(async (line: ShoppingListConceptLine) => {
     // ... snapshot creation ...

     setIsLineDeleteSubmitting(true);
     setPendingDeleteLineId(line.id);

     trackFormSubmit(...);

     try {
       await deleteLineMutation.mutateAsync(...);
       // ... success handling ...
     } catch (err) {
       // ... error handling ...
     } finally {
       setIsLineDeleteSubmitting(false);
       setPendingDeleteLineId(null);
     }
   }, [...]);
   ```

3. **Pass loading state to ConceptTable**:
   ```typescript
   <ConceptTable
     // ... existing props ...
     pendingDeleteLineId={pendingDeleteLineId}
   />
   ```

4. **Update ConceptLineRow** to accept and render loading state:
   ```typescript
   interface ConceptLineRowProps {
     line: ShoppingListConceptLine;
     onEdit: (line: ShoppingListConceptLine) => void;
     onDelete: (line: ShoppingListConceptLine) => void;
     highlighted?: boolean;
     isDeleting?: boolean;  // ← New prop
   }

   // In render:
   {isDeleting ? (
     <Badge variant="outline" className="inline-flex items-center gap-1 text-xs">
       <Loader2 className="h-3 w-3 animate-spin" />
       Removing…
     </Badge>
   ) : null}
   ```

5. **Disable buttons during deletion**:
   ```typescript
   const disableActions = Boolean(isDeleting);

   <Button
     // ...
     disabled={disableActions}
     onClick={() => onEdit(line)}
   />
   <Button
     // ...
     disabled={disableActions}
     onClick={() => onDelete(line)}
   />
   ```

**Pros**:
- Provides visual feedback during deletion
- Prevents accidental double-clicks
- Consistent with kit implementation
- Better UX for slow network conditions

**Cons**:
- Additional state management complexity
- More props to thread through components
- Slightly more code to maintain

---

### Option B: Remove Loading State from Kit Content Deletion (Match Shopping List Pattern)

**Changes Needed**:

1. **Remove state variables** from `/work/frontend/src/hooks/use-kit-contents.ts`:
   - Delete `pendingDeleteId` state (line 170)
   - Delete `isDeleteSubmitting` state (line 171)

2. **Simplify `openDelete` function** (lines 821-896):
   - Remove `setIsDeleteSubmitting(true)` and `setPendingDeleteId(row.id)` calls
   - Remove loading state cleanup in success/error handlers
   - Keep snapshot capture and undo logic

3. **Update `UseKitContentsResult` interface** (lines 118-132):
   - Remove `pendingDeleteId` from `overlays` object

4. **Remove loading state from UI** in `/work/frontend/src/components/kits/kit-bom-table.tsx`:
   - Remove `pendingDeleteId` from overlays (line 37)
   - Remove `isDeleting` calculation (line 139)
   - Remove "Removing..." badge rendering (lines 279-283)
   - Simplify `disableRowActions` calculation (line 207)

5. **Remove `isDeleting` prop** from `KitBOMDisplayRowProps` interface (line 183)

**Pros**:
- Simpler state management
- Fewer props to pass
- Consistent with shopping list implementation
- Less code to maintain

**Cons**:
- No visual feedback during deletion (could be confusing on slow networks)
- Buttons remain enabled during deletion (risk of double-click)
- Regression in UX from current kit implementation

---

## 5. Opportunities for Code Reuse

### Potential Shared Custom Hook: `useDeletionWithUndo`

Both implementations follow nearly identical patterns:
1. Capture snapshot before deletion
2. Execute deletion mutation
3. Show toast with undo action on success
4. Provide undo handler that restores via creation mutation
5. Track instrumentation events

**Proposed Hook Signature**:
```typescript
interface UseDeletionWithUndoOptions<TItem, TSnapshot> {
  formIdPrefix: string;              // e.g., 'KitContent', 'ShoppingListLine'
  captureSnapshot: (item: TItem) => TSnapshot;
  restoreMutation: (snapshot: TSnapshot) => Promise<void>;
  onSuccess?: (item: TItem) => void;
  onError?: (item: TItem, error: unknown) => void;
  getToastMessage: (item: TItem) => string;
  getUndoToastMessage: () => string;
  getUndoTestId: (item: TItem) => string;
}

function useDeletionWithUndo<TItem, TSnapshot extends { id: number }>(
  deleteMutation: UseMutationResult<void, Error, any>,
  options: UseDeletionWithUndoOptions<TItem, TSnapshot>
) {
  const deletedSnapshotsRef = useRef<Map<number, TSnapshot>>(new Map());
  const undoInFlightRef = useRef(false);
  const { showSuccess, showException } = useToast();

  const handleDelete = useCallback(async (item: TItem, itemId: number) => {
    const snapshot = options.captureSnapshot(item);
    deletedSnapshotsRef.current.set(itemId, snapshot);

    trackFormSubmit(`${options.formIdPrefix}:delete`, { ... });

    try {
      await deleteMutation.mutateAsync(...);
      trackFormSuccess(`${options.formIdPrefix}:delete`, { ... });
      showSuccess(options.getToastMessage(item), {
        action: {
          id: 'undo',
          label: 'Undo',
          testId: options.getUndoTestId(item),
          onClick: handleUndo(itemId),
        },
      });
      options.onSuccess?.(item);
    } catch (error) {
      deletedSnapshotsRef.current.delete(itemId);
      trackFormError(`${options.formIdPrefix}:delete`, { ... });
      showException('Failed to delete', error);
      options.onError?.(item, error);
    }
  }, [deleteMutation, options, showSuccess, showException]);

  const handleUndo = useCallback((itemId: number) => {
    return () => {
      if (undoInFlightRef.current) return;
      const snapshot = deletedSnapshotsRef.current.get(itemId);
      if (!snapshot) return;

      undoInFlightRef.current = true;
      trackFormSubmit(`${options.formIdPrefix}:restore`, { undo: true, ... });

      options.restoreMutation(snapshot)
        .then(() => {
          undoInFlightRef.current = false;
          deletedSnapshotsRef.current.delete(itemId);
          trackFormSuccess(`${options.formIdPrefix}:restore`, { undo: true, ... });
          showSuccess(options.getUndoToastMessage());
        })
        .catch((error) => {
          undoInFlightRef.current = false;
          trackFormError(`${options.formIdPrefix}:restore`, { undo: true, ... });
          showException('Failed to restore', error);
        });
    };
  }, [options, showSuccess, showException]);

  return { handleDelete, handleUndo };
}
```

**Benefits**:
- Consolidates deletion + undo logic
- Enforces consistent instrumentation
- Reduces code duplication
- Easier to maintain and test

**Considerations**:
- May be over-engineering if patterns diverge in the future
- Adds abstraction layer
- Needs careful typing for TypeScript

---

## 6. Test Coverage Analysis

Both implementations have comprehensive Playwright test suites:

### Kit Content Undo Tests: `/work/frontend/tests/e2e/kits/kit-contents-undo.spec.ts`

**Test Cases**:
1. ✅ Removes content and undoes deletion (lines 14-102)
2. ✅ Undo toast dismisses after timeout (lines 104-147)
3. ✅ Cannot undo deletion from archived kit (lines 149-181)
4. ✅ Handles concurrent deletions with separate undo buttons (lines 183-257)
5. ✅ Preserves note and required_per_unit when undoing (lines 259-308)

**Instrumentation Events Tested**:
- `KitContent:delete` (submit, success)
- `KitContent:restore` (submit, success)
- Toast events with undo action

### Shopping List Line Undo Tests: `/work/frontend/tests/e2e/shopping-lists/line-deletion-undo.spec.ts`

**Test Cases**:
1. ✅ Removes line and undoes deletion (lines 17-109)
2. ✅ Undo toast dismisses after timeout (lines 111-145)
3. ✅ Handles concurrent deletions with separate undo buttons (lines 147-211)
4. ✅ Preserves seller and note when undoing (lines 213-260)
5. ✅ Rapid successive deletions each get undo buttons (lines 262-322)

**Instrumentation Events Tested**:
- `ShoppingListLine:delete` (submit, success)
- `ShoppingListLine:restore` (submit, success)
- Toast events with undo action

**Note**: No tests for "Removing..." badge or button disabling in shopping list tests because those features don't exist.

---

## 7. Exact Changes Needed (Option A: Add Loading State to Shopping Lists)

### File 1: `/work/frontend/src/routes/shopping-lists/$listId.tsx`

**Add state variables** (after line 110):
```typescript
const [pendingDeleteLineId, setPendingDeleteLineId] = useState<number | null>(null);
```

**Update `handleDeleteLine`** (lines 288-339):
```typescript
const handleDeleteLine = useCallback(async (line: ShoppingListConceptLine) => {
  // Capture snapshot before deletion for undo - store in Map for concurrent deletion support
  const snapshot: DeletedLineSnapshot = {
    lineId: line.id,
    listId: line.shoppingListId,
    partId: line.part.id,
    partKey: line.part.key,
    needed: line.needed,
    sellerId: line.seller?.id ?? null,
    note: line.note,
  };
  deletedLineSnapshotsRef.current.set(line.id, snapshot);

  setPendingDeleteLineId(line.id);  // ← NEW: Set loading state

  trackFormSubmit('ShoppingListLine:delete', {
    lineId: line.id,
    listId: line.shoppingListId,
    partKey: line.part.key,
  });

  try {
    await deleteLineMutation.mutateAsync({
      lineId: line.id,
      listId: line.shoppingListId,
      partKey: line.part.key,
    });

    trackFormSuccess('ShoppingListLine:delete', {
      lineId: line.id,
      listId: line.shoppingListId,
      partKey: line.part.key,
    });

    showSuccess('Removed part from Concept list', {
      action: {
        id: 'undo',
        label: 'Undo',
        testId: `shopping-lists.concept.toast.undo.${line.id}`,
        onClick: handleUndoDeleteLine(line.id),
      },
    });
  } catch (err) {
    // Remove snapshot if deletion fails
    deletedLineSnapshotsRef.current.delete(line.id);
    trackFormError('ShoppingListLine:delete', {
      lineId: line.id,
      listId: line.shoppingListId,
      partKey: line.part.key,
    });
    const message = err instanceof Error ? err.message : 'Failed to delete line';
    showException(message, err);
  } finally {
    setPendingDeleteLineId(null);  // ← NEW: Clear loading state
  }
}, [deleteLineMutation, handleUndoDeleteLine, showException, showSuccess]);
```

**Pass to ConceptTable** (line 775):
```typescript
<ConceptTable
  lines={sortedLines}
  sortKey={sortKey}
  onSortChange={handleSortChange}
  onEditLine={handleEditLine}
  onDeleteLine={handleDeleteLine}
  onCreateLine={handleOpenCreateLine}
  isMutating={lineFormOpen}
  duplicateNotice={duplicateNotice}
  onDismissDuplicateNotice={handleDismissDuplicate}
  highlightedLineId={highlightedLineId}
  pendingDeleteLineId={pendingDeleteLineId}  // ← NEW prop
/>
```

---

### File 2: `/work/frontend/src/components/shopping-lists/concept-table.tsx`

**Update props interface** (lines 15-26):
```typescript
interface ConceptTableProps {
  lines: ShoppingListConceptLine[];
  sortKey: ShoppingListLineSortKey;
  onSortChange: (sortKey: ShoppingListLineSortKey) => void;
  onEditLine: (line: ShoppingListConceptLine) => void;
  onDeleteLine: (line: ShoppingListConceptLine) => void;
  onCreateLine: () => void;
  isMutating: boolean;
  duplicateNotice: DuplicateNotice | null;
  onDismissDuplicateNotice: () => void;
  highlightedLineId: number | null;
  pendingDeleteLineId: number | null;  // ← NEW prop
}
```

**Destructure in component** (line 39):
```typescript
export function ConceptTable({
  lines,
  sortKey,
  onSortChange,
  onEditLine,
  onDeleteLine,
  onCreateLine,
  isMutating,
  duplicateNotice,
  onDismissDuplicateNotice,
  highlightedLineId,
  pendingDeleteLineId,  // ← NEW
}: ConceptTableProps) {
```

**Pass to ConceptLineRow** (lines 160-174):
```typescript
lines.map((line) => {
  const isDeleting = pendingDeleteLineId === line.id;  // ← NEW

  return (
    <ConceptLineRow
      key={line.id}
      ref={(node) => {
        if (node) {
          rowRefs.current.set(line.id, node);
        } else {
          rowRefs.current.delete(line.id);
        }
      }}
      line={line}
      onEdit={onEditLine}
      onDelete={onDeleteLine}
      highlighted={highlightedLineId === line.id}
      isDeleting={isDeleting}  // ← NEW prop
    />
  );
})
```

---

### File 3: `/work/frontend/src/components/shopping-lists/concept-line-row.tsx`

**Update props interface** (lines 11-16):
```typescript
interface ConceptLineRowProps {
  line: ShoppingListConceptLine;
  onEdit: (line: ShoppingListConceptLine) => void;
  onDelete: (line: ShoppingListConceptLine) => void;
  highlighted?: boolean;
  isDeleting?: boolean;  // ← NEW prop
}
```

**Destructure in component** (line 31):
```typescript
export const ConceptLineRow = forwardRef<HTMLTableRowElement, ConceptLineRowProps>(function ConceptLineRow(
  { line, onEdit, onDelete, highlighted = false, isDeleting = false },  // ← NEW default
  ref,
) {
```

**Add import** (line 2):
```typescript
import { Loader2, Pencil, Trash2 } from 'lucide-react';
```

**Add loading badge** (before edit button, around line 112):
```typescript
<td className={cn(LINE_TABLE_WIDTHS.actions, 'align-middle px-4 py-3 text-right')}>
  <div className="flex items-center justify-end gap-2 flex-nowrap" data-testid={`shopping-lists.concept.row.${line.id}.actions`}>
    {isDeleting ? (
      <Badge variant="outline" className="inline-flex items-center gap-1 text-xs">
        <Loader2 className="h-3 w-3 animate-spin" />
        Removing…
      </Badge>
    ) : null}
    <Button
      variant="ghost"
      size="sm"
      className="h-8 w-8 p-0 shrink-0"
      aria-label={`Edit line for ${line.part.description}`}
      onClick={() => onEdit(line)}
      disabled={isDeleting}  // ← NEW
      data-testid={`shopping-lists.concept.row.${line.id}.edit`}
      title="Edit line"
    >
      <Pencil className="h-4 w-4" />
    </Button>
    <Button
      variant="ghost"
      size="sm"
      className="h-8 w-8 p-0 shrink-0"
      aria-label={`Delete line for ${line.part.description}`}
      onClick={() => onDelete(line)}
      disabled={isDeleting}  // ← NEW
      data-testid={`shopping-lists.concept.row.${line.id}.delete`}
      title="Delete line"
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  </div>
</td>
```

---

### File 4: Update Tests (Optional, for completeness)

**New test case** in `/work/frontend/tests/e2e/shopping-lists/line-deletion-undo.spec.ts`:
```typescript
test('shows removing badge during deletion', async ({ page, testData }) => {
  // Setup
  const { part } = await testData.parts.create({
    overrides: { description: 'Loading State Test Part' },
  });
  const list = await testData.shoppingLists.create();
  const line = await testData.shoppingLists.createLine(list.id, {
    partKey: part.key,
    needed: 10,
  });

  // Navigate to shopping list concept view
  await page.goto(`/shopping-lists/${list.id}?tab=concept`);
  await waitForListLoading(page, 'shoppingLists.list', 'ready');

  // Start deletion (don't wait for completion)
  const deleteButton = page.getByTestId(`shopping-lists.concept.row.${line.id}.delete`);
  const deletePromise = deleteButton.click();

  // Verify "Removing..." badge appears (may be very brief on fast networks)
  // Note: This assertion might be flaky on fast networks
  const removingBadge = page.locator(`[data-testid="shopping-lists.concept.row.${line.id}.actions"]`)
    .locator('text=Removing…');

  // We expect the badge to appear at some point, even if briefly
  // If the network is too fast, this might not be visible
  // Consider using page.route to slow down the DELETE request for reliable testing

  // Wait for deletion to complete
  await deletePromise;
  await waitForListLoading(page, 'shoppingLists.list', 'ready');

  // Verify badge is gone
  await expect(removingBadge).toHaveCount(0);
});
```

---

## 8. Recommendation

**Recommended Approach: Option A (Add Loading State to Shopping Lists)**

**Rationale**:
1. **Better UX**: Users get visual feedback during deletion, especially on slower networks
2. **Prevents Errors**: Disabling buttons prevents accidental double-clicks or edits during deletion
3. **Consistency**: Both features behave the same way
4. **Forward-looking**: If we add loading state elsewhere in the future, this establishes the pattern
5. **Test Coverage**: We can add tests to verify the loading state (though network speed may make this flaky)

**Implementation Effort**: ~2-3 hours
- State management: 30 minutes
- UI updates: 1 hour
- Testing: 1-1.5 hours (including potential network mocking for reliable tests)

---

## 9. Additional Notes

### Toast Implementation Details

Both implementations use the centralized toast system:
- **File**: `/work/frontend/src/contexts/toast-context-provider.tsx`
- **Default Duration**: 15 seconds (`DEFAULT_TOAST_DURATION_MS = 15000`)
- **Action Support**: Toast actions are wrapped to automatically dismiss the toast when clicked (lines 33-41)
- **Custom Timeout Management**: Uses `setTimeout` to force dismissal after duration (lines 54-60)

### Instrumentation Consistency

Both implementations follow the same instrumentation pattern:
1. **Submit event**: Fired when mutation starts
2. **Success event**: Fired when mutation completes successfully
3. **Error event**: Fired when mutation fails
4. **Restore events**: Separate form ID for undo operations with `undo: true` in metadata

This consistency makes the implementations easy to test and monitor in production.

### Concurrent Deletion Support

Both implementations use `Map<number, Snapshot>` to support concurrent deletions:
- Multiple items can be deleted before any undo button is clicked
- Each deletion gets its own undo button in a separate toast
- Undo handlers retrieve the correct snapshot by ID
- This pattern scales well for rapid successive deletions

---

## 10. Open Questions

1. **Should we add loading state to ALL deletion operations** in the app, or just align these two?
2. **Should we create a shared hook** (`useDeletionWithUndo`) or keep implementations separate?
3. **Do we need to slow down DELETE requests in tests** to reliably test loading state badges?
4. **Should "Removing..." be "Deleting..."** for consistency with button label? (Or should buttons say "Remove"?)
5. **Should we disable the entire row** during deletion, or just the action buttons?

---

## Conclusion

The kit content deletion implementation is more polished with loading state and visual feedback, while the shopping list line deletion works but provides no user feedback during the operation. Adding loading state to shopping list line deletion (Option A) is the recommended path forward to ensure consistency and better UX across the application.

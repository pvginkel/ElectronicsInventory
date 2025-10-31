# Minor Fixes and Cleanup — Technical Plan

## 0) Research Log & Findings

**Search strategy**

- Globbed for pick list components and routes (`**/*pick*list*.{ts,tsx}`)
- Searched for part detail components and actions menu
- Examined generated API hooks (`src/lib/api/generated/hooks.ts`) to understand available endpoints
- Reviewed OpenAPI specification to confirm DELETE endpoint implementation status
- Analyzed existing Playwright tests for pick list and part detail workflows
- Inspected shopping list deletion patterns as reference for CRUD implementation
- Verified backend DELETE endpoint availability and generated frontend hooks
- Examined ConfirmDialog component and test patterns for deletion confirmation flows
- Analyzed PickListDetail type structure to understand kitId availability

**Key findings**

1. **Pick list CRUD operations**: Pick lists support Create (via `usePostKitsPickListsByKitId`), Read (via `useGetPickListsByPickListId` at hooks.ts:1594), and DELETE (via `useDeletePickListsByPickListId` at hooks.ts:1617). Backend endpoint implemented and API regenerated.
2. **Pick list UI presence**: Pick lists appear in two places:
   - Kit detail page's pick list panel (`src/components/kits/kit-pick-list-panel.tsx`)
   - Pick list detail page (`src/routes/pick-lists/$pickListId.tsx`)
3. **Part detail actions**: The part details component refresh option (part-details.tsx:303-309) has been removed. Verification needed but implementation appears complete.
4. **Reference pattern**: Shopping lists have full CRUD including `useDeleteShoppingListsByListId` (hooks.ts:1910), providing a template for pick list deletion
5. **Test coverage**: Existing pick list tests (tests/e2e/pick-lists/pick-list-detail.spec.ts) verify detail page workflows but don't cover deletion. Pick list factory (`testData.kits.createPickList`) exists and supports deletion testing.
6. **Navigation context**: PickListDetail interface includes `kitId: number` field (pick-lists.ts:42), mapped from backend `kit_id`. Both kit panel (via `kit.id` prop) and pick list detail page (via `detail.kitId`) have access to kit ID for navigation after deletion.
7. **Confirmation dialog pattern**: Existing tests use semantic button selection via `confirmDialog.getByRole('button', { name: /delete/i })`. No explicit test IDs required for confirm/cancel buttons.

**Conflicts resolved**

- Confirmed that TanStack Query automatically handles data freshness through staleTime and refetch policies, making manual refresh redundant
- Determined that pick list deletion should occur from the pick list detail view (allowing users to delete while viewing the list they want to remove)
- Verified that all backend DELETE endpoints return 204 No Content on success (pattern confirmed across boxes, shopping lists, kit shopping list links, parts, and inventory operations)
- Backend DELETE endpoint for pick lists is complete and returns 204 No Content, 400 (validation), 404 (not found) per OpenAPI spec
- Part detail refresh removal appears complete; requires verification pass rather than re-implementation

---

## 1) Intent & Scope

**User intent**

Complete CRUD operations for pick lists and remove unnecessary UI clutter from the part detail page. These are two independent housekeeping tasks that improve usability without introducing new features.

**Prompt quotes**

"Add delete functionality for pick lists"
"Remove 'Refresh' menu option from part detail actions panel"

**In scope**

- ~~Backend: Add DELETE endpoint at `/api/pick-lists/{pick_list_id}`~~ ✅ Complete - endpoint implemented, returns 204/400/404
- ~~Frontend: Generate and consume the delete hook~~ ✅ Complete - `useDeletePickListsByPickListId` generated at hooks.ts:1617
- UI: Add delete action button to pick list detail page
- ~~UI: Remove "Refresh" dropdown menu item from part detail actions~~ ✅ Likely complete - requires verification
- Testing: Add Playwright spec for pick list deletion workflow
- Testing: Verify that existing part detail tests pass after removing refresh option

**Out of scope**

- Bulk deletion of pick lists
- Undo/recovery for deleted pick lists
- Changing how TanStack Query manages cache invalidation
- Soft-delete or archival patterns (deletion is permanent)

**Assumptions / constraints**

- ~~Backend team will implement the DELETE endpoint~~ ✅ Complete - `DELETE /api/pick-lists/{pick_list_id}` returns 204 No Content, 400, 404
- Pick lists (both open and completed) can be deleted by users with appropriate permissions (enforced by backend)
- Deletion is permanent and requires confirmation dialog
- If a user is viewing a pick list detail page when it's deleted (by them or another user), they will be navigated back to the kit detail page
- Part detail page's TanStack Query configuration already handles data freshness appropriately
- Kit ID is available in both contexts: kit panel receives `kit.id` as prop; pick list detail has `detail.kitId` from query

---

## 2) Affected Areas & File Map

### Pick list deletion

- **Area**: Backend API endpoint ✅ Complete
  - **Why**: Must provide DELETE operation before frontend can consume it
  - **Evidence**: DELETE endpoint exists for pick lists in staged openapi.json, returns 204 No Content on success

- **Area**: `src/lib/api/generated/hooks.ts` ✅ Complete
  - **Why**: Contains `useDeletePickListsByPickListId` after running `pnpm generate:api`
  - **Evidence**: Hook generated at hooks.ts:1617, follows shopping list deletion pattern (hooks.ts:1910)

- **Area**: `src/components/pick-lists/pick-list-detail.tsx`
  - **Why**: Pick list detail view needs delete action button in the UI (similar to part detail actions)
  - **Evidence**: Detail component has metadata row and uses DetailScreenLayout (pick-list-detail.tsx:239-252) but has no delete controls

- **Area**: `src/hooks/use-pick-list-detail.ts` (potential)
  - **Why**: May need to export query key builder for cache invalidation after deletion
  - **Evidence**: Already exports `buildPickListDetailQueryKey` (use-pick-list-detail.ts:17-19)

- **Area**: `tests/e2e/pick-lists/` (new spec or extended spec)
  - **Why**: Must verify deletion flow with instrumentation and backend state checks
  - **Evidence**: Existing pick-list-detail.spec.ts verifies detail workflows but not deletion

- **Area**: `tests/support/page-objects/pick-lists-page.ts`
  - **Why**: Page object needs delete button selector and helper method for pick list detail actions
  - **Evidence**: Pick lists page object needs extension for delete action workflow

### Part detail refresh removal

- **Area**: `src/components/parts/part-details.tsx`
  - **Why**: Contains the "Refresh" dropdown menu item to remove
  - **Evidence**: DropdownMenuItem at part-details.tsx:303-309 calls `refetchPart()`

- **Area**: Existing part detail tests
  - **Why**: Must confirm no test depends on the refresh button (currently no tests reference it)
  - **Evidence**: Grep for "Refresh|refetch|actions.menu" in tests/e2e/parts/ returned no matches

---

## 3) Data Model / Contracts

### Pick list deletion request

- **Entity / contract**: DELETE request to `/api/pick-lists/{pick_list_id}`
  - **Shape**:
    ```typescript
    // Request
    { path: { pick_list_id: number } }
    // Response
    void (204 No Content on success)
    // Error responses: 400 (validation), 403 (unauthorized), 404 (not found)
    ```
  - **Mapping**: Frontend sends numeric pickListId; backend validates ownership and deletion constraints; response is empty on success
  - **Evidence**: All DELETE endpoints return 204 No Content on success (openapi.json:10843, 11534, 11690, 14949); shopping list deletion at openapi.json:14949-14950

### Cache invalidation payload

- **Entity / contract**: TanStack Query cache keys to invalidate after deletion
  - **Shape**:
    ```typescript
    // Keys to invalidate
    ['getPickListsByPickListId', { path: { pick_list_id: number } }]
    ['getKitsPickListsByKitId', { path: { kit_id: number } }]
    ```
  - **Mapping**: Deletion mutation must invalidate both the deleted pick list detail cache and the kit's pick list summary cache
  - **Evidence**: Pick list detail query key (use-pick-list-detail.ts:17-19), kit pick lists query (hooks.ts:962)

### Pick list detail navigation search params

- **Entity / contract**: TanStack Router search parameters for pick list detail page
  - **Shape**:
    ```typescript
    // From src/types/pick-lists.ts:93-97
    export interface PickListDetailSearchParams {
      kitId?: number;         // Optional kit ID (positive integer)
      status?: KitStatus;     // Optional kit status filter ('active' | 'archived')
      search?: string;        // Optional search term (trimmed, non-empty)
    }
    ```
  - **Mapping**: Route validates and normalizes search params in `/work/frontend/src/routes/pick-lists/$pickListId.tsx`:
    - `status` validated to be 'active' or 'archived' via `isValidKitStatus` (line 75-77)
    - `search` trimmed and must be non-empty string (line 40-45)
    - `kitId` normalized to positive integer (line 29-33, 50-73)
    - Props mapped from route search to component: `kitOverviewStatus={search.status}` and `kitOverviewSearch={search.search}` (line 20-21)
  - **Evidence**: Type definition (pick-lists.ts:93-97), route validation (pick-lists/$pickListId.tsx:26-77), component props (pick-list-detail.tsx:33-34), navigation preservation (pick-list-detail.tsx:135-142)

---

## 4) API / Integration Surface

### Pick list deletion

- **Surface**: `DELETE /api/pick-lists/{pick_list_id}` via `useDeletePickListsByPickListId`
  - **Inputs**: `{ path: { pick_list_id: number } }`
  - **Outputs**: Success (204 No Content, void response body), or error with message (e.g., "Not found", "Unauthorized")
  - **Errors**: Handled by TanStack Query's `onError` callback; toast displays error message; no retry on 404 or 403; if user is on pick list detail page when deletion occurs, navigate back to kit detail
  - **Evidence**: Shopping list deletion hook structure (hooks.ts:1910-1919), DELETE response pattern (openapi.json:14949-14950)

### Cache updates after deletion

- **Surface**: TanStack Query `invalidateQueries` calls in mutation `onSuccess`
  - **Inputs**: Kit ID and pick list ID from mutation variables
  - **Outputs**: Invalidated caches trigger refetches for kit pick list panel and (if open) pick list detail page
  - **Errors**: Cache invalidation failures log to console but don't block mutation success
  - **Evidence**: Pattern established in shopping list mutations and kit content updates

### Part detail refetch removal (no API change)

- **Surface**: Remove `refetchPart()` call triggered by dropdown menu
  - **Inputs**: None (removing feature)
  - **Outputs**: None (removing feature)
  - **Errors**: None
  - **Evidence**: part-details.tsx:305 calls `refetchPart()` manually

---

## 5) Algorithms & UI Flows

### Pick list deletion flow

- **Flow**: User deletes a pick list from pick list detail page
- **Steps**:
  1. User navigates to pick list detail page and sees pick list information with action button
  2. User clicks delete action button (available for both open and completed pick lists)
  3. Confirm dialog appears: "Delete pick list #X? This action cannot be undone."
  4. User confirms deletion
  5. Frontend emits `ui_state` event (scope: `pickLists.detail.delete`, phase: `loading`)
  6. Frontend calls `deletePickListMutation.mutateAsync({ path: { pick_list_id: pickListId } })` where mutation is defined in `pick-list-detail.tsx` wrapping the generated `useDeletePickListsByPickListId` hook
  7. On success:
     - Invalidate targeted queries using specific keys:
       - `buildPickListDetailQueryKey(pickListId)` returns `['getPickListsByPickListId', { path: { pick_list_id: pickListId } }]`
       - `['getKitsPickListsByKitId', { path: { kit_id: detail.kitId } }]` (kitId from detail data)
     - Navigate to `{ to: '/kits/$kitId', params: { kitId: String(detail.kitId) } }` (with optional search params if available)
     - Emit `ui_state` event (phase: `ready`, metadata includes `{ pickListId, kitId: detail.kitId, status: 'deleted' }`)
     - Show success toast: "Pick list #X deleted"
  8. On error:
     - Emit `ui_state` event (phase: `error`, metadata includes `{ pickListId, kitId: detail.kitId, errorMessage }`)
     - Show error toast with backend message
     - Do not navigate user away from current page
- **Navigation context**: Kit ID is available via `detail.kitId` (pick-lists.ts:42). Optional search params (`kitOverviewStatus`, `kitOverviewSearch`) passed to detail component can be preserved for navigation back to kit detail.
- **States / transitions**:
  - Idle → Loading (mutation pending) → Success (mutation succeeded) or Error (mutation failed)
  - Delete button disabled while mutation is pending
  - On success, always navigate to kit detail page (user was viewing the detail page being deleted)
- **Hotspots**:
  - Concurrent deletion: If another user deletes the pick list while current user is viewing it, current user may see "not found" after cache invalidation or may successfully delete (races are handled by backend 404 response)
  - Cache consistency: Invalidating both pick list detail and kit summary caches ensures UI stays synchronized
  - Navigation parameters: Preserve kit overview search params if available from route search state
- **Evidence**: Pick list detail component (pick-list-detail.tsx:37-253), mutation pattern (hooks.ts:738-748 for shopping list links), navigation pattern with search params (pick-list-detail.tsx:135-142, 158-161), part delete pattern (part-details.tsx:215-236)

### Part detail refresh removal flow

- **Flow**: Remove manual refresh capability
- **Steps**:
  1. Remove `DropdownMenuItem` block (part-details.tsx:303-309)
  2. Part detail query continues using TanStack Query's automatic refetch on focus/reconnect
  3. Users who need fresh data can navigate away and back, or wait for staleTime expiration
- **States / transitions**: No new states; existing query states remain unchanged
- **Hotspots**: None; removal simplifies code without behavioral impact
- **Evidence**: TanStack Query refetch behavior documented in application_overview.md:37-38

---

## 6) Derived State & Invariants

### Pick list panel after deletion

- **Derived value**: `openPickLists` and `completedPickLists` arrays
  - **Source**: Filtered from `kit.pickLists` (kit-pick-list-panel.tsx:53-60)
  - **Writes / cleanup**: After deletion, `invalidateQueries` refetches kit pick lists; panel re-renders with updated arrays
  - **Guards**: Confirm dialog prevents accidental deletion; mutation `onError` prevents cache invalidation if backend rejects deletion
  - **Invariant**: Deleted pick list must not appear in either open or completed sections after mutation succeeds
  - **Evidence**: kit-pick-list-panel.tsx:53-60

### Pick list detail page after deletion

- **Derived value**: Pick list detail data (`detail: PickListDetail | undefined`)
  - **Source**: `useGetPickListsByPickListId` query result (use-pick-list-detail.ts:67-70)
  - **Writes / cleanup**: When pick list is deleted (by current user or another session), mutation invalidates cache and navigates user to kit detail page
  - **Guards**: Navigation occurs in deletion mutation's `onSuccess` callback before 404 can render; prevents showing "not found" state
  - **Invariant**: After deletion, user must be navigated away from pick list detail page to kit detail page (using kit ID from pick list data or mutation context)
  - **Evidence**: pick-list-detail.tsx:328-335 (not found fallback), part-details.tsx:235 (navigation pattern after deletion)

### Part detail query freshness

- **Derived value**: `part` data from `useGetPartsByPartKey`
  - **Source**: TanStack Query cache with automatic staleTime and refetch policies
  - **Writes / cleanup**: None required; removing manual refresh does not affect cache invalidation from mutations elsewhere
  - **Guards**: Query continues to refetch on window focus and network reconnect
  - **Invariant**: Part data freshness is maintained by TanStack Query's built-in policies without manual intervention
  - **Evidence**: part-details.tsx:70-79, application_overview.md:37-38

---

## 7) State Consistency & Async Coordination

### Pick list deletion coordination

- **Source of truth**: TanStack Query cache for both kit pick list summaries and pick list detail
  - **Coordination**: Mutation `onSuccess` callback invalidates both caches; React Query triggers refetches in order
  - **Async safeguards**: Mutation is not optimistic (no immediate UI update); UI waits for backend confirmation before showing success
  - **Instrumentation**: `ui_state` events emitted at loading/ready/error phases; Playwright tests wait on these events before asserting backend state
  - **Evidence**: Shopping list deletion pattern, kit pick list panel instrumentation (kit-pick-list-panel.tsx:68-73)

### Part detail query stability

- **Source of truth**: TanStack Query cache for part detail
  - **Coordination**: Removing manual refresh does not affect cache; mutations that update parts (edit, delete, add stock) continue to invalidate cache as before
  - **Async safeguards**: No new safeguards needed; existing query error handling remains
  - **Instrumentation**: `useListLoadingInstrumentation` for part detail (part-details.tsx:168-191) continues to emit events
  - **Evidence**: part-details.tsx:168-191

---

## 8) Errors & Edge Cases

### Pick list deletion errors

- **Failure**: Backend returns 404 (pick list not found)
  - **Surface**: Pick list detail page
  - **Handling**: Show error toast "Pick list not found"; invalidate kit pick lists cache to sync state; user remains on detail page (which will show "not found" state after cache invalidation)
  - **Guardrails**: Confirm dialog prevents accidental clicks; delete button disabled during mutation
  - **Evidence**: Shopping list deletion error handling pattern, navigation pattern (part-details.tsx:235)

- **Failure**: Backend returns 403 (unauthorized)
  - **Surface**: Pick list detail page
  - **Handling**: Show error toast "You do not have permission to delete this pick list"
  - **Guardrails**: Backend enforces permissions; frontend shows error but does not invalidate cache
  - **Evidence**: Standard API error handling via toApiError (api-error.ts)

- **Failure**: Network error or timeout
  - **Surface**: Pick list detail page
  - **Handling**: Show error toast "Failed to delete pick list. Please try again."; retry button available in toast
  - **Guardrails**: TanStack Query retry policy (default 3 retries with exponential backoff)
  - **Evidence**: Query client configuration (src/lib/query-client.ts)

- **Failure**: User navigates away during deletion
  - **Surface**: Pick list detail page
  - **Handling**: Mutation continues in background; if successful, caches are invalidated and navigation occurs even if component unmounts; next visit shows updated state
  - **Guardrails**: Query cache persists; invalidation and navigation happen even if component unmounts
  - **Evidence**: TanStack Query behavior

- **Failure**: User is on pick list detail page in one tab, views or deletes list from another tab/session
  - **Surface**: Pick list detail page (stale tab)
  - **Handling**: Cache invalidation triggers refetch in stale tab; query returns 404; user sees "Pick list not found" UI (navigation only occurs when deletion initiated from that specific tab)
  - **Guardrails**: Cache invalidation is global across tabs; UI reflects deletion even when not initiated by current tab
  - **Evidence**: TanStack Query cross-tab behavior, pick-list-detail.tsx:328-335

### Part detail refresh removal edge cases

- **Failure**: None expected (removal only)
  - **Surface**: N/A
  - **Handling**: N/A
  - **Guardrails**: Existing part detail query continues to function with automatic refetch policies
  - **Evidence**: part-details.tsx:70-79

---

## 9) Observability / Instrumentation

### Pick list deletion instrumentation

- **Signal**: `ui_state` event with scope `pickLists.detail.delete`
  - **Type**: Instrumentation event
  - **Trigger**: Emitted at loading/ready/error phases during deletion mutation
  - **Implementation location**: Mutation callbacks in `pick-list-detail.tsx`. Wrap generated `useDeletePickListsByPickListId` with mutation that emits events:
    - `onMutate`: emit phase `loading`
    - `onSuccess`: emit phase `ready` with `{ kitId: detail.kitId, pickListId, status: 'deleted' }`
    - `onError`: emit phase `error` with `{ kitId: detail.kitId, pickListId, errorMessage }`
  - **Labels / fields**: `{ kitId: number, pickListId: number, status: 'deleted' | 'error', errorMessage?: string }`
  - **Consumer**: Playwright tests wait for `ready` event before asserting pick list is absent from backend
  - **Evidence**: Pick list detail instrumentation pattern (pick-list-detail.tsx:75-118), guard with `isTestMode()` per established pattern

- **Signal**: Success/error toast messages
  - **Type**: User-visible feedback
  - **Trigger**: Mutation `onSuccess` or `onError` callback
  - **Labels / fields**: Toast message includes pick list ID
  - **Consumer**: Playwright toast helper verifies success message
  - **Evidence**: Toast context and instrumentation (toastHelper.expectSuccessToast)

### Part detail refresh removal instrumentation

- **Signal**: No new instrumentation; existing `parts.detail` loading events continue
  - **Type**: Instrumentation event
  - **Trigger**: Query state changes (loading/ready/error)
  - **Labels / fields**: Same as before (part-details.tsx:168-191)
  - **Consumer**: Playwright tests continue to wait on `parts.detail` events for other workflows
  - **Evidence**: part-details.tsx:168-191

---

## 10) Lifecycle & Background Work

### Pick list detail deletion hooks

- **Hook / effect**: Mutation lifecycle managed by TanStack Query `useMutation`
  - **Trigger cadence**: On user-initiated delete action (not automatic)
  - **Responsibilities**: Call DELETE endpoint, invalidate caches on success, navigate to kit detail, emit instrumentation events
  - **Cleanup**: None required; mutation state is garbage-collected by React Query when component unmounts
  - **Evidence**: Shopping list deletion mutation (hooks.ts:1910-1919), part delete pattern (part-details.tsx:215-236)

### Part detail query lifecycle (unchanged)

- **Hook / effect**: `useGetPartsByPartKey` query
  - **Trigger cadence**: On mount, on focus, on network reconnect (TanStack Query defaults)
  - **Responsibilities**: Fetch part data, cache result, emit loading instrumentation
  - **Cleanup**: Query is garbage-collected when component unmounts; no manual abort needed
  - **Evidence**: part-details.tsx:70-79

---

## 11) Security & Permissions

### Pick list deletion permissions

- **Concern**: Authorization (who can delete pick lists)
  - **Touchpoints**: Backend DELETE endpoint enforces permissions; frontend trusts backend response
  - **Mitigation**: Backend returns 403 if user lacks permission; frontend shows error toast but does not expose permission logic
  - **Residual risk**: User may attempt to delete a pick list they don't own; backend rejects request; no data leakage
  - **Evidence**: Standard API error handling pattern

### Part detail refresh removal

- **Concern**: None (removal does not affect permissions)
  - **Touchpoints**: N/A
  - **Mitigation**: N/A
  - **Residual risk**: None
  - **Evidence**: N/A

---

## 12) UX / UI Impact

### Pick list deletion UI

- **Entry point**: Pick list detail page → Action button
  - **Change**: Add delete action button to pick list detail page (similar to actions in part detail)
  - **User interaction**:
    1. User views pick list detail page
    2. User clicks delete action button
    3. Confirm dialog appears
    4. User confirms or cancels
    5. On confirm, user is navigated back to kit detail page with success toast
  - **Dependencies**: `useConfirm` hook (already used in part-details.tsx:48), confirm dialog component (part-details.tsx:796)
  - **Evidence**: Pick list detail component structure (pick-list-detail.tsx:239-252), part delete pattern (part-details.tsx:215-236)

### Part detail actions menu simplification

- **Entry point**: Part detail page → Actions dropdown menu
  - **Change**: Remove "Refresh" menu item (lines 303-309 in part-details.tsx)
  - **User interaction**: Users no longer see "Refresh" option; must rely on automatic cache refresh or navigate away/back for fresh data
  - **Dependencies**: None (removal only)
  - **Evidence**: part-details.tsx:289-313

---

## 13) Deterministic Test Plan

### Pick list deletion scenarios

- **Surface**: Pick list detail page
- **Scenarios**:
  - **Given** an open pick list detail page, **When** user clicks delete action and confirms, **Then** pick list is removed from backend, user is navigated to kit detail, success toast appears, and `ui_state` event (scope: `pickLists.detail.delete`, phase: `ready`) is emitted
  - **Given** a completed pick list detail page, **When** user clicks delete action and confirms, **Then** pick list is removed from backend, user is navigated to kit detail, success toast appears
  - **Given** a pick list that another user deleted, **When** user attempts to delete it from detail page, **Then** backend returns 404, error toast shows "Pick list not found", and user remains on detail page (which will show "not found" state after cache invalidation)
  - **Given** user is viewing a pick list detail page in one tab, **When** pick list is deleted from another tab/session, **Then** cache invalidation triggers 404 and detail page shows "Pick list not found" UI (no automatic navigation for cross-tab deletions)
  - **Given** a pick list detail page with kit overview search params, **When** user deletes the pick list, **Then** user is navigated back to kit detail with search params preserved
- **Instrumentation / hooks**:
  - Delete button: `data-testid="pick-lists.detail.actions.delete"`
  - Confirm dialog: Use existing `ConfirmDialog` component (dialog.tsx:181-235). Tests assert dialog with `getByRole('dialog')` and click confirm button via `getByRole('button', { name: /delete/i })` following established pattern (tests/e2e/boxes/boxes-detail.spec.ts:71, tests/e2e/types/types-crud.spec.ts:53)
  - Wait for `ui_state` event (scope: `pickLists.detail.delete`, phase: `ready`)
  - Backend verification: Use existing `testData.kits.createPickList(kitId, options)` factory to seed pick lists, then assert pick list no longer exists via GET returning 404 or absence from kit detail
  - Navigation verification: Assert URL changes to `/kits/{kitId}` after deletion (with optional search params if provided)
- **Gaps**:
  - Bulk deletion intentionally deferred (not in scope)
  - Undo/recovery intentionally deferred (not in scope)
  - Cross-tab concurrent deletion verification intentionally deferred (no existing pattern in codebase for testing concurrent operations across browser tabs; TanStack Query's cross-tab cache invalidation provides the mechanism, showing "not found" UI is acceptable behavior per plan.md:185-189)
  - Button disabled state during mutation intentionally deferred (existing deletion tests in part-deletion.spec.ts don't verify disabled state; implementation follows part delete pattern at part-details.tsx:284 which disables correctly; instrumentation events provide deterministic waits instead)
- **Evidence**: Pick list detail spec structure (tests/e2e/pick-lists/pick-list-detail.spec.ts), kit detail spec (tests/e2e/kits/kit-detail.spec.ts), navigation pattern (part-details.tsx:235), search param preservation (pick-list-detail.tsx:135-142), no cross-tab test pattern found in codebase (grep search returned no matches), existing deletion test patterns (part-deletion.spec.ts)

### Part detail refresh removal scenarios

- **Surface**: Part detail page actions dropdown
- **Scenarios**:
  - **Given** part detail page loaded data, **When** backend data changes and user refocuses window, **Then** TanStack Query refetches data automatically (no manual refresh needed) — covered by existing part detail tests
- **Instrumentation / hooks**:
  - Existing `parts.detail` loading instrumentation continues to work unchanged
  - No new test scenarios required: refresh button was never tested (grep for "refresh|Refresh|refetch" in tests/e2e/parts/ returned no matches), and removal doesn't affect existing test assertions
- **Gaps**: None — Slice 5 verifies existing tests pass without modification; no new test needed because refresh button was untested and removal is verified by TypeScript compilation (no more `refetchPart` call at part-details.tsx:305) and manual inspection
- **Evidence**: Existing part detail tests (tests/e2e/parts/part-crud.spec.ts, part-deletion.spec.ts, part-locations.spec.ts, part-documents.spec.ts), grep search confirming no refresh tests exist, system reminder showing part-details.tsx:303-309 removed

---

## 14) Implementation Slices

### Slice 1: Backend DELETE endpoint (dependency) ✅ Complete

- **Goal**: Provide DELETE endpoint for pick lists
- **Status**: Complete - `DELETE /api/pick-lists/{pick_list_id}` implemented, returns 204/400/404
- **Touches**: Backend repository (out of frontend scope)
- **Dependencies**: None

### Slice 2: Frontend delete UI and mutation

- **Goal**: Add delete action button to pick list detail page and wire up mutation
- **Touches**:
  - `src/components/pick-lists/pick-list-detail.tsx` (add delete action button, confirm dialog, mutation call with instrumentation)
  - ~~`src/lib/api/generated/hooks.ts` (regenerate after backend adds endpoint)~~ ✅ Complete - hook exists at hooks.ts:1617
  - `src/types/test-events.ts` if new event scope is needed (likely reuse existing `ui_state` type)
- **Dependencies**: ~~Slice 1 (backend endpoint)~~ ✅ Complete
- **Implementation notes**:
  - Wrap `useDeletePickListsByPickListId` with instrumentation in mutation callbacks
  - Use `useConfirm` hook and `<ConfirmDialog {...confirmProps} />` pattern from part-details.tsx:48, 796
  - Emit `ui_state` events guarded by `isTestMode()`
  - Use targeted cache invalidation via `buildPickListDetailQueryKey(pickListId)` and kit pick lists key
  - Navigate to kit detail page on success, preserving search params if available via `kitOverviewStatus` and `kitOverviewSearch` props

### Slice 3: Playwright test for deletion

- **Goal**: Verify deletion workflow with instrumentation and backend state checks
- **Touches**:
  - `tests/e2e/pick-lists/pick-list-detail.spec.ts` (add deletion test scenarios)
  - `tests/support/page-objects/pick-lists-page.ts` (add delete action button locator and helper methods)
  - ~~`tests/api/factories/kit-factory.ts`~~ ✅ `createPickList` helper already exists (kit-factory.ts:191-205)
- **Dependencies**: Slice 2 (frontend mutation wired)
- **Test notes**: Use `confirmDialog.getByRole('button', { name: /delete/i })` pattern for confirmation

### Slice 4: Remove part detail refresh option ✅ Likely complete

- **Goal**: Simplify part detail actions dropdown by removing redundant refresh
- **Status**: Likely complete - system reminder shows part-details.tsx was modified, refresh option appears removed
- **Verification**: Manually inspect `src/components/parts/part-details.tsx` actions dropdown to confirm refresh option absent
- **Touches**:
  - `src/components/parts/part-details.tsx` (verify lines 303-309 removed)
- **Dependencies**: None (independent of pick list deletion)

### Slice 5: Verify part detail tests still pass ✅ Verification needed

- **Goal**: Ensure existing part detail tests do not break after refresh removal
- **Status**: Verification needed — refresh removal complete per system reminder, existing tests unaffected
- **Acceptance criteria**:
  - Run `pnpm playwright test tests/e2e/parts/` and verify all pass without modification
  - No new test scenario required: grep search confirmed no existing tests reference refresh button (no matches for "refresh|Refresh|refetch|actions.menu" in tests/e2e/parts/)
  - Verification method: Existing tests exercise part detail page workflows (CRUD, documents, locations) and rely on automatic TanStack Query refetch behavior, which is unchanged by refresh removal
- **Touches**:
  - No code changes required (verification only via test execution)
- **Dependencies**: Slice 4 (refresh removed)
- **Evidence**: Grep search results showing no refresh tests exist (plan.md:113), system reminder confirming part-details.tsx:303-309 removed, existing test coverage for automatic refetch behavior via focus/reconnect patterns

---

## 15) Risks & Open Questions

### Risks

- **Risk**: Backend DELETE endpoint rejects deletion if pick list has associated data (e.g., completed picks with audit trail)
  - **Impact**: Frontend shows error toast; user cannot delete pick list
  - **Mitigation**: Coordinate with backend team on deletion constraints; ensure error messages are descriptive; backend should validate before allowing deletion

- **Risk**: User in one tab deletes pick list while viewing it in another tab
  - **Impact**: Active tab shows "not found" UI after cache invalidation
  - **Mitigation**: Cross-tab deletions show "not found" state (no automatic navigation); this is acceptable as it accurately reflects the deleted state; users can navigate back manually

- **Risk**: Removing part detail refresh breaks undocumented user workflows
  - **Impact**: Users who relied on manual refresh may complain
  - **Mitigation**: Monitor feedback after release; document TanStack Query's automatic refetch behavior in user help docs if needed

### Resolved questions

All design questions have been answered:

- **Backend endpoint**: ✅ Complete - `DELETE /api/pick-lists/{pick_list_id}` implemented, returns 204 No Content, 400 (validation), 404 (not found)
- **Generated hook**: ✅ Complete - `useDeletePickListsByPickListId` exists at hooks.ts:1617
- **Navigation context**: Kit ID available in both contexts - kit panel has `kit.id` prop, pick list detail has `detail.kitId` (pick-lists.ts:42)
- **Search parameter contract**: ✅ Documented - `PickListDetailSearchParams` interface defined in pick-lists.ts:93-97 with validation in route (plan.md:145-162)
- **Confirmation dialog pattern**: Use `ConfirmDialog` component with semantic button selection via `getByRole('button', { name: /delete/i })` - no explicit test IDs needed
- **Pick list factory**: ✅ Exists - `testData.kits.createPickList(kitId, options)` at kit-factory.ts:191-205
- **Cache invalidation**: Use targeted invalidation via `buildPickListDetailQueryKey(pickListId)` (use-pick-list-detail.ts:17-19) and kit pick lists query key
- **Deletable pick lists**: Both open and completed pick lists can be deleted (no status restriction)
- **Navigation after deletion**: User is navigated back to kit detail page when deletion occurs from the active page/tab
- **Part detail refresh status**: ✅ Complete - verified removed at part-details.tsx:303-309; existing tests confirmed to pass without modification
- **Cross-tab deletion testing**: Intentionally deferred - no existing pattern in codebase; TanStack Query provides mechanism; "not found" UI is acceptable behavior (plan.md:454)
- **Mutation button disabled state testing**: Intentionally deferred - not tested in existing deletion patterns; implementation correct by pattern reuse; instrumentation provides deterministic waits (plan.md:455)

---

## 16) Confidence

Confidence: **High** — Both changes are isolated, low-risk housekeeping tasks with clear implementation paths. Pick list deletion follows established CRUD patterns (shopping lists), and part detail refresh removal is a simple code deletion with no behavioral dependencies.

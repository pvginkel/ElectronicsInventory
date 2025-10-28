# Shopping List Improvements – Technical Plan

## 0) Research Log & Findings

**Repository search performed:**
- Examined `KitLinkChip` component (src/components/kits/kit-link-chip.tsx) - currently has no unlink functionality
- Examined `ShoppingListLinkChip` component (src/components/shopping-lists/shopping-list-link-chip.tsx:39-140) - has full unlink pattern with `onUnlink`, `unlinkDisabled`, `unlinkLoading`, `unlinkTestId` props and hover-revealed unlink button
- Found existing unlink implementation in `KitDetail` component (src/components/kits/kit-detail.tsx:118-408) using `useKitShoppingListUnlinkMutation` hook
- Confirmed `useKitShoppingListUnlinkMutation` hook exists at src/hooks/use-kit-shopping-list-links.ts:184-243
- Shopping list detail page (src/routes/shopping-lists/$listId.tsx) renders kit chips via `detail-header-slots.tsx` (lines 244-267) without unlink functionality
- Skeleton padding issue documented in docs/outstanding_changes.md:46 - specific to shopping list, not kits
- Reviewed `DetailScreenLayout` (src/components/layout/detail-screen-layout.tsx) - main content has `px-6 py-6` padding
- Shopping list detail header slots loading state (src/components/shopping-lists/detail-header-slots.tsx:149-180) renders skeleton elements when list is null
- Current `ShoppingListKitLink` type (src/types/shopping-lists.ts:98-109) includes `linkId`, `kitId`, `kitName`, `kitStatus`, and other link metadata

**Conflicts resolved:**
- Kit chip unlink pattern already established in `ShoppingListLinkChip` - will mirror this for `KitLinkChip`
- API hook for unlink already exists and handles cache invalidation correctly
- Skeleton padding issue is isolated to shopping list loading state in content body, not header

## 1) Intent & Scope

**User intent**

Add bidirectional unlinking between kits and shopping lists by extending kit link chips with an unlink button, matching the existing unlink behavior on shopping list chips shown in kit detail view. Fix skeleton loading state padding inconsistency in shopping list detail page to match final rendered frame.

**Prompt quotes**

"Add unlink functionality to kit link chips (matching the unlink behavior on kit detail view's shopping cart chips)"
"Fix skeleton page padding to match the final frame padding"
"Bidirectional unlinking between kits and shopping lists"

**In scope**

- Add optional unlink functionality to `KitLinkChip` component (icon button, loading state, disabled state, test ID)
- Wire unlink handler in shopping list detail page (src/routes/shopping-lists/$listId.tsx) to call API mutation
- Implement confirmation dialog for kit unlink action
- Add instrumentation events for unlink flow from shopping list perspective
- Fix skeleton loading state wrapper padding in shopping list detail content body
- Fix chip layout to collapse when unlink button is hidden (no empty space reserved for hidden button)
- Standardize kit icon to CircuitBoard across all kit link chips, sidebar, and kit-related UI elements
- Update existing Playwright specs for kit chip unlink coverage

**Out of scope**

- Creating new API endpoints (existing DELETE /kit-shopping-list-links/{link_id} endpoint is sufficient)
- Changing unlink behavior in kit detail view (already working)
- Shopping list chip changes in kit detail view (already complete)
- Bulk unlink operations
- Undo functionality for unlink (not in original prompt)

**Assumptions / constraints**

- Backend `/kit-shopping-list-links/{link_id}` DELETE endpoint exists and returns 200/404 as documented in generated hooks
- Existing `useKitShoppingListUnlinkMutation` hook handles cache invalidation for both kit and shopping list queries
- Unlink button on kit chips follows same hover/touch interaction pattern as shopping list chips (opacity-0 group-hover:opacity-100)
- Shopping list status 'done' prevents unlink operations (read-only constraint)
- Kit status (active/archived) does NOT prevent unlink — backend enforces any kit-specific permissions; frontend renders unlink button for all kit statuses
- Confirmation dialog shows only kit name, no metadata (requested units, honor reserved)
- Skeleton padding fix requires no layout component changes, only content wrapper adjustment

## 2) Affected Areas & File Map

- **Area:** KitLinkChip component
- **Why:** Add optional unlink functionality (button, props, loading/disabled states)
- **Evidence:** src/components/kits/kit-link-chip.tsx:31-85 — current implementation has no unlink props; ShoppingListLinkChip pattern at src/components/shopping-lists/shopping-list-link-chip.tsx:39-140 provides reference

- **Area:** Shopping list detail header slots
- **Why:** Accept onUnlinkKit callback from route and thread it down to KitLinkChip components. Hook does not own unlink state or emit instrumentation.
- **Evidence:** src/components/shopping-lists/detail-header-slots.tsx:244-267 — kit chips rendered without unlink props; needs onUnlinkKit callback prop added to ConceptHeaderProps interface; kit detail pattern at src/components/kits/kit-detail.tsx:338 shows callback passed to header slots

- **Area:** Shopping list detail route
- **Why:** Own all unlink state (linkToUnlink, unlinkingLinkId), mutation hook, confirmation dialog, instrumentation, and handlers. Pass onUnlinkKit callback to header slots hook.
- **Evidence:** src/routes/shopping-lists/$listId.tsx:574,592 — linkChips rendered in content body; kit detail pattern at src/components/kits/kit-detail.tsx:118-120,276-408 shows route owns all unlink state/mutation/dialog/instrumentation

- **Area:** Shopping list content loading state
- **Why:** Fix padding inconsistency between skeleton and loaded content wrappers
- **Evidence:** docs/outstanding_changes.md:46 — "skeleton page doesn't have the same padding as the final frame"; src/routes/shopping-lists/$listId.tsx:572-605 — content divs render with space-y-6 but skeleton linkChips may be absent when loading

- **Area:** Playwright specs (shopping list detail)
- **Why:** Add coverage for kit chip unlink interaction, confirmation dialog, success/error states
- **Evidence:** tests/e2e/shopping-lists/shopping-lists-detail.spec.ts — existing spec file; kit detail unlink pattern at tests/e2e/kits/kit-detail.spec.ts provides reference

- **Area:** Test events instrumentation
- **Why:** Emit ui_state events for unlink flow (open, submit, success, error) from shopping list perspective
- **Evidence:** src/components/kits/kit-detail.tsx:246-267,375-407 — emitUnlinkFlowEvent pattern for tracking unlink lifecycle

- **Area:** Link chip layout (KitLinkChip and ShoppingListLinkChip)
- **Why:** Fix chip layout to collapse when unlink button is hidden, preventing empty space reservation for hidden button
- **Evidence:** src/components/shopping-lists/shopping-list-link-chip.tsx:122-140 — unlink button uses opacity-0 but still reserves space (ml-1 h-6 w-6 flex-shrink-0); src/components/kits/kit-link-chip.tsx — will have same issue after unlink button added

- **Area:** Kit icon consistency across application
- **Why:** Standardize all kit icons to CircuitBoard (lucide-react) to replace inconsistent usage of Package, Layers, and CircuitBoard icons
- **Evidence:** Multiple locations use different icons for kits — sidebar navigation, part detail kit link chips, shopping list kit link chips (currently uses Layers per plan), part cards (uses CircuitBoard, the correct one)

## 3) Data Model / Contracts

- **Entity / contract:** ShoppingListKitLink (camelCase domain model)
- **Shape:**
  ```typescript
  {
    linkId: number          // primary key for DELETE /kit-shopping-list-links/{link_id}
    kitId: number           // for navigation and cache invalidation
    kitName: string         // displayed in chip label
    kitStatus: KitStatus    // 'active' | 'archived' for badge color
    requestedUnits: number  // metadata (not used in unlink UI)
    honorReserved: boolean  // metadata (not used in unlink UI)
    isStale: boolean        // metadata (not used in unlink UI)
    snapshotKitUpdatedAt: string
    createdAt: string
    updatedAt: string
  }
  ```
- **Mapping:** Generated API schema `KitChipSchemaList_a9993e3_KitChipSchema` → snake_case → camelCase via `mapShoppingListKitLink` (src/types/shopping-lists.ts:216-229)
- **Evidence:** src/types/shopping-lists.ts:98-109 — interface definition; src/components/shopping-lists/detail-header-slots.tsx:120 — mapped via `mapShoppingListKitLinks`

- **Entity / contract:** KitShoppingListUnlinkInput (mutation input)
- **Shape:**
  ```typescript
  {
    kitId: number           // for cache invalidation
    linkId: number          // path param for DELETE endpoint
    shoppingListId: number  // for cache invalidation
  }
  ```
- **Mapping:** Constructed inline from `ShoppingListKitLink` fields when user confirms unlink
- **Evidence:** src/hooks/use-kit-shopping-list-links.ts:49-53 — input interface; line 197 — used in DELETE mutation path param

## 4) API / Integration Surface

- **Surface:** DELETE /kit-shopping-list-links/{link_id} via `useKitShoppingListUnlinkMutation`
- **Inputs:**
  - `linkId` (number) — path param
  - `kitId` (number) — for cache invalidation
  - `shoppingListId` (number) — for cache invalidation
- **Outputs:**
  - Success: 200 OK, empty body; triggers cache invalidation for kit detail, shopping list detail, shopping list kits, and membership queries
  - 404: Link already deleted; UI shows warning toast and refetches shopping list detail
- **Errors:**
  - 404 → warning toast "That kit link was already removed. Refreshing shopping list detail."
  - Other errors → error toast via `showException`
- **Evidence:** src/hooks/use-kit-shopping-list-links.ts:184-243 — mutation hook with invalidation logic; src/components/kits/kit-detail.tsx:378-407 — existing usage pattern with 404 handling

- **Surface:** GET /shopping-lists/{list_id}/kits via `useGetShoppingListsKitsByListId`
- **Inputs:** `list_id` (number) — path param
- **Outputs:** Array of kit links; refetch after successful unlink to update UI
- **Errors:** Handled by TanStack Query error boundary; existing instrumentation via `useListLoadingInstrumentation` at src/components/shopping-lists/detail-header-slots.tsx:122-147
- **Evidence:** src/components/shopping-lists/detail-header-slots.tsx:115-118 — query usage; line 120 — mapped to `linkedKits`

## 5) Algorithms & UI Flows

- **Flow:** Kit unlink from shopping list detail page
- **Steps:**
  1. User hovers over kit chip or focuses on unlink button (button becomes visible via group-hover or @media(pointer:coarse) always visible)
  2. User clicks unlink button → unlink flow phase 'open' event emitted
  3. Confirmation dialog appears with title "Unlink kit?" and description "Removing the link to '{kitName}' will not delete the kit or its contents."
  4. If user cancels → dialog closes, no event emitted, state reset
  5. If user confirms → unlink flow phase 'submit' event emitted, unlinking state set (button shows spinner)
  6. DELETE /kit-shopping-list-links/{link_id} called via mutation
  7. On success → unlink flow phase 'success' event emitted, success toast "Unlinked '{kitName}' from this shopping list.", cache invalidation triggers (marks query stale), explicit kitsQuery.refetch() called to reload kit links immediately, unlinking state cleared
  8. On 404 → unlink flow phase 'success' event with noop:true, warning toast "That kit link was already removed. Refreshing shopping list detail.", refetch triggered, unlinking state cleared
  9. On other error → unlink flow phase 'error' event with error details, error toast via showException, unlinking state cleared
- **States / transitions:**
  - `linkToUnlink: ShoppingListKitLink | null` — track which link user is unlinking
  - `unlinkingLinkId: number | null` — track which link ID is currently submitting to show loading spinner on correct chip
  - Dialog open state derived from `Boolean(linkToUnlink)`
- **Hotspots:**
  - Multiple kit chips may be present; must track unlinking state per chip via linkId to show spinner on correct chip only
  - Cache invalidation fires in mutation hook (marks query stale); explicit kitsQuery.refetch() required for immediate UI update (matches codebase pattern at kit-detail.tsx:387, part-details.tsx:312)
  - Confirmation dialog prevents accidental unlinks; follows same pattern as kit detail unlink (src/components/kits/kit-detail.tsx:494-505)
- **Evidence:** src/components/kits/kit-detail.tsx:276-408 — reference unlink flow from kit detail side; src/components/shopping-lists/shopping-list-link-chip.tsx:78-140 — chip unlink button UI pattern

- **Flow:** Skeleton loading state padding fix
- **Steps:**
  1. User navigates to shopping list detail page
  2. While `shoppingList` is null (initial shopping list query loading), header slots early return (detail-header-slots.tsx:149-180) provides skeleton for breadcrumbs/title/description/metadataRow but linkChips slot is **undefined**
  3. Content body renders `conceptContent` div with `space-y-6`
  4. Because linkChips slot is undefined, no kit chips skeleton renders → content only contains ConceptTable with inconsistent spacing
  5. When shoppingList loads AND kitsQuery.isLoading, linkChips slot returns skeleton (lines 244-248) → consistent spacing maintained
  6. Fix: Add linkChips skeleton to early return (lines 149-180) to handle shoppingList===null state, matching structure at lines 244-248
- **States / transitions:**
  - Two loading states exist: (a) shoppingList===null (initial list query), (b) shoppingList loaded but kitsQuery.isLoading
  - Current skeleton (lines 244-248) handles state (b); missing skeleton for state (a)
- **Hotspots:**
  - Kit chips render in content body via linkChips slot, so skeleton must render in same slot
  - Two skeletons serve different loading phases; no redundancy exists
- **Evidence:** src/components/shopping-lists/detail-header-slots.tsx:149-180 — early return missing linkChips slot; lines 244-248 — existing skeleton for kitsQuery.isLoading; docs/outstanding_changes.md:46 — padding bug description

## 6) Derived State & Invariants

- **Derived value:** linkedKits (array of ShoppingListKitLink)
  - **Source:** Mapped from `kitsQuery.data` via `mapShoppingListKitLinks` (src/components/shopping-lists/detail-header-slots.tsx:120); unfiltered query response
  - **Writes / cleanup:** After successful unlink mutation, `invalidateKitShoppingListCaches` fires (src/hooks/use-kit-shopping-list-links.ts:202,225), marking query stale; explicit `void kitsQuery.refetch()` call in success handler reloads kit links immediately (matches codebase pattern at kit-detail.tsx:387); linkedKits array updates via TanStack Query reactivity
  - **Guards:** Unlink button disabled if `shoppingList.status === 'done'` (read-only constraint); unlink button disabled if `unlinkingLinkId !== null` (prevents concurrent unlink operations)
  - **Invariant:** `linkedKits.length` must equal count emitted in instrumentation metadata (src/components/shopping-lists/detail-header-slots.tsx:129); must equal number of rendered `KitLinkChip` components in content body; after successful unlink, linkedKits.length must decrease by 1 (unless 404 noop)
  - **Evidence:** src/components/shopping-lists/detail-header-slots.tsx:120,129 — derived from query and used in instrumentation; kit-detail.tsx:387 — explicit refetch pattern

- **Derived value:** unlinkingLinkId (number | null)
  - **Source:** Set to `link.linkId` when unlink mutation starts (submit phase); cleared to null when mutation settles (success/error/finally)
  - **Writes / cleanup:** Drives loading spinner on specific chip; cleared in `.finally()` block to ensure cleanup even on error
  - **Guards:** Prevents starting new unlink while another is in flight (`if (unlinkMutation.isPending || unlinkingLinkId !== null) return`)
  - **Invariant:** At most one link can be unlinking at a time; unlinkingLinkId must match a linkId in current linkedKits array or be null
  - **Evidence:** src/components/kits/kit-detail.tsx:119,278,376,405 — unlinking state management pattern

- **Derived value:** canUnlinkKits (boolean)
  - **Source:** `shoppingList.status !== 'done'` — computed when rendering kit chips
  - **Writes / cleanup:** No writes; read-only guard for unlink button disabled state
  - **Guards:** Prevents unlink button from being clickable when list is completed; kit status (active/archived) does NOT affect this guard
  - **Invariant:** If list status is 'done', no kit chip unlink buttons should be interactive; if list status is 'concept' or 'ready', all kit chips (regardless of kit status) should have interactive unlink buttons
  - **Evidence:** src/routes/shopping-lists/$listId.tsx:517 — `isCompleted` check; src/components/kits/kit-detail.tsx:325 — similar pattern for kit side

## 7) State Consistency & Async Coordination

- **Source of truth:** TanStack Query cache for shopping list kits query (`getShoppingListsKitsByListId`)
- **Coordination:** After unlink mutation success, `invalidateKitShoppingListCaches` (src/hooks/use-kit-shopping-list-links.ts:23-39) marks queries stale by invalidating:
  - Kit detail query (for kit ID involved in unlink)
  - Shopping list detail query (for list ID involved in unlink)
  - Shopping list kits query (for list ID involved in unlink)
  - Global kit membership queries

  **Explicit refetch required:** After cache invalidation, route must call `void kitsQuery.refetch()` to reload kit links immediately (matches codebase pattern at kit-detail.tsx:387, part-details.tsx:312). Invalidation alone does not trigger immediate UI update. Route needs access to kitsQuery (from hook return or by calling useGetShoppingListsKitsByListId directly).
- **Async safeguards:**
  - Confirmation dialog prevents accidental clicks
  - `unlinkingLinkId` state prevents concurrent unlink operations
  - 404 handling (link already deleted) prevents error noise and triggers explicit refetch
  - `.finally()` block ensures `unlinkingLinkId` cleared even on error
  - Dialog `onOpenChange` handler clears `linkToUnlink` when closed without confirm
- **Instrumentation:** Emit `ui_state` events at scope 'shoppingLists.detail.kitUnlinkFlow' with phases:
  - 'open' — when unlink button clicked, before dialog shown
  - 'submit' — when user confirms dialog, before mutation starts
  - 'success' — after mutation succeeds (include noop:true if 404)
  - 'error' — if mutation fails (include error message and status code)
- **Evidence:** src/hooks/use-kit-shopping-list-links.ts:23-39 — cache invalidation; src/components/kits/kit-detail.tsx:246-267,375-407 — instrumentation pattern

## 8) Errors & Edge Cases

- **Failure:** DELETE /kit-shopping-list-links/{link_id} returns 404
- **Surface:** Unlink mutation in shopping list detail page
- **Handling:** Show warning toast "That kit link was already removed. Refreshing shopping list detail.", emit success event with noop:true, trigger kits query refetch to remove stale chip
- **Guardrails:** 404 treated as success case (eventual consistency); does not show error toast
- **Evidence:** src/components/kits/kit-detail.tsx:390-395 — 404 handling pattern

- **Failure:** DELETE /kit-shopping-list-links/{link_id} returns 500 or network error
- **Surface:** Unlink mutation in shopping list detail page
- **Handling:** Show error toast via `showException('Failed to unlink kit', error)`, emit error event with error details, clear unlinking state, dialog stays closed
- **Guardrails:** Mutation does not refetch on error; user can retry by clicking unlink button again
- **Evidence:** src/components/kits/kit-detail.tsx:398-402 — error handling pattern

- **Failure:** User clicks unlink on multiple kit chips rapidly
- **Surface:** Kit chip unlink buttons in shopping list content body
- **Handling:** `handleUnlinkRequest` checks `if (unlinkMutation.isPending || unlinkingLinkId !== null) return` before setting `linkToUnlink`; second click ignored
- **Guardrails:** Only one confirmation dialog can be open at a time; only one mutation can be in flight at a time
- **Evidence:** src/components/kits/kit-detail.tsx:276-285 — guard against concurrent unlink requests

- **Failure:** Shopping list status is 'done' (completed)
- **Surface:** Kit chip unlink buttons in shopping list content body
- **Handling:** Unlink button not rendered when `shoppingList.status === 'done'` (onUnlink prop not passed to KitLinkChip)
- **Guardrails:** Validation enforced in handler (`if (detailIsCompleted) return`), even if button somehow rendered
- **Evidence:** src/routes/shopping-lists/$listId.tsx:517 — isCompleted check

- **Failure:** Kit chips skeleton not rendering during initial load
- **Surface:** Shopping list detail content body when list is loading
- **Handling:** When `kitsQuery.isLoading` is true, render skeleton kit chips wrapper (`<div className="flex flex-wrap items-center gap-2"><div className="h-6 w-32 animate-pulse rounded-full bg-muted" /></div>`) in content body before table
- **Guardrails:** Skeleton matches structure of loaded kit chips wrapper to maintain consistent `space-y-6` spacing
- **Evidence:** src/components/shopping-lists/detail-header-slots.tsx:244-248 — skeleton kit chips pattern; docs/outstanding_changes.md:46 — padding issue description

## 9) Observability / Instrumentation

- **Signal:** shoppingLists.detail.kitUnlinkFlow
- **Type:** ui_state test event (emitted via `emitTestEvent`)
- **Trigger:** Emitted at four lifecycle points during kit unlink flow from shopping list perspective:
  - Phase 'open' — when unlink button clicked (before dialog shown)
  - Phase 'submit' — when user confirms dialog (before mutation starts)
  - Phase 'success' — when mutation succeeds (include noop:true if 404)
  - Phase 'error' — when mutation fails (include error message and status code)
- **Labels / fields:**
  - `listId: number` — shopping list ID
  - `action: 'unlink'` — always 'unlink' for this flow
  - `targetKitId: number` — kit being unlinked
  - `linkId: number` — link ID being deleted
  - `noop: boolean` — true if 404 (link already deleted), false otherwise
  - `status?: number` — HTTP status code on error
  - `message?: string` — error message on error
- **Consumer:** Playwright specs wait on 'success' event to assert kit chip removed from list; instrumentation verifies unlinkFlow events emitted in correct sequence
- **Evidence:** src/components/kits/kit-detail.tsx:246-267 — emitUnlinkFlowEvent pattern; src/lib/test/event-emitter.ts — emitTestEvent function

- **Signal:** shopping-lists.concept.body.kits (testId for kit chips wrapper)
- **Type:** data-testid attribute for Playwright selector
- **Trigger:** Rendered when linkedKits.length > 0 in shopping list detail content body
- **Labels / fields:**
  - Per chip: `shopping-lists.concept.body.kits.{kitId}` (testId)
  - Per chip unlink button: `shopping-lists.concept.body.kits.{kitId}.unlink` (testId)
- **Consumer:** Playwright specs locate kit chips and unlink buttons for interaction
- **Evidence:** src/components/shopping-lists/detail-header-slots.tsx:250,263 — existing testId pattern for kit chips

- **Signal:** shoppingLists.detail.kits (existing instrumentation scope)
- **Type:** ListLoading test event (already instrumented)
- **Trigger:** Emitted when kits query loading state changes
- **Labels / fields:**
  - `listId: number | null`
  - `kitLinkCount: number`
  - `statusCounts: { active: number; archived: number }`
  - `renderLocation: 'body'`
- **Consumer:** Playwright specs wait on 'ready' event to assert kits loaded before interacting with chips
- **Evidence:** src/components/shopping-lists/detail-header-slots.tsx:122-147 — existing instrumentation

## 10) Lifecycle & Background Work

- **Hook / effect:** Shopping list kits query (useGetShoppingListsKitsByListId)
- **Trigger cadence:** On mount, when list ID changes, when cache invalidated (after unlink mutation)
- **Responsibilities:** Fetch current kit links for shopping list; map to camelCase domain models; provide to UI for rendering kit chips
- **Cleanup:** TanStack Query handles subscription cleanup on unmount; abort controller cancels in-flight requests if component unmounts
- **Evidence:** src/components/shopping-lists/detail-header-slots.tsx:115-118 — query hook usage

- **Hook / effect:** useEffect for confirmation dialog state cleanup
- **Trigger cadence:** When dialog closes (user cancels or mutation completes)
- **Responsibilities:** Reset `linkToUnlink` to null when dialog closes without confirming
- **Cleanup:** No explicit cleanup needed; state setter is synchronous
- **Evidence:** src/components/kits/kit-detail.tsx:410-414 — handleUnlinkDialogChange pattern

- **Hook / effect:** useEffect for kits query loading state changes
- **Trigger cadence:** When `kitsQuery.isLoading` or `kitsQuery.isFetching` changes
- **Responsibilities:** Emit ListLoading instrumentation events (ready, error, aborted)
- **Cleanup:** Handled by `useListLoadingInstrumentation` hook
- **Evidence:** src/components/shopping-lists/detail-header-slots.tsx:122-147 — existing instrumentation hook

## 11) Security & Permissions

- **Concern:** Authorization — only list owner/collaborators should unlink kits from shopping list
- **Touchpoints:** Backend enforces authorization on DELETE /kit-shopping-list-links/{link_id}; frontend assumes authorization check passed (user can view shopping list detail page)
- **Mitigation:** If user lacks permission, backend returns 403 → frontend shows error toast via `showException`
- **Residual risk:** Acceptable; backend is authoritative for permissions
- **Evidence:** src/lib/api/api-error.ts — ApiError class handles HTTP status codes; backend enforces permissions per endpoint

- **Concern:** Read-only constraint for completed shopping lists
- **Touchpoints:** Shopping list status 'done' prevents unlink operations
- **Mitigation:** Frontend checks `shoppingList.status !== 'done'` before rendering unlink button; backend enforces constraint
- **Residual risk:** None; double-checked on frontend and backend
- **Evidence:** src/routes/shopping-lists/$listId.tsx:517 — isCompleted check; backend validation per status

## 12) UX / UI Impact

- **Entry point:** Shopping list detail page (src/routes/shopping-lists/$listId.tsx)
- **Change:** Kit chips in content body gain hover-revealed unlink button (Unlink icon, 16x16, destructive color on hover)
- **User interaction:**
  1. User hovers over kit chip → unlink button fades in (opacity 0 → 100 via group-hover, always visible on touch devices)
  2. User clicks unlink button → confirmation dialog appears
  3. User confirms → kit chip shows loading spinner on unlink button, success toast appears, chip removed from list after refetch
  4. User cancels → dialog closes, no changes
- **Dependencies:**
  - `KitLinkChip` component must support optional `onUnlink` prop
  - `useKitShoppingListUnlinkMutation` hook (already exists)
  - `ConfirmDialog` component (already exists at src/components/ui/dialog.tsx)
- **Evidence:** src/components/shopping-lists/shopping-list-link-chip.tsx:122-140 — unlink button UI pattern; src/components/kits/kit-detail.tsx:494-505 — confirmation dialog usage

- **Entry point:** Shopping list detail page loading state
- **Change:** Kit chips skeleton renders in content body when `kitsQuery.isLoading` is true
- **User interaction:** User sees skeleton kit chips (rounded-full gray animated bars) in content body while kits query loads, maintaining consistent spacing with loaded state
- **Dependencies:** Skeleton kit chips wrapper in `detail-header-slots.tsx` linkChips slot
- **Evidence:** docs/outstanding_changes.md:46 — padding issue description; src/components/shopping-lists/detail-header-slots.tsx:244-248 — skeleton kit chips pattern

- **Entry point:** All link chips with unlink buttons (KitLinkChip, ShoppingListLinkChip)
- **Change:** Chips collapse to natural width when unlink button is hidden (no reserved space for hidden button)
- **User interaction:**
  1. User views chip without hovering → chip is compact, no empty space visible
  2. User hovers over chip → unlink button appears and chip expands smoothly to accommodate button
  3. User moves mouse away → unlink button fades out and chip collapses back to compact size
- **Dependencies:** CSS layout changes to both KitLinkChip and ShoppingListLinkChip components; may require absolute positioning or conditional rendering approach
- **Evidence:** src/components/shopping-lists/shopping-list-link-chip.tsx:122-140 — current implementation reserves space even when opacity-0

- **Entry point:** All kit-related UI elements (sidebar, chips, cards)
- **Change:** Replace all kit icons with CircuitBoard (lucide-react) for visual consistency
- **User interaction:** User sees consistent CircuitBoard icon wherever kits are represented (sidebar navigation, kit link chips in part detail, kit link chips in shopping list detail, part cards showing kit membership)
- **Dependencies:** Update icon imports and usage across multiple components
- **Evidence:** Current inconsistency: Package icon in sidebar/part-detail chips, Layers in shopping list kit chips (per plan), CircuitBoard in part cards (correct baseline)

## 13) Deterministic Test Plan

- **Surface:** Shopping list detail page — kit chip unlink flow
- **Scenarios:**
  - **Given** shopping list detail page loaded with 2 kit links, **When** user hovers over first kit chip, **Then** unlink button fades in
  - **Given** unlink button visible, **When** user clicks unlink button, **Then** ui_state event phase 'open' emitted with targetKitId and listId
  - **Given** unlink button clicked, **When** confirmation dialog appears, **Then** dialog title is "Unlink kit?" and description includes kit name
  - **Given** confirmation dialog open, **When** user clicks cancel, **Then** dialog closes and no mutation fires
  - **Given** confirmation dialog open, **When** user clicks confirm, **Then** ui_state event phase 'submit' emitted, DELETE /kit-shopping-list-links/{linkId} called
  - **Given** DELETE mutation succeeds (200), **When** response received, **Then** ui_state event phase 'success' emitted, success toast shows "Unlinked '{kitName}' from this shopping list.", kit chip removed after refetch
  - **Given** DELETE mutation returns 404, **When** response received, **Then** ui_state event phase 'success' emitted with noop:true, warning toast shows "That kit link was already removed. Refreshing shopping list detail.", kit chip removed after refetch
  - **Given** DELETE mutation fails (500), **When** response received, **Then** ui_state event phase 'error' emitted with error details, error toast shows "Failed to unlink kit", kit chip remains visible
  - **Given** shopping list status is 'done', **When** page renders, **Then** kit chips render without unlink buttons
  - **Given** unlinking kit A in progress, **When** user clicks unlink on kit B, **Then** second click ignored (no dialog opens)
  - **Given** shopping list contains link to archived kit, **When** page renders, **Then** archived kit chip shows unlink button on hover (unlink allowed regardless of kit status)
- **Instrumentation / hooks:**
  - Wait for `ListLoading` scope 'shoppingLists.detail.kits' phase 'ready' before interacting with kit chips
  - Wait for `ui_state` scope 'shoppingLists.detail.kitUnlinkFlow' phase 'success' before asserting chip removed
  - Use `data-testid="shopping-lists.concept.body.kits.{kitId}.unlink"` to locate unlink buttons
  - Use `data-testid="shopping-lists.detail.kit-unlink.dialog"` to locate confirmation dialog
- **Gaps:** None — unlink flow mirrors existing kit detail unlink pattern which has full Playwright coverage
- **Evidence:** tests/e2e/kits/kit-detail.spec.ts — reference spec for kit side unlink; tests/e2e/shopping-lists/shopping-lists-detail.spec.ts — target spec file for shopping list side unlink

- **Surface:** Shopping list detail page — skeleton loading state padding
- **Scenarios:**
  - **Given** navigating to shopping list detail page, **When** kitsQuery is loading, **Then** kit chips skeleton renders in content body with same wrapper classes as loaded kit chips
  - **Given** kit chips skeleton rendered, **When** kitsQuery completes, **Then** actual kit chips render with no perceived padding shift
- **Instrumentation / hooks:**
  - Wait for `ListLoading` scope 'shoppingLists.list' phase 'ready' to assert loading state complete
  - Capture screenshot during loading state to verify skeleton padding matches loaded state padding
- **Gaps:** Padding verification may require visual regression testing; can be verified manually during implementation
- **Evidence:** tests/e2e/shopping-lists/shopping-lists-detail.spec.ts — target spec file; existing loading state assertions can be extended

## 14) Implementation Slices

- **Slice:** Add optional unlink props to KitLinkChip component
- **Goal:** KitLinkChip can render unlink button when onUnlink prop provided
- **Touches:** src/components/kits/kit-link-chip.tsx — add props, render button, handle loading/disabled states
- **Dependencies:** None; isolated component change

- **Slice:** Wire unlink handler in shopping list detail page
- **Goal:** Kit chips in shopping list detail page call unlink mutation, show confirmation dialog, emit instrumentation events. Route owns all state/mutation/dialog/instrumentation; hook receives callback and threads to chips.
- **Touches:**
  - src/components/shopping-lists/detail-header-slots.tsx — add `onUnlinkKit?: (link: ShoppingListKitLink) => void` prop to ConceptHeaderProps interface; thread callback to KitLinkChip components as `onUnlink={() => onUnlinkKit?.(kitLink)}`. Hook does NOT manage unlink state or emit instrumentation.
  - src/routes/shopping-lists/$listId.tsx — declare linkToUnlink state, unlinkingLinkId state, unlinkMutation hook, handleUnlinkRequest function, handleConfirmUnlink function (with explicit `void kitsQuery.refetch()` call in .then() block after success toast), confirmation dialog, all instrumentation (emitUnlinkFlowEvent). Route needs access to kitsQuery for refetch (from hook return or direct call to useGetShoppingListsKitsByListId). Pass handleUnlinkRequest as onUnlinkKit prop to useShoppingListDetailHeaderSlots.
- **Dependencies:** Slice 1 complete (KitLinkChip supports unlink); feature flag: none

- **Slice:** Fix skeleton loading state padding in shopping list detail
- **Goal:** Kit chips skeleton renders during initial page load (shoppingList===null state) to maintain consistent spacing. Existing skeleton at lines 244-248 handles kitsQuery.isLoading (after list loads); new skeleton handles list query loading.
- **Touches:**
  - src/components/shopping-lists/detail-header-slots.tsx — add linkChips slot to early return (lines 149-180) when `list === null`. Skeleton structure should match lines 244-248: `linkChips: <div className="flex flex-wrap items-center gap-2"><div className="h-6 w-32 animate-pulse rounded-full bg-muted" /><div className="h-6 w-28 animate-pulse rounded-full bg-muted" /></div>`
- **Dependencies:** None; isolated layout change

- **Slice:** Add Playwright coverage for kit chip unlink flow
- **Goal:** Automated tests verify unlink button interaction, confirmation dialog, success/error states, instrumentation events
- **Touches:** tests/e2e/shopping-lists/shopping-lists-detail.spec.ts — add test cases for unlink flow
- **Dependencies:** Slices 1-2 complete (UI and handlers implemented)

- **Slice:** Fix link chip layout to collapse when unlink button hidden
- **Goal:** Chips expand only when unlink button is visible (on hover/focus), no empty space reserved when button is hidden. Applies to both KitLinkChip and ShoppingListLinkChip components.
- **Touches:**
  - src/components/kits/kit-link-chip.tsx — adjust unlink button layout to not reserve space when opacity-0; options include: (a) absolute positioning with right offset, (b) conditional rendering based on hover state, (c) CSS grid/flexbox with width:0 when hidden
  - src/components/shopping-lists/shopping-list-link-chip.tsx — apply same layout fix to existing unlink button (lines 122-140)
- **Dependencies:** Slice 1 complete (KitLinkChip unlink button added); should be implemented alongside or immediately after to avoid shipping layout issue

- **Slice:** Standardize kit icon to CircuitBoard across application
- **Goal:** All kit icons use CircuitBoard (lucide-react) for visual consistency. Replace Package and Layers icons currently in use.
- **Touches:**
  - src/components/layout/sidebar.tsx (or equivalent sidebar navigation component) — change kit navigation icon from Package to CircuitBoard
  - src/components/kits/kit-link-chip.tsx — ensure default icon is CircuitBoard (not Package)
  - src/components/parts/part-details.tsx (or equivalent) — change kit link chip icon from Package to CircuitBoard in part detail kit membership section
  - src/components/shopping-lists/detail-header-slots.tsx — change kit link chip icon from Layers to CircuitBoard when rendering kit chips (may need to pass icon prop to KitLinkChip or update default)
  - Verify part cards already use CircuitBoard (baseline reference)
- **Dependencies:** None; can be implemented independently as visual consistency fix

## 15) Risks & Open Questions

- **Risk:** Kit chips unlink and shopping list chips unlink have divergent behavior (one has undo, other doesn't)
- **Impact:** User confusion if undo available on one side but not the other
- **Mitigation:** Document this as known limitation; undo for kit chip unlink is out of scope per initial requirements; can be added later if user feedback requests it

- **Risk:** Skeleton padding fix insufficient if shopping list table also has inconsistent padding
- **Impact:** Visual jank persists even after fix
- **Mitigation:** Audit all shopping list loading state elements (header, chips, table) to ensure consistent padding; outstanding_changes.md indicates issue is specific to skeleton page padding, not table

- **Risk:** Unlink button on kit chips may be too subtle (hover-only) for users to discover
- **Impact:** Users don't realize they can unlink kits from shopping list side
- **Mitigation:** Follow exact pattern from shopping list chips on kit detail view (same hover behavior, same opacity transition); @media(pointer:coarse) makes button always visible on touch devices

- **Risk:** Chip collapse animation may feel jarring or cause layout shift during hover transitions
- **Impact:** Poor UX if chips jump around when hovering; accessibility issues if focus causes unexpected layout changes
- **Mitigation:** Use CSS transitions for smooth expansion/collapse; test with keyboard navigation and screen readers; consider using transform instead of width changes to avoid layout reflow; may need reduced-motion media query support

- **Risk:** Icon replacement may miss some locations or break existing visual hierarchy
- **Impact:** Inconsistent kit icons persist; UI elements may lose intended visual distinction if Package/Layers icons were semantically meaningful
- **Mitigation:** Perform comprehensive grep for Package, Layers, and CircuitBoard imports to find all kit-related usage; verify icon change doesn't conflict with other entity types that use similar icons; review with designer if Package/Layers had specific semantic meaning beyond "generic kit icon"

**Decisions confirmed:**

- **Unlink button on archived kit chips:** Unlink button will appear on both active and archived kit chips. The only constraint is shopping list status (completed lists are read-only). Frontend does not filter by kit status; backend enforces any kit-specific permissions. This provides full bidirectional unlinking capability regardless of kit lifecycle state.

- **Confirmation dialog metadata:** Confirmation dialog will follow the existing simple pattern from kit detail view — no metadata (requested units, honor reserved) shown. Dialog displays only kit name for clarity. This keeps the unlink flow consistent across both sides and avoids cluttering the dialog. Enhancement with metadata can be added later if user feedback requests it.

## 16) Confidence

**Confidence:** High — Pattern already proven in kit detail view (shopping list chip unlink); API hook exists and handles cache invalidation correctly; component changes are isolated and mirror existing ShoppingListLinkChip pattern; skeleton padding fix is localized to content wrapper; Playwright coverage can be copied from existing kit detail unlink specs.

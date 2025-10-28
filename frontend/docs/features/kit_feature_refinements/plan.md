# Kit Feature Refinements – Technical Plan

## 0) Research Log & Findings

### Research Summary

Searched kit-related components, hooks, and layouts to understand current implementation:

**Kit List View:**
- Found `KitOverviewList` (`src/components/kits/kit-overview-list.tsx:66-67`) fetches all kit IDs and passes them to `useKitShoppingListMemberships` and `useKitPickListMemberships` hooks
- Discovered the hooks already implement batch querying via `useMembershipLookup` in `src/hooks/use-kit-memberships.ts:292-361`
- However, the hooks are called with individual kit IDs computed after the kits query completes, not optimizing the data flow
- Confirmed parts list uses `useShoppingListMembershipIndicators` (`src/components/parts/part-list.tsx:143`) with `partKeys` array for batch querying

**Shopping List Indicator:**
- Found "Needs refresh" label in `src/components/kits/kit-card.tsx:210` displayed when `membership.isStale` is true
- The `isStale` field comes from the API response (`KitShoppingListMembership.isStale`)
- The refresh functionality itself is not implemented, so the label is misleading

**Scrollbar Issue:**
- Located `DetailScreenLayout` (`src/components/layout/detail-screen-layout.tsx:130`) with `overflow-auto` on main content
- Found kit detail wraps content in flex container with `min-h-0` at `src/components/kits/kit-detail.tsx:294`
- The issue is likely caused by nested flex containers or content height calculation

**Archive Controls:**
- Found `KitArchiveControls` component (`src/components/kits/kit-archive-controls.tsx:173-196`) renders archive/unarchive buttons
- Currently displayed in `KitCard` footer at `src/components/kits/kit-overview-list.tsx:268`
- No archive button exists in kit detail screen

**Delete Functionality:**
- Backend delete endpoint `DELETE /api/kits/{kit_id}` now exists (returns 204 on success, 400 for validation errors)
- Generated hook `useDeleteKitsByKitId` available in `src/lib/api/generated/hooks.ts:839`

**Shopping List Link Chip:**
- Found `ShoppingListLinkChip` component (`src/components/shopping-lists/shopping-list-link-chip.tsx:122-139`)
- Unlink button currently always visible when `onUnlink` prop provided
- Should only appear on hover/focus for cleaner UI

---

## 1) Intent & Scope

**User intent**

Polish kit list and detail views with functional and visual improvements to enhance performance, fix bugs, and improve action organization.

**Prompt quotes**

"Optimize kit list view to use batch queries for shopping list icons (like part list does)"
"Remove 'Refresh needed' label from shopping list indicator tooltips"
"Fix scrollbar bug on kit detail view where page-level scrollbar appears"
"Move archive button from list card to detail screen ellipsis menu"
"Add delete option to kit detail ellipsis menu"
"Show unlink icon on shopping cart link chip only on hover/focus"

**In scope**

- Refactor kit list membership queries to match parts list batch query pattern
- Remove "Needs refresh" label from shopping list membership tooltips in kit cards
- Fix DetailScreenLayout overflow/scrollbar behavior in kit detail view
- Move archive/unarchive controls from list card to detail screen ellipsis menu
- Add delete action to kit detail ellipsis menu using available backend endpoint
- Update shopping list link chip to show unlink icon only on hover/focus state
- Update Playwright tests to match new UI behavior

**Out of scope**

- Implementing actual refresh functionality for shopping list memberships (backend work)
- Changing archive/unarchive business logic or optimistic updates
- Modifying shopping list link chip beyond hover/focus styling changes

**Assumptions / constraints**

- Backend delete endpoint `/api/kits/{kit_id}` is now available (returns 204 on success, 400/404 on errors)
- Existing instrumentation events remain compatible with UI changes
- Archive controls behavior (optimistic updates, undo) stays identical when moved
- Kit detail ellipsis menu follows same pattern as parts detail menu

---

## 2) Affected Areas & File Map (with repository evidence)

### Components

- **Area**: `src/components/kits/kit-overview-list.tsx`
- **Why**: Refactor to compute membership queries more efficiently; remove archive controls from card props
- **Evidence**: Lines 55-67 compute `allKitIds` and pass to membership hooks; line 268 passes `<KitArchiveControls>` to KitCard

---

- **Area**: `src/components/kits/kit-card.tsx`
- **Why**: Remove "Needs refresh" label from shopping list tooltip; remove controls prop usage
- **Evidence**: Lines 207-211 render "Needs refresh" when `membership.isStale`; line 135-139 render controls footer

---

- **Area**: `src/components/kits/kit-detail-header.tsx`
- **Why**: Add ellipsis menu with archive and delete actions
- **Evidence**: Lines 231-259 render actions slot; no ellipsis menu currently exists

---

- **Area**: `src/components/kits/kit-detail.tsx`
- **Why**: Fix flex container scrollbar issue; integrate new header actions
- **Evidence**: Line 294 wraps in flex container; line 293-308 renders DetailScreenLayout

---

- **Area**: `src/components/kits/kit-archive-controls.tsx`
- **Why**: Export reusable archive/unarchive mutation logic for detail screen
- **Evidence**: Lines 111-143 contain archive mutation; lines 61-96 contain unarchive mutation with undo

---

- **Area**: `src/components/shopping-lists/shopping-list-link-chip.tsx`
- **Why**: Show unlink button only on hover/focus
- **Evidence**: Lines 122-139 render unlink button unconditionally when `onUnlink` provided

---

- **Area**: `src/components/layout/detail-screen-layout.tsx`
- **Why**: Verify overflow handling and min-h-0 propagation
- **Evidence**: Line 130 applies `overflow-auto` to main content; line 66 applies flex column to root

---

### Hooks

- **Area**: `src/hooks/use-kit-memberships.ts`
- **Why**: Already implements batch queries; verify staleTime and gcTime settings match parts pattern
- **Evidence**: Lines 292-361 define `useKitShoppingListMemberships`; lines 42-43 set `INDICATOR_STALE_TIME = 60_000` and `INDICATOR_GC_TIME = 300_000`

---

- **Area**: `src/hooks/use-kit-detail.ts` (if exists) or inline logic in `kit-detail.tsx`
- **Why**: May need to add delete mutation integration
- **Evidence**: `src/components/kits/kit-detail.tsx:81` imports `useDeletePartsByPartKey` (similar pattern expected for kits)

---

### API (Generated Hooks)

- **Area**: `src/lib/api/generated/hooks.ts`
- **Why**: Generated delete hook `useDeleteKitsByKitId` now available for use
- **Evidence**: Hook exported at line 839; similar pattern to `useDeletePartsByPartKey` at `src/components/parts/part-details.tsx:26`

---

### Types

- **Area**: `src/types/kits.ts`
- **Why**: Confirm `isStale` field exists on `KitShoppingListMembership`
- **Evidence**: Referenced in `kit-card.tsx:207`; mapped from API response in `use-kit-memberships.ts:106`

---

### Tests

- **Area**: `tests/specs/kits/*.spec.ts`
- **Why**: Update selectors for archive controls moved to detail menu; add delete action tests
- **Evidence**: Existing tests reference `kits.overview.controls.archive.{kitId}` and `kits.detail.actions` test IDs

---

## 3) Data Model / Contracts

### Kit Membership Summaries

- **Entity / contract**: `KitShoppingListMembershipSummary` and `KitPickListMembershipSummary`
- **Shape**:
  ```typescript
  {
    kitId: number;
    memberships: KitShoppingListMembership[];  // includes isStale field
    hasActiveMembership: boolean;
    activeCount: number;
    // ... counts
  }
  ```
- **Mapping**: Backend returns `is_stale` (snake_case), mapped to `isStale` (camelCase) at hook layer
- **Evidence**: `src/hooks/use-kit-memberships.ts:97-110`

---

### Delete Kit API

- **Entity / contract**: `DELETE /api/kits/{kit_id}`
- **Shape**:
  ```typescript
  // Request
  { path: { kit_id: number } }

  // Response
  204 No Content (success) | 404 Not Found | 400 Bad Request (validation errors, e.g., has dependencies)
  ```
- **Mapping**: Uses generated `useDeleteKitsByKitId` hook; returns `void` on success
- **Evidence**: `src/lib/api/generated/hooks.ts:839`; similar pattern in `src/components/parts/part-details.tsx:81` using `useDeletePartsByPartKey`

---

## 4) API / Integration Surface

### Kit Membership Batch Query (Already Exists)

- **Surface**: `POST /api/kits/shopping-list-memberships/query` / `useKitShoppingListMemberships`
- **Inputs**: `{ kit_ids: number[], include_done: boolean }`
- **Outputs**: Array of membership summaries with `isStale` flags; updates `summaryByKitId` map
- **Errors**: Toast on failure; error state shown in membership indicator
- **Evidence**: `src/hooks/use-kit-memberships.ts:65-78`

---

### Archive Kit (Reused)

- **Surface**: `POST /api/kits/{kit_id}/archive` / `usePostKitsArchiveByKitId`
- **Inputs**: `{ path: { kit_id: number } }`
- **Outputs**: Optimistic update to kit status; toast with undo action
- **Errors**: Rollback on failure; toast error message
- **Evidence**: `src/components/kits/kit-archive-controls.tsx:111-143`

---

### Unarchive Kit (Reused)

- **Surface**: `POST /api/kits/{kit_id}/unarchive` / `usePostKitsUnarchiveByKitId`
- **Inputs**: `{ path: { kit_id: number } }`
- **Outputs**: Optimistic update to kit status; toast confirmation
- **Errors**: Rollback on failure; toast error message
- **Evidence**: `src/components/kits/kit-archive-controls.tsx:61-96`

---

### Delete Kit

- **Surface**: `DELETE /api/kits/{kit_id}` / `useDeleteKitsByKitId`
- **Inputs**: `{ path: { kit_id: number } }`
- **Outputs**: Returns void (204); navigate back to kits overview on success; invalidate queries
- **Errors**: Toast if delete fails (e.g., 400 for kit with dependencies, 404 for not found); no optimistic update
- **Evidence**: `src/lib/api/generated/hooks.ts:839`; pattern from `src/components/parts/part-details.tsx:215-236`

---

## 5) Algorithms & UI Flows (step-by-step)

### Flow 1: Batch Membership Query on Kit List Load

**Flow**: Kit list initial render with membership indicators
**Steps**:
1. Kit list mounts; fetches active and archived kits via `useKitsOverview`
2. Extracts all kit IDs from both buckets into `allKitIds` array
3. Passes `allKitIds` to `useKitShoppingListMemberships` and `useKitPickListMemberships`
4. Hooks batch-query all memberships in single POST request
5. Hooks return `summaryByKitId` map for O(1) lookup per kit card
6. Each `KitCard` reads its summary from map and renders indicator

**States / transitions**:
- `queries.active.isLoading` → skeleton cards
- `queries.active.isSuccess` + `shoppingMemberships.status === 'pending'` → kit cards with loading spinner in indicator
- All success → kit cards with membership icons

**Hotspots**:
- Current implementation fetches kits first, then computes IDs, then fetches memberships sequentially
- Indicators may flicker if membership query resolves after initial card render

**Evidence**: `src/components/kits/kit-overview-list.tsx:53-67`

---

### Flow 2: Archive Kit from Detail Screen

**Flow**: User clicks archive option in kit detail ellipsis menu
**Steps**:
1. User opens ellipsis menu (new dropdown in detail header)
2. User clicks "Archive" menu item
3. `handleArchiveClick` calls `archiveMutation.mutateAsync({ path: { kit_id } })`
4. Optimistic update moves kit to archived status in query cache
5. Backend confirms; toast shows success with undo action
6. If undo clicked within toast lifetime, `unarchiveMutation` immediately fires

**States / transitions**:
- `pendingAction === 'archive'` → menu item shows "Archiving…" (or disabled)
- Success → navigate back to kits overview (or stay on detail with updated status badge)
- Error → rollback cache; show toast error

**Hotspots**:
- Avoid race conditions if user navigates away mid-archive
- Ensure ellipsis menu closes after action starts

**Evidence**: `src/components/kits/kit-archive-controls.tsx:111-143`

---

### Flow 3: Delete Kit from Detail Screen

**Flow**: User clicks delete option in kit detail ellipsis menu
**Steps**:
1. User opens ellipsis menu
2. User clicks "Delete Kit"
3. Confirm dialog appears: "Are you sure? This action cannot be undone and will only succeed if the kit has no dependencies."
4. User confirms
5. `handleDeleteKit` calls `deleteKitMutation.mutateAsync({ path: { kit_id } })`
6. Backend validates (no shopping lists, no pick lists, etc.)
7. On success: navigate to `/kits` overview; invalidate kit queries
8. On 400 error: show toast explaining dependencies prevent deletion

**States / transitions**:
- Waiting for confirm → dialog open
- `deleteKitMutation.isPending` → menu item disabled; delete button shows spinner
- Success → immediate navigation
- Error → stay on detail; show error toast

**Hotspots**:
- Backend validation must return clear error message
- Confirm dialog must clearly state deletion requirements

**Evidence**: Similar pattern at `src/components/parts/part-details.tsx:215-236`

---

### Flow 4: Unlink Icon Hover State on Shopping List Chip

**Flow**: User hovers over shopping list chip in kit detail
**Steps**:
1. Chip renders with link to shopping list and unlink button
2. By default, unlink button hidden (`opacity-0` or `hidden`)
3. On `.group:hover` or `.group:focus-within`, unlink button fades in (`opacity-100` with transition)
4. User clicks unlink icon → confirm dialog → unlink mutation fires

**States / transitions**:
- Default → icon invisible
- Hover/focus → icon visible with smooth transition
- Click → icon disabled; loading spinner

**Hotspots**:
- Must work with keyboard navigation (focus-within)
- Touch devices need alternate pattern (always show, or show on tap)

**Evidence**: `src/components/shopping-lists/shopping-list-link-chip.tsx:122-139`

---

## 6) Derived State & Invariants (stacked bullets)

### Derived value: `allKitIds` in kit list

- **Source**: Filtered/unfiltered kits from `buckets.active` and `buckets.archived`
- **Writes / cleanup**: Passed to membership hooks; triggers batch query on change
- **Guards**: Only computed after both queries resolve; avoids fetching memberships for zero kits
- **Invariant**: Must include all visible kits regardless of active/archived tab to prefetch data for tab switch
- **Evidence**: `src/components/kits/kit-overview-list.tsx:55-64`

---

### Derived value: `summaryByKitId` map in membership hooks

- **Source**: Batch API response normalized to Map<kitId, summary>
- **Writes / cleanup**: Cached by TanStack Query; stale after 60s; GC after 5 minutes
- **Guards**: Empty summary returned if kit ID not in response
- **Invariant**: Kit IDs in request must match keys in map; missing kits get placeholder summary
- **Evidence**: `src/hooks/use-kit-memberships.ts:159-194`

---

### Derived value: Archive button visibility in detail menu

- **Source**: `kit.status` from detail query
- **Writes / cleanup**: Menu item text toggles "Archive" / "Unarchive"; action handler switches
- **Guards**: Disabled during `pendingAction !== null`
- **Invariant**: Archived kits cannot be re-archived; active kits cannot be unarchived
- **Evidence**: `src/components/kits/kit-archive-controls.tsx:172-196`

---

## 7) State Consistency & Async Coordination

### Query Invalidation Strategy

- **Source of truth**: TanStack Query cache for kit list (`['getKits', status, search]`) and detail (`['getKitById', kitId]`)
- **Coordination**: Archive mutations invalidate `{ queryKey: ['getKits'] }` on settle; detail screen refetches after archive
- **Async safeguards**: `cancelQueries` before optimistic update to avoid race with in-flight refetch
- **Instrumentation**: `useListLoadingInstrumentation` emits `ListLoading` events for kits.overview and kits.detail.memberships scopes
- **Evidence**: `src/components/kits/kit-archive-controls.tsx:54-59, 94-95, 140-142`

---

### Ellipsis Menu State Coordination

- **Source of truth**: Local React state for dropdown open/closed
- **Coordination**: Mutations triggered from menu items close menu on success
- **Async safeguards**: Menu items disabled when mutation pending to prevent double-click
- **Instrumentation**: Archive/unarchive use existing form instrumentation (`ARCHIVE_FORM_ID`, `UNARCHIVE_FORM_ID`); delete will need new form scope
- **Evidence**: Pattern from `src/components/parts/part-details.tsx:289-311`

---

## 8) Errors & Edge Cases

### Failure: Kit delete fails due to dependencies

- **Surface**: Kit detail ellipsis menu → Delete action
- **Handling**: Backend returns 400 with message "Cannot delete kit with active shopping lists"; toast shows error; stay on detail view
- **Guardrails**: Confirm dialog warns deletion only succeeds for clean kits
- **Evidence**: Similar pattern at `src/components/parts/part-details.tsx:215-236`

---

### Failure: Membership batch query fails on list view

- **Surface**: Kit list → membership indicator
- **Handling**: Indicator shows error icon (AlertTriangle) with tooltip "Failed to load kit shopping list memberships."
- **Guardrails**: Kits still render with all other data; user can retry via page refresh
- **Evidence**: `src/components/common/membership-indicator.tsx:49-62`

---

### Edge case: User archives kit while viewing detail

- **Surface**: Kit detail → archive menu item
- **Handling**: Optimistic update changes status badge; "Order Stock" button disables; user stays on detail screen
- **Guardrails**: Undo toast action immediately unarchives if clicked; no navigation disruption
- **Evidence**: `src/components/kits/kit-archive-controls.tsx:126-139`

---

### Edge case: "Needs refresh" label removed but isStale still in data

- **Surface**: Kit card shopping list tooltip
- **Handling**: `isStale` field ignored in tooltip rendering; label removed from `renderKitShoppingTooltip`
- **Guardrails**: Backend may still return `is_stale: true`; UI simply doesn't display it
- **Evidence**: `src/components/kits/kit-card.tsx:207-213`

---

### Edge case: Scrollbar appears on kit detail with long BOM

- **Surface**: Kit detail view
- **Handling**: Ensure `DetailScreenLayout` main content has `overflow-auto`; parent container must have `min-h-0` to allow flex child to shrink
- **Guardrails**: Test with >20 BOM rows to reproduce issue
- **Evidence**: `src/components/layout/detail-screen-layout.tsx:130`; `src/components/kits/kit-detail.tsx:294`

---

## 9) Observability / Instrumentation

### Signal: Archive/unarchive form events

- **Type**: Form instrumentation (`trackFormSubmit`, `trackFormSuccess`, `trackFormError`)
- **Trigger**: When archive/unarchive action fires from detail menu (same as list card)
- **Labels / fields**: `{ kitId, targetStatus: 'archived' | 'active', undo?: boolean }`
- **Consumer**: Playwright waits on `FormSubmit` and `FormSuccess` events
- **Evidence**: `src/components/kits/kit-archive-controls.tsx:74, 82, 103, 123, 128, 149, 161`

---

### Signal: Delete kit form events (new)

- **Type**: Form instrumentation
- **Trigger**: On delete button click; on mutation success/error
- **Labels / fields**: `{ kitId, formId: 'KitLifecycle:delete' }`
- **Consumer**: Playwright specs for delete action
- **Evidence**: N/A – new instrumentation required

---

### Signal: Kit list membership loading events

- **Type**: `ListLoading` instrumentation
- **Trigger**: When membership batch queries start/complete
- **Labels / fields**: `{ scope: 'kits.list.memberships.shopping', kitCount, activeCount, membershipCount }`
- **Consumer**: Playwright `waitForListLoading` helper
- **Evidence**: `src/hooks/use-kit-memberships.ts:344-352`

---

### Signal: Unlink icon visibility state

- **Type**: `data-testid` attribute changes
- **Trigger**: N/A – CSS-only hover effect
- **Labels / fields**: `data-testid="kits.detail.links.shopping.unlink.{listId}"`
- **Consumer**: Playwright can hover and click; no event emission needed
- **Evidence**: `src/components/shopping-lists/shopping-list-link-chip.tsx:133`

---

## 10) Lifecycle & Background Work

### Hook / effect: Membership query stale/refetch

- **Trigger cadence**: On mount; refetch after 60s (staleTime); GC after 5 minutes
- **Responsibilities**: Keep membership counts fresh for indicators
- **Cleanup**: Query cancelled if component unmounts mid-fetch
- **Evidence**: `src/hooks/use-kit-memberships.ts:42-43, 304`

---

### Hook / effect: Archive mutation query cancellation

- **Trigger cadence**: On archive/unarchive action
- **Responsibilities**: Cancel in-flight kit overview queries before optimistic update
- **Cleanup**: `await cancelQueries` ensures no race
- **Evidence**: `src/components/kits/kit-archive-controls.tsx:54-59`

---

## 11) Security & Permissions (if applicable)

### Concern: Delete authorization

- **Touchpoints**: Kit detail ellipsis menu → delete action
- **Mitigation**: Backend validates user owns kit and kit has no dependencies; frontend shows error toast if unauthorized
- **Residual risk**: User can attempt delete but will fail gracefully; no data loss risk
- **Evidence**: Assumed backend pattern similar to parts delete

---

## 12) UX / UI Impact (if applicable)

### Entry point: Kit list cards

- **Change**: Remove archive/unarchive buttons from card footer
- **User interaction**: Cleaner card layout; actions moved to detail screen
- **Dependencies**: None
- **Evidence**: `src/components/kits/kit-overview-list.tsx:268`

---

### Entry point: Kit detail header actions

- **Change**: Add ellipsis menu (three-dot icon) with Archive, Unarchive, and Delete options
- **User interaction**: User clicks ellipsis → dropdown menu appears → click action → confirm dialog (for delete) → mutation fires
- **Dependencies**: Follows parts detail menu pattern
- **Evidence**: `src/components/kits/kit-detail-header.tsx:231-259`

---

### Entry point: Shopping list link chips in kit detail

- **Change**: Unlink icon hidden by default; appears on hover/focus
- **User interaction**: Cleaner chip appearance; hover reveals unlink option
- **Dependencies**: CSS group-hover utility
- **Evidence**: `src/components/shopping-lists/shopping-list-link-chip.tsx:122-139`

---

### Entry point: Kit card shopping list tooltip

- **Change**: Remove "Needs refresh" label
- **User interaction**: Tooltip no longer shows confusing stale state indicator
- **Dependencies**: None
- **Evidence**: `src/components/kits/kit-card.tsx:207-213`

---

## 13) Deterministic Test Plan (new/changed behavior only)

### Surface: Kit list view with membership indicators

**Scenarios**:
- **Given** kit list loaded with 10+ kits
- **When** page renders
- **Then** single batch POST to `/api/kits/shopping-list-memberships/query` with all kit IDs
- **And** indicators appear for kits with memberships
- **And** no "Needs refresh" label in tooltip

**Instrumentation / hooks**:
- Wait for `ListLoading` event with `scope: 'kits.list.memberships.shopping'` and `status: 'ready'`
- Inspect network tab for single batch request
- Hover indicator; assert tooltip content excludes "Needs refresh"

**Gaps**: None

**Evidence**: Existing `tests/specs/kits/kits-overview.spec.ts`

---

### Surface: Kit detail ellipsis menu – archive action

**Scenarios**:
- **Given** active kit detail screen
- **When** user clicks ellipsis menu
- **Then** dropdown shows "Archive" option
- **When** user clicks "Archive"
- **Then** `FormSubmit` event emitted with `formId: 'KitLifecycle:archive'`
- **And** kit status badge updates to "Archived"
- **And** toast shows "Archived {kitName}" with undo action

**Instrumentation / hooks**:
- `data-testid="kits.detail.actions.menu"`
- `data-testid="kits.detail.actions.archive"`
- Wait for `FormSuccess` event

**Gaps**: None

**Evidence**: Pattern from `tests/specs/parts/part-details.spec.ts` menu tests

---

### Surface: Kit detail ellipsis menu – delete action

**Scenarios**:
- **Given** kit with no dependencies (no shopping lists, no pick lists)
- **When** user clicks ellipsis menu → "Delete Kit"
- **Then** confirm dialog appears
- **When** user confirms
- **Then** DELETE request sent
- **And** navigation to `/kits` overview
- **And** kit no longer in list

**Alternate**:
- **Given** kit with shopping list link
- **When** user attempts delete
- **Then** backend returns 400 error
- **And** toast shows "Cannot delete kit with active dependencies"

**Instrumentation / hooks**:
- `data-testid="kits.detail.actions.delete"`
- Wait for `FormSubmit` with `formId: 'KitLifecycle:delete'`
- Wait for navigation

**Gaps**: None

**Evidence**: Similar pattern at `tests/specs/parts/part-delete.spec.ts`

---

### Surface: Shopping list link chip unlink icon

**Scenarios**:
- **Given** kit detail with linked shopping list
- **When** page loads
- **Then** chip visible but unlink icon hidden
- **When** user hovers over chip
- **Then** unlink icon fades in
- **When** user clicks unlink icon
- **Then** confirm dialog appears
- **And** unlink mutation fires on confirm

**Instrumentation / hooks**:
- `data-testid="kits.detail.links.shopping.{listId}"`
- Playwright `.hover()` to trigger CSS state
- Assert icon visibility via computed styles or bounding box

**Gaps**: None

**Evidence**: Existing unlink tests in `tests/specs/kits/kit-shopping-list-links.spec.ts`

---

### Surface: Kit detail scrollbar fix

**Scenarios**:
- **Given** kit with >20 BOM rows
- **When** detail screen renders
- **Then** only the main content area scrolls (BOM table)
- **And** no page-level scrollbar appears

**Instrumentation / hooks**:
- Playwright viewport check; scroll to bottom of BOM; verify header stays fixed

**Gaps**: None

**Evidence**: Visual regression or manual testing

---

## 14) Implementation Slices (only if large)

### Slice 1: Optimize kit list membership queries

- **Goal**: Improve performance by ensuring batch queries fire efficiently
- **Touches**: `kit-overview-list.tsx` (move ID extraction earlier if needed)
- **Dependencies**: None

---

### Slice 2: Remove "Needs refresh" label from kit cards

- **Goal**: Clean up misleading UI element
- **Touches**: `kit-card.tsx` (remove `isStale` conditional rendering)
- **Dependencies**: None

---

### Slice 3: Fix kit detail scrollbar bug

- **Goal**: Ensure only content scrolls, not entire page
- **Touches**: `kit-detail.tsx` (verify flex container hierarchy), `detail-screen-layout.tsx` (if needed)
- **Dependencies**: None

---

### Slice 4: Move archive button to detail screen ellipsis menu

- **Goal**: Improve action organization and reduce list card clutter
- **Touches**: `kit-detail-header.tsx` (add ellipsis menu), `kit-overview-list.tsx` (remove controls prop), `kit-card.tsx` (remove controls footer)
- **Dependencies**: Slice 1-3 can be done independently

---

### Slice 5: Add delete action to detail screen ellipsis menu

- **Goal**: Enable kit deletion with confirmation
- **Touches**: `kit-detail-header.tsx` (add delete menu item), `kit-detail.tsx` (add delete mutation handler)
- **Dependencies**: Slice 4 (menu must exist)

---

### Slice 6: Show unlink icon only on hover/focus

- **Goal**: Cleaner chip UI with progressive disclosure
- **Touches**: `shopping-list-link-chip.tsx` (add CSS classes for hover state)
- **Dependencies**: None

---

### Slice 7: Update Playwright tests

- **Goal**: Ensure all tests pass with new UI structure
- **Touches**: `tests/specs/kits/*.spec.ts` (update selectors, add delete test)
- **Dependencies**: Slices 1-6 complete

---

## 15) Risks & Open Questions

### Risk: Backend delete validation may be strict

- **Impact**: User cannot delete kits with any dependencies (shopping lists, pick lists, BOM contents)
- **Mitigation**: Ensure clear error messages in toast when 400 validation errors occur; confirm dialog warns about requirements

---

### Risk: Hover-only unlink icon may not work on touch devices

- **Impact**: Mobile users cannot access unlink action
- **Mitigation**: Use `:focus-within` in addition to `:hover`; consider showing icon on any tap/click

---

### Risk: Membership batch query refactor may introduce cache inconsistencies

- **Impact**: Stale data shown in indicators
- **Mitigation**: Reuse existing `useMembershipLookup` hook; test cache invalidation after mutations

---

### Open question: Should archive action on detail screen stay on page or navigate away?

- **Why it matters**: UX consistency; current list card behavior doesn't navigate
- **Owner / follow-up**: Product decision; default to staying on page with updated status badge

---

### Open question: Should "Needs refresh" functionality be implemented in future?

- **Why it matters**: Determines if `isStale` field is removed from types or just hidden in UI
- **Owner / follow-up**: Product roadmap; for now, keep field but don't display it

---

## 16) Confidence

**Confidence: High** — All affected components identified with evidence; existing patterns (parts detail menu, membership indicators) provide clear templates; backend delete endpoint confirmed available with clear contract (204/400/404 responses).

---

**Plan Complete**

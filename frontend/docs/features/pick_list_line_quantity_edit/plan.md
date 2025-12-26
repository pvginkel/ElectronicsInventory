# Pick List Line Quantity Edit — Technical Plan

## 0) Research Log & Findings

**Discovery Summary**

Examined the existing part location quantity editing pattern in `src/components/parts/part-location-grid.tsx` (lines 387-459 and 462-533) which implements:
- Clickable quantity text in read-only mode
- Inline input field with Save/Cancel buttons when editing
- Keyboard support (Enter to save, Escape to cancel)
- Edit button trigger with Pencil icon

Reviewed current pick list implementation:
- `src/components/pick-lists/pick-list-lines.tsx` displays pick list lines in a table format with quantity shown as static text (line 200-202)
- `src/types/pick-lists.ts` defines `PickListLine` type with `quantityToPick` field
- `src/hooks/use-pick-list-detail.ts` fetches and maps pick list detail data
- OpenAPI schema shows new `PATCH /api/pick-lists/{pick_list_id}/lines/{line_id}` endpoint with `PickListLineQuantityUpdateSchema.b247181` payload accepting `quantity_to_pick` (integer >= 0)
- Backend returns full `KitPickListDetailSchema_b247181` after update

**Instrumentation Review**

Existing pick list execution uses `useUiStateInstrumentation` in `src/hooks/use-pick-list-execution.ts` (line 290-294) for pick/undo actions. Need similar instrumentation for quantity edits.

**Conflicts & Decisions**

- Part location edit allows changing box/location/quantity; pick list line edit only changes quantity (location is fixed)
- Part location uses two separate mutations (add/remove stock); pick list uses single PATCH endpoint
- Will implement simpler inline edit UI focused only on quantity field
- Will follow part location pattern for keyboard shortcuts and button layout

---

## 1) Intent & Scope

**User intent**

Enable users to adjust the quantity on a pick list line using an inline editing pattern. The quantity field should be clickable, transform into an editable input, and save changes via the backend endpoint.

**Prompt quotes**

"Make the pick list line quantity editable using the same UI pattern that was previously used on the part location line: a clickable quantity that transforms into an inline input field for editing."

"The pattern to follow is the one that was previously implemented for part location quantity editing."

**In scope**

- Make the quantity text clickable in the pick list lines table
- Transform the table row to edit mode showing an input field for quantity
- Display Save and Cancel buttons during edit mode
- Support keyboard shortcuts (Enter to save, Escape to cancel)
- Call PATCH endpoint to update `quantity_to_pick`
- Handle validation (quantity >= 0)
- Handle zero quantity edge case (backend allows 0 to skip line)
- Update React Query cache optimistically
- Invalidate dependent queries (availability, kit memberships)
- Add test-mode instrumentation for Playwright assertions
- Prevent editing completed lines
- Disable editing while pick/undo operations are in flight

**Out of scope**

- Editing location (box/loc_no) — pick list lines have fixed locations
- Bulk quantity editing across multiple lines
- Quantity validation against available stock (display-only shortfall warnings remain)
- Deleting lines (quantity 0 skips the line but doesn't remove it)
- Historical tracking of quantity changes

**Assumptions / constraints**

- Backend PATCH endpoint returns full pick list detail, enabling optimistic update pattern
- Quantity must be non-negative integer (>= 0)
- Setting quantity to 0 marks the line as "skipped" but doesn't remove it
- Only open lines can be edited (completed lines are read-only)
- No concurrent editing of the same pick list by multiple users (last-write-wins)
- Instrumentation follows existing `ui_state` event pattern for pick list mutations

---

## 2) Affected Areas & File Map

- Area: Pick list lines table component
  - Why: Add edit mode UI, clickable quantity, input field, Save/Cancel buttons
  - Evidence: `src/components/pick-lists/pick-list-lines.tsx:199-202` shows quantity as static text `{NUMBER_FORMATTER.format(line.quantityToPick)}`

- Area: Pick list line quantity update hook
  - Why: Create new custom hook to wrap generated PATCH mutation with optimistic updates, cache invalidation, instrumentation
  - Evidence: `src/hooks/use-pick-list-execution.ts` demonstrates pattern for pick list mutations with optimistic updates (lines 296-391)
  - Hook signature:
    ```typescript
    export function usePickListLineQuantityUpdate(
      pickListId: number | undefined,
      kitId: number | undefined
    ): {
      updateQuantity: (lineId: number, newQuantity: number) => Promise<void>;
      isPending: boolean;
      pendingLineId: number | null;
    }
    ```
  - Instrumentation metadata structure:
    - `loading` phase: `{ pickListId, lineId, action: 'updateQuantity', oldQuantity, newQuantity }`
    - `ready` phase: add `{ status, openLineCount, completedLineCount, totalQuantityToPick, remainingQuantity }`
    - `error` phase: add `{ message: string }` from error object

- Area: Generated API hooks
  - Why: Run `pnpm generate:api` to generate `usePatchPickListsLinesByPickListIdAndLineId` from OpenAPI schema
  - Evidence: OpenAPI schema defines `PATCH /api/pick-lists/{pick_list_id}/lines/{line_id}` endpoint

- Area: Pick list types
  - Why: May need helper functions for optimistic quantity updates
  - Evidence: `src/types/pick-lists.ts:349-413` shows `applyPickListLineStatusPatch` pattern for optimistic updates

- Area: Test instrumentation
  - Why: Emit `ui_state` events for edit lifecycle (loading, ready, error, aborted)
  - Evidence: `src/lib/test/ui-state.ts` provides `useUiStateInstrumentation` hook

- Area: Playwright test spec
  - Why: Add test scenarios for inline quantity editing
  - Evidence: `tests/e2e/pick-lists/pick-list-detail.spec.ts` contains existing pick list detail tests

- Area: Pick lists page object
  - Why: Add locators and actions for quantity edit interactions
  - Evidence: `tests/support/page-objects/pick-lists-page.ts` provides pick list page object helpers

---

## 3) Data Model / Contracts

- Entity / contract: Pick list line quantity update request
  - Shape: `{ quantity_to_pick: number }` where `quantity_to_pick >= 0`
  - Mapping: Direct submission — no snake_case/camelCase conversion needed in request body
  - Evidence: OpenAPI schema `PickListLineQuantityUpdateSchema.b247181` (lines 7778-7794 in openapi.json)

- Entity / contract: Pick list line quantity update response
  - Shape: Full `KitPickListDetailSchema_b247181` with updated line quantities and recomputed metrics
  - Mapping: Pass through `mapPickListDetail` from `src/types/pick-lists.ts:101-118` to produce camelCase `PickListDetail`
  - Evidence: OpenAPI endpoint returns `KitPickListDetailSchema_b247181` (status 200)

- Entity / contract: Pick list detail query key
  - Shape: `['getPickListsByPickListId', { path: { pick_list_id: number } }]`
  - Mapping: Use `buildPickListDetailQueryKey` from `src/hooks/use-pick-list-detail.ts:17-19`
  - Evidence: Existing hook demonstrates query key structure

- Entity / contract: Optimistic update patch
  - Shape: Updated `KitPickListDetailSchema_b247181` with modified `quantity_to_pick` for target line and recomputed metrics
  - Mapping: Create `applyPickListLineQuantityPatch` following `applyPickListLineStatusPatch` pattern
  - Evidence: `src/types/pick-lists.ts:349-413` shows line patch pattern

- Entity / contract: `applyPickListLineQuantityPatch` helper function
  - Signature:
    ```typescript
    function applyPickListLineQuantityPatch(
      detail: KitPickListDetailSchema_b247181,
      lineId: number,
      newQuantity: number,
      options?: { updatedAt?: string }
    ): KitPickListDetailSchema_b247181
    ```
  - Algorithm:
    1. Find the target line by `lineId` in `detail.lines`
    2. Update its `quantity_to_pick` field to `newQuantity`
    3. Recompute metrics by calling `computePickListDetailMetrics(updatedLines)`
    4. Return new detail object with updated line and metrics (immutable)
  - Evidence: Follow immutability pattern from `applyPickListLineStatusPatch` at `src/types/pick-lists.ts:349-413`

---

## 4) API / Integration Surface

- Surface: PATCH /api/pick-lists/{pick_list_id}/lines/{line_id}
  - Inputs: `{ path: { pick_list_id: number, line_id: number }, body: { quantity_to_pick: number } }`
  - Outputs: Full `KitPickListDetailSchema_b247181` with updated line, invalidates pick list detail query, availability queries, kit membership queries, kit detail queries
  - Errors: 400 (validation), 404 (not found), 409 (conflict) — handled by global error handler, instrumentation emits error event
  - Evidence: OpenAPI schema operation `patch__api_pick-lists_{pick_list_id}_lines_{line_id}`

- Surface: TanStack Query cache updates
  - Inputs: Pick list ID determines query key
  - Outputs: Optimistic update on mutate, server response on success, rollback on error, invalidation triggers refetch
  - Errors: Query client rolls back optimistic update, toast shows error message
  - Evidence: `src/hooks/use-pick-list-execution.ts:296-391` demonstrates optimistic mutation pattern

- Surface: Availability query invalidation
  - Inputs: Pick list lines extract part keys
  - Outputs: Invalidate `pickLists.availability.{partKey}` queries to refresh stock counts
  - Errors: No specific error handling (invalidation is fire-and-forget)
  - Evidence: `src/hooks/use-pick-list-execution.ts:195-228` shows `invalidateAvailabilityQueries` helper

- Surface: Kit membership invalidation
  - Inputs: Kit ID from pick list detail
  - Outputs: Invalidate `kits.pickListMemberships` queries
  - Errors: No specific error handling
  - Evidence: `src/hooks/use-pick-list-execution.ts:134-162` shows `invalidateMembershipQueries`

---

## 5) Algorithms & UI Flows

- Flow: Initiate quantity edit
  - Steps:
    1. User clicks quantity text or Edit button on open pick list line
    2. Component sets local `editingLineId` state to current line ID
    3. Component initializes local `editQuantity` state from `line.quantityToPick.toString()`
    4. Row re-renders showing input field, Save/Cancel buttons, hiding static quantity
  - States / transitions: `editingLineId: null` → `number`, `editQuantity: string` initialized
  - Hotspots: Only one line editable at a time (state scoped to PickListLines component)
  - Evidence: `src/components/parts/part-location-grid.tsx:28` manages `editingLocation` state

- Flow: Save quantity change
  - Steps:
    1. User clicks Save or presses Enter in input field
    2. Parse `editQuantity` string to integer, validate >= 0
    3. If invalid, no-op (Save button should be disabled)
    4. If unchanged, cancel edit mode without mutation
    5. Create mutation variables `{ path: { pick_list_id, line_id }, body: { quantity_to_pick } }`
    6. Mutation hook emits `ui_state` loading event, sets optimistic cache data
    7. Backend responds with updated detail
    8. Mutation hook emits `ui_state` ready event, updates cache, invalidates dependent queries
    9. Component clears `editingLineId`, resets edit state
  - States / transitions: Edit mode → mutation pending → success → read mode
  - Hotspots: Optimistic update must recompute pick list metrics (total, remaining, status)
  - Evidence: `src/hooks/use-pick-list-execution.ts:296-364` shows mutation lifecycle

- Flow: Cancel quantity edit
  - Steps:
    1. User clicks Cancel or presses Escape
    2. Component clears `editingLineId` and `editQuantity`
    3. Row re-renders to read-only mode with original quantity
  - States / transitions: Edit mode → read mode (no mutation)
  - Hotspots: None
  - Keyboard handler scoping: Attach `onKeyDown` to quantity input element, listening for `key === 'Escape'` to trigger cancel, `key === 'Enter'` to trigger save
  - Evidence: `src/components/parts/part-location-grid.tsx:367-372` handles cancel, `:409, :419` shows input-scoped keyboard handling

- Flow: Handle mutation error
  - Steps:
    1. Backend returns 4xx/5xx or network error
    2. Mutation hook rolls back optimistic update (cache reverts to previous state)
    3. Mutation hook emits `ui_state` error event with message
    4. Global error handler shows toast notification
    5. Component remains in edit mode with user's input value preserved in the input field (local `editQuantity` state unchanged, allowing retry)
  - States / transitions: Mutation pending → error → edit mode retained
  - Hotspots: Error metadata includes pickListId, lineId, action for debugging
  - Error rollback behavior: Optimistic rollback affects query cache and derived metrics, but component's local `editQuantity` state remains unchanged so user can review input and retry
  - Evidence: `src/hooks/use-pick-list-execution.ts:365-384` handles error

---

## 6) Derived State & Invariants

- Derived value: Pick list total quantity to pick
  - Source: Sum of `quantity_to_pick` across all lines
  - Writes / cleanup: Backend recomputes `total_quantity_to_pick` after quantity update; optimistic patch must mirror this
  - Guards: Quantity must be >= 0; backend validates and rejects invalid values
  - Invariant: `total_quantity_to_pick === sum(lines.map(l => l.quantity_to_pick))`
  - Evidence: `src/types/pick-lists.ts:304-347` shows `computePickListDetailMetrics`

- Derived value: Remaining quantity
  - Source: `total_quantity_to_pick - picked_quantity`
  - Writes / cleanup: Backend updates `remaining_quantity` when line quantity changes
  - Guards: Cannot edit completed lines (would invalidate picked_quantity)
  - Invariant: `remaining_quantity = sum(open lines.quantity_to_pick)`
  - Evidence: `src/types/pick-lists.ts:337` computes `remainingQuantity`

- Derived value: Line group metrics (quantity per part)
  - Source: Lines grouped by `kitContentId`, aggregated `totalQuantityToPick`, `openQuantityToPick`
  - Writes / cleanup: UI regroups lines after query cache update
  - Guards: Cache update triggers re-grouping via `useMemo` in component
  - Invariant: Group quantities match sum of individual line quantities
  - Evidence: `src/types/pick-lists.ts:170-216` shows `groupPickListLines`

- Derived value: Availability shortfall per line
  - Source: `line.quantityToPick - inStockQuantity` if positive
  - Writes / cleanup: Changing quantity updates shortfall display; availability query invalidation refreshes stock
  - Guards: Shortfall only shown for open lines
  - Invariant: Shortfall visibility depends on `availabilityEnabled && inStockQuantity !== null && line.status === 'open'`
  - Evidence: `src/components/pick-lists/pick-list-lines.tsx:319-333` computes shortfall

---

## 7) State Consistency & Async Coordination

- Source of truth: React Query cache for pick list detail (`KitPickListDetailSchema_b247181`)
  - Coordination: Mutation uses optimistic update → backend response → cache invalidation
  - Async safeguards: `cancelQueries` before optimistic update, `onSettled` invalidates to refetch, rollback on error
  - Instrumentation: `ui_state` events with scope `pickLists.detail.quantityEdit`, phases: loading, ready, error, aborted
  - Evidence: `src/hooks/use-pick-list-execution.ts:313-390` demonstrates coordination pattern

- Source of truth: Availability queries keyed by part key
  - Coordination: Invalidate after quantity mutation to refresh stock counts (quantity change doesn't affect stock but user might need fresh data)
  - Async safeguards: Invalidation is asynchronous; UI shows stale availability briefly until refetch completes
  - Instrumentation: Availability loading instrumentation already exists (`pickLists.detail.availability`)
  - Evidence: `src/hooks/use-pick-list-execution.ts:361` invalidates availability queries

- Source of truth: Local component state for edit mode
  - Coordination: `editingLineId` and `editQuantity` scoped to PickListLines component, cleared on save/cancel
  - Async safeguards: Mutation in flight disables input and buttons; `isPending` from mutation hook guards UI
  - Instrumentation: Edit mode state doesn't emit events; mutation lifecycle events cover observable behavior
  - Evidence: `src/components/parts/part-location-grid.tsx:28-29` manages local edit state

---

## 8) Errors & Edge Cases

- Failure: Invalid quantity (negative or non-integer)
  - Surface: Input field validation, disabled Save button
  - Handling: Save button remains disabled if `quantity < 0` or `isNaN(quantity)`
  - Guardrails: HTML5 `type="number" min="0"` provides basic UI validation; mutation hook guards against invalid values
  - Evidence: `src/components/parts/part-location-grid.tsx:414-422` shows validation pattern

- Failure: Backend validation error (400)
  - Surface: Mutation error handler in hook
  - Handling: Rollback optimistic update, emit error event, show toast, retain edit mode
  - Guardrails: Global error handler extracts message from ApiError, instrumentation captures correlationId
  - Evidence: `src/hooks/use-pick-list-execution.ts:365-384` handles mutation errors

- Failure: Pick list or line not found (404)
  - Surface: Mutation error handler
  - Handling: Same as 400 — rollback, error event, toast
  - Guardrails: Component should never show edit UI for non-existent lines (data comes from query)
  - Evidence: API error handling propagates 404 through global handler

- Failure: Conflict (409) — concurrent modification
  - Surface: Mutation error handler
  - Handling: Rollback optimistic update, show conflict toast with retry suggestion, invalidate query to fetch latest
  - Guardrails: Instrumentation metadata includes `isConflict` flag for test assertions
  - Evidence: `src/lib/test/query-instrumentation.ts` tags conflict errors

- Edge case: Setting quantity to 0
  - Surface: Input accepts 0, backend interprets as "skip this line"
  - Handling: Allow save, backend updates line as skipped (status remains open, quantity 0)
  - Guardrails: No special UI treatment; shortfall computation handles 0 correctly
  - Evidence: OpenAPI schema allows `quantity_to_pick >= 0`

- Edge case: Editing while pick/undo in flight
  - Surface: Edit button and quantity text
  - Handling: Disable clickable quantity and Edit button when `executionPending` is true
  - Guardrails: Component already receives `executionPending` prop from parent (`pick-list-detail.tsx:434`), applies to all interactive elements
  - Evidence: `src/components/pick-lists/pick-list-lines.tsx:48` declares prop, `:182` computes `isLineExecuting`, `:183` uses for `disablePick`
  - Prop threading verified: `pick-list-detail.tsx:315` passes `isExecutionPending` as `executionPending` prop to `PickListLines`

- Edge case: Completed line cannot be edited
  - Surface: Edit button and clickable quantity
  - Handling: Hide or disable edit triggers for `line.status === 'completed'`
  - Guardrails: Backend would reject edit on completed line (business rule)
  - Evidence: `src/components/pick-lists/pick-list-lines.tsx:183` computes `disablePick` based on status

---

## 9) Observability / Instrumentation

- Signal: `ui_state` event for quantity edit lifecycle
  - Type: Instrumentation event (`kind: 'ui_state'`)
  - Trigger: On mutation start (loading), success (ready), error (error), cancellation (aborted)
  - Labels / fields: `{ scope: 'pickLists.detail.quantityEdit', phase: 'loading' | 'ready' | 'error' | 'aborted', metadata: { pickListId, lineId, action: 'updateQuantity', oldQuantity?, newQuantity?, ... } }`
  - Consumer: Playwright `waitForUiState(page, 'pickLists.detail.quantityEdit', 'ready')`
  - Evidence: `src/lib/test/ui-state.ts` and `src/hooks/use-pick-list-execution.ts:290-294`

- Signal: `data-testid` attributes for input and buttons
  - Type: DOM attribute for Playwright selectors
  - Trigger: Rendered when edit mode active
  - Labels / fields: `data-testid="pick-lists.detail.line.{lineId}.quantity-input"`, `pick-lists.detail.line.{lineId}.quantity-save`, `pick-lists.detail.line.{lineId}.quantity-cancel`, `pick-lists.detail.line.{lineId}.quantity-edit` (edit button/clickable)
  - Consumer: Playwright locators in page object
  - Evidence: `src/components/parts/part-location-grid.tsx:412-440` shows testid pattern

- Signal: Console error on unexpected mutation failure
  - Type: Console log (global error handler)
  - Trigger: Mutation error not handled by custom logic
  - Labels / fields: Error message, correlation ID, stack trace
  - Consumer: Playwright console error policy (`expectConsoleError`)
  - Evidence: `docs/contribute/testing/playwright_developer_guide.md:119-126` documents console policy

---

## 10) Lifecycle & Background Work

- Hook / effect: Mutation state cleanup on unmount
  - Trigger cadence: On component unmount
  - Responsibilities: TanStack Mutation handles cleanup automatically; no manual abort needed
  - Cleanup: React Query cleans up mutation observers when component unmounts
  - Evidence: TanStack Query mutation lifecycle

- Hook / effect: Edit mode reset on line prop change
  - Trigger cadence: When `editingLineId` points to a line that no longer exists (e.g., after deletion or status change)
  - Responsibilities: Component should reset `editingLineId` to null if edited line disappears
  - Cleanup: `useEffect` watching `lines` array to detect edited line removal
  - Evidence: Defensive pattern to avoid stale edit state

- Hook / effect: Query invalidation after mutation success
  - Trigger cadence: On mutation `onSuccess` callback
  - Responsibilities: Invalidate pick list detail, availability, kit memberships, kit detail, kit overview
  - Cleanup: TanStack Query manages refetch lifecycle
  - Evidence: `src/hooks/use-pick-list-execution.ts:358-361` shows invalidation chain

---

## 11) Security & Permissions

Not applicable. No new authorization concerns — pick list editing permissions follow existing backend rules. Users who can view pick lists can edit line quantities (backend enforces business rules like preventing edits on completed lines).

---

## 12) UX / UI Impact

- Entry point: Pick list detail page (`/pick-lists/{id}`)
  - Change: Quantity column in lines table becomes interactive (clickable text or Edit button)
  - User interaction: Click quantity → inline input appears → edit value → Save/Cancel
  - Dependencies: Existing pick list detail layout, table structure remains unchanged
  - Evidence: `src/components/pick-lists/pick-list-lines.tsx:143-272` defines table structure

- Entry point: Pick list line table row
  - Change: Row expands to edit mode showing input, Save, Cancel (similar to part location inline edit)
  - User interaction: Keyboard shortcuts (Enter/Escape) provide efficient editing workflow
  - Dependencies: Consistent with part location edit pattern for familiarity
  - Evidence: `src/components/parts/part-location-grid.tsx:387-459` shows inline edit layout

- Entry point: Validation feedback
  - Change: Save button disabled when quantity invalid, no separate error messages (HTML5 validation prevents invalid input)
  - User interaction: Input shows browser validation (non-negative integer)
  - Dependencies: Standard HTML5 input validation
  - Evidence: `src/components/parts/part-location-grid.tsx:414-422`

---

## 13) Deterministic Test Plan

- Surface: Pick list line quantity inline editing
  - Scenarios:
    - Given an open pick list with lines, When user clicks a line's quantity, Then edit mode activates showing input and buttons
    - Given edit mode active, When user enters new valid quantity and clicks Save, Then mutation succeeds, UI updates, and `ui_state` ready event fires
    - Given edit mode active, When user presses Enter in input, Then same behavior as clicking Save
    - Given edit mode active, When user clicks Cancel or presses Escape, Then edit mode exits without mutation
    - Given pick list with quantity 5, When user changes to 10, Then availability shortfall recalculates if needed
    - Given pick list line, When user sets quantity to 0, Then line accepts 0 and backend marks as skipped
    - Given completed pick list line, When page loads, Then quantity is not editable (no Edit button or clickable text)
    - Given pick/undo in flight, When page renders, Then quantity edit is disabled
  - Instrumentation / hooks: `data-testid="pick-lists.detail.line.{lineId}.quantity-edit"` for clickable trigger, `pick-lists.detail.line.{lineId}.quantity-input`, `pick-lists.detail.line.{lineId}.quantity-save`, `pick-lists.detail.line.{lineId}.quantity-cancel`, `waitForUiState(page, 'pickLists.detail.quantityEdit', 'ready')`
  - Gaps: None — all scenarios testable with real backend
  - Evidence: `tests/e2e/pick-lists/pick-list-detail.spec.ts` provides spec structure

- Surface: Backend quantity update endpoint
  - Scenarios:
    - Given valid PATCH request, When backend processes, Then returns updated pick list detail with recomputed metrics
    - Given invalid quantity (<0), When backend validates, Then returns 400 error
    - Given non-existent line ID, When backend looks up, Then returns 404 error
  - Instrumentation / hooks: API client captures response, `ui_state` error event on failure
  - Gaps: None — backend coordination via API factory
  - Evidence: `tests/api/factories/kits.ts` demonstrates pick list factory pattern

---

## 14) Implementation Slices

- Slice: Generate API hook and create types helper
  - Goal: Foundation for mutation and optimistic update
  - Touches: OpenAPI schema → generate hooks, `src/types/pick-lists.ts` add `applyPickListLineQuantityPatch`
  - Dependencies: Run `pnpm generate:api` first

- Slice: Implement `usePickListLineQuantityUpdate` hook
  - Goal: Mutation logic with optimistic updates, cache invalidation, instrumentation
  - Touches: `src/hooks/use-pick-list-line-quantity-update.ts` (new file)
  - Dependencies: Generated hook, types helper from slice 1

- Slice: Add inline edit UI to PickListLines component
  - Goal: Interactive quantity field with Save/Cancel buttons
  - Touches: `src/components/pick-lists/pick-list-lines.tsx`
  - Dependencies: Mutation hook from slice 2

- Slice: Add Playwright test coverage
  - Goal: Deterministic scenarios for edit workflow
  - Touches: `tests/e2e/pick-lists/pick-list-detail.spec.ts`, `tests/support/page-objects/pick-lists-page.ts`
  - Dependencies: UI implementation from slice 3, instrumentation emits events

---

## 15) Risks & Open Questions

- Risk: Optimistic update metrics recomputation incorrect
  - Impact: UI shows wrong totals/remaining until backend response corrects
  - Mitigation: Reuse existing `computePickListDetailMetrics` helper, add unit tests for edge cases (0 quantity, all lines completed)

- Risk: Concurrent edits by multiple users cause conflicts
  - Impact: Last-write-wins, user sees unexpected quantity after save
  - Mitigation: Backend should detect version conflicts (409), UI shows conflict toast and refreshes; document expected behavior (no locking)

- Risk: User edits quantity while availability is stale
  - Impact: Shortfall calculation based on outdated stock counts
  - Mitigation: Invalidate availability queries after mutation to refresh; shortfall is advisory only (doesn't block save)

- Risk: Keyboard shortcuts conflict with browser or accessibility tools
  - Impact: Enter/Escape may not work in all contexts
  - Mitigation: Scope event handlers to input field, test with keyboard navigation

- Risk: Zero quantity edge case misunderstood by users
  - Impact: Users expect line deletion but line remains with 0 quantity
  - Mitigation: Backend handles 0 as "skip"; consider adding tooltip or help text if confusion arises in usage

---

## 16) Confidence

Confidence: High — The change replicates an existing well-tested pattern (part location editing), the backend endpoint is already implemented, and the codebase provides strong scaffolding (optimistic updates, instrumentation, query invalidation). The primary complexity is ensuring metric recomputation correctness, which is mitigated by reusing existing helpers.

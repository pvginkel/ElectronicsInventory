# Plan: Update Stock Dialog Improvements

## 0) Research Log & Findings

**Discovery work performed:**
- Examined `src/components/shopping-lists/ready/update-stock-dialog.tsx` (850 lines) which contains the main dialog implementation with existing button logic, allocation management, and form instrumentation
- Reviewed `src/components/parts/part-inline-summary.tsx` which demonstrates the pattern for displaying part cover images using `CoverImageDisplay` component
- Examined `src/components/documents/cover-image-display.tsx` to understand cover image rendering, which accepts `partId`, `hasCoverAttachment`, `size`, `className`, and `showPlaceholder` props
- Reviewed `src/types/shopping-lists.ts` to understand `ShoppingListConceptLine` structure which includes `part: ShoppingListPartSummary` with fields `id`, `key`, `description`, `manufacturerCode`
- Examined `tests/support/page-objects/shopping-lists-page.ts` to identify existing test helpers for Update Stock dialog
- Reviewed `tests/e2e/shopping-lists/*.spec.ts` to understand current test coverage
- Confirmed instrumentation patterns via `src/hooks/use-form-instrumentation.ts` and `useFormInstrumentation` usage in the dialog

**Key findings:**
- The dialog already has comprehensive form instrumentation (`ShoppingListLineReceive` and `ShoppingListLineComplete` forms)
- Current button structure: "Cancel" and "Save Stock" on left, "Save & Next" in middle, "Complete Item" on right
- "Complete Item" button currently only marks the line as done without saving allocation data
- The part card section (lines 546-577) displays part information but lacks cover image
- `PartInlineSummary` component can optionally include cover images with `showCoverImage` prop (defaults to true)
- The `ShoppingListPartSummary` type includes `id` (numeric primary key) which can be used for cover image lookups
- No conflicts identified with existing patterns or instrumentation

---

## 1) Intent & Scope

**User intent**

Simplify the UX of receiving shopping list line stock by consolidating button actions, clarifying workflow, and adding visual context through part cover images. The changes address workflow friction where users must save, close, reopen, and complete items in separate steps.

**Prompt quotes**

From the change brief:
- "To receive stock and complete an item, users must: Enter the quantity received, Click 'Save Stock' (which exits the dialog), Re-open the dialog, Click 'Complete Item'"
- "The 'Complete Item' button doesn't save location/quantity data the user entered before completing"
- "'Save Stock' is positioned next to 'Cancel', but logically it's an alternative to 'Complete Item'"
- "The part card in the dialog doesn't show the cover image, unlike the PartInlineSummary component used elsewhere"

**In scope**

- Modify "Complete Item" button behavior to save allocation data before completing the line (merge save + complete operations)
- Rename "Save Stock" button to "Save Item" to clarify its purpose as a save-only action
- Remove "Save & Next" button entirely from the dialog
- Reposition buttons so action buttons ("Save Item" and "Complete Item") are grouped together, separate from "Cancel"
- Add cover image display to the part card section of the dialog
- Update form instrumentation metadata to reflect button behavior changes (remove `saveAndNext` mode tracking)
- Update Playwright test selectors and scenarios to match new button structure
- Ensure all changes maintain existing form validation, error handling, and loading states

**Out of scope**

- Changes to allocation validation logic or table structure
- Changes to the completion mismatch reason dialog (secondary dialog)
- Backend API contract modifications (existing endpoints already support saving allocations during completion)
- Changes to other shopping list dialogs or forms
- Navigation behavior after save/complete actions (keep current close-on-success pattern)

**Assumptions / constraints**

- Backend `/api/shopping-lists/:listId/lines/:lineId/receive` endpoint already supports the allocation payload required for "Complete Item" to save data
- Backend `/api/shopping-lists/:listId/lines/:lineId/complete` endpoint accepts `mismatchReason` and can be called after receive operations
- The `ShoppingListConceptLine.part` object includes a numeric `id` field suitable for `CoverImageDisplay` component
- Parts may or may not have cover attachments; the UI must handle both cases gracefully
- Button repositioning must work responsively on mobile and desktop layouts
- Form instrumentation consumers (Playwright tests) can adapt to renamed/removed button test IDs
- No feature flags; changes ship atomically

---

## 2) Affected Areas & File Map

### Component Changes

- Area: `src/components/shopping-lists/ready/update-stock-dialog.tsx`
- Why: Primary implementation file requiring button behavior, layout, instrumentation, and cover image changes
- Evidence: Lines 57-58 define `SubmitMode = 'save' | 'saveAndNext'`; lines 245-848 contain dialog implementation; lines 745-788 contain footer button layout; lines 546-577 contain part card without cover image

- Area: `src/components/documents/cover-image-display.tsx`
- Why: Provides the cover image rendering component to be added to the part card
- Evidence: Lines 8-14 define props including `partId`, `size`, `hasCoverAttachment`, `showPlaceholder`; component is already used in `PartInlineSummary`

### Type Changes

- Area: `src/components/shopping-lists/ready/update-stock-dialog.tsx` (type definitions)
- Why: Remove `saveAndNext` from `SubmitMode` union type
- Evidence: Line 57 `type SubmitMode = 'save' | 'saveAndNext';` needs update to `type SubmitMode = 'save' | 'complete';`

### Test Changes

- Area: `tests/support/page-objects/shopping-lists-page.ts`
- Why: Update page object helpers to match new button test IDs and remove obsolete selectors
- Evidence: Lines 26-27, 49-50 define `updateStockDialog` and `updateStockForm` locators; lines 488-543 contain helper methods for Update Stock dialog interactions including button clicks

- Area: `tests/e2e/shopping-lists/*.spec.ts` (potentially multiple files)
- Why: Update specs that interact with Update Stock dialog buttons
- Evidence: `tests/e2e/shopping-lists/shopping-lists.spec.ts` and related test files likely contain scenarios exercising receive/complete workflows

### Instrumentation Changes

- Area: `src/components/shopping-lists/ready/update-stock-dialog.tsx` (instrumentation tracking)
- Why: Update tracked metadata to reflect new submit modes and ensure test events align with UI behavior
- Evidence: Lines 292-298 track submit with `mode: submitModeRef.current`; lines 368-385 define form instrumentation with `snapshotFields` callback that includes mode

---

## 3) Data Model / Contracts

### Submit Mode Enumeration

- Entity / contract: `SubmitMode` type
- Shape:
  ```typescript
  // Before
  type SubmitMode = 'save' | 'saveAndNext';

  // After
  type SubmitMode = 'save' | 'complete' | 'complete-retry';
  ```
- Mapping:
  - `save` mode: Save allocations only without completing
  - `complete` mode: Save allocations + complete item (first attempt)
  - `complete-retry` mode: Complete item only (retry after partial failure where receive already succeeded)
- Evidence: `update-stock-dialog.tsx:57`

### Component Props (unchanged)

- Entity / contract: `UpdateStockDialogProps`
- Shape: No changes required; existing `onSubmit` and `onMarkDone` handlers support the required workflow
- Mapping: `onSubmit` saves allocation data; `onMarkDone` marks line as complete. The UI will call both sequentially for "Complete Item" action
- Evidence: `update-stock-dialog.tsx:59-73`

### Part Summary for Cover Display

- Entity / contract: `ShoppingListPartSummary` from `ShoppingListConceptLine.part`
- Shape:
  ```typescript
  interface ShoppingListPartSummary {
    id: number;        // Numeric primary key (NOT used for cover image)
    key: string;       // Part key string - USED for CoverImageDisplay partId
    description: string;
    manufacturerCode: string | null;
  }
  ```
- Mapping: `part.key` (string) will be passed as `partId` prop to `CoverImageDisplay`. This matches the pattern used in `PartInlineSummary` which passes `partKey` (string) to `CoverImageDisplay`. The `part.id` (number) is NOT used for cover image lookups. No `hasCoverAttachment` hint is available in `ShoppingListPartSummary`, so the component will query on-demand.
- Evidence: `src/types/shopping-lists.ts:111-117`, `src/components/parts/part-inline-summary.tsx:51`

### Form Instrumentation Metadata

- Entity / contract: Form event metadata in `snapshotFields` callback
- Shape:
  ```typescript
  // Current metadata includes mode field
  {
    listId: number | null;
    lineId: number | null;
    mode: 'save' | 'complete' | 'complete-retry';  // Updated from 'save' | 'saveAndNext'
    receiveQuantity: number;
    allocationCount: number;
  }
  ```
- Mapping: Update mode values in tracked events; Playwright specs will assert on this field to differentiate workflows:
  - `mode: 'save'` - user clicked "Save Item" (save only)
  - `mode: 'complete'` - user clicked "Complete Item" (first attempt, save + complete)
  - `mode: 'complete-retry'` - user clicked "Complete Item" after partial failure (complete only, no re-save)
- Evidence: `update-stock-dialog.tsx:371-384`

---

## 4) API / Integration Surface

### Existing Receive Endpoint (unchanged)

- Surface: `POST /api/shopping-lists/:listId/lines/:lineId/receive` (via `onSubmit` prop)
- Inputs: `{ mode: SubmitMode, receiveQuantity: number, allocations: ShoppingListLineReceiveAllocationInput[] }`
- Outputs: Updates line received quantity and part locations; invalidates shopping list query cache; closes dialog on success
- Errors: Handled by centralized error boundary and toast system; form instrumentation tracks errors via `trackError`
- Evidence: `update-stock-dialog.tsx:64-68, 272-324`

### Existing Complete Endpoint (unchanged)

- Surface: `POST /api/shopping-lists/:listId/lines/:lineId/complete` (via `onMarkDone` prop)
- Inputs: `{ mismatchReason: string | null }`
- Outputs: Marks line as done; invalidates shopping list query cache; closes dialog on success
- Errors: Handled by centralized error boundary and toast system; completion form instrumentation tracks errors via `trackError`
- Evidence: `update-stock-dialog.tsx:69, 450-522`

### Cover Image Query (new usage)

- Surface: `GET /api/parts/:partKey/cover` (via `useCoverAttachment` hook in `CoverImageDisplay`)
- Inputs: `partId` (part key as string), `hasCoverAttachment` optional hint
- Outputs: Cover attachment metadata; triggers image fetch if available; shows placeholder/error state if not
- Errors: Gracefully handled within `CoverImageDisplay`; shows placeholder or icon on error
- Evidence: `src/components/documents/cover-image-display.tsx:16-91`, `src/hooks/use-cover-image.ts:7-8`

---

## 5) Algorithms & UI Flows

### New "Complete Item" Flow

- Flow: User clicks "Complete Item" button to save allocations and mark line as done in one action
- Steps:
  1. User enters allocation data (box, location, receive quantities) in the table
  2. User clicks "Complete Item" button
  3. Set `submitModeRef.current = 'complete'`
  4. Track form submit event with `mode: 'complete'` (form lifecycle begins)
  5. Validate allocations (existing validation logic unchanged)
  6. If valid, call `onSubmit({ mode: 'complete', receiveQuantity, allocations })` to save allocations
  7. If receive fails, track form error event, show error toast, keep dialog open (form lifecycle ends with error)
  8. If receive succeeds, set `receiveSucceededRef.current = true` to track partial progress
  9. If received === ordered, call `onMarkDone({ mismatchReason: null })` directly
  10. If received !== ordered, open mismatch dialog for user to enter reason, then call `onMarkDone`
  11. If complete fails, show error toast, keep dialog open, user can retry (form lifecycle pauses)
  12. If complete succeeds, track form success event, dialog closes (form lifecycle ends with success)
- States / transitions: Button disabled when allocations invalid or `isReceiving`/`isCompleting` flags true; loading spinner shown during both operations; `isSubmitting` remains true until BOTH operations complete or fail
- Hotspots: Form instrumentation lifecycle wraps BOTH operations - `trackSubmit` at start, `trackSuccess` only after both succeed, `trackError` if either fails

**Retry Logic for Partial Failure:**
- Track `receiveSucceededRef.current` to know if receive already succeeded in this dialog session
- If "Complete Item" is clicked again after partial failure (receive succeeded, complete failed):
  1. Skip the receive API call (allocations already saved)
  2. Proceed directly to `onMarkDone` or mismatch dialog
  3. Track form submit with `mode: 'complete-retry'` for test differentiation
- Reset `receiveSucceededRef` when:
  - Dialog closes (success or cancel)
  - User modifies allocations (ensures fresh data submitted if user changes values)
- This ensures users don't re-submit allocations unnecessarily when retrying a failed completion

- Evidence: `update-stock-dialog.tsx:245-524, 777-787`

### Updated "Save Item" Flow (formerly "Save Stock")

- Flow: User clicks "Save Item" to save allocations without completing the line
- Steps:
  1. User enters allocation data
  2. User clicks "Save Item" button
  3. Set `submitModeRef.current = 'save'`
  4. Trigger form submission
  5. Validate allocations
  6. If valid, call `onSubmit({ mode: 'save', receiveQuantity, allocations })`
  7. Track form events
  8. On success, dialog closes
- States / transitions: Same validation and loading states as current "Save Stock" flow
- Hotspots: No change from current behavior other than button label and mode value
- Evidence: `update-stock-dialog.tsx:272-324, 756-765`

### Removed "Save & Next" Flow

- Flow: This button is removed entirely
- Steps: N/A
- States / transitions: Remove `hasNextLine` prop dependency from button disabling logic; remove associated test ID and click handler
- Hotspots: Ensure no orphaned code related to `saveAndNext` mode or navigation logic
- Evidence: `update-stock-dialog.tsx:62, 446-448, 766-775`

### Cover Image Display Integration

- Flow: Part cover image loads when dialog opens for a line with cover attachment
- Steps:
  1. Dialog opens with `line` prop containing `part.key`
  2. Render `CoverImageDisplay` component with `partId={line.part.key}` and `size="small"`
  3. `CoverImageDisplay` internally uses `useCoverAttachment` to query cover metadata
  4. If cover exists, fetch thumbnail URL and display; if PDF or error, show placeholder icon
  5. If no cover, component renders nothing (unless `showPlaceholder` is true)
- States / transitions: Loading skeleton while fetching cover metadata; graceful fallback to no image if cover absent or fetch fails
- Hotspots: Cover query is independent of dialog submission; avoid blocking form interactions on image load
- Evidence: `src/components/documents/cover-image-display.tsx:16-91`, `src/components/parts/part-inline-summary.tsx:49-54`

---

## 6) Derived State & Invariants

### Button Enabled State (existing logic, minor update)

- Derived value: `canSubmit`
- Source: Computed from `line` (truthy), `allocationValidation.isValid` (true), `allocationValidation.totalReceive > 0`, and `!isReceiving`
- Writes / cleanup: Controls disabled prop on both "Save Item" and "Complete Item" buttons; unchanged except "Save & Next" button removal
- Guards: `isReceiving` and `isCompleting` flags prevent concurrent submissions
- Invariant: Form cannot be submitted unless at least one valid allocation exists with positive receive quantity
- Evidence: `update-stock-dialog.tsx:332`

### Submit Mode Ref (updated)

- Derived value: `submitModeRef.current`
- Source: Set by button click handlers; determines whether submission saves only or saves + completes
- Writes / cleanup: Value passed to `onSubmit` handler and tracked in instrumentation metadata; reset to `'save'` when dialog opens
- Guards: Ref ensures mode persists across async submission flow; not reactive (no re-renders on change)
- Invariant: Must be set to valid `SubmitMode` value before form submission; defaults to `'save'` on dialog open
- Evidence: `update-stock-dialog.tsx:256, 341, 446-448`

### Allocation Validation Result (existing, unchanged)

- Derived value: `allocationValidation`
- Source: Computed via `useMemo` from `form.values.allocations` using `validateAllocations` function
- Writes / cleanup: Drives error display in allocation rows and summary error message; recalculates on any allocation change
- Guards: Validation prevents invalid API requests; `showAllocationErrors` flag controls when errors display to user
- Invariant: Validation result must reflect current allocation state; `totalReceive` must match sum of valid allocation quantities
- Evidence: `update-stock-dialog.tsx:327-330`

### Part Cover Image Availability (new derived state)

- Derived value: Whether part has a cover attachment
- Source: Implicitly determined by `CoverImageDisplay` via `useCoverAttachment` hook query
- Writes / cleanup: No writes; purely display logic; query cache managed by TanStack Query
- Guards: `CoverImageDisplay` handles missing covers gracefully by rendering nothing or placeholder
- Invariant: Cover display does not block dialog functionality; image fetch failures are silent
- Evidence: `src/components/documents/cover-image-display.tsx:42-60`

---

## 7) State Consistency & Async Coordination

### Form Submission Coordination

- Source of truth: `form.values.allocations` managed by `useFormState` hook
- Coordination: `submitModeRef` persists user intent across async submission; form instrumentation tracks lifecycle phases (submit, success, error)
- Async safeguards: `isReceiving` and `isCompleting` flags prevent overlapping API calls; `handleSubmit` only fires one concurrent submission
- Instrumentation: `formInstrumentation` emits `trackSubmit`, `trackSuccess`, `trackError` events consumed by Playwright; `completionInstrumentation` tracks completion dialog separately
- Evidence: `update-stock-dialog.tsx:268-325, 368-416`

### Sequential Save + Complete Flow

- Source of truth: "Complete Item" button triggers receive API call first, then complete API call
- Coordination: Use `try/catch` to ensure completion only runs if receive succeeds; handle partial failure (receive succeeds, complete fails) by keeping dialog open and showing error
- Async safeguards: Set `isCompleting` flag at start of complete operation; clear on success or error; form remains disabled during both operations
- Instrumentation: Track both receive form events and complete form events; tests can assert on event sequences
- Evidence: New logic to be added in `handleMarkDone` modification

### Cover Image Query Cache

- Source of truth: TanStack Query cache for `useCoverAttachment` hook
- Coordination: Independent from form submission; does not block or interact with allocation save/complete logic
- Async safeguards: `CoverImageDisplay` manages loading and error states internally; `dataUpdatedAt` triggers image reload on cache updates
- Instrumentation: No explicit instrumentation; covered by query error handling in `useListLoadingInstrumentation` (not applicable here since cover fetch is not list-scoped)
- Evidence: `src/components/documents/cover-image-display.tsx:23-40`

### Dialog Open/Close State

- Source of truth: `open` prop and `onClose` callback
- Coordination: Dialog resets form state and instrumentation on close; form submission success triggers `onClose` after backend sync
- Async safeguards: `useEffect` hook syncs `allocations` state when `open` or `line` props change; cleanup on unmount handled by React
- Instrumentation: `trackOpen` fired when dialog transitions to open state; `isOpen` prop drives instrumentation lifecycle
- Evidence: `update-stock-dialog.tsx:334-366, 418-425`

---

## 8) Errors & Edge Cases

### Allocation Validation Errors (existing, unchanged)

- Failure: User enters invalid or incomplete allocation data (missing box, negative quantity, duplicate locations)
- Surface: `update-stock-dialog.tsx` validation logic; inline error messages in allocation table rows and summary error
- Handling: Display red error text below inputs and summary message; disable submit buttons until resolved; form instrumentation tracks validation errors
- Guardrails: Client-side validation prevents invalid API requests; backend validates again and returns 4xx errors if needed
- Evidence: `update-stock-dialog.tsx:114-217, 280-286, 736-740`

### Receive API Failure During "Complete Item"

- Failure: Network error or backend rejection when saving allocations during "Complete Item" flow
- Surface: `onSubmit` handler throws error; caught by centralized error handler
- Handling: Display error toast; keep dialog open; track form error event; do NOT proceed to completion step
- Guardrails: `isReceiving` flag prevents duplicate submissions; user can correct data and retry
- Evidence: `update-stock-dialog.tsx:300-323`

### Complete API Failure After Successful Receive

- Failure: Receive succeeds but complete fails (e.g., concurrent modification, backend logic error)
- Surface: New error handling in "Complete Item" flow between receive success and complete API call
- Handling: Display error toast; keep dialog open; line remains in received state (allocations saved); user can retry completion or close dialog
- Guardrails: Track receive success event even if complete fails; backend state is consistent (allocations saved, line not completed)
- Evidence: New logic to be added

### Quantity Mismatch Completion

- Failure: User clicks "Complete Item" but received !== ordered
- Surface: `handleMarkDone` logic checks `line.received === line.ordered`
- Handling: Open secondary mismatch reason dialog; require user input before completing; existing flow unchanged
- Guardrails: Backend enforces mismatch reason requirement; validation in secondary dialog prevents empty reason submission
- Evidence: `update-stock-dialog.tsx:450-522, 792-846`

### Missing Cover Attachment

- Failure: Part does not have a cover attachment or cover fetch fails
- Surface: `CoverImageDisplay` component
- Handling: Render nothing (no placeholder by default); do not block dialog functionality; no error toast
- Guardrails: `hasCoverAttachment` prop hint can skip query if known; `isLoading` state prevents flicker
- Evidence: `src/components/documents/cover-image-display.tsx:42-60`

### Empty Allocation Set

- Failure: User attempts to submit without entering any allocations
- Surface: Validation checks `positiveEntries === 0`
- Handling: Set validation error "Enter at least one Receive entry"; disable submit buttons; show summary error
- Guardrails: Existing validation logic prevents this; unchanged
- Evidence: `update-stock-dialog.tsx:204-207`

---

## 9) Observability / Instrumentation

### Receive Form Instrumentation (updated mode values)

- Signal: `form` test events with `formId: 'ShoppingListLineReceive:line:{lineId}'`
- Type: Instrumentation event via `useFormInstrumentation` hook
- Trigger: Emitted on dialog open, form submit, validation error, success, and error phases
- Labels / fields: `{ listId, lineId, mode, receiveQuantity, allocationCount }` where mode changes from `'save' | 'saveAndNext'` to `'save' | 'complete'`
- Consumer: Playwright specs assert on these events to verify form lifecycle; mode field used to differentiate flows
- Evidence: `update-stock-dialog.tsx:368-385, 292-312`

### Complete Form Instrumentation (existing, unchanged)

- Signal: `form` test events with `formId: 'ShoppingListLineComplete:line:{lineId}'`
- Type: Instrumentation event via separate `completionInstrumentation` hook
- Trigger: Emitted when completion dialog opens, user submits mismatch reason, validation errors occur, or completion succeeds/fails
- Labels / fields: `{ listId, lineId, mismatchReasonLength }`
- Consumer: Playwright specs assert on completion events independently of receive events
- Evidence: `update-stock-dialog.tsx:387-395, 455-521`

### List Loading Instrumentation (existing, unchanged)

- Signal: `list_loading` events with `scope: 'shoppingLists.receive.locations'`
- Type: List loading instrumentation via `useListLoadingInstrumentation` hook
- Trigger: Emitted when boxes query is loading, fetching, or ready; tracks allocation state at time of query readiness
- Labels / fields: `{ listId, lineId, allocationCount, receiveQuantity }`
- Consumer: Playwright specs can wait for locations list ready before interacting with box selectors
- Evidence: `update-stock-dialog.tsx:397-416`

### Data Test IDs (updates required)

- Signal: `data-testid` attributes on buttons and dialog elements
- Type: DOM attributes for Playwright selector targeting
- Trigger: Rendered in component markup
- Labels / fields:
  - Update `shopping-lists.ready.update-stock.submit` for "Save Item" button
  - Remove `shopping-lists.ready.update-stock.submit-next` for removed "Save & Next" button
  - Keep `shopping-lists.ready.update-stock.mark-done` for "Complete Item" button
- Consumer: Playwright page object methods target buttons by test ID
- Evidence: `update-stock-dialog.tsx:762, 772, 784`

---

## 10) Lifecycle & Background Work

### Dialog Open Effect (existing, minor update)

- Hook / effect: `useEffect` syncs form allocations when dialog opens or line changes
- Trigger cadence: On mount when `open` transitions to true, or when `line` prop changes while dialog is open
- Responsibilities: Reset form state, rebuild allocations from line data, clear error flags, reset submit mode to 'save'
- Cleanup: No explicit cleanup; state reset happens on next open
- Evidence: `update-stock-dialog.tsx:334-347`

### Dialog Close Effect (existing, unchanged)

- Hook / effect: `useEffect` restores focus to trigger element after dialog closes
- Trigger cadence: When `open` transitions to false
- Responsibilities: Call `restoreFocusElement.focus()` via `requestAnimationFrame` to return focus to line row button
- Cleanup: No cleanup needed; single-frame callback
- Evidence: `update-stock-dialog.tsx:349-358`

### Completion Dialog Cleanup Effect (existing, unchanged)

- Hook / effect: `useEffect` resets completion dialog state when main dialog closes
- Trigger cadence: When `open` transitions to false
- Responsibilities: Close mismatch reason dialog, clear mismatch reason input, clear mismatch error
- Cleanup: No cleanup needed; state reset synchronous
- Evidence: `update-stock-dialog.tsx:360-366`

### Form Instrumentation Lifecycle (existing, unchanged)

- Hook / effect: `useFormInstrumentation` tracks dialog open event via internal `useEffect`
- Trigger cadence: When `isOpen` prop transitions to true or `formId` changes
- Responsibilities: Emit `trackOpen` event for Playwright consumption
- Cleanup: Handled internally by hook; resets `lastIsOpenRef` when `isOpen` becomes false
- Evidence: `src/hooks/use-form-instrumentation.ts:92-104`

---

## 11) Security & Permissions (if applicable)

_No new security concerns introduced by this change. All API calls go through existing authenticated endpoints with existing permission checks. Cover image queries respect existing part visibility rules._

---

## 12) UX / UI Impact

### Button Behavior Changes

- Entry point: Update Stock dialog footer
- Change: "Complete Item" button now saves allocation data before completing; "Save Stock" renamed to "Save Item"; "Save & Next" removed
- User interaction: Users can complete an item in one click after entering allocations (no need to save, close, reopen, complete); save-only workflow still available via "Save Item" button
- Dependencies: No backend changes required; existing receive and complete endpoints support this workflow
- Evidence: `update-stock-dialog.tsx:745-788`

### Button Layout Changes

- Entry point: Dialog footer using `DialogFooter` with flex layout
- Change: Move "Save Item" button to be visually grouped with "Complete Item" button (right side of footer); "Cancel" remains on left
- User interaction: Action buttons are grouped together, making the relationship between save-only and save+complete clearer; cancel is visually separated as a non-action
- Dependencies: Responsive layout must work on mobile (buttons may stack vertically); use existing Tailwind utility classes
- Evidence: `update-stock-dialog.tsx:745-788`

### Part Card Cover Image Addition

- Entry point: Part information card at top of dialog (lines 546-577)
- Change: Add `CoverImageDisplay` component showing part cover image if available; use `size="small"` (64x64px)
- User interaction: Users can visually confirm they're receiving stock for the correct part; especially useful when parts have similar descriptions
- Dependencies: Part key is available from `line.part.key`; no backend changes required
- Evidence: `update-stock-dialog.tsx:546-577`, `src/components/parts/part-inline-summary.tsx:49-54`

### Dialog Layout Adjustment

- Entry point: Part card flex layout
- Change: Update part card to use flex row layout with cover image on left (if available) and text content on right, matching `PartInlineSummary` pattern
- User interaction: Consistent visual pattern with other part displays in the app (part selector, part cards, etc.)
- Dependencies: Ensure cover image does not cause layout shift or increase dialog height excessively
- Evidence: `src/components/parts/part-inline-summary.tsx:49-54`

---

## 13) Deterministic Test Plan

### New "Complete Item" Workflow

- Surface: Update Stock dialog, "Complete Item" button
- Scenarios:
  - Given a shopping list line in ready state with allocations entered, When user clicks "Complete Item" button, Then receive API is called with allocations, Then complete API is called, Then dialog closes, Then line status is "done"
  - Given allocations entered with received === ordered, When user clicks "Complete Item", Then no mismatch dialog shown, Then line completed directly
  - Given allocations entered with received !== ordered, When user clicks "Complete Item", Then mismatch reason dialog opens, Then user must enter reason, Then line completed after reason submission
  - Given invalid allocations, When user clicks "Complete Item", Then validation errors shown, Then submit prevented
  - Given receive API call fails during "Complete Item", When error occurs, Then error toast shown, Then dialog remains open, Then complete API not called, Then user can retry
  - Given receive succeeded but complete failed (partial failure), When user clicks "Complete Item" again, Then receive API NOT called again (skipped), Then only complete API called, Then line marked as done, Then dialog closes
  - Given partial failure occurred and user modifies allocations, When user clicks "Complete Item", Then receive API called with updated allocations (fresh submission), Then complete API called after receive succeeds
- Instrumentation / hooks:
  - Wait for `form` event with `formId: 'ShoppingListLineReceive:line:{lineId}'`, `phase: 'submit'`, `mode: 'complete'`
  - Wait for `form` event with `phase: 'success'`, `mode: 'complete'`
  - Assert receive API called with correct allocations payload
  - If mismatch dialog opens, wait for `form` event with `formId: 'ShoppingListLineComplete:line:{lineId}'`
  - For retry scenario: wait for `form` event with `mode: 'complete-retry'` (indicates receive was skipped)
  - Backend helper to verify line status changed to `done` after completion
- Gaps: None; full coverage required for new behavior including retry scenarios
- Evidence: New scenarios to be added to `tests/e2e/shopping-lists/*.spec.ts`

### Updated "Save Item" Button

- Surface: Update Stock dialog, "Save Item" button (formerly "Save Stock")
- Scenarios:
  - Given allocations entered, When user clicks "Save Item", Then receive API called with mode 'save', Then dialog closes, Then line status remains "ordered" (not completed)
- Instrumentation / hooks:
  - Wait for `form` event with `mode: 'save'`, `phase: 'submit'` and `phase: 'success'`
  - Assert button has updated label "Save Item"
  - Backend helper to verify line status NOT changed to done
- Gaps: None; modify existing save workflow tests
- Evidence: Update existing test scenarios in `tests/e2e/shopping-lists/*.spec.ts`

### Removed "Save & Next" Button

- Surface: Update Stock dialog footer
- Scenarios:
  - Given dialog open, When inspecting footer, Then "Save & Next" button not present
  - Given existing tests using `shopping-lists.ready.update-stock.submit-next` selector, When tests run, Then update selectors or remove tests
- Instrumentation / hooks:
  - Remove any test scenarios relying on `saveAndNext` mode or `hasNextLine` prop behavior
  - Ensure no test attempts to click removed button
- Gaps: None; removal is straightforward
- Evidence: Update `tests/support/page-objects/shopping-lists-page.ts` to remove obsolete helpers

### Cover Image Display

- Surface: Part card in Update Stock dialog
- Scenarios:
  - Given a part with cover attachment, When dialog opens, Then cover image displayed at small size (64x64px) on left side of part card
  - Given a part without cover attachment, When dialog opens, Then no cover image shown (no placeholder), Then part card still displays text information
  - Given a part with PDF cover, When dialog opens, Then PDF icon placeholder shown instead of image
  - Given cover fetch fails, When dialog opens, Then error state handled gracefully, Then part card still functional
- Instrumentation / hooks:
  - Use `data-testid` on part card section to locate cover image element
  - Assert cover image `src` attribute points to correct part key URL
  - Assert part card layout matches expected flex structure
- Gaps: Detailed cover loading state assertions may be deferred; focus on happy path (cover present vs absent)
- Evidence: Add scenarios to existing update stock dialog tests or new dedicated spec

### Button Layout Verification

- Surface: Dialog footer button arrangement
- Scenarios:
  - Given dialog open on desktop, When inspecting footer, Then "Cancel" button on left, Then "Save Item" and "Complete Item" buttons grouped on right
  - Given dialog open on mobile, When inspecting footer, Then buttons stack responsively, Then action buttons remain grouped
- Instrumentation / hooks:
  - Use visual regression or layout assertions to verify button positions
  - Assert button `data-testid` attributes present and unique
- Gaps: Visual regression testing may be manual; automated tests verify DOM structure only
- Evidence: Add layout verification to dialog open tests

---

## 14) Implementation Slices

This is a small focused change that can be implemented in a single slice:

### Slice 1: Complete Dialog Improvements

- Goal: Ship all button behavior, layout, cover image, and test updates together in one atomic change
- Touches:
  - `src/components/shopping-lists/ready/update-stock-dialog.tsx` (primary implementation)
  - `tests/support/page-objects/shopping-lists-page.ts` (update helpers and selectors)
  - `tests/e2e/shopping-lists/*.spec.ts` (update/add test scenarios)
- Dependencies: None; all changes are self-contained; no backend or feature flag coordination required

---

## 15) Risks & Open Questions

### Risks

- Risk: Sequential receive + complete API calls may introduce latency or partial failure states
- Impact: User experiences delay between clicking "Complete Item" and dialog closing; if complete fails after receive succeeds, line is in received state but not completed (requires retry)
- Mitigation: Add loading spinner and disable buttons during both operations; handle errors gracefully with toast message; ensure form instrumentation tracks both operations independently so failures are observable

- Risk: Cover image fetch may be slow or fail, causing perceived UI latency
- Impact: Dialog shows loading skeleton for cover, potentially delaying user perception of "ready to interact"
- Mitigation: Cover image loads asynchronously and does not block form interactions; use small thumbnail size to minimize fetch time; `CoverImageDisplay` handles loading and error states internally

- Risk: Removing "Save & Next" button may disrupt workflows for users processing many lines sequentially
- Impact: Users must manually reopen the next line after completing/saving each one
- Mitigation: Per brief requirements, this removal is intentional; monitor user feedback post-launch; potential future enhancement to add keyboard shortcuts or auto-advance option

- Risk: Button layout changes may not render well on small mobile screens
- Impact: Buttons may overlap or be hard to tap on narrow viewports
- Mitigation: Use existing responsive Tailwind classes; test on mobile viewport sizes; `DialogFooter` component already handles responsive stacking

- Risk: Test instrumentation mode value changes may cause Playwright specs to fail if not updated comprehensively
- Impact: CI failures on merge due to mismatched event assertions
- Mitigation: Update all test scenarios referencing `mode` field in form events before merging; run full Playwright suite locally to catch failures

### Open Questions

_No open questions; the brief specifies exact requirements and existing patterns provide clear implementation guidance._

---

## 16) Confidence

Confidence: High — All changes follow established patterns in the codebase; button behavior modifications are straightforward; cover image integration uses existing `CoverImageDisplay` component with proven reliability; comprehensive test plan ensures regressions are caught before merge; no backend dependencies or feature flags required.

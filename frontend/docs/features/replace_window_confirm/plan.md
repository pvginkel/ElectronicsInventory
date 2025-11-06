# Replace window.confirm with ConfirmDialog — Implementation Plan

## 0) Research Log & Findings

**Research conducted:**
- Examined existing `useConfirm` hook pattern in `src/hooks/use-confirm.ts` (lines 1-65)
- Reviewed `ConfirmDialog` component implementation in `src/components/ui/dialog.tsx` (lines 181-215)
- Analyzed reference implementations:
  - `src/components/boxes/box-details.tsx` (lines 208-217) — direct `useConfirm` usage with async/await
  - `src/components/shopping-lists/list-delete-confirm.tsx` (lines 1-143) — wrapped pattern with custom hook
- Located current `window.confirm` usage in `src/components/kits/kit-detail.tsx` (lines 315-317)
- Found `DropdownMenuItem` cursor styling in `src/components/ui/dropdown-menu.tsx` (line 91)
- Reviewed existing kit deletion test in `tests/e2e/kits/kit-detail.spec.ts` (lines 1292-1364) — test already handles dialog interactions via `page.once('dialog')` listener
- Verified instrumentation constants: `DELETE_FORM_ID = 'KitLifecycle:delete'` (line 53)

**Key findings:**
1. The box-details pattern (direct `useConfirm` call) is simpler and more appropriate for this single-use case than the shopping-lists pattern (custom wrapping hook)
2. Existing Playwright test expects a native `window.confirm` dialog and uses `page.once('dialog')` to handle it
3. After migration, the test will need to use the standard dialog role selector instead of the dialog event listener
4. The `DropdownMenuItem` cursor change affects all dropdown menu items app-wide, improving consistency
5. All instrumentation is already in place; no changes needed to `DELETE_FORM_ID` or tracking calls

## 1) Intent & Scope

**User intent**

Replace the browser-native `window.confirm` dialog used for kit deletion with the app's styled `ConfirmDialog` component, matching the patterns used for box deletion and shopping list operations. Additionally, fix the cursor styling on dropdown menu items to properly indicate interactivity.

**Prompt quotes**

"Replace `window.confirm()` with the `useConfirm` hook and `ConfirmDialog` component, matching the pattern used in `src/components/boxes/box-details.tsx` (lines 208-217)"

"Change DropdownMenuItem cursor from `cursor-default` to `cursor-pointer` to indicate interactivity"

"Existing Playwright tests continue to pass"

**In scope**

- Replace `window.confirm` call in `src/components/kits/kit-detail.tsx` (line 315) with `useConfirm` hook
- Add `ConfirmDialog` component rendering in `KitDetail` component
- Update cursor styling in `src/components/ui/dropdown-menu.tsx` from `cursor-default` to `cursor-pointer`
- Update Playwright test in `tests/e2e/kits/kit-detail.spec.ts` to select the dialog by role instead of listening to native dialog events

**Out of scope**

- Changing instrumentation events or form IDs (already correct)
- Modifying other components that use `window.confirm`
- Adding new test coverage beyond updating existing deletion test
- Backend changes (none required)

**Assumptions / constraints**

- The `useConfirm` hook and `ConfirmDialog` component are stable and battle-tested
- The dialog pattern follows the box-details reference implementation (direct hook usage, not wrapped)
- The test change is straightforward: replace `page.once('dialog')` with `page.getByRole('dialog')` selector
- The cursor styling change is a cosmetic improvement with no functional impact

## 2) Affected Areas & File Map

- Area: `src/components/kits/kit-detail.tsx`
- Why: Must replace `window.confirm` with `useConfirm` hook and render `ConfirmDialog` at the end of the component's return statement (after line 517, before the closing `</div>` tag), following the box-details pattern where `<ConfirmDialog {...confirmProps} />` is rendered at component root level outside the main layout
- Evidence: `src/components/kits/kit-detail.tsx:315-317` — `const confirmed = window.confirm(...)`; `src/components/boxes/box-details.tsx:446` — dialog rendering location pattern

- Area: `src/components/ui/dropdown-menu.tsx`
- Why: Must change cursor styling from `cursor-default` to `cursor-pointer` for enabled items while preserving `cursor-default` for disabled items to maintain accessibility (disabled items should not indicate interactivity)
- Evidence: `src/components/ui/dropdown-menu.tsx:91` — `'relative flex cursor-default select-none items-center...'`; line 93 shows `data-[disabled]:pointer-events-none` rule that prevents clicks but doesn't override cursor

- Area: `tests/e2e/kits/kit-detail.spec.ts`
- Why: Must update deletion test to use role selector instead of native dialog event listener
- Evidence: `tests/e2e/kits/kit-detail.spec.ts:1330-1337` — `page.once('dialog', async dialog => { ... await dialog.accept(); })`

## 3) Data Model / Contracts

**No data model changes required.**

The `window.confirm` API returns a boolean synchronously (user blocks thread), while `useConfirm` returns a `Promise<boolean>`. The existing `handleDeleteClick` function is already `async`, so the migration is seamless.

- Entity / contract: `useConfirm` hook return value
- Shape: `{ confirm: (options: ConfirmOptions) => Promise<boolean>, confirmProps: {...} }`
- Mapping: `window.confirm(message)` → `await confirm({ title, description, confirmText, destructive })`
- Evidence: `src/hooks/use-confirm.ts:16-64` — hook implementation

## 4) API / Integration Surface

**No API changes required.**

The delete mutation (`useDeleteKitsByKitId`) and its instrumentation (`trackFormSubmit`, `trackFormSuccess`, `trackFormError`) remain unchanged. The only difference is the confirmation mechanism before calling the mutation.

- Surface: Existing `deleteKitMutation.mutate` call
- Inputs: `{ path: { kit_id: detail.id } }`
- Outputs: Success triggers navigation to `/kits`, error shows toast
- Errors: Already handled by `onError` callback in mutation setup
- Evidence: `src/components/kits/kit-detail.tsx:202-238` — mutation configuration

## 5) Algorithms & UI Flows

- Flow: Kit deletion confirmation flow
- Steps:
  1. User clicks "Delete Kit" menu item in ellipsis menu
  2. `handleDeleteClick` is invoked
  3. Guard checks ensure kit is loaded and no mutations are pending
  4. `confirm` function is called with `title: 'Delete Kit'`, `description`, `confirmText: 'Delete'`, and `destructive: true`
  5. `ConfirmDialog` opens (rendered at line 518 after existing dialogs) and waits for user input
  6. If user clicks "Cancel" or closes dialog (backdrop click or Escape key), `confirm` returns `false` and flow ends
  7. If user clicks "Delete", `confirm` returns `true`
  8. `trackFormSubmit` fires with `DELETE_FORM_ID`
  9. `deleteKitMutation.mutate` is called
  10. On success: `trackFormSuccess`, toast, navigation to `/kits`
  11. On error: `trackFormError`, toast with error message
- States / transitions: Dialog open → confirmed/cancelled → mutation pending → success/error
- Hotspots: None; this is a low-frequency destructive operation with simple control flow
- JSX rendering: Add `<ConfirmDialog {...confirmProps} />` at line 518, after all existing dialogs but before the closing `</div>` tag
- Evidence: `src/components/kits/kit-detail.tsx:311-323` — current implementation; `src/components/boxes/box-details.tsx:446` — dialog rendering pattern

## 6) Derived State & Invariants

**No derived state changes.**

- Derived value: Delete button enabled state
  - Source: `!detail || archiveMutation.isPending || unarchiveMutation.isPending || deleteKitMutation.isPending`
  - Writes / cleanup: N/A (read-only guard)
  - Guards: Prevents concurrent mutations and ensures kit is loaded
  - Invariant: User cannot trigger deletion while kit is loading or other lifecycle mutations are in flight
  - Evidence: `src/components/kits/kit-detail.tsx:312` — guard in `handleDeleteClick`

## 7) State Consistency & Async Coordination

- Source of truth: Local component state for dialog visibility (managed by `useConfirm` hook)
- Coordination: Dialog state is isolated within `useConfirm` hook; no cross-component synchronization needed
- Async safeguards: The `await confirm(...)` call suspends until user responds; mutation guards prevent concurrent operations
- Instrumentation: Existing `DELETE_FORM_ID` instrumentation remains unchanged; test can continue to rely on `trackFormSubmit` / `trackFormSuccess` events
- Evidence: `src/hooks/use-confirm.ts:26-34` — promise-based confirmation flow

## 8) Errors & Edge Cases

**No new error cases introduced.**

- Failure: User dismisses dialog by clicking backdrop or pressing Escape
- Surface: `KitDetail` component
- Handling: `confirm` returns `false`, `handleDeleteClick` returns early, no mutation is triggered
- Guardrails: Existing mutation guards remain in place; instrumentation events only fire if user confirms
- Evidence: `src/hooks/use-confirm.ts:46-50` — `handleOpenChange` treats closure as cancellation

## 9) Observability / Instrumentation

**No instrumentation changes required.**

- Signal: `DELETE_FORM_ID` form lifecycle events
- Type: Test instrumentation events (`form` kind)
- Trigger: `trackFormSubmit` fires when user confirms deletion, before mutation starts
- Labels / fields: `{ kitId: detail.id }`
- Consumer: Playwright test waits for `submit` and `success` events
- Evidence: `src/components/kits/kit-detail.tsx:321-322` — `trackFormSubmit(DELETE_FORM_ID, ...)`

## 10) Lifecycle & Background Work

**No lifecycle changes required.**

The `useConfirm` hook manages dialog state internally. No new effects, subscriptions, or cleanup logic is needed in the `KitDetail` component beyond rendering the `ConfirmDialog` once at the component root.

**Unmount behavior**: The `useConfirm` hook stores the promise resolver in component state (line 31 of use-confirm.ts) and clears it when the dialog closes (lines 38, 43). If the component unmounts while the dialog is open, the dialog portal will close automatically (Radix UI behavior) and the awaiting code will be interrupted by component cleanup. This is low-risk but should be verified during testing by navigating away mid-dialog to confirm no console errors or warnings appear.

## 11) Security & Permissions

**Not applicable.**

The deletion operation already enforces backend authorization. The confirmation mechanism (native vs. styled dialog) does not affect security posture.

## 12) UX / UI Impact

- Entry point: Ellipsis menu in kit detail header → "Delete Kit" menu item
- Change: Replaces browser-native `window.confirm` dialog with styled `ConfirmDialog` component
- User interaction:
  - Dialog appears centered on screen with backdrop overlay
  - Title: "Delete Kit"
  - Description: `Are you sure you want to delete "{detail.name}"? This action cannot be undone and will only succeed if the kit has no dependencies.`
  - Confirm button labeled "Delete" with destructive (red) styling
  - Cancel button labeled "Cancel" with default styling
  - User can dismiss by clicking Cancel, the backdrop, or pressing Escape
- Dependencies: `useConfirm` hook and `ConfirmDialog` component from existing UI library
- Evidence: `src/components/boxes/box-details.tsx:208-217` — reference implementation pattern

- Entry point: All dropdown menu items (app-wide)
- Change: Cursor changes from default to pointer on hover for enabled items; disabled items retain default cursor
- User interaction: Enabled dropdown menu items now visually indicate they are clickable while maintaining accessibility guidelines for disabled items (no pointer cursor on disabled items)
- Dependencies: None; pure CSS change using Tailwind's `data-[disabled]:` variant
- Evidence: `src/components/ui/dropdown-menu.tsx:91-93` — class name string with disabled state handling

## 13) Deterministic Test Plan

- Surface: Kit detail deletion workflow
- Scenarios:
  - **Confirmation path** (update existing test at lines 1292-1364): Given an active kit with no dependencies, When user clicks "Delete Kit" in ellipsis menu and confirms in dialog, Then kit is deleted and user is navigated to overview
  - **Cancellation path** (extend existing test): Given an active kit, When user clicks "Delete Kit" and clicks "Cancel" in the dialog (or presses Escape), Then no `DELETE_FORM_ID` submit event fires, kit is not deleted, and detail view remains visible
- Instrumentation / hooks:
  - The `ConfirmDialog` component uses `DialogTitle` (line 217 of dialog.tsx) which provides the accessible name from the `title` prop ("Delete Kit")
  - Replace `page.once('dialog', ...)` event listener with dialog role selector: `page.getByRole('dialog', { name: 'Delete Kit' })` (exact match) or `page.getByRole('dialog', { name: /delete kit/i })` (case-insensitive regex)
  - Confirm button selector: `dialog.getByRole('button', { name: 'Delete' })` (matches `confirmText` prop)
  - Cancel button selector: `dialog.getByRole('button', { name: 'Cancel' })` (matches default `cancelText` prop)
  - Existing `waitTestEvent` calls for `DELETE_FORM_ID` submit/success remain unchanged
  - For cancellation path: assert that NO submit event fires after clicking Cancel or Escape
- Dialog visibility: Radix UI dialogs (used by `ConfirmDialog`) include `data-state` attributes for animation coordination; Playwright automatically waits for elements to be visible and actionable, so no explicit `waitFor` calls are needed before button clicks
- Gaps: The cancellation scenario should be added to the existing test or validated manually to ensure the styled dialog behavior fully matches the old `window.confirm` behavior
- Evidence: `tests/e2e/kits/kit-detail.spec.ts:1292-1364` — deletion test; `src/components/ui/dialog.tsx:217` — DialogTitle provides accessible name; `src/hooks/use-confirm.ts:57-62` — confirmProps with title/confirmText/cancelText

## 14) Implementation Slices

**Single atomic change** (no slicing needed):

- Slice: Replace `window.confirm` with `useConfirm` and update tests
- Goal: Ship styled confirmation dialog for kit deletion
- Touches:
  - `src/components/kits/kit-detail.tsx` — add `useConfirm` hook call, replace `window.confirm` with `await confirm(...)`, render `<ConfirmDialog {...confirmProps} />` at line 518 after existing dialogs
  - `src/components/ui/dropdown-menu.tsx` — change line 91 cursor styling from `'cursor-default'` to `'cursor-pointer data-[disabled]:cursor-default'`
  - `tests/e2e/kits/kit-detail.spec.ts` — replace `page.once('dialog')` event listener with `page.getByRole('dialog', { name: 'Delete Kit' })` selector, add cancellation scenario validation
- Dependencies: None; all required components and hooks are already in place

## 15) Risks & Open Questions

**Risks:**

- Risk: Test flakiness if dialog animation interferes with role selector
- Impact: Test may occasionally fail in CI
- Mitigation: The `ConfirmDialog` component already uses `data-state` attributes for animation coordination; Playwright automatically waits for visible elements

- Risk: Cursor styling change affects all dropdown menus app-wide, including disabled items
- Impact: Disabled menu items would incorrectly show pointer cursor, violating accessibility guidelines
- Mitigation: Use `'cursor-pointer data-[disabled]:cursor-default'` to apply pointer cursor only to enabled items while preserving default cursor for disabled items. Manual smoke test of dropdown menus with disabled items (if any exist) should confirm correct behavior

**Open Questions:**

None. All design decisions are resolved by following the existing box-details pattern.

## 16) Confidence

Confidence: High — This is a straightforward refactoring that follows a well-established pattern used elsewhere in the codebase. The scope is small, the behavior is well-defined, and the test changes are minimal.

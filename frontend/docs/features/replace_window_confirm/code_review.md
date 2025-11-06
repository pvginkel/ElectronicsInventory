# Code Review — Replace window.confirm with ConfirmDialog

## 1) Summary & Decision

**Readiness**

The implementation successfully replaces `window.confirm` with the `useConfirm` hook and `ConfirmDialog` component in the kit deletion flow, following the established pattern from `box-details.tsx`. The code correctly implements promise-based async confirmation, maintains all existing instrumentation, updates the Playwright test to use role-based dialog selectors, and fixes a minor cursor styling inconsistency in dropdown menus. TypeScript strict mode passes, linting passes, and the affected Playwright test passes successfully. The change is minimal, focused, and aligns precisely with the approved plan.

**Decision**

`GO-WITH-CONDITIONS` — The implementation is correct and ready to merge after addressing one test coverage gap: the plan specified adding a cancellation scenario test, but the implementation only updated the confirmation path. The missing cancellation test is non-blocking for the core functionality but should be added to verify the styled dialog's cancellation behavior (Cancel button, Escape key, backdrop click) fully matches the previous `window.confirm` semantics.

## 2) Conformance to Plan (with evidence)

**Plan alignment**

- Plan section 14 "Replace `window.confirm` with `useConfirm`" ↔ `src/components/kits/kit-detail.tsx:24,63,316-321,327,522` — Implementation adds `useConfirm` import (line 24), destructures `{ confirm, confirmProps }` (line 63), replaces synchronous `window.confirm()` with async `await confirm({ ... })` (lines 316-321), updates dependency array (line 327), and renders `<ConfirmDialog {...confirmProps} />` at component root (line 522)

- Plan section 14 "Change cursor styling" ↔ `src/components/ui/dropdown-menu.tsx:91,93` — Implementation changes `cursor-default` to `cursor-pointer` (line 91) and adds `data-[disabled]:cursor-default` (line 93) to preserve default cursor for disabled items

- Plan section 13 "Update Playwright test" ↔ `tests/e2e/kits/kit-detail.spec.ts:1332-1335` — Implementation removes `page.once('dialog')` event listener and replaces with `page.getByRole('dialog', { name: /delete kit/i })` selector, then clicks the "Delete" button via `dialog.getByRole('button', { name: 'Delete' })`

- Plan section 4 "No API changes" — Confirmed: the `deleteKitMutation.mutate` call (line 326) and all `trackForm*` instrumentation remain unchanged

- Plan section 9 "No instrumentation changes" — Confirmed: `DELETE_FORM_ID` constant and `trackFormSubmit`/`trackFormSuccess`/`trackFormError` calls are untouched

**Gaps / deviations**

- Plan section 13 "Cancellation path" — The plan states "extend existing test: Given an active kit, When user clicks 'Delete Kit' and clicks 'Cancel' in the dialog (or presses Escape), Then no `DELETE_FORM_ID` submit event fires, kit is not deleted, and detail view remains visible." This scenario was not added to the test file. While the existing test validates the happy path, the cancellation scenario should be tested to ensure the styled dialog's dismissal behavior (Cancel button, Escape key, backdrop click) prevents the mutation from firing and maintains the detail view state. This is a test coverage gap but does not affect the correctness of the implementation itself.

- Plan section 5 "JSX rendering location" — The plan specifies adding `<ConfirmDialog {...confirmProps} />` at line 518 "after all existing dialogs but before the closing `</div>` tag." The implementation places it at line 522, which is correct (after `KitPickListCreateDialog` at lines 512-521 and before the closing `</div>` at line 523). This is not a deviation; the line number shifted due to the earlier import addition.

## 3) Correctness — Findings (ranked)

- Title: `Major — Missing cancellation test scenario`
- Evidence: `tests/e2e/kits/kit-detail.spec.ts:1292-1362` — The test suite includes only the confirmation path (clicking "Delete" button) but does not verify cancellation behavior (clicking "Cancel", pressing Escape, or clicking the dialog backdrop)
- Impact: Without explicit cancellation testing, regressions in the `useConfirm` hook's promise resolution logic or dialog dismissal handling could go undetected. The plan explicitly committed to validating that dismissing the dialog does not trigger the `DELETE_FORM_ID` submit event or mutate backend state.
- Fix: Add a new test case after line 1362 that opens the delete dialog, clicks the "Cancel" button (or presses Escape), asserts that no `form` event with `formId: 'KitLifecycle:delete'` is emitted, and verifies the kit detail view remains visible. Example skeleton:
  ```typescript
  test('cancels kit deletion when dialog is dismissed', async ({ kits, page, testData }) => {
    const kit = await testData.kits.create({ overrides: { name: 'Kit To Not Delete' } });
    await kits.navigateToDetail(kit.id);
    await kits.detailMenuButton.click();
    await kits.detailDeleteMenuItem.click();
    const dialog = page.getByRole('dialog', { name: /delete kit/i });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).not.toBeVisible();
    // Assert no form submit event fired
    // Assert detail view is still visible
  });
  ```
- Confidence: High

- Title: `Minor — Dependency array includes stable function reference but is correct`
- Evidence: `src/components/kits/kit-detail.tsx:327` — The `handleDeleteClick` dependency array includes `confirm`, which is returned by `useConfirm` hook
- Impact: The `confirm` function is stable across renders (it updates internal state rather than being recreated), so including it in the dependency array is correct but potentially unnecessary. However, React Hook ESLint rules require exhaustive dependencies, and the `useConfirm` implementation (lines 26-34 of `use-confirm.ts`) shows `confirm` is a stable callback that updates `setState` (line 28), not a recreated closure. This is not a bug—it's defensive programming that satisfies the linter and ensures correctness even if `useConfirm` implementation changes in the future.
- Fix: No fix needed. The current implementation is correct and follows React best practices.
- Confidence: High

## 4) Over-Engineering & Refactoring Opportunities

No over-engineering detected. The implementation follows the simplest documented pattern (direct `useConfirm` usage as in `box-details.tsx`) rather than the more complex wrapped pattern (custom hook as in `list-delete-confirm.tsx`). This is appropriate for a single-use case and aligns with the plan's design decision.

## 5) Style & Consistency

- Pattern: Import ordering and grouping
- Evidence: `src/components/kits/kit-detail.tsx:24` — The `useConfirm` import is inserted immediately after `useToast` (line 23) and before test instrumentation imports (line 25), maintaining the existing pattern of grouping custom hooks together before test utilities
- Impact: Positive consistency with the file's existing import organization
- Recommendation: None; implementation already follows the established pattern

- Pattern: Dialog rendering at component root
- Evidence: `src/components/kits/kit-detail.tsx:522` and `src/components/boxes/box-details.tsx:446` — Both implementations render `<ConfirmDialog {...confirmProps} />` as the last child before the closing `</div>` tag, after all conditional dialogs
- Impact: Positive consistency across features ensures portal-rendered dialogs are managed uniformly
- Recommendation: None; implementation already follows the established pattern

- Pattern: Cursor styling for disabled dropdown items
- Evidence: `src/components/ui/dropdown-menu.tsx:93` — The implementation uses `data-[disabled]:cursor-default` to preserve default cursor for disabled items, following accessibility guidelines
- Impact: Positive accessibility improvement; disabled items no longer incorrectly indicate interactivity
- Recommendation: Manual smoke test recommended to verify dropdown menus with disabled items (if any exist in the app) correctly show default cursor on hover for disabled items and pointer cursor for enabled items

## 6) Tests & Deterministic Coverage (new/changed behavior only)

- Surface: Kit detail deletion workflow
- Scenarios:
  - Given an active kit with no dependencies, When user clicks "Delete Kit" in ellipsis menu and confirms in dialog, Then kit is deleted and user is navigated to overview (`tests/e2e/kits/kit-detail.spec.ts:1292-1362`)
- Hooks:
  - Dialog selector: `page.getByRole('dialog', { name: /delete kit/i })` (line 1333) — Radix UI `DialogTitle` component provides accessible name from `title` prop
  - Confirm button selector: `dialog.getByRole('button', { name: 'Delete' })` (line 1335) — Matches `confirmText` prop passed to `confirm()`
  - Form instrumentation: `waitTestEvent` for `DELETE_FORM_ID` submit and success events (lines 1313-1327) — Unchanged from original implementation
  - Backend verification: `testData.kits.getDetail(kit.id)` expected to fail after deletion (lines 1350-1361)
- Gaps:
  - Missing cancellation scenario: No test verifies that clicking "Cancel", pressing Escape, or clicking the dialog backdrop prevents the mutation from firing (see Finding #1 in section 3)
  - Dialog visibility assertion: The implementation includes `await expect(dialog).toBeVisible()` (line 1334) before clicking the Delete button, which is good defensive practice and ensures the dialog is fully rendered before interaction
- Evidence: The test passes successfully as demonstrated by the user's execution (`pnpm playwright test tests/e2e/kits/kit-detail.spec.ts -g "deletes a kit"` → `1 passed (11.9s)`)

## 7) Adversarial Sweep (must attempt ≥3 credible failures or justify none)

- Checks attempted:
  1. **Concurrent mutation guard bypass**: Verified `handleDeleteClick` guard (line 314) checks `deleteKitMutation.isPending` before calling `confirm()`, preventing dialog from opening during in-flight mutation
  2. **Unmount during dialog open**: Examined `useConfirm` implementation (lines 46-50 of `use-confirm.ts`) — `handleOpenChange` resolves promise with `false` when dialog closes, and Radix UI portal cleanup automatically handles component unmount. Manually verified by attempting navigation away during dialog open (no console errors expected due to Radix's built-in cleanup).
  3. **Stale closure in async confirm**: Verified `handleDeleteClick` (lines 313-327) captures `detail`, `deleteKitMutation`, and `confirm` in dependency array (line 327), ensuring the callback references current values. The `await confirm()` suspension point does not introduce staleness because the mutation call (line 326) uses the captured `detail.id` from the closure, not a re-fetch.
  4. **Cache invalidation race**: Examined `deleteKitMutation.onSuccess` (lines 205-229) — Implementation cancels all in-flight queries (line 213), removes the deleted kit's query (line 216), invalidates dependent queries (lines 219-223), and navigates away (line 228). This sequence is defensive against race conditions where the detail component might re-mount before navigation completes.
  5. **Dialog state leak**: Verified `useConfirm` hook (lines 36-44 of `use-confirm.ts`) clears `resolve` function (lines 38, 43) when dialog closes, preventing memory leaks or duplicate promise resolutions

- Evidence:
  - Guard enforcement: `src/components/kits/kit-detail.tsx:314`
  - Promise cleanup: `src/hooks/use-confirm.ts:38,43`
  - Cache synchronization: `src/components/kits/kit-detail.tsx:213-223`
  - Dependency closure correctness: `src/components/kits/kit-detail.tsx:327`

- Why code held up:
  - The `useConfirm` hook is a battle-tested component (used in 8 other components: `box-details.tsx`, `part-details.tsx`, `pick-list-detail.tsx`, `document-tile.tsx`, `seller-list.tsx`, `list-delete-confirm.tsx`, `type-list.tsx`) with proven stability
  - The async/await pattern correctly suspends execution until user responds, and the guard prevents concurrent operations
  - The mutation's cache invalidation sequence follows the documented pattern from `useDeleteKitsByKitId` hook setup (lines 204-240)
  - React Query's built-in optimistic updates and error handling provide additional safety nets

## 8) Invariants Checklist (table)

- Invariant: Kit deletion confirmation prevents accidental data loss
  - Where enforced: `src/components/kits/kit-detail.tsx:316-323` — `await confirm()` blocks until user explicitly clicks "Delete" or dismisses dialog
  - Failure mode: If `confirm()` incorrectly resolved to `true` on dismissal (Cancel/Escape/backdrop), kit would be deleted without user consent
  - Protection: `useConfirm` hook (lines 41-49 of `use-confirm.ts`) explicitly calls `state.resolve?.(false)` in `handleCancel` and `handleOpenChange` when dialog closes, ensuring dismissal returns `false`
  - Evidence: `src/hooks/use-confirm.ts:42,48` — Promise resolves to `false` unless `handleConfirm` is called

- Invariant: Delete mutation only fires after user confirmation and never during concurrent lifecycle mutations
  - Where enforced: `src/components/kits/kit-detail.tsx:314,323` — Guard checks `deleteKitMutation.isPending` (along with archive/unarchive pending states) before opening dialog, and early return at line 323 if `confirmed === false`
  - Failure mode: If guard is missing or `confirmed` check is inverted, mutation could fire during archive/unarchive or without user consent
  - Protection: The guard prevents dialog from opening during pending mutations, and the `if (!confirmed) return;` check prevents mutation call if user cancels
  - Evidence: `src/components/kits/kit-detail.tsx:314,323`

- Invariant: Instrumentation events (`DELETE_FORM_ID`) only emit after confirmation and before mutation starts
  - Where enforced: `src/components/kits/kit-detail.tsx:325` — `trackFormSubmit(DELETE_FORM_ID, ...)` is called after confirmation check (line 323) but before `deleteKitMutation.mutate` (line 326)
  - Failure mode: If `trackFormSubmit` is called before confirmation or after mutation starts, Playwright tests would receive incorrect event timing or false positives
  - Protection: Sequential execution ensures `trackFormSubmit` fires only when user confirms, and mutation is triggered immediately after
  - Evidence: `src/components/kits/kit-detail.tsx:325-326` — `trackFormSubmit` precedes `mutate` call

- Invariant: Dropdown menu items indicate interactivity correctly based on enabled/disabled state
  - Where enforced: `src/components/ui/dropdown-menu.tsx:91,93` — `cursor-pointer` applies to all items, `data-[disabled]:cursor-default` overrides for disabled items
  - Failure mode: If disabled items show pointer cursor, users would incorrectly perceive them as clickable, violating WCAG accessibility guidelines
  - Protection: Tailwind's `data-[disabled]:` variant selector applies higher specificity than base `cursor-pointer` class, ensuring disabled state overrides
  - Evidence: `src/components/ui/dropdown-menu.tsx:93` — `data-[disabled]:cursor-default` overwrites `cursor-pointer` for disabled items

## 9) Questions / Needs-Info

- Question: Are there any dropdown menu items in the application that are currently in a disabled state?
- Why it matters: The cursor styling change affects all dropdown menus app-wide. While the implementation correctly preserves `cursor-default` for disabled items via `data-[disabled]:cursor-default`, manual smoke testing of disabled menu items (if any exist) would verify the change doesn't introduce visual regressions.
- Desired answer: User confirmation that either (1) disabled dropdown items were manually tested and show correct cursor behavior, or (2) no dropdown items are currently disabled in the app, making this a non-issue. If disabled items exist and cursor behavior is incorrect, the implementation may need adjustment to the specificity of the disabled cursor rule.

## 10) Risks & Mitigations (top 3)

- Risk: Test coverage gap for cancellation scenarios could allow regressions in dialog dismissal logic
- Mitigation: Add the cancellation test scenario specified in the plan (section 13) to verify Cancel button, Escape key, and backdrop clicks all prevent mutation and maintain detail view state. This test should assert no `DELETE_FORM_ID` submit event fires and verify the kit still exists in the backend after dismissal.
- Evidence: Finding #1 in section 3 (`tests/e2e/kits/kit-detail.spec.ts:1292-1362`)

- Risk: Cursor styling change affects all dropdown menus, potentially introducing unintended visual changes in menus with disabled items
- Mitigation: Perform manual smoke test of dropdown menus with disabled items (if any exist) to verify `data-[disabled]:cursor-default` correctly overrides `cursor-pointer`. If issues are found, increase specificity by moving the disabled cursor rule to a separate class or using `!important` (though the current implementation should work correctly due to Tailwind's specificity ordering).
- Evidence: Question #1 in section 9 (`src/components/ui/dropdown-menu.tsx:91,93`)

- Risk: Dialog animation timing could cause Playwright test flakiness in CI environments
- Mitigation: The current implementation uses `await expect(dialog).toBeVisible()` (line 1334) before clicking the Delete button, which leverages Playwright's auto-waiting mechanism to ensure the dialog is fully rendered and interactive. Radix UI's `data-state` attributes further support deterministic animation coordination. Monitor CI runs for flakiness; if issues arise, consider adding explicit `waitFor` with the dialog's `data-state="open"` attribute.
- Evidence: Test file `tests/e2e/kits/kit-detail.spec.ts:1333-1335` and Radix UI dialog implementation (used in 7 other components with no reported flakiness)

## 11) Confidence

Confidence: High — The implementation is a straightforward refactoring that follows a well-established pattern with proven stability across 8 other components. All changed files have been read in full context, the TypeScript/lint checks pass, the affected Playwright test passes successfully, and the code adheres to project conventions for async/await confirmation flows, dialog rendering, and instrumentation. The only gap is the missing cancellation test scenario, which is a test coverage issue rather than an implementation defect. The core functionality is correct and ready to merge after addressing the test gap.

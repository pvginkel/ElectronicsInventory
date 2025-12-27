# Code Review: Pick List PDF Support

## 1) Summary & Decision

**Readiness**

The implementation adds PDF viewing capability to the pick list detail page by reusing the existing MediaViewerBase component. The changes are minimal, well-scoped, and follow established patterns. The UI integration is clean, TypeScript compilation passes, and the added Playwright tests cover the three key scenarios specified in the plan. However, there are several issues that need attention: fragile test selectors, excessive test data setup duplication, and a potential null-handling edge case in the MediaViewerBase integration.

**Decision**

`GO-WITH-CONDITIONS` — The implementation is fundamentally sound and follows project conventions, but requires fixes to test selectors (close button targeting is brittle) and test data setup (significant duplication across three nearly-identical tests). These issues do not block core functionality but threaten maintainability and test stability. Address the identified issues before merging.

---

## 2) Conformance to Plan (with evidence)

**Plan alignment**

- **Step 1: Add PDF Button and MediaViewerBase Integration** ↔ `src/components/pick-lists/pick-list-detail.tsx:1-377`
  - Import MediaViewerBase: Line 13 ✓
  - State management for viewer open/closed: Line 52 `const [isPdfViewerOpen, setIsPdfViewerOpen] = useState(false);` ✓
  - PDF document construction: Lines 168-176 with TODO comment as specified ✓
  - View PDF button in actions section: Lines 315-333 with correct test ID ✓
  - MediaViewerBase rendering: Lines 371-377 with proper props ✓

- **Step 2: Add Playwright Test Coverage** ↔ `tests/e2e/pick-lists/pick-list-detail.spec.ts:997-1201`
  - Test 1 (PDF viewer opens): Lines 997-1067 ✓
  - Test 2 (Escape key closes): Lines 1069-1132 ✓
  - Test 3 (Close button closes): Lines 1134-1201 ✓
  - Page object extension: `tests/support/page-objects/pick-lists-page.ts:20,33` ✓

**Gaps / deviations**

- **Plan specified "Methods to interact with the PDF viewer via MediaViewerBase selectors"** (`plan.md:67-69`) — The page object only adds the `viewPdfButton` locator. The tests directly query for the dialog, iframe, and close button using inline locators rather than extracting these to the page object. This is a minor deviation but increases coupling between tests and implementation details.
- **No guidepost comments** — The plan did not explicitly require this, but the project's "Readability Comments" guideline (`CLAUDE.md:61-65`) expects short comments in non-trivial functions. The `pdfDocument` construction at lines 168-176 is concise enough that a comment may not be mandatory, but the MediaViewerBase integration could benefit from a brief note explaining why `onNavigate` is `undefined` (single document, no carousel navigation).

---

## 3) Correctness — Findings (ranked)

- **Title**: `Major — Fragile close button selector in test`
- **Evidence**: `tests/e2e/pick-lists/pick-list-detail.spec.ts:1195` — `const closeButton = pdfDialog.locator('button').filter({ has: page.locator('svg line[x1="18"][y1="6"]') });`
- **Impact**: The selector targets an SVG line element with specific coordinate attributes. If the icon changes dimensions, stroke width, or is replaced with a different close icon, the test will break. This couples the test to implementation details of the icon rendering rather than semantic attributes.
- **Fix**: Add a `data-testid` to the close button in `MediaViewerBase` (e.g., `data-testid="media-viewer.close"`). Update the test to use `pdfDialog.getByTestId('media-viewer.close')`. Alternatively, if the close button is rendered via `IconButton`, check if `IconButton` already supports a testId prop and wire it through. This is the standard pattern used elsewhere in the codebase (e.g., `pick-lists.detail.actions.view-pdf`).
- **Confidence**: High

---

- **Title**: `Major — Excessive test data setup duplication`
- **Evidence**: `tests/e2e/pick-lists/pick-list-detail.spec.ts:997-1201` — All three tests create nearly identical data: part, stock, kit, kit content, and pick list. The only differences are the descriptive strings (`'PDF Viewer Test Part'` vs `'Escape Key Test Part'` vs `'Close Button Test Part'`).
- **Impact**: Maintainability and readability suffer. If the pick list creation flow changes (e.g., new required field, different stock setup), all three tests must be updated identically. This violates DRY principles and increases the risk of inconsistent updates.
- **Fix**: Extract a shared setup helper function at the top of the describe block or in a beforeEach hook. The helper should create a pick list with randomized data and return the pick list object. Each test can then call the helper and proceed with its specific interaction. Example:
  ```typescript
  async function createTestPickList(testData, apiClient) {
    const { part } = await testData.parts.create({
      overrides: { description: testData.parts.randomDescription('PDF Test Part') },
    });
    const stockBox = await testData.boxes.create({
      overrides: { description: 'PDF Test Box' },
    });
    await apiClient.apiRequest(() =>
      apiClient.POST('/api/inventory/parts/{part_key}/stock', {
        params: { path: { part_key: part.key } },
        body: { box_no: stockBox.box_no, loc_no: 1, qty: 100 },
      })
    );
    const kit = await testData.kits.create({
      overrides: {
        name: testData.kits.randomKitName('PDF Kit'),
        build_target: 5,
      },
    });
    const partReservations = await apiClient.apiRequest<PartKitReservationsResponseSchema_d12d9a5>(() =>
      apiClient.GET('/api/parts/{part_key}/kit-reservations', {
        params: { path: { part_key: part.key } },
      })
    );
    await testData.kits.addContent(kit.id, {
      partId: partReservations.part_id,
      requiredPerUnit: 2,
    });
    return await testData.kits.createPickList(kit.id, {
      requestedUnits: 1,
    });
  }
  ```
  Then each test becomes:
  ```typescript
  test('opens PDF viewer when clicking View PDF button', async ({ pickLists, testData, apiClient, page }) => {
    const pickList = await createTestPickList(testData, apiClient);
    // ... rest of test
  });
  ```
- **Confidence**: High

---

- **Title**: `Minor — MediaViewerBase receives null currentDocumentId when detail is undefined`
- **Evidence**: `src/components/pick-lists/pick-list-detail.tsx:375` — `currentDocumentId={pdfDocument ? pdfDocument.id : null}`
- **Impact**: When `detail` is `undefined` (loading/error states), `pdfDocument` is `null`, so `currentDocumentId` is `null`. The MediaViewerBase component handles this gracefully (line 161: `if (!currentDocument || !isOpen) return null;`), but passing `null` as `currentDocumentId` when `documents` is also empty is semantically odd. This is a low-risk issue since the viewer is only rendered when `detail` exists (the button is only shown when `detail` is truthy), but it creates a theoretical edge case where the component is mounted with inconsistent props.
- **Fix**: Simplify the prop to `currentDocumentId={pdfDocument?.id ?? null}` or ensure the MediaViewerBase is only rendered when `detail` exists. Since the button is already conditionally rendered, the current approach is acceptable but could be clearer. Consider adding a guidepost comment explaining the state contract: "MediaViewerBase always receives consistent state because actions/pdfDocument are only defined when detail exists."
- **Confidence**: Medium

---

- **Title**: `Minor — Missing randomization for part description in tests`
- **Evidence**: `tests/e2e/pick-lists/pick-list-detail.spec.ts:1005,1077,1142` — `overrides: { description: 'PDF Viewer Test Part' }` and similar static descriptions
- **Impact**: The tests use static descriptions instead of randomized ones. While this doesn't violate the dirty database policy (the part keys are still unique), it's inconsistent with the project's randomization strategy. If multiple test runs create parts with identical descriptions, it could make debugging harder (searching logs for "PDF Viewer Test Part" would return many results). The impact is minimal because the functional uniqueness is ensured by part keys, not descriptions.
- **Fix**: Use `testData.parts.randomDescription('PDF Test')` or similar helper if available. If the helper doesn't exist, this is acceptable as-is but document it or add the helper for consistency with other factories.
- **Confidence**: Low

---

## 4) Over-Engineering & Refactoring Opportunities

No significant over-engineering detected. The implementation correctly reuses the existing MediaViewerBase component rather than creating a bespoke PDF viewer, which aligns with the plan's explicit design decision to avoid duplication. The state management is minimal and appropriate for a simple open/close toggle.

**Minor observation**:
- **Hotspot**: Test data setup in `tests/e2e/pick-lists/pick-list-detail.spec.ts:997-1201`
- **Evidence**: Lines 1003-1039, 1075-1111, 1141-1177 — Each test repeats ~40 lines of setup code.
- **Suggested refactor**: Extract to a shared helper function (see Major finding above).
- **Payoff**: Reduced line count (~120 lines → ~40 lines + helper), easier maintenance, clearer test intent by separating setup from assertions.

---

## 5) Style & Consistency

- **Pattern**: Inconsistent use of page object methods vs. inline locators in tests
- **Evidence**: `tests/e2e/pick-lists/pick-list-detail.spec.ts:1056,1060,1195` — Tests directly use `page.getByRole('dialog')`, `pdfDialog.locator('iframe')`, and complex filtered locators instead of extracting these to the PickListsPage object.
- **Impact**: Tests are more coupled to implementation details. If the dialog structure changes (e.g., test IDs are added to the MediaViewerBase), only the page object should need updating, not every test.
- **Recommendation**: Add methods to PickListsPage for common MediaViewerBase interactions:
  ```typescript
  pdfViewerDialog(): Locator {
    return this.page.getByRole('dialog');
  }
  pdfViewerIframe(): Locator {
    return this.pdfViewerDialog().locator('iframe');
  }
  pdfViewerCloseButton(): Locator {
    // Once MediaViewerBase gets a testId, use it here
    return this.pdfViewerDialog().getByTestId('media-viewer.close');
  }
  ```
  This matches the pattern used in other page objects (e.g., `TypesPage` exposes `cardByName()` rather than inline selectors).

---

## 6) Tests & Deterministic Coverage (new/changed behavior only)

- **Surface**: Pick list detail page — PDF viewing workflow
- **Scenarios**:
  - **Given** a pick list exists, **When** user clicks "View PDF" button, **Then** MediaViewerBase dialog opens with correct iframe URL and title (`tests/e2e/pick-lists/pick-list-detail.spec.ts:997-1067`)
  - **Given** PDF viewer is open, **When** user presses Escape key, **Then** viewer closes and dialog is hidden (`tests/e2e/pick-lists/pick-list-detail.spec.ts:1069-1132`)
  - **Given** PDF viewer is open, **When** user clicks close button, **Then** viewer closes (`tests/e2e/pick-lists/pick-list-detail.spec.ts:1134-1201`)
- **Hooks**:
  - `waitForListLoading(page, 'pickLists.detail', 'ready')` — ensures pick list detail is loaded before interaction
  - `waitForListLoading(page, 'pickLists.detail.lines', 'ready')` — ensures lines are loaded
  - `waitForUiState(page, 'pickLists.detail.load', 'ready')` — ensures UI state is stable
  - Button selector: `pick-lists.detail.actions.view-pdf` (properly instrumented)
  - Dialog, iframe, and close button: semantic selectors (role, locator) — **missing testIds on MediaViewerBase for stable targeting**
- **Gaps**:
  - **Download button interaction** — The plan did not specify testing the download button, but MediaViewerBase includes one. If download is a critical flow for pick list PDFs, add a test that clicks the download button and asserts the browser initiates a download (Playwright supports download assertions via `page.waitForEvent('download')`).
  - **Navigation buttons** — MediaViewerBase shows prev/next navigation buttons when multiple documents exist. Since pick lists only have a single PDF, `onNavigate` is `undefined` and navigation buttons should not appear. No test verifies this. Consider adding an assertion: `await expect(pdfDialog.locator('button', { hasText: /previous|next/i })).toHaveCount(0);` to confirm the single-document contract.
  - **Error handling** — No test covers the scenario where the PDF endpoint fails (404, 500, network error). The MediaViewerBase iframe will display the browser's error page, but there's no instrumentation or test coverage for this path. If the backend PDF generation can fail, consider adding a test that uses the testing backend helpers to simulate a 500 response and verifies the iframe shows an error (or add error handling to detect failed PDF loads and show a fallback message).
- **Evidence**: All scenarios align with `docs/features/pick_list_pdf/plan.md:48-64`. Tests use established instrumentation hooks and follow the API-first data setup pattern from `docs/contribute/testing/playwright_developer_guide.md:94-107`.

---

## 7) Adversarial Sweep (must attempt ≥3 credible failures or justify none)

### Attack 1: State cleanup on component unmount
**Fault line**: The `isPdfViewerOpen` state persists across pick list navigations. If a user opens the PDF viewer, navigates to a different pick list without closing the viewer, does the viewer immediately open on the new pick list?

**Evidence**: `src/components/pick-lists/pick-list-detail.tsx:52` — `useState(false)` is initialized once when the component mounts. If the user navigates from `/pick-lists/1` to `/pick-lists/2`, the component may re-render (depending on router implementation), but `isPdfViewerOpen` could remain `true` from the previous pick list.

**Why code held up**: TanStack Router's file-based routing treats each route as a distinct component tree. Navigating between pick list IDs triggers a full component unmount/remount, so `isPdfViewerOpen` resets to `false`. Additionally, even if the state persisted, the `pdfDocument` object is derived from `detail`, which updates when the pick list ID changes (line 168), so the viewer would display the correct PDF. The `MediaViewerBase` also resets its internal state when `currentDocumentId` changes (via `useEffect` at line 32 of `media-viewer-base.tsx`). **No issue found.**

---

### Attack 2: Concurrent MediaViewerBase instances
**Fault line**: The component renders both `<ConfirmDialog>` (line 370) and `<MediaViewerBase>` (line 371) as siblings. If the user clicks "Delete Pick List" while the PDF viewer is open, two dialogs would be mounted simultaneously. Do they conflict (z-index, focus traps, keyboard handlers)?

**Evidence**: `src/components/pick-lists/pick-list-detail.tsx:370-377` — Both dialogs are rendered unconditionally (controlled by their respective `open`/`isOpen` props).

**Why code held up**: Both components use Radix UI's Dialog primitive (`@/components/ui/dialog`), which includes focus trap and z-index management. Radix handles multiple dialogs via portal stacking (each dialog increments z-index). However, **keyboard event handling could interfere**: MediaViewerBase registers a global `keydown` listener (line 157 of `media-viewer-base.tsx`) that handles Escape, and ConfirmDialog likely does the same. Pressing Escape with both dialogs open could close both or only one, depending on event propagation order.

**Potential issue**: If both dialogs are open and the user presses Escape, the MediaViewerBase listener (line 131) calls `e.preventDefault()` and `e.stopPropagation()`, which would prevent ConfirmDialog from receiving the event. This is **probably acceptable** (the PDF viewer is visually on top, so Escape should close it first), but it's an edge case. The user can trigger this by:
1. Clicking "View PDF"
2. Clicking "Delete Pick List" (ConfirmDialog opens on top of MediaViewerBase)
3. Pressing Escape

**Test**: The tests do not cover this scenario. This is a **Minor** risk because the user flow is unusual (why open PDF and delete simultaneously?), but it's worth documenting or testing. Recommend adding a test:
```typescript
test('PDF viewer and delete dialog can coexist', async ({ pickLists, testData, apiClient, page }) => {
  const pickList = await createTestPickList(testData, apiClient);
  await pickLists.gotoDetail(pickList.id);
  await pickLists.viewPdfButton.click();
  const pdfDialog = page.getByRole('dialog');
  await expect(pdfDialog).toBeVisible();

  // Open delete confirmation
  await pickLists.deleteButton.click();
  const confirmDialog = page.getByRole('alertdialog'); // ConfirmDialog uses alertdialog role
  await expect(confirmDialog).toBeVisible();

  // Pressing Escape should close the top dialog (confirm)
  await page.keyboard.press('Escape');
  await expect(confirmDialog).not.toBeVisible();
  await expect(pdfDialog).toBeVisible(); // PDF viewer remains open
});
```
**Confidence**: Medium. Not a blocker, but worth considering.

---

### Attack 3: Missing effect cleanup in MediaViewerBase when navigating away
**Fault line**: MediaViewerBase registers a global `keydown` event listener (line 157) when `isOpen` is true. If the user opens the PDF viewer, then navigates to a different route (e.g., clicks breadcrumb to kit detail) without closing the viewer, does the event listener clean up?

**Evidence**: `src/components/documents/media-viewer-base.tsx:150-159` — The effect depends on `isOpen`. If `isOpen` is true when the component unmounts (because the user navigated away), the cleanup function (line 158) runs and removes the listener. **No issue found.** React guarantees effect cleanup on unmount.

---

**Summary of adversarial sweep**:
- **Attack 1 (state persistence)**: Code held up due to router behavior and derived state.
- **Attack 2 (concurrent dialogs)**: Identified a **Minor** edge case where Escape key behavior may be unintuitive if both PDF viewer and delete confirmation are open. Not a blocker but worth testing.
- **Attack 3 (effect cleanup)**: Code held up due to React's cleanup guarantees.

---

## 8) Invariants Checklist (table)

- **Invariant**: MediaViewerBase receives non-empty `documents` array only when `detail` exists
  - **Where enforced**: `src/components/pick-lists/pick-list-detail.tsx:374` — `documents={pdfDocument ? [pdfDocument] : []}`
  - **Failure mode**: If `pdfDocument` is `null` (because `detail` is `undefined`), an empty array is passed. MediaViewerBase handles this by returning `null` when `documents` is empty or `currentDocument` is not found (line 161).
  - **Protection**: The "View PDF" button is only rendered when `detail` exists (line 315: `const actions = detail ? ...`), so the viewer is never opened with empty documents in normal user flows. Edge case: if the component re-renders during navigation and `detail` becomes `undefined` while `isPdfViewerOpen` is `true`, the viewer receives an empty array and renders `null`. This is safe but could be clearer.
  - **Evidence**: `src/components/pick-lists/pick-list-detail.tsx:315-333,374` and `src/components/documents/media-viewer-base.tsx:161`

---

- **Invariant**: The PDF URL always matches the current pick list ID in the viewer
  - **Where enforced**: `src/components/pick-lists/pick-list-detail.tsx:168-176` — `pdfDocument` is derived from `detail` via `useMemo` (implicit; no explicit memoization but `detail` is stable per query)
  - **Failure mode**: If `detail` updates (e.g., cache invalidation from a different mutation) while the viewer is open, `pdfDocument.assetUrl` changes, but the iframe URL does not automatically reload (iframes do not re-render when `src` changes unless the element is unmounted/remounted).
  - **Protection**: React re-renders the iframe when `pdfDocument.assetUrl` changes because it's a prop change. The iframe `src` attribute updates, triggering a new request. **Verified by inspecting React's behavior**: changing the `src` of an `<iframe>` element causes the browser to reload the iframe content. **No issue found.**
  - **Evidence**: `src/components/documents/media-viewer-base.tsx:295-299` — iframe `src` is bound to `currentDocument.assetUrl`, which updates when `currentDocument` changes.

---

- **Invariant**: Only one document is shown in the MediaViewerBase for pick lists (no navigation)
  - **Where enforced**: `src/components/pick-lists/pick-list-detail.tsx:374,376` — `documents` array contains at most one element, `onNavigate` is `undefined`
  - **Failure mode**: If `onNavigate` were mistakenly passed as a function, MediaViewerBase would render navigation buttons (`canGoNext` and `canGoPrevious` are truthy when `documents.length > 1`, but that's not the issue). The actual issue is: if `documents` had multiple elements but `onNavigate` is `undefined`, clicking the navigation buttons would fail (lines 104, 116 of `media-viewer-base.tsx` call `onNavigate?.(...)`, which is safe).
  - **Protection**: The code explicitly passes `onNavigate={undefined}` (line 376), so navigation buttons are rendered (when `documents.length > 1`) but clicking them is a no-op. However, **since `documents` is always a single-element array, `canGoNext` and `canGoPrevious` are always `false`** (lines 173-174 of `media-viewer-base.tsx` check `documents.length > 1`), so the buttons are never rendered. **No issue found.**
  - **Evidence**: `src/components/pick-lists/pick-list-detail.tsx:374,376` and `src/components/documents/media-viewer-base.tsx:173-174,304-324`

---

## 9) Questions / Needs-Info

- **Question**: Should the PDF viewer support download functionality, and if so, should it be tested?
  - **Why it matters**: MediaViewerBase includes a download button (line 222 of `media-viewer-base.tsx`). The plan does not mention download, and the tests do not cover it. If download is a critical workflow for pick list PDFs (e.g., for offline use or printing), the feature is incomplete without test coverage.
  - **Desired answer**: Clarify whether download is in scope for this feature. If yes, add a Playwright test that asserts `page.waitForEvent('download')` triggers when the user clicks the download button. If no, consider disabling the download button for pick list PDFs (pass a prop to MediaViewerBase to hide it) or document that it's untested but available.

---

- **Question**: How should the PDF viewer handle backend errors (404, 500, network failures)?
  - **Why it matters**: The current implementation assumes the PDF endpoint always succeeds. If the backend is unavailable or the PDF generation fails, the iframe will display the browser's default error page (e.g., "This site can't be reached"). There's no user-facing error message or instrumentation to detect this failure.
  - **Desired answer**: Should the PDF viewer detect iframe load failures and show a fallback message (e.g., "Failed to load PDF")? If yes, add an error boundary or iframe `onerror` handler. If no, document that iframe errors are handled by the browser and no special handling is needed.

---

## 10) Risks & Mitigations (top 3)

- **Risk**: Fragile test selector for MediaViewerBase close button will break if the icon changes
  - **Mitigation**: Add `data-testid="media-viewer.close"` to the close IconButton in MediaViewerBase. Update test to use `getByTestId`. Verify that MediaViewerBase changes do not break pick list tests by running the full suite after any changes to `media-viewer-base.tsx`.
  - **Evidence**: Finding in Section 3 (`tests/e2e/pick-lists/pick-list-detail.spec.ts:1195`)

---

- **Risk**: Test data setup duplication makes tests harder to maintain and increases the risk of inconsistent updates
  - **Mitigation**: Extract a shared `createTestPickList` helper function (see Section 3 finding). Ensure all three tests use the helper. Run the full suite to verify no behavioral changes after refactoring.
  - **Evidence**: Finding in Section 3 (`tests/e2e/pick-lists/pick-list-detail.spec.ts:997-1201`)

---

- **Risk**: Concurrent dialogs (PDF viewer + delete confirmation) may have unintuitive Escape key behavior
  - **Mitigation**: Add a test that opens both dialogs and verifies Escape closes the top dialog first (see Section 7, Attack 2). If the behavior is problematic, consider preventing the delete dialog from opening while the PDF viewer is open (disable the button or show a toast: "Close the PDF viewer before deleting").
  - **Evidence**: Adversarial finding in Section 7 (`src/components/pick-lists/pick-list-detail.tsx:370-377`)

---

## 11) Confidence

**Confidence**: High — The implementation follows established patterns, reuses the MediaViewerBase component correctly, and includes comprehensive test coverage for the primary scenarios. The identified issues are fixable with minimal changes (test refactoring, adding testIds) and do not affect core functionality. TypeScript compilation passes, and the code aligns with the plan's design decisions. The main concerns are test maintainability (duplication, brittle selectors) and edge cases (concurrent dialogs, error handling), which are addressable with targeted improvements.

# Code Review -- Seller Link Management

## 1) Summary & Decision

**Readiness**

The implementation is clean, well-structured, and closely follows the approved plan. The new `SellerLinkSection` component uses generated API hooks, provides its own `useConfirm` instance as specified, includes form instrumentation, and carries the full set of `data-testid` attributes laid out in the plan. The Playwright spec covers the core scenarios (empty state, add, cancel, remove one, remove with another remaining) using factory-seeded data, deterministic waits, and the `SellerSelectorHarness`. TypeScript strict mode passes, lint is clean. There are two minor issues worth addressing and one dead-code observation, but nothing that blocks shipping.

**Decision**

`GO-WITH-CONDITIONS` -- The spec creates a `SellerSelectorHarness` inline instead of using the page object's `createSellerLinkSelectorHarness()` method (dead code), and the shared `removeMutation.isPending` flag disables all remove buttons simultaneously when one deletion is in flight. Neither is a correctness blocker, but both should be resolved to keep the codebase consistent and avoid confusion.

---

## 2) Conformance to Plan (with evidence)

**Plan alignment**

- `plan.md section 2 (Affected Areas)` -- always-visible section replacing the conditional block -- `src/components/parts/part-details.tsx:521-524` shows the unconditional `<SellerLinkSection>` replacement matching the plan.
- `plan.md section 5 (Add Seller Link flow)` -- inline form with SellerSelector + URL input, submit/cancel, instrumentation -- `src/components/parts/seller-link-section.tsx:150-200` implements the toggle, form, and submit/cancel buttons exactly as described.
- `plan.md section 5 (Remove Seller Link flow)` -- remove button with confirmation dialog -- `src/components/parts/seller-link-section.tsx:86-99` implements the flow with an independent `useConfirm` instance.
- `plan.md section 9 (Instrumentation)` -- form events at `parts.detail.sellerLink.add` -- `src/components/parts/seller-link-section.tsx:46-50` wires `useFormInstrumentation` with the correct `formId`. All `data-testid` attributes from section 9 are present.
- `plan.md section 12 (UX/UI)` -- logo rendering matching VendorInfo pattern -- `src/components/parts/seller-link-section.tsx:115-121` mirrors the `vendor-info.tsx:57-61` conditional logo display.
- `plan.md section 13 (Test Plan)` -- five scenarios covering empty state, add, cancel, remove, partial remove -- `tests/e2e/parts/part-seller-links.spec.ts:6-213` covers all five scenarios.
- `plan.md section 2 (page object extensions)` -- `tests/support/page-objects/parts-page.ts:425-472` adds all planned locators and helpers.

**Gaps / deviations**

- `plan.md section 13 (Test Plan)` called for using `parts.createSellerLinkSelectorHarness()` (via the page object's scoped harness factory). The spec at `tests/e2e/parts/part-seller-links.spec.ts:51-54` instead constructs the harness inline, bypassing the page object method and leaving `createSellerLinkSelectorHarness()` as dead code.
- `plan.md section 9` listed `data-testid="parts.detail.seller-links.form.seller"` as the wrapper for the seller selector. The component at `src/components/parts/seller-link-section.tsx:164` correctly applies this, but the spec at line 53 re-queries it from `page` instead of using the page object's `sellerLinksFormSellerWrapper` locator, which is inconsistent with the page object strategy.

---

## 3) Correctness -- Findings (ranked)

- Title: `Minor -- Shared removeMutation.isPending disables all remove buttons simultaneously`
- Evidence: `src/components/parts/seller-link-section.tsx:131` -- `disabled={removeMutation.isPending}`
- Impact: When a user clicks "Remove" on one seller link, all remove buttons in every row become disabled until that mutation resolves. Functionally correct (prevents double-deletion), but UX is slightly misleading since unrelated rows appear disabled. The confirmation dialog already prevents concurrent removals, so the `disabled` guard on the button is largely redundant.
- Fix: Either track which `seller_link_id` is being removed and only disable that row's button, or accept the current behavior since the confirmation dialog serializes removals. No correctness issue, just a UX polish opportunity.
- Confidence: High

- Title: `Minor -- Spec creates SellerSelectorHarness inline, bypassing page object helper`
- Evidence: `tests/e2e/parts/part-seller-links.spec.ts:51-54` -- `const sellerHarness = new SellerSelectorHarness(page, page.getByTestId('parts.detail.seller-links.form.seller'))` versus `tests/support/page-objects/parts-page.ts:470-471` -- `createSellerLinkSelectorHarness()` which does the identical thing.
- Impact: `createSellerLinkSelectorHarness()` is dead code. If the `data-testid` value changes in the component, both the page object method and the inline construction in the spec would need updating, whereas using the page object would centralize the locator.
- Fix: Replace the inline construction in the spec with `parts.createSellerLinkSelectorHarness()` and remove the direct `SellerSelectorHarness` import from the spec file.
- Confidence: High

---

## 4) Over-Engineering & Refactoring Opportunities

No over-engineering observed. The component is appropriately sized -- it extracts the seller link concern out of the 767-line `part-details.tsx` into a focused ~207-line component. State management is straightforward (three `useState` hooks, two mutation hooks, one confirm hook, one instrumentation hook). No unnecessary abstractions were introduced.

- Hotspot: The `<input>` element at `src/components/parts/seller-link-section.tsx:172-179` uses raw Tailwind utility classes for styling instead of reusing a shared `Input` component from `src/components/primitives/` or `src/components/ui/`.
- Evidence: `src/components/parts/seller-link-section.tsx:172-179` -- `<input type="url" ... className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">`
- Suggested refactor: If a shared `Input` primitive exists in the project's UI components, use it here for consistency. If not, the inline styling is acceptable.
- Payoff: Consistent styling and behavior (e.g., disabled states, error states) across all text inputs in the application.

---

## 5) Style & Consistency

- Pattern: The spec uses both inline harness construction and page object locators in the same test.
- Evidence: `tests/e2e/parts/part-seller-links.spec.ts:51-54` creates a `SellerSelectorHarness` inline, while the same spec at lines 47-48, 60, 67, 73, 76-78 uses `parts.sellerLinksAddButton`, `parts.sellerLinksFormLinkInput`, `parts.sellerLinksFormSubmit`, `parts.sellerLinksForm` from the page object.
- Impact: Inconsistent selector strategy within a single spec. Other specs in the project (e.g., `parts-page.ts:406-411 selectSellerInDialog`) use the page object's harness factory method.
- Recommendation: Use `parts.createSellerLinkSelectorHarness()` to align with the codebase pattern where harness creation is centralized in the page object.

- Pattern: `handleRemove` does not track instrumentation events for the delete flow.
- Evidence: `src/components/parts/seller-link-section.tsx:86-99` -- the remove handler calls `confirm` and then `removeMutation.mutateAsync` but emits no `form` or `mutation` instrumentation events.
- Impact: The plan (section 9) only specified instrumentation for the add form flow, so this is consistent with the plan. However, the test at `tests/e2e/parts/part-seller-links.spec.ts:152` relies on `waitForListLoading` after removal, which works because the mutation triggers a query refetch. No instrumentation gap for current test needs.
- Recommendation: No action needed now. If future tests need more precise removal synchronization, a form instrumentation hook for the delete flow could be added.

---

## 6) Tests & Deterministic Coverage (new/changed behavior only)

- Surface: Part detail -- seller link section visibility
- Scenarios:
  - Given a part with no seller links, When the detail page loads, Then the Seller Links section is visible with "No seller links yet." and an "Add Seller Link" button (`tests/e2e/parts/part-seller-links.spec.ts:6-25`)
- Hooks: `waitForListLoading(page, 'parts.detail', 'ready')` via `parts.waitForDetailReady()`, `data-testid="parts.detail.seller-links"`, `data-testid="parts.detail.seller-links.empty"`, `data-testid="parts.detail.seller-links.add-button"`
- Gaps: None.
- Evidence: `tests/e2e/parts/part-seller-links.spec.ts:6-25`

- Surface: Part detail -- add seller link via inline form
- Scenarios:
  - Given a part and a seller exist, When the user opens the add form, selects the seller, enters a URL, and submits, Then the link appears in the list and the form closes (`tests/e2e/parts/part-seller-links.spec.ts:27-82`)
- Hooks: `waitTestEvent(page, 'form', ...)` for `parts.detail.sellerLink.add` success, `waitForListLoading(page, 'parts.detail', 'ready')`, `SellerSelectorHarness`, all `data-testid` selectors
- Gaps: None.
- Evidence: `tests/e2e/parts/part-seller-links.spec.ts:27-82`

- Surface: Part detail -- cancel add form
- Scenarios:
  - Given the add form is open, When the user clicks Cancel, Then the form closes without any server call (`tests/e2e/parts/part-seller-links.spec.ts:84-110`)
- Hooks: `data-testid="parts.detail.seller-links.form.cancel"`, `data-testid="parts.detail.seller-links.form"`
- Gaps: None.
- Evidence: `tests/e2e/parts/part-seller-links.spec.ts:84-110`

- Surface: Part detail -- remove a seller link
- Scenarios:
  - Given a part with one factory-seeded seller link, When the user clicks remove and confirms, Then the link disappears and the empty state returns (`tests/e2e/parts/part-seller-links.spec.ts:112-159`)
- Hooks: `waitForListLoading(page, 'parts.detail', 'ready')`, confirmation dialog via `page.getByRole('dialog')`, `data-testid="parts.detail.seller-links.row.remove"`
- Gaps: None.
- Evidence: `tests/e2e/parts/part-seller-links.spec.ts:112-159`

- Surface: Part detail -- remove one of two seller links
- Scenarios:
  - Given a part with two factory-seeded seller links, When the user removes one, Then only that link disappears and the other remains (`tests/e2e/parts/part-seller-links.spec.ts:161-213`)
- Hooks: Same as above, plus assertions on both rows.
- Gaps: None.
- Evidence: `tests/e2e/parts/part-seller-links.spec.ts:161-213`

---

## 7) Adversarial Sweep (must attempt >= 3 credible failures or justify none)

- Checks attempted: Derived state driving writes, race conditions, query cache consistency, missing effect cleanup, stale closures, double-submission
- Evidence: `src/components/parts/seller-link-section.tsx:32-99`, `src/lib/api/generated/hooks.ts:1587-1623`
- Why code held up:
  1. **Derived state driving writes** -- The component reads `part.seller_links` as a prop (derived from the TanStack Query cache) and never writes back to it directly. Mutations go through the generated hooks which invalidate the cache. No filtered-view-drives-write pattern exists.
  2. **Race condition: rapid add then remove** -- A user could theoretically add a link and immediately try to remove it before the query refetch completes. However, the add form resets and closes on success (`src/components/parts/seller-link-section.tsx:74-75`), and the new row only appears after the refetch renders fresh `sellerLinks` props. The remove button would not be available until the row renders, so the race window is effectively zero.
  3. **Stale closure in handleSubmit** -- `handleSubmit` at line 64 closes over `sellerId` and `linkUrl` state. Since these are `useState` values read synchronously at call time and the function is not stored in a ref or passed to a long-lived callback, staleness is not a risk. The `trackSubmit`/`trackSuccess`/`trackError` functions are stable `useCallback` wrappers from `useFormInstrumentation` that read through `snapshotRef`.
  4. **Double-submission** -- The submit button at line 185 is `disabled={!isAddFormValid || addMutation.isPending}`, which prevents double-clicks. The cancel button at line 194 is `disabled={addMutation.isPending}`, preventing form dismissal during in-flight submission.
  5. **Effect cleanup for form instrumentation** -- `useFormInstrumentation` at `src/hooks/use-form-instrumentation.ts:92-104` uses a `useEffect` that tracks `isOpen` transitions. When `isOpen` goes from `true` to `false` (via `resetForm`), `lastIsOpenRef.current` is set to `false`. No stale subscription remains.

---

## 8) Invariants Checklist (table)

- Invariant: The Seller Links section is always visible on the part detail screen, regardless of whether seller links exist.
  - Where enforced: `src/components/parts/seller-link-section.tsx:102-205` renders unconditionally; `src/components/parts/part-details.tsx:521-524` places the component without a conditional wrapper.
  - Failure mode: If someone re-adds a `length > 0` guard around the `<SellerLinkSection>` in `part-details.tsx`.
  - Protection: The Playwright spec `tests/e2e/parts/part-seller-links.spec.ts:6-25` explicitly asserts the section and add button are visible when the seller links array is empty.
  - Evidence: `src/components/parts/part-details.tsx:521-524`, `tests/e2e/parts/part-seller-links.spec.ts:21-24`

- Invariant: After a successful add mutation, the form resets and closes; after a failed add mutation, the form stays open with values preserved.
  - Where enforced: `src/components/parts/seller-link-section.tsx:69-79` -- `resetForm()` is called only in the `try` block after `trackSuccess()`.
  - Failure mode: Moving `resetForm()` before `mutateAsync` or into a `finally` block.
  - Protection: The Playwright spec `tests/e2e/parts/part-seller-links.spec.ts:63-73` asserts the form is hidden after a successful add and the new link is visible.
  - Evidence: `src/components/parts/seller-link-section.tsx:69-79`, `tests/e2e/parts/part-seller-links.spec.ts:63-73`

- Invariant: Each `SellerLinkSection` manages its own confirmation dialog independently from the `PartDetails` delete-part dialog.
  - Where enforced: `src/components/parts/seller-link-section.tsx:43` creates its own `useConfirm()` instance; `src/components/parts/seller-link-section.tsx:204` renders its own `<ConfirmDialog />`. `src/components/parts/part-details.tsx:52,764` has its own independent `useConfirm` + `<ConfirmDialog />`.
  - Failure mode: Sharing a single `useConfirm` instance between the parent and child would cause dialog conflicts.
  - Protection: Two separate `useConfirm` calls produce independent state. The `useConfirm` hook at `src/hooks/use-confirm.ts:16-24` uses `useState` local to each call site.
  - Evidence: `src/components/parts/seller-link-section.tsx:43,204`, `src/components/parts/part-details.tsx:52,764`

---

## 9) Questions / Needs-Info

No unresolved questions. The implementation aligns with the plan, the generated hooks match expected signatures, and all test infrastructure (factories, harnesses, fixtures) is already available.

---

## 10) Risks & Mitigations (top 3)

- Risk: The `createSellerLinkSelectorHarness()` page object method is dead code, which could confuse future contributors who see it but notice the spec uses inline construction.
- Mitigation: Update the spec to use the page object method and remove the direct `SellerSelectorHarness` import from the spec.
- Evidence: `tests/support/page-objects/parts-page.ts:470-471`, `tests/e2e/parts/part-seller-links.spec.ts:3,51-54`

- Risk: The raw `<input>` element at `src/components/parts/seller-link-section.tsx:172-179` uses hand-crafted Tailwind classes. If the project has a shared `Input` component, this deviates from the UI composition pattern and may not get future styling updates.
- Mitigation: Verify whether a shared `Input` primitive exists in `src/components/primitives/` or `src/components/ui/`. If so, switch to it. If not, the inline styling is acceptable.
- Evidence: `src/components/parts/seller-link-section.tsx:172-179`

- Risk: Broad `queryClient.invalidateQueries()` in the generated mutation hooks causes unnecessary refetches of all active queries after each seller link add/remove.
- Mitigation: Acknowledged as acceptable in the plan (section 15). No action needed now; optimize if performance degrades.
- Evidence: `src/lib/api/generated/hooks.ts:1597-1599,1618-1620`

---

## 11) Confidence

Confidence: High -- The change is additive, uses established patterns (generated hooks, form instrumentation, useConfirm, SellerSelector reuse), passes type-check and lint, and has comprehensive Playwright coverage. The two conditions (dead page object method, inline harness construction in spec) are straightforward to resolve.

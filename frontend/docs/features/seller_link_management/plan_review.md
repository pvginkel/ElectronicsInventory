# Seller Link Management -- Plan Review

## 1) Summary & Decision

**Readiness**

The plan is thorough, well-researched, and implementation-ready. It correctly identifies the generated mutation hooks, reuses the existing `SellerSelector` and `useConfirm` patterns, and proposes a clean additive change. The test plan covers all primary workflows with appropriate instrumentation, factory seeding, and deterministic waits. Naming conventions align with codebase standards, the `ConfirmDialog` rendering responsibility is explicit, the `logo_url` field is addressed in the UX section, and the product brief divergence is acknowledged.

**Decision**
`GO` -- The plan is complete and can proceed to implementation.

---

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/commands/plan_feature.md` -- Pass -- All 17 required sections (0-16) are present and populated with appropriate templates.
- `docs/product_brief.md` -- Pass -- `plan.md:63` explicitly acknowledges the divergence between the product brief's single seller/link model and the backend's multi-link reality: "The product brief (`docs/product_brief.md:51`) describes a single seller/link pair per part. The backend has since evolved to support multiple seller links per part via dedicated endpoints."
- `docs/contribute/architecture/application_overview.md` -- Pass -- `plan.md:118-119` notes direct API type consumption without camelCase adapters, consistent with the existing `part-details.tsx` pattern and the architecture doc's guidance that custom hooks adapt responses when needed.
- `docs/contribute/testing/playwright_developer_guide.md` -- Pass -- `plan.md:350-386` specifies API-first data setup via factories, deterministic waits via test-event signals (`waitTestEvent`, `waitForListLoading`), `data-testid` selectors, scoped `SellerSelectorHarness`, and no route interception. All patterns align with the guide.

**Fit with codebase**

- `SellerSelector` -- `plan.md:66` -- Confirmed reusable as-is. The component at `src/components/sellers/seller-selector.tsx` accepts `value`/`onChange` and handles inline creation.
- `useFormInstrumentation` -- `plan.md:281` -- Form ID `parts.detail.sellerLink.add` follows the dot-delimited namespaced convention used elsewhere (e.g., `sellers.selector.create` at `src/components/sellers/seller-selector.tsx:146`).
- `useConfirm` / `ConfirmDialog` -- `plan.md:67,91-92,185,342-343` -- Explicitly documented that `SellerLinkSection` creates its own `useConfirm` instance and renders its own `<ConfirmDialog {...confirmProps} />`, independent of the `PartDetails` instance.
- Generated mutation hooks -- `plan.md:64` -- Verified at `src/lib/api/generated/hooks.ts:1587-1623`. Both hooks exist with the exact signatures described.
- `createPartSellerLink` factory -- `plan.md:17` -- Verified at `tests/api/factories/seller-factory.ts:158-169`.
- `SellerSelectorHarness` scoping -- `plan.md:359` -- Correctly documents constructing the harness with a scoped root locator: `new SellerSelectorHarness(page, page.getByTestId('parts.detail.seller-links.form.seller'))`.
- `logo_url` rendering -- `plan.md:339` -- UX section documents showing the seller logo when `logo_url` is available, matching the `VendorInfo` pattern at `src/components/parts/vendor-info.tsx:57-59`.

---

## 3) Open Questions & Ambiguities

No blocking open questions remain. The plan addresses all previously identified ambiguities:

- Product brief divergence: acknowledged at `plan.md:63`.
- `ConfirmDialog` rendering: explicit at `plan.md:67,91-92`.
- `logo_url` handling: documented at `plan.md:339`.
- `SellerSelectorHarness` scoping: specified at `plan.md:359`.

---

## 4) Deterministic Playwright Coverage (new/changed behavior only)

- Behavior: Add seller link flow
- Scenarios:
  - Given a part with no seller links, When the user opens the detail screen, Then the Seller Links section shows empty state text and an "Add Seller Link" button (`tests/e2e/parts/part-seller-links.spec.ts`)
  - Given a part with no seller links and a seller exists, When the user adds a seller link, Then the link appears in the list and the form closes (`tests/e2e/parts/part-seller-links.spec.ts`)
  - Given the add form is open, When the user clicks "Cancel", Then the form closes without changes (`tests/e2e/parts/part-seller-links.spec.ts`)
- Instrumentation: `waitTestEvent(page, 'form', evt => evt.formId === 'parts.detail.sellerLink.add' && evt.phase === 'success')`, `waitForListLoading(page, 'parts.detail', 'ready')`, `data-testid` selectors from section 9, `SellerSelectorHarness` scoped to `parts.detail.seller-links.form.seller`
- Backend hooks: `testData.sellers.create()`, `testData.parts.create()`
- Gaps: None.
- Evidence: `plan.md:350-361`

---

- Behavior: Remove seller link flow
- Scenarios:
  - Given a part with one seller link (seeded), When the user removes it and confirms, Then the link disappears (`tests/e2e/parts/part-seller-links.spec.ts`)
  - Given a part with two seller links (seeded), When the user removes one, Then only the removed link disappears (`tests/e2e/parts/part-seller-links.spec.ts`)
- Instrumentation: `waitForListLoading(page, 'parts.detail', 'ready')`, `data-testid="parts.detail.seller-links.row.remove"`, dialog confirmation
- Backend hooks: `testData.sellers.create()` + `testData.sellers.createPartSellerLink(partKey, sellerId, link)`
- Gaps: None.
- Evidence: `plan.md:365-374`

---

- Behavior: Seller Links section always visible
- Scenarios:
  - Given a part with no seller links, When the detail page loads, Then heading and add button are visible
  - Given a part with seller links, When the detail page loads, Then links are displayed with remove buttons
- Instrumentation: `data-testid="parts.detail.seller-links"`, `data-testid="parts.detail.seller-links.empty"`
- Backend hooks: `testData.parts.create()`
- Gaps: None.
- Evidence: `plan.md:378-386`

---

## 5) Adversarial Sweep

- Checks attempted: form ID naming conventions, ConfirmDialog rendering responsibility, logo_url consistency, SellerSelectorHarness scoping, product brief alignment, cache invalidation scope, race conditions on concurrent mutations, stale data after navigation
- Evidence: `plan.md:63` (product brief), `plan.md:67,91-92,185,342-343` (ConfirmDialog), `plan.md:281` (form ID), `plan.md:339` (logo_url), `plan.md:359` (harness scoping), `plan.md:228-229` (concurrency safeguards), `plan.md:132-134` (cache invalidation)
- Why the plan holds: All previously identified issues have been addressed. The form ID uses the dot-delimited namespace (`parts.detail.sellerLink.add`). The `ConfirmDialog` rendering is explicitly documented in the file map, assumptions, flow description, and UX section. The `logo_url` field is handled in the UX description with fallback for null values. The `SellerSelectorHarness` scoping is documented with the exact constructor call. Cache invalidation uses the broad `queryClient.invalidateQueries()` from the generated hooks, which is the established pattern and acceptable for this scope. The `isPending` flag prevents double-submission, and no optimistic updates are used, eliminating stale-data risks.

---

## 6) Derived-Value & State Invariants

- Derived value: `sellerLinks`
  - Source dataset: `part.seller_links ?? []` from the unfiltered `useGetPartsByPartKey` query response
  - Write / cleanup triggered: Read-only. Mutations invalidate the query cache, causing a refetch.
  - Guards: Nullish coalescing ensures an empty array.
  - Invariant: The displayed list always reflects server state after a successful mutation; no optimistic updates, no filtered writes.
  - Evidence: `plan.md:197-203`

- Derived value: `isAddFormOpen`
  - Source dataset: Local `useState<boolean>(false)` in `SellerLinkSection`
  - Write / cleanup triggered: Set to `true` on button click, reset to `false` on success or cancel.
  - Guards: Button disabled while mutation is pending.
  - Invariant: Only one add form instance is open at a time. Fields reset on close.
  - Evidence: `plan.md:207-212`

- Derived value: `isAddFormValid`
  - Source dataset: Derived from local form state: `sellerId !== undefined && linkUrl.trim().length > 0`
  - Write / cleanup triggered: Re-evaluated on field change. Controls submit button disabled state.
  - Guards: Client-side only; server enforces real constraints.
  - Invariant: Submit button enabled only when both fields have values. No persistent write depends on this value.
  - Evidence: `plan.md:216-221`

No filtered-view-to-persistent-write concerns.

---

## 7) Risks & Mitigations (top 3)

- Risk: Broad `queryClient.invalidateQueries()` causes unnecessary refetches of unrelated queries after each add/remove.
- Mitigation: Acceptable for scope. This is the established pattern in the generated hooks. Override `onSuccess` to target specific query keys if performance becomes a concern.
- Evidence: `plan.md:408-410`, `src/lib/api/generated/hooks.ts:1597-1599`

- Risk: `SellerSelector` mounts its own `useGetSellers` query when the add form opens, adding a network request.
- Mitigation: TanStack Query caches the sellers list; subsequent opens within the stale window are instant. The selector's existing loading UI handles the brief spinner.
- Evidence: `plan.md:414-416`, `src/components/sellers/seller-selector.tsx:31-36`

- Risk: Multiple `useConfirm` instances on the same page could cause confusion if dialogs overlap.
- Mitigation: `SellerLinkSection` uses its own independent `useConfirm` instance, and normal UI flow prevents both the part-delete and seller-link-remove dialogs from being triggered simultaneously.
- Evidence: `plan.md:420-422`, `src/hooks/use-confirm.ts:16-24`

---

## 8) Confidence

Confidence: High -- The plan is thorough, all previously identified issues have been addressed, and the change is well-scoped with established precedents in the codebase.

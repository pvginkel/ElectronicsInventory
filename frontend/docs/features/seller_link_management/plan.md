# Seller Link Management -- Technical Plan

## 0) Research Log & Findings

**Searched areas:**

- `src/components/parts/part-details.tsx` -- existing part detail page; seller links rendered as read-only `DescriptionList` items at lines 520-533, conditionally hidden when the array is empty.
- `src/components/parts/part-form.tsx` -- part edit form; line 571-575 contains a note that seller links are managed from the detail screen.
- `src/components/sellers/seller-selector.tsx` -- reusable seller picker backed by `useSellers()` hook with inline-create support via `SellerCreateDialog`.
- `src/components/parts/vendor-info.tsx` -- card-level seller chip renderer; no management affordances.
- `src/lib/api/generated/hooks.ts` -- generated mutation hooks `usePostPartsSellerLinksByPartKey` (line 1587) and `useDeletePartsSellerLinksByPartKeyAndSellerLinkId` (line 1608) already exist. Both call `queryClient.invalidateQueries()` on success.
- `src/lib/api/generated/types.ts` -- `PartSellerCreateSchema.f085a8d` expects `{ seller_id: number; link: string }`. `PartSellerLinkSchema` response includes `id`, `seller_id`, `seller_name`, `seller_website`, `link`, `logo_url`, `created_at`.
- `src/hooks/use-sellers.ts` -- wraps `useGetSellers` with optional search filtering.
- `src/hooks/use-form-instrumentation.ts` -- canonical form lifecycle tracking hook.
- `src/lib/test/query-instrumentation.ts` -- `useListLoadingInstrumentation` for list/detail loading signals.
- `src/lib/test/form-instrumentation.ts` -- `generateFormId`, `trackFormOpen/Submit/Success/Error/ValidationError`.
- `tests/api/factories/seller-factory.ts` -- `createPartSellerLink(partKey, sellerId, link)` already available.
- `tests/api/index.ts` -- `testData.sellers.createPartSellerLink` is exposed.
- `tests/support/page-objects/parts-page.ts` -- parts page object with detail helpers.
- `tests/support/page-objects/seller-selector-harness.ts` -- harness for the `SellerSelector` component.
- `src/hooks/use-confirm.ts` -- promise-based confirmation dialog hook used by part delete flow.

**Key findings:**

- The generated mutation hooks already invalidate all queries on success, so the part detail will refetch automatically after add/remove.
- `SellerSelector` already supports inline seller creation, so we can reuse it as-is in the add form.
- The seller links section in `part-details.tsx` is conditionally rendered only when `(part.seller_links ?? []).length > 0`; this must change to always-visible.
- No new custom hooks are needed; the generated hooks are sufficient.

---

## 1) Intent & Scope

**User intent**

Allow users to add and remove seller links directly from the part detail screen, completing the management loop that the backend already supports.

**Prompt quotes**

- "Add UI on the part detail screen for managing seller links (add and remove)."
- "The backend endpoints already exist (`POST /api/parts/{part_key}/seller-links` and `DELETE /api/parts/{part_key}/seller-links/{seller_link_id}`)."
- "The part detail page currently displays seller links as a read-only list but has no way to add or remove them."
- "Seller Links section should always be visible (even when empty) so the user can add the first link."

**In scope**

- Always-visible Seller Links section on the part detail screen.
- Inline add form with a seller selector and link URL input.
- Remove button on each seller link row with confirmation dialog.
- Form instrumentation (open/submit/success/error) for the add flow.
- `data-testid` attributes for all new interactive elements.
- Playwright spec covering add and remove workflows.

**Out of scope**

- Editing an existing seller link (no update endpoint exists).
- Bulk add/remove of seller links.
- Changes to the part card list view (`VendorInfo` component).
- Changes to the `PartForm` (edit/create) screen.

**Assumptions / constraints**

- The product brief (`docs/product_brief.md:51`) describes a single seller/link pair per part. The backend has since evolved to support multiple seller links per part via dedicated endpoints. This plan implements against the actual backend API (multiple seller links), which is the ground truth.
- The generated mutation hooks (`usePostPartsSellerLinksByPartKey`, `useDeletePartsSellerLinksByPartKeyAndSellerLinkId`) are stable and will not change shape.
- Both mutations already call `queryClient.invalidateQueries()` on success, which is sufficient to refresh the part detail query.
- The `SellerSelector` component can be reused without modification.
- The `useConfirm` hook will handle delete confirmation. `SellerLinkSection` creates its own `useConfirm` instance and renders its own `<ConfirmDialog />`, independent of the one in `PartDetails`.

---

## 1a) User Requirements Checklist

**User Requirements Checklist**

- [ ] Add an "Add seller link" button/form on the part detail screen with a seller selector and link URL input
- [ ] Add a remove/delete button on each existing seller link row
- [ ] Part detail refreshes after adding or removing a seller link
- [ ] Seller Links section is always visible on the detail screen, even when empty (so the user can add the first link)

---

## 2) Affected Areas & File Map

- Area: `src/components/parts/part-details.tsx`
- Why: The seller links section (lines 520-533) must change from conditional to always-visible, gain a remove button per row, and host the new add seller link form.
- Evidence: `src/components/parts/part-details.tsx:520-533` -- `{(part.seller_links ?? []).length > 0 && (<div>...<SectionHeading>Seller Links</SectionHeading>...)}` renders seller links conditionally.

---

- Area: `src/components/parts/seller-link-section.tsx` (new file)
- Why: Extract seller link management into a dedicated component to keep `part-details.tsx` manageable. Contains the always-visible section, the add form toggle, the inline form, per-row remove buttons, and its own `useConfirm` + `<ConfirmDialog />` instance for removal confirmation (independent of the `PartDetails` delete-part dialog).
- Evidence: New component; replaces the inline block at `src/components/parts/part-details.tsx:520-533`. The `useConfirm` pattern is at `src/hooks/use-confirm.ts`; each call creates independent state, so the component must render its own `<ConfirmDialog {...confirmProps} />`.

---

- Area: `tests/e2e/parts/part-seller-links.spec.ts` (new file)
- Why: Playwright coverage for the add and remove seller link workflows.
- Evidence: Follows pattern of `tests/e2e/parts/part-crud.spec.ts` and `tests/e2e/parts/part-deletion.spec.ts`.

---

- Area: `tests/support/page-objects/parts-page.ts`
- Why: Add locators and helpers for the new seller link section (add button, form fields, remove buttons, seller link rows).
- Evidence: `tests/support/page-objects/parts-page.ts:156-178` -- existing detail helpers.

---

## 3) Data Model / Contracts

- Entity / contract: `PartSellerCreateSchema.f085a8d` (POST request body)
- Shape: `{ seller_id: number; link: string }`
- Mapping: UI form collects `sellerId` (from `SellerSelector`) and `linkUrl` (from text input), mapped directly to `seller_id` and `link`.
- Evidence: `src/lib/api/generated/types.ts:5620-5636`

---

- Entity / contract: `PartSellerLinkSchema` (POST response / part detail nested object)
- Shape: `{ id: number; seller_id: number; seller_name: string; seller_website: string; link: string; logo_url: string | null; created_at: string }`
- Mapping: Used directly from the part detail response at `part.seller_links[]`. No camelCase adapter needed since the component consumes API types directly (consistent with existing usage in `part-details.tsx`).
- Evidence: `src/lib/api/generated/types.ts:5542-5582`

---

- Entity / contract: DELETE path parameters
- Shape: `{ part_key: string; seller_link_id: number }`
- Mapping: `partId` prop supplies `part_key`; `sl.id` from the seller link row supplies `seller_link_id`.
- Evidence: `src/lib/api/generated/types.ts:11181-11188`

---

- Entity / contract: TanStack Query cache key for part detail
- Shape: `['getPartsByPartKey', { path: { part_key: partId } }]`
- Mapping: Both mutations call `queryClient.invalidateQueries()` on success (broad invalidation), which will refetch this key automatically.
- Evidence: `src/lib/api/generated/hooks.ts:1486-1494` (query key), `1597-1599` (POST onSuccess), `1619` (DELETE onSuccess)

---

## 4) API / Integration Surface

- Surface: `POST /api/parts/{part_key}/seller-links` via `usePostPartsSellerLinksByPartKey`
- Inputs: `{ path: { part_key: string }; body: { seller_id: number; link: string } }`
- Outputs: `PartSellerLinkSchema` (201 Created). On success, `queryClient.invalidateQueries()` triggers part detail refetch.
- Errors: 400 (validation -- missing fields, invalid URL), 404 (part not found or seller not found). Errors surface through centralized toast via `ApiError`.
- Evidence: `src/lib/api/generated/hooks.ts:1587-1603`

---

- Surface: `DELETE /api/parts/{part_key}/seller-links/{seller_link_id}` via `useDeletePartsSellerLinksByPartKeyAndSellerLinkId`
- Inputs: `{ path: { part_key: string; seller_link_id: number } }`
- Outputs: 204 No Content. On success, `queryClient.invalidateQueries()` triggers part detail refetch.
- Errors: 404 (link or part not found). Errors surface through centralized toast.
- Evidence: `src/lib/api/generated/hooks.ts:1608-1623`

---

- Surface: `GET /api/sellers` via `useGetSellers` (consumed inside `SellerSelector`)
- Inputs: None
- Outputs: Array of `SellerResponseSchema` (id, name, website). Cached by TanStack Query.
- Errors: Toast on failure (handled inside `SellerSelector`).
- Evidence: `src/components/sellers/seller-selector.tsx:31-36`

---

## 5) Algorithms & UI Flows

- Flow: Add Seller Link
- Steps:
  1. User clicks "Add Seller Link" button in the Seller Links section.
  2. An inline form appears below the button with a `SellerSelector` and a URL text input.
  3. User selects a seller (or creates one inline via the selector's built-in dialog).
  4. User enters the product page URL.
  5. User clicks "Add" to submit.
  6. Component calls `usePostPartsSellerLinksByPartKey` with `{ path: { part_key: partId }, body: { seller_id, link } }`.
  7. On success: form resets and closes; query invalidation causes part detail to refetch; the new link appears in the list.
  8. On error: centralized error toast fires; form stays open with values preserved.
- States / transitions: `idle` -> `formOpen` -> `submitting` -> `idle` (success) or `formOpen` (error).
- Hotspots: The `SellerSelector` triggers its own `useGetSellers` query on mount; if the sellers list is large this adds a brief loading state. This is already handled by the selector's loading UI.
- Evidence: `src/lib/api/generated/hooks.ts:1587-1603`

---

- Flow: Remove Seller Link
- Steps:
  1. User clicks the remove button (trash icon or "Remove" text) on a seller link row.
  2. `SellerLinkSection` calls its local `useConfirm().confirm(...)` which opens the component's own `<ConfirmDialog />`: "Remove seller link? This will remove the link to {seller_name}."
  3. User confirms.
  4. Component calls `useDeletePartsSellerLinksByPartKeyAndSellerLinkId` with `{ path: { part_key: partId, seller_link_id: sl.id } }`.
  5. On success: query invalidation causes part detail to refetch; the link disappears from the list.
  6. On error: centralized error toast fires.
- States / transitions: `idle` -> `confirmDialog` -> `deleting` -> `idle`.
- Hotspots: None; the mutation is lightweight.
- Evidence: `src/lib/api/generated/hooks.ts:1608-1623`, `src/hooks/use-confirm.ts`

---

## 6) Derived State & Invariants

- Derived value: `sellerLinks`
  - Source: `part.seller_links ?? []` from the `useGetPartsByPartKey` query response.
  - Writes / cleanup: Read-only derived value. Mutations (add/remove) invalidate the query cache, which causes a fresh fetch.
  - Guards: Nullish coalescing ensures an empty array when the field is undefined (the field is optional in the schema).
  - Invariant: The displayed list always reflects the server state after a successful mutation; no optimistic updates are used.
  - Evidence: `src/components/parts/part-details.tsx:520` -- `(part.seller_links ?? [])`

---

- Derived value: `isAddFormOpen`
  - Source: Local `useState<boolean>(false)` inside the new `SellerLinkSection` component.
  - Writes / cleanup: Set to `true` on "Add" button click, reset to `false` on successful submission or cancel.
  - Guards: Button is disabled while a mutation is pending. Form does not open during loading states.
  - Invariant: Only one add form instance is open at a time.
  - Evidence: New component state.

---

- Derived value: `isAddFormValid`
  - Source: Derived from form fields: `sellerId !== undefined && linkUrl.trim().length > 0`.
  - Writes / cleanup: Re-evaluated on every field change. Submit button disabled when invalid.
  - Guards: Client-side validation is a UX convenience; the server enforces the real constraints.
  - Invariant: Submit button is only enabled when both fields have values.
  - Evidence: New component logic.

---

## 7) State Consistency & Async Coordination

- Source of truth: TanStack Query cache for the `getPartsByPartKey` query.
- Coordination: The `SellerLinkSection` component receives `part.seller_links` as a prop from `PartDetails`. After a mutation succeeds, the generated hooks call `queryClient.invalidateQueries()`, which triggers a refetch of the part detail query. React re-renders `PartDetails` with updated data, which flows down to `SellerLinkSection`.
- Async safeguards: The mutation hooks handle concurrent calls safely (TanStack Query deduplication). The `isPending` flag on each mutation prevents double-submission. No abort controllers needed since mutations are fire-and-forget with error handling.
- Instrumentation: The add form emits `form` test events (open, submit, success, error) via `useFormInstrumentation`. The part detail already emits `list_loading` events via `useListLoadingInstrumentation` at scope `parts.detail` -- these fire on refetch after mutations.
- Evidence: `src/lib/api/generated/hooks.ts:1597-1599` (onSuccess invalidation), `src/components/parts/part-details.tsx:171-194` (existing detail instrumentation)

---

## 8) Errors & Edge Cases

- Failure: Add seller link fails with 400 (validation error)
- Surface: `SellerLinkSection` add form
- Handling: Centralized toast displays the error message. Form stays open with values preserved so the user can correct and retry.
- Guardrails: Client-side validation (both fields required) prevents most 400s. The `SellerSelector` only produces valid seller IDs.
- Evidence: `src/lib/api/generated/hooks.ts:1593-1594` (throw toApiError)

---

- Failure: Add seller link fails with 404 (part not found)
- Surface: `SellerLinkSection` add form
- Handling: Centralized toast displays the error. This is an edge case that would only occur if the part was deleted in another session while the user was viewing it.
- Guardrails: None beyond the toast; the user can navigate away.
- Evidence: `src/lib/api/generated/types.ts:11161-11168` (404 response)

---

- Failure: Remove seller link fails with 404
- Surface: `SellerLinkSection` remove button
- Handling: Centralized toast. The link may have already been removed (race condition with another session). The refetch after error will update the displayed list.
- Guardrails: None required; the outcome is idempotent.
- Evidence: `src/lib/api/generated/types.ts:11196-11204` (DELETE 404 response)

---

- Failure: Duplicate seller link (same seller + same part)
- Surface: `SellerLinkSection` add form
- Handling: Backend returns 400 or 409 depending on constraint. Centralized toast shows the error. Form stays open.
- Guardrails: No client-side guard; the server enforces uniqueness.
- Evidence: Backend constraint (implied by data model).

---

- Failure: Empty seller links array
- Surface: `SellerLinkSection` display
- Handling: The section renders an empty state message ("No seller links yet") with the add button visible.
- Guardrails: Section is always rendered regardless of array length.
- Evidence: Change brief: "Seller Links section should always be visible (even when empty)."

---

## 9) Observability / Instrumentation

- Signal: `form` test event (phases: open, submit, success, error)
- Type: Instrumentation event via `useFormInstrumentation`
- Trigger: When the add seller link form opens, submits, succeeds, or errors. Form ID: `parts.detail.sellerLink.add`.
- Labels / fields: `{ formId: 'parts.detail.sellerLink.add', phase: 'open' | 'submit' | 'success' | 'error' }`
- Consumer: Playwright `waitTestEvent(page, 'form', evt => evt.formId === 'parts.detail.sellerLink.add' && evt.phase === 'success')`.
- Evidence: `src/hooks/use-form-instrumentation.ts:26-114`, `src/lib/test/form-instrumentation.ts:14-17`

---

- Signal: `list_loading` test event at scope `parts.detail`
- Type: Instrumentation event via existing `useListLoadingInstrumentation` in `PartDetails`
- Trigger: After mutation success triggers a refetch of the part detail query, the existing instrumentation emits `loading` then `ready`.
- Labels / fields: `{ scope: 'parts.detail', phase: 'loading' | 'ready', metadata: { partKey, ... } }`
- Consumer: Playwright `waitForListLoading(page, 'parts.detail', 'ready')` to confirm the detail has refreshed.
- Evidence: `src/components/parts/part-details.tsx:171-194`

---

- Signal: `data-testid` attributes on new elements
- Type: DOM attributes for Playwright selectors
- Trigger: Always present in rendered DOM.
- Labels / fields:
  - `parts.detail.seller-links` -- section container
  - `parts.detail.seller-links.add-button` -- "Add Seller Link" button
  - `parts.detail.seller-links.form` -- inline add form container
  - `parts.detail.seller-links.form.seller` -- seller selector wrapper
  - `parts.detail.seller-links.form.link` -- URL input
  - `parts.detail.seller-links.form.submit` -- form submit button
  - `parts.detail.seller-links.form.cancel` -- form cancel button
  - `parts.detail.seller-links.row` -- each seller link row
  - `parts.detail.seller-links.row.remove` -- remove button on each row
  - `parts.detail.seller-links.empty` -- empty state text
- Consumer: Playwright page object locators.
- Evidence: Follows naming convention from `src/components/parts/part-details.tsx` (e.g., `parts.detail.documents.add`).

---

## 10) Lifecycle & Background Work

- Hook / effect: `useFormInstrumentation` inside `SellerLinkSection`
- Trigger cadence: On mount (when `isAddFormOpen` becomes true) and on form lifecycle transitions.
- Responsibilities: Emits form open/submit/success/error events for test observability.
- Cleanup: The hook's internal `useEffect` handles cleanup when `isOpen` transitions to false.
- Evidence: `src/hooks/use-form-instrumentation.ts:92-104`

---

No additional timers, subscriptions, or polling is introduced by this change. The existing `useGetPartsByPartKey` query handles background refetch per TanStack Query defaults.

---

## 11) Security & Permissions

Not applicable. The application does not implement client-side authorization gates. All access control is enforced by the backend API. The new mutations use the same unauthenticated access pattern as existing mutations in the app.

---

## 12) UX / UI Impact

- Entry point: Part detail screen, within the Part Information card (left column).
- Change: The "Seller Links" subsection becomes always-visible. When empty, it shows "No seller links yet." text and the "Add Seller Link" button. When populated, each row shows the seller logo (if `logo_url` is available, matching the card-level `VendorInfo` display at `src/components/parts/vendor-info.tsx:57-59`), the seller name, the link URL (as an external link), and a remove button (trash icon). If `logo_url` is null, the row omits the logo and shows only the seller name and link.
- User interaction:
  - **Add:** Click "Add Seller Link" -> inline form slides in with a `SellerSelector` dropdown and a URL text input -> click "Add" to submit or "Cancel" to dismiss.
  - **Remove:** Click the trash/remove icon on a row -> confirmation dialog (rendered by `SellerLinkSection`'s own `<ConfirmDialog />`) -> confirm removes the link.
- Dependencies: `SellerSelector` component (existing), `ConfirmDialog` (existing primitive; `SellerLinkSection` renders its own instance via its local `useConfirm` hook).
- Evidence: `src/components/parts/part-details.tsx:520-533` (current conditional block), `src/components/sellers/seller-selector.tsx` (selector component), `src/components/parts/vendor-info.tsx:57-59` (logo rendering pattern)

---

## 13) Deterministic Test Plan

- Surface: Part detail -- seller link add flow
- Scenarios:
  - Given a part with no seller links, When the user opens the detail screen, Then the Seller Links section is visible with "No seller links yet." text and an "Add Seller Link" button.
  - Given a part with no seller links and a seller exists, When the user clicks "Add Seller Link", selects the seller, enters a URL, and clicks "Add", Then the seller link appears in the list and the form closes.
  - Given the add form is open, When the user clicks "Cancel", Then the form closes without submitting.
- Instrumentation / hooks:
  - `waitTestEvent(page, 'form', evt => evt.formId === 'parts.detail.sellerLink.add' && evt.phase === 'success')` for add confirmation.
  - `waitForListLoading(page, 'parts.detail', 'ready')` for detail refresh.
  - `data-testid` selectors from section 9.
  - `SellerSelectorHarness` for interacting with the seller dropdown, scoped to the form wrapper: `new SellerSelectorHarness(page, page.getByTestId('parts.detail.seller-links.form.seller'))` (the harness accepts an optional `root` locator at `tests/support/page-objects/seller-selector-harness.ts:7`).
- Gaps: None.
- Evidence: `tests/e2e/parts/part-crud.spec.ts` (pattern reference), `tests/support/page-objects/seller-selector-harness.ts`

---

- Surface: Part detail -- seller link remove flow
- Scenarios:
  - Given a part with one seller link (seeded via factory), When the user clicks the remove button and confirms, Then the seller link disappears from the list.
  - Given a part with two seller links (seeded via factory), When the user removes one, Then only the removed link disappears; the other remains.
- Instrumentation / hooks:
  - `waitForListLoading(page, 'parts.detail', 'ready')` after the delete completes.
  - `data-testid="parts.detail.seller-links.row.remove"` for the remove button.
  - Confirmation dialog interaction via `page.getByRole('dialog')` and confirm button.
- Gaps: None.
- Evidence: `tests/api/factories/seller-factory.ts:152-169` (`createPartSellerLink`), `tests/api/index.ts:84` (exposed on `testData.sellers`)

---

- Surface: Part detail -- seller link section always visible
- Scenarios:
  - Given a part with no seller links, When the detail page loads, Then the Seller Links heading and add button are visible.
  - Given a part with seller links, When the detail page loads, Then the links are displayed with remove buttons.
- Instrumentation / hooks:
  - `data-testid="parts.detail.seller-links"` for the section container.
  - `data-testid="parts.detail.seller-links.empty"` for the empty state.
- Gaps: None.
- Evidence: Change brief requirement 4.

---

## 14) Implementation Slices

- Slice: 1 -- SellerLinkSection component + part-details integration
- Goal: Always-visible seller links section with add form and remove buttons, fully instrumented.
- Touches: `src/components/parts/seller-link-section.tsx` (new), `src/components/parts/part-details.tsx` (replace inline block with component).
- Dependencies: None. Generated hooks and `SellerSelector` are already available.

---

- Slice: 2 -- Page object extensions + Playwright spec
- Goal: Automated test coverage for add and remove flows.
- Touches: `tests/support/page-objects/parts-page.ts` (add locators/helpers), `tests/e2e/parts/part-seller-links.spec.ts` (new).
- Dependencies: Slice 1 must be complete so the UI elements exist.

---

## 15) Risks & Open Questions

- Risk: Broad `queryClient.invalidateQueries()` in the generated mutation hooks invalidates all queries, not just the part detail.
- Impact: Unnecessary refetches of unrelated queries (parts list, sellers list, etc.) after each add/remove.
- Mitigation: Acceptable for this scope. If performance becomes an issue, override `onSuccess` in the mutation options to target `['getPartsByPartKey', ...]` specifically.

---

- Risk: `SellerSelector` mounts its own `useGetSellers` query, adding a network request when the add form opens.
- Impact: Brief loading spinner in the seller dropdown.
- Mitigation: TanStack Query caches the sellers list; subsequent opens within the stale window will be instant. Acceptable UX.

---

- Risk: Confirmation dialog for remove shares the `useConfirm` instance already used by the delete-part flow.
- Impact: If both dialogs were triggered simultaneously (not possible via normal UI flow), one would be lost.
- Mitigation: The new `SellerLinkSection` component will use its own `useConfirm` instance, independent of the one in `PartDetails`.

---

## 16) Confidence

Confidence: High -- The backend endpoints and generated hooks already exist, the `SellerSelector` component is proven and reusable, and the change is additive with no modifications to existing data flows. All patterns (inline forms, confirmation dialogs, test instrumentation) have established precedents in the codebase.

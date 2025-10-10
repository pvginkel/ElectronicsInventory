# Shopping List Receive Stock UI Plan

## Brief
- Implement Phase 4 — Receive & update stock (line by line) from `docs/epics/shopping_list_phases.md`, focusing on the front-end pieces that were postponed until now.
- Build the **Update Stock modal** for Ordered lines so users can see Part/Seller context, enter **Receive now**, allocate quantities to locations (increase existing or add new), and choose **Save**, **Save & next**, or **Mark Done**.
- Ensure hiding of **Update Stock** CTAs for non-Ordered lines, refresh the table when totals change, and surface confirmation when **Mark Done** fires while Received ≠ Ordered.

## Relevant Files and Functions
- `src/types/shopping-lists.ts` — extend `ShoppingListConceptLine` with `partLocations` data and define typed payloads for receive/complete actions.
- `src/hooks/use-shopping-lists.ts` — map `part_locations` from the API, add `useReceiveShoppingListLineMutation` / `useCompleteShoppingListLineMutation`, update cache reconciliation, and surface helper utilities for next-line traversal.
- `src/components/shopping-lists/ready/update-stock-dialog.tsx` (new) — modal shell, allocation editor, Mark Done confirm per `docs/contribute/ui/forms.md`.
- `src/components/shopping-lists/ready/ready-line-row.tsx` — adjust Received column styling for mismatches, expose completion notes, and guard Update Stock CTA visibility.
- `src/components/shopping-lists/ready/seller-group-card.tsx` & `seller-group-list.tsx` — pass line metadata into the modal, wire Save/Save & next handlers, and sync group totals.
- `src/routes/shopping-lists/$listId.tsx` — orchestrate modal state, toast messaging, instrumentation hooks, and next-line focusing logic.
- `src/components/parts/box-selector.tsx` & related selector helpers — reused in the allocation editor; extend only if additional validation feedback is needed.
- `tests/api/factories/shopping-list-factory.ts` — add helpers to mark lists Ready, receive lines, and complete lines through the real API.
- `tests/support/page-objects/shopping-lists-page.ts` — expose Playwright actions for opening the modal, completing the allocation form, Save & next, and mismatch confirmations.
- `tests/e2e/shopping-lists/shopping-lists.spec.ts` (or new companion spec) — add end-to-end coverage for receiving, Save & next, and mismatch-driven Mark Done flows.
- `tests/support/helpers` & `tests/support/test-events` — ensure helpers await the new `form` / `list_loading` instrumentation where needed.

## Implementation Steps
1. **Domain & Hook Enhancements**
   - Update `ShoppingListConceptLine` to carry `partLocations` (box/loc/qty) for read-only context, expose `completionMismatch` and `completionNote`, and add interfaces for receive allocations and complete payloads.
   - Extend `mapConceptLine` and seller group mappers in `use-shopping-lists.ts` to hydrate the new fields and recompute group totals that include updated Received counts.
   - Introduce `useReceiveShoppingListLineMutation` and `useCompleteShoppingListLineMutation` wrappers that call `usePostShoppingListLinesReceiveByLineId` / `usePostShoppingListLinesCompleteByLineId`, invalidate list+line queries, refresh part memberships, eagerly merge the returned line into cached list detail, and invalidate part inventory queries (`useGetPartsByPartKey`, `useGetPartsLocationsByPartKey`, dashboard snapshots) plus box-level queries (`useGetBoxes`, `useGetBoxesLocationsByBoxNo`) so stock totals stay in sync across the app.
   - Add a helper that flattens the ordered lines list to locate the “next” Ordered line for Save & next, skipping any line that no longer has `canReceive === true`.

2. **Update Stock Modal**
   - Create `update-stock-dialog.tsx` using `Dialog`, `Form`, and `useFormState` in line with `docs/contribute/ui/forms.md`.
   - Show Ordered/Received totals and list the existing `partLocations` separately (read-only), then render editable allocation rows that start empty so users enter only the incremental stock they are receiving; include an “Add location” control that composes `BoxSelector` with location/quantity inputs patterned after `part-location-grid` so each allocation captures `{ box_no, loc_no, qty }`.
   - Enforce validation for the receive submission path: `Receive now` must be integer ≥1; allocations must have positive integers; sum(allocation.qty) === receive now; no duplicate box/loc pairs within the submission. Skip the `receive now` requirement when the user triggers **Mark Done** without receiving additional stock.
   - Wire `useFormInstrumentation` with a deterministic formId `ShoppingListLineReceive:line:<id>` so tests can wait on open/submit/success/error phases; emit validation errors for Playwright when constraints fail.
   - Add secondary handling for **Mark Done**: invoke `useConfirm` + `ConfirmDialog` only when Received ≠ Ordered to request a mismatch reason; submit the collected data through `useCompleteShoppingListLineMutation`, treating the reason as optional when counts match.

3. **Route & Table Integration**
   - Replace the `handleUpdateStock` stub in `$listId.tsx` with modal state derived from the selected line, injecting seller group context and precomputing subsequent Ordered lines.
   - On Save, run the receive mutation, show success/failure toasts, close the modal, and highlight the updated line; on **Save & next**, reopen the modal bound to the next Ordered line (if any) once the receive mutation settles.
   - On **Mark Done**, guard with mismatch confirmation (per Phase 4 spec) and call the completion mutation; update highlights and ensure the UI removes the Update Stock CTA.
   - Update seller group totals and list-level instrumentation metadata after each mutation by reusing the refreshed cache output.

4. **Ready View Polish**
   - In `ready-line-row.tsx`, display Received values in the accent color when `line.hasQuantityMismatch` is true, surface `line.completionNote` via tooltip/icon, and make the status badge read “Received” for Done lines.
   - Confirm the Update Stock button respects both `line.status === 'ordered'` and `line.canReceive`; for Done lines, it should be absent even if `canReceive` is stale.
   - Update `seller-group-card.tsx` to accept mutation loading states so row-level actions disable appropriately during receive/complete calls.

5. **Instrumentation & Error Paths**
   - Use `useListLoadingInstrumentation` within the modal when fetching any supplemental data (e.g., seller location suggestions) so tests can await `shoppingLists.receive.locations` if lookup latency occurs.
   - Emit informative toasts (success + mismatch warnings) and ensure errors from mutations route through `useToast.showException` to preserve test visibility.
   - When the modal mounts for any line (initial load or Save & next), call `trackOpen` on the current `ShoppingListLineReceive:line:<id>` form instrumentation so tests have a deterministic signal before interacting.
   - When mismatches trigger the confirm flow, emit a dedicated `form` event (e.g., `ShoppingListLineComplete:line:<id>`) so Playwright can assert the confirmation path.

6. **Testing & Fixtures**
   - Extend `ShoppingListTestFactory` with helpers to mark lists Ready, set lines Ordered, perform receive operations, and complete lines—keeping everything backend-driven per `docs/contribute/testing/factories_and_fixtures.md`.
   - Update the shopping lists page object to support: opening the Update Stock modal, editing allocation rows, clicking **Save & next**, entering mismatch reasons, and reading Received/status cell values.
   - Add Playwright scenarios (see below) and reuse `waitTestEvent`/`waitForListLoading` so no request interception is required, consistent with `docs/contribute/testing/playwright_developer_guide.md`.

## Algorithms / Data Flow
- **Receive submission**: normalize allocation rows into `{ box_no, loc_no, qty }[]`, ensure total equals `receive_qty`, post to `/api/shopping-list-lines/{line_id}/receive`, then merge the returned line into cached list detail and seller groups before re-render.
- **Save & next traversal**: flatten ordered lines in the list order used by SellerGroupList; after a successful receive, locate the next Ordered line that still has `canReceive === true` (skip Done/New and any Ordered line that lost receive permission) and reopen the modal if one exists; otherwise, close and focus the table row that was just updated.
- **Mark Done confirmation**: if `line.received !== line.ordered`, surface confirmation requiring a mismatch reason; submit `{ mismatch_reason }` via `/complete`; if the counts match, allow an empty reason. Update `status`, `canReceive`, `completionMismatch`, and `completionNote` from the response and refresh totals.

## Playwright Coverage
1. **Partial receive with new location** — Seed an Ordered line, open **Update Stock**, allocate a quantity into an existing location plus a new box/location, click **Save**, await `ShoppingListLineReceive:line:<id>` submit/success events, assert the table shows the new Received total, and confirm part stock via the API helper.
2. **Save & next workflow** — With multiple Ordered lines, process the first via **Save & next**, await the `ShoppingListLineReceive:line:<nextId>` open event before interacting with the second line, then complete the flow and confirm both rows reflect updated Received counts and highlight transitions.
3. **Mark Done with mismatch confirmation** — Receive less than ordered, trigger **Mark Done**, assert the confirmation/mismatch prompt appears, provide a reason, await `ShoppingListLineComplete:line:<id>` events, and validate the row shows status “Received”, mismatch indicator, hidden Update Stock CTA, and persisted completion note tooltip.

## Blocking Issues
- None identified; confirm during implementation that `ShoppingListResponseSchema.46f0cf6` consistently includes `part_locations` so the modal can pre-seed allocation rows without extra fetches. If not, fall back to `usePartLocations` before wiring the modal.

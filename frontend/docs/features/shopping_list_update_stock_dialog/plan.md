# Shopping List Update Stock Dialog Plan

## Brief Description
Phase 3 in `docs/epics/shopping_list_outstanding_work.md` asks us to consolidate the Update Stock dialog into one table with columns **Box**, **Location**, **Quantity**, and **Receive**. The goal is to remove the standalone “Existing locations”, “Receive now”, and “Allocate to locations” sections so the receive flow is driven by that single grid, infer the overall receive quantity from the “Receive” column, keep the “Add location” affordance, and respect that “Quantity must be empty (not zero)” while making the existing rows read-only except for “Receive”.

## Relevant Files & Functions
- `src/components/shopping-lists/ready/update-stock-dialog.tsx` — reshape `UpdateStockDialog`, refactor `AllocationDraft`, `validateAllocations`, submission handlers, and instrumentation metadata to match the new table model.
- `tests/support/page-objects/shopping-lists-page.ts` — update helper methods (`openUpdateStock`, allocation setters, submission helpers) to interact with the table cells/data-testids introduced by the redesign.
- `tests/e2e/shopping-lists/shopping-lists.spec.ts` — adjust existing receive/mismatch flows and add new assertions covering the merged table experience.

## Implementation Steps
1. **Refactor allocation state model**
   - Extend `AllocationDraft` with a discriminant (`type: 'existing' | 'new'`), carry through `sourceLocationId`/`existingQuantity`, and split editable fields so existing rows store only the mutable `receive` value while new rows track `boxNo`, `locNo`, and `receive`.
   - When the dialog opens, seed `form.values.allocations` with one entry per `line.partLocations` (`type: 'existing'`) and append a single blank `type: 'new'` draft; preserve the random `id` tokens for instrumentation-stable `data-testid`s (`shopping-lists.ready.update-stock.row.${allocation.id}.*`).
   - Keep `createAllocationDraft` for new rows but ensure the default `receive` string is empty to meet “Quantity must be empty (not zero)” for the new `Receive` column.
2. **Remove “Receive now” field and compute totals from allocations**
   - Drop `receiveNow` from `UpdateStockFormValues`, the validation rules, and the form state resets. Replace any references with a derived `totalReceive = sum(parseInt(receive) for drafts with receive > 0)`.
   - Update `useFormInstrumentation` snapshots and `trackSubmit/trackSuccess` payloads to send `receiveQuantity: totalReceive`, keeping the existing `ShoppingListLineReceive` form ID.
3. **Rebuild `validateAllocations` for the table flow**
   - Accept the mixed list of drafts, ignore existing rows with blank/zero receive values, and require at least one draft with a positive integer receive quantity to enable submission.
   - For `type: 'new'` drafts, validate that box, location, and receive are present and positive integers, enforce uniqueness against both existing and new combinations, and surface per-row errors that map to the new table cell test IDs.
   - For existing rows, validate only the `receive` field (positive integer) when populated; reuse the summary message pattern to highlight mismatches or missing receive entries.
   - Return `totalReceive` alongside error metadata so `canSubmit` can gate on both `allocationValidation.isValid` and `totalReceive > 0`; update the summary copy so mismatches reference “Receive entries”/`totalReceive` instead of the removed “Receive now”.
4. **Render the unified table per `docs/contribute/ui/forms.md`**
   - Replace the separate sections with a single `<table>` inside the dialog body, reuse the standard spacing (`space-y-*`) and `FormLabel` conventions, and ensure the footer buttons remain in `DialogFooter` on the right.
   - For `type: 'existing'` rows, render Box/Location/Quantity as read-only text, attach the existing quantity label, and place an `<Input>` (or numeric `Input`) for the “Receive” column that writes through `handleAllocationChange`.
   - For `type: 'new'` rows, render `BoxSelector` and numeric inputs for Location and Receive, leave the Quantity column visually empty (no input element) to honor “Quantity must be empty”, and expose a row-level Remove button.
   - Introduce ID-based `data-testid`s such as `shopping-lists.ready.update-stock.row.${allocation.id}.receive`, `.box`, `.location`, and `.remove` so Playwright can keep using stable selectors without intercepting network calls.
   - Keep the “Add location” ghost button directly beneath the table; it should append a new blank `type: 'new'` row.
5. **Submission & instrumentation updates**
   - Modify `allocationToPayload` to emit only rows with a positive receive value, using the existing location metadata for `type: 'existing'` drafts and the user-entered fields for new rows.
   - Ensure `onSubmit` receives `receiveQuantity = totalReceive` and the filtered allocations array; keep error tracking hooks intact.
   - Reset state on close/open by regenerating existing rows from the latest `line.partLocations` so the table reflects backend updates after each successful receive.
6. **Test harness adjustments**
   - Update `ShoppingListsPage` helpers to target the new ID-based selectors (`shopping-lists.ready.update-stock.row.${draftId}.box|location|receive`) instead of the removed `field.receive`, expose helpers for editing new rows, and keep `markUpdateStockDone` / mismatch flows intact.
   - Revise the existing E2E scenario to fill the proper table cell, wait on the same `ShoppingListLineReceive`/`ShoppingListLineComplete` events, and assert the dialog hides the old sections.
   - Add targeted assertions ensuring the combined table persists existing locations with read-only values and that new rows appear after clicking “Add location”.

## Playwright Coverage
- Validate partial receive + mismatch flow (updates existing test) by entering a positive value in the existing location’s “Receive” cell, submitting the form, and asserting the backend state via `testData.shoppingLists.getDetail`. The test remains backend-driven by waiting on `ShoppingListLineReceive` form events through `testEvents` (no `page.route`).
- Add a scenario that receives inventory into multiple rows (one existing, one new created via “Add location”) and confirms the summed quantity matches what the backend reports; assert instrumentation through the same `ShoppingListLineReceive` events and verify the `shoppingLists.receive.locations` `useListLoadingInstrumentation` scope emits the expected metadata when boxes are fetched.
- Cover validation UX by attempting to submit with all “Receive” cells empty, expecting the updated summary error, and then correcting the input to ensure the Save button enables—exercise the deterministic ID-based test IDs instead of mocking network traffic.

## Blocking Issues
- None identified; existing telemetry (`useFormInstrumentation` and `useListLoadingInstrumentation`) keeps the tests backend-driven.

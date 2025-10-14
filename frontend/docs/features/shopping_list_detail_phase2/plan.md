# Shopping List Detail Phase 2 Plan

## Brief Description
- Deliver the Phase 2 shopping list detail workflow polish: align Concept header/toolbar styling with the Overview pattern, replace dropdown-heavy actions with inline controls, tighten seller group note editing, improve part selection ergonomics, and harden the Completed view so it renders fully read-only while retaining the existing instrumentation contract.

## Relevant Files & Functions
- `src/routes/shopping-lists/$listId.tsx` — central route component that chooses Concept vs Ready vs Completed layouts, hosts instrumentation, and wires dialogs.
- `src/components/shopping-lists/concept-header.tsx` — header CTA copy, line count presentation, and empty-description messaging.
- `src/components/shopping-lists/mark-ready-footer.tsx` → new `concept-toolbar` module — becomes the Concept actions bar with `useFormInstrumentation` (`ShoppingListStatus:markReady`).
- `src/components/shopping-lists/concept-table.tsx`, `src/components/shopping-lists/concept-line-row.tsx`, `src/components/shopping-lists/table-layout.ts` — table shell, row controls, highlight treatment, width tokens.
- `src/components/shopping-lists/concept-line-form.tsx`, `src/components/parts/part-selector.tsx`, `src/components/ui/searchable-select.tsx`, `src/hooks/use-parts-selector.ts` — add-line dialog, selector formatting, scroll handling, alphabetical option ordering.
- `src/components/shopping-lists/ready/seller-group-card.tsx`, new `src/components/shopping-lists/ready/seller-group-order-note-dialog.tsx`, `src/components/shopping-lists/ready/seller-group-list.tsx` — seller group header layout, order note editing, read-only gating.
- `src/components/shopping-lists/ready/ready-line-row.tsx`, `src/components/shopping-lists/ready/ready-toolbar.tsx`, `src/components/shopping-lists/list-delete-confirm.tsx` — inline Ready actions, toolbar copy, irreversible confirmation text.
- `src/hooks/use-shopping-lists.ts` — `useShoppingListDetail` metadata, computed flags (`hasNewLines`, `isCompleted`), instrumentation payloads.
- Playwright surface: `tests/e2e/shopping-lists/shopping-lists.spec.ts`, potential new `shopping-lists-detail.spec.ts`, and `tests/support/page-objects/shopping-lists-page.ts`.

## Implementation Steps
1. **Header & Concept actions alignment**
   1. Update `concept-header.tsx` to rename the CTA to `Edit List`, remove the “No description yet…” helper, and swap statistics for outline badges that mirror `overview-card` (per `docs/contribute/ui/data_display.md`). Ensure badge `data-testid`s remain stable or receive additive ones.
   2. Promote `mark-ready-footer.tsx` into a sticky `ConceptToolbar` component: reuse the Ready toolbar structure, keep the `ShoppingListStatus:markReady` instrumentation id, and expose props for `lineCount`, `canMarkReady`, `isSubmitting`.
   3. In `$listId.tsx`, render `ConceptToolbar` only when `status === 'concept'`; thread mutation state and maintain existing `useListLoadingInstrumentation` calls so metadata remains unchanged.
2. **Concept table interaction refresh**
   1. In `concept-table.tsx`, reposition “Add row” beside the sort control, convert the sort label to the Lucide `ArrowDownAZ` icon-only trigger, and set the add button to `variant="primary"`.
   2. Adjust `LINE_TABLE_WIDTHS` to use `min-w-*` utilities for `status`/`actions` instead of percentages, and apply `text-center` to status headers/cells in both Concept and Ready tables.
   3. Replace the dropdown menu in `concept-line-row.tsx` with inline icon buttons (`Pencil`, `Trash2`) that keep keyboard focus management and explicit `aria-label`s; switch the highlight style to a ring-based accent (`ring-2 ring-primary/30 bg-accent/10`) that reads correctly in dark mode.
3. **Part selector ergonomics**
   1. In `use-parts-selector.ts`, sort `optionsWithMeta` alphabetically by `displayDescription`, and set each option’s primary label to `${displayDescription} (${part.key})` while keeping manufacturer/MPN metadata in the subtitle.
   2. Update `PartSelector` to mirror the new label structure in both the dropdown option renderer and the selected summary text so `data-testid` consumers see `<description> (<key>)`.
   3. Capture mouse-wheel scrolling on the popover content inside `searchable-select.tsx`: within `Popover.Content`, add an `onWheelCapture` handler that calls `event.preventDefault()` and manually adjusts `scrollTop`, preventing the dialog-level scroll lock from blocking wheel input. Expose the handler via props so `concept-line-form.tsx` can pass it after mounting the selector.
4. **Seller group note and action polish**
   1. Introduce `seller-group-order-note-dialog.tsx`: a `Dialog` + `Form` that reuses `useUpdateSellerOrderNoteMutation`, keeps the existing instrumentation id pattern (`ShoppingListSellerOrderNote:${sellerId}` or groupKey fallback via `useFormInstrumentation`), enforces the 500-character limit, and keeps the note textarea minimal.
   2. Rework `seller-group-card.tsx` so the header shows both “Mark group as Ordered” and the new “Edit Group” button. When no `orderNote` exists, hide the panel entirely; when present, display read-only copy without the character counter or save button. Trigger the dialog from “Edit Group”.
   3. Surface two explicit flags from `SellerGroupList`: `canBulkOrder` (true when `group.hasNewLines` and list not completed) to enable/disable the order button, and `isCompleted` (list status === `done`) to suppress both buttons in Completed. This keeps the edit dialog available while the list remains Ready but hides actions after completion.
5. **Ready-line inline actions & terminology**
   1. Replace the overflow menu in `ready-line-row.tsx` with inline buttons: `Mark as Ordered` (secondary) when status is `new`, `Update Stock` stays secondary but gains `whitespace-nowrap`, `Undo2` icon for revert, and `Pencil` icon for edit. Rename status badges/text to “Completed” instead of “Done”.
   2. Reuse the new highlight token on Ready rows, and short-circuit all action rendering when the parent signals `readOnly` (completed view) to prevent stray controls.
6. **Completed state hardening & instrumentation**
   1. In `$listId.tsx`, compute `isCompleted` and wrap handlers (`handleOpenOrderLineDialog`, etc.) so they no-op when true; do not mount `OrderLineDialog`, `OrderGroupDialog`, or `UpdateStockDialog` if the list is completed.
   2. Update `ReadyToolbar` to hide the “Mark Done” and “Back to Concept” buttons when completed and display a read-only helper message. Adjust `useListArchiveConfirm` copy to mention the operation is irreversible and acknowledges removal from Active lists.
   3. Extend `useShoppingListDetail`’s instrumentation helper to report `view: 'completed'` when the list status is done, expose a `hasNewLines` aggregate so UI logic can disable the group-order button without additional derivation, and update Playwright/smoke assertions to match the new telemetry value.

## Algorithms & State Handling Details
- **Selector scroll capture:** The wheel handler should use `const target = event.currentTarget as HTMLElement; target.scrollTop += event.deltaY;` to keep behaviour deterministic across browsers while Radix locks background scroll.
- **Highlight reset timers:** `concept-line-row` keeps the existing highlight timer; ensure the new ring class still respects the `highlightedLineId` state cleanup cycles already implemented in `$listId.tsx`.
- **Read-only gating:** When `isCompleted`, avoid firing TanStack mutations by returning early in handlers and guarding `updatePendingLine`. This prevents instrumentation from emitting misleading submit events.
- **Instrumentation consistency:** All new components (`ConceptToolbar`, order note dialog) must continue using `useFormInstrumentation` with stable ids so tests consume `form` events instead of introducing ad hoc telemetry.

## Playwright Coverage
1. **Concept header & toolbar regression** — Create a Concept list, assert the header shows the new chip badges and `Edit List` CTA, ensure the sticky Concept toolbar exposes `Mark Ready`, trigger the button, and await `ShoppingListStatus:markReady` submit/success events via `waitTestEvent`.
2. **Add-part dialog scroll & sorting** — Open “Add part to Concept list”, simulate `page.mouse.wheel(0, 400)`, verify the dropdown scrolls, and confirm the option list renders `<description> (<key>)` in alphabetical order even after filtering.
3. **Seller group editing flow** — Move a list to Ready, click “Edit Group”, ensure the dialog emits `ShoppingListSellerOrderNote:{sellerId}` open/submit/success events (same id schema as today), save and clear notes, and verify the inline panel hides when empty.
4. **Ready-line inline actions** — Use the new `Mark as Ordered`, revert (`Undo2`), and edit (`Pencil`) controls; assert the “Update Stock” button keeps `white-space: nowrap` and correct min-width; confirm the mark-done confirmation dialog references irreversibility before archiving.
5. **Completed read-only view** — Mark a list Done via backend helpers, load the detail page, confirm no inline action buttons render (including ordered pencils and update-stock), ensure the Ready toolbar collapses to read-only messaging, and validate `waitForListLoading` metadata reports `{ status: 'done', view: 'completed' }` after updating the existing tests.

## Phasing
- The Phase 2 scope can ship as a single implementation batch; defer only the Phase 3 update-stock redesign to a later feature plan.

## Blocking Issues
- None identified. Highlight and button styling reuse existing Tailwind tokens, and no backend API changes are required. Continue to rely on documented instrumentation helpers (`useListLoadingInstrumentation`, `useFormInstrumentation`) to keep Playwright backend-driven.

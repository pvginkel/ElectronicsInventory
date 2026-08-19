# Shopping List Kanban — Plan Execution Report

## Status

**DONE-WITH-CONDITIONS** — The plan was implemented successfully with all 41 requirements verified. Two conditions remain: (1) 31 pre-existing TypeScript errors in the parts domain (from the `part_sellers` branch) are unrelated to this feature but cause `pnpm check` to exit non-zero; (2) two Playwright DnD confirmation dialog tests are skipped (`test.fixme`) because the DnD library does not expose the intermediate state needed to test the confirmation flow through the UI.

## Summary

All 9 implementation slices were completed:

1. **Status simplification** — `ShoppingListStatus` changed from `concept | ready | done` to `active | done` across 14+ files.
2. **Domain type extensions** — Added `sellerLink`, `logoUrl`, seller group `status`/`completed` fields. Removed 5 obsolete mutation hooks. Created `use-seller-group-mutations.ts`.
3. **KanbanCardField** — Inline edit primitive with hover-border, click-to-edit, blur/Enter save, Escape revert.
4. **KanbanCard** — Three rendering modes (unassigned, ordering, receiving) with progressive disclosure.
5. **KanbanColumn & KanbanColumnHeader** — Column component with header actions, complete/reopen, overflow menu.
6. **KanbanSkeletonColumn** — Searchable seller dropdown to create new columns.
7. **KanbanBoard & DnD** — `@dnd-kit/core` integration with drag overlay, background scroll, touch support (600ms long-press).
8. **Route integration** — Replaced concept/ready branch with `KanbanBoard`. Removed obsolete dialogs and handlers.
9. **Playwright coverage** — 2 new spec files (kanban-board, kanban-drag-drop), updated 5 existing specs, updated test factory.

## Code Review Summary

- **Decision**: GO-WITH-CONDITIONS
- **Issues found**: 3 Major, 3 Minor
- **All resolved**:
  - M1: Seller group PUT now only sends explicitly provided fields (avoids clearing order notes on complete/reopen).
  - M2: Not a real bug — `effectiveSeller` correctly maps to `seller` since the API removed `effective_seller`.
  - M3: Order note dialog now includes a textarea for editing the note text.
  - N1: Added `group/card` class to card div so `group-hover/card:line-clamp-none` works.
  - N2: Note field now renders even when `line.note` is null (allows adding notes via inline edit).
  - N3: ConceptLineForm now accepts `defaultSellerId` prop; adding from a seller column pre-populates the seller.

## Verification Results

### `pnpm check`
- **Lint**: Clean (0 errors)
- **TypeScript**: 31 errors, all pre-existing in parts domain (`seller`/`seller_link`/`seller_id` properties from `part_sellers` branch). Zero errors in files touched by this feature.

### Playwright Tests
```
Shopping list suite: 42 passed, 2 skipped (55.8s)
```
- **kanban-board.spec.ts**: 12 passed
- **kanban-drag-drop.spec.ts**: 2 passed, 2 skipped (DnD confirmation dialog unreachable via Playwright)
- **line-deletion-undo.spec.ts**: 5 passed
- **parts-entrypoints.spec.ts**: 4 passed
- **ready-line-deletion.spec.ts**: 2 passed
- **shopping-lists-detail.spec.ts**: 6 passed
- **shopping-lists.spec.ts**: 11 passed

### Requirements Verification
- **41/41 checklist items PASS** — full report at `docs/features/shopping_list_kanban/requirements_verification.md`

## File Change Summary

- **30 modified files** + **5 new files/directories**
- **Net change**: -1,284 lines (2,636 insertions, 3,920 deletions)
- New components: 8 files under `src/components/shopping-lists/kanban/`
- New hook: `src/hooks/use-seller-group-mutations.ts`
- New test specs: `tests/e2e/shopping-lists/kanban-board.spec.ts`, `tests/e2e/shopping-lists/kanban-drag-drop.spec.ts`

## Outstanding Work & Suggested Improvements

1. **DnD confirmation dialog tests** — 2 tests are `test.fixme` because `@dnd-kit`'s drag event flow doesn't pause for a confirmation dialog in a way Playwright can intercept. Consider adding a dedicated integration test for the confirmation flow outside of DnD context.

2. **Pre-existing TS errors** — 31 TypeScript errors in the parts domain need to be resolved as part of the `part_sellers` branch work (not this feature).

3. **Seller pre-population UX** — The `defaultSellerId` on ConceptLineForm pre-selects the seller in the dropdown, but the user can still change it. Consider auto-focusing the part selector field when the seller is pre-populated.

4. **Performance of "Assign remaining"** — Sequential PUT calls may be slow for large lists (50+ items). If this becomes an issue, request a bulk endpoint from the backend.

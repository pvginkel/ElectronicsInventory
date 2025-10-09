# Shopping List Ready View Refactoring Notes

## Current Pain Points

- `src/hooks/use-shopping-lists.ts` centralises every shopping-list query and mutation. The combinations of optimistic updates, derived counters, and seller-group reshaping make the file long and difficult to reason about.
- Optimistic cache blocks repeat similar logic (`resolveUpdatedLine`, `computeLineCountsFromLines`, `updateSellerGroupsWithLine`) across multiple mutations. Small edits require touching the same patterns in several places.
- Inline helper functions are hard to test in isolation, so we rely on Playwright regressions to catch mistakes. The dev-only `console.debug` grew out of the need to sanity check the derived state manually.
- The Ready-view mutations dominate the hook even when Concept-only screens import it, raising the cognitive load for unrelated changes.

## Suggested Improvements

> Goal: keep the optimistic UX and shared TanStack Query wiring, but carve out cohesive units that are easier to test and evolve.

1. **Extract pure helpers**
   - Move `mapConceptLine`, `computeLineCountsFromLines`, seller-note utilities, and seller-group recomputation into a colocated module such as `src/lib/shopping-lists/transformers.ts`.
   - Export well-named helpers (`applyLineUpdate`, `recomputeSellerGroups`) so the hook can call them without reimplementing the loops.
   - Benefit: isolates logic, makes it easier to add unit coverage, reduces noise inside the hook file.

2. **Group Ready-view mutations**
   - Create a dedicated module (e.g. `src/hooks/shopping-lists/use-ready-mutations.ts`) that houses `useOrderShoppingListLineMutation`, `useRevertShoppingListLineMutation`, `useOrderShoppingListGroupMutation`, etc.
   - Re-export from the main hook for compatibility, but keep the optimistic update logic near the mutation that uses it.
   - Benefit: concept-only flows no longer have to scroll past hundreds of lines of Ready-specific code, and Ready refactors stay local.

3. **Introduce an optimistic state reducer**
   - Define a pure function like `applyShoppingListMutation(state, change)` that handles the shared recomputation (`lineCounts`, `hasOrderedLines`, `sellerGroups`).
   - Each mutation supplies a `change` payload (e.g. `{ type: 'lineUpdated', line: updatedLine }`).
   - Benefit: reduces duplication, lets us unit-test transitions, and documents the invariants in one place.

4. **Add targeted unit tests**
   - Once helpers are extracted, add `*.test.ts` coverage for line count math, seller-group regrouping, and revert/order transitions.
   - Benefit: increases confidence to iterate on the reducer without leaning entirely on Playwright.

5. **Document module structure**
   - Add a short header comment (or README) outlining the layout: queries, mutations, helper imports. Consider `// #region` markers as an interim step if we cannot split files immediately.
   - Benefit: contributors get quick orientation even before full refactors land.

## Next Steps

1. Extract the shared helper functions into a dedicated module and add unit coverage.
2. Move Ready-only mutations into their own hook file; update imports.
3. Refactor optimistic updates to use a single reducer-style helper, wired into the extracted module.
4. Trim remaining diagnostics once the helper tests offer better safety net.

Each step can ship incrementally; Playwright specs continue to guard the UI while the refactor unfolds. Once the helpers are in place, we can revisit whether any instrumentation (e.g. `console.debug`) is still needed.***

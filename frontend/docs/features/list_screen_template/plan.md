# Shopping Lists List-Screen Template Plan

Introduce a reusable template for the shopping list overview so that the header layout is standardized and sticks to the top while only the content scrolls. The user explicitly called out that every list screen header must surface the following components:
- Breadcrumb bar
- Title with a few buttons to the right of it
- Search box
- Optional segmented tab control
- Number of items shown (number of cards shown and number of cards loaded, if the search box has filtered the content)
- Content

## Relevant Files & Functions
- `src/components/layout/list-screen-layout.tsx` (new): defines the shared list screen control with sticky header regions and structured slots for breadcrumbs, title/actions, search, segmented tabs, count summary, and scrollable content.
- `src/components/layout/list-screen-counts.tsx` (new): optional helper for rendering the “shown vs. total” summary so the count presentation stays consistent across lists.
- `src/routes/shopping-lists/index.tsx`: ensures the shopping lists route renders the new layout, wires page-level `data-testid` attributes, and passes the derived search term down.
- `src/components/shopping-lists/overview-list.tsx`: refactors the overview to compose the new template, keeps `useListLoadingInstrumentation` intact, and maps existing header pieces (breadcrumbs, title/actions, search, segmented tabs, counts) into the layout props.
- `src/components/shopping-lists/overview-card.tsx` & `src/components/shopping-lists/list-create-dialog.tsx`: verify styling hooks after the layout change; no structural changes expected beyond prop renames if needed.
- `src/lib/test/query-instrumentation.ts`: confirm no API changes are required for `useListLoadingInstrumentation`; update metadata helpers only if the new template needs additional fields.
- `tests/support/page-objects/shopping-lists-page.ts`: expose getters for the layout header container and scrollable content region so scenarios can assert sticky behavior.
- `tests/e2e/shopping-lists/shopping-lists.spec.ts` and `tests/e2e/shopping-lists/parts-entrypoints.spec.ts`: expand coverage for the sticky header, search-driven counts, and tab toggles while staying backend-driven via the existing factories in `tests/api/factories/shopping-list-factory.ts`.

## Implementation Steps
1. **Audit the current shopping list overview**  
   Inventory the existing header markup inside `ShoppingListsOverview` and map each element to the shared expectations in `docs/contribute/ui/data_display.md` (lists summary, segmented tabs, search pattern). Capture current `data-testid`s that Playwright relies on.

2. **Author the reusable layout shell**  
   Create `ListScreenLayout` under `src/components/layout/` with props for `breadcrumbs`, `title`, `actions`, `search`, `segmentedTabs`, `counts`, `children`, optional `headerTestId`, and optional `contentTestId`/`contentProps`. Structure the root as `flex flex-col h-full min-h-0` with a shadowed/styled header wrapper that uses `sticky top-0` semantics while the content region applies `flex-1 min-h-0 overflow-auto`. Ensure the breadcrumb slot renders inside a dedicated container even when the route currently provides static text so future breadcrumb variants can be dropped in. Include lightweight guidepost comments describing the regions per project guidelines.

3. **Normalize the count summary helper**  
   Implement `ListScreenCounts` (or similar) to accept `{ visible, total, filtered }`, treat `filtered` as optional, and render the “Number of items shown” copy while preserving the filtered badge only when a filter trims results. Keep the vocabulary aligned with the copy already in the shopping list overview and the data-display doc.

4. **Refactor `ShoppingListsOverview` to use the template**  
   Replace the existing header markup with instances of the new layout props. Ensure the search input continues to update router search params, segmented tabs use `SegmentedTabs`, and summary counts pass through the helper with `filtered` only when applicable. Maintain instrumentation (`useListLoadingInstrumentation`, `beginUiState`/`endUiState`), keep the header visually connected to the page (no detached float), and provide `data-testid` hooks like `shopping-lists.overview.header` and `shopping-lists.overview.content` using the new `headerTestId`/`contentTestId` props. Keep the existing loading and error short-circuits untouched for now; the layout is adopted only once data is ready.

5. **Update the shopping lists route wrapper**  
   Adjust `src/routes/shopping-lists/index.tsx` so the page container becomes a non-scrollable flex column (`className="flex h-full min-h-0 flex-col space-y-6"`) that delegates scrolling to the template content, passes the search term, and ensures breadcrumbs/title align with the new layout slots via the breadcrumb container.

6. **Verify styling and accessibility**  
   Manually inspect the sticky header inside the live shell (`pnpm dev`) to confirm focus outlines, keyboard navigation through segmented tabs, and that the sticky region does not overlap content. Update Tailwind classes if the header needs `border-b` or background reinforcement for readability, and verify the parent container remains non-scrollable so the content slot owns all scrolling.

7. **Refresh instrumentation-driven tests**  
   Update the shopping lists Playwright page object and specs to use the new header/content selectors. Keep scenarios aligned with the instrumentation contract in `docs/contribute/testing/playwright_developer_guide.md` and re-run the affected suites once implementation is complete.

## Data & Algorithms
1. Accept the raw shopping list summaries from `useShoppingListsOverview()`.  
2. Apply the existing search term filter (case-insensitive comparison against name, description, and primary seller) to produce the “filtered” dataset.  
3. Partition filtered results into `active` (status !== `done`) and `completed` (status === `done`) buckets.  
4. Derive `visibleLists` by selecting the bucket that matches the active segmented tab.  
5. Compute count metadata:  
   - `totalActiveCount` and `totalCompletedCount` from the unfiltered lists for global totals.  
   - `visibleCount` from the currently displayed bucket.  
   - `filteredCount` when the search term is non-empty.  
6. Pass `{ visible: visibleCount, total: activeTab === 'active' ? totalActiveCount : totalCompletedCount, filtered: filteredLists.length }` into the layout counts slot so the helper can render the “shown vs. total” message and optional filtered badge.  
7. Feed the same metadata into `useListLoadingInstrumentation` and `beginUiState`/`endUiState` so Playwright can assert on deterministic events.
8. When the search term is empty, provide `filtered: undefined` (or omit it) so the count helper hides the filtered badge; only emit the filtered count when a filter actually trims the dataset.

## Playwright Coverage
1. **Header remains in view while content scrolls**  
   Seed multiple lists via `ShoppingListFactory` so the grid overflows, scroll the content region (`shopping-lists.overview.content`) and assert the header container (`shopping-lists.overview.header`) stays visible. Use `expect.poll` or `page.waitForFunction` only after the `shoppingLists.overview` instrumentation reports ready to keep the test backend-driven.
2. **Search filters adjust counts and instrumentation**  
   Enter a search term, assert the summary text updates to “visible of total” and the filtered badge reflects `filtered`. Confirm `endUiState('shoppingLists.overview.filters', metadata)` fires with the new counts via the instrumentation helpers outlined in the Playwright developer guide.
3. **Segmented tabs toggle visible dataset without layout shift**  
   Switch between Active and Completed tabs, confirm the counts and grid update, and ensure header height remains constant. Await the `shoppingLists.overview` query instrumentation rather than mocking requests.
4. **Create Concept List button remains accessible in sticky header**  
   With the header stuck, trigger the create dialog from the button, complete the backend-driven flow, and verify the new list appears without losing sticky behavior. Rely on existing API factories and avoid `page.route`.

## Phases
- **Phase 1:** Implement `ListScreenLayout` and `ListScreenCounts`, add Storybook or snapshot coverage if available, and land styling scaffolding with no route adoption yet.  
- **Phase 2:** Refactor the shopping list overview to use the new layout, update instrumentation metadata, and extend Playwright specs to cover sticky scrolling.

## Blocking Issues
- None; existing backend-driven factories and instrumentation scopes (`shoppingLists.overview` and `shoppingLists.overview.filters`) cover the new scenarios.

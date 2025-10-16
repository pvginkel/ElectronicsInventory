# List Screen Template Rollout Plan

Roll out the sticky list header experience from `docs/features/list_screen_template/plan.md` so every list screen (Boxes, Parts, Sellers, Types) composes `ListScreenLayout`/`ListScreenCounts` and matches the documented pattern from `docs/contribute/ui/data_display.md` while keeping instrumentation consistent with `docs/contribute/testing/playwright_developer_guide.md`.

## Relevant Files & Functions
- `src/routes/__root.tsx`, `src/components/layout/app-shell-content-context.ts`, `src/constants/app-shell.ts` — flatten the shared padding API so the app shell always renders without inherent padding (`p-0`) and consumers add spacing locally.
- `src/components/layout/list-screen-layout.tsx`, `src/components/layout/list-screen-counts.tsx` — confirm the layout primitives support the additional consumers (props for test ids, optional sections, padding overrides) and guard the filtered badge exactly as the shopping list rollout.
- Boxes
  - `src/routes/boxes/index.tsx` — set `p-0` shell padding, ensure the page container becomes `flex h-full min-h-0 flex-col`.
  - `src/components/boxes/box-list.tsx` plus `box-card.tsx`, `box-form.tsx` — refactor around the template, preserve `useListLoadingInstrumentation` scope `boxes.list`, keep modal triggers working.
- Parts
  - `src/routes/parts/index.tsx` — mirror the app shell padding change and pass search term.
  - `src/components/parts/part-list.tsx` and supporting badges/cards — compose the layout, surface Add Part / Add with AI actions inside `actions`, maintain membership indicator fetches.
- Sellers
  - `src/routes/sellers/index.tsx`, `src/components/sellers/seller-list.tsx`, `seller-card.tsx`, `seller-form.tsx` — incorporate the template and keep confirm dialog flows intact.
- Types
  - `src/routes/types/index.tsx`, `src/components/types/TypeList.tsx`, `TypeCard.tsx`, `TypeForm.tsx` — adopt the shared header while retaining Type Catalog modal workflow.
- Instrumentation & testing
  - `src/lib/test/query-instrumentation.ts` — adjust metadata helpers if we need additional fields for visible vs. total counts.
  - Playwright support files: `tests/support/page-objects/boxes-page.ts`, `parts-page.ts`, `sellers-page.ts`, `tests/e2e/types/TypesPage.ts`.
  - End-to-end specs: `tests/e2e/boxes/boxes-list.spec.ts`, `tests/e2e/parts/part-list.spec.ts`, `tests/e2e/sellers/sellers-list.spec.ts`, `tests/e2e/types/type-list.spec.ts` (and any other specs that assert on list summaries or headers).

## Implementation Steps
1. **Re-read the template and pattern docs**  
   Revisit `docs/features/list_screen_template/plan.md` and `docs/contribute/ui/data_display.md` to catalog which header elements (breadcrumbs, title/actions, search, segmented tabs, counts) each screen must present. Align testing expectations with `docs/contribute/testing/playwright_developer_guide.md` before touching specs.

2. **Normalize app shell padding at the frame level**  
   - Update `DEFAULT_APP_SHELL_CONTENT_PADDING` (and the provider) so the app shell renders with `p-0` by default, dropping the ability to set/reset padding globally.  
   - Remove the padding override effect from `shopping-lists/index.tsx` and any other routes that fiddle with the context setter.  
   - Audit every top-level route and wrap its root container with `px-6 py-6` (or equivalent `p-6`) to recreate the previous gutters; the four list routes will pick up additional layout-specific classes later in this plan.

3. **Validate layout primitives for multi-screen reuse**  
   Audit `ListScreenLayout`/`ListScreenCounts` for gaps: confirm we can reuse existing `rootTestId`/`headerTestId` hooks (renaming to the `*.overview.*` convention used by shopping lists), optionally add lightweight props if a screen needs to tweak padding or supply aria attributes, and ensure `ListScreenCounts` suppresses the filtered badge unless the filtered total is smaller than the full dataset.

4. **Migrate Boxes to the template**  
   - Update `src/routes/boxes/index.tsx` to wrap the page in `className="flex h-full min-h-0 flex-col p-6"` and expose the breadcrumb (“Storage”) ahead of the layout.  
   - In `BoxList`, restructure the ready path to render `ListScreenLayout` with `rootTestId="boxes.overview"`, `headerTestId="boxes.overview.header"`, `contentTestId="boxes.overview.content"`, while mapping:  
     - `breadcrumbs` → existing “Storage” crumb,  
     - `title` → “Storage Boxes”,  
     - `actions` → Add Box button,  
     - `search` → current search field & clear affordance (skip when no data, matching today),  
     - `counts` → `ListScreenCounts` wrapped with `data-testid="boxes.overview.summary"` using `{ noun: { singular: 'box', plural: 'boxes' } }`.  
   - Keep loading/error/empty branches outside the layout, but reuse the same button/search elements for parity.  
   - Ensure instrumentation metadata exposes `totals.all`, `visible`, and optional `filtered` counts (only when `filteredBoxes.length < boxes.length`) so tests can assert summary changes without race conditions.  
   - Verify `BoxForm` dialogs still mount in portals and that `data-testid` hooks (`boxes.list.add`, `boxes.list.table`) remain intact or are re-exported via the layout’s `contentTestId` region.

5. **Migrate Sellers and Types (single-query lists)**  
   - Apply the same route padding change to `sellers/index.tsx` and `types/index.tsx` and preserve their existing breadcrumb text.  
   - Wrap `SellerList` and `TypeList` with `ListScreenLayout`, forwarding existing headings, buttons, search, and summary into the appropriate slots and adopting the new test-id convention (`sellers.overview.*`, `types.overview.*`).  
   - For `TypeList`, keep modal state management untouched but surface the Add/Edit buttons inside the `actions` slot; continue hiding the search summary when the collection is empty per the data display guidance.  
   - Update instrumentation metadata for `sellers.list` and `types.list` to report `visible` vs. `total` counts and the active search term, only emitting `filtered` when the filtered collection is smaller than the full query result.  
   - Confirm card grids still sort by locale-sensitive names and that confirm dialogs open outside the scrollable container.

6. **Migrate Parts (multi-query list with extra actions)**  
   - Mirror the padding/container changes in `parts/index.tsx`, keeping the breadcrumb copy as the existing simple “Parts” text.  
   - Refactor `PartList` to compose `ListScreenLayout`, mapping: breadcrumbs (`<span>Parts</span>`), combined Add Part/Add with AI buttons as `actions`, the existing search input, and a counts block that reflects filtered vs. total parts via `ListScreenCounts` with `noun: { singular: 'part', plural: 'parts' }`.  
   - Keep skeleton, empty, and error displays reachable from the content slot without breaking `data-testid`s (`parts.list.loading`, `parts.list.empty`, etc.), but relocate long-lived list selectors under `parts.overview.*` for parity with other screens.  
   - Ensure search navigation (`useNavigate`) and segmented tabs (none today) still behave, and maintain the `useShoppingListMembershipIndicators` fetch lifecycle.  
   - Expand instrumentation metadata (ready/error callbacks) to include `visibleCount`, `totalCount`, and optional `filteredCount`, while retaining the existing `queries`/`counts` structure so downstream diagnostics remain intact.

7. **Update Playwright abstractions and specs**  
   - Refresh page objects (`BoxesPage`, `SellersPage`, `PartsPage`, `TypesPage`) to consume the new `*.overview.*` selectors and scroll the `ListScreenLayout` content container when asserting sticky headers.  
   - Extend end-to-end specs to exercise the sticky header by scrolling the `contentTestId` container, assert the new summary copy emitted by `ListScreenCounts`, and verify action buttons remain accessible while the content scrolls.  
   - Keep tests backend-driven: seed data through existing factories, wait on `useListLoadingInstrumentation` scopes (`boxes.list`, `parts.list`, etc.), and avoid `page.route` interception.  
   - Adjust helper expectations (`waitForListLoading`, summary text matchers) if the phrasing changes (“3 of 10 boxes showing”, etc.).

7. **Regression and accessibility pass**
   After code and spec updates, run `pnpm check` plus the affected Playwright suites. Manually confirm keyboard focus order, sticky header contrast, and that modals launched from header buttons are reachable when the content is scrolled.

## Data & Algorithms
- **Boxes:** Continue filtering by box number or description (case-insensitive), sort displayed cards by `box_no`, and compute `visible = filteredBoxes.length`, `total = boxes.length`, `filtered = filteredBoxes.length < boxes.length ? filteredBoxes.length : undefined` for counts and instrumentation metadata.
- **Sellers:** Filter by name/website substring, keep alphabetical sorting, and surface counts using the same `visible/total/filtered` tuple; omit `filtered` when the search term does not reduce the dataset.
- **Types:** Filter by type name, track `allTypes` vs. `filteredTypes`, preserve the existing sort, and feed counts into both the summary and instrumentation with the same guard (`filteredTypes.length < allTypes.length`).
- **Parts:** Maintain the memoized search across formatted id/description/manufacturer code/type/tags, keep locale-aware sorting, and derive counts from `filteredParts` vs. total parts. Extend `getReadyMetadata` to include `{ visibleCount, totalCount, filteredCount? }` alongside the current `queries`/`counts` fields so existing consumers remain whole while Playwright can assert the new summary text.
- Across screens, reuse `useListLoadingInstrumentation` scopes and (where applicable) add `beginUiState`/`endUiState` pairs if we need deterministic filter-change events similar to the shopping lists overview.

## Playwright Coverage
1. **Boxes:** Extend `tests/e2e/boxes/boxes-list.spec.ts` to scroll the new `boxes.overview.content` region, confirm the header stays visible, and validate the count summary text updates when search filters apply. Coverage remains backend-driven via `testData.boxes` factories and the `boxes.list` instrumentation scope.
2. **Sellers:** Update `tests/e2e/sellers/sellers-list.spec.ts` to assert sticky header behavior, the new summary phrasing, and that create/edit/delete flows still emit instrumentation events captured by `testEvents` without intercepting network calls, using `sellers.overview.*` selectors.
3. **Types:** Refresh `tests/e2e/types/type-list.spec.ts` (and helper `TypesPage`) to use the layout’s test ids (`types.overview.*`), verify counts (“1 of N types showing”), and confirm the header stays pinned while the card grid scrolls. Seed data through `testData.types` and rely on `waitForListLoading('types.list')`.
4. **Parts:** Adjust `tests/e2e/parts/part-list.spec.ts` (and other list-adjacent specs) to reference the new header/content selectors, assert the summary text produced by `ListScreenCounts`, and ensure Add Part / Add with AI buttons remain keyboard accessible when the content is scrolled. Tests continue to seed data via factories and to wait on `parts.list` instrumentation.

## Phases
- **Phase 1:** Flatten the app-shell padding defaults, update Storybook or docs if necessary, validate layout primitives, and migrate the simpler single-query lists (Boxes, Sellers) with their Playwright coverage.
- **Phase 2:** Migrate TypeList, align its modal workflows with the new header/test ids, and stabilize the associated specs/page objects.
- **Phase 3:** Refactor PartList (including multi-query instrumentation), refresh remaining specs, and run a full regression across all list suites before handoff.

## Blocking Issues
- None. Existing backend factories and `useListLoadingInstrumentation` scopes provide the deterministic signals the Playwright suites need, so no additional backend or test harness instrumentation is required.

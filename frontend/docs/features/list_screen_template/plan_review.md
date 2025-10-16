### 1) Summary & Decision
The template hits the right surfaces and keeps instrumentation in scope, but the layout contract leaves the sticky-header goal under-specified and the count helper’s data contract is inconsistent, so implementation would likely ship a header that still scrolls away or shows the wrong filtered badge (docs/features/list_screen_template/plan.md:25-33,49-53). Decision: GO-WITH-CONDITIONS — tighten the layout props and count metadata before coding.

### 2) Conformance & Fit (with evidence)
- **docs/commands/plan_feature.md** PASS — the plan enumerates files, phased steps, data flow, and Playwright coverage as required (“Update the shopping lists Playwright page object…” docs/features/list_screen_template/plan.md:18-41,55-67 vs. docs/commands/plan_feature.md:17-22).
- **docs/product_brief.md** PASS — it keeps the shopping list workflow simple with search, counts, and concept creation calls to action that match the brief’s scope for shopping lists (docs/features/list_screen_template/plan.md:3-9,63 vs. docs/product_brief.md:13-18,145-148).
- **AGENTS.md** PASS — instrumentation and test coupling stay front-and-center (“Maintain instrumentation (`useListLoadingInstrumentation`, `beginUiState`/`endUiState`)” docs/features/list_screen_template/plan.md:31-33,40-41 aligning with AGENTS.md:35-46).
- **Fit with codebase** — The plan targets existing modules like `ShoppingListsOverview`, `SegmentedTabs`, and `useListLoadingInstrumentation` (docs/features/list_screen_template/plan.md:12-33), matching their current usage in src/components/shopping-lists/overview-list.tsx:24-144 and src/lib/test/query-instrumentation.ts.

### 3) Open Questions & Ambiguities
- Breadcrumb slot source is unclear: the plan expects a breadcrumb bar in the template (docs/features/list_screen_template/plan.md:3-4,12), but the route currently renders only a text stub (src/routes/shopping-lists/index.tsx:16-20). We need to know whether to adopt the shared breadcrumb pattern or keep inline text; that choice changes whether the layout should accept a breadcrumb component or build it internally.
- Height contract for `h-full`: Step 5 relies on `className="h-full"` on the route wrapper (docs/features/list_screen_template/plan.md:34-35), yet the existing route is a static block without flex parents (src/routes/shopping-lists/index.tsx:16-22). We need confirmation that upstream shells supply `min-h-0`/`flex` so the internal scroll area can actually constrain height; otherwise we must call that out in the plan.
- Loading/error states: the plan only maps the happy-path header into the layout (docs/features/list_screen_template/plan.md:31-41), while `ShoppingListsOverview` still short-circuits for loading/error views (src/components/shopping-lists/overview-list.tsx:200-249). Should the template also host skeleton/error variants, or do we keep bespoke markup for those states? The answer determines how reusable the layout really is.

### 4) Deterministic Playwright Coverage (new/changed behavior only)
- Scenario 1 – Header remains visible while content scrolls (docs/features/list_screen_template/plan.md:55-58). Given the factory seeds many lists via `ShoppingListFactory` (tests/api/factories/shopping-list-factory.ts), When the test waits for `shoppingLists.overview` ready instrumentation and scrolls `shopping-lists.overview.content`, Then the header locator `shopping-lists.overview.header` retains its position. Instrumentation: list scope `shoppingLists.overview`. Backend hooks: existing factories.
- Scenario 2 – Search updates counts and instrumentation (docs/features/list_screen_template/plan.md:58-60). Given seeded lists with varied metadata, When a search term is entered post `shoppingLists.overview.filters` event, Then the summary text and filtered badge reflect the metadata and `endUiState('shoppingLists.overview.filters', …)` emits updated counts. Instrumentation: `shoppingLists.overview` + `shoppingLists.overview.filters`. Backend hooks: factories for matching/non-matching lists.
- Scenario 3 – Segmented tabs swap datasets without layout shift (docs/features/list_screen_template/plan.md:60-62). Given active and completed lists exist, When the tab toggles after waiting for the filters event, Then the grid and counts update while header height stays constant. Instrumentation: `shoppingLists.overview.filters`. Backend hooks: factories for both statuses.
- Scenario 4 – Create Concept List from sticky header (docs/features/list_screen_template/plan.md:62-63). Given the button resides in the pinned header, When the dialog completes using factories and instrumentation is awaited, Then the new list appears and the header remains pinned. Instrumentation: `shoppingLists.overview` + existing form events. Backend hooks: `ShoppingListFactory`.

### 5) **Adversarial Sweep (≥3 issues)**
- **[ISSUE-1] Major — Scroll container lacks flex/min-h-0 contract**  
  Evidence: The layout spec only calls for `flex flex-col h-full overflow-hidden` with an `overflow-auto` div (docs/features/list_screen_template/plan.md:25-27). Existing scroll shells pair the scroll region with `flex-1` and `min-h-0` to keep headers fixed (src/components/parts/ai-part-review-step.tsx:199-208).  
  Why it matters: Without growth and `min-h-0`, the child div will expand to fit all cards, causing the outer document to scroll and the header to leave view—failing the sticky requirement.  
  Fix suggestion: Explicitly require the content slot to use `flex-1 overflow-auto min-h-0` (and parent wrappers to set `min-h-0`) so only the content pane scrolls.  
  Confidence: High
- **[ISSUE-2] Major — No path to tag the scrollable content region**  
  Evidence: Props only include `headerTestId` (docs/features/list_screen_template/plan.md:25-27) but Step 4 expects a `shopping-lists.overview.content` test id (docs/features/list_screen_template/plan.md:31-33). There’s no API to pass that through, yet tests must locate the scroller (tests/support/page-objects/shopping-lists-page.ts:24-112).  
  Why it matters: Without a `contentTestId`/`contentProps`, Playwright cannot target the scroll container for sticky assertions, blocking the coverage in Step 1.  
  Fix suggestion: Add an explicit prop (e.g., `contentProps` or `contentTestId`) to `ListScreenLayout` so consumers can mark the scrollable region.  
  Confidence: High
- **[ISSUE-3] Major — Filtered badge contract is inconsistent**  
  Evidence: The algorithm says to compute `filteredCount when the search term is non-empty` yet the plan passes `filtered: filteredLists.length` regardless (docs/features/list_screen_template/plan.md:49-53). The data-display guidance expects summaries to accurately reflect filtered totals (docs/contribute/ui/data_display.md:7-10).  
  Why it matters: Supplying `filteredLists.length` when search is clear will keep the badge visible even with no filters, confusing users and breaking deterministic assertions.  
  Fix suggestion: Document that `filtered` should be `undefined` (or include an explicit `isFiltered` flag) when no search term is applied so the helper can hide the badge.  
  Confidence: Medium

### 6) Derived-Value & Persistence Invariants
| Derived value | Source dataset (filtered/unfiltered) | Write/cleanup it triggers | Guard conditions | Invariant that must hold | Evidence |
| ------------- | ------------------------------------ | ------------------------- | ---------------- | ------------------------ | -------- |
| `filteredLists` | Lists from `useShoppingListsOverview()` after search filter (filtered) | Feeds summary copy and instrumentation metadata | Search term trimming must be consistent | Length equals total search matches across statuses | docs/features/list_screen_template/plan.md:44-53 |
| `activeLists` / `completedLists` | Partition of `filteredLists` by status (filtered) | Instrumentation metadata and tab counts | Status comparisons must mirror backend values | Combined lengths cover `filteredLists` with no overlap | docs/features/list_screen_template/plan.md:45-48 |
| `visibleLists` | Selected bucket based on active tab (filtered subset) | Drives counts helper and grid rendering | Active tab must match available ids | Visible lists align with tab selection and search term | docs/features/list_screen_template/plan.md:47-53 |

### 7) Risks & Mitigations (top 3)
- Sticky header fails because flex/min-h-0 requirements are unstated; mitigation: codify the scroll container contract in Step 2.
- Tests can’t target the scrollable pane without a prop; mitigation: add a `contentTestId`/`contentProps` API alongside `headerTestId`.
- Filtered badge shows at the wrong times; mitigation: clarify that `filtered` is optional and only sent when a filter is active (or expose `isFiltered`).

### 8) Confidence
Confidence: Medium — the issues are clear in the current code patterns, but resolving them depends on clarifying the layout API and count contract.

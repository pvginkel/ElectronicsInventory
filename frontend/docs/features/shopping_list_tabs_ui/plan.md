# Shopping List Tabs UI Plan

## Brief Description
- Follow through on the docs/features/shopping_list_phase1/plan.md change that “switch[ed] the shopping list to a tabbed view” but currently relies on “adding two buttons”; deliver a polished, accessible, and responsive tab experience for the Active vs. Completed shopping list filters that aligns with the contributor UI guidelines.
- Preserve existing data fetching, instrumentation, and local storage tab persistence while elevating the visual hierarchy, count feedback, and keyboard interactions so the Active/Completed split reads as a first-class navigation surface.

## Relevant Files & Modules
- `src/components/shopping-lists/overview-list.tsx` – owns the Active/Completed state, search/filter summary, instrumentation hooks, and currently renders the two-button tab row.
- `src/components/ui/button.tsx`, `tailwind.config.ts` – design tokens and variants to reference when establishing a new segmented tab pattern.
- `src/components/ui/card.tsx`, `src/components/ui/badge.tsx` – supporting primitives referenced inside the overview cards; ensure spacing updates harmonize with existing tokens.
- `src/components/shopping-lists/overview-card.tsx` – card hover/focus treatments should stay consistent with the refined tab affordance.
- `src/lib/test/query-instrumentation.ts`, `src/lib/test/ui-state.ts` – list instrumentation currently emitting `{ activeTab, activeCount, completedCount }`; verify metadata remains stable when wiring the new tab component.
- `tests/support/page-objects/shopping-lists-page.ts`, `tests/e2e/shopping-lists/shopping-lists.spec.ts` – Playwright helpers and specs that exercise the overview tabs, breadcrumb return flow, and summary counts.
- `docs/contribute/ui/data_display.md` – baseline styling and summary guidance to cite when refining layout spacing and responsive breakpoints.

## Implementation Steps

### 1. Establish a segmented tab UI primitive
1. Create `src/components/ui/segmented-tabs.tsx` exporting a controlled `<SegmentedTabs>` component that renders a `div` with `role="tablist"` and internally maps an `items` array to `button` elements with `role="tab"`. The API should expose `value`, `onValueChange`, `items`, and optional count badges so the Shopping List overview can declaratively render Active/Completed entries without composing child components manually.
2. Style the component with Tailwind utilities to render a pill-shaped container (`rounded-full`, `bg-muted/60`, `border`, `backdrop-blur`) and animated active indicators (e.g., `absolute` highlight or `before` pseudo-element) using CSS variables defined inside the component to avoid leaking global styles.
3. Mirror the hover/focus behaviours from `Button` defaults (outline ring, focus-visible states) so the new tabs meet accessibility expectations. Reference the transition tokens already used in `button.tsx` for timing (`transition-colors`, `duration-150`).
4. Include keyboard navigation support: handle arrow keys to move between tabs, Home/End to jump, and Space/Enter to select. Persist `aria-controls` IDs for eventual tab panel associations.
5. Export lightweight count badge support (small rounded span with `text-xs`, `font-medium`, `bg-white/80` when active, `text-muted-foreground` when inactive) so the overview can surface `activeCount` / `completedCount` without manual DOM wiring.

### 2. Refine the overview layout to use the new primitive
1. Replace the inline `<Button>` pair in `src/components/shopping-lists/overview-list.tsx` with the new `<SegmentedTabs>` component, passing `{ id: 'active', label: 'Active', count: totalActiveCount }` and `{ id: 'completed', label: 'Completed', count: totalCompletedCount }` items so both the total population and filtered counts are legible.
2. Move the summary row (`shopping-lists.overview.summary`) directly beneath the tab control and update the copy to surface filtered totals (e.g., “3 of 12 active lists showing” / “12 active lists”) while the tab badges present the raw totals. Keep spacing consistent with the list rules in `docs/contribute/ui/data_display.md` (top margin `mb-6`, grid gap `gap-4`).
3. Add a subtle divider (`border-b border-border/50`) or background panel tying the search input, tabs, and summary together on desktop, while collapsing to a stacked layout (`flex flex-col gap-3`) on mobile so the segmented tabs remain tappable.
4. Ensure `handleSelectTab` still wraps `beginUiState` / `endUiState` calls when switching tabs so the instrumentation in `useListLoadingInstrumentation` continues to capture `{ activeTab, activeCount, completedCount }` metadata after the compositional change.
5. Expand the `filtersMetadata` memo to include a `visibleCount` derived from the currently visible list array; feed it into the `endUiState` payload for richer Playwright assertions without breaking existing consumers.

### 3. Tune responsive and visual feedback
1. Adjust the tab container to clamp width on small screens (`max-w-full`, `overflow-hidden`) and allow horizontal scrolling with snap points if future statuses are added; document this behaviour as a reusable pattern in the component props.
2. Update tab typography to `text-sm font-medium tracking-tight` with uppercase or small caps optional via a prop; keep `leading-none` to avoid vertical jitter.
3. Introduce an animated underline or pill highlight that eases between tabs (`transition-transform duration-200`) for visual continuity; reuse Tailwind `translate-x` transforms computed from tab index / item width (measure via `ResizeObserver` hook inside the component to compute indicator position).
4. Layer in test IDs on the new component using the existing handles (`data-testid="shopping-lists.overview.tabs.active"`, etc.) so the current page objects remain valid. Keep `role` semantics to satisfy Playwright `getByRole('tab', { name: /active/i })` queries.
5. Verify the `ListCreateDialog` button still aligns with the header by nudging the header container spacing if the new tab surface increases vertical footprint.

### 4. Update supporting documentation and tokens
1. Document the segmented tab usage in `docs/contribute/ui/data_display.md` (or link to a new subsection) noting that high-level filters should use the new component rather than ad hoc Buttons. Keep the file light per the contributor note and reference the canonical component file.
2. If new theme tokens are required (e.g., `--tab-active-bg`), add them to `tailwind.config.ts` under the existing CSS variable scheme so dark mode automatically inherits the values.
3. Audit `ShoppingListOverviewCard` hover styles to ensure they complement the tabs—tweak `hover:shadow-md` / `focus-visible:ring-ring` intensity if needed so the tabs remain the primary emphasis.

### 5. Refresh Playwright support
1. Extend `tests/support/page-objects/shopping-lists-page.ts` with helpers targeting the new segmented tab component (e.g., `await this.tabs.select('Completed')`) using role-based selectors and the new counts when asserting.
2. Update `tests/e2e/shopping-lists/shopping-lists.spec.ts` to cover the refined visuals: assert the tab badge counts, confirm `aria-selected` states persist after navigation, and validate the summary text reflects filtered vs. total counts.
3. Add an assertion ensuring the breadcrumb return flow keeps the Completed tab active and that the segmented control emits the expected telemetry by reading the `shoppingLists.overview.filters` event for `{ activeTab: 'completed', visibleCount: ... }`.
4. Ensure tests remain backend-driven (per `docs/contribute/testing/playwright_developer_guide.md`) by waiting on instrumentation hooks instead of layout-specific animations; adjust helper waits if the new indicator animation changes timing.

## Algorithm / Interaction Notes
- `SegmentedTabs` tracks focused and selected tab indices internally to support arrow-key navigation; when `onValueChange` fires, `ShoppingListsOverview` updates `activeTab`, persists to local storage, and triggers instrumentation (`beginUiState` → `endUiState`) with the recomputed `filtersMetadata` and `visibleCount`.
- Indicator positioning leverages per-tab DOM refs measured via `ResizeObserver`; on selection changes, compute the target width/offset and update CSS transform states for a smooth slide animation. Fallback to equal-width distribution if measurement is unavailable (SSR).
- Local storage persistence remains unchanged: `useState` initializer reads `window.localStorage.getItem('shoppingLists.overview.tab')`, and an effect writes the active tab whenever it changes.

## Playwright Coverage
1. **Segmented tab visuals and counts** – From the overview, assert the tab badges show the unfiltered totals, click “Completed”, verify `aria-selected` states and telemetry reflect the change, and confirm the summary text now references completed counts.
2. **Breadcrumb persistence** – Switch to “Completed”, open a list, navigate back via the breadcrumb, and wait for `shoppingLists.overview.filters` to report `{ activeTab: 'completed', visibleCount: <previous> }`.
3. **Search + tab interaction** – Filter the list with a search term, ensure the summary reports `visibleCount` vs. total, switch tabs, and confirm counts update deterministically without losing the search term or tab selection.
4. **Keyboard accessibility** – Use Playwright `page.keyboard` to move between tabs via ArrowLeft/ArrowRight and activate with Space, asserting the indicator and visible list update accordingly.

## Blocking Issues
- None identified; existing shopping list hooks already supply the counts needed for richer tab presentation, and no backend changes are required.

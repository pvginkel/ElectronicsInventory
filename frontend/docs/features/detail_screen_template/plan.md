# Shopping List & Part Edit Templates Plan

Introduce reusable detail and form screen shells so that the shopping list view and part edit screens keep their headers and footers fixed while only the main content scrolls. The user called out that the shopping list detail header must surface the breadcrumb bar, a title with status chip and actions, an optional component, status chips/related links, and the Concept/Ready toolbar; only the line content should scroll. The part edit screen must present a breadcrumb, a container with a top section titled “Edit Part …”, a scrollable middle section for fields, and bottom-aligned form buttons.

## Relevant Files & Functions
- `src/components/layout/detail-screen-layout.tsx` (new): shared layout for view screens with non-scrolling header/footer sections and a scrollable body, mirroring the list screen control pattern.
- `src/components/layout/form-screen-layout.tsx` (new): shared layout for edit screens/forms with fixed header/footer sections and a scrollable form body.
- `src/components/shopping-lists/detail-header-slots.tsx` (new), `src/components/shopping-lists/concept-header.tsx`, `src/components/shopping-lists/ready/ready-toolbar.tsx`, `src/components/shopping-lists/concept-toolbar.tsx`: adapt to expose slot-friendly fragments while keeping dialogs mounted via overlays, and remove self-managed sticky behavior.
- `src/routes/shopping-lists/$listId.tsx`: render the shopping list detail route through `DetailScreenLayout`, map existing header/toolbars into the new slots, and ensure both Concept and Ready views use the shared scroll container.
- `src/components/parts/part-form.tsx`: support screen layout mode via a `screenLayout` render-prop while keeping the existing card presentation for creation flows.
- `src/components/parts/part-details.tsx`: when `isEditing` is true, render the form inside `FormScreenLayout` with breadcrumb/title/footer slots instead of the current inline card.
- `tests/support/page-objects/shopping-lists-page.ts`, `tests/support/page-objects/parts-page.ts`: expose new getters for detail header/content/footer containers to drive scroll-behavior assertions.
- `tests/e2e/shopping-lists/shopping-lists-detail.spec.ts`, `tests/e2e/parts/part-crud.spec.ts` (and any helpers they use): cover the new layouts, update selectors, and assert headers/footers stay visible while content scrolls.

## Implementation Steps
1. **Confirm existing detail screen anatomy**  
   Review `src/routes/shopping-lists/$listId.tsx`, `ConceptHeader`, `ConceptToolbar`, `ReadyToolbar`, `SellerGroupList`, plus analogous detail screens such as `src/components/parts/part-details.tsx` and `src/components/boxes/box-details.tsx` to catalogue optional sections (status chips, related links). Align copy/layout expectations with `docs/contribute/ui/data_display.md` for badges and `docs/contribute/ui/forms.md` for form spacing.

2. **Author `DetailScreenLayout`**  
   Build a layout component under `src/components/layout/` that accepts slots for `breadcrumbs`, `title`, `titleMetadata` (e.g., status chip), `actions` (right-aligned buttons), `description`, `supplementary` (optional component), `metadataRow` (chips/links), `toolbar`, `children`, and optional `footer`. Structure the root as `flex h-full min-h-0 flex-col` where the header block sits above the single scroll container; give the content region `flex-1 min-h-0 overflow-auto` while leaving the header and footer outside the scrolling surface so they remain stationary. Expose `rootTestId`, `headerTestId`, `contentTestId`, `footerTestId`, and `actionsTestId` props so Playwright can target each region.

3. **Author `FormScreenLayout`**  
   Create a second layout for edit screens with a fixed header (breadcrumb + title/actions), a `main` section that is the sole scroll container (`flex-1 min-h-0 overflow-auto`), and a footer rendered after the scroll container so it stays in place at the bottom of the viewport. Accept `breadcrumbs`, `title`, `actions`, `children`, `footer`, and optional `context` slot for helper copy. Follow the form spacing and button placement guidance from `docs/contribute/ui/forms.md`, and expose the same test IDs as the detail layout.

4. **Refactor shopping list detail header/toolbars for slot injection**  
   Introduce a thin adapter (e.g., `src/components/shopping-lists/detail-header-slots.tsx`) that consumes `ConceptHeader`/`ReadyToolbar` props and returns `{ slots: { breadcrumbs, title, titleMetadata, description, supplementary, metadataRow, actions }, overlays }`. Keep `ConceptHeader` responsible for dialog state and render the edit/delete `Dialog` inside the `overlays` fragment so the modal workflow stays intact. Remove the internal sticky wrappers from `ConceptToolbar` and `ReadyToolbar`, relying on the layout to keep those elements outside the scrollable region. Provide lightweight guidepost comments per the “Readability Comments” rule to outline how the fragments map to layout slots.

5. **Adopt `DetailScreenLayout` inside the shopping list route**  
   In `src/routes/shopping-lists/$listId.tsx`, replace the top-level padded `div` with the new layout.  
   - Pass breadcrumb/title/actions/status nodes from the adapter into the layout props and render its `overlays` fragment alongside the layout so dialogs stay mounted.  
   - Render `ConceptToolbar`/`ReadyToolbar` via the layout’s `toolbar` slot so both remain outside the scrollable region while the `ConceptTable`/`SellerGroupList` scrolls.  
   - Ensure both Concept and Ready views set distinct `data-testid` values for header/body (e.g., `shopping-lists.detail.header`, `shopping-lists.detail.content`).  
   - Preserve existing instrumentation (`useListLoadingInstrumentation`, form instrumentation) and verify the layout plays nicely with the existing TanStack Router shell documented in `docs/contribute/architecture/application_overview.md` (no nested scrollbars or clipped content).

6. **Enable `PartForm` to render inside `FormScreenLayout`**  
   Add a `screenLayout` render-prop to `PartForm` that keeps the existing `<Form>` element as the single root. When `screenLayout` is provided, `PartForm` should call it with `{ header, content, footer }` sections (all rendered inside the same `<Form>`) and let the caller decide outer chrome, while the default path continues to wrap the form in a `Card`. `FormScreenLayout` will pass a render-prop that places the returned sections into its header/content/footer slots so the submit/cancel buttons remain within the form element. Maintain existing instrumentation (`useFormInstrumentation`), validation, duplication flows, and reuse the same DOM for `parts.form.*` test IDs.

7. **Wrap edit mode in the new form layout**  
   In `src/components/parts/part-details.tsx`, when `isEditing` is true wrap the screen-mode form with `FormScreenLayout`, providing breadcrumbs (Parts › {id}), title (“Edit Part …”), optional contextual helper if needed, scroll content from `PartForm`, and footer actions from the form. Keep non-edit states (view mode, duplication card) unchanged for this phase.

8. **Update Playwright page objects and specs**  
   Extend `ShoppingListsPage` and `PartsPage` with getters for `detailHeader`, `detailContent`, and (for forms) `detailFooter`, referencing the new `data-testid` hooks. In `shopping-lists-detail.spec.ts`, add backend-driven scenarios that overflow the list (seed via factories), scroll the content region, and assert the header/toolbar remain visible by comparing bounding rects before/after scroll and observing `scrollTop`. In `part-crud.spec.ts` (or a new edit-focused spec), open edit mode, scroll the form content, and verify both the header title and footer button bar remain in view. Wait on existing instrumentation events (`shoppingLists.list`, `ShoppingListStatus:*`, `PartForm:edit` form IDs) rather than mocking network activity.

## Data & Algorithms
1. Preserve existing shopping list data flows: `useShoppingListDetail` continues to produce `shoppingList`, `lines`, `sellerGroups`, and counts. The new layout simply rearranges rendered sections without altering sorting or mutation logic.  
2. When rendering Concept vs Ready views, set the layout `toolbar` slot based on `shoppingList.status`; Concept continues to compute badges from `shoppingList.lineCounts`, Ready surfaces helper copy based on `canReturnToConcept`/`canMarkListDone`.  
3. For the part edit form, reuse `validatePartData` and mutation sequencing. The layout change only affects DOM structure: top section surfaces the form title and duplication summary (if present), body houses the existing grouped fields, and the footer keeps the `Cancel`/`Submit` buttons disabled based on mutation state.  
4. Ensure the layouts rely on the parent flex column + `min-h-0` pattern so the router shell controls the viewport height and only the designated content container scrolls, avoiding nested scrollbars within `src/routes/__root.tsx`.

## Playwright Coverage
1. **Shopping list detail fixed header & toolbar** — Seed enough concept lines to require scrolling, wait for `shoppingLists.list` ready event, record header bounding rect, scroll the layout content (`shopping-lists.detail.content`) to the bottom, and assert the header and toolbar elements retain their `getBoundingClientRect().top`.  
2. **Ready view fixed toolbar** — Promote the list to Ready state via existing helpers, navigate to Ready view, scroll seller groups, and confirm the header + Ready toolbar remain visible; assert no duplicate toolbar wrappers exist.  
3. **Part edit fixed form container** — Enter edit mode for a seeded part, scroll the form body until lower sections (e.g., seller information) are visible, and assert the “Edit Part …” title and submit buttons stay within viewport. Confirm the form instrumentation events (`formId` returned by `useFormInstrumentation`) emit submit/success without additional waits, keeping the test backend-driven per `docs/contribute/testing/playwright_developer_guide.md`.  
4. **Regression selectors** — Verify updated `data-testid` hooks (header/content/footer) in the page objects to keep existing tests passing without resorting to `page.route` or client-side request interception, following `docs/contribute/testing/index.md`.

## Phases
- **Phase 1:** Implement `DetailScreenLayout` and `FormScreenLayout`, refactor shopping list detail (both Concept and Ready views) to use the new layout, and update associated Playwright selectors/tests.  
- **Phase 2:** Enable `PartForm` screen mode, wrap part edit flow in `FormScreenLayout`, and extend Playwright coverage for the fixed form header/footer. Future phases can onboard additional view/edit screens onto the shared templates.

## Blocking Issues
- None identified; existing backend factories and instrumentation scopes already support the required Playwright scenarios.

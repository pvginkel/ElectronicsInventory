# Brief
- Deliver a UX update that "make[s] all primary action buttons on lists and forms sticky" so the critical actions (`Add Part`, `Add with AI`, `Create Concept List`, `Cancel / Add Part`, etc.) are always accessible.
- Follow the user's guidance that "For list screens the best fix is to just make the cards scrollable instead of the whole form. For the edit screens the easiest fix is to make the form full size and the panel with fields scrollable."
- Keep the plan aligned with the existing patterns in `docs/contribute/ui/data_display.md`, `docs/contribute/ui/forms.md`, and `docs/contribute/ui/patterns/part_management.md`, only deviating to add the sticky affordances called out above.

# Impacted Files / Functions
- `src/hooks/use-sticky-header.ts` (new) — shared hook/component to observe stickiness, add elevation styling, and emit instrumentation.
- `src/lib/test/ui-sticky-instrumentation.ts` (new) — helper that wraps `emitTestEvent` to record sticky/unstuck transitions under deterministic scopes.
- `src/routes/parts/index.tsx` and `src/components/parts/part-list.tsx` — promote the list shell to a full-height flex column, mount the header inside the sticky component, and limit scrolling to the card grid/search results.
- `src/routes/shopping-lists/index.tsx` and `src/components/shopping-lists/overview-list.tsx` — same treatment for the concept list overview flow.
- `src/components/parts/part-form.tsx` — restructure the form into a full-height surface, move the cancel/submit pair into a sticky toolbar, and contain field sections inside an internal scroll region.
- `src/components/boxes/box-list.tsx`, `src/routes/boxes/index.tsx` — extend the sticky list pattern to storage boxes.
- `src/components/types/TypeList.tsx`, `src/routes/types/index.tsx` — apply the same sticky header + scrollable grid approach to the type catalog.
- `src/components/sellers/seller-list.tsx` (or equivalent list entry point) — audit and convert any remaining list header with primary actions to the shared sticky component.
- `tests/support/page-objects/*` (PartsPage, ShoppingListsPage, BoxesPage, TypesPage, SellersPage) — expose helpers that read sticky header state (`data-state="stuck"`) and ensure scroll helpers hit the right containers.
- `tests/e2e/parts/*.spec.ts`, `tests/e2e/shopping-lists/*.spec.ts`, `tests/e2e/boxes/*.spec.ts`, `tests/e2e/types/*.spec.ts`, `tests/e2e/sellers/*.spec.ts` — update scenarios to assert the sticky behavior and consume the new instrumentation scopes.
- `tests/support/helpers.ts` (if needed) — add a convenience helper for awaiting `ui_state` events that carry sticky metadata, mirroring the deterministic strategy outlined in `docs/contribute/testing/playwright_developer_guide.md`.

# Implementation Steps
1. **Shared sticky infrastructure**
   - Create `useStickyHeader` that returns `{ ref, sentinelRef, isStuck }` using `IntersectionObserver` against a zero-height sentinel positioned above the header. The hook adds/removes a `shadow-sm`/border based on `isStuck`, keeps the header background opacified per the app shell, and exposes `data-state` so CSS and tests can react.
   - Emit instrumentation from the hook via `ui-sticky-instrumentation`, e.g., `emitStickyState({ scope: 'parts.list.header', state: isStuck ? 'stuck' : 'released' })`, so Playwright can wait on backend-driven state instead of brittle scroll timing. Scope names should follow the existing list/form naming (`parts.list`, `parts.form`) to stay consistent with `useListLoadingInstrumentation` / `useFormInstrumentation`.
   - Document the hook expectations (top offsets for the app shell, required backdrop classes) inline, referencing `docs/contribute/ui/data_display.md` so future contributors reuse it instead of creating ad hoc sticky wrappers.

2. **Lists: Parts, Shopping Lists, Boxes, Types, Sellers**
   - Update each route component (`/parts`, `/shopping-lists`, `/boxes`, `/types`, `/sellers`) to render a `flex h-full flex-col overflow-hidden` wrapper so the sticky header is measured against the page scroll container created by the app shell (`main.flex-1 overflow-auto`).
   - Refactor the list component bodies:
     - Wrap the existing header (title + buttons) in the shared `StickyHeader` component with `top-0`, `z-20`, `bg-background/95`, and `backdrop-blur` to match the design in `docs/contribute/ui/patterns/part_management.md`.
     - Place a `div` with `flex-1 overflow-auto` beneath the header that holds search, summary, and card grid content; attach `data-testid="*.list.scroll-region"` for Playwright.
     - Keep loading/empty/error states compliant with `data_display.md`, but ensure the primary action button remains inside the sticky shell even when disabled (per the user's "the whole header" request for skeleton/error modes).
     - Use the sticky instrumentation scope per list (`parts.list.header`, `shoppingLists.overview.header`, etc.) so tests can assert `state: 'stuck'` when the observer fires.
   - Verify that secondary buttons (e.g., `Add with AI`) stay right-aligned as required by the pattern doc, and that keyboard tab order respects the sticky region.

3. **Forms: Part creation, duplication, and edit**
   - Restructure `PartForm` so the outermost element becomes `div className="flex h-full flex-col overflow-hidden bg-card rounded-xl border"` instead of a static `Card` with `p-6`. Preserve the established section layout from `docs/contribute/ui/forms.md` by rendering the previous `Card` padding inside the scroll area.
   - Move the existing header (`Add Part` / `Edit Part …`) and action row into the sticky component positioned at the top; keep `Cancel` and the primary submit button on the right, and include a minimal breadcrumb/descriptor on the left for context.
   - Place all form sections inside `div className="flex-1 overflow-auto px-6 pb-6 space-y-6"` to satisfy the user's direction that "the panel with fields [is] scrollable." Reuse the instrumentation `formId` and ensure the sticky toolbar emits `parts.form.toolbar` sticky events when it pins.
   - Retain the existing bottom action row only when screen readers require a focusable submit nearer to the final field; if retained, hide it visually on desktop but leave it accessible via `sr-only` labels, documenting the reasoning in a short guidepost comment per the "Readability Comments" guidance.
   - Confirm duplication and AI copy progress UI still appears within the scroll region and that `useFormInstrumentation` continues to track submit/success/error phases unchanged.

4. **Playwright coverage & helpers**
   - Extend `Tests/support/page-objects` to expose methods like `await parts.waitForHeaderSticky()` that internally call `waitTestEvent('ui_state', scope === 'parts.list.header', metadata.stickyState === 'stuck')` plus DOM assertions against `data-state`.
   - Update list specs (parts, shopping lists, boxes, types, sellers) to scroll the new `*.list.scroll-region` and expect the corresponding sticky event before asserting button visibility. Ensure they avoid `page.route` per `docs/contribute/testing/playwright_developer_guide.md`.
   - Modify form specs (create/edit) to verify that `Cancel` and primary actions stay visible after scrolling the form body, again waiting on the sticky instrumentation scope before validating `isVisible()`.
   - Add regression coverage for responsive breakpoints if the suite already runs viewport variants; otherwise, document in test comments how to extend coverage later.

# Playwright Scenarios
1. **Parts list retains sticky header** — Navigate to `/parts`, wait for `parts.list.header` sticky event after scrolling the card region, and verify `Add Part`/`Add with AI` remain interactable while new cards load via `useListLoadingInstrumentation`.
2. **Shopping list overview header sticks** — From `/shopping-lists`, scroll through a seeded list until the sentinel fires; assert `Create Concept List` stays visible and that search + summary remain accessible.
3. **Other resource lists inherit sticky behavior** — Repeat for `/boxes`, `/types`, and `/sellers`, ensuring their headers emit respective sticky events and that disabled primary buttons during loading/error still occupy the sticky slot.
4. **Part form sticky toolbar** — Load `/parts/new`, scroll to the bottom of the form, and confirm `Cancel` / `Add Part` persist in view. Trigger a validation error to ensure the sticky toolbar does not block toasts or error summaries.
5. **Edit + duplicate flows** — Enter edit mode from a part detail, scroll while the toolbar is stuck, submit changes, and verify instrumentation still reports `Form` events (`parts.form.editor`). Duplicate flow should exercise the progress indicator inside the scroll region.
6. **Keyboard/focus regression** — Tab through the sticky headers to confirm focus order remains logical; this can be a scripted Playwright step or manual fallback documented as part of the test plan.

# Blocking Issues
- None identified. The browser support matrix already includes `IntersectionObserver`; if older browsers require a fallback, flag it during implementation.

# Phasing
1. **Phase 1 — Shared hook + Parts & Shopping Lists**: build the shared sticky infrastructure, convert the two user-cited surfaces, and land the corresponding tests.
2. **Phase 2 — Remaining resource lists**: adopt the shared component across boxes, types, sellers (and any other list using the same header pattern), adjusting tests in lockstep.
3. **Phase 3 — Form polish**: refactor `PartForm` (and other long forms if discovered) to the sticky toolbar layout, then extend Playwright coverage for edit and duplication flows.

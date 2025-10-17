# Detail & Form Screen Rollout Plan

Roll out the fixed-header detail and edit experiences established for the shopping list and part edit screens across every applicable view/edit surface. Apply `DetailScreenLayout` and `FormScreenLayout` (with the card chrome using `p-0`, no template-level description row, and no embedded breadcrumb duplication) everywhere we expose record details or full-page forms, and collapse the temporary branching inside `PartForm` once all flows compose the shared template.

## Relevant Files & Functions
- Layout primitives
  - `src/components/layout/detail-screen-layout.tsx`, `src/components/layout/form-screen-layout.tsx` — verify slot coverage, card chrome, optional toolbar/footer behaviour, and public test IDs.
- Parts domain
  - `src/components/parts/part-details.tsx`, `src/routes/parts/$partId.tsx` — adopt `DetailScreenLayout` for the read-only view, keep instrumentation overlay wiring, and route edit actions to the dedicated screen.
  - `src/routes/parts/$partId/edit.tsx`, `src/components/parts/part-form.tsx`, `src/routes/parts/new.tsx`, `src/components/parts/ai-part-review-step.tsx` — standardize the form shell across create/edit/duplicate flows, strip legacy card-only branches, and preserve `useFormInstrumentation` semantics.
- Boxes domain
  - `src/components/boxes/box-details.tsx`, `src/routes/boxes/$boxNo.tsx` — refactor detail rendering to use `DetailScreenLayout`, expose toolbar/actions slots, and keep summary/cards aligned with `docs/contribute/ui/data_display.md`.
- Shared hooks & instrumentation
  - `src/lib/test/query-instrumentation.ts`, `src/hooks/use-form-instrumentation.ts`, `src/hooks/use-list-loading-instrumentation.ts` consumers — confirm metadata payloads still surface view state (`view`, `status`) after refactors.
- Playwright harness
  - Page objects: `tests/support/page-objects/parts-page.ts`, `tests/support/page-objects/boxes-page.ts`, `tests/support/page-objects/shopping-lists-page.ts` (ensure consistent slot getters).
  - Specs: `tests/e2e/parts/part-crud.spec.ts`, `tests/e2e/parts/parts-ai.spec.ts` (if it exercises the AI create wizard), `tests/e2e/boxes/boxes-detail.spec.ts`, plus any spec asserting on legacy part detail markup.

## Implementation Steps
1. **Revisit layout + form patterns**  
   Re-read `docs/contribute/ui/data_display.md` (detail surfaces) and `docs/contribute/ui/forms.md` (form spacing, button placement) to catalogue required sections (breadcrumbs → title/status → metadata rows → toolbar/actions; header + scroll body + footer for forms). Confirm `DetailScreenLayout` exposes the necessary slots (including `supplementary`, `metadataRow`, optional `toolbar`) and `FormScreenLayout` reflects the agreed card chrome (`Card` with `p-0` and no extra description slot).

2. **Harden the layout primitives for reuse**  
   - Validate `DetailScreenLayout` supports per-screen `data-testid` naming (e.g., `parts.detail.*`, `boxes.detail.*`). Add optional props if we need to override padding or aria labels without reintroducing bespoke wrappers.  
   - Confirm `FormScreenLayout` actions slot is optional, breadcrumbs render only when provided, and header/footer heights stay stable for scroll assertions.  
   - Audit existing consumers (shopping lists, current part edit flow, any feature plans) and log which props are in use before pruning; only remove options confirmed unused.

3. **Parts detail view migration & instrumentation**  
   - Wrap the read-only branch of `PartDetails` in `DetailScreenLayout`, mapping existing fragments: breadcrumb/title/status chip, instrumentation overlays, actions (Edit, Delete, Add to list dropdown), and `supplementary` for badges/documents as needed.  
   - Move summary cards and related sections into the `children` slot and introduce `useListLoadingInstrumentation` with a new `parts.detail` scope that reflects the primary detail query (`status`, `partKey`, `sectionCounts`), keeping the existing `parts.detail.shoppingLists` scope for memberships.  
   - Update `parts/$partId.tsx` container to provide `flex h-full min-h-0` and pass the breadcrumb node directly to the layout (so no duplicate inside the form).  
   - Ensure test IDs follow the `parts.detail.header/content/footer` convention consumed by Playwright and maintain temporary aliases until specs migrate.

4. **Dedicated part form screens & PartForm cleanup**  
   - Introduce `src/routes/parts/$partId/edit.tsx` that mounts `FormScreenLayout` around `PartForm`, emits breadcrumbs (`Parts / {partKey}`), and wires footer actions (`Cancel`, `Save`) with existing instrumentation/test IDs (`parts.form.*`).  
   - Replace the inline edit branch in `PartDetails` with navigation to the new edit route while keeping duplicate/delete/shopping list actions intact.  
   - Update `parts/new.tsx` (and any other screen using `PartForm` standalone) to render the form inside `FormScreenLayout`, supplying breadcrumbs, title (“Add Part” or duplicate label), and footer actions.  
   - Collapse the legacy card branch inside `PartForm` into a helper that only dialog flows consume; default to `FormScreenLayout` callers for screen-level usage while preserving instrumentation/test IDs.  
   - Audit `ai-part-review-step.tsx` to confirm its bespoke layout is intentional and note any selector adjustments required for consistent spacing.

5. **Boxes detail rollout**  
   - Convert `BoxDetails` to use `DetailScreenLayout`: map breadcrumbs (“Storage Boxes / Box #”), title/status chips (usage), actions (Edit/Delete), and pass the existing summary/locations grid into the scrollable body.  
   - Extract toolbar content if we surface per-state actions (e.g., when toggle editing) so the toolbar slot stays outside the scroll container.  
   - Ensure the route wrapper (`boxes/$boxNo.tsx`) mirrors the parts route (`flex h-full min-h-0 p-6`).  
   - Keep `useListLoadingInstrumentation` scope `boxes.detail` emitting metadata (`locations`, `boxNo`) for deterministic waits.

6. **Secondary consumers & polish**  
   - Grep for other detail-like surfaces (documents, sellers) and confirm whether they warrant the template now or are explicitly modal-based. Document any intentionally skipped screens in the plan’s follow-up notes.  
   - After all primary flows adopt the layouts, remove only those layout/`PartForm` props confirmed unused by the earlier audit, and tighten `PartForm`’s API (e.g., extract shared section helpers).

7. **Playwright + support updates**  
   - Extend `parts-page` to expose helpers for the read-only detail layout (`parts.detail.*`) and the new edit route (reuse the stabilized `parts.form.*` selectors), and update navigation helpers to follow the edit link instead of toggling inline state.  
   - Extend `boxes-page` to expose `detailHeader`, `detailContent`, `detailFooter`, and toolbar getters aligned with the new `data-testid`s; adjust scroll helpers to target the inner `main`.  
   - Update `boxes-detail.spec.ts` to assert pinned header/toolbar behaviour (mirroring the shopping list tests) and rely on backend factories for overflow.  
   - Broaden `part-crud.spec.ts` (and AI flow spec) to cover create, edit (new route), and duplicate flows, waiting on `PartForm` instrumentation (`PartForm:create`/`edit`/`duplicate`) before asserting.  
   - Ensure tests wait on `waitForListLoading` scopes (`parts.detail`, `boxes.detail`) rather than DOM heuristics; avoid `page.route` per `docs/contribute/testing/playwright_developer_guide.md`.

8. **Regression sweep + docs touch-up**  
   - Run `pnpm check`, `pnpm build`, and the full Playwright matrix covering parts/boxes/shopping lists.  
   - If layout APIs changed, update `docs/features/detail_screen_template/plan.md` or architecture notes accordingly.

## Playwright Coverage
1. **Parts detail fixed header/toolbars** — Extend `tests/e2e/parts/part-crud.spec.ts` (or a dedicated detail spec) to seed a part with enough related sections, record header/toolbar bounding rects, scroll `parts.detail.content`, and assert stability while waiting on `waitForListLoading(page, 'parts.detail', 'ready')`.
2. **Parts create/edit/duplicate screen layout** — In `parts/part-crud.spec.ts` and AI create specs, navigate to the create route and the new `/parts/:partId/edit` route, scroll the form body (`parts.form.content`), and verify the header/footer remain in view while waiting on `PartForm` instrumentation events (`PartForm:create`, `PartForm:edit`, `PartForm:duplicate`).
3. **Boxes detail fixed header** — Update `tests/e2e/boxes/boxes-detail.spec.ts` to seed enough locations, scroll the new detail content container, and assert header/action bar positions plus usage metadata; rely on `waitForListLoading(..., 'boxes.detail')`.
4. **Regression selectors** — Refresh page objects to use `*.detail.header/content/footer` IDs, and backfill assertions ensuring breadcrumbs/actions are still reachable. Confirm no spec references removed card wrappers.

All tests remain backend-driven via factories/helpers, and no Playwright spec uses request interception.

## Phases
1. **Phase 1:** Finalize layout primitives, add the `parts.detail` instrumentation scope, migrate parts detail + create/edit flows (including the new `/parts/:partId/edit` route), and update Playwright/page objects for parts.
2. **Phase 2:** Adopt the templates for boxes detail (and any additional eligible detail screens), update supporting page objects/tests, and validate instrumentation metadata.
3. **Phase 3:** Polish passes — remove confirmed-unused helpers, update documentation, and run the full regression suite.

## Blocking Issues
- None identified; backend factories already expose seeded parts/boxes with sufficient records to exercise scroll behaviour. Should additional domains emerge, document their data requirements before implementation.

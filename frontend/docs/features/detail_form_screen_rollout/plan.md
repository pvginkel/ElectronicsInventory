# Detail & Form Screen Rollout Plan

Roll out the fixed-header detail and edit experiences established for the shopping list and part edit screens across every applicable view/edit surface. Apply `DetailScreenLayout` and `FormScreenLayout` (with the card chrome using `p-0`, no template-level description row, and no embedded breadcrumb duplication) everywhere we expose record details or full-page forms, and collapse the temporary branching inside `PartForm` once all flows compose the shared template.

## Relevant Files & Functions
- Layout primitives
  - `src/components/layout/detail-screen-layout.tsx`, `src/components/layout/form-screen-layout.tsx` — verify slot coverage, card chrome, optional toolbar/footer behaviour, and public test IDs.
- Parts domain
  - `src/components/parts/part-details.tsx`, `src/routes/parts/$partId.tsx` — adopt `DetailScreenLayout` for the read-only view, keep instrumentation overlay wiring, and ensure edit mode continues to call `FormScreenLayout`.
  - `src/components/parts/part-form.tsx`, `src/routes/parts/new.tsx`, `src/components/parts/ai-part-review-step.tsx` — converge on the screen template for create/edit/duplicate flows, strip legacy card-only branches, and preserve `useFormInstrumentation` semantics.
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

3. **Parts detail view migration**  
   - Wrap the read-only branch of `PartDetails` in `DetailScreenLayout`, mapping existing fragments: breadcrumb/title/status chip, instrumentation overlays, actions (Edit, Delete, Add to list dropdown), and `supplementary` for badges/documents as needed.  
   - Move summary cards and related sections into the `children` slot while keeping `useListLoadingInstrumentation` scope intact.  
   - Update `parts/$partId.tsx` container to provide `flex h-full min-h-0` and pass the breadcrumb node directly to the layout (so no duplicate inside the form).  
   - Ensure test IDs follow the `parts.detail.header/content/footer` convention consumed by Playwright.

4. **Parts create/duplicate screen adoption & PartForm cleanup**  
   - Update `parts/new.tsx` (and any other screen using `PartForm` standalone) to render the form inside `FormScreenLayout`, supplying breadcrumbs, title (“Add Part” or duplicate label), and footer actions.  
   - Remove the legacy card branch inside `PartForm`: collapse `screenLayout` into required props, move the common section markup into dedicated subcomponents/helpers, and keep instrumentation/test IDs stable (`parts.form.*`).  
   - Audit `ai-part-review-step.tsx` if it still composes the older layout; decide whether to call the shared sections helper or intentionally remain bespoke.

5. **Boxes detail rollout**  
   - Convert `BoxDetails` to use `DetailScreenLayout`: map breadcrumbs (“Storage Boxes / Box #”), title/status chips (usage), actions (Edit/Delete), and pass the existing summary/locations grid into the scrollable body.  
   - Extract toolbar content if we surface per-state actions (e.g., when toggle editing) so the toolbar slot stays outside the scroll container.  
   - Ensure the route wrapper (`boxes/$boxNo.tsx`) mirrors the parts route (`flex h-full min-h-0 p-6`).  
   - Keep `useListLoadingInstrumentation` scope `boxes.detail` emitting metadata (`locations`, `boxNo`) for deterministic waits.

6. **Secondary consumers & polish**  
   - Grep for other detail-like surfaces (documents, sellers) and confirm whether they warrant the template now or are explicitly modal-based. Document any intentionally skipped screens in the plan’s follow-up notes.  
   - After all primary flows adopt the layouts, delete unused props/helpers from `FormScreenLayout`/`DetailScreenLayout` and tighten `PartForm`’s API (e.g., remove card wrapper import).

7. **Playwright + support updates**  
   - Extend `parts-page` and `boxes-page` to expose `detailHeader`, `detailContent`, `detailFooter`, and toolbar getters aligned with the new `data-testid`s; adjust scroll helpers to target the inner `main`.  
   - Update `boxes-detail.spec.ts` to assert pinned header/toolbar behaviour (mirroring the shopping list tests) and rely on backend factories for overflow.  
   - Broaden `part-crud.spec.ts` (and AI flow spec) to cover the create screen layout, waiting on `form` instrumentation (`PartForm:create`/`duplicate`) before asserting.  
   - Ensure tests wait on `waitForListLoading` scopes (`parts.detail`, `boxes.detail`) rather than DOM heuristics; avoid `page.route` per `docs/contribute/testing/playwright_developer_guide.md`.

8. **Regression sweep + docs touch-up**  
   - Run `pnpm check`, `pnpm build`, and the full Playwright matrix covering parts/boxes/shopping lists.  
  - If layout APIs changed, update `docs/features/detail_screen_template/plan.md` or architecture notes accordingly.

## Playwright Coverage
1. **Parts detail fixed header/toolbars** — Extend `tests/e2e/parts/part-crud.spec.ts` (or a dedicated detail spec) to seed a part with enough related sections, record header/toolbar bounding rects, scroll `parts.detail.content`, and assert stability while checking instrumentation scope `parts.detail` reached `ready`.
2. **Parts create/duplicate screen layout** — In `parts/part-crud.spec.ts` and AI create specs, navigate to the create and duplicate flows, scroll the form body (`parts.detail.edit.content` or `parts.create.content`), and verify the header/footer remain in view; wait on `PartForm` instrumentation events (`PartForm:create`, `PartForm:duplicate`) instead of intercepting network.
3. **Boxes detail fixed header** — Update `tests/e2e/boxes/boxes-detail.spec.ts` to seed enough locations, scroll the new detail content container, and assert header/action bar positions plus usage metadata; rely on `waitForListLoading(..., 'boxes.detail')`.
4. **Regression selectors** — Refresh page objects to use `*.detail.header/content/footer` IDs, and backfill assertions ensuring breadcrumbs/actions are still reachable. Confirm no spec references removed card wrappers.

All tests remain backend-driven via factories/helpers, and no Playwright spec uses request interception.

## Phases
1. **Phase 1:** Finalize layout primitives + migrate parts detail/create flows, including `PartForm` cleanup and Playwright updates for parts.
2. **Phase 2:** Adopt the templates for boxes detail (and any additional eligible detail screens), update supporting page objects/tests.
3. **Phase 3:** Polish passes — remove deprecated helpers, update documentation, run the full regression suite.

## Blocking Issues
- None identified; backend factories already expose seeded parts/boxes with sufficient records to exercise scroll behaviour. Should additional domains emerge, document their data requirements before implementation.

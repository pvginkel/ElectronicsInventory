## Shopping List Foundations – Frontend Progress

### Completed Work
- Added shopping list domain models and a comprehensive `use-shopping-lists` hook that maps generated API payloads, exposes scoped TanStack mutations, and ships reusable sort metadata.
- Implemented the `/shopping-lists/` overview route with create/delete flows, instrumentation, search-parameter syncing, and navigation wiring into the shell.
- Built the concept list experience: header metadata editing, sortable grid with add/edit/delete dialogs, duplicate-prevention banner, seller/part selectors, and the Mark Ready CTA with instrumentation.
- Added Playwright coverage plus supporting factories/page objects for overview CRUD, concept-line lifecycle, duplicate handling, sorting behaviour, and readiness transition.
- Ran linting; only existing warnings remain. Type checking initiated (see pending items).

### Outstanding Tasks
1. Resolve TypeScript compile errors:
   - Align validation rule generics for the new forms.
   - Tighten the selector typing in `useShoppingListsOverview` / `useShoppingListDetail`.
   - Ensure part selector metadata exposes numeric IDs.
   - Update router navigation calls to use typed helpers instead of raw strings.
   - Narrow Playwright event assertions to match the discriminated test-event types.
2. Re-run `pnpm check` once TypeScript issues are cleared.
3. (Optional) Revisit legacy ESLint warnings flagged during the run.

# Data Display Conventions

## Scope
These guidelines cover list, grid, and detail presentations that sit on top of the generated TanStack Query client. They draw from [`TypeList`](../../../../src/components/types/TypeList.tsx), [`PartList`](../../../../src/components/parts/part-list.tsx), and [`PartDetails`](../../../../src/components/parts/part-details.tsx).

## Lists & Collections
- Lists fetch data through generated hooks (`useGetTypesWithStats`, `useGetPartsWithLocations`, etc.) and expose memoized derived state (`filteredTypes`, `filteredParts`) rather than mutating the server payload.
- Searching and filtering should update the router search params via `useNavigate` so browser history and deep links work across sessions.
- Always provide a summary element (`data-testid="*.list.summary"`) that reports the result counts and reflects filtered vs. total totals.
- Use responsive grids (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3`, etc.) and keep interactive cards (`PartListItem`) clickable as a whole surface for mobile friendliness.

## Detail Surfaces
- Detail panels such as `PartDetails` combine read-only cards, document grids, and action menus. Keep them columnar on desktop (`grid-cols-1 lg:grid-cols-2`) and collapse gracefully on small screens.
- When switching into edit mode, replace the detail surface with the corresponding form component instead of navigating away. This keeps instrumentation state consistent and simplifies Playwright flows.
- Heavy experiences (attachment uploads, AI flows) should expose navigation affordances (`DropdownMenu`, explicit buttons) and rely on generated mutations (`useDeletePartsByPartKey`, `usePostAiPartsCreate`).

## Empty, Loading & Error States
- Emit skeletons while TanStack Query is loading. Follow the existing pattern: skeleton cards in lists and muted placeholders in detail views, each with `data-testid` hooks (`*.loading`, `*.loading.skeleton`).
- Provide empty and "no results" states with actionable guidance, e.g. "Add First Type" or "Try adjusting your search." That messaging belongs in the pattern docs, not in ad hoc components.
- Error surfaces should render explanatory copy plus the raw error string, wrapped in the shared `Card` when appropriate. Keep confirmation dialogs (`ConfirmDialog`) for destructive actions.

## Instrumentation & Query Management
- Lists must register with [`useListLoadingInstrumentation`](../../../../src/lib/test/query-instrumentation.ts) using a stable scope (e.g., `types.list`, `parts.list`). Provide metadata callbacks so Playwright can assert on query status and counts.
- Detail and form views should reuse `useFormInstrumentation` or other instrumentation helpers (`useClipboardPaste`, `useDuplicatePart`) instead of emitting bespoke events.
- Do not intercept network requests in tests. Instead, expose deterministic hooks like `data-testid`, instrumentation scopes, and state-specific metadata. Cross-reference [Testing → Playwright Developer Guide](../testing/playwright_developer_guide.md) and [Testing → Factories & Fixtures](../testing/factories_and_fixtures.md) before adding new UI telemetry.

## Referenced Patterns
- [Type Catalog Pattern](./patterns/type_catalog.md) applies these rules to a single-entity CRUD list + modal workflow.
- [Part Management Pattern](./patterns/part_management.md) demonstrates the richer combination of list, detail, AI dialog, and document management that future complex domains should inherit.

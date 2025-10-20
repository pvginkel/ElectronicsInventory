# Kit Detail & BOM Management Plan

### 0) Research Log & Findings
- Consulted kit detail epic requirements for editable metadata, computed availability columns, and filtering expectations (docs/epics/kits_feature_breakdown.md:55 — "Display editable name, description, and build target while kit is active; disable fields when archived.").
- Reviewed BOM maintenance mandates covering inline add/edit/delete with optimistic refresh (docs/epics/kits_feature_breakdown.md:70 — "Enable inline add/edit/delete rows with validation for integer quantities and duplicate part protection.").
- Inspected generated kit detail schema to understand available fields, computed aggregates, and badge counts (src/lib/api/generated/types.ts:2893 — "\"KitDetailResponseSchema.b98797e\": { archived_at, build_target, contents... }").
- Verified per-row detail payload includes availability math and optimistic locking version (src/lib/api/generated/types.ts:2977 — "KitContentDetailSchema" fields include required_per_unit, total_required, reserved, shortfall, version).
- Confirmed generated hooks for detail queries and content mutations to reuse (src/lib/api/generated/hooks.ts:838 — "return useQuery({ queryKey: ['getKitsByKitId', params], ... })").
- Noted DetailScreenLayout shell already used by other detail screens (src/components/layout/detail-screen-layout.tsx:31 — "export function DetailScreenLayout({ ... })").
- Studied PartDetails instrumentation pattern for list loading and nested queries (src/components/parts/part-details.tsx:145 — "useListLoadingInstrumentation({ scope: 'parts.detail', ... })").
- Checked existing kits overview instrumentation scope for consistent naming (src/components/kits/kit-overview-list.tsx:76 — "useListLoadingInstrumentation({ scope: 'kits.overview', ... })").
- Reviewed membership lookup hook to reuse summaries and instrumentation (src/hooks/use-kit-memberships.ts:64 — "const shoppingMemberships = useKitShoppingListMemberships(allKitIds);").
- Examined current Playwright coverage and deterministic waits to mirror for detail specs (tests/e2e/kits/kits-overview.spec.ts:6 — `waitForListLoading(page, 'kits.overview', 'ready')`).
- Audited kit factory helpers to extend with BOM seeding for tests (tests/api/factories/kit-factory.ts:26 — `async create(options?: KitCreateOptions)`).

### 1) Intent & Scope

**User intent**

Deliver the `/kits/$kitId` workspace so planners can edit active kit metadata, manage the bill of materials with live availability math, and see related shopping/pick list context without leaving the app.

**Prompt quotes**

"Expose a rich kit detail workspace where planners maintain the bill of materials"  
"Enable inline add/edit/delete rows with validation for integer quantities and duplicate part protection."

**In scope**

- Wire TanStack Router detail route and compose the screen with `DetailScreenLayout`, breadcrumbs, and instrumentation.
- Implement metadata editing (name, description, build target) gated by kit status, using generated PATCH hook plus form instrumentation.
- Build a filterable BOM grid that shows computed Required/Total/In stock/Reserved/Shortfall columns and supports inline add/edit/delete with optimistic refresh.
- Surface shopping list and pick list badges/chips alongside availability stats, reusing membership hooks and emitting deterministic test events.

**Out of scope**

- Shopping list creation/append workflows and unlinking chips (covered by separate epic sections).
- Pick list creation, execution, and undo mechanics beyond summarizing existing lists.
- Backend schema or API adjustments; plan assumes delivered endpoints and generated client stay as-is.
- Global search or cross-feature navigation beyond linking from overview cards and related chips.

**Assumptions / constraints**

APIs described in the epic are deployed and reflected in the generated client; archived kits remain server-enforced read-only; tests must stay backend-driven with the instrumentation taxonomy from docs/contribute/testing.

### 2) Affected Areas & File Map

- Area: src/routes/kits/$kitId.tsx (new)
- Why: Register the nested route and layout container for kit detail mirroring part detail routing.
- Evidence: src/routes/parts/$partId.tsx:3 — "export const Route = createFileRoute('/parts/$partId')({ ... })"

- Area: src/routes/kits/$kitId/index.tsx (new)
- Why: Load route params and render the kit detail screen component.
- Evidence: src/routes/parts/$partId/index.tsx:4 — "export const Route = createFileRoute('/parts/$partId/')({ component: PartDetailScreen })"

- Area: src/components/kits/kit-detail-screen.tsx (new)
- Why: Compose `DetailScreenLayout`, metadata form, BOM grid, filters, and related chips with instrumentation scopes.
- Evidence: src/components/layout/detail-screen-layout.tsx:31 — layout contract for detail screens.

- Area: src/components/kits/kit-card.tsx
- Why: Add detail navigation affordance (card title/link) so overview cards deep-link into `/kits/$kitId`.
- Evidence: src/components/kits/kit-card.tsx:9 — card currently renders title without linking to the detail route.

- Area: src/hooks/use-kit-detail.ts (new)
- Why: Wrap `useGetKitsByKitId` to map snake_case payloads into camelCase domain models and expose query state helpers.
- Evidence: src/lib/api/generated/hooks.ts:838 — generated detail query hook to adapt.

- Area: src/hooks/use-kit-content-mutations.ts (new)
- Why: Centralize create/update/delete mutations with optimistic cache updates and version handling for BOM rows.
- Evidence: src/lib/api/generated/hooks.ts:896 — content mutation hooks available for composition.

- Area: src/types/kits.ts
- Why: Extend kit types with detail view models, content row shape, and mapping helpers.
- Evidence: docs/contribute/architecture/application_overview.md:33 — custom hooks/types map generated payloads into camelCase domain models.

- Area: src/hooks/use-kit-memberships.ts
- Why: Expose single-kit helpers and loading metadata so detail screen can show shopping/pick summaries without duplicating logic.
- Evidence: src/hooks/use-kit-memberships.ts:64 — current multi-kit lookup to adapt for detail usage.

- Area: src/components/kits/kit-overview-list.tsx
- Why: Provide card prop/callback for deep-linking to detail and keep membership prefetch alignment with new screen.
- Evidence: src/components/kits/kit-overview-list.tsx:51 — overview injects cards and controls we will extend.

- Area: tests/support/page-objects/kits-page.ts
- Why: Add helpers for opening detail screens, interacting with metadata form, BOM grid, and instrumentation waits.
- Evidence: tests/support/page-objects/kits-page.ts:6 — existing overview locators to expand.

- Area: tests/api/factories/kit-factory.ts
- Why: Add helpers to seed kit contents via real `/kits/{id}/contents` endpoint for deterministic Playwright fixtures.
- Evidence: tests/api/factories/kit-factory.ts:26 — factory scaffolding for kit CRUD.

- Area: tests/e2e/kits/kits-detail.spec.ts (new)
- Why: Cover metadata edit, BOM add/edit/delete, and filtering scenarios against real backend using new instrumentation scopes.
- Evidence: docs/epics/kits_feature_breakdown.md:53 — mandates detail workspace behavior to verify end-to-end.

- Area: tests/e2e/kits/kits-overview.spec.ts
- Why: Add navigation smoke to assert overview cards and CTA reach the new detail route.
- Evidence: tests/e2e/kits/kits-overview.spec.ts:57 — existing navigation assertions to extend.

### 3) Data Model / Contracts

- Entity / contract: KitDetail
- Shape:
  ```json
  {
    "id": number,
    "name": string,
    "description": string | null,
    "status": "active" | "archived",
    "buildTarget": number,
    "archivedAt": string | null,
    "updatedAt": string,
    "shoppingListBadgeCount": number,
    "pickListBadgeCount": number,
    "shoppingListLinks": KitShoppingListLink[],
    "pickLists": KitPickListSummary[],
    "contents": KitContentRow[]
  }
  ```
- Mapping: `mapKitDetail(response: KitDetailResponseSchema)` converts snake_case payload into camelCase fields and maps nested arrays to domain helpers.
- Evidence: src/lib/api/generated/types.ts:2893 — detail response includes metadata, badge counts, and related arrays.

- Entity / contract: KitContentRow
- Shape:
  ```json
  {
    "id": number,
    "partId": number,
    "partKey": string,
    "partName": string,
    "requiredPerUnit": number,
    "totalRequired": number,
    "inStock": number,
    "reserved": number,
    "available": number,
    "shortfall": number,
    "note": string | null,
    "version": number,
    "activeReservations": ReservationEntry[]
  }
  ```
- Mapping: `mapKitContentRow(schema: KitContentDetailSchema)` pulls part summary metadata, converts numeric aggregates, and carries optimistic locking version for edit submissions.
- Evidence: src/lib/api/generated/types.ts:2977 — content schema lists availability fields, note, and version.

- Entity / contract: KitContentEditorDraft
- Shape:
  ```json
  {
    "mode": "create" | "edit",
    "contentId": number | null,
    "partKey": string | null,
    "partId": number | null,
    "requiredPerUnit": number,
    "note": string,
    "version": number | null
  }
  ```
- Mapping: Initialized from `KitContentRow` for edit mode (prefilling fields, version) or defaults for add; snapshot feeds `useFormInstrumentation` metadata.
- Evidence: docs/epics/kits_feature_breakdown.md:70 — inline add/edit/delete with validation and optimistic updates.

- Entity / contract: KitDetailQueryKey
- Shape: `['getKitsByKitId', { path: { kit_id: number } }]`
- Mapping: Derived from route param to drive cache updates and align with generated hook key.
- Evidence: src/lib/api/generated/hooks.ts:841 — query key used by `useGetKitsByKitId`.

### 4) API / Integration Surface

- Surface: GET /api/kits/{kit_id} / useGetKitsByKitId
- Inputs: `path: { kit_id: number }`
- Outputs: `KitDetailResponseSchema` mapped to `KitDetail`; fetch status drives loading/ready instrumentation and membership fetch triggers.
- Errors: 404 -> redirect to `/kits` with toast; generic errors show exception toast and emit list_loading error metadata.
- Evidence: src/lib/api/generated/hooks.ts:838 — detail query definition.

- Surface: PATCH /api/kits/{kit_id} / usePatchKitsByKitId
- Inputs: payload with optional `name`, `description`, `build_target` (active kits only), triggered from metadata form.
- Outputs: `KitResponseSchema`; update detail cache and kits overview entry with new metadata.
- Errors: 400 validation -> surface inline errors + toast; 409 conflict (archived) -> revert form, show warning.
- Evidence: docs/epics/kits_feature_breakdown.md:38 — backend guards archived edits; src/lib/api/generated/hooks.ts:854 — mutation hook.

- Surface: POST /api/kits/{kit_id}/contents / usePostKitsContentsByKitId
- Inputs: `{ part_id, required_per_unit, note? }` from create draft; requires active kit state.
- Outputs: `KitContentDetailSchema`; append to detail cache and recompute filters.
- Errors: 400/409 for invalid quantity or duplicate part -> inline validation + toast instrumentation.
- Evidence: src/lib/api/generated/hooks.ts:896 — create mutation; docs/epics/kits_feature_breakdown.md:76 — API contract.

- Surface: PATCH /api/kits/{kit_id}/contents/{content_id} / usePatchKitsContentsByKitIdAndContentId
- Inputs: `{ required_per_unit?, note?, version }` from edit draft.
- Outputs: Updated `KitContentDetailSchema`; replace row in cache using optimistic version.
- Errors: 409 version conflict -> show toast, refetch row, surface conflict inline per open question.
- Evidence: src/lib/api/generated/hooks.ts:938 — update mutation; docs/epics/kits_feature_breakdown.md:81 — conflict expectation.

- Surface: DELETE /api/kits/{kit_id}/contents/{content_id} / useDeleteKitsContentsByKitIdAndContentId
- Inputs: `{ path: { kit_id, content_id } }` triggered from row action.
- Outputs: 204; remove row from cache and invalidate aggregated metrics.
- Errors: 400 if kit archived; show toast and restore row state.
- Evidence: src/lib/api/generated/hooks.ts:917 — delete mutation.

- Surface: POST /api/kits/shopping-list-memberships/query & POST /api/kits/pick-list-memberships/query
- Inputs: `kit_ids: [kitId], include_done: false` from detail to reuse membership chips.
- Outputs: Membership summaries fueling header badges.
- Errors: Network failure -> emit list_loading error for membership scope and show fallback message.
- Evidence: src/hooks/use-kit-memberships.ts:61 — membership fetch payload.

### 5) Algorithms & UI Flows (step-by-step)

- Flow: Load kit detail screen
- Steps:
  1. Resolve `kitId` from router params and call `useKitDetail(kitId)`.
  2. Kick off membership queries when detail data resolves to hydrate chips.
  3. Render `DetailScreenLayout` with breadcrumbs (`Kits` → current name), actions, and BOM section once query ready.
  4. Initialize filter state and derived view of `contents` array.
- States / transitions: React Query statuses (`isLoading`, `isFetching`, `isError`) drive skeleton, ready content, and retry UI; filter state updates trigger derived list update.
- Hotspots: Avoid re-render storms by memoizing derived collections; guard membership fetch until kitId is numeric.
- Evidence: src/lib/api/generated/hooks.ts:841 — query key usage; src/components/parts/part-details.tsx:145 — list instrumentation pattern to follow.

- Flow: Update kit metadata
- Steps:
  1. Populate form with detail data; disable fields if status is `archived`.
  2. On submit, call `trackFormSubmit` via `useFormInstrumentation`, fire `usePatchKitsByKitId` mutation.
  3. On success, update detail cache & kits overview entry, emit success toast, and track form success.
  4. On error, display validation inline, emit toast, and track form error.
- States / transitions: Form state toggles between pristine, submitting, success; query cache invalidation ensures overview reflects updated data.
- Hotspots: Ensure build target change recomputes derived totals client-side until refetch completes to avoid stale UI.
- Evidence: docs/epics/kits_feature_breakdown.md:55 — editable metadata; src/hooks/use-form-instrumentation.ts:26 — submit/success/error helpers; src/lib/api/generated/hooks.ts:854 — mutation.

- Flow: Add kit content row
- Steps:
  1. Open inline row editor with PartSelector; track form open event.
  2. Validate required per unit (>0) client-side; on submit call `usePostKitsContentsByKitId` with part ID and quantity.
  3. Optimistically append draft row (pending state) to grid; on success replace with server payload and recompute availability totals.
  4. On failure, roll back optimistic entry and surface toast with validation errors.
- States / transitions: Draft state toggles between `idle`, `submitting`, `success`; optimistic row flagged until mutation resolves.
- Hotspots: Deduplicate part selection before submit to prevent duplicate API errors; ensure filter term applies to newly added row immediately.
- Evidence: docs/epics/kits_feature_breakdown.md:70 — inline add; src/lib/api/generated/hooks.ts:896 — create mutation; src/components/parts/part-selector.tsx:39 — selection helper pattern.

- Flow: Edit or delete kit content row
- Steps:
  1. Launch editor with existing row values, including version; track form open event.
  2. For edits, submit PATCH with new quantity/note + version; update row in cache or show conflict message on 409.
  3. For deletes, confirm action, optimistically remove row, and call DELETE endpoint.
  4. After mutation settle, invalidate detail query if totals changed or recalc derived totals manually.
- States / transitions: Row-level state toggles between `normal`, `optimistic`, `reverting`; conflict triggers `needsRefresh` state requesting refetch.
- Hotspots: Ensure deleting the last row keeps empty state UX clean; throttle repeated delete clicks while mutation pending.
- Evidence: docs/epics/kits_feature_breakdown.md:72 — optimistic refresh; src/lib/api/generated/hooks.ts:938 — update mutation; src/lib/api/generated/hooks.ts:917 — delete mutation.

- Flow: Apply client-side BOM filter
- Steps:
  1. Update local search term on input; debounce to avoid churn.
  2. Filter `KitContentRow` array by part key, part name, or note tokens.
  3. Update `ListLoading` ready metadata with `filteredCount` for instrumentation.
- States / transitions: Filter text state, derived list state.
- Hotspots: Keep debounce consistent with overview search (300ms) and ensure highlight/resume after mutation.
- Evidence: docs/epics/kits_feature_breakdown.md:57 — filtering across part name, SKU, and note; src/components/kits/kit-overview-list.tsx:37 — existing debounce pattern.

### 6) Derived State & Invariants

- Derived: metadataEditable
  - Computation: `kit.status === 'active'` enables form controls, else disables inputs and submit.
  - Contract: Aligns with backend guard preventing archived edits.
  - Evidence: docs/epics/kits_feature_breakdown.md:55 — fields editable only when active.

- Derived: filteredContents
  - Computation: Apply lowercase contains match on part key, part display name, and note for current search term.
  - Contract: UI must reflect zero-state when filter removes all rows without mutating source array.
  - Evidence: docs/epics/kits_feature_breakdown.md:57 — client-side filtering across name, SKU, note.

- Derived: availabilityStatus
  - Computation: For each row, compute `hasShortfall = shortfall > 0`, `isAvailable = available >= totalRequired` to drive badge coloring.
  - Contract: Derived flags should update after optimistic mutations using server values to avoid stale numbers.
  - Evidence: src/lib/api/generated/types.ts:2977 — `total_required`, `available`, `shortfall` fields supplied.

- Derived: optimisticRowMap
  - Computation: Track pending row IDs or synthetic temp IDs while mutations in flight to block duplicate submissions.
  - Contract: Map cleared on success/failure to keep controls re-enabled.
  - Evidence: docs/epics/kits_feature_breakdown.md:72 — optimistic updates should reflect in grid immediately.

### 7) State Consistency & Async Coordination

Detail screen will layer React Query caches with local optimistic state. `useKitDetail` wraps `useGetKitsByKitId` and exposes helpers to update cached detail rows; after metadata or content mutations succeed we will update the detail query via `queryClient.setQueryData` and invalidate the broader `['getKits']` overview cache to keep cards in sync (pattern mirrors `KitArchiveControls`, which cancels queries and writes optimistic data before invalidation at src/components/kits/kit-archive-controls.tsx:54). Optimistic BOM changes maintain a local draft map keyed by row ID; mutation handlers reconcile server payloads, clearing optimistic flags and re-sorting rows. Membership hooks remain independent queries; we defer their fetch until kit detail is ready to avoid duplicate requests on initial load. All promises guard component unmount by tracking `isMountedRef` similar to archive controls, preventing state updates on torn-down components.

### 8) Errors & Edge Cases

- 404 / missing kit: redirect to `/kits` with error toast and emit `list_loading` error metadata so tests validate the redirect path (docs/epics/kits_feature_breakdown.md:65 — `RecordNotFoundException` on missing kit).
- Archive status flip mid-session: PATCH or content mutations returning 409 should flip UI to read-only, refetch detail, and narrate conflict to the user.
- Duplicate part add attempt: backend 409 surfaces, highlight part selector error state, keep dialog open for correction (docs/epics/kits_feature_breakdown.md:79 — uniqueness enforcement).
- Negative or zero quantity entry: client validation blocks submission; backend 400 fallback shows toast if bypassed (docs/epics/kits_feature_breakdown.md:74 — positive quantities required).
- Infinite spinner risk if memberships fail: show inline fallback message while still emitting error instrumentation so tests can assert readiness.

### 9) Observability / Instrumentation

- Emit `useListLoadingInstrumentation` events for `scope: 'kits.detail'` (detail query) and `scope: 'kits.detail.contents'` (BOM mutations/refetches) following existing helper semantics (src/lib/test/query-instrumentation.ts:146).
- Wrap metadata form and BOM editor with `useFormInstrumentation` so `form` events fire for open/submit/success/error using IDs like `KitDetail:metadata`, `KitDetail:content.create`, and `KitDetail:content.edit` (src/hooks/use-form-instrumentation.ts:26).
- Toasts for success/error automatically produce `toast` events; include action IDs when offering retry or conflict resolution (src/components/kits/kit-archive-controls.tsx:131 — existing pattern with undo action).
- Update ready metadata to include counts (`visible`, `filtered`, `shortfallCount`) so Playwright can assert deterministic state.
- Add `data-testid` anchors for header (`kits.detail.header`), filters, rows (`kits.detail.row.<id>`), and form inputs to keep selectors stable per testing guidance (docs/contribute/testing/index.md:5 — instrumentation coupling requirement).

### 10) Lifecycle & Background Work

- Use `useEffect` to sync PartSelector summaries and form drafts with currently edited row, mirroring pattern in part selector (src/components/parts/part-selector.tsx:39).
- Debounce filter input with `useDebouncedValue`, cleaning up timers on unmount (src/components/kits/kit-overview-list.tsx:37).
- No background polling; rely on React Query revalidation on focus. When kit status changes (archived), disable mutations immediately and allow background refetch to refresh state.
- Clean up optimistic draft refs on unmount to prevent memory leaks.

### 11) Security & Permissions (if applicable)

- Concern: Archived kits must remain read-only.
- Touchpoints: Metadata form disables inputs; BOM add/edit/delete actions hidden when `status === 'archived'`.
- Mitigation: gate UI interactions and rely on backend guard for enforcement per epic.
- Residual risk: None—the server rejects illegal edits even if UI fails to disable.
- Evidence: docs/epics/kits_feature_breakdown.md:38 — service disallows edits when archived.

### 12) UX / UI Impact (if applicable)

- Entry point: `/kits/$kitId` routed from overview cards and related chips.
- Change: Introduces detail workspace with sticky header, metadata editor, availability badges, filter bar, and responsive BOM grid.
- User interaction: Active kits allow inline editing; archived kits show disabled inputs and explanatory messaging; filtering updates rows instantly.
- Dependencies: Requires Tailwind layout via `DetailScreenLayout` and existing PartSelector for BOM entries.
- Evidence: docs/epics/kits_feature_breakdown.md:53 — describes detail workspace goals.

### 13) Deterministic Test Plan (new/changed behavior only)

- Surface: Kit detail metadata editing
  - Scenarios:
    - Given an active kit, When the user edits name/build target and submits, Then form events emit submit/success and detail header reflects new values.
    - Given an archived kit, When navigating to detail, Then inputs are disabled and submit button is absent.
  - Instrumentation / hooks: `waitForListLoading(page, 'kits.detail', 'ready')`, `waitTestEvent<FormTestEvent>(..., evt => evt.formId === 'KitDetail:metadata')`, toast helper for success message.
  - Gaps: None.
  - Evidence: docs/contribute/testing/index.md:5 — instrumentation-test coupling.

- Surface: BOM add/edit/delete lifecycle
  - Scenarios:
    - Given an active kit with seeded contents, When adding a new part via selector, Then row appears with computed totals and `list_loading` ready metadata includes updated counts.
    - Given an existing row, When updating required quantity, Then shortfall recomputes and version increments; When deleting, Then row disappears and totals update.
  - Instrumentation / hooks: `waitForListLoading(page, 'kits.detail.contents', 'ready')`, form events for `KitDetail:content.*`, toast assertions for errors.
  - Gaps: None.
  - Evidence: docs/epics/kits_feature_breakdown.md:70 — inline BOM maintenance requirements.

- Surface: Client-side filtering & related chips
  - Scenarios:
    - Given multiple rows with distinct part names, When filtering by SKU substring, Then only matching rows remain and empty state appears when none match.
    - Given shopping/pick list memberships, When detail loads, Then chips render with tooltip data and membership instrumentation transitions to ready.
  - Instrumentation / hooks: `waitForListLoading(page, 'kits.detail.contents', 'ready')`, membership helpers `waitForListLoading(page, 'kits.list.memberships.<scope>', 'ready')`.
  - Gaps: None.
  - Evidence: src/hooks/use-kit-memberships.ts:12 — membership instrumentation baseline.

### 14) Implementation Slices (only if large)

- Slice: Routing & data scaffolding
  - Goal: Expose `/kits/$kitId` route, build `useKitDetail`, and extend types to map detail payloads.
  - Touches: `src/routes/kits/$kitId.tsx`, `src/routes/kits/$kitId/index.tsx`, `src/hooks/use-kit-detail.ts`, `src/types/kits.ts`.
  - Dependencies: None (foundation).

- Slice: Screen layout & metadata form
  - Goal: Render `DetailScreenLayout`, header badges, metadata editor with instrumentation and toasts.
  - Touches: `src/components/kits/kit-detail-screen.tsx`, `src/components/kits/kit-card.tsx`, `src/hooks/use-kit-memberships.ts`.
  - Dependencies: Routing & data scaffolding.

- Slice: BOM grid & mutations
  - Goal: Implement filter bar, table rendering, add/edit/delete flows with optimistic updates and list loading instrumentation.
  - Touches: `src/components/kits/kit-detail-screen.tsx`, `src/hooks/use-kit-content-mutations.ts`, `src/components/kits/kit-overview-list.tsx` (for navigation), `src/types/kits.ts` (row helpers).
  - Dependencies: Prior slices.

- Slice: Playwright coverage & factories
  - Goal: Extend kit factory to seed contents, update page object, and author deterministic detail spec.
  - Touches: `tests/api/factories/kit-factory.ts`, `tests/support/page-objects/kits-page.ts`, `tests/e2e/kits/kits-overview.spec.ts`, `tests/e2e/kits/kits-detail.spec.ts`.
  - Dependencies: Screen and BOM slices.

### 15) Risks & Open Questions

- Risk: Detail cache and overview cache diverge after rapid edits if optimistic updates miss edge cases.
  - Impact: Users may see stale build target or row counts on overview.
  - Mitigation: Update detail cache and invalidate overview queries in every mutation handler.

- Risk: Large kits with many rows could trigger slow filter operations and React renders.
  - Impact: Noticeable input lag.
  - Mitigation: Memoize filtered array, debounce input, and consider virtualized list if profiling shows regressions.

- Risk: 409 conflicts on row edits may frustrate users if surfaced poorly.
  - Impact: Confusing error loops when another user updates BOM concurrently.
  - Mitigation: Provide toast with retry CTA, refetch row, and highlight new values before allowing re-submit.

- Open question: How should optimistic locking conflicts for kit contents be surfaced (toast vs inline) and should the API return the latest row on conflict? (docs/epics/kits_feature_breakdown.md:219)
  - Why it matters: Determines UX when PATCH returns 409; influences whether we can auto-merge updates.
  - Owner / follow-up: Confirm with product/backend before wiring conflict resolution messaging.

- Open question: Do we need to expose reserved breakdown (active_reservations list) in the UI, or can it remain hidden until reservation feature ships?
  - Why it matters: Impacts whether we render expandable detail rows and associated selectors.
  - Owner / follow-up: Align with inventory planners on expected visibility.

### 16) Confidence (one line)

Confidence: Medium — flows mirror existing detail patterns, but optimistic BOM handling plus conflict UX introduce moderate complexity that needs coordination.

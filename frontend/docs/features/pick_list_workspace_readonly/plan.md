### 0) Research Log & Findings
- Reviewed feature requirements in `docs/epics/kits_feature_breakdown.md:252-263` outlining the read-only workspace scope, navigation, and instrumentation expectations.
- Noted the current placeholder route in `src/routes/pick-lists/$pickListId.tsx:1-13` that renders a static div without data fetching or instrumentation.
- Confirmed detail layout conventions via `src/components/layout/detail-screen-layout.tsx:31-146`, which the new workspace should reuse for consistent shell structure.
- Verified kit navigation chips leverage `PickListLinkChip` and still cast the route path at `src/components/kits/pick-list-link-chip.tsx:33-58`, so context passing must be revisited.
- Confirmed there is no dedicated kit link chip yet; `src/components/shopping-lists/shopping-list-link-chip.tsx:1-64` offers a reusable pattern to adapt into a shared `KitLinkChip` for this and other screens.
- Confirmed the pick list detail payload includes `kit_id`/`kit_name`, so the header can always derive context directly from the response.
- Reviewed part-location inventory endpoints via `src/lib/api/generated/hooks.ts:1541-1605` (`useGetPartsLocationsByPartKey`) and `src/lib/api/generated/types.ts:6184-6266` to plan live in-stock calculations for each line.
- Inspected the reusable part summary component in `src/components/parts/part-inline-summary.tsx:14-52` for rendering kit content lines without duplicating markup.
- Validated generated hooks for pick list summaries/detail in `src/lib/api/generated/hooks.ts:959-1633`, including `useGetPickListsByPickListId`.
- Checked the OpenAPI schema for pick list detail and line payloads in `src/lib/api/generated/types.ts:3376-3534` to understand available fields.
- Reviewed instrumentation helpers `src/lib/test/query-instrumentation.ts:146-235` and `src/lib/test/ui-state.ts:25-84` to align list-loading and UI-state test events.
- Looked at existing kit detail Playwright helpers in `tests/support/page-objects/kits-page.ts:55-134` to plan navigation assertions and selectors.
- Revisited architecture and testing guidance in `docs/contribute/architecture/application_overview.md:5-28` and `docs/contribute/testing/playwright_developer_guide.md:5-19` for stack usage and deterministic test expectations.

### 1) Intent & Scope

**User intent**

Deliver a routed, read-only pick list workspace that lets operators review allocator output and context before executing any picks, accessible from kit detail chips and direct URLs.

**Prompt quotes**

"Add TanStack Router route `/pick-lists/$pickListId` that loads pick list detail via `GET /pick-lists/<int:pick_list_id>` and renders header metadata (`requested_units`, `status`, timestamps)."  
"Display immutable lines grouped by kit content, showing part summary, location, the current in-stock quantity, and `quantity_to_pick`, flagging shortfalls when needed." (`docs/epics/kits_feature_breakdown.md:255-260`)

**In scope**

- Replace the placeholder route with a data-driven screen using `useGetPickListsByPickListId` and mapped domain types.
- Render header metadata, grouped line items, live location availability, breadcrumbs with a non-clickable `Pick Lists` label (kit crumb optional), and deterministic instrumentation (`pickLists.detail` / `pickLists.detail.load`).
- Update kit link chips/navigation so users arrive with preserved kit search context and tests have stable selectors.

**Out of scope**

- Mutation flows (pick, undo, completion) described in "Pick list execution & status transitions".
- Backend schema or service changes beyond consuming existing responses.
- Shopping list or kit editing affordances; the workspace remains read-only.

**Assumptions / constraints**

Pick list detail responses do not include inventory snapshots; the UI must call `useGetPartsLocationsByPartKey` for each unique part to compute current in-stock quantities. Given the hobbyist single-user target, the additional requests are acceptable, but we should batch by unique part key per detail load. Breadcrumbs rely on kit detail search parameters, so `PickListLinkChip` must pass status/search context while supporting deep links with no prior kit navigation; until a Pick Lists index exists, the root crumb remains a label rather than a link.

### 2) Affected Areas & File Map

- Area: `src/routes/pick-lists/$pickListId.tsx`  
  Why: Replace the placeholder with a typed TanStack Router route that loads data, validates search params, and emits instrumentation.  
  Evidence: `src/routes/pick-lists/$pickListId.tsx:1-13` — current implementation renders a static placeholder div.

- Area: `src/hooks/use-pick-list-detail.ts` *(new)*  
  Why: Encapsulate fetching `GET /pick-lists/{pick_list_id}`, map snake_case payloads to camelCase domain objects, and expose instrumentation metadata helpers.  
  Evidence: `src/lib/api/generated/hooks.ts:1599-1633` — generated detail hook returning raw API schema.

- Area: `src/types/pick-lists.ts` *(new)*  
  Why: Define `PickListDetail`, `PickListLine`, and helpers to translate API shapes for UI components.  
  Evidence: `src/lib/api/generated/types.ts:3376-3534` — schema lists available fields for detail and line objects.

- Area: `src/components/pick-lists/pick-list-detail.tsx` *(new)*  
  Why: Compose the detail screen shell, orchestrate loading/error states, and render header + content sections.  
  Evidence: `src/components/layout/detail-screen-layout.tsx:65-136` — shared layout component for detail workspaces.

- Area: `src/components/pick-lists/pick-list-lines.tsx` *(new)*  
  Why: Render grouped line items with part summaries, locations, live in-stock quantities, and `quantity_to_pick` metadata per requirements.  
  Evidence: `docs/epics/kits_feature_breakdown.md:257-260` — mandates grouped, read-only line display.

- Area: `src/components/kits/kit-link-chip.tsx` *(new)*  
  Why: Introduce a reusable `KitLinkChip` (patterned after `ShoppingListLinkChip`) for linking to kits from pick lists and other surfaces.  
  Evidence: `src/components/shopping-lists/shopping-list-link-chip.tsx:1-64` — existing chip implementation to mirror.

- Area: `src/components/kits/pick-list-link-chip.tsx`  
  Why: Stop casting the route, pass kit context (status/search) through navigation, and ensure tooltips remain accurate.  
  Evidence: `src/components/kits/pick-list-link-chip.tsx:33-58` — current link casts the route type and omits context.

- Area: `src/components/kits/kit-detail-header.tsx`  
  Why: Supply kit identifiers/status/search to `PickListLinkChip` and expose context for optional kit linking in the pick list workspace.  
  Evidence: `src/components/kits/kit-detail-header.tsx:197-227` — renders pick list chips without contextual parameters today.

- Area: `tests/api/factories/kit-factory.ts`  
  Why: Add helpers that create pick lists (and seed lines) via backend APIs for deterministic Playwright setup.  
  Evidence: `tests/e2e/kits/kit-detail.spec.ts:528-604` — tests currently call `POST /api/kits/{kit_id}/pick-lists` inline.

- Area: `tests/support/page-objects/kits-page.ts`  
  Why: Expose a helper to click pick list chips while preserving route search state and verifying navigation.  
  Evidence: `tests/support/page-objects/kits-page.ts:55-134` — existing selectors for pick list chips.

- Area: `tests/support/page-objects/pick-lists-page.ts` *(new)*  
  Why: Provide locators/actions for the new workspace (header counters, line groups, instrumentation waits).  
  Evidence: `tests/support/page-objects/base-page.ts:1-120` — base class pattern for feature-specific page objects.

- Area: `tests/support/fixtures.ts`  
  Why: Register the new `PickListsPage` in shared fixtures so specs can consume it alongside existing pages.  
  Evidence: `tests/support/fixtures.ts:9-84` — enumerates exported page objects.

- Area: `tests/e2e/pick-lists/pick-list-detail.spec.ts` *(new)*  
  Why: Add deterministic coverage for the read-only workspace, including instrumentation waits and breadcrumb navigation.  
  Evidence: `docs/epics/kits_feature_breakdown.md:252-263`, `tests/support/helpers.ts:63-75` — feature requirements and instrumentation helpers.

### 3) Data Model / Contracts

- Entity / contract: `PickListDetail`  
  Shape: `{ id: number; kitId: number; kitName: string; status: 'open' | 'completed'; requestedUnits: number; lineCount: number; openLineCount: number; completedLineCount: number; totalQuantityToPick: number; pickedQuantity: number; remainingQuantity: number; createdAt: string; updatedAt: string; completedAt: string | null; lines: PickListLine[] }`  
  Mapping: Adapt from `KitPickListDetailSchema.b247181` (snake_case) to camelCase via new mapper in `src/types/pick-lists.ts`.  
  Evidence: `src/lib/api/generated/types.ts:3376-3446`.

- Entity / contract: `PickListLine`  
  Shape: `{ id: number; kitContentId: number; part: { id: number; key: string; description: string | null }; location: { id: number; boxNo: number; locNo: number }; quantityToPick: number; inventoryChangeId: number | null; pickedAt: string | null; status: 'open' | 'completed' }`  
  Mapping: Map fields from `KitPickListDetailSchema.b247181.KitPickListLineSchema`, `PickListLineContentSchema`, and `PickListLineLocationSchema`.  
  Evidence: `src/lib/api/generated/types.ts:3475-3534`.

- Entity / contract: `PickListLineAvailability` *(derived)*  
  Shape: `{ lineId: number; inStock: number | null; shortfall: number | null }`  
  Mapping: Join each line’s location with the response from `useGetPartsLocationsByPartKey`, selecting the matching `box_no`/`loc_no` quantity; compute `shortfall = max(quantityToPick - inStock, 0)` when `status === 'open'`.  
  Evidence: `src/lib/api/generated/hooks.ts:1541-1605`, `src/lib/api/generated/types.ts:6184-6266`.

- Entity / contract: `PickListRouteSearch`  
  Shape: `{ kitId?: number; status?: 'active' | 'archived'; search?: string }`  
  Mapping: Populate from kit detail search params when navigating, default to `undefined` for direct deep links.  
  Evidence: `src/routes/kits/$kitId/index.tsx:10-30` — existing kit detail search validation.

### 4) API / Integration Surface

- Surface: `GET /api/pick-lists/{pick_list_id}` (`useGetPickListsByPickListId`)  
  Inputs: `{ path: { pick_list_id: number } }` derived from route params.  
  Outputs: `KitPickListDetailSchema.b247181` mapped to `PickListDetail`; used to populate header counters and line groups.  
  Errors: Propagate 404/403 into error state, 5xx into toast/log; instrumentation emits `pickLists.detail` error phase.  
  Evidence: `src/lib/api/generated/hooks.ts:1599-1613`.

- Surface: `GET /api/parts/{part_key}/locations` (`useGetPartsLocationsByPartKey`)  
  Inputs: `{ path: { part_key: string } }` issued per unique part across the pick list.  
  Outputs: `PartLocationResponseSchemaList_a9993e3` containing `{ box_no, loc_no, qty }` entries used to populate live in-stock values.  
  Errors: Treat missing part/location data as `null` in-stock; log but do not block rendering.  
  Evidence: `src/lib/api/generated/hooks.ts:1541-1605`, `src/lib/api/generated/types.ts:6184-6266`.

- Surface: `GET /api/kits/{kit_id}/pick-lists` (`useGetKitsPickListsByKitId`)  
  Inputs: `{ path: { kit_id: number } }` triggered when returning to kit detail or prefetching summaries.  
  Outputs: `KitPickListSummarySchemaList_a9993e3` to keep kit header chips accurate.  
  Errors: Standard React Query error path; reuse existing instrumentation scopes.  
  Evidence: `src/lib/api/generated/hooks.ts:959-988`.

### 5) Algorithms & UI Flows

- Flow: Pick list detail load  
  - Steps:  
    1. Validate route params/search, derive `pickListId` and optional kit context.  
    2. Invoke `usePickListDetail(pickListId)`; handle invalid IDs by short-circuiting to "not found".  
    3. Emit `useListLoadingInstrumentation` (`pickLists.detail`) and `useUiStateInstrumentation` (`pickLists.detail.load`) based on query status.  
    4. Once detail data resolves, derive the unique set of part keys and trigger `useGetPartsLocationsByPartKey` queries (batched via `useQueries`) to hydrate live in-stock counts per part/location.  
    5. Render skeleton/error/loaded states inside `DetailScreenLayout` while inventory queries resolve; show optimistic placeholders for availability until data arrives.  
    6. Populate header slots (always including `KitLinkChip` fed by `detail.kitId`/`detail.kitName`), line groups, and breadcrumbs (root label + optional kit crumb) once both the detail and inventory data complete.  
  - States / transitions: Query `status` (`pending` → `success`/`error`), secondary inventory queries with independent loading/error phases, UI state phases `loading` → `ready`/`error`, navigation search preserved on remount.  
  - Hotspots: Guard against duplicate inventory fetches when multiple lines share a part; ensure instrumentation cleans up on unmount and inventory queries cancel on param change.  
  - Evidence: `src/routes/pick-lists/$pickListId.tsx:1-13`, `src/hooks/use-kit-detail.ts:21-117`, `src/lib/test/query-instrumentation.ts:146-235`.

- Flow: Group and render line allocations  
  - Steps:  
    1. From mapped detail, group lines by `kitContentId`.  
    2. For each group, compute subtotals (open vs completed counts, total quantity).  
    3. Render group headers with part summary (`PartInlineSummary`) and metadata badges.  
    4. List individual lines with location label, quantity to pick, live in-stock badge (or loading skeleton), and status tag; emit a warning alert when an open line’s `quantityToPick` exceeds the current in-stock quantity.  
    5. Collapse/expand groups if quantity large (initially expanded per requirements).  
  - States / transitions: Derived arrays recomputed on data change; no local state beyond optional UI toggles.  
  - Hotspots: Avoid recomputing grouping on every render; memoize by detail identity and share inventory lookups across lines that reference the same part key.  
  - Evidence: `docs/epics/kits_feature_breakdown.md:257-260`, `src/components/parts/part-inline-summary.tsx:14-52`, `src/lib/utils/locations.ts:13-29`, `src/lib/api/generated/hooks.ts:1541-1605`.

- Flow: Breadcrumb & back-navigation context  
  - Steps:  
    1. When rendering header, read `kitId`, `status`, `search` from search params or detail payload.  
    2. Build breadcrumbs with a non-clickable `Pick Lists` label and append a kit-specific crumb derived from `detail.kitId` when available.  
    3. Render `KitLinkChip` pointing to `/kits/$kitId` with preserved `status`/`search` query for quick return navigation using response data rather than navigation state.  
    4. Optionally prefetch `buildKitDetailQueryKey(kitId)` to make return navigation instant.  
  - States / transitions: Breadcrumb recalculates whenever detail or search changes; kit crumb hides only if the response omits `kitId` (future-proofing).  
  - Hotspots: Ensure deep links still render the Pick Lists breadcrumb even if the kit crumb is suppressed for edge cases; avoid broken navigation when kit archived.  
  - Evidence: `docs/epics/kits_feature_breakdown.md:256-258`, `src/components/kits/kit-detail-header.tsx:153-204`, `src/hooks/use-kit-detail.ts:19-36`.

### 6) Derived State & Invariants

- Derived value: `isCompleted`  
  - Source: `detail.status === 'completed'`.  
  - Writes / cleanup: Controls status badge styling and hides any execution affordances.  
  - Guards: Require `detail.completedAt` truthy when `status === 'completed'`.  
  - Invariant: Completed lists must have `openLineCount === 0`.  
  - Evidence: `src/lib/api/generated/types.ts:3376-3438`.

- Derived value: `lineGroups`  
  - Source: `detail.lines` grouped by `kitContentId`, memoized with `useMemo`.  
  - Writes / cleanup: Drives render order and summary chips per group.  
  - Guards: Stable key based on `kitContentId`; fallback to `[]` if no lines.  
  - Invariant: Sum of group `lineCount` equals `detail.lineCount`.  
  - Evidence: `src/lib/api/generated/types.ts:3475-3534`.

- Derived value: `kitLinkChipProps`  
  - Source: `detail.kitId`, `detail.kitName`, and validated search params (`status`, `search`).  
  - Writes / cleanup: Supplies props to `KitLinkChip` and breadcrumb links; recomputed whenever the response or search params change.  
  - Guards: Provide fallback status/search defaults; hide chip only if `kitId` is missing from the response.  
  - Invariant: Chip navigation always points to an existing kit route when rendered.  
  - Evidence: `src/lib/api/generated/types.ts:3376-3438`, `src/components/shopping-lists/shopping-list-link-chip.tsx:1-64`.

- Derived value: `locationLabel`  
  - Source: `line.location.boxNo`, `line.location.locNo`; formatted via `formatLocation`.  
  - Writes / cleanup: Displayed in line rows; reused for `data-testid`.  
  - Guards: Ensure numeric fallback (e.g., show `—` if location missing).  
  - Invariant: Quantity to pick must be > 0 per schema.  
  - Evidence: `src/lib/utils/locations.ts:13-29`, `src/lib/api/generated/types.ts:3475-3534`.

- Derived value: `lineAvailability`  
  - Source: Merged data from `useGetPartsLocationsByPartKey` responses keyed by `part.key` and `line.location.boxNo/locNo`.  
  - Writes / cleanup: Provides `inStock` numbers and computed `shortfall` to the UI and instrumentation payloads.  
  - Guards: Treat missing inventory entries as `null` to avoid misleading zero values; re-run when either the part locations query or line status changes.  
  - Invariant: Shortfall alerts only display while `status === 'open'` and `inStock !== null`.  
  - Evidence: `src/lib/api/generated/hooks.ts:1541-1605`, `docs/epics/kits_feature_breakdown.md:255-260`.

### 7) State Consistency & Async Coordination

- Source of truth: React Query cache keyed by `['getPickListsByPickListId', { path: { pick_list_id } }]` drives detail state; no local duplication.  
- Query syncing: When kit context present, prefetch `buildKitDetailQueryKey(kitId)` to keep kit summaries warm; invalidate on navigation back if needed.  
- Instrumentation: `useListLoadingInstrumentation` and `useUiStateInstrumentation` track query lifecycle; ensure cleanup on unmount to emit `aborted` when needed.  
- Navigation context: `PickListLinkChip` injects search parameters for kit detail chips, while `KitLinkChip` in the detail header uses `detail.kitId`/`kitName` plus search params to preserve status when linking back; if `kitId` were absent the chip hides and breadcrumbs fall back to `Pick Lists → Detail`.  
- Evidence: `src/hooks/use-kit-detail.ts:19-117`, `src/lib/test/query-instrumentation.ts:146-235`, `src/lib/test/ui-state.ts:25-84`.

### 8) Errors & Edge Cases

- Failure: Invalid or non-numeric `pickListId` in route.  
  Surface: Route loader.  
  Handling: Short-circuit to not-found state with 404 messaging.  
  Guardrails: Validate param using `Number.isFinite`; do not call API when invalid.  
  Evidence: `src/routes/pick-lists/$pickListId.tsx:1-13` (placeholder), `src/routes/kits/$kitId/index.tsx:10-30` (search validation pattern).

- Failure: Backend returns 404/403 for pick list.  
  Surface: Detail screen content.  
  Handling: Render error card with retry/back-to-kits CTA; emit `pickLists.detail` error event.  
  Guardrails: Distinguish client vs server errors to aid debugging.  
  Evidence: `src/lib/api/generated/hooks.ts:1599-1613`, `docs/contribute/testing/playwright_developer_guide.md:5-19`.

- Failure: Pick list has zero lines or the inventory lookup omits a line’s location.  
  Surface: Line group renderer.  
  Handling: Show empty state messaging when no lines exist; render `Availability unknown` badge (without shortfall checks) when inventory data is missing.  
  Guardrails: Default grouped arrays to empty; treat missing inventory as `null` rather than `0` to avoid false alerts.  
  Evidence: `docs/epics/kits_feature_breakdown.md:257-260`, `src/lib/api/generated/hooks.ts:1541-1605`.

### 9) Observability / Instrumentation

- Signal: `pickLists.detail`  
  Type: `list_loading`.  
  Trigger: Query enters loading and resolves (ready/error/aborted).  
  Labels / fields: `{ pickListId, status, lineCount }` on ready, `{ pickListId, message }` on error.  
  Consumer: `waitForListLoading` helper in Playwright (`tests/support/helpers.ts:63-75`).  
  Evidence: `src/lib/test/query-instrumentation.ts:146-235`.

- Signal: `pickLists.detail.load`  
  Type: `ui_state`.  
  Trigger: UI transitions from loading skeleton to ready/error.  
  Labels / fields: `{ pickListId, kitId, status }`.  
  Consumer: `waitForUiState` helper for deterministic waits.  
  Evidence: `src/lib/test/ui-state.ts:25-84`.

- Signal: `pickLists.detail.availability`  
  Type: `ui_state`.  
  Trigger: All live inventory queries resolve (ready/error); fires `ready` with `{ pickListId, partCount, shortfallCount }` and `error` if any lookup fails.  
  Consumer: Extended Playwright waits ensure assertions run after in-stock data materializes.  
  Evidence: `src/lib/test/ui-state.ts:25-84`, `src/lib/api/generated/hooks.ts:1541-1605`.

- Signal: `data-testid` selectors (`pick-lists.detail.layout`, headers, group rows)`  
  Type: DOM test hooks.  
  Trigger: Rendered for layout root, header counters, line items.  
  Labels / fields: Follow `pick-lists.detail.*` naming for page object reuse.  
  Consumer: New `PickListsPage` page object and specs.  
  Evidence: `tests/support/page-objects/kits-page.ts:55-134` — existing naming conventions.

### 10) Lifecycle & Background Work

- Hook / effect: Detail instrumentation supervisor  
  - Trigger cadence: Runs when `pickListId` or query status changes.  
  - Responsibilities: Wire `useListLoadingInstrumentation` and `useUiStateInstrumentation`, reset on param changes.  
  - Cleanup: Emits `aborted` event if component unmounts during load.  
  - Evidence: `src/lib/test/ui-state.ts:25-84`, `src/lib/test/query-instrumentation.ts:213-235`.

- Hook / effect: Kit detail prefetch  
  - Trigger cadence: When detail loads with `kitId` and breadcrumb context present.  
  - Responsibilities: Call `queryClient.prefetchQuery(buildKitDetailQueryKey(kitId))` to warm cache for return navigation.  
  - Cleanup: None (React Query handles cache GC).  
  - Evidence: `src/hooks/use-kit-detail.ts:21-36`.

- Hook / effect: Inventory availability supervisor  
  - Trigger cadence: Runs whenever the set of unique part keys or the pick list detail changes.  
  - Responsibilities: Kick off `useQueries` batch fetching for each part key, map results into `lineAvailability`, and emit `pickLists.detail.availability` phases.  
  - Cleanup: Cancels outstanding queries on unmount or when `pickListId` changes to avoid stale updates.  
  - Evidence: `src/lib/api/generated/hooks.ts:1541-1605`, `src/lib/test/ui-state.ts:25-84`.

### 11) Security & Permissions

- Concern: Authorization & read-only enforcement  
- Touchpoints: `src/routes/pick-lists/$pickListId.tsx`, `src/components/pick-lists/pick-list-detail.tsx`  
- Mitigation: Use backend responses verbatim, render no mutation controls, rely on existing auth guards documented in architecture.  
- Residual risk: Unauthorized users may see 403/404 error view; acceptable since backend is source of truth.  
- Evidence: `docs/contribute/architecture/application_overview.md:37-44`.

### 12) UX / UI Impact

- Entry point: `/pick-lists/$pickListId` detail workspace  
- Change: Replace placeholder with full detail shell (header badges, grouped lines, breadcrumbs).  
- User interaction: Users can review allocations and navigate back to kit detail with preserved filters; no mutation buttons surfaced.  
- Dependencies: Reuses `DetailScreenLayout`, `PartInlineSummary`, `KitLinkChip`, and `PickListLinkChip` context wiring.  
- Evidence: `src/components/layout/detail-screen-layout.tsx:65-136`, `src/components/parts/part-inline-summary.tsx:14-52`.

### 13) Deterministic Test Plan

- Surface: Pick list detail workspace  
  - Scenarios:  
    - Given a seeded pick list with multiple lines, When navigating directly to `/pick-lists/<id>`, Then the header shows requested units/status and `pickLists.detail.load` emits ready with `lineCount`.  
    - Given grouped lines with different statuses, When the detail loads, Then each group renders part summary, location badge, current in-stock quantity, and `quantity_to_pick` without mutation controls.  
    - Given the API response includes `kit_id`, When the detail loads, Then a kit link chip appears and navigates back to the originating kit while preserving status/search parameters.  
    - Given the response omits `kit_id` (future-proof scenario), When landing via deep link, Then breadcrumbs show `Pick Lists → Pick list` without a kit crumb and the chip remains hidden.  
    - Given an open line where `quantity_to_pick` exceeds current stock, When availability loads, Then a shortfall alert appears with the deficit.  
  - Instrumentation / hooks: `waitForListLoading(page, 'pickLists.detail', 'ready')`, `waitForUiState(page, 'pickLists.detail.load', 'ready')`, `waitForUiState(page, 'pickLists.detail.availability', 'ready')`, page object locators `pick-lists.detail.*`.  
  - Gaps: Need representative fixtures for both sufficient stock and shortfall cases to assert alert behavior.  
  - Evidence: `docs/epics/kits_feature_breakdown.md:252-263`, `tests/support/helpers.ts:63-75`.

- Surface: Kit detail → pick list navigation  
  - Scenarios:  
    - Given a kit detail with pick list chip, When clicking the chip, Then navigation to `/pick-lists/<id>` occurs and breadcrumb back link retains original status/search.  
    - Given the kit crumb renders (based on `kit_id`), When clicking "Back to kit", Then kit detail reloads and `kits.detail.links` instrumentation fires ready.  
  - Instrumentation / hooks: `waitForListLoading(page, 'kits.detail', 'ready')`, `waitForListLoading(page, 'pickLists.detail', 'ready')`, `KitsPage.pickListChip` helper.  
  - Gaps: Defer undo/completion coverage to execution feature.  
  - Evidence: `src/components/kits/kit-detail-header.tsx:197-227`, `tests/e2e/kits/kit-detail.spec.ts:520-604`.

### 14) Implementation Slices

- Slice: Domain scaffolding  
  - Goal: Introduce types, hook, and route search validation to fetch detail data plus a shared availability hook that batches `useGetPartsLocationsByPartKey`.  
  - Touches: `src/types/pick-lists.ts`, `src/hooks/use-pick-list-detail.ts`, `src/hooks/use-pick-list-availability.ts`, `src/routes/pick-lists/$pickListId.tsx`.  
  - Dependencies: Generated API client already present; no UI yet.

- Slice: UI composition & instrumentation  
  - Goal: Render header (with `KitLinkChip`), line groups, breadcrumbs, availability badges/alerts, and instrumentation-ready layout.  
  - Touches: `src/components/pick-lists/pick-list-detail.tsx`, `src/components/pick-lists/pick-list-lines.tsx`, `src/components/kits/kit-link-chip.tsx`, `src/components/kits/pick-list-link-chip.tsx`, `src/components/kits/kit-detail-header.tsx`.  
  - Dependencies: Completes after domain scaffolding.

- Slice: Playwright coverage & factories  
  - Goal: Seed pick lists via factories, add page object, and write e2e spec with instrumentation waits covering both sufficient stock and shortfall alerts.  
  - Touches: `tests/api/factories/kit-factory.ts`, `tests/support/page-objects/pick-lists-page.ts`, `tests/support/fixtures.ts`, `tests/e2e/pick-lists/pick-list-detail.spec.ts`.  
  - Dependencies: Requires UI selectors finalized.

### 15) Risks & Open Questions

- Risk: Inventory lookups add N additional HTTP requests (one per unique part), increasing load time.  
  Impact: Slow availability hydration could delay shortfall alerts and frustrate users.  
  Mitigation: Batch via `useQueries`, show loading badges, and consider backend aggregation if latency proves noticeable.

- Risk: Breadcrumb context lost when navigating from sources other than kit detail.  
  Impact: Users may lack direct return path to the originating surface.  
  Mitigation: Default breadcrumbs to the Pick Lists label and only append kit context when available; hide `KitLinkChip` when context missing.

- Risk: Large pick lists could impact render performance.  
  Impact: UI lag when grouping many lines.  
  Mitigation: Memoize grouping, consider virtualization if profiling shows issues.

### 16) Confidence

<confidence_template>Confidence: Medium — Live availability fetches must be validated for latency, but the data sources and UI wiring are otherwise well understood.</confidence_template>

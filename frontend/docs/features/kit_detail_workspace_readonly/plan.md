# Kit Detail Workspace (Read-only) Plan

### 0) Research Log & Findings
- Confirmed routed detail requirements, BOM columns, and disabled edit affordance for the read-only slice (docs/epics/kits_feature_breakdown.md:55).
- Logged mandated instrumentation scopes and Playwright coverage expectations for the workspace (docs/epics/kits_feature_breakdown.md:66).
- Revisited stack guidance that hooks adapt generated payloads into camelCase models for React components (docs/contribute/architecture/application_overview.md:32).
- Validated generated hook `useGetKitsByKitId` to hydrate the detail view from the backend payload (src/lib/api/generated/hooks.ts:838).
- Inspected `KitDetailResponseSchema` fields to map availability math and linked badge counts (src/lib/api/generated/types.ts:2893).
- Noted shared `DetailScreenLayout` shell used by other detail screens for fixed header + scrollable content (src/components/layout/detail-screen-layout.tsx:31).
- Studied `PartDetails` instrumentation wiring to mirror list loading and UI state scopes (src/components/parts/part-details.tsx:145).
- Reviewed kits overview instrumentation naming to keep scope taxonomy consistent (`kits.overview`, membership scopes) (src/components/kits/kit-overview-list.tsx:76).
- Checked membership hooks emitting kit-specific `useListLoadingInstrumentation` events for telemetry baselines (src/hooks/use-kit-memberships.ts:340).
- Examined the kits Playwright page object to plan detail helpers and navigation assertions (tests/support/page-objects/kits-page.ts:21).
- Reconfirmed Playwright helper usage for deterministic waits on list loading and UI state events (docs/contribute/testing/playwright_developer_guide.md:85).

### 1) Intent & Scope

**User intent**

Ship the frontend slice that renders the new kit detail workspace in read-only mode, showing availability math and instrumentation so engineers can build on it without backend guesses.

**Prompt quotes**

"Introduce TanStack Router route `/kits/$kitId` rendering a detail layout with header, toolbar, and main content similar to `PartDetails`."  
"Render a read-only BOM table showing Required, Total, In stock, Reserved, Available, and Shortfall columns sourced from backend aggregates."

**In scope**

- Add `/kits/$kitId` route hierarchy and link the overview cards into it.
- Implement React components (header, toolbar, BOM table) that consume the kit detail payload and computed availability fields.
- Wire `useListLoadingInstrumentation` / `useUiStateInstrumentation` scopes `kits.detail`, `kits.detail.contents`, and `kits.detail.toolbar`.
- Extend test data helpers, Playwright page objects, and add a deterministic spec covering navigation, counters, and filtering.

**Out of scope**

- Any mutation flows (edit metadata, contents CRUD, archive toggles) beyond showing disabled affordances.
- Shopping/pick list linkage chips or other cross-feature UI slices called out for later work.
- Backend changes or OpenAPI generation (already delivered).

**Assumptions / constraints**

Backend `GET /api/kits/{kit_id}` includes the aggregates defined in the brief; kit IDs in routes remain numeric; instrumentation metadata must stay backend-driven with no request interception; upcoming mutation slices will reuse the cache structures introduced here.

### 2) Affected Areas & File Map

- Area: src/components/kits/kit-card.tsx
- Why: Make tiles navigate to `/kits/$kitId`, surface disabled Edit button tooltip, and keep badge visuals consistent with the detail header.
- Evidence: src/components/kits/kit-card.tsx:67

- Area: src/routes/kits/$kitId.tsx (new)
- Why: Provide the TanStack Router layout wrapper with `<Outlet>` mirroring the parts detail hierarchy.
- Evidence: src/routes/parts/$partId.tsx:1

- Area: src/routes/kits/$kitId/index.tsx (new)
- Why: Fetch `kitId` params, render the detail workspace component, and handle invalid IDs/redirects.
- Evidence: docs/epics/kits_feature_breakdown.md:55

- Area: src/hooks/use-kit-detail.ts (new)
- Why: Wrap `useGetKitsByKitId`, normalize snake_case payloads, expose derived counters, and centralize instrumentation metadata builders.
- Evidence: src/lib/api/generated/hooks.ts:838

- Area: src/types/kits.ts
- Why: Add `KitDetail`, `KitContentRow`, and mapping helpers for the workspace plus shared badge metadata.
- Evidence: src/types/kits.ts:1

- Area: src/components/kits/kit-detail-workspace.tsx (new)
- Why: Compose `DetailScreenLayout`, header summary, toolbar, and BOM content states for the routed screen.
- Evidence: src/components/layout/detail-screen-layout.tsx:31

- Area: src/components/kits/kit-detail-toolbar.tsx (new)
- Why: Render filter input, row/shortfall counters, and emit `useUiStateInstrumentation` scope data.
- Evidence: docs/epics/kits_feature_breakdown.md:58

- Area: src/components/kits/kit-bom-table.tsx (new)
- Why: Display the read-only BOM table with required/total/available math, reservation tooltip, and empty/error states.
- Evidence: docs/epics/kits_feature_breakdown.md:57

- Area: tests/api/factories/kit-factory.ts
- Why: Add helpers to seed kit contents via `/api/kits/{kit_id}/contents` so Playwright specs can rely on real backend state.
- Evidence: tests/api/factories/kit-factory.ts:1

- Area: tests/support/page-objects/kits-page.ts
- Why: Extend locators for the detail layout, toolbar counters, table rows, and expose navigation helpers.
- Evidence: tests/support/page-objects/kits-page.ts:21

- Area: tests/e2e/kits/kits-overview.spec.ts
- Why: Assert that overview cards open the detail workspace and reuse shared waits.
- Evidence: tests/e2e/kits/kits-overview.spec.ts:7

- Area: tests/e2e/kits/kits-detail.spec.ts (new)
- Why: Add deterministic coverage for header metadata, BOM totals, and filtering instrumentation.
- Evidence: docs/epics/kits_feature_breakdown.md:70

### 3) Data Model / Contracts

- Entity / contract: KitDetail
  - Shape: `{ id: number; name: string; description: string | null; buildTarget: number; status: KitStatus; archivedAt: string | null; shoppingListBadgeCount: number; pickListBadgeCount: number; updatedAt: string; contents: KitContentRow[] }`
  - Mapping: Map `build_target → buildTarget`, `shopping_list_badge_count → shoppingListBadgeCount`, `pick_list_badge_count → pickListBadgeCount`, `archived_at → archivedAt`, `updated_at → updatedAt`.
  - Evidence: src/lib/api/generated/types.ts:2893

- Entity / contract: KitContentRow
  - Shape: `{ id: number; partId: number; partKey: string; description: string; manufacturerCode: string | null; note: string | null; requiredPerUnit: number; totalRequired: number; inStock: number; reserved: number; available: number; shortfall: number; activeReservations: ReservationEntry[] }`
  - Mapping: Convert `required_per_unit`, `total_required`, `in_stock`, `active_reservations` to camelCase and flatten `part.key` / `part.description`.
  - Evidence: src/lib/api/generated/types.ts:2977

- Entity / contract: KitDetailQueryKey
  - Shape: `['getKitsByKitId', { path: { kit_id: number } }]`
  - Mapping: Use helper to coerce numeric ID, shareable for cache invalidation in later slices.
  - Evidence: src/lib/api/generated/hooks.ts:842

### 4) API / Integration Surface

- Surface: GET /api/kits/{kit_id} (`useGetKitsByKitId`)
  - Inputs: `{ path: { kit_id: number } }` from router params; `enabled` guard when ID invalid.
  - Outputs: `KitDetailResponseSchema` with metadata, contents, and badge counts mapped to the detail workspace.
  - Errors: 404 triggers error state and back-to-overview link; other failures display toast via global handler and detail error block.
  - Evidence: src/lib/api/generated/hooks.ts:838

### 5) Algorithms & UI Flows

- Flow: Kit detail load & instrumentation
  - Steps:
    1. Parse `kitId` param, coerce to number, build query key via `useKitDetail`.
    2. Fire `useGetKitsByKitId` with React Query, mapping payload to camelCase detail/rows.
    3. Invoke `useListLoadingInstrumentation` with scope `kits.detail`, deriving metadata from kit status + content count.
    4. Once data resolves, render `DetailScreenLayout` header and pass mapped rows to toolbar/table components.
  - States / transitions: React Query `isLoading`, `isFetching`, `error` drive loading skeleton, error block, ready state.
  - Hotspots: Prevent duplicate ready events when refetching by memoizing metadata; guard against undefined contents.
  - Evidence: src/components/parts/part-details.tsx:145

- Flow: BOM filtering & counter updates
  - Steps:
    1. Track filter text in local state (debounced for instrumentation metadata).
    2. Use `startTransition` to schedule filter updates; while the transition is pending, expose `isFilteringPending` and `deferredFilter` values.
    3. Derive `filteredRows` and availability aggregates (`visibleCount`, `totalCount`, `sumShortfall`, `filteredShortfall`) off the deferred filter input so recomputation happens inside the transition.
    4. Emit `useListLoadingInstrumentation` (`kits.detail.contents`) with `isLoading = isKitQueryLoading || isFilteringPending` and always include `{ kitId, total, visible, shortfallCount, filteredCount }`; drive toolbar telemetry via `useUiStateInstrumentation` (`kits.detail.toolbar`).
  - States / transitions: Filter text changes toggle the transition’s pending flag, which drives `list_loading` events for ready/error phases without waiting on network; React Query status continues to cover server refetches.
  - Hotspots: Ensure case-insensitive filtering handles null manufacturer/note; avoid recomputing on every keystroke by trimming.
  - Evidence: docs/epics/kits_feature_breakdown.md:58

- Flow: Navigation from overview card to detail
  - Steps:
    1. Wrap kit title/card surface in `<Link to="/kits/$kitId">`.
    2. On click, Router transitions into `/kits/$kitId`, preserving original search state for back navigation.
    3. Detail route fetch triggers instrumentation; overview remains cached for back button.
    4. Tests assert new URL and waiting on `kits.detail` ready event.
  - States / transitions: Router handles active route; ensure card controls stop propagation (e.g., archive buttons) to retain existing behavior.
  - Hotspots: Avoid interfering with membership indicator tooltips or controls inside the card.
  - Evidence: src/components/kits/kit-card.tsx:67

### 6) Derived State & Invariants

- Derived value: filteredRows
  - Source: `KitContentRow[]` from `useKitDetail` plus filter string.
  - Writes / cleanup: Recomputed via `useMemo`; reset to full list when detail payload changes.
  - Guards: Normalize strings to lower case; treat null manufacturer/note as empty strings.
  - Invariant: Visible table rows always reflect filter text across key, description, manufacturer, and note.
  - Evidence: docs/epics/kits_feature_breakdown.md:58

- Derived value: summaryCounters
  - Source: Aggregating `totalRequired`, `available`, `shortfall` across contents and filtered subset.
  - Writes / cleanup: Memoized object referenced by toolbar and instrumentation metadata.
  - Guards: Default to zero when contents undefined; clamp shortfall sums to >= 0.
  - Invariant: `filteredShortfall ≤ totalShortfall` and counters update synchronously with filter results.
  - Evidence: docs/epics/kits_feature_breakdown.md:58

- Derived value: isArchived
  - Source: Kit status from detail payload.
  - Writes / cleanup: Hook return value consumed by header controls and badge rendering.
  - Guards: Treat unknown status as archived (conservative) until payload resolves.
  - Invariant: Disabled Edit button and badge state always align with backend `status`.
  - Evidence: docs/epics/kits_feature_breakdown.md:56

### 7) Error Handling & Empty States
- Display loading skeleton while query pending; fallback to error block with retry/back CTA when query errors (patterned on box detail) (src/components/boxes/box-details.tsx:203).
- For kits lacking contents, render empty BOM message and zero counters while still emitting ready instrumentation.
- On 404, keep the user on `/kits/$kitId`, render the standardized `DetailScreenLayout` error state with back-to-overview CTA, and rely on `useListLoadingInstrumentation` to emit `phase: 'error'` metadata (no redirect or manual aborted events).

### 8) Accessibility & UX Notes
- Preserve semantic heading structure in `DetailScreenLayout` so screen readers announce kit name (src/components/layout/detail-screen-layout.tsx:82).
- Provide `aria-label` and `title` on disabled Edit button to explain read-only state.
- Use table header semantics (`<th scope="col">`) and maintain responsive overflow with horizontal scroll for smaller viewports.
- Keep navigation links (kit title, part keys) keyboard reachable and ensure focus ring visible via existing Tailwind styles.

### 9) Telemetry & Instrumentation

- Signal: kits.detail
  - Type: instrumentation event (`list_loading`)
  - Trigger: React Query transitions between loading/error/ready for `useGetKitsByKitId`.
  - Labels / fields: `{ kitId, status, contentCount, filteredCount }`
  - Consumer: Playwright `waitForListLoading('kits.detail', phase)`
  - Evidence: docs/epics/kits_feature_breakdown.md:66

- Signal: kits.detail.contents
  - Type: instrumentation event (`list_loading`)
  - Trigger: When React Query loading completes or filter transitions finish (`isFilteringPending` toggles).
  - Labels / fields: `{ kitId, total: totalRows, visible, shortfallCount: totalShortfall, filteredCount: visible }`
  - Consumer: Playwright assertions for table readiness and counts.
  - Evidence: docs/epics/kits_feature_breakdown.md:67

- Signal: kits.detail.toolbar
  - Type: ui_state event
  - Trigger: Toolbar counters finalized after filter or data updates.
  - Labels / fields: `{ totalRequired, available, shortfallCount, filteredCount, filteredShortfall }`
  - Consumer: `waitForUiState(page, 'kits.detail.toolbar', 'ready')` waits before asserting counters.
  - Evidence: docs/epics/kits_feature_breakdown.md:69

### 10) Lifecycle & Background Work
- Hook / effect: React Query cache revalidation
  - Trigger cadence: On mount + default focus/refetch intervals.
  - Responsibilities: Keep kit detail fresh without manual polling; instrumentation should treat background refetch as fetching state.
  - Cleanup: React Query handles cache lifecycle; component unmount stops instrumentation via existing cleanup in hooks.
  - Evidence: src/lib/test/query-instrumentation.ts:129

### 11) Security & Permissions

- Concern: Archived kits must remain read-only
- Touchpoints: Detail header actions and toolbar controls.
- Mitigation: Disable Edit button with tooltip and omit BOM mutation affordances; rely solely on GET endpoint.
- Residual risk: None—UI does not expose mutation hooks; backend already enforces status guard.
- Evidence: docs/epics/kits_feature_breakdown.md:56

### 12) UX / UI Impact

- Entry point: `/kits/$kitId`
- Change: New detail screen with header summary, counters, and read-only BOM table.
- User interaction: Clicking a kit from the overview opens the workspace; users can filter rows and inspect availability math.
- Dependencies: Detail view depends on generated kit detail hook and existing quantity badges.
- Evidence: docs/epics/kits_feature_breakdown.md:55

### 13) Deterministic Test Plan

- Surface: kits.detail workspace
  - Scenarios:
    - Given a kit with contents, when navigating from the overview card, then the detail header shows name/build target, badges, and disabled edit tooltip.
    - Given populated contents, when the toolbar reports totals, then counters match backend aggregates and `kits.detail.toolbar` emits ready metadata.
    - Given a filter term matching a subset, when typing the filter, then table rows reduce, `kits.detail.contents` emits ready metadata with updated `visible`/`filteredCount`, and data stays sorted.
    - Given an invalid kit ID, when visiting `/kits/99999999`, then the error state appears inline and instrumentation emits an `error` event with `{ status: 'error', kitId }`.
  - Instrumentation / hooks: `waitForListLoading(page, 'kits.detail', 'ready'|'error')`, `waitForListLoading(page, 'kits.detail.contents', 'ready')`, `waitForUiState(page, 'kits.detail.toolbar', 'ready')`, table selectors via new page object helpers.
  - Gaps: None—read-only coverage is required before handing off to mutation slices.
  - Evidence: docs/epics/kits_feature_breakdown.md:70

### 14) Implementation Slices

- Slice: Routing & data layer
  - Goal: Establish `/kits/$kitId` routes, kit detail hook, and type mappings.
  - Touches: `src/routes/kits/$kitId*.tsx`, `src/hooks/use-kit-detail.ts`, `src/types/kits.ts`.
  - Dependencies: None.

- Slice: Workspace UI & instrumentation
  - Goal: Render header/toolbar/table, wire instrumentation, and update kit card navigation.
  - Touches: `src/components/kits/kit-card.tsx`, `src/components/kits/kit-detail-*.tsx`.
  - Dependencies: Slice 1 (data access).

- Slice: Playwright coverage & test data
  - Goal: Seed kit contents, extend page objects, and add detail spec assertions.
  - Touches: `tests/api/factories/kit-factory.ts`, `tests/support/page-objects/kits-page.ts`, `tests/e2e/kits/*.spec.ts`.
  - Dependencies: Slices 1–2 (UI selectors).

### 15) Risks & Open Questions

- Risk: Kits with hundreds of BOM rows could cause heavy re-rendering when filtering.
  - Impact: Sluggish UI and flaky instrumentation timings.
  - Mitigation: Memoize derived arrays and consider virtualization if performance becomes an issue.
- Risk: Backend payload missing `contents` or badge counts for certain kits.
  - Impact: Header instrumentation might emit incorrect metadata.
  - Mitigation: Guard against undefined fields and log via toast/error state; coordinate with backend if encountered.
- Risk: Filter metadata could diverge from toolbar counters if calculations happen in multiple places.
  - Impact: Tests fail due to inconsistent instrumentation payloads.
  - Mitigation: Centralize aggregate calculation in `useKitDetail` hook and reuse for both UI and telemetry.

### 16) Confidence

Confidence: Medium — Requirements are clear, but new instrumentation scopes and backend-derived aggregates may need adjustment once the real payload is exercised.

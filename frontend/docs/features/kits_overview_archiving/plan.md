# Kits Overview & Archiving Controls Plan

### 0) Research Log & Findings
- Reviewed kits feature breakdown to capture required card fields, tab switching, and search expectations for the overview (docs/epics/kits_feature_breakdown.md:11).
- Noted archive/unarchive requirements, undo toast behavior, and New Kit CTA routing mandates (docs/epics/kits_feature_breakdown.md:27).
- Revisited architecture overview to confirm custom hooks map generated payloads into camelCase models (docs/contribute/architecture/application_overview.md:33).
- Examined ListScreenLayout structure to reuse sticky header and scrollable content shell for the kits page (src/components/layout/list-screen-layout.tsx:21).
- Studied SellerList instrumentation and search patterns as a model for list loading events and query param handling (src/components/sellers/seller-list.tsx:88).
- Verified generated hooks for kit queries and lifecycle mutations (src/lib/api/generated/hooks.ts:752).
- Confirmed archive/unarchive mutation helpers are available in the generated client (src/lib/api/generated/hooks.ts:824).
- Checked navigation array to scope sidebar changes for the new Kits entry (src/components/layout/sidebar.tsx:17).
- Audited toast component to understand current rendering and gaps for action buttons (src/components/ui/toast.tsx:70).
- Reviewed list loading instrumentation implementation for wiring new `kits.overview` scope (src/lib/test/query-instrumentation.ts:146).
- Inspected shared Playwright fixtures and navigation spec to budget test updates and new page object wiring (tests/support/fixtures.ts:19).
- Looked at desktop navigation spec to ensure Kits becomes part of the primary navigation expectations (tests/e2e/shell/navigation.spec.ts:4).

### 1) Intent & Scope

**User intent**

Deliver a frontend plan that adds the kits overview UI with active/archived tabs, search, lifecycle actions, and undoable archiving using the already generated API client and backend.

**Prompt quotes**

"Kits overview & archiving controls"
"All backend work has been delivered already and the openapi.json and client code have been updated."

**In scope**

- Build a Kits overview route with cards, segmented tabs, counts, and search tied to generated queries.
- Implement archive/unarchive controls with optimistic updates, undo toast, and instrumentation hooks.
- Surface a New Kit CTA that navigates into the forthcoming detail form route.
- Extend toast infrastructure if needed to support undo actions and update Playwright coverage plus factories.

**Out of scope**

- Kit detail/BOM management UI and downstream shopping/pick list workflows.
- Backend schema changes or OpenAPI regeneration.
- Global search integration or part detail cross-navigation.

**Assumptions / constraints**

Backend endpoints behave per the brief, client code already includes kit hooks, kit detail route will exist later, and tests must stay backend-driven with no request interception.

### 2) Affected Areas & File Map

- Area: src/components/layout/sidebar.tsx
- Why: Add a Kits navigation item so the overview is reachable from the app shell.
- Evidence: src/components/layout/sidebar.tsx:17

- Area: src/routes/kits/index.tsx (new)
- Why: Define TanStack Router entry that reads query params and renders the overview component.
- Evidence: src/routes/sellers/index.tsx:4

- Area: src/hooks/use-kits.ts (new)
- Why: Wrap generated kit hooks to normalize snake_case payloads, manage query keys, and expose helper utilities.
- Evidence: docs/contribute/architecture/application_overview.md:33

- Area: src/types/kits.ts (new)
- Why: Declare camelCase kit summary models shared between components, hooks, and tests.
- Evidence: docs/contribute/architecture/application_overview.md:33

- Area: src/lib/utils/debounce.ts (new)
- Why: Provide a lightweight debounced value helper for the overview search box.
- Evidence: docs/epics/kits_feature_breakdown.md:13

- Area: src/components/kits/kit-overview-list.tsx (new)
- Why: Compose ListScreenLayout with tabs, search, counts, instrumentation, and card grid for kits.
- Evidence: docs/epics/kits_feature_breakdown.md:12

- Area: src/components/kits/kit-card.tsx (new)
- Why: Render kit tiles with name, description snippet, badges, updated time, and action affordances.
- Evidence: docs/epics/kits_feature_breakdown.md:11

- Area: src/components/kits/kit-archive-controls.tsx (new)
- Why: Encapsulate archive/unarchive buttons, optimistic status toggles, and undo handlers per card.
- Evidence: docs/epics/kits_feature_breakdown.md:27

- Area: src/components/ui/toast.tsx
- Why: Extend toast rendering to optionally show an action button for undo flows.
- Evidence: src/components/ui/toast.tsx:70

- Area: src/contexts/toast-context-base.ts
- Why: Broaden toast context to expose an action-capable helper used by the kits undo toast.
- Evidence: src/contexts/toast-context-base.ts:8

- Area: src/lib/test/toast-instrumentation.ts
- Why: Ensure undo-capable toasts emit action metadata in test events so Playwright can deterministically await them.
- Evidence: src/lib/test/toast-instrumentation.ts:85

- Area: src/types/test-events.ts
- Why: Extend `ToastTestEvent` to include optional `action` metadata consumed by kits undo scenarios.
- Evidence: src/types/test-events.ts:71

- Area: tests/api/factories/kit-factory.ts (new)
- Why: Seed kits, archived variants, and badge counts through the backend for deterministic tests.
- Evidence: docs/contribute/testing/factories_and_fixtures.md:34

- Area: tests/support/page-objects/kits-page.ts (new)
- Why: Provide Playwright accessors for kits overview sections, cards, and archive buttons.
- Evidence: tests/support/page-objects/parts-page.ts:7

- Area: tests/support/fixtures.ts
- Why: Expose the kits page object and kit factory via existing fixtures for specs.
- Evidence: tests/support/fixtures.ts:19

- Area: tests/e2e/shell/navigation.spec.ts
- Why: Update navigation assertions to include the Kits route toggle.
- Evidence: tests/e2e/shell/navigation.spec.ts:4

- Area: tests/e2e/kits/kits-overview.spec.ts (new)
- Why: Cover tabs, debounced search, archive undo behavior, and instrumentation-driven waits.
- Evidence: docs/contribute/testing/playwright_developer_guide.md:10

### 3) Data Model / Contracts

- Entity / contract: KitOverviewSummary
- Shape: `{"id":number,"name":string,"description":string|null,"status":"active"|"archived","buildTarget":number,"archivedAt":string|null,"updatedAt":string,"shoppingListBadgeCount":number,"pickListBadgeCount":number}`
- Mapping: `KitSummarySchema` fields (`archived_at`, `build_target`, `shopping_list_badge_count`, etc.) map to camelCase properties for UI consumption.
- Evidence: src/lib/api/generated/types.ts:4315

- Entity / contract: KitListQueryParams
- Shape: `{"status":"active"|"archived","query"?:string}`
- Mapping: Router `validateSearch` omits empty terms so we pass `undefined` for blank search, preventing `?query=null` serialization; hydrated values align with `useGetKits` params.
- Evidence: docs/epics/kits_feature_breakdown.md:20

- Entity / contract: KitLifecycleMutationPayload
- Shape: `{"path":{"kit_id":number}}`
- Mapping: Archive/unarchive mutations accept path-only payloads and return updated `KitResponseSchema` that must update both status buckets.
- Evidence: docs/epics/kits_feature_breakdown.md:41

### 4) API / Integration Surface

- Surface: GET /api/kits via useGetKits
- Inputs: `{ query: { status, query? } }` built from router search and debounced term.
- Outputs: Array of `KitSummarySchema` records used to populate tabs and counts.
- Errors: Propagate ApiError to toast/instrumentation; show recoverable message in list shell.
- Evidence: src/lib/api/generated/hooks.ts:750

- Surface: POST /api/kits/{kit_id}/archive via usePostKitsArchiveByKitId
- Inputs: `{ path: { kit_id } }` from card actions.
- Outputs: Updated kit response; optimistic local state reconciles with query invalidation.
- Errors: Handle `InvalidOperationException` via toast and revert optimistic status.
- Evidence: src/lib/api/generated/hooks.ts:824

- Surface: POST /api/kits/{kit_id}/unarchive via usePostKitsUnarchiveByKitId
- Inputs: `{ path: { kit_id } }`.
- Outputs: Updated kit status to active; reinsert into active cache and badge counts.
- Errors: Same toast/instrumentation path as archive.
- Evidence: src/lib/api/generated/hooks.ts:982

### 5) Algorithms & UI Flows

- Flow: Active tab load & instrumentation
  - Steps:
    1. Resolve router search defaults (`status=active`, `query=''`) and compute debounced query value.
    2. Call `useKitsOverview`, which issues paired `useQueries` for both `{ status:'active', query }` and `{ status:'archived', query }`, normalizes results into camelCase summaries, and exposes memoized buckets keyed by status.
    3. Render `ListScreenLayout` with segmented tabs, counts, and card grid fed from the active bucket while still showing archived badge counts using the parallel query data.
    4. Invoke `useListLoadingInstrumentation` with scope `kits.overview`, deriving totals/visible/filtered metadata from the status bucket that finished loading (and merging optimistic overrides).
  - States / transitions: React Query statuses drive skeleton/error/ready states; tab selection updates search params.
  - Hotspots: Memoize grouped data and counts per status bucket so dual queries do not churn renders; ensure initial ready event waits for the selected status response.
  - Evidence: src/lib/test/query-instrumentation.ts:146

- Flow: Debounced search preservation across tabs
  - Steps:
    1. Capture input edits and update local `searchTerm` while scheduling debounced API term (200ms).
    2. Push query param to router while preserving current `status`.
    3. When debounced value changes, both status queries refetch so the archived badge stays in sync without waiting for a tab switch.
    4. Apply client-side filtering only for in-flight optimistic updates, maintaining counts and instrumentation metadata.
  - States / transitions: Debounce state toggles between raw term and debounced term; dual query cache keeps both buckets warm.
  - Hotspots: Ensure debounced updates cancel in-flight promises when component unmounts to avoid stale state and double refetches.
  - Evidence: docs/epics/kits_feature_breakdown.md:13

- Flow: Archive with undo toast
  - Steps:
    1. User clicks archive/unarchive; record pending state and emit `trackFormSubmit` equivalent for lifecycle control.
    2. Optimistically move the kit between status buckets and show a toast with Undo action tied to opposite mutation.
    3. On mutation success, emit success instrumentation and leave optimistic state; refresh caches after server response.
    4. If Undo pressed within toast lifetime, trigger inverse mutation and restore original cache snapshot; otherwise auto-clear toast.
  - States / transitions: Pending mutation status toggles disable action button; optimistic caches revert on failure or undo.
  - Hotspots: Ensure multiple rapid toggles coalesce and toast actions reference latest kit status.
  - Evidence: docs/epics/kits_feature_breakdown.md:27

### 6) Derived State & Invariants

- Derived value: visibleKits
  - Source: React Query data for current status combined with optimistic overrides and local filters.
  - Writes / cleanup: Recomputed on status or search change; cleared on unmount.
  - Guards: Skip computation while query is loading to avoid empty flash.
  - Invariant: Shows only kits matching selected status and search term at all times.
  - Evidence: docs/epics/kits_feature_breakdown.md:12

- Derived value: tabCounts
  - Source: Raw arrays per status from `useKitsOverview`'s dual-query result plus filter metadata.
  - Writes / cleanup: Stored in memo for segmented tabs; invalidated on query refetch.
  - Guards: Clamp counts to >=0 and ensure archived tab still populates when not selected.
  - Invariant: Tab badges reflect total kits per status regardless of filter state.
  - Evidence: docs/epics/kits_feature_breakdown.md:12

- Derived value: lifecyclePendingMap
  - Source: Local state keyed by kit id capturing optimistic status while mutation resolves.
  - Writes / cleanup: Set on archive/unarchive submit, cleared on success, failure, or component unmount.
  - Guards: Prevent conflicting entries if both archive and undo fire before settlement.
  - Invariant: UI never shows both archive and unarchive buttons enabled simultaneously for a pending kit.
  - Evidence: docs/epics/kits_feature_breakdown.md:27

### 7) State Consistency & Async Coordination

- Source of truth: React Query caches keyed by `['getKits',{status,query}]` with normalized KitOverviewSummary collections for both statuses hydrated concurrently.
- Coordination: `useKitsOverview` exposes grouped data, derived counts, and optimistic mutation helpers so tabs, counts, and cards rely on the same memoized datasets without issuing extra fetches on tab switch.
- Async safeguards: Debounced query input cancels prior timers; mutation promises revert optimistic caches on error using saved snapshots.
- Instrumentation: `useListLoadingInstrumentation` emits `kits.overview` events and lifecycle controls fire `trackForm*` plus undo toasts for deterministic waits.
- Evidence: src/components/sellers/seller-list.tsx:88

### 8) Errors & Edge Cases

- Failure: GET /kits returns error (network or server)
- Surface: Kits overview list shell
- Handling: Show inline error state with retry CTA and emit `list_loading` phase `error`.
- Guardrails: Leave previous successful data visible until replacement arrives when possible.
- Evidence: src/lib/test/query-instrumentation.ts:198

- Failure: Archive endpoint rejects because kit already archived
- Surface: Kit card archive button
- Handling: Revert optimistic move, show error toast, and emit form error instrumentation.
- Guardrails: Disable buttons while mutation pending and reconcile with latest backend status.
- Evidence: docs/epics/kits_feature_breakdown.md:45

- Failure: Undo toast action triggers but unarchive fails
- Surface: Toast action handler & card controls
- Handling: Display exception toast, restore original pending map entry, and prompt user to retry.
- Guardrails: Keep toast visible until undo finishes and surface fallback link to detail screen if repeated failures occur.
- Evidence: docs/epics/kits_feature_breakdown.md:27

### 9) Observability / Instrumentation

- Signal: `kits.overview` list loading event
- Type: instrumentation event (list_loading)
- Trigger: Loading, ready, error, and abort transitions from useKitsOverview queries.
- Labels / fields: `{ status, totals, visible, filtered, searchTerm }`.
- Consumer: Playwright waits via `waitForListLoading`.
- Evidence: src/lib/test/query-instrumentation.ts:146

- Signal: `KitLifecycle:archive` form events
- Type: instrumentation event (form)
- Trigger: Archive/unarchive submit, success, and error paths.
- Labels / fields: `{ kitId, targetStatus }`.
- Consumer: Playwright helper for form lifecycle validation.
- Evidence: src/types/test-events.ts:44

- Signal: Undo toast with action metadata
- Type: instrumentation event (toast)
- Trigger: showSuccess/showException wrappers invoked for archive outcome and undo action result, forwarding `action: 'undo'` through the instrumented toast pipeline.
- Labels / fields: `{ level, message, action: 'undo' }` (new optional action field added to `ToastTestEvent` plus `instrumentToast` emitter).
- Consumer: Toast helper in tests verifying user feedback.
- Evidence: src/lib/test/toast-instrumentation.ts:85

### 10) Lifecycle & Background Work

- Hook / effect: Prefetch opposite status data
- Trigger cadence: on tab mount and when debounced search changes.
- Responsibilities: Prime archived list when active tab loads (and vice versa) to make tab switches instant.
- Cleanup: Cancel in-flight prefetch when component unmounts or status changes rapidly.
- Evidence: docs/epics/kits_feature_breakdown.md:12

### 11) Security & Permissions

- Concern: Status transitions restricted to backend rules
- Touchpoints: Kit archive controls rely on generated mutations with error surfacing only.
- Mitigation: No client-side bypass; errors bubble through global toast and instrumentation.
- Residual risk: None—single-user app defers to backend validation.
- Evidence: docs/epics/kits_feature_breakdown.md:45

### 12) UX / UI Impact

- Entry point: `/kits` primary route accessible from sidebar.
- Change: Adds Kits list screen composed of sticky header, search, segmented tabs, and card grid.
- User interaction: Users can filter kits, toggle status tabs without losing search, archive/unarchive with immediate feedback, and start kit creation via a CTA that navigates to `/kits/new`.
- Dependencies: Relies on ListScreenLayout visual language and existing toast styling.
- Evidence: docs/epics/kits_feature_breakdown.md:29

### 13) Deterministic Test Plan

- Surface: Kits overview tabs
  - Scenarios:
    - Given seeded active and archived kits, When the user loads `/kits`, Then `list_loading` emits ready metadata with active totals.
    - Given a debounced search term, When switching tabs, Then the search term persists and counts update without stale cards.
  - Instrumentation / hooks: `waitForListLoading(page,'kits.overview','ready')`, data-testid anchors `kits.overview.header` and `kits.overview.card.<id>`.
  - Gaps: None.
  - Evidence: docs/contribute/testing/playwright_developer_guide.md:10

- Surface: Archive undo flow
  - Scenarios:
    - Given an active kit, When Archive is clicked, Then the card moves to Archived tab, toast appears with Undo, and form/ toast events fire success.
    - Given the toast is visible, When Undo is clicked, Then the kit returns to Active and a toast confirms reversal.
  - Instrumentation / hooks: `trackFormSubmit/Success/Error` via `waitTestEvent('form', ...)`, toast viewport selectors, and `waitTestEvent('toast', evt => evt.action === 'undo')`.
  - Gaps: None.
  - Evidence: docs/epics/kits_feature_breakdown.md:27

- Surface: Sidebar navigation
  - Scenarios:
    - Given the app shell, When the user clicks Kits in the sidebar, Then the kits overview loads and Kits nav link gains active state.
  - Instrumentation / hooks: Existing app shell page object assertions.
  - Gaps: None.
  - Evidence: tests/e2e/shell/navigation.spec.ts:4

- Surface: New Kit CTA
  - Scenarios:
    - Given the kits overview, When the user clicks the New Kit CTA, Then the router navigates to `/kits/new` and a `route` test event confirms the transition.
  - Instrumentation / hooks: `AppShellPage` route assertions, `waitTestEvent(page,'route', evt => evt.to === '/kits/new')`, and a `data-testid="kits.overview.new"` anchor.
  - Gaps: None.
  - Evidence: docs/epics/kits_feature_breakdown.md:29

### 14) Implementation Slices

- Slice: Data scaffolding
  - Goal: Establish kit types, hooks (including dual-query hydration), debounce helper, and normalize generated payloads.
  - Touches: `src/types/kits.ts`, `src/hooks/use-kits.ts`, `src/lib/utils/debounce.ts`.
  - Dependencies: None; leverages generated hooks already in repo.

- Slice: Overview UI
  - Goal: Build kits overview component, cards, search, tabs, instrumentation, and route integration.
  - Touches: `src/components/kits/kit-overview-list.tsx`, `src/components/kits/kit-card.tsx`, `src/routes/kits/index.tsx`.
  - Dependencies: Data scaffolding.

- Slice: Lifecycle controls & toasts
  - Goal: Implement archive/unarchive controls with optimistic updates and undo toast support (including toast action instrumentation).
  - Touches: `src/components/kits/kit-archive-controls.tsx`, `src/components/ui/toast.tsx`, `src/contexts/toast-context-base.ts`, `src/lib/test/toast-instrumentation.ts`, `src/types/test-events.ts`.
  - Dependencies: Overview UI.

- Slice: Testing & navigation polish
  - Goal: Add kit factory, page object, nav updates, and Playwright specs using new instrumentation (including CTA navigation coverage).
  - Touches: `tests/api/factories/kit-factory.ts`, `tests/support/page-objects/kits-page.ts`, `tests/support/fixtures.ts`, `tests/e2e/shell/navigation.spec.ts`, `tests/e2e/kits/kits-overview.spec.ts`.
  - Dependencies: All prior slices.

### 15) Risks & Open Questions

- Risk: Undo toast actions may conflict if multiple kits are archived quickly, leading to mismatched optimistic states.
  - Impact: Cards could reappear in the wrong tab or duplicate toasts fire.
  - Mitigation: Store per-kit mutation tokens and ignore stale undo callbacks.

- Risk: Debounced query tied to router search could trigger redundant fetches when navigating via browser back/forward.
  - Impact: Extra network requests and flickering counts.
  - Mitigation: Compare previous params before refetch and leverage React Query cache warmups.

- Risk: Extending toast context with actions might break existing instrumentation or tests if signatures drift.
  - Impact: Toast-related tests fail or actionless toasts misbehave.
  - Mitigation: Maintain backward-compatible function overloads and assert instrumentation during development.

### 16) Confidence

Confidence: Medium — Patterns mirror existing list screens, but new toast action support and optimistic undo flows add moderate complexity that warrants validation.

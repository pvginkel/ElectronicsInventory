### 0) Research Log & Findings
- Confirmed kit detail slice requirements (route, header fields, disabled edit control, BOM columns, instrumentation scopes) in `docs/epics/kits_feature_breakdown.md:55`, `docs/epics/kits_feature_breakdown.md:57`, `docs/epics/kits_feature_breakdown.md:59`, `docs/epics/kits_feature_breakdown.md:68`.
- The detail view depends on overview navigation per `docs/epics/kits_feature_breakdown.md:72`, so existing kits cards remain the entry point.
- Architecture guide reiterates TanStack Router modules, domain-driven folders, and generated hook usage in `docs/contribute/architecture/application_overview.md:1`, `docs/contribute/architecture/application_overview.md:8`, `docs/contribute/architecture/application_overview.md:20`.
- Observed route wiring and shared layout shell via `src/routes/kits/index.tsx:1` and `src/components/layout/detail-screen-layout.tsx:31`, which we can mirror.
- Part detail demonstrates query instrumentation and error fallback handling to reuse in kits via `src/components/parts/part-details.tsx:145` and `src/components/parts/part-details.tsx:381`.
- Generated hook and schema expose kit detail payload and kit content math in `src/lib/api/generated/hooks.ts:838` and `src/lib/api/generated/types.ts:2893`; kits membership hook already emits scoped list-loading events in `src/hooks/use-kit-memberships.ts:340`.
- Kits overview card/test coverage show current navigation patterns and list-loading expectations in `src/components/kits/kit-card.tsx:1`, `tests/e2e/kits/kits-overview.spec.ts:1`, and instrumentation helpers highlighted in `docs/contribute/testing/playwright_developer_guide.md:85`.

### 1) Intent & Scope (1–3 short paragraphs)

**User intent**

Deliver a read-only kit workspace that mirrors other detail screens, surfaces availability math (including reservation breakdown), and stays wired into existing instrumentation.

**Prompt quotes**

"Introduce TanStack Router route `/kits/$kitId` rendering a detail layout with header and main content similar to `PartDetails`."  
"The “Edit kit” button is rendered disabled (tooltip explains archived gating will arrive later)."  
"Render a read-only BOM table showing Required, Total, In stock, Reserved, Available, and Shortfall columns sourced from backend aggregates."

**In scope**

- Register the `/kits/$kitId` TanStack Router file route and use the shared `DetailScreenLayout`.
- Fetch kit detail via generated hook, map data into domain-friendly structures, and surface shopping/pick counts plus build target chip.
- Implement read-only BOM table with required columns, empty/loading states, reservation tooltips, and other contextual hints.
- Surface per-row reservation breakdown using the `active_reservations` payload so planners can trace competing kits without leaving the page.
- Emit `useListLoadingInstrumentation` scopes `kits.detail` and `kits.detail.contents`, exposing deterministic `data-testid` handles.
- Update overview card to deep-link into the detail route and add Playwright coverage plus test-data helpers.

**Out of scope**

- Mutating flows (kit metadata editing, contents CRUD, linkage chips, archive toggles beyond existing overview controls).
- Additional backend endpoints or schema changes beyond consuming existing `GET /kits/{kit_id}`.
- Pick/shopping linkage UI beyond badge counts (those arrive in later features).

**Assumptions / constraints**

Backend `GET /kits/{kit_id}` already returns availability math (including `active_reservations`) as described in the OpenAPI schema; tests can create kit contents through existing API endpoints; overview navigation remains the primary entry, so no standalone menu item is needed.

### 2) Affected Areas & File Map (with repository evidence)

- Area: `src/routes/kits/$kitId/index.tsx`
- Why: Define the dynamic `/kits/$kitId` route and render the new detail component using the TanStack Router pattern from other kits routes.
- Evidence: `docs/epics/kits_feature_breakdown.md:55`, `src/routes/kits/index.tsx:1`

- Area: `src/components/kits/kit-detail.tsx`
- Why: Orchestrate query loading, instrumentation, header composition, and body content for the read-only workspace.
- Evidence: `docs/epics/kits_feature_breakdown.md:55`, `src/components/layout/detail-screen-layout.tsx:31`

- Area: `src/components/kits/kit-detail-header.tsx`
- Why: Encapsulate title, status badge placement, build-target chip styling, counts, and disabled edit button tooltip.
- Evidence: `docs/epics/kits_feature_breakdown.md:57`, `src/components/shopping-lists/detail-header-slots.tsx:151`

- Area: `src/components/kits/kit-bom-table.tsx`
- Why: Render the read-only BOM table with all required columns, loading skeleton, reservation tooltip trigger, and empty state messaging consistent with other tables.
- Evidence: `docs/epics/kits_feature_breakdown.md:59`, `src/components/shopping-lists/concept-table.tsx:60`

- Area: `src/hooks/use-kit-detail.ts`
- Why: Wrap `useGetKitsByKitId`, convert snake_case to camelCase, compute aggregates, and supply instrumentation metadata.
- Evidence: `src/lib/api/generated/hooks.ts:838`, `src/hooks/use-kits.ts:1`

- Area: `src/types/kits.ts`
- Why: Extend kit domain types with detail-specific models (kit detail, content row, reservation entry).
- Evidence: `src/lib/api/generated/types.ts:2893`

- Area: `src/components/kits/kit-card.tsx`
- Why: Add detail navigation affordance (card link/button) so overview satisfies the dependency on the read-only slice.
- Evidence: `docs/epics/kits_feature_breakdown.md:72`, `src/components/kits/kit-card.tsx:1`

- Area: `tests/support/page-objects/kits-page.ts`
- Why: Provide helpers to open a kit detail and assert card-level navigation instrumentation.
- Evidence: `tests/support/page-objects/kits-page.ts:1`, `docs/epics/kits_feature_breakdown.md:72`

- Area: `tests/support/page-objects/kit-detail-page.ts`
- Why: New page object for header assertions, table queries, and tooltip checks in Playwright.
- Evidence: `docs/contribute/testing/playwright_developer_guide.md:85`

- Area: `tests/support/fixtures.ts`
- Why: Register the kit detail page object in shared fixtures for specs.
- Evidence: `tests/support/fixtures.ts:1`

- Area: `tests/api/factories/kit-factory.ts`
- Why: Add helpers to seed kit contents, inventory, and competing kit reservations through existing endpoints for deterministic BOM assertions.
- Evidence: `src/lib/api/generated/hooks.ts:896`

- Area: `tests/api/index.ts`
- Why: Expose new kit content helpers to Playwright fixtures.
- Evidence: `tests/api/index.ts:1`

- Area: `tests/e2e/kits/kit-detail.spec.ts`
- Why: Implement deterministic Playwright coverage verifying header data, availability math, instrumentation scopes, and read-only controls.
- Evidence: `docs/epics/kits_feature_breakdown.md:68`, `tests/e2e/kits/kits-overview.spec.ts:1`

### 3) Data Model / Contracts

- Entity / contract: `KitDetail`
  - Shape: `{ id: number; name: string; description: string | null; status: 'active' | 'archived'; buildTarget: number; shoppingListBadgeCount: number; shoppingListLinks: KitShoppingListLink[]; pickListBadgeCount: number; pickLists: KitPickListSummary[]; archivedAt: string | null; updatedAt: string; contents: KitContentRow[] }`
  - Mapping: Derived from `KitDetailResponseSchema.b98797e` with snake_case fields mapped (`build_target → buildTarget`, `shopping_list_links → shoppingListLinks`, etc) and defaulting optional arrays to `[]` so linkage chips can plug in later slices without hook changes.
  - Evidence: `src/lib/api/generated/types.ts:2893`, `docs/epics/kits_feature_breakdown.md:63-66`

- Entity / contract: `KitContentRow`
  - Shape: `{ id: number; partId: number; part: PartSummary; requiredPerUnit: number; totalRequired: number; inStock: number; reserved: number; available: number; shortfall: number; version: number; note: string | null; activeReservations: ReservationEntry[] }`
  - Mapping: Pulls from `KitDetailResponseSchema.b98797e.KitContentDetailSchema`, ensuring numeric fields remain non-negative and nested `part` mapped to camelCase.
  - Evidence: `src/lib/api/generated/types.ts:2977`

- Entity / contract: `KitShoppingListLink`
  - Shape: `{ id: number; shoppingListId: number; name: string; status: 'concept' | 'ready' | 'done'; isStale: boolean; honorReserved: boolean; requestedUnits: number; snapshotKitUpdatedAt: string; updatedAt: string }`
  - Mapping: Uses `KitDetailResponseSchema.b98797e.KitShoppingListLinkSchema`, camelCasing keys such as `shopping_list_id → shoppingListId` and `is_stale → isStale`.
  - Evidence: `src/lib/api/generated/types.ts:3209`

- Entity / contract: `KitPickListSummary`
  - Shape: `{ id: number; status: 'open' | 'completed'; lineCount: number; openLineCount: number; completedLineCount: number; totalQuantityToPick: number; pickedQuantity: number; remainingQuantity: number; requestedUnits: number; updatedAt: string }`
  - Mapping: Pulls from `KitDetailResponseSchema.b98797e.KitPickListSummarySchema`, mirroring existing pick list overview data and camelCasing numeric fields.
  - Evidence: `src/lib/api/generated/types.ts:3076`

- Entity / contract: Instrumentation metadata
  - Shape: `{ scope: 'kits.detail' | 'kits.detail.contents'; metadata: { kitId: number; status?: string; contentCount?: number; available?: number; total?: number; shortfallCount?: number } }`
  - Mapping: Computed inside `useKitDetail` using React Query status and aggregated content fields so payload keys match the documented testing contract.
  - Evidence: `docs/epics/kits_feature_breakdown.md:67-69`, `src/components/parts/part-details.tsx:145`

### 4) API / Integration Surface

- Surface: `GET /api/kits/{kit_id}` via `useGetKitsByKitId`
- Inputs: `{ path: { kit_id: number } }` from router param; optional React Query options (`enabled`, `staleTime`) passed by the custom hook.
- Outputs: `KitDetailResponseSchema` data cached under `['getKitsByKitId', params]`, used to populate header and contents table.
- Errors: 404 surfaces as `ApiError`—component renders not-found card; other errors show instrumentation `error` phase and rely on global toast already wired through generated hooks.
- Evidence: `src/lib/api/generated/hooks.ts:838`, `src/components/parts/part-details.tsx:381`

### 5) Algorithms & UI Flows (step-by-step)

- Flow: Load kit detail route
  - Steps:
    1. Extract `kitId` from TanStack Router params and call `useKitDetail(kitId)`.
    2. While the query is pending, render layout with header skeleton and table shimmer.
    3. On success, pass mapped detail data into header/table components and emit instrumentation metadata.
    4. On error, show not-found/failure card, keep instrumentation consistent, and surface retry via `refetch`.
  - States / transitions: React Query statuses (`pending`, `success`, `error`); route transitions handled by TanStack Router.
  - Hotspots: Avoid re-computing aggregates on every render by memoizing `contents`.
  - Evidence: `docs/epics/kits_feature_breakdown.md:55`, `src/lib/api/generated/hooks.ts:838`

- Flow: Render kit header
  - Steps:
    1. Build breadcrumbs back to `/kits` (preserving current search tab if available).
    2. Render title row with status badge positioned immediately after kit name.
    3. Show optional description, build-target badge styled after shopping list total badges, and counts for linked lists.
    4. Render disabled `Edit kit` button with tooltip copy and ensure archived status mirrors overview state.
  - States / transitions: header swaps between skeleton and hydrated view; tooltip is always available but button disabled.
  - Hotspots: Keep tooltip accessible by using `aria-disabled` to avoid focus traps.
  - Evidence: `docs/epics/kits_feature_breakdown.md:57`, `src/components/shopping-lists/detail-header-slots.tsx:181`

- Flow: Render BOM table
  - Steps:
    1. Map `detail.contents` to table rows with formatted values and highlight shortfall rows.
    2. Attach a hover/focus tooltip per row presenting `active_reservations` entries (kit name, reserved quantity, build target) when present, rendering the full list in backend order with scroll to handle overflow.
    3. When contents empty, show inline message guiding future editing slice.
    4. Ensure reserved/available columns include helper text and reservation tooltip trigger while avoiding layout shifts.
  - States / transitions: switch between loading skeleton, empty state, and populated table.
  - Hotspots: Large kits could produce many rows—use `React.memo`/`useMemo` to avoid recalculating formatting and debounce tooltip rendering for long reservation lists.
  - Evidence: `docs/epics/kits_feature_breakdown.md:59`, `src/components/shopping-lists/concept-table.tsx:60`

- Flow: Navigate from overview card to detail
  - Steps:
    1. Add `Link` (or button) on kit card pointing to `/kits/$kitId` with appropriate params.
    2. Preserve current search tab via router search state to support "back" use cases.
    3. Playwright clicks the link, waits for `kits.detail` ready event, then asserts header/table.
  - States / transitions: Router handles navigation; instrumentation ensures tests wait for data.
  - Hotspots: Ensure click target does not conflict with archive controls.
  - Evidence: `docs/epics/kits_feature_breakdown.md:72`, `tests/e2e/kits/kits-overview.spec.ts:87`

### 6) Derived State & Invariants

- Derived value: `isArchived`
  - Source: `detail.status` from query payload (`'archived'` vs `'active'`).
  - Writes / cleanup: Determines disabled state of `Edit kit` action and potential header tooltip copy.
  - Guards: Default to `false` when payload missing; ensure button never enables in read-only slice.
  - Invariant: Archived kits must never expose editable affordances in this slice.
  - Evidence: `docs/epics/kits_feature_breakdown.md:57`

- Derived value: `contentAggregates`
  - Source: Reduce `detail.contents` to totals for required, available, shortfall counts for instrumentation metadata.
  - Writes / cleanup: Feeds `kits.detail.contents` `getReadyMetadata` and optional summary UI.
  - Guards: Clamp numeric sums to `>= 0` to avoid negative display due to upstream rounding.
  - Invariant: Shortfall totals cannot be negative; instrumentation must mirror table numbers.
  - Evidence: `docs/epics/kits_feature_breakdown.md:68`, `src/lib/api/generated/types.ts:2977`

- Derived value: `rowsWithShortfall`
  - Source: Filter `detail.contents` where `shortfall > 0`.
  - Writes / cleanup: Adds row-level styling/test IDs and increments instrumentation `shortfallCount`.
  - Guards: Skip during loading; ensure fallback arrays avoid null pointer access.
  - Invariant: Highlighting must match computed shortfall to keep tests deterministic.
  - Evidence: `docs/epics/kits_feature_breakdown.md:59`

- Derived value: `reservationDetails`
  - Source: `content.active_reservations` array per row from backend payload.
  - Writes / cleanup: Feeds tooltip component and optional badge count; cleared when array empty.
  - Guards: Render the full reservation list (use scrollable container for very long lists) while preserving backend order.
  - Invariant: Tooltip list must reflect backend order/quantities so testers can assert specific kits.
  - Evidence: `src/lib/api/generated/types.ts:3191`

- Derived value: `kitBreadcrumbSearch`
  - Source: Router search state from overview (status/search) passed via link params.
  - Writes / cleanup: Preserves query string when navigating back to overview.
  - Guards: Default to active tab if search state missing.
  - Invariant: Back navigation should land user in prior context.
  - Evidence: `src/routes/kits/index.tsx:15`

### 7) State Consistency & Async Coordination

- Source of truth: React Query cache for `['getKitsByKitId', { path: { kit_id } }]`.
- Coordination: `useKitDetail` memoizes mapped data so header/table receive stable references; routing search state stored via TanStack Router navigate helpers.
- Async safeguards: Rely on React Query cancellation when `kitId` changes; provide `enabled` guard only when param present.
- Instrumentation: Call `useListLoadingInstrumentation` twice (main + contents) mirroring patterns from parts detail to keep Playwright waits deterministic.
- Evidence: `src/lib/api/generated/hooks.ts:838`, `src/components/parts/part-details.tsx:145`

### 8) Errors & Edge Cases

- Failure: Kit not found (404) or forbidden
  - Surface: Detail screen main content
  - Handling: Render card with “Kit not found” messaging and optional “Return to Kits” button; keep `kits.detail` instrumentation in `error` state for tests.
  - Guardrails: Check for `error` or `!detail` before rendering header/table.
  - Evidence: `src/components/parts/part-details.tsx:381`

- Failure: Contents array empty
  - Surface: BOM table component
  - Handling: Show bordered empty state with copy linking upcoming edit slice; instrumentation marks ready with `contentCount: 0`.
  - Guardrails: Avoid dividing by zero when summarizing totals.
  - Evidence: `docs/epics/kits_feature_breakdown.md:59`

- Failure: Reserved/available values unexpectedly negative
  - Surface: Row formatting logic
  - Handling: Clamp to zero in mapping, display tooltip noting data issue if mismatch persists.
  - Guardrails: Add assertion/log in development to surface backend issues early.
  - Evidence: `src/lib/api/generated/types.ts:2977`

### 9) Observability / Instrumentation

- Signal: `kits.detail`
  - Type: `list_loading` test event
  - Trigger: Invoked from `useKitDetail` instrumentation when primary query loads, succeeds, errors, or aborts.
  - Labels / fields: `{ kitId, status, contentCount }` on success; `{ kitId, message }` on error.
  - Consumer: `waitForListLoading` helper in Playwright specs.
  - Evidence: `docs/epics/kits_feature_breakdown.md:68`, `src/lib/test/query-instrumentation.ts:125`

- Signal: `kits.detail.contents`
  - Type: `list_loading` test event
  - Trigger: Emitted after deriving aggregates from contents.
  - Labels / fields: `{ kitId, available, total, shortfallCount }` on success.
  - Consumer: Playwright spec verifying availability math.
  - Evidence: `docs/epics/kits_feature_breakdown.md:68`, `src/hooks/use-kit-memberships.ts:340`

- Signal: `data-testid` handles (`kits.detail.header`, `kits.detail.table`, `kits.detail.table.row.<id>`)
  - Type: DOM attributes
  - Trigger: Rendered with header/table components for deterministic selectors.
  - Labels / fields: Row IDs embed kit content ID; summary badges include `data-testid="kits.detail.badge.build-target"`; reservation trigger uses `data-testid="kits.detail.table.row.<id>.reservations"`.
  - Consumer: Playwright locators and potential future analytics taps.
  - Evidence: `tests/support/helpers.ts:27`

### 10) Lifecycle & Background Work

- Hook / effect: React Query fetch for kit detail
  - Trigger cadence: On mount and whenever `kitId` param changes; revalidates on window focus per default query client.
  - Responsibilities: Fetch kit detail data, cache result, expose status for instrumentation.
  - Cleanup: React Query automatically cancels outdated requests; no manual teardown needed.
  - Evidence: `src/lib/api/generated/hooks.ts:838`

### 11) Security & Permissions (if applicable)

- Concern: Read-only enforcement for archived or unimplemented edit flows
  - Touchpoints: Disabled `Edit kit` button in header, absence of mutation controls in BOM table.
  - Mitigation: Hard-disable button with tooltip copy; omit mutation affordances entirely until later slices.
  - Residual risk: Users could still call APIs directly—server continues to enforce archived gating.
  - Evidence: `docs/epics/kits_feature_breakdown.md:57`

### 12) UX / UI Impact (if applicable)

- Entry point: `/kits/$kitId`
  - Change: New detail layout mirroring `PartDetails` with kit-specific header, badges, and read-only table.
  - User interaction: Clicking a kit opens detail view; edit button visibly disabled with contextual tooltip; table communicates availability at a glance.
  - Dependencies: Shared layout component, generated API hook, Tailwind utility classes for badges.
  - Evidence: `docs/epics/kits_feature_breakdown.md:55`, `src/components/layout/detail-screen-layout.tsx:31`

### 13) Deterministic Test Plan (new/changed behavior only)

- Surface: Kit detail view
  - Scenarios:
    - Given an active kit with contents exists, When a user clicks its card, Then the detail header shows name, status badge placement, build-target chip, and disabled edit control.
    - Given the same kit, When the detail table loads, Then each row shows Required, Total, In stock, Reserved, Available, Shortfall values matching backend data and highlights shortfall rows.
    - Given a row with active reservations, When the reservation indicator is hovered or focused, Then the tooltip lists each reserving kit with reserved quantity and build target in backend order.
    - Given instrumentation is active, When the route loads, Then `waitForListLoading` receives `kits.detail` and `kits.detail.contents` `ready` events with matching totals.
    - Given a kit with no contents exists, When the detail view loads, Then the empty-state message renders and `kits.detail.contents` reports `{ kitId, available: 0, total: 0, shortfallCount: 0 }`.
  - Instrumentation / hooks: `waitForListLoading`, new page object locators (`kits.detail.*`), kit factory helper to seed contents/inventory/reservations, tooltip helper to assert reservation list.
  - Evidence: `docs/contribute/testing/playwright_developer_guide.md:85`, `tests/e2e/kits/kits-overview.spec.ts:20`, `docs/features/kit_detail_workspace/plan.md:214-217`

### 14) Implementation Slices (only if large)

- Slice: Data & types foundation
  - Goal: Introduce `useKitDetail`, domain types, and ensure query returns mapped data with instrumentation metadata.
  - Touches: `src/hooks/use-kit-detail.ts`, `src/types/kits.ts`, `src/lib/api/generated` imports.
  - Dependencies: None.

- Slice: Detail route & header shell
  - Goal: Wire TanStack Router file, render layout, loading/error states, and header component with badges/tooltips.
  - Touches: `src/routes/kits/$kitId/index.tsx`, `src/components/kits/kit-detail.tsx`, `src/components/kits/kit-detail-header.tsx`.
  - Dependencies: Data slice.

- Slice: BOM table & navigation
  - Goal: Implement table component, reservation tooltip, add detail navigation to kit card, ensure instrumentation values align.
  - Touches: `src/components/kits/kit-bom-table.tsx`, `src/components/kits/kit-card.tsx`, instrumentation wiring.
  - Dependencies: Header slice.

- Slice: Playwright & test-data support
  - Goal: Add kit detail page object, fixture, deterministic spec, and kit factory helpers for contents/reservations seeding.
  - Touches: `tests/support/page-objects`, `tests/support/fixtures.ts`, `tests/api/factories/kit-factory.ts`, `tests/e2e/kits/kit-detail.spec.ts`.
  - Dependencies: UI slices complete to validate selectors.

### 15) Risks & Open Questions

- Risk: Seeding kit contents with precise inventory demands new helpers; mistakes could make Playwright assertions flaky.
  - Impact: Tests fail intermittently or rely on brittle magic numbers.
  - Mitigation: Extend kit factory to create parts with deterministic stock levels before attaching to kit.

- Risk: Large kits may degrade render performance if table rows recompute formatting every render.
  - Impact: Noticeable lag scrolling detail view.
  - Mitigation: Memoize mapped rows and keep table stateless; consider virtualization later if needed.

- Risk: Instrumentation metadata drifting from displayed totals could break deterministic waits.
  - Impact: Playwright waits hang or assert incorrect values.
  - Mitigation: Centralize aggregate computation in hook and reuse for both UI and instrumentation.

- Risk: Reservation tooltip may overflow for kits with many competing reservations.
  - Impact: Tooltip becomes unreadable or causes layout issues.
  - Mitigation: Clamp visible entries with “+N more” summary and consider modal fallback if requirements expand.

### 16) Confidence (one line)

Confidence: Medium — Scope is well defined, with complexity primarily in rendering reservation tooltips and seeding deterministic test data.

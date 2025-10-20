# Kit Detail & BOM Management Plan

### 0) Research Log & Findings
- Reviewed the kit detail requirements covering header summary, computed availability columns, and BOM mutation rules to scope UI responsibilities (docs/epics/kits_feature_breakdown.md:55).
- Revisited the application architecture to align new hooks, types, and query usage with the React 19 + TanStack stack and camelCase adapters (docs/contribute/architecture/application_overview.md:5).
- Consulted detail/list UI conventions to reuse `DetailScreenLayout`, skeleton patterns, and mandated `useListLoadingInstrumentation` hooks (docs/contribute/ui/data_display.md:14).
- Confirmed instrumentation and testing expectations, including mandatory feature-owned Playwright specs and deterministic event waits (docs/contribute/testing/index.md:5, docs/contribute/testing/playwright_developer_guide.md:10, docs/contribute/architecture/test_instrumentation.md:14).
- Studied `PartDetails` for detail layout, instrumentation wiring, and not-found fallbacks we can emulate (src/components/parts/part-details.tsx:145, src/components/parts/part-details.tsx:689).
- Looked at current kits overview instrumentation and membership fetch patterns to ensure new scopes stay consistent (src/components/kits/kit-overview-list.tsx:76, src/hooks/use-kit-memberships.ts:340).
- Audited generated hooks for kit detail, metadata updates, and kit content CRUD to plan React Query integration (src/lib/api/generated/hooks.ts:838).
- Reviewed part selection helpers for reusing the searchable selector in BOM forms (src/components/parts/part-selector.tsx:67, src/hooks/use-parts-selector.ts:62).
- Checked existing kits Playwright coverage and page object capabilities to extend them for detail scenarios (tests/e2e/kits/kits-overview.spec.ts:1, tests/support/page-objects/kits-page.ts:7).
- Inspected the kit test factory to understand current seeding helpers and identify gaps for BOM content creation (tests/api/factories/kit-factory.ts:26).
- Noted that `KitCard` currently renders a static card without navigation, so we must add an affordance to reach the new detail workspace (src/components/kits/kit-card.tsx:120, src/components/kits/kit-overview-list.tsx:240).

### 1) Intent & Scope

**User intent**

Design and implement the kit detail workspace so planners can inspect kit metadata, manage the bill of materials, and rely on computed availability directly inside the frontend.

**Prompt quotes**

"Display name, description, and build target in the header; expose an “Edit kit” trigger ... while the kit is active, and disable the trigger for archived kits." (docs/epics/kits_feature_breakdown.md:55)  
"Enable inline add/edit/delete rows with validation for integer quantities and duplicate part protection." (docs/epics/kits_feature_breakdown.md:70)

**In scope**

- Surface a `/kits/$kitId` detail route with header summary, status badges, and computed availability columns.
- Build a BOM table with client-side filtering, inline add/edit/delete flows, and instrumentation-backed optimistic updates.
- Provide a modal to edit kit metadata while respecting archived read-only rules.
- Extend instrumentation and Playwright coverage (page objects + specs) to exercise the new UI and mutations.

**Out of scope**

- Shopping list linking workflows and pick-list execution flows covered by later features (linked shopping/pick list chips remain deferred per epic note).
- Backend schema or API changes; rely on the delivered endpoints and generated client.
- Global navigation or sidebar adjustments (already handled in the overview slice).

**Assumptions / constraints**

Backend endpoints and OpenAPI hooks already expose detail, content, and metadata operations; optimistic locking via `version` is authoritative; tests must hit the real backend without request interception; detail UI should remain responsive for medium BOM sizes without virtualisation.

### 2) Affected Areas & File Map

- Area: src/routes/kits/$kitId.tsx
  - Why: Provide the TanStack Router layout wrapper with an `<Outlet>` for the kit detail sub-route, mirroring other entity routes.
  - Evidence: src/routes/parts/$partId.tsx:1

- Area: src/routes/kits/$kitId/index.tsx
  - Why: Load route params and render the new `KitDetail` component as the default child route.
  - Evidence: src/routes/parts/$partId/index.tsx:1

- Area: src/components/kits/kit-detail.tsx
  - Why: Compose the detail workspace with `DetailScreenLayout`, header metadata, instrumentation, and content sections.
  - Evidence: docs/epics/kits_feature_breakdown.md:55, src/components/parts/part-details.tsx:689

- Area: src/components/kits/kit-content-table.tsx
  - Why: Render the BOM grid with computed columns (Required/Total/In stock/Reserved/Shortfall) and selection states.
  - Evidence: docs/epics/kits_feature_breakdown.md:56

- Area: src/components/kits/kit-content-row.tsx
  - Why: Present individual BOM rows with action affordances, notes, and availability indicators.
  - Evidence: docs/epics/kits_feature_breakdown.md:56

- Area: src/components/kits/kit-content-form.tsx
  - Why: Implement inline create/edit forms with validation, instrumentation, and part selector integration.
  - Evidence: docs/epics/kits_feature_breakdown.md:70, src/hooks/use-form-instrumentation.ts:52

- Area: src/components/kits/kit-content-toolbar.tsx
  - Why: Provide search/filter controls, counts, and an “Add part” entry point per detail filtering requirements.
  - Evidence: docs/epics/kits_feature_breakdown.md:57, docs/contribute/ui/data_display.md:8

- Area: src/components/kits/kit-metadata-dialog.tsx
  - Why: Allow active kits to update name/description/build target via a modal, emitting form telemetry.
  - Evidence: docs/epics/kits_feature_breakdown.md:55, src/hooks/use-form-instrumentation.ts:52

- Area: src/components/kits/kit-card.tsx
  - Why: Add navigation affordance (e.g., wrapping title/card with a `<Link>`) so users can open the detail screen from the overview.
  - Evidence: src/components/kits/kit-card.tsx:120

- Area: src/components/kits/kit-overview-list.tsx
  - Why: Wire the new navigation target when rendering cards and preserve existing instrumentation/search behaviour.
  - Evidence: src/components/kits/kit-overview-list.tsx:240

- Area: src/types/kits.ts
  - Why: Extend kit domain types with `KitDetail`, `KitContentRow`, `KitShoppingListLink`, and helper mappers.
  - Evidence: src/types/kits.ts:1, docs/contribute/architecture/application_overview.md:32

- Area: src/hooks/use-kit-detail.ts
  - Why: Wrap `useGetKitsByKitId`, map payloads to camelCase domain models, expose derived metadata, and handle instrumentation helpers.
  - Evidence: src/lib/api/generated/hooks.ts:838, src/hooks/use-shopping-lists.ts:618

- Area: src/hooks/use-kit-content-mutations.ts
  - Why: Centralise create/update/delete mutations with optimistic cache updates, version handling, and form telemetry.
  - Evidence: src/lib/api/generated/hooks.ts:896, src/components/kits/kit-archive-controls.tsx:112

- Area: src/lib/utils/kits.ts
  - Why: Share helpers for computing totals/shortfalls and instrumentation payload derivation from kit content rows.
  - Evidence: docs/epics/kits_feature_breakdown.md:61

- Area: tests/api/factories/kit-factory.ts
  - Why: Add helpers to seed kit contents (create/update) for deterministic Playwright setup.
  - Evidence: tests/api/factories/kit-factory.ts:26

- Area: tests/support/page-objects/kits-page.ts
  - Why: Extend the page object with detail locators/actions (header, BOM rows, filters, modals).
  - Evidence: tests/support/page-objects/kits-page.ts:7

- Area: tests/e2e/kits/kits-detail.spec.ts
  - Why: Add Playwright coverage for detail loading, metadata edits, BOM CRUD, and archived read-only behaviour.
  - Evidence: docs/contribute/testing/index.md:5

### 3) Data Model / Contracts

- Entity / contract: KitDetail
  - Shape: `{ id, name, description, status, buildTarget, archivedAt, updatedAt, shoppingListBadgeCount, pickListBadgeCount, contents: KitContentRow[], shoppingListLinks: KitShoppingListLink[], pickLists: KitPickListSummary[] }`
  - Mapping: Map from `KitDetailResponseSchema_b98797e`, converting snake_case fields, coercing nullables, and sorting contents.
  - Evidence: src/lib/api/generated/types.ts:2904

- Entity / contract: KitContentRow
  - Shape: `{ id, kitId, partId, partKey, partDescription, requiredPerUnit, totalRequired, inStock, reserved, available, shortfall, note, version, createdAt, updatedAt, activeReservations: KitReservationEntry[] }`
  - Mapping: Adapt `KitDetailResponseSchema_b98797e.KitContentDetailSchema` and compute helper booleans (e.g., `hasShortfall`).
  - Evidence: src/lib/api/generated/types.ts:2984

- Entity / contract: KitShoppingListLink
  - Shape: `{ id, shoppingListId, shoppingListName, status, requestedUnits, honorReserved, isStale, snapshotKitUpdatedAt, createdAt, updatedAt }`
  - Mapping: Map link schema to camelCase, exposing stale status for UI badges.
  - Evidence: src/lib/api/generated/types.ts:3210

- Entity / contract: KitPickListSummary
  - Shape: `{ id, status, requestedUnits, lineCount, openLineCount, completedLineCount, totalQuantityToPick, pickedQuantity, remainingQuantity, createdAt, updatedAt, completedAt }`
  - Mapping: Pass-through mapping for read-only summary chips.
  - Evidence: src/lib/api/generated/types.ts:3068

- Entity / contract: KitContentFormInput
  - Shape: `{ partId, requiredPerUnit, note, version? }`
  - Mapping: Build payloads for `KitContentCreateSchema` / `KitContentUpdateSchema`, ensuring integers and optimistic version inclusion.
  - Evidence: src/lib/api/generated/types.ts:2669

### 4) API / Integration Surface

- Surface: GET /api/kits/{kit_id} via `useGetKitsByKitId`
  - Inputs: `{ path: { kit_id } }` from route param.
  - Outputs: Kit detail payload mapped into `KitDetail`.
  - Errors: Display not-found or error card; emit `list_loading` error metadata.
  - Evidence: src/lib/api/generated/hooks.ts:838

- Surface: PATCH /api/kits/{kit_id} via `usePatchKitsByKitId`
  - Inputs: `{ path: { kit_id }, body: { name?, description?, build_target? } }`.
  - Outputs: Updated kit summary; refresh detail + overview caches.
  - Errors: Inline validation (required strings, numeric bounds) and toast on failure.
  - Evidence: src/lib/api/generated/hooks.ts:854, src/lib/api/generated/types.ts:4654

- Surface: POST /api/kits/{kit_id}/contents via `usePostKitsContentsByKitId`
  - Inputs: `{ path: { kit_id }, body: { part_id, required_per_unit, note? } }` from form.
  - Outputs: New content row; merge into cached detail and invalidate backend queries.
  - Errors: Duplicate/validation errors surfaced inline and via `query_error` instrumentation.
  - Evidence: src/lib/api/generated/hooks.ts:896

- Surface: PATCH /api/kits/{kit_id}/contents/{content_id}` via `usePatchKitsContentsByKitIdAndContentId`
  - Inputs: `{ path: { kit_id, content_id }, body: { required_per_unit?, note?, version } }`.
  - Outputs: Updated row with refreshed availability numbers.
  - Errors: 409 conflicts trigger refetch + inline guidance; other errors raise toasts.
  - Evidence: src/lib/api/generated/hooks.ts:938, src/lib/api/generated/types.ts:2858

- Surface: DELETE /api/kits/{kit_id}/contents/{content_id}` via `useDeleteKitsContentsByKitIdAndContentId`
  - Inputs: `{ path: { kit_id, content_id } }`.
  - Outputs: No body; remove row locally and revalidate detail query.
  - Errors: Toast and `query_error` event on failure.
  - Evidence: src/lib/api/generated/hooks.ts:917

- Surface: GET /api/parts via `useGetParts` (through `usePartsSelector`)
  - Inputs: none; leveraged inside part selector for BOM forms.
  - Outputs: Searchable list of parts with totals and metadata.
  - Errors: Selector displays inline load error and instrumentation scope `parts.selector`.
  - Evidence: src/hooks/use-parts-selector.ts:62

### 5) Algorithms & UI Flows

- Flow: Load kit detail & emit instrumentation
  - Steps:
    1. Resolve `kitId` from route params and invoke `useKitDetail` (wraps `useGetKitsByKitId`).
    2. While loading, show skeleton placeholders; on success, map to `KitDetail` and derive filtered rows/counts.
    3. Render `DetailScreenLayout` with header metadata, badges, and toolbar.
    4. Call `useListLoadingInstrumentation` with scope `kits.detail`, including kit id, status, and content counts in metadata.
  - States / transitions: Loading → ready/error/aborted; data refresh after mutations invalidates query and replays instrumentation.
  - Hotspots: Ensure the detail view handles stale kit IDs when navigating quickly and avoids rendering empty states before data arrives.
  - Evidence: src/lib/api/generated/hooks.ts:838, src/components/parts/part-details.tsx:145, src/components/layout/detail-screen-layout.tsx:65, docs/contribute/ui/data_display.md:14

- Flow: Edit kit metadata (active kits only)
  - Steps:
    1. Enable “Edit kit” button when `kit.status === 'active'`; clicking opens modal with current values.
    2. Use `useFormInstrumentation` (form id `KitDetail:metadata`) to emit open/submit/success/error events.
    3. On submit, call `usePatchKitsByKitId`, disable controls during mutation, and optimistically update cached detail.
    4. On success, close modal, show toast, and invalidate overview queries so card badges refresh.
  - States / transitions: Modal open/closed, mutation pending, ready; archived kits leave button disabled with tooltip.
  - Hotspots: Validate numbers ≥1 and clamp whitespace, ensuring toasts and instrumentation metadata include kit id.
  - Evidence: docs/epics/kits_feature_breakdown.md:55, src/lib/api/generated/hooks.ts:854, src/hooks/use-form-instrumentation.ts:52

- Flow: Manage BOM rows (add/edit/delete)
  - Steps:
    1. “Add part” opens inline row editor using `PartSelector`; validation ensures integer ≥1 and disables selector options (and inline errors) for parts already present in the kit so duplicates never submit.
    2. On create, call `usePostKitsContentsByKitId`, append row to local cache, refetch detail for server-calculated availability, and emit `KitContent:create` form events.
    3. Editing an existing row toggles it into form mode with current version; submit PATCH with latest version, handling 409 by refetching and showing guidance.
    4. Delete prompts confirmation (using existing `ConfirmDialog`), calls DELETE mutation, and removes row from cache.
  - States / transitions: Each row toggles between view/edit; maintain `activeRowId` to avoid concurrent edits; track per-row pending status.
  - Hotspots: Ensure optimistic operations update `total_required`/`shortfall` placeholders until fresh data arrives; guard against stale selector values and ensure duplicate guard updates when cache refetches.
  - Evidence: docs/epics/kits_feature_breakdown.md:70, src/lib/api/generated/hooks.ts:896, src/hooks/use-parts-selector.ts:62

- Flow: Client-side filtering and instrumentation metadata
  - Steps:
    1. Capture filter text (debounced) and compute `filteredContents` by matching part description, key, or note.
    2. Surface counts (visible vs total, shortfall count) in toolbar and emit `kits.detail.toolbar` via `useUiStateInstrumentation` with the latest `filterSnapshot` payload.
    3. Keep search state local to detail screen while resetting highlight when filters clear.
  - States / transitions: Filter text updates recompute derived arrays; instrumentation should emit when readiness changes.
  - Hotspots: Avoid expensive recalculations by memoising content arrays; ensure empty states differentiate “no results” vs “no contents”; guard against duplicate emissions when metadata unchanged.
  - Evidence: docs/epics/kits_feature_breakdown.md:57, docs/contribute/ui/data_display.md:8

### 6) Derived State & Invariants

- Derived: filteredContents
  - Description: Array of BOM rows matching search tokens (part description, key, note).
  - Lifecycle: Recomputed when filter term or raw contents change; memoised to avoid unnecessary renders.
  - Guardrails: Trim search text, case-insensitive match, and ensure it resets when kit id changes.
  - Evidence: docs/epics/kits_feature_breakdown.md:57

- Derived: availabilitySnapshot
  - Description: Summary object (`totalRequired`, `available`, `shortfallCount`, `partsWithShortfall`) representing the **full** kit contents and feeding toolbar badges plus backend-aligned instrumentation.
  - Lifecycle: Derived from the unfiltered contents array whenever the detail query resolves or a mutation refetch completes.
  - Guardrails: Use zero-safe math, clamp negative availability to zero per backend contract, and ensure values stay in sync with server aggregates after each refetch.
  - Evidence: docs/epics/kits_feature_breakdown.md:61

- Derived: isReadOnly
  - Description: Boolean indicating whether metadata/BOM mutations are disabled (kit archived or awaiting mutation).
  - Lifecycle: Computed from kit status and local pending flags.
  - Guardrails: Prevents submit handlers from firing and ensures UI matches backend archived rule.
  - Evidence: docs/epics/kits_feature_breakdown.md:55

- Derived: conflictState
  - Description: Tracks when a row hits a version conflict to show guidance and trigger refetch before re-enabling edit.
  - Lifecycle: Set on mutation error with 409, cleared after refetch completes.
  - Guardrails: Avoids repeating stale submissions and ensures instrumentation emits `error` phase.
  - Evidence: docs/epics/kits_feature_breakdown.md:80

- Derived: filterSnapshot
  - Description: Metadata payload combining `availabilitySnapshot` totals (`totalRequired`, `available`, `shortfallCount`) with filter-specific fields (`filteredCount`, `filteredShortfall`).
  - Lifecycle: Recomputed whenever filter text, contents, or availability snapshot changes.
  - Guardrails: Must reference `availabilitySnapshot` for authoritative totals and avoid emitting stale counts after rapid filter toggles.
  - Evidence: docs/epics/kits_feature_breakdown.md:57, docs/contribute/architecture/test_instrumentation.md:35

### 7) State Consistency & Async Coordination

- Source of truth: React Query cache keyed by `['getKitsByKitId', kitId]` plus derived local state (`filteredContents`, `availabilitySnapshot`, `filterSnapshot`, pending row ids).
- Coordination: Mutations update the cached kit detail via `queryClient.setQueryData`, then invalidate related overview queries so badge counts stay in sync across screens (pattern borrowed from kit archive controls).
- Async safeguards: Cancel in-flight detail queries before optimistic updates, include `version` in payloads, and refetch after optimistic changes to replace placeholders with authoritative availability.
- Instrumentation: `useListLoadingInstrumentation` scopes `kits.detail`/`kits.detail.contents`; `useUiStateInstrumentation` emits `ui_state` events under `kits.detail.toolbar` whenever `filterSnapshot` changes; `useFormInstrumentation` emits `KitDetail:metadata` and `KitContent:*` events for Playwright waits.
  - Evidence: src/lib/api/generated/hooks.ts:838, src/components/kits/kit-archive-controls.tsx:112, src/lib/test/query-instrumentation.ts:146, src/lib/test/ui-state.ts:48, src/hooks/use-form-instrumentation.ts:52

### 8) Errors & Edge Cases

- Failure: Kit fetch returns 404 or network error
  - Surface: `KitDetail` component
  - Handling: Show not-found card with kit id, emit `kits.detail` list_loading error, and provide retry CTA.
  - Guardrails: Keep instrumentation in sync even when detail is missing.
  - Evidence: src/components/parts/part-details.tsx:360

- Failure: BOM create/update violates validation (non-positive quantity or duplicate part)
  - Surface: Inline content form
  - Handling: Display inline field errors, disable duplicate options client-side, emit `validation_error` form events, and prevent mutation submission.
  - Guardrails: Disable submit until fields valid; backend remains a final guard but UI blocks duplicates before calling mutations.
  - Evidence: docs/epics/kits_feature_breakdown.md:70, docs/epics/kits_feature_breakdown.md:118

- Failure: Optimistic locking conflict (stale version)
  - Surface: Inline edit form
  - Handling: Catch 409, show toast/link asking user to refresh, refetch detail, and re-open row with fresh data.
  - Guardrails: Emit `KitContent:update` error event and call `expectConflictError` in tests.
  - Evidence: docs/epics/kits_feature_breakdown.md:80, tests/support/helpers.ts:113

- Failure: Part selector query fails
  - Surface: Part selector popover
  - Handling: Reuse existing selector error message and instrumentation to prompt retry.
  - Guardrails: Disable save until selector resolves successfully.
  - Evidence: src/components/parts/part-selector.tsx:101

### 9) Observability / Instrumentation

- Signal: kits.detail
  - Type: list_loading
  - Trigger: Detail query load/settle cycles; includes `{ kitId, status, contentCount, filteredCount }`.
  - Labels / fields: `kitId`, `status`, `contentCount`, `filteredCount`.
  - Consumer: `waitForListLoading(page, 'kits.detail', ...)`.
  - Evidence: src/lib/test/query-instrumentation.ts:146

- Signal: kits.detail.contents
  - Type: list_loading
  - Trigger: When BOM rows finish loading or refetching after mutations.
  - Labels / fields: `visible`, `shortfallCount`, `total`.
  - Consumer: Playwright waits before asserting table rows.
  - Evidence: src/lib/test/query-instrumentation.ts:146

- Signal: KitDetail:metadata
  - Type: form
  - Trigger: Modal open/submit/success/error with payload `{ kitId, buildTarget }`.
  - Labels / fields: `kitId`, `buildTarget`, `phase`.
  - Consumer: `waitTestEvent` in metadata spec.
  - Evidence: src/hooks/use-form-instrumentation.ts:52

- Signal: KitContent:create / KitContent:update / KitContent:delete
  - Type: form
  - Trigger: Inline row create/update/delete flows with metadata `{ kitId, contentId?, partKey }`.
  - Labels / fields: `kitId`, `contentId`, `partKey`, `phase`.
  - Consumer: Playwright ensures optimistic path and conflict handling.
  - Evidence: src/hooks/use-form-instrumentation.ts:52

- Signal: kits.detail.toolbar
  - Type: ui_state
  - Trigger: Whenever `filterSnapshot` updates (initial load, filter change, mutation refetch) emit aggregated availability metadata so tests can assert shortfall counts without DOM scraping.
  - Labels / fields: `totalRequired`, `available`, `shortfallCount`, `filteredCount`, `filteredShortfall`.
  - Consumer: `waitForUiState(page, 'kits.detail.toolbar', 'ready')`.
  - Evidence: docs/contribute/ui/data_display.md:24, src/lib/test/ui-state.ts:48

- Data hooks: `data-testid="kits.detail.content.row.{id}"`, `kits.detail.content.row.{id}.actions.edit`, etc. for deterministic selectors.
  - Evidence: tests/support/page-objects/parts-page.ts:89

### 10) Lifecycle & Background Work

- Hook / effect: Detail query subscription
  - Trigger cadence: On mount and whenever `kitId` changes or mutations settle.
  - Responsibilities: Subscribe to query, recompute filtered rows plus `availabilitySnapshot`, and emit `kits.detail`/`kits.detail.toolbar` instrumentation.
  - Cleanup: `useListLoadingInstrumentation` abort handler fires on unmount to emit `aborted` phase.
  - Evidence: src/lib/api/generated/hooks.ts:906, src/lib/test/query-instrumentation.ts:213, src/lib/test/ui-state.ts:48

- Hook / effect: Mutation-driven cache updates
  - Trigger cadence: After create/update/delete resolves.
  - Responsibilities: Update React Query cache, schedule invalidations for overview lists, and trigger derived snapshot recompute so `kits.detail.toolbar` emits fresh metadata.
  - Cleanup: None beyond automatic query garbage collection.
  - Evidence: src/components/kits/kit-archive-controls.tsx:112, src/lib/test/ui-state.ts:48

### 11) Security & Permissions

- Concern: Archived kits must remain read-only
  - Touchpoints: Detail header action buttons, BOM action buttons, metadata modal.
  - Mitigation: Disable controls when `kit.status === 'archived'` and guard mutation hooks accordingly.
  - Residual risk: Backend already rejects archived mutations; UI belt-and-suspenders ensures consistent UX.
  - Evidence: docs/epics/kits_feature_breakdown.md:55, docs/epics/kits_feature_breakdown.md:73

### 12) UX / UI Impact

- Entry point: Kits overview card
  - Change: Card/title becomes a link to `/kits/{id}` while preserving membership tooltips and archive controls.
  - User interaction: Clicking opens detail workspace in-place; keyboard focus states reflect link semantics.
  - Dependencies: `KitCard`, `KitOverviewList`, router navigation.
  - Evidence: src/components/kits/kit-card.tsx:120

- Entry point: Kit detail header
  - Change: New summary layout with quantity badge, status badge (Archived), and edit modal button.
  - User interaction: Active kits can open modal; archived kits see disabled affordance with tooltip.
  - Dependencies: `DetailScreenLayout`, `QuantityBadge`, instrumentation.
  - Evidence: docs/epics/kits_feature_breakdown.md:55, src/components/parts/part-details.tsx:689

- Entry point: Kit BOM table
  - Change: Introduce responsive table with computed availability columns, inline row editing, and delete confirmation.
  - User interaction: Filter contents, add/edit part rows, observe availability updates.
  - Dependencies: `kit-content-*` components, `PartSelector`, Toast/ConfirmDialog.
  - Evidence: docs/epics/kits_feature_breakdown.md:56, src/components/shopping-lists/concept-line-row.tsx:1

### 13) Deterministic Test Plan

- Surface: Kit detail loads with computed columns
  - Scenarios:
    - Given a kit with seeded contents, When I navigate from the overview card, Then `kits.detail` ready event fires and the table shows required/available/shortfall columns.
    - Given a filter term, When I search by part key, Then only matching rows remain and `kits.detail.toolbar` telemetry reports updated filtered vs total counts.
  - Instrumentation / hooks: `waitForListLoading(page, 'kits.detail', 'ready')`, `waitForUiState(page, 'kits.detail.toolbar', 'ready')`.
  - Gaps: None.
  - Evidence: docs/contribute/testing/index.md:5, tests/support/helpers.ts:49, tests/support/helpers.ts:63

- Surface: Edit kit metadata (active)
  - Scenarios:
    - Given an active kit, When I open the Edit modal and submit new name/build target, Then `KitDetail:metadata` submit/success events fire and header reflects updates.
    - Given validation errors, When I clear the name, Then validation error appears and `form` validation event is emitted.
  - Instrumentation / hooks: `waitTestEvent` on `KitDetail:metadata`, toast helper for confirmation.
  - Gaps: None.
  - Evidence: docs/epics/kits_feature_breakdown.md:55, tests/support/helpers.ts:63

- Surface: BOM row create/update/delete
  - Scenarios:
    - Given an empty kit, When I add a part via selector, Then new row appears, availability numbers match API, and `KitContent:create` success event fires.
    - Given an existing row, When I edit quantity to trigger version conflict, Then `KitContent:update` error event fires and UI prompts refresh before retry.
    - Given a row, When I delete it, Then `KitContent:delete` success event fires and table recalculates counts.
  - Instrumentation / hooks: `KitContent:*` form events, `waitForListLoading('kits.detail.contents', 'ready')`, `expectConflictError`.
  - Gaps: Conflict scenario uses manual version stomp via API factory to force 409.
  - Evidence: docs/epics/kits_feature_breakdown.md:70, tests/support/helpers.ts:113

- Surface: Archived kit read-only gating
  - Scenarios:
    - Given an archived kit, When I open detail, Then edit controls are disabled, no modal opens, and instrumentation still reports ready state.
  - Instrumentation / hooks: `kits.detail` ready metadata includes `status: 'archived'`.
  - Gaps: None.
  - Evidence: docs/epics/kits_feature_breakdown.md:55, tests/e2e/kits/kits-overview.spec.ts:137

### 14) Implementation Slices

- Slice: Detail route & data mapping
  - Goal: Render kit detail screen with mapped data and skeleton/error states.
  - Touches: routes (`$kitId.tsx`, `$kitId/index.tsx`), `use-kit-detail`, `kit-detail.tsx`, type additions.
  - Dependencies: None.

- Slice: BOM table & filtering
  - Goal: Display contents table with filters, computed columns, and instrumentation hooks.
  - Touches: `kit-content-table.tsx`, `kit-content-row.tsx`, `kit-content-toolbar.tsx`, utils.
  - Dependencies: Detail route slice.

- Slice: BOM mutations & metadata modal
  - Goal: Enable create/edit/delete flows, metadata modal, optimistic updates, and guard archived kits.
  - Touches: mutation hooks, `kit-content-form.tsx`, `kit-metadata-dialog.tsx`, cache coordination.
  - Dependencies: BOM table slice.

- Slice: Navigation + Playwright coverage
  - Goal: Link overview cards to detail, extend page object, add end-to-end specs and factory helpers.
  - Touches: `kit-card.tsx`, `kit-overview-list.tsx`, page object, new spec, kit factory.
  - Dependencies: Prior slices (UI must exist before tests).

### 15) Risks & Open Questions

- Risk: Availability metadata becomes stale between optimistic updates and refetch.
  - Impact: Users may see incorrect shortfall counts temporarily.
  - Mitigation: Schedule immediate detail refetch after each mutation and gate instrumentation payloads until server data returns.

- Risk: Conflict handling UX could confuse users if repeated 409s occur.
  - Impact: Users may repeatedly submit stale edits.
  - Mitigation: Surface clear inline guidance, auto-refetch latest data, and log conflict via instrumentation for diagnostics.

- Risk: Large BOMs may lead to sluggish filtering/rendering.
  - Impact: Perceived lag on detail screen.
  - Mitigation: Memoise filtered results, paginate or chunk rendering if performance issues appear, and profile before shipping.

- Question: Should the detail screen surface linked shopping/pick lists now or defer to the dedicated linking feature?
  - Why it matters: Affects scope of sidebar chips and potential tooling in this slice.
  - Owner / follow-up: Product/design (source brief references hydrated chips in detail payload).

### 16) Confidence

Confidence: Medium — Optimistic caching with version conflicts and multiple instrumentation scopes introduces complexity that needs careful validation against real backend responses.

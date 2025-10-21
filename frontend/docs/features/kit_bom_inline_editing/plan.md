### 0) Research Log & Findings

- Feature spec calls for inline add/edit/delete flows with optimistic refetches and dedicated form instrumentation IDs (`docs/epics/kits_feature_breakdown.md:86`, `docs/epics/kits_feature_breakdown.md:97`).
- Current detail screen renders a read-only BOM table and already wires list loading instrumentation (`src/components/kits/kit-detail.tsx:47`, `src/components/kits/kit-detail.tsx:129`).
- `KitBOMTable` renders static rows and reservation tooltips, so it must be refactored to host editable states (`src/components/kits/kit-bom-table.tsx:14`).
- `useKitDetail` maps `useGetKitsByKitId` data into camelCase rows and aggregates, providing the source for optimistic updates (`src/hooks/use-kit-detail.ts:25`).
- `KitContentRow` view model includes `version`, `note`, and reservation metadata needed for mutation snapshots (`src/types/kits.ts:147`).
- Part selection relies on `PartSelector` and `usePartsSelector`, which expose search metadata but no exclusion handling yet (`src/components/parts/part-selector.tsx:16`, `src/hooks/use-parts-selector.ts:62`).
- The underlying `SearchableSelect` lacks disabled-option support, influencing how we filter already-selected part keys (`src/components/ui/searchable-select.tsx:44`).
- Existing Playwright coverage asserts read-only BOM behavior and instrumentation waits, providing the baseline to extend (`tests/e2e/kits/kit-detail.spec.ts:119`).
- Kits page object enumerates current locators; new inline controls will require extensions here (`tests/support/page-objects/kits-page.ts:47`).
- Kit factories already create contents and will seed mutation scenarios, including conflict setups (`tests/api/factories/kit-factory.ts:72`).
- Architecture and testing guides emphasize generated API hooks, instrumentation-first development, and real-backend Playwright flows (`docs/contribute/architecture/application_overview.md:7`, `docs/contribute/testing/index.md:5`, `docs/contribute/testing/playwright_developer_guide.md:9`).

### 1) Intent & Scope (1–3 short paragraphs)

**User intent**

Deliver inline kit BOM maintenance so planners can add, edit, and delete parts directly on the detail workspace while preserving optimistic responsiveness, conflict recovery, and deterministic instrumentation for tests. The plan extends the existing read-only slice without introducing new backend contracts.

**Prompt quotes**

"Add an “Add part” button and inline row editor that uses the existing part selector plus integer quantity input; disable options for already-selected parts." (`docs/epics/kits_feature_breakdown.md:86`)

"Allow editing quantity and note inline for existing rows, piping optimistic updates through React Query cache and refetching availability after success." (`docs/epics/kits_feature_breakdown.md:87`)

"useFormInstrumentation IDs `KitContent:create`, `KitContent:update`, `KitContent:delete` (metadata includes `kitId`, `contentId?`, `partKey`, `phase`)." (`docs/epics/kits_feature_breakdown.md:97`)

**In scope**

- Add inline create/edit/delete UI to the BOM card in `KitDetail`, including optimistic cache updates, conflict handling, and status gating for archived kits.
- Extend shared selectors/hooks (Part selector, kit detail hook) to support row editing UX and instrumentation snapshots.
- Update Playwright coverage and page objects to exercise create/edit/delete flows with instrumentation waits and backend assertions.

**Out of scope**

- Kit metadata dialog and archived gating beyond BOM actions (handled in a later feature).
- Backend schema or API changes; plan assumes existing endpoints already behave as specified.
- Shopping list linkage chips or other header instrumentation unrelated to BOM maintenance.

**Assumptions / constraints**

- Backend endpoints for contents already emit `version` and conflict payloads; no additional API scaffolding is required.
- Part selector data remains small enough to filter client-side for exclusion logic.
- Playwright environment continues to run against the real backend per testing policy, so factories must seed all prerequisite parts and kits.

### 2) Affected Areas & File Map (with repository evidence)

- Area: src/components/kits/kit-detail.tsx
  - Why: Surface “Add part” CTA, inject inline editor state, and coordinate instrumentation/test IDs around BOM actions.
  - Evidence: src/components/kits/kit-detail.tsx:129 — renders `<KitBOMTable rows={contents} />`, the insertion point for interactive controls.
- Area: src/components/kits/kit-bom-table.tsx
  - Why: Convert static table into editable rows, wiring action buttons, inline forms, and optimistic status indicators.
  - Evidence: src/components/kits/kit-bom-table.tsx:34 — maps each `row` into a static `<tr>` that needs to become an interactive row component.
- Area: src/components/kits/kit-bom-row-editor.tsx (new)
  - Why: Encapsulate shared form UI (part selector, quantity, note, validation) for both add and edit contexts, enabling instrumentation snapshots.
  - Evidence: docs/epics/kits_feature_breakdown.md:86 — requires inline editor with part selector and quantity input.
- Area: src/hooks/use-kit-detail.ts
  - Why: Expose helper methods (e.g., `upsertContent`, `removeContent`) layered on generated mutations, manage optimistic cache copies, and feed instrumentation metadata.
  - Evidence: src/hooks/use-kit-detail.ts:25 — centralizes detail query, contents array, and metadata used by instrumentation.
- Area: src/hooks/use-kit-contents.ts (new)
  - Why: Wrap `usePostKitsContentsByKitId`, `usePatchKitsContentsByKitIdAndContentId`, and `useDeleteKitsContentsByKitIdAndContentId` with optimistic cache helpers and error coercion.
  - Evidence: src/lib/api/generated/hooks.ts:896 — generated mutation hook for POST contents that needs domain-specific orchestration.
- Area: src/components/parts/part-selector.tsx
  - Why: Accept exclusion lists / allowlists so already-selected parts can be disabled while the current row stays selectable.
  - Evidence: src/components/parts/part-selector.tsx:68 — currently renders all options with no way to filter or disable.
- Area: src/hooks/use-parts-selector.ts
  - Why: Surface summaries keyed by part ID to support exclusion logic and existing metadata snapshots for instrumentation.
  - Evidence: src/hooks/use-parts-selector.ts:84 — builds option metadata that can be filtered before rendering.
- Area: src/types/kits.ts
  - Why: Define helper types for draft rows (e.g., `KitContentDraft`) and ensure versioned rows remain camelCase.
  - Evidence: src/types/kits.ts:281 — `mapKitContentRow` includes `version`, `note`, and reservation arrays needed for optimistic merges.
- Area: tests/e2e/kits/kit-detail.spec.ts
  - Why: Add scenarios for create/edit/delete (including 409 conflict) and update instrumentation waits accordingly.
  - Evidence: tests/e2e/kits/kit-detail.spec.ts:119 — existing spec seeds kits and asserts list loading and table state.
- Area: tests/support/page-objects/kits-page.ts
  - Why: Extend page object with locators/actions for inline editors, confirmation dialogs, and summary assertions post-mutation.
  - Evidence: tests/support/page-objects/kits-page.ts:178 — current helpers expose summary badges but no editing controls.
- Area: tests/api/factories/kit-factory.ts
  - Why: Provide helpers (`createContent`, `updateContent`, `deleteContent`) to seed rows and force version conflicts deterministically for Playwright coverage.
  - Evidence: tests/api/factories/kit-factory.ts:72 — existing `addContent` helper seeds BOM rows via API.
- Area: docs/epics/kits_feature_breakdown.md
  - Why: Link out to this plan so contributors find the implementation details.
  - Evidence: docs/epics/kits_feature_breakdown.md:80 — feature header the plan supports.

### 3) Data Model / Contracts

- Entity / contract: KitContentRow
  - Shape: `{ id: number; partId: number; requiredPerUnit: number; totalRequired: number; available: number; shortfall: number; version: number; note: string | null; activeReservations: KitReservationEntry[] }`
  - Mapping: `mapKitContentRow` converts snake_case payloads (`required_per_unit`, `version`) into camelCase for UI consumption.
  - Evidence: src/types/kits.ts:281
- Entity / contract: KitDetailQueryKey
  - Shape: `['getKitsByKitId', { path: { kit_id: number } }]`
  - Mapping: `useKitDetail` normalizes route param to number and passes to generated hook with `enabled` guard, surfacing `query` and `contents`.
  - Evidence: src/lib/api/generated/hooks.ts:841; src/hooks/use-kit-detail.ts:25
- Entity / contract: KitContentMutationVariables
  - Shape: `create -> { path: { kit_id }, body: { part_id, required_per_unit, note? } }`, `update -> { path: { kit_id, content_id }, body: { version, required_per_unit?, note? } }`, `delete -> { path: { kit_id, content_id } }`
  - Mapping: New hook will build payloads from form state, ensuring note trimming and integer coercion before forwarding to generated mutations.
  - Evidence: docs/epics/kits_feature_breakdown.md:93; src/lib/api/generated/hooks.ts:896
- Entity / contract: KitBOMOverlayState
  - Shape: `{ pendingCreateRow?: PendingRow; pendingUpdateDraft: Record<number, PendingRow>; pendingDeleteId?: number }` where `PendingRow` carries display-only values (`partKey`, `requiredPerUnit`, `note`, `status`).
  - Mapping: Managed via component state in `KitDetail`/`KitBOMTable`; never written into React Query cache or emitted through instrumentation metadata.
  - Evidence: docs/features/kit_bom_inline_editing/plan.md:121-151

### 4) API / Integration Surface

- Surface: POST /api/kits/{kit_id}/contents (`usePostKitsContentsByKitId`)
  - Inputs: `{ path: { kit_id }, body: { part_id, required_per_unit, note? } }`
  - Outputs: Returns `KitContentDetailSchema` with server-computed totals and `version` for optimistic cache merge.
  - Errors: 400 on validation (duplicate parts, invalid quantity); surfaced via `ApiError`.
  - Evidence: docs/epics/kits_feature_breakdown.md:93; src/lib/api/generated/hooks.ts:896
- Surface: PATCH /api/kits/{kit_id}/contents/{content_id} (`usePatchKitsContentsByKitIdAndContentId`)
  - Inputs: `{ path: { kit_id, content_id }, body: { version, required_per_unit?, note? } }`
  - Outputs: Updated `KitContentDetailSchema` with incremented `version` and recalculated availability.
  - Errors: 409 conflict when `version` stale; backend responds with latest payload in error body.
  - Evidence: docs/epics/kits_feature_breakdown.md:94; src/lib/api/generated/hooks.ts:938
- Surface: DELETE /api/kits/{kit_id}/contents/{content_id} (`useDeleteKitsContentsByKitIdAndContentId`)
  - Inputs: `{ path: { kit_id, content_id } }`
  - Outputs: 204 No Content; the UI must remove row optimistically and confirm on refetch.
  - Errors: 404 if row missing; treat as already removed and refetch detail.
  - Evidence: docs/epics/kits_feature_breakdown.md:95; src/lib/api/generated/hooks.ts:917

### 5) Algorithms & UI Flows (step-by-step)

- Flow: Add part inline
  - Steps:
    1. User clicks “Add part” button on BOM card while kit is active; open inline editor row at table top with empty draft.
    2. On part selection and quantity entry, validate integer ≥1 and optional note length, updating disabled state.
    3. On submit, call create mutation; stash a `pendingCreateRow` overlay (id `temp-create`) that renders above the table with spinner/badge but does **not** mutate the `contents` array so aggregates stay authoritative.
    4. On success, merge server row into query cache, emit form success, and trigger `query.refetch()`; the ready handler clears `pendingCreateRow` once `kits.detail.contents` emits `ready`.
    5. On failure, clear `pendingCreateRow`, keep editor open with validation errors, and emit form error instrumentation.
  - States / transitions: `isAdding`, `draftContent`, `pendingCreateRow`, `mutation.status`, `query.status`.
  - Hotspots: Prevent duplicate part selection by filtering `existingPartKeys`; ensure overlay row is excluded from aggregates/instrumentation metadata.
  - Evidence: docs/epics/kits_feature_breakdown.md:86; src/components/kits/kit-detail.tsx:129

- Flow: Edit existing row
  - Steps:
    1. User clicks “Edit” on a row; swap display cells for form inputs populated from `KitContentRow`.
    2. Track `originalVersion` and disable part selector (part key cannot change per backend contract).
    3. Submit patch mutation with `version` and changed fields; record draft values in `pendingUpdateDraft[contentId]` to overlay UI labels while leaving the underlying React Query cache untouched.
    4. On success, clear the overlay once the refetch resolves, then close editor; instrumentation waits on `kits.detail.contents` `ready` before emitting form success.
    5. On 409, refetch detail, reopen editor with latest data, and surface inline guidance about concurrent updates while leaving overlay cleared.
  - States / transitions: `editingRowId`, `pendingUpdateDraft`, `pendingUpdateRowId`, `query.fetchStatus`.
  - Hotspots: Keep only one row in edit mode; guard against switching rows while pending to prevent stale optimistic overlays from persisting.
  - Evidence: docs/epics/kits_feature_breakdown.md:87; src/types/kits.ts:281

- Flow: Delete row
  - Steps:
    1. User clicks “Delete” -> confirm dialog; instrumentation tracks form open.
    2. On confirm, mark row id in `pendingDeleteId` to disable controls but delay cache mutation; show inline skeleton state until backend response.
    3. If mutation succeeds, trigger refetch to reconcile reservations; provide success toast and remove row after refetch data hydrates.
    4. On error, restore cached row and surface toast plus inline banner if repeated failures.
  - States / transitions: `pendingDeleteId`, `confirmOpen`, `query.fetchStatus`.
  - Hotspots: Ensure delete button disabled for archived kits and while other mutations pending; reconcile when refetch fails (show error and leave row intact).
  - Evidence: docs/epics/kits_feature_breakdown.md:88; src/components/ui/dialog.tsx:193

### 6) Derived State & Invariants (stacked bullets)

- Derived value: isArchivedKit
  - Source: `detail?.status` from `useKitDetail`.
  - Writes / cleanup: Disables add/edit/delete controls; hides inline editor when kit transitions to archived.
  - Guards: `detail.status === 'archived'` prevents mutation triggers.
  - Invariant: Archived kits never show mutation affordances.
  - Evidence: src/hooks/use-kit-detail.ts:25

- Derived value: existingPartKeys
  - Source: `contents.map(row => row.part.key)` gathered from query cache.
  - Writes / cleanup: Filters part selector options for add flow; re-evaluated after refetch hydrates server rows.
  - Guards: Allow current row’s part key during edit and ignore overlay rows (`pendingCreateRow`, `pendingUpdateDraft`).
  - Invariant: No two persisted rows share the same part key in editor state.
  - Evidence: src/components/kits/kit-bom-table.tsx:44

- Derived value: bomAggregates
  - Source: `summarizeKitContents` already exported by `useKitDetail`.
  - Writes / cleanup: Drives summary badges and instrumentation metadata.
  - Guards: Only recomputed from server-backed `contents`; overlay rows are excluded until refetch completes.
  - Invariant: Badge totals equal sum over `contents` fields.
  - Evidence: src/hooks/use-kit-detail.ts:28

- Derived value: mutationPendingState
  - Source: Combine `create/update/delete` mutation statuses with local optimistic IDs.
  - Writes / cleanup: Applies loading spinners/disabled buttons per row.
  - Guards: Reset after `query.refetch()` resolves ready event.
  - Invariant: UI indicates pending operations to prevent duplicate submissions.
  - Evidence: docs/epics/kits_feature_breakdown.md:98

- Derived value: pendingOverlays
  - Source: Local state (`pendingCreateRow`, `pendingUpdateDraft`, `pendingDeleteId`).
  - Writes / cleanup: Renders status rows/tooltips without mutating React Query cache.
  - Guards: Cleared on mutation settle and after list-loading `ready` event to avoid stale overlays.
  - Invariant: Overlays never leak into React Query cache or instrumentation metadata.
  - Evidence: docs/features/kit_bom_inline_editing/plan.md:123-142

### 7) State Consistency & Async Coordination

- Source of truth: React Query cache for `['getKitsByKitId', { path: { kit_id } }]`.
- Coordination: New hook manages local overlay state (`pendingCreateRow`, `pendingUpdateDraft`, `pendingDeleteId`) while leaving the cache untouched until server payloads land; aggregates stay aligned because only refetched data mutates the cache.
- Async safeguards: Cancel in-flight refetch before showing overlays, capture rollback snapshot for delete, and on error clear overlays plus surface toast/validation feedback without touching cache data.
- Instrumentation: Continue `useListLoadingInstrumentation` for `kits.detail` and `kits.detail.contents`; gate form success/error events until overlays clear and `kits.detail.contents` emits `ready` after refetch.
- Evidence: src/components/kits/kit-detail.tsx:47; src/lib/api/generated/hooks.ts:841

### 8) Errors & Edge Cases

- Failure: Duplicate part selection while adding.
  - Surface: Inline editor row; part selector error message.
  - Handling: Prevent submit, show validation error, track form validation event.
  - Guardrails: Filter options and double-check on submit before calling mutation.
  - Evidence: docs/epics/kits_feature_breakdown.md:86

- Failure: 409 conflict on update.
  - Surface: Inline edit row reopens with message and latest backend values.
  - Handling: Refetch detail, show toast/banner, track form error metadata.
  - Guardrails: Use returned payload to repopulate fields; keep version updated.
  - Evidence: docs/epics/kits_feature_breakdown.md:89

- Failure: Network/API error on delete.
  - Surface: Confirmation dialog closes, toast shows failure, row restored.
  - Handling: Clear `pendingDeleteId`, leave row visible, prompt retry.
  - Guardrails: Mutation error path rehydrates cached snapshot and instrumentation emits error phase.
  - Evidence: src/components/ui/dialog.tsx:193

- Failure: Kit archived while editor open.
  - Surface: Controls disabled, inline form dismissed with info message.
  - Handling: Check `isArchivedKit` on each mutation trigger and early-exit with warning toast.
  - Guardrails: Derived state gating ensures no stale submissions land.
  - Evidence: docs/epics/kits_feature_breakdown.md:103

- Failure: Refetch after mutation fails.
  - Surface: Server refetch triggered post-mutation returns error.
  - Handling: Clear overlays, keep user-visible rows untouched, emit toast via centralized handler, and reopen editor for retry when applicable.
  - Guardrails: `useKitDetail` instrumentation emits error metadata so Playwright can assert deterministic failure handling.
  - Evidence: src/hooks/use-kit-detail.ts:25; docs/contribute/testing/playwright_developer_guide.md:9

### 9) Observability / Instrumentation

- Signal: `KitContent:create`
  - Type: Form instrumentation event via `useFormInstrumentation`.
  - Trigger: Editor open/submit immediately; success/error deferred until `kits.detail.contents` emits `ready` after server payload merges.
  - Labels / fields: `{ kitId, partKey, phase: 'create', contentId?: number }`.
  - Consumer: Playwright waits for `form` events before asserting DB state.
  - Evidence: docs/epics/kits_feature_breakdown.md:97

- Signal: `KitContent:update`
  - Type: Form instrumentation event.
  - Trigger: Row edit lifecycle; include latest `version` in metadata for debugging, with success gated on refetch `ready`.
  - Labels / fields: `{ kitId, contentId, partKey, phase: 'update' }`.
  - Consumer: Conflict scenario waits for submit/error transitions to assert recovery.
  - Evidence: docs/epics/kits_feature_breakdown.md:97

- Signal: `KitContent:delete`
  - Type: Form instrumentation on confirmation dialog.
  - Trigger: Confirmation open, submit, success/error (success delayed until refetch `ready`).
  - Labels / fields: `{ kitId, contentId, partKey, phase: 'delete' }`.
  - Consumer: Tests wait for success before verifying backend removal.
  - Evidence: docs/epics/kits_feature_breakdown.md:97

- Signal: `list_loading` scopes
  - Type: Existing `useListLoadingInstrumentation` for `kits.detail` and `kits.detail.contents`.
  - Trigger: Mutation-induced refetch toggles `fetchStatus==='fetching'`, but “ready” only emitted after server reconciling totals.
  - Labels / fields: Already include content counts/shortfalls for assertions.
  - Evidence: src/components/kits/kit-detail.tsx:47

### 10) Lifecycle & Background Work

- Hook / effect: `useKitDetail` query
  - Trigger cadence: On mount and whenever `kitId` or refetch invoked.
  - Responsibilities: Fetch kit detail payload, expose aggregates, and instrumentation metadata.
  - Cleanup: React Query handles cache lifetimes; no manual teardown.
  - Evidence: src/hooks/use-kit-detail.ts:25

- Hook / effect: Mutation success handlers
  - Trigger cadence: After create/update/delete resolves.
  - Responsibilities: Invalidate/refresh `getKitsByKitId` and overview caches, keep instrumentation accurate.
  - Cleanup: Reset local optimistic state once `query.refetch()` completes.
  - Evidence: src/lib/api/generated/hooks.ts:896

### 11) Security & Permissions (if applicable)

- Concern: Archived kits must remain read-only.
  - Touchpoints: `KitDetail` action bar, inline editor components, mutation hooks.
  - Mitigation: Gate CTA visibility and mutation triggers on `detail.status !== 'archived'`, display tooltip mirroring existing metadata slice.
  - Residual risk: Users viewing stale cached data might see controls momentarily—mutation guard re-checks status before sending requests.
  - Evidence: docs/epics/kits_feature_breakdown.md:116

### 12) UX / UI Impact (if applicable)

- Entry point: `/kits/$kitId` detail route.
  - Change: Add inline add/edit/delete controls, pending state indicators, and conflict messaging.
  - User interaction: Users manage BOM without leaving workspace; see toasts and inline statuses during mutations.
  - Dependencies: `KitDetail`, `KitBOMTable`, `PartSelector`, toast context.
  - Evidence: src/routes/kits/$kitId/index.tsx:26; src/components/kits/kit-bom-table.tsx:34

### 13) Deterministic Test Plan (new/changed behavior only)

- Surface: Kit detail BOM management
  - Scenarios:
    - Given an active kit with existing contents, When the user adds a new part via inline editor, Then the table shows the new row and backend reflects it.
    - Given a kit row, When the user edits quantity and note, Then the overlay shows pending values and final data matches backend after refetch.
    - Given two sessions, When Playwright forces a backend update with `testData.kits.updateContent` helper, Then submitting the inline edit emits a conflict error and recovers with latest data.
    - Given any row, When the user confirms delete, Then the row disappears and a refetch shows updated aggregates.
    - Given an archived kit, When the page loads, Then add/edit/delete controls remain disabled and no form events emit.
  - Instrumentation / hooks: Wait for `KitContent:*` form events, `kits.detail.contents` list_loading ready, and new `data-testid` selectors for editor inputs/buttons.
  - Gaps: None planned; archived gating and conflict helper now scoped into coverage.
  - Evidence: tests/e2e/kits/kit-detail.spec.ts:119; docs/contribute/testing/playwright_developer_guide.md:9; tests/api/factories/kit-factory.ts:72

### 14) Implementation Slices (only if large)

- Slice: Shared hooks & selector updates
  - Goal: Enable exclusion logic, mutation wrappers, and instrumentation helpers without UI changes.
  - Touches: `src/hooks/use-kit-contents.ts`, `src/components/parts/part-selector.tsx`, `src/hooks/use-parts-selector.ts`.
  - Dependencies: None; unblocks UI slice.

- Slice: KitDetail UI integration
  - Goal: Render inline editor, wire CTA gating, handle optimistic states, and surface instrumentation.
  - Touches: `src/components/kits/kit-detail.tsx`, `src/components/kits/kit-bom-table.tsx`, new row editor component.
  - Dependencies: Shared hooks ready.

- Slice: Deterministic tests & documentation
  - Goal: Extend page objects/specs, highlight plan link in epic, verify instrumentation alignment, and cover archived gating.
  - Touches: `tests/e2e/kits/kit-detail.spec.ts`, `tests/support/page-objects/kits-page.ts`, `tests/api/factories/kit-factory.ts`, `docs/epics/kits_feature_breakdown.md`.
  - Dependencies: UI slice merged or feature flagged for testing.

### 15) Risks & Open Questions

- Risk: Optimistic cache merges drift from backend calculations (e.g., reservations) causing mismatched summaries.
  - Impact: Users see incorrect availability until manual refresh.
  - Mitigation: Render pending overlays outside the query cache and wait for refetch `ready` before clearing pending state.

- Risk: Part selector filtering may degrade usability if option list large.
  - Impact: Slow search or missing options.
  - Mitigation: Filter client-side while preserving search term; fall back on server validation to catch duplicates.

- Risk: Conflict recovery UX might loop if backend continually updates row.
  - Impact: Users cannot save changes.
  - Mitigation: After repeated 409, keep editor open and display guidance to refresh or coordinate with teammate.

- Question: None — product stakeholders confirmed delete confirmations do not need reservation-specific messaging.
  - Why it matters: No follow-up required; UI copy stays with standard confirmation text.
  - Owner / follow-up: N/A

### 16) Confidence (one line)

Confidence: Medium — Requirements are clear and reuse existing patterns, but optimistic merge + conflict UX demands careful coordination and thorough testing.

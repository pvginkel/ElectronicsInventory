### 0) Research Log & Findings
- Requirement spells out pick/undo flows, completion rules, and instrumentation scope (`pickLists.detail.execution`) in the kits epic (`docs/epics/kits_feature_breakdown.md:268`).
- `PickListDetail` currently orchestrates data fetch + load instrumentation but has no execution handlers (`src/components/pick-lists/pick-list-detail.tsx:66`).
- `PickListLines` renders static line rows with an empty actions container, so there is no place to attach pick/undo controls yet (`src/components/pick-lists/pick-list-lines.tsx:109`).
- `usePickListDetail` wraps `useGetPickListsByPickListId` and exposes derived groups but no mutation helpers or optimistic state (`src/hooks/use-pick-list-detail.ts:46`).
- Generated hooks already expose `usePostPickListsLinesPickByPickListIdAndLineId` and `usePostPickListsLinesUndoByPickListIdAndLineId`, returning the refreshed detail payload (`src/lib/api/generated/hooks.ts:1610`).
- Kit detail chips and badges rely on `KitPickListSummary` data from the detail payload; they will reflect status changes once caches refresh (`src/components/kits/kit-detail-header.tsx:196`).
- Kit membership indicators aggregate open/completed counts via React Query, so we must invalidate those summaries after mutations (`src/hooks/use-kit-memberships.ts:210`).
- Existing Playwright coverage stops at read-only assertions; no spec exercises pick or undo flows today (`tests/e2e/pick-lists/pick-list-detail.spec.ts:1`).
- Playwright guide reinforces deterministic waits through instrumentation hooks rather than sleeps (`docs/contribute/testing/playwright_developer_guide.md:5`).
- Test helpers expose `waitForListLoading`/`waitForUiState` that consume the instrumentation scopes already used on the workspace (`tests/support/helpers.ts:63`).

### 1) Intent & Scope
**User intent**
Enable operators to mark pick list lines as picked or undone inside the workspace so the list status, kit chips, and instrumentation stay authoritative without backend guessing.

**Prompt quotes**
"Pick list execution & status transitions" — "Render a single **Picked** button per line ... expose an **Undo** control ... Automatically mark the pick list header `status = completed` ... Extend instrumentation (`pickLists.detail.execution`)."

**In scope**
- Add pick/undo controls with optimistic UX, disabling conflicting actions.
- Keep pick list detail, kit detail, and membership badges in sync via targeted cache updates.
- Emit deterministic instrumentation (`pickLists.detail.execution`) and update Playwright coverage for pick, undo, and completion regression.

**Out of scope**
- Backend contract changes or new endpoints (reuse existing POST pick/undo routes).
- Revisiting pick list creation dialogs or kit overview card layout beyond status updates from refreshed data.
- Broader reserved-quantity math or inventory availability logic adjustments.

**Assumptions / constraints**
Backend responses already include updated detail payloads after pick/undo, and existing test factories can seed inventory and pick lists without extra endpoints. All work must honor documented testing patterns and avoid manual fetch/toast handling outside shared hooks.

### 2) Affected Areas & File Map
- Area: `src/components/pick-lists/pick-list-detail.tsx`
  - Why: Inject pick/undo orchestration, wire execution instrumentation, and refresh availability after mutations.
  - Evidence: `src/components/pick-lists/pick-list-detail.tsx:40`
- Area: `src/components/pick-lists/pick-list-lines.tsx`
  - Why: Render pick/undo buttons per line inside a new "Actions" column, expose disabled states, and surface optimistic status updates.
  - Evidence: `src/components/pick-lists/pick-list-lines.tsx:109`
- Area: `src/hooks/use-pick-list-detail.ts`
  - Why: Export query keys + helpers for optimistic writes, expose metadata for execution instrumentation, and share grouped stats with mutations.
  - Evidence: `src/hooks/use-pick-list-detail.ts:29`
- Area: `src/types/pick-lists.ts`
  - Why: Provide utilities to patch line status counts and build stable query keys for cache writes.
  - Evidence: `src/types/pick-lists.ts:99`
- Area: `src/hooks/use-pick-list-execution.ts` *(new)*
  - Why: Centralize pick/undo mutations, optimistic caching, instrumentation, toast messaging, and coordinated invalidation of `buildKitsQueryKey` / `pickMembershipQueryKey` variants for reuse inside the workspace.
  - Evidence: `docs/epics/kits_feature_breakdown.md:274`
- Area: `src/hooks/use-kit-memberships.ts`
  - Why: Reference existing query key builder so execution hook can invalidate membership summaries after status flips.
  - Evidence: `src/hooks/use-kit-memberships.ts:360`
- Area: `tests/support/page-objects/pick-lists-page.ts`
  - Why: Add locators/actions for pick and undo buttons plus helper waits for execution instrumentation.
  - Evidence: `tests/support/page-objects/pick-lists-page.ts:20`
- Area: `tests/e2e/pick-lists/pick-list-detail.spec.ts`
  - Why: Extend scenarios to cover pick/undo flows, completion archiving, and instrumentation waits.
  - Evidence: `tests/e2e/pick-lists/pick-list-detail.spec.ts:1`
- Area: `tests/e2e/kits/kit-detail.spec.ts`
  - Why: Assert kit chips/overview reflect completion after returning from the workspace.
  - Evidence: `tests/e2e/kits/kit-detail.spec.ts:538`

### 3) Data Model / Contracts
- Entity / contract: Pick list detail query cache
  - Shape: `['getPickListsByPickListId', { path: { pick_list_id } }] → { status, line_count, lines[{ id, status, pickedAt, kitContent{ id, partKey }, location{ boxNo, locNo } }] }`
  - Mapping: `mapPickListDetail` converts snake_case payloads to camelCase line groups used by the UI.
  - Evidence: `src/types/pick-lists.ts:99`
- Entity / contract: Pick/undo mutation payload
  - Shape: `POST /pick-lists/{pick_list_id}/lines/{line_id}/(pick|undo)` → updated `KitPickListDetailSchema` identical to detail fetch.
  - Mapping: Same mapper as detail; optimistic updates must stay compatible with returned structure.
  - Evidence: `src/lib/api/generated/hooks.ts:1610`
- Entity / contract: Kit detail + membership summaries
  - Shape: `['getKitsByKitId', { path: { kit_id } }]` plus `['kits.pickListMemberships', { kitIds, includeDone }]` caches carry open/completed counts for chips/badges.
  - Mapping: `buildKitDetailQueryKey` and membership summary helpers normalize counts.
  - Evidence: `src/hooks/use-kit-detail.ts:29`
- Entity / contract: Pick list detail search context
  - Shape: `buildPickListDetailSearch({ kitId, status, search })` persists kit overview status/search in the URL.
  - Mapping: Execution hook reads `kitOverviewStatus`/`kitOverviewSearch` props from `PickListDetail` to target overview invalidations.
  - Evidence: `src/components/kits/pick-list-link-chip.tsx:9`

### 4) API / Integration Surface
- Surface: `POST /api/pick-lists/{pick_list_id}/lines/{line_id}/pick`
  - Inputs: `{ pick_list_id, line_id }` path params, no body.
  - Outputs: Updated pick list detail payload for optimistic reconciliation.
  - Errors: Bubble toast + instrumentation error metadata; rely on ApiError for message.
  - Evidence: `src/lib/api/generated/hooks.ts:1610`
- Surface: `POST /api/pick-lists/{pick_list_id}/lines/{line_id}/undo`
  - Inputs: `{ pick_list_id, line_id }` path params.
  - Outputs: Updated detail payload with line reopened and header status adjusted.
  - Errors: Same handling as pick.
  - Evidence: `src/lib/api/generated/hooks.ts:1631`
- Surface: `GET /api/pick-lists/{pick_list_id}`
  - Inputs: `pick_list_id` path param.
  - Outputs: Authoritative detail used to reseed query cache after mutations.
  - Errors: Existing empty/error states remain.
  - Evidence: `src/lib/api/generated/hooks.ts:1594`
- Surface: `GET /api/kits/{kit_id}` & `POST /api/kits/pick-list-memberships/query`
  - Inputs: `kit_id` path and membership kit id arrays.
  - Outputs: Kit header chips and overview badge counts.
  - Errors: Already instrumented; execution hook must invalidate rather than reimplement fetching.
  - Evidence: `src/hooks/use-kit-memberships.ts:360`

### 5) Algorithms & UI Flows
- Flow: Pick a line from the workspace
1. User clicks the line’s `Pick` button in the new table "Actions" column; execution hook emits `pickLists.detail.execution` loading with metadata `{ action: 'pick', lineId, kitId, pickListId }` and disables only that line’s controls while the mutation is pending.
2. Optimistic reducer marks the target line `status='completed'`, updates group/open counts, and recalculates header `openLineCount`/`remainingQuantity` while leaving the `pickedAt` timestamp to refresh from the server payload.
  3. Mutation resolves → cache replaced with mapped server payload, availability queries for the line’s part refetched, instrumentation emits ready metadata including resulting status and whether list completed.
  - States / transitions: React Query status `idle → pending → success/error`; local `pendingActions` set toggles buttons.
  - Hotspots: Ensure optimistic refresh does not over-render entire table by memoising group transforms.
  - Evidence: `src/components/pick-lists/pick-list-lines.tsx:109`
- Flow: Undo a completed line
1. User clicks the row’s `Undo` control from the same "Actions" column; execution hook marks the specific line as pending and emits instrumentation with `{ action: 'undo' }`.
  2. Optimistic reducer flips line to `open`, clears `pickedAt`, increments header remaining counts, and re-enables other actions.
  3. On success, caches update with server payload; availability for the part refetches to show restored stock; instrumentation ready payload flags `status: 'open'`.
  - States / transitions: Similar to pick flow; guard prevents double-undo while pending.
  - Hotspots: Keep undo toast/action idempotent even if user re-clicks after error.
  - Evidence: `src/types/pick-lists.ts:167`
- Flow: Auto-complete / archive transition
  1. After optimistic pick completes, reducer checks `openLineCount === 0` → sets header status to `completed` and caches metadata for instrumentation.
  2. Success payload triggers kit detail + membership invalidations so chips move to archived grouping; reuse the stored `kitOverviewStatus`/`kitOverviewSearch` from route search (via `buildPickListDetailSearch`) when invalidating `buildKitsQueryKey` so overview buckets refresh consistently. If undo fires later, run the same invalidation cycle to revert counts to open.
  3. Instrumentation metadata surfaces `{ completion: true }` so tests assert the state transition without timing flakiness.
  - States / transitions: Derived boolean `isComplete` toggles once per mutation.
  - Hotspots: Ensure undo path restores `completedAt` only if server reports value.
  - Evidence: `src/components/pick-lists/pick-list-detail.tsx:156`

### 6) Derived State & Invariants
- Derived value: `pendingLineActions`
  - Source: `useReducer`-managed `Set<lineId>` (always cloned per update) tracked inside execution hook while mutations run.
  - Writes / cleanup: Adds the active line ID when a mutation starts and removes it on success/error so React re-renders disabled states.
  - Guards: Disallow new mutations on the same line while its ID is present; other lines remain interactive.
  - Invariant: A line cannot transition twice simultaneously.
  - Evidence: `src/components/pick-lists/pick-list-lines.tsx:109`
- Derived value: `isPickListComplete`
  - Source: `detail.openLineCount === 0` (post-optimistic update) derived from query data.
  - Writes / cleanup: Drives header badge, completion timestamp, and instrumentation metadata.
  - Guards: Only mark complete if at least one line existed; keep `completedAt` null until server confirms.
  - Invariant: When true, all group `openLineCount` values must be 0.
  - Evidence: `src/components/pick-lists/pick-list-detail.tsx:170`
- Derived value: `lineAvailabilityState`
  - Source: `usePickListAvailability` map keyed by `(partKey, location)`.
  - Writes / cleanup: Affected lines show spinner/unavailable label; hook refetched per part after mutation.
  - Guards: Skip shortfall banners for completed lines.
  - Invariant: Availability rows stay in sync with latest backend quantities.
  - Evidence: `src/hooks/use-pick-list-availability.ts:150`

### 7) State Consistency & Async Coordination
- Source of truth: React Query caches for pick list detail and kit membership summaries.
- Coordination: Execution hook updates detail cache via `queryClient.setQueryData`, refetches availability queries for affected part keys, invalidates kit detail + membership keys (both `pickMembershipQueryKey(kitIds, false)` and `pickMembershipQueryKey(kitIds, true)`), and triggers `queryClient.invalidateQueries(buildKitsQueryKey('active', searchState?.search))` / `buildKitsQueryKey('archived', searchState?.search)` so overview tabs refresh with the latest counts.
- Async safeguards: Cancel in-flight detail queries before writing optimistic state; store pre-mutation snapshot for rollbacks on error.
- Instrumentation: Wrap pending state with `useUiStateInstrumentation('pickLists.detail.execution', ...)` so Playwright can await `loading → ready/error` transitions.
- Evidence: `src/hooks/use-pick-list-detail.ts:46`

### 8) Errors & Edge Cases
- Failure: Pick mutation returns 4xx/5xx
  - Surface: `PickListDetail` toast + inline status on the targeted row.
  - Handling: Revert optimistic state, emit instrumentation with error metadata, re-enable controls, show `showException` toast.
  - Guardrails: Disable buttons while pending; reuse ApiError messaging.
  - Evidence: `src/components/kits/kit-pick-list-create-dialog.tsx:80`
- Failure: Undo mutation fails
  - Surface: Same workspace row.
  - Handling: Restore completed state, keep undo button visible, log instrumentation error for tests.
  - Guardrails: Pending set prevents double-undo.
  - Evidence: `src/components/kits/kit-archive-controls.tsx:61`
- Failure: Availability refetch fails
  - Surface: Availability cell shows “Unavailable” banner, instrumentation already handles errors for scope.
  - Handling: Keep optimistic detail but display existing red banner.
  - Guardrails: `usePickListAvailability` aggregates error messages per part.
  - Evidence: `src/components/pick-lists/pick-list-lines.tsx:60`
- Edge: Multi-line completion cascade
  - Surface: If final two lines picked quickly, ensure optimistic reducer dedupes and status stays consistent with server payload.
  - Handling: Serialize operations via pending set; rely on server response to reconcile counts.
  - Guardrails: Cancel outstanding queries before second mutation begins.
  - Evidence: `src/hooks/use-kit-memberships.ts:210`

### 9) Observability / Instrumentation
- Signal: `pickLists.detail.execution`
  - Type: UI state instrumentation event (`useUiStateInstrumentation`).
  - Trigger: Emitted when any pick/undo starts and resolves (success or error).
  - Labels / fields: `{ action, lineId, pickListId, kitId, pendingBefore, completionAfter }` to help tests assert state transitions.
  - Consumer: `waitForUiState(page, 'pickLists.detail.execution', phase)` helper.
  - Evidence: `src/lib/test/ui-state.ts:27`
- Signal: Existing list loading scopes (`pickLists.detail`, `pickLists.detail.lines`, `pickLists.detail.availability`)
  - Type: List loading instrumentation.
  - Trigger: Continue to fire on refetch after mutation; ready metadata should include updated counts.
  - Labels / fields: Extend `getLinesReadyMetadata` to reflect open/completed split.
  - Consumer: `waitForListLoading` in specs.
  - Evidence: `src/components/pick-lists/pick-list-detail.tsx:66`
- Signal: Toast success/error events (existing emitter)
  - Type: Toast instrumentation.
  - Trigger: Emit success toast only when the mutation transitions the overall pick list to `completed` (undo success falls back to quiet UI updates) and on any error.
  - Labels / fields: Message includes line part key and action; metadata ties to pick list id.
  - Consumer: Toast helper assertions.
  - Evidence: `src/components/kits/kit-pick-list-create-dialog.tsx:120`

### 10) Lifecycle & Background Work
- Hook / effect: Availability refetch effect
  - Trigger cadence: On each successful mutation when affected part keys change.
  - Responsibilities: Call `queryClient.invalidateQueries` for the part’s availability key so counts refresh without manual loops.
  - Cleanup: None beyond React Query lifecycle.
  - Evidence: `src/hooks/use-pick-list-availability.ts:14`
- Hook / effect: Pending action cleanup on unmount
  - Trigger cadence: Component unmount/navigation.
  - Responsibilities: Reset pending sets and emit aborted instrumentation to avoid phantom loading state.
  - Cleanup: Execution hook returns disposer that clears internal refs.
  - Evidence: `src/lib/test/ui-state.ts:64`

### 11) Security & Permissions
- Concern: Workspace access remains kit-operator scoped; no new gated data is exposed.
- Touchpoints: Route stays under `/pick-lists/$pickListId` using existing TanStack Router configuration.
- Mitigation: Reuse current guardrails; mutations already enforce authorization server-side.
- Residual risk: None new identified; rely on backend auth.
- Evidence: `src/routes/pick-lists/$pickListId.tsx:1`

### 12) UX / UI Impact
- Entry point: Pick list detail workspace (`/pick-lists/:pickListId`).
- Change: Add pick/undo buttons in a new table "Actions" column, plus disabled states and optimistic status badges.
- User interaction: Operators can complete or reopen lines inline; header badge and kit chip respond immediately.
- Dependencies: Uses shared `Button` components, instrumentation hooks, and availability map.
- Evidence: `src/components/pick-lists/pick-list-lines.tsx:74`

### 13) Deterministic Test Plan
- Surface: Pick list execution workspace
  - Scenarios:
    - Given an open line, When the user clicks `Pick`, Then instrumentation reports ready with `action: 'pick'`, UI shows status `Completed`, availability refetches, and kit summary eventually shows archived chip.
    - Given a completed line, When the user clicks `Undo`, Then instrumentation reports ready with `action: 'undo'`, UI reverts to open state, and kit summary chip returns to open grouping.
    - Given all lines complete, When navigating back to kit detail, Then the pick list chip badge shows `Completed` and kit overview badge decrements open count.
  - Instrumentation / hooks: `waitForUiState(page, 'pickLists.detail.execution', 'ready')`, `waitForListLoading(page, 'pickLists.detail', 'ready')`, `waitForListLoading(page, 'kits.overview', 'ready')` after navigations, toast helper for completion success, membership assertions via existing kit page object.
  - Gaps: None planned; cover both pick and undo plus completion.
  - Evidence: `tests/support/helpers.ts:63`
- Surface: Kit detail + overview regressions
  - Scenarios:
    - Given a kit with an open pick list, When lines complete, Then kit detail chips render `Completed` badge.
    - Given the overview badge shows open count, When completion occurs, Then the badge updates after instrumentation-ready event.
  - Instrumentation / hooks: Reuse `waitForUiState(page, 'kits.detail.links', 'ready')` and `waitForListLoading(page, 'kits.overview', 'ready')`.
  - Gaps: Overview assertion may rely on eventual consistency; allow instrumentation before verifying.
  - Evidence: `tests/e2e/kits/kit-detail.spec.ts:538`

### 14) Implementation Slices
- Slice: Execution hook & cache plumbing
  - Goal: Provide mutation wrappers with optimistic reducers, instrumentation wiring, and cache invalidation utilities (detail, pick membership includeDone variants, kits overview query keys).
  - Touches: `src/hooks/use-pick-list-execution.ts`, `src/hooks/use-pick-list-detail.ts`, `src/types/pick-lists.ts`.
  - Dependencies: None; establishes foundation for UI wiring.
- Slice: UI controls & instrumentation integration
  - Goal: Render pick/undo buttons, wire to execution hook, surface optimistic state, and extend instrumentation metadata.
  - Touches: `src/components/pick-lists/pick-list-detail.tsx`, `src/components/pick-lists/pick-list-lines.tsx`.
  - Dependencies: Execution hook ready.
- Slice: Playwright coverage & page objects
  - Goal: Update page objects, extend existing specs with execution scenarios, and assert instrumentation + kit summary sync.
  - Touches: `tests/support/page-objects/pick-lists-page.ts`, `tests/e2e/pick-lists/pick-list-detail.spec.ts`, `tests/e2e/kits/kit-detail.spec.ts`.
  - Dependencies: UI changes merged.

### 15) Risks & Open Questions
- Risk: Optimistic reducer diverges from server-calculated metrics if backend adjusts quantities.
  - Impact: UI may momentarily show wrong counts.
  - Mitigation: Use API response to overwrite optimistic state immediately, and keep metadata lightweight.
- Risk: Missing cache invalidation leaves kit badges stale.
  - Impact: Operators see outdated chip statuses.
  - Mitigation: Centralize query keys in execution hook and add unit test / Playwright assertion verifying update.
- Risk: Instrumentation metadata mismatch breaks deterministic waits.
  - Impact: Playwright flakes on execution scenarios.
  - Mitigation: Snapshot instrumentation payload shape in tests and reuse constants; add manual verification via test-event buffer during development.
- Decision: Emit success toast only when the list transitions to `completed`; individual pick/undo actions rely on inline feedback.
  - Why it matters: Keeps toast volume manageable while giving clear signal that the list archived successfully.
  - Owner / follow-up: Communicate to product/design; revert only if they request per-line notifications.

### 16) Confidence
Confidence: Medium — Existing hooks and payloads cover the needed data, but optimistic updates plus multi-query invalidation and new instrumentation require careful coordination to avoid drift or flaky tests.

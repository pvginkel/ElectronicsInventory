### 1) Summary & Decision
**Readiness**
The plan nails layout and data mapping but its telemetry story conflicts with the epic: `docs/features/kit_detail_workspace_readonly/plan.md:132-137` — "Emit `useListLoadingInstrumentation` (`kits.detail.contents`) and `useUiStateInstrumentation` (`kits.detail.toolbar`) with counts." cannot yield the filter-ready events mandated by `docs/epics/kits_feature_breakdown.md:66-69`, and `docs/features/kit_detail_workspace_readonly/plan.md:177-178` — "On 404, show `Kit not found`... ensuring instrumentation emits aborted metadata." contradicts `src/lib/test/query-instrumentation.ts:181-233` where aborted fires only on unmount while loading. Implementation would still require guesses around list-loading phases and 404 handling.

**Decision**
`GO-WITH-CONDITIONS` — Refine telemetry semantics (filter updates, 404 outcome, metadata fields) so they match the instrumentation helpers and epic contract.

### 2) Conformance & Fit (with evidence)
**Conformance to refs**
- `docs/epics/kits_feature_breakdown.md:66-69` — Fail — `docs/features/kit_detail_workspace_readonly/plan.md:132-137` — "Emit `useListLoadingInstrumentation` (`kits.detail.contents`)..." (the hook never re-enters loading for local filters, so the plan cannot satisfy the epic’s requirement to emit ready metadata after filter changes).
- `docs/contribute/architecture/application_overview.md:32-34` — Pass — `docs/features/kit_detail_workspace_readonly/plan.md:58-63` — "Wrap `useGetKitsByKitId`, normalize snake_case payloads..." (extends the documented pattern of adapting generated hooks inside `src/hooks/`).

**Fit with codebase**
- `src/components/kits/kit-card.tsx` — `docs/features/kit_detail_workspace_readonly/plan.md:46-48` — "Make tiles navigate to `/kits/$kitId`, surface disabled Edit button tooltip..." (aligns with existing card affordances but needs click handling to avoid clashing with embedded controls).
- `src/lib/test/query-instrumentation.ts` — `docs/features/kit_detail_workspace_readonly/plan.md:177-178` vs `src/lib/test/query-instrumentation.ts:181-233` — the plan expects an aborted payload on 404, yet the helper only emits `"phase: 'aborted'"` during unmount while still loading, so current wording misfits the shared instrumentation utility.

### 3) Open Questions & Ambiguities
- Question: Do we keep the user on `/kits/$kitId` with an error block or redirect back to `/kits` when the ID is invalid?
  - Why it matters: The plan mixes redirect language and an error view, and the deterministic test depends on the chosen pattern.
  - Needed answer: Confirm whether the route renders the error state (`docs/features/kit_detail_workspace_readonly/plan.md:175-178`) or navigates away (`docs/features/kit_detail_workspace_readonly/plan.md:55-56`).
- Question: Are reservation tooltips required in the read-only slice?
  - Why it matters: `docs/features/kit_detail_workspace_readonly/plan.md:74-76` adds a reservation tooltip, but the epic scope (`docs/epics/kits_feature_breakdown.md:55-58`) does not mention it; clarifying avoids extra UI/test work if deferred.
  - Needed answer: Decide whether the tooltip ships now or later mutations can introduce it.

### 4) Deterministic Playwright Coverage (new/changed behavior only)
- Behavior: Navigate from overview card to detail workspace
  - Scenarios:
    - Given a kit with contents, When navigating from the overview card, Then the header shows name/build target and disabled edit tooltip (`docs/features/kit_detail_workspace_readonly/plan.md:235-236`)
  - Instrumentation: `waitForListLoading(page, 'kits.detail', 'ready')` (`docs/features/kit_detail_workspace_readonly/plan.md:239`)
  - Backend hooks: Extend kit factories for navigation-ready kits (`docs/features/kit_detail_workspace_readonly/plan.md:78-80`)
  - Gaps: None noted
  - Evidence: `docs/features/kit_detail_workspace_readonly/plan.md:235-239`
- Behavior: Toolbar counters reflect backend aggregates
  - Scenarios:
    - Given populated contents, When the toolbar reports totals, Then counters match aggregates and `kits.detail.toolbar` emits ready metadata (`docs/features/kit_detail_workspace_readonly/plan.md:236`)
  - Instrumentation: `waitForUiState(page, 'kits.detail.toolbar', 'ready')` (`docs/features/kit_detail_workspace_readonly/plan.md:239`)
  - Backend hooks: Same seeded kit contents (`docs/features/kit_detail_workspace_readonly/plan.md:78-80`)
  - Gaps: None noted
  - Evidence: `docs/features/kit_detail_workspace_readonly/plan.md:236-239`
- Behavior: Filter reduces table rows and updates metadata
  - Scenarios:
    - Given a filter term matching a subset, When typing the filter, Then table rows reduce and `kits.detail.contents` metadata reflects visible counts (`docs/features/kit_detail_workspace_readonly/plan.md:237`)
  - Instrumentation: `waitForListLoading(page, 'kits.detail.contents', 'ready')` (`docs/features/kit_detail_workspace_readonly/plan.md:239`)
  - Backend hooks: Filterable contents from factories (`docs/features/kit_detail_workspace_readonly/plan.md:78-80`)
  - Gaps: Major — `useListLoadingInstrumentation` cannot emit a fresh ready event on pure client-side filtering, so the proposed wait will hang (`src/lib/test/query-instrumentation.ts:181-209`)
  - Evidence: `docs/features/kit_detail_workspace_readonly/plan.md:237-239`
- Behavior: Invalid kit ID surfaces error and telemetry
  - Scenarios:
    - Given an invalid kit ID, When visiting `/kits/99999999`, Then the error state appears and instrumentation emits an aborted event (`docs/features/kit_detail_workspace_readonly/plan.md:238`)
  - Instrumentation: `waitForListLoading(page, 'kits.detail', 'ready')` / aborted per plan (`docs/features/kit_detail_workspace_readonly/plan.md:239`)
  - Backend hooks: Rely on backend 404 behaviour (plan assumes existing)
  - Gaps: Major — the helper emits `phase: 'error'` for 404; no aborted event fires without unmount (`src/lib/test/query-instrumentation.ts:181-233`)
  - Evidence: `docs/features/kit_detail_workspace_readonly/plan.md:238-239`

### 5) **Adversarial Sweep (must find ≥3 credible issues or declare why none exist)**
**Major — Filter instrumentation cannot emit ready after typing**
**Evidence:** `docs/features/kit_detail_workspace_readonly/plan.md:132-137` — "Emit `useListLoadingInstrumentation` (`kits.detail.contents`)..." and `docs/features/kit_detail_workspace_readonly/plan.md:237` — "`kits.detail.contents` metadata reflects visible counts." Yet `src/lib/test/query-instrumentation.ts:181-209` shows `phase: 'ready'` only fires when `isLoading || isFetching` transitions from true to false. Typing in the client never toggles those flags, so the ready event never re-emits.  
**Why it matters:** Playwright waits on `kits.detail.contents` will hang, blocking deterministic verification of filtering.  
**Fix suggestion:** Drive filter waits via `useUiStateInstrumentation` (manual `beginUiState`/`endUiState`) or introduce an explicit test event that fires after filter recomputation instead of reusing `useListLoadingInstrumentation`.  
**Confidence:** High

**Major — 404 path expects aborted telemetry that cannot fire**
**Evidence:** `docs/features/kit_detail_workspace_readonly/plan.md:238` — "instrumentation emits an aborted event" and `docs/features/kit_detail_workspace_readonly/plan.md:177-178` — "ensuring instrumentation emits aborted metadata." But `src/lib/test/query-instrumentation.ts:220-233` shows aborted only emits during unmount while loading; a 404 resolves the query with an error, producing `phase: 'error'`.  
**Why it matters:** Tests waiting for an aborted payload will time out, and implementation would have to invent unplanned redirect logic to satisfy the plan.  
**Fix suggestion:** Update the plan to expect an `error` event (and assert metadata via `getErrorMetadata`) or explicitly redirect so the loading is aborted.  
**Confidence:** High

**Major — Missing required `filteredCount` metadata on `kits.detail` scope**
**Evidence:** `docs/epics/kits_feature_breakdown.md:66-67` — "`kits.detail`... (metadata: `kitId`, `status`, `contentCount`, `filteredCount`)." The plan softens this to `docs/features/kit_detail_workspace_readonly/plan.md:190` — "Labels / fields: `{ kitId, status, contentCount, filteredCount? }`."  
**Why it matters:** Making `filteredCount` optional breaks the deterministic filter checks mandated by the epic and forces the test harness to guess when the field is absent.  
**Fix suggestion:** Commit to always providing `filteredCount` (mirroring the contents scope) or justify an alternative metadata contract.  
**Confidence:** Medium

### 6) **Derived-Value & State Invariants (table)**
- Derived value: filteredRows
  - Source dataset: Detail contents filtered by search string (`docs/features/kit_detail_workspace_readonly/plan.md:153-156`)
  - Write / cleanup triggered: Recomputed via `useMemo`, resets on payload change (`docs/features/kit_detail_workspace_readonly/plan.md:153-156`)
  - Guards: Lowercase comparison, null-safe manufacturer/note handling (`docs/features/kit_detail_workspace_readonly/plan.md:156-158`)
  - Invariant: Visible rows always honor the filter terms (`docs/features/kit_detail_workspace_readonly/plan.md:157-158`)
  - Evidence: `docs/features/kit_detail_workspace_readonly/plan.md:153-158`
- Derived value: summaryCounters
  - Source dataset: Aggregates of totalRequired/available/shortfall (`docs/features/kit_detail_workspace_readonly/plan.md:160-162`)
  - Write / cleanup triggered: Memoized object shared by toolbar/instrumentation (`docs/features/kit_detail_workspace_readonly/plan.md:161-162`)
  - Guards: Defaults to zero, clamps shortfall to >= 0 (`docs/features/kit_detail_workspace_readonly/plan.md:163-164`)
  - Invariant: `filteredShortfall ≤ totalShortfall` alongside synchronized counter updates (`docs/features/kit_detail_workspace_readonly/plan.md:164-165`)
  - Evidence: `docs/features/kit_detail_workspace_readonly/plan.md:160-165`
- Derived value: isArchived
  - Source dataset: Kit status from detail payload (`docs/features/kit_detail_workspace_readonly/plan.md:167-169`)
  - Write / cleanup triggered: Consumed by header controls and badges (`docs/features/kit_detail_workspace_readonly/plan.md:169-170`)
  - Guards: Treat unknown status as archived until data resolves (`docs/features/kit_detail_workspace_readonly/plan.md:169-170`)
  - Invariant: Disabled edit affordance always matches backend status (`docs/features/kit_detail_workspace_readonly/plan.md:171-172`)
  - Evidence: `docs/features/kit_detail_workspace_readonly/plan.md:167-172`

### 7) Risks & Mitigations (top 3)
- Risk: Filtering large BOMs could trigger heavy re-rendering (`docs/features/kit_detail_workspace_readonly/plan.md:262-264`)
  - Mitigation: Memoize derived arrays and consider virtualization if perf shows issues (`docs/features/kit_detail_workspace_readonly/plan.md:264-265`)
- Risk: Backend payloads missing `contents` or badge counts would break header instrumentation (`docs/features/kit_detail_workspace_readonly/plan.md:265-267`)
  - Mitigation: Guard undefined fields and surface errors via toast/error state (`docs/features/kit_detail_workspace_readonly/plan.md:267-268`)
- Risk: Divergent filter metadata/counters if calculations happen in multiple places (`docs/features/kit_detail_workspace_readonly/plan.md:268-270`)
  - Mitigation: Centralize aggregate calculation in `useKitDetail` and reuse for UI + telemetry (`docs/features/kit_detail_workspace_readonly/plan.md:270-271`)

### 8) Confidence
<confidence_template>Confidence: Low — Instrumentation semantics (filter lifecycle, 404 outcome, metadata fields) remain unresolved and block deterministic tests.</confidence_template>

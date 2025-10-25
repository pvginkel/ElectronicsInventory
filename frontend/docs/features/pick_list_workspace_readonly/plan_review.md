### 1) Summary & Decision
**Readiness**
The plan covers routing, domain mapping, and instrumentation, but two implementation blockers remain: it directs us to call “Optionally prefetch `buildKitDetailQueryKey(kitId)`” via `queryClient.prefetchQuery(buildKitDetailQueryKey(kitId))` without a `queryFn` (`docs/features/pick_list_workspace_readonly/plan.md:169`, `docs/features/pick_list_workspace_readonly/plan.md:278`), and it proposes “trigger `useGetPartsLocationsByPartKey` queries (batched via `useQueries`)" even though the generated hook already wraps `useQuery`, so composing it that way violates the Rules of Hooks (`docs/features/pick_list_workspace_readonly/plan.md:146`, `docs/features/pick_list_workspace_readonly/plan.md:284`; `src/lib/api/generated/hooks.ts:1541-1605`). The deterministic test plan also assumes a backend payload can omit `kit_id`, which contradicts the schema (`docs/features/pick_list_workspace_readonly/plan.md:311`; `src/lib/api/generated/types.ts:3389-3415`).

**Decision**
`GO-WITH-CONDITIONS` — Clarify the React Query strategy and drop the impossible `kit_id`-less scenario before implementation.

### 2) Conformance & Fit (with evidence)
**Conformance to refs**
- `docs/epics/kits_feature_breakdown.md` — Pass — `docs/features/pick_list_workspace_readonly/plan.md:306-313` — “Given … `waitForUiState(page, 'pickLists.detail.load', 'ready')`” satisfies the mandated instrumentation-driven test coverage.
- `docs/contribute/architecture/application_overview.md` — Fail — `docs/features/pick_list_workspace_readonly/plan.md:146` / `docs/features/pick_list_workspace_readonly/plan.md:284` — “trigger `useGetPartsLocationsByPartKey` … batched via `useQueries`” conflicts with the guidance to wrap the generated hooks directly; the hook itself already invokes `useQuery` (`src/lib/api/generated/hooks.ts:1541-1605`).

**Fit with codebase**
- `usePickListAvailability` — `docs/features/pick_list_workspace_readonly/plan.md:146`, `docs/features/pick_list_workspace_readonly/plan.md:284` — Mixing `useQueries` with the existing `useGetPartsLocationsByPartKey` hook will produce hook-order violations because the generated hook already creates a `useQuery`.
- `queryClient.prefetchQuery` — `docs/features/pick_list_workspace_readonly/plan.md:169`, `docs/features/pick_list_workspace_readonly/plan.md:278` — `buildKitDetailQueryKey` (`src/hooks/use-kit-detail.ts:29-36`) returns only a key tuple; without a fetcher the prefetch call will fail type-checking at compile time.
- `PartInlineSummary` — `docs/features/pick_list_workspace_readonly/plan.md:104-107` defines `part.description: string | null`, but the target component requires `description: string` (`src/components/parts/part-inline-summary.tsx:8-34`), so the data contract needs a non-null fallback.

### 3) Open Questions & Ambiguities
- Question: How should we prefetch kit detail without a `queryFn`?  
  Why it matters: `queryClient.prefetchQuery(buildKitDetailQueryKey(kitId))` will fail because React Query requires a fetcher.  
  Needed answer: Decide whether to call `ensureQueryData` with an explicit API client or drop the prefetch.
- Question: What batching strategy keeps live availability within hook rules?  
  Why it matters: Invoking the generated `useGetPartsLocationsByPartKey` inside `useQueries` violates React’s hook ordering.  
  Needed answer: Commit to either issuing raw `api.GET` calls inside `useQueries` or building a different wrapper.
- Question: Do we actually need to support a missing `kit_id` state?  
  Why it matters: The schema marks `kit_id` as required, so tests cannot seed the “response omits kit_id” scenario.  
  Needed answer: Remove or replace that scenario with something the backend can produce.

### 4) Deterministic Playwright Coverage (new/changed behavior only)
- Behavior: Pick list detail workspace  
  - Scenarios: `{seeded pick list → header + instrumentation}`, `{grouped lines → part/location/quantity visible}`, `{kit_id present → kit link chip preserves status/search}`, `{kit_id omitted → breadcrumbs hide kit crumb}`, `{shortfall → alert after availability}` (`docs/features/pick_list_workspace_readonly/plan.md:306-312`).  
  - Instrumentation: `waitForListLoading(page, 'pickLists.detail', 'ready')`, `waitForUiState(page, 'pickLists.detail.load', 'ready')`, `waitForUiState(page, 'pickLists.detail.availability', 'ready')` (`docs/features/pick_list_workspace_readonly/plan.md:313`).  
  - Backend hooks: Factories seeding pick lists and inventory (`docs/features/pick_list_workspace_readonly/plan.md:70-95`).  
  - Gaps: **Major** — The “response omits kit_id” scenario cannot be seeded because `kit_id` is required (`docs/features/pick_list_workspace_readonly/plan.md:311`; `src/lib/api/generated/types.ts:3389-3415`).

- Behavior: Kit detail → pick list navigation  
  - Scenarios: `{click chip → /pick-lists/<id> with preserved filters}`, `{click back → kit detail reloads + instrumentation}` (`docs/features/pick_list_workspace_readonly/plan.md:317-320`).  
  - Instrumentation: `waitForListLoading(page, 'kits.detail', 'ready')`, `waitForListLoading(page, 'pickLists.detail', 'ready')` (`docs/features/pick_list_workspace_readonly/plan.md:321`).  
  - Backend hooks: Kit factories plus pick list seeds (`docs/features/pick_list_workspace_readonly/plan.md:76-88`).  
  - Gaps: None once navigation search props are finalized.

### 5) Adversarial Sweep (must find ≥3 credible issues or declare why none exist)
**Major — Prefetch without queryFn will fail**
**Evidence:** `docs/features/pick_list_workspace_readonly/plan.md:169`, `docs/features/pick_list_workspace_readonly/plan.md:278` — “Optionally prefetch `buildKitDetailQueryKey(kitId)`” and “Call `queryClient.prefetchQuery(buildKitDetailQueryKey(kitId))`…”.  
**Why it matters:** React Query’s `prefetchQuery` requires a `queryFn`; calling it with only a key tuple produces a TypeScript error and no prefetch.  
**Fix suggestion:** Either supply an explicit fetcher (e.g., reusing the generated client) or swap to `ensureQueryData`/`prefetchQuery({ queryKey, queryFn })`.  
**Confidence:** High

**Major — `useQueries` + generated hook breaks hook ordering**
**Evidence:** `docs/features/pick_list_workspace_readonly/plan.md:146`, `docs/features/pick_list_workspace_readonly/plan.md:284` — “trigger `useGetPartsLocationsByPartKey` queries (batched via `useQueries`)” / “Kick off `useQueries` batch fetching…”. The hook itself already wraps `useQuery` (`src/lib/api/generated/hooks.ts:1541-1605`).  
**Why it matters:** You cannot call a hook that internally runs `useQuery` inside a `useQueries` configuration; React will throw because the number of hook invocations becomes data-dependent.  
**Fix suggestion:** Use `useQueries` with raw `api.GET` fetchers or expose a dedicated availability hook that doesn’t wrap `useQuery` internally.  
**Confidence:** High

**Major — Test plan expects impossible `kit_id` gap**
**Evidence:** `docs/features/pick_list_workspace_readonly/plan.md:311` — “Given the response omits `kit_id`…”, but the schema requires `kit_id: number` (`src/lib/api/generated/types.ts:3389-3415`).  
**Why it matters:** Playwright cannot seed or observe that state against the real backend, so the scenario is untestable and will stall coverage.  
**Fix suggestion:** Remove the scenario or replace it with something the backend can actually emit (e.g., deep link without prior search context but still with `kit_id`).  
**Confidence:** High

**Minor — Part summary needs non-null description**
**Evidence:** `docs/features/pick_list_workspace_readonly/plan.md:104-107` — `part: { … description: string | null }`; `src/components/parts/part-inline-summary.tsx:8-34` — `description: string` prop.  
**Why it matters:** Passing `null` to `PartInlineSummary` will break type-checking; the plan should call out a fallback string.  
**Fix suggestion:** Add a mapper step that defaults `description ?? 'No description provided'` (or similar) before rendering.  
**Confidence:** Medium

### 6) Derived-Value & State Invariants (table)
- Derived value: `kitLinkChipProps`  
  - Source dataset: `detail.kitId`, `detail.kitName`, validated search (`status`, `search`).  
  - Write / cleanup triggered: Feeds `KitLinkChip` and breadcrumb URLs.  
  - Guards: Hide chip when `kitId` absent; normalize search defaults.  
  - Invariant: When rendered, navigation must land on an existing kit route with preserved filters.  
  - Evidence: `docs/features/pick_list_workspace_readonly/plan.md:190-195`.

- Derived value: `lineGroups`  
  - Source dataset: `detail.lines` grouped by `kitContentId`.  
  - Write / cleanup triggered: Controls render order and group statistics.  
  - Guards: Memoize on detail identity; default to `[]`.  
  - Invariant: Sum of group counts equals `detail.lineCount`.  
  - Evidence: `docs/features/pick_list_workspace_readonly/plan.md:184-188`.

- Derived value: `lineAvailability`  
  - Source dataset: Merged `useGetPartsLocationsByPartKey` responses keyed by part/location.  
  - Write / cleanup triggered: Supplies `inStock`/`shortfall` badges and instrumentation metadata.  
  - Guards: Treat missing entries as `null`; only flag shortfall for open lines.  
  - Invariant: Shortfall alerts fire iff `status === 'open'` and `inStock < quantityToPick`.  
  - Evidence: `docs/features/pick_list_workspace_readonly/plan.md:204-208`.

### 7) Risks & Mitigations (top 3)
- Risk: React Query prefetch step fails compilation.  
  Mitigation: Specify an explicit `queryFn` or drop the prefetch call.  
  Evidence: `docs/features/pick_list_workspace_readonly/plan.md:169`, `docs/features/pick_list_workspace_readonly/plan.md:278`.
- Risk: Availability batching violates hook rules and crashes at runtime.  
  Mitigation: Rework the batching strategy around raw fetchers or a custom wrapper that doesn’t invoke nested hooks.  
  Evidence: `docs/features/pick_list_workspace_readonly/plan.md:146`, `docs/features/pick_list_workspace_readonly/plan.md:284`; `src/lib/api/generated/hooks.ts:1541-1605`.
- Risk: Playwright coverage stalls on an unattainable backend state.  
  Mitigation: Replace the “kit_id omitted” scenario with one the backend can produce.  
  Evidence: `docs/features/pick_list_workspace_readonly/plan.md:311`; `src/lib/api/generated/types.ts:3389-3415`.

### 8) Confidence
Confidence: Medium — The remaining issues are well-understood but need resolution to avoid hook/order failures and unblock test coverage.

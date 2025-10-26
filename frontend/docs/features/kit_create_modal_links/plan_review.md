### 1) Summary & Decision
<plan_review_summary_template>
**Readiness**
The plan captures key surfaces but leaves critical behaviors underspecified: cache updates target a non-existent `['getKits', status]` key even though the overview queries are keyed by full search params (`docs/features/kit_create_modal_links/plan.md:160`; `src/hooks/use-kits.ts:24-55`), the fate of deep links to `/kits/new` is hand-waved with “potentially redirect” and never folded into the flows or tests (`docs/features/kit_create_modal_links/plan.md:60-63`), and the Playwright coverage relies on an undefined “simulate via test data teardown” error path that isn’t deterministic against the real backend (`docs/features/kit_create_modal_links/plan.md:298-301`; `docs/contribute/testing/playwright_developer_guide.md:14-18`).

**Decision**
`GO-WITH-CONDITIONS` — clarify the cache invalidation strategy, specify (and cover) `/kits/new` behavior, and replace the nondeterministic error scenario with a real backend setup before implementation proceeds.
</plan_review_summary_template>

### 2) Conformance & Fit (with evidence)
<plan_conformance_fit_template>
**Conformance to refs**
- `docs/contribute/testing/playwright_developer_guide.md:14-18` — Fail — `docs/features/kit_create_modal_links/plan.md:298-301` — “Given the kit usage API returns error (simulate via test data teardown)…”, which conflicts with the real-backend-only guidance.

**Fit with codebase**
- `useKitsOverview` caching — `docs/features/kit_create_modal_links/plan.md:160` vs `src/hooks/use-kits.ts:24-55` — Plan assumes cache keys shaped as `['getKits', status]`, but the hook stores results under `['getKits', { query: { status, query? } }]`; optimistic inserts or invalidations would miss every active query.
- `src/routes/kits/new.tsx` — `docs/features/kit_create_modal_links/plan.md:60-63` — Plan notes the route “potentially redirect[s] back to `/kits`” yet never states how deep links open the modal or preserve query params, leaving existing navigation paths undefined.
</plan_conformance_fit_template>

### 3) Open Questions & Ambiguities
<open_question_template>
- Question: What is the exact UX when a user visits `/kits/new` directly—should the modal auto-open with state derived from URL params, or should we redirect with a toast?
- Why it matters: Existing bookmarks and tests reach this route today; without a defined behavior we risk blank screens or lost context.
- Needed answer: Document the desired routing + state hand-off and fold it into the flows/tests.
</open_question_template>
<open_question_template>
- Question: How will the Playwright suite reliably trigger the “kit usage API returns error” scenario without violating the real-backend policy?
- Why it matters: “Simulate via test data teardown” lacks a deterministic backend hook and risks brittle specs.
- Needed answer: Either document a factory-driven backend setup that yields the failure or drop the scenario.
</open_question_template>

### 4) Deterministic Playwright Coverage (new/changed behavior only)
<plan_coverage_template>
- Behavior: Kits overview create modal
- Scenarios:
  - Given the overview is ready, When the user clicks `New Kit`, Then the modal opens and emits `KitOverview:create` open/submit/success (`tests/e2e/kits/kits-overview.spec.ts`)
- Instrumentation: `form` events via `useFormInstrumentation`
- Backend hooks: `testData.kits.create` + generated hooks
- Gaps: No coverage for the `/kits/new` deep link despite retiring the route (`docs/features/kit_create_modal_links/plan.md:60-63,284-293`)
- Evidence: `docs/features/kit_create_modal_links/plan.md:284-293`
</plan_coverage_template>
<plan_coverage_template>
- Behavior: Parts list kit indicators
- Scenarios:
  - Given a part used in kits, When the list loads, Then both indicators render with tooltips (`tests/e2e/shopping-lists/parts-entrypoints.spec.ts`)
  - Given the kit usage API returns error, When the list loads, Then the kit indicator shows the error glyph
- Instrumentation: `waitForListLoading(page, 'parts.list.kitIndicators', 'ready')`
- Backend hooks: Kit usage endpoint via factories
- Gaps: Error scenario depends on “simulate via test data teardown” with no deterministic backend recipe, violating test policy (`docs/features/kit_create_modal_links/plan.md:296-302`)
- Evidence: `docs/features/kit_create_modal_links/plan.md:296-302`
</plan_coverage_template>
<plan_coverage_template>
- Behavior: Part detail link badges
- Scenarios:
  - Given a part with shopping list + kit memberships, Then the combined panel lists both chip sets
  - Given kit usage only, Then shopping list slots render the empty copy while kits show chips
- Instrumentation: `waitForListLoading(page, 'parts.detail.kits', 'ready')` plus existing `parts.detail.shoppingLists`
- Backend hooks: Part + kit factories to seed memberships
- Gaps: Need explicit wait/assert for the shopping-list instrumentation so the merged panel doesn’t assert before both queries complete
- Evidence: `docs/features/kit_create_modal_links/plan.md:305-313`
</plan_coverage_template>

### 5) Adversarial Sweep (must find ≥3 credible issues or declare why none exist)
<finding_template>
**Major — Overview cache invalidation misses search-aware keys**
**Evidence:** `docs/features/kit_create_modal_links/plan.md:160` — “Optimistically insert… (`['getKits', status]`)”; `src/hooks/use-kits.ts:24-55` — overview queries are keyed by `{ query: { status, query? } }`.
**Why it matters:** Using the wrong key leaves filtered tabs stale after creation and breaks the dedupe logic the plan depends on.
**Fix suggestion:** Document use of `buildKitsQueryKey(status, search)` (or invalidation via `queryClient.invalidateQueries({ queryKey: ['getKits'] })` with predicate) so every in-flight cache updates.
**Confidence:** High
</finding_template>
<finding_template>
**Major — `/kits/new` deep link behavior undefined**
**Evidence:** `docs/features/kit_create_modal_links/plan.md:60-63` — “Retire or repurpose the placeholder route, potentially redirecting back to `/kits`”; no algorithm/test step covers this transition (`docs/features/kit_create_modal_links/plan.md:155-164,284-293`).
**Why it matters:** Direct navigation (existing links, browser history) would hit a dead route, leaving users without a creation path or opening state.
**Fix suggestion:** Specify the redirect vs. modal-auto-open behavior, include state transfer (e.g., search params), and add deterministic coverage.
**Confidence:** Medium
</finding_template>
<finding_template>
**Major — Non-deterministic kit usage error scenario**
**Evidence:** `docs/features/kit_create_modal_links/plan.md:298-301` — “simulate via test data teardown”; `docs/contribute/testing/playwright_developer_guide.md:14-18` — specs must rely on real backend behavior without ad hoc failures.
**Why it matters:** Tests without a deterministic backend setup will flake or require forbidden mocks.
**Fix suggestion:** Replace with a factory-driven failure (e.g., create a kit, revoke permissions via API) or drop the scenario and rely on unit coverage.
**Confidence:** Medium
</finding_template>

### 6) Derived-Value & State Invariants (table)
<derived_value_template>
- Derived value: Kit overview buckets (active/archived arrays)
  - Source dataset: `useKitsOverview` queries keyed by status + search (`src/hooks/use-kits.ts:24-55`)
  - Write / cleanup triggered: Optimistic insert + invalidation described for creation (`docs/features/kit_create_modal_links/plan.md:160-164`)
  - Guards: Must respect the current search term before inserting; otherwise new kits leak into unrelated filters
  - Invariant: Bucket membership matches the query params used for that cache entry
  - Evidence: `docs/features/kit_create_modal_links/plan.md:45-47,160-164`
</derived_value_template>
<derived_value_template>
- Derived value: `kitIndicatorSummary` for list cards
  - Source dataset: `PartKitUsageSchema` mapped to summaries (`docs/features/kit_create_modal_links/plan.md:114-124,169-175`)
  - Write / cleanup triggered: React Query lookups per visible part; tooltip render depends on summary counts
  - Guards: Must clamp to zero memberships on fetch errors to avoid stale tooltips
  - Invariant: Indicator shows only active kits when `summary.hasMembership` is true
  - Evidence: `docs/features/kit_create_modal_links/plan.md:169-175`
</derived_value_template>
<derived_value_template>
- Derived value: `linkPanelState` merged view
  - Source dataset: Shopping list memberships + kit usage queries (`docs/features/kit_create_modal_links/plan.md:182-185,191-199`)
  - Write / cleanup triggered: Combined panel renders chips/errors based on both query results
  - Guards: Must render skeleton/error until both queries settle to avoid mixing empty + loaded states
  - Invariant: Panel never shows the empty copy while either query is still loading or errored
  - Evidence: `docs/features/kit_create_modal_links/plan.md:182-199`
</derived_value_template>

### 7) Risks & Mitigations (top 3)
<risk_template>
- Risk: Overview caches stay stale because optimistic updates target the wrong key shape
- Mitigation: Align with `buildKitsQueryKey` or invalidate via predicate over `['getKits']`
- Evidence: `docs/features/kit_create_modal_links/plan.md:160`; `src/hooks/use-kits.ts:24-55`
</risk_template>
<risk_template>
- Risk: Users navigating to `/kits/new` lose the creation affordance after the placeholder route is removed
- Mitigation: Define redirect vs. modal auto-open and add a coverage scenario before implementation
- Evidence: `docs/features/kit_create_modal_links/plan.md:60-63`
</risk_template>
<risk_template>
- Risk: Playwright suite becomes flaky due to non-deterministic error setup for kit indicators
- Mitigation: Replace “simulate via teardown” with a backend factory or drop the scenario
- Evidence: `docs/features/kit_create_modal_links/plan.md:296-302`; `docs/contribute/testing/playwright_developer_guide.md:14-18`
</risk_template>

### 8) Confidence
<confidence_template>Confidence: Medium — The plan nails the general surfaces, but the unresolved cache key, routing, and test gaps leave significant risk until addressed.</confidence_template>

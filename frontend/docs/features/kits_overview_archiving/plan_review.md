### 1) Summary & Decision
**Readiness**
Feature scope lines up with the epic, but the plan leaves critical execution gaps: toast instrumentation assumes an `action` field we do not emit, cross-tab data flow does not yet guarantee archived counts are available, and the router search contract would push `query=null` to the backend.

**Decision**
`GO-WITH-CONDITIONS` — the plan needs instrumentation, data-shaping, and search-param corrections before implementation proceeds.

### 2) Conformance & Fit
**Conformance to refs**
- `docs/epics/kits_feature_breakdown.md` — Pass — `docs/features/kits_overview_archiving/plan.md:30-33` — “Build a Kits overview route with cards, segmented tabs, counts, and search tied to generated queries.”
- `docs/contribute/testing/playwright_developer_guide.md` — Fail — `docs/features/kits_overview_archiving/plan.md:247-251` — “Labels / fields: `{ level, message, action: 'undo' }`.” (Toast events currently lack an `action` payload, so the instrumentation contract is not satisfied.)

**Fit with codebase**
- `ListScreenLayout` reuse — `docs/features/kits_overview_archiving/plan.md:67-69` — Reuses the existing list shell, which matches `src/components/layout/list-screen-layout.tsx`.
- `src/lib/test/toast-instrumentation.ts` — `docs/features/kits_overview_archiving/plan.md:247-251` vs `src/types/test-events.ts:71-80` — Plan expects toast events to expose `action`, but the type only allows `level`, `code`, `message`, `exception`.
- `Router search handling` — `docs/features/kits_overview_archiving/plan.md:118-120` vs `src/routes/types/index.tsx:5-8` — Other routes drop empty search params instead of sending `null`, so the proposed `string|null` contract would diverge.

### 3) Open Questions & Ambiguities
- Question: How will `useKitsOverview` surface archived data early enough to back the promised tab counts? (`docs/features/kits_overview_archiving/plan.md:152-165`, `docs/features/kits_overview_archiving/plan.md:189-193`)
  - Why it matters: Without a concrete parallel query or cache-read, the archived badge and instant switch guarantee are not met.
  - Needed answer: Confirm whether the hook issues dual queries, reads `queryClient.getQueryData`, or uses another mechanism to hydrate both buckets.
- Question: What route should the “New Kit” CTA target? (`docs/features/kits_overview_archiving/plan.md:339-341`)
  - Why it matters: Navigation wiring and Playwright coverage depend on the final URL.
  - Needed answer: Finalize the destination (`/kits/new`, draft detail, etc.) and any parameters it must pass.

### 4) Deterministic Playwright Coverage
- Behavior: Kits overview tabs
  - Scenarios: “Given seeded active and archived kits… Then `list_loading` emits ready metadata” / “Given a debounced search term… counts update” (`docs/features/kits_overview_archiving/plan.md:280-286`).
  - Instrumentation: `waitForListLoading(page,'kits.overview','ready')`.
  - Backend hooks: Kit factory to seed active/archived records.
  - Gaps: Plan does not explain how archived data is hydrated ahead of the first tab switch, so the scenario may flake.
  - Evidence: `docs/features/kits_overview_archiving/plan.md:280-286`.
- Behavior: Archive undo flow
  - Scenarios: Archive then undo with toast assertions (`docs/features/kits_overview_archiving/plan.md:289-295`).
  - Instrumentation: `trackFormSubmit/Success/Error`, toast viewport selectors.
  - Backend hooks: Kit factory mutations.
  - Gaps: Toast events do not yet expose `action`, so deterministic waits on the Undo button lack a contract.
  - Evidence: `docs/features/kits_overview_archiving/plan.md:289-295`.
- Behavior: Sidebar navigation
  - Scenarios: Sidebar link activates Kits (`docs/features/kits_overview_archiving/plan.md:296-301`).
  - Instrumentation: Existing app-shell selectors.
  - Backend hooks: None beyond seeded kits.
  - Gaps: None noted.
  - Evidence: `docs/features/kits_overview_archiving/plan.md:296-301`.
- Behavior: New Kit CTA
  - Scenarios: **Missing** — CTA is in scope but no test covers navigation.
  - Instrumentation: N/A (not planned).
  - Backend hooks: Needs confirmation of destination route.
  - Gaps: No deterministic coverage for this mandatory entry point.
  - Evidence: `docs/features/kits_overview_archiving/plan.md:32`, `docs/features/kits_overview_archiving/plan.md:280-302`.

### 5) Adversarial Sweep (must find ≥3)
**Major — Toast instrumentation lacks action metadata**
**Evidence:** `docs/features/kits_overview_archiving/plan.md:247-251` — “Labels / fields: `{ level, message, action: 'undo' }`.” and `src/types/test-events.ts:71-80` — toast events only include `level`, `code`, `message`, `exception`.
**Why it matters:** Tests cannot assert on an `action` that is neither typed nor emitted, so the undo flow loses deterministic coverage.
**Fix suggestion:** Extend the plan to update `ToastTestEvent` and `instrumentToast` to include optional `action` metadata and emit it from the undo-capable toast helper.
**Confidence:** High

**Major — Tab counts rely on data never fetched**
**Evidence:** `docs/features/kits_overview_archiving/plan.md:152-154` — “Call `useKitsOverview` which delegates to `useGetKits` with `{ status, query }`” and `docs/features/kits_overview_archiving/plan.md:189-193` — “tabCounts… Source: Raw arrays per status from useKitsOverview.”
**Why it matters:** Only the active status is queried, so archived counts will be empty until the user switches tabs, breaking the “segmented tabs, counts, and search” contract.
**Fix suggestion:** Specify dual queries (e.g., `useQueries`) or cache reads that hydrate both statuses in `useKitsOverview`, and describe how counts stay in sync with optimistic moves.
**Confidence:** Medium

**Major — Router search contract sends `query=null`**
**Evidence:** `docs/features/kits_overview_archiving/plan.md:118-120` — “Shape: `{"status":"active"|"archived","query":string|null}`” contrasted with `src/routes/types/index.tsx:5-8` — other routes omit the param instead of using `null`.
**Why it matters:** Passing `null` serializes as `?query=null`, so the backend will treat `"null"` as a search term and return zero kits.
**Fix suggestion:** Align with existing routes by treating empty search as `undefined` and returning `{}` from `validateSearch` so the query string drops the key.
**Confidence:** High

**Major — Missing Playwright coverage for New Kit CTA**
**Evidence:** In-scope requirement `docs/features/kits_overview_archiving/plan.md:32` lacks a matching entry in the deterministic test plan `docs/features/kits_overview_archiving/plan.md:280-302`.
**Why it matters:** The CTA is a primary navigation path; without a spec the UI can drift or break silently, violating the “UI & Playwright coupling” rule.
**Fix suggestion:** Add a scenario (and instrumentation if needed) that seeds prerequisites, clicks the CTA, and asserts the router navigates to the agreed destination.
**Confidence:** High

### 6) Derived-Value & State Invariants
- Derived value: visibleKits
  - Source dataset: React Query data for the selected status plus optimistic overrides (`docs/features/kits_overview_archiving/plan.md:182-186`).
  - Write / cleanup triggered: Recomputed on status/search change; cleared on unmount.
  - Guards: Skip while loading.
  - Invariant: Only kits matching status + search appear.
  - Evidence: `docs/features/kits_overview_archiving/plan.md:182-186`.
- Derived value: tabCounts
  - Source dataset: Raw arrays per status from `useKitsOverview` (`docs/features/kits_overview_archiving/plan.md:189-193`).
  - Write / cleanup triggered: Memoized counts invalidated on refetch.
  - Guards: Clamp to ≥0, ensure archived tab populates off-screen.
  - Invariant: Tab badges should reflect totals per status.
  - Evidence: `docs/features/kits_overview_archiving/plan.md:189-193`.
- Derived value: lifecyclePendingMap
  - Source dataset: Local map keyed by kit id (`docs/features/kits_overview_archiving/plan.md:196-200`).
  - Write / cleanup triggered: Set on submit, cleared on success/failure/unmount.
  - Guards: Block conflicting entries during rapid toggles.
  - Invariant: A pending kit never shows both archive and unarchive buttons enabled.
  - Evidence: `docs/features/kits_overview_archiving/plan.md:196-200`.

### 7) Risks & Mitigations
- Risk: Toast undo action lacks instrumentation contract.
  - Mitigation: Expand plan to modify `ToastTestEvent` and the instrumentation pipeline to emit `action`.
  - Evidence: `docs/features/kits_overview_archiving/plan.md:247-251`, `src/types/test-events.ts:71-80`.
- Risk: Archived tab counts remain zero until navigation.
  - Mitigation: Document a dual-query or cache-hydration strategy inside `useKitsOverview`.
  - Evidence: `docs/features/kits_overview_archiving/plan.md:152-154`, `docs/features/kits_overview_archiving/plan.md:189-193`.
- Risk: Search persistence writes `?query=null` into the URL and backend calls.
  - Mitigation: Follow existing `validateSearch` pattern to omit empty search params.
  - Evidence: `docs/features/kits_overview_archiving/plan.md:118-120`, `src/routes/types/index.tsx:5-8`.

### 8) Confidence
Confidence: Medium — Scope matches prior list patterns, but the missing instrumentation and data-shaping details leave material uncertainty until the plan is amended.

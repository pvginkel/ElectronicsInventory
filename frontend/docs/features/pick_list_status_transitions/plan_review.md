### 1) Summary & Decision
**Readiness**
The plan scopes the pick/undo flows and instrumentation, but it skips critical cache invalidations for kit overview data and relies on a non-reactive Set for button disabling, so implementation would ship with stale cards and inconsistent UX without further direction.

**Decision**
`GO-WITH-CONDITIONS` — unblock once cache targets and UI state handling are clarified and documented fixes are folded in.

### 2) Conformance & Fit (with evidence)
**Conformance to refs**
- `docs/epics/kits_feature_breakdown.md` — Fail — `docs/features/pick_list_status_transitions/plan.md:217-231` — “When navigating back to kit detail, Then the pick list chip badge shows `Completed` and kit overview badge decrements open count.” (plan expects overview to update but does not cover the required kit list refresh).
- `docs/contribute/testing/playwright_developer_guide.md` — Pass — `docs/features/pick_list_status_transitions/plan.md:170-188` — instrumentation extensions and test wait strategy align with deterministic guidance.

**Fit with codebase**
- `useKitsOverview` query (`src/hooks/use-kits.ts:24-75`) — `docs/features/pick_list_status_transitions/plan.md:141-143` — plan only invalidates detail + membership caches, leaving `getKits` buckets untouched despite test expectations for overview counts.
- `useKitPickListMemberships` includeDone variants (`src/hooks/use-kit-memberships.ts:359-370`) — `docs/features/pick_list_status_transitions/plan.md:141-143` — plan does not mention invalidating both `includeDone=true/false` entries that hydrate kit detail v. overview chips.

### 3) Open Questions & Ambiguities
- Question: Which controls count as “conflicting buttons” during a pending mutation—only the active line or the entire table? — `docs/features/pick_list_status_transitions/plan.md:100-103` vs. `docs/features/pick_list_status_transitions/plan.md:122-127`
- Why it matters: Implementation needs a precise rule so optimistic state and instrumentation aren’t undermined by double submissions or unnecessary lockouts.
- Needed answer: Confirm whether we freeze only the current line (preferred for throughput) or all pick/undo controls while any request is running.

- Question: Should success toasts fire on every pick or only on completion, and how do we keep Playwright assertions deterministic? — `docs/features/pick_list_status_transitions/plan.md:257-259`
- Why it matters: Toast volume affects UX and test expectations; inconsistent policy makes instrumentation assertions brittle.
- Needed answer: Decide toast cadence (per action vs completion-only) and document the selector/fixture strategy tests will use.

### 4) Deterministic Playwright Coverage (new/changed behavior)
- Behavior: Mark a line as picked
  - Scenarios:
    - Given an open line, When the user clicks `Pick`, Then instrumentation reports ready with `action: 'pick'`, UI shows status `Completed`, availability refetches, and kit summary eventually shows archived chip (`tests/e2e/pick-lists/pick-list-detail.spec.ts`) — `docs/features/pick_list_status_transitions/plan.md:217-222`
  - Instrumentation: `waitForUiState(page, 'pickLists.detail.execution', 'ready')`, `waitForListLoading(page, 'pickLists.detail', 'ready')` — `docs/features/pick_list_status_transitions/plan.md:222-223`
  - Backend hooks: existing factories + real POST pick endpoint — `docs/features/pick_list_status_transitions/plan.md:87-96`
  - Gaps: Need explicit coverage that the corresponding kit overview card updates once `getKits` refetches (missing invalidation today).
  - Evidence: `docs/features/pick_list_status_transitions/plan.md:217-231`

- Behavior: Undo a completed line
  - Scenarios:
    - Given a completed line, When the user clicks `Undo`, Then instrumentation reports ready with `action: 'undo'`, UI reverts to open state, and kit summary chip returns to open grouping (`tests/e2e/pick-lists/pick-list-detail.spec.ts`) — `docs/features/pick_list_status_transitions/plan.md:219-221`
  - Instrumentation: Same `pickLists.detail.execution` scope plus toast helpers — `docs/features/pick_list_status_transitions/plan.md:222-224`
  - Backend hooks: POST undo endpoint using factories — `docs/features/pick_list_status_transitions/plan.md:91-96`
  - Gaps: Need to assert kit detail chips reload via both `includeDone` and open-only membership queries.
  - Evidence: `docs/features/pick_list_status_transitions/plan.md:217-231`

- Behavior: Auto-complete transition when all lines are picked
  - Scenarios:
    - Given all lines complete, When navigating back to kit detail, Then the pick list chip badge shows `Completed` and kit overview badge decrements open count — `docs/features/pick_list_status_transitions/plan.md:221-229`
  - Instrumentation: `waitForUiState(page, 'kits.detail.links', 'ready')`, `waitForListLoading(page, 'kits.overview', 'ready')` — `docs/features/pick_list_status_transitions/plan.md:224-230`
  - Backend hooks: kit membership + overview factories, same POST pick endpoint — `docs/features/pick_list_status_transitions/plan.md:87-96`
  - Gaps: Need plan updates describing how `getKits` and both membership variants are invalidated so these waits ever resolve after navigation.
  - Evidence: `docs/features/pick_list_status_transitions/plan.md:221-231`

### 5) Adversarial Sweep
**Major — Kit overview cache left stale**
**Evidence:** `docs/features/pick_list_status_transitions/plan.md:141-143` — “invalidate kit detail + membership keys” with no mention of overview; `docs/features/pick_list_status_transitions/plan.md:221-229` expects overview badges to change; `src/hooks/use-kits.ts:24-75` shows overview counts sourced from `getKits` query buckets that will remain stale without invalidation.
**Why it matters:** Kit overview badges and tabs will continue showing the old open counts, so the “completion” acceptance criteria and Playwright assertions fail.
**Fix suggestion:** Add to the plan that the execution hook invalidates both `buildKitsQueryKey('active', search)` and `buildKitsQueryKey('archived', search)` so overview data refetches (and document how the search params are derived).
**Confidence:** High

**Major — Membership invalidation misses includeDone variants**
**Evidence:** `docs/features/pick_list_status_transitions/plan.md:141-143` limits invalidation to “kit detail + membership keys”; `src/hooks/use-kit-memberships.ts:359-370` shows the pick membership query key includes `includeDone`, which differs between kit detail (needs archived chips) and overview (open only).
**Why it matters:** One of the membership caches will stay stale, so either the kit detail chip or overview badge fails to move between open/archived, breaking UX and tests.
**Fix suggestion:** Document invalidation for both `pickMembershipQueryKey(kitIds, false)` and `pickMembershipQueryKey(kitIds, true)` (and any shopping membership variants touched by the UI).
**Confidence:** High

**Major — Pending action Set lacks reactive updates**
**Evidence:** `docs/features/pick_list_status_transitions/plan.md:122-127` describes “Local `Set<lineId>` tracked inside execution hook” powering disabled states.
**Why it matters:** Mutating a Set stored outside React state will not trigger re-render, so buttons can remain enabled/disabled incorrectly and instrumentation metadata like `pendingBefore` will desync.
**Fix suggestion:** Specify a reactive structure (e.g., `useState<Set<number>>` cloning per update or a reducer) so UI state and instrumentation stay in sync.
**Confidence:** Medium

### 6) Derived-Value & State Invariants
- Derived value: `pendingLineActions`
  - Source dataset: Optimistic mutation tracking for lines — `docs/features/pick_list_status_transitions/plan.md:122-127`
  - Write / cleanup triggered: Adds/removes line ids when mutations start/finish.
  - Guards: Blocks conflicting actions until cleanup.
  - Invariant: A line cannot transition twice simultaneously; requires reactive updates.
  - Evidence: `docs/features/pick_list_status_transitions/plan.md:122-127`

- Derived value: `isPickListComplete`
  - Source dataset: `detail.openLineCount` from query cache — `docs/features/pick_list_status_transitions/plan.md:128-133`
  - Write / cleanup triggered: Drives header badge + instrumentation metadata.
  - Guards: Only mark complete when original list had lines; wait for server to set `completedAt`.
  - Invariant: When true, every group `openLineCount` is `0`.
  - Evidence: `docs/features/pick_list_status_transitions/plan.md:128-133`

- Derived value: `lineAvailabilityState`
  - Source dataset: `usePickListAvailability` map keyed by `(partKey, location)` — `docs/features/pick_list_status_transitions/plan.md:134-138`
  - Write / cleanup triggered: Invalidates per-part availability after mutations.
  - Guards: Skip shortfall banners for completed lines.
  - Invariant: Availability rows reflect latest backend quantities.
  - Evidence: `docs/features/pick_list_status_transitions/plan.md:134-138`

### 7) Risks & Mitigations (top 3)
- Risk: Kit overview cards stay stale because `getKits` queries were never invalidated.
  - Mitigation: Expand the plan to invalidate both overview query keys derived from `buildKitsQueryKey`. 
  - Evidence: `docs/features/pick_list_status_transitions/plan.md:141-143`, `src/hooks/use-kits.ts:24-75`

- Risk: Kit detail chips and overview badges disagree after undo due to mismatched `includeDone` caching.
  - Mitigation: Plan should enumerate both membership query variants that need invalidation.
  - Evidence: `docs/features/pick_list_status_transitions/plan.md:141-143`, `src/hooks/use-kit-memberships.ts:359-370`

- Risk: Non-reactive pending Set leaves buttons enabled during requests, enabling duplicate submissions.
  - Mitigation: Specify a stateful or reducer-based implementation for tracking pending line ids.
  - Evidence: `docs/features/pick_list_status_transitions/plan.md:122-127`

### 8) Confidence
<confidence_template>Confidence: Medium — Scope is documented, but the cache invalidation gaps and state handling ambiguity must be resolved before implementation feels safe.</confidence_template>

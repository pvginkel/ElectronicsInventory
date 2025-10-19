### 1) Summary & Decision
**Readiness**
Plan covers core surfaces but currently directs implementation toward mutation hooks for read-only membership queries and treats kit instrumentation as optional, leaving critical architecture and testing guarantees unresolved (`docs/features/kits_membership_indicators/plan.md:120-128` — "Surface: `POST /api/kits/shopping-list-memberships/query` via `usePostKitsShoppingListMembershipsQuery`"; `docs/features/kits_membership_indicators/plan.md:175-178` — "- Signal: `kits.overview` list loading remains unchanged; indicator queries are ancillary." / "- Signal: Consider optional `kits.memberships.loading` UI state if determinism needed...").

**Decision**
`GO-WITH-CONDITIONS` — Proceed once API hook usage and instrumentation/test coupling are aligned with project standards.

### 2) Conformance & Fit (with evidence)
**Conformance to refs**
- `docs/contribute/testing/index.md` — Fail — `docs/features/kits_membership_indicators/plan.md:175-178` — "- Signal: `kits.overview` list loading remains unchanged; indicator queries are ancillary." / "- Signal: Consider optional `kits.memberships.loading` UI state if determinism needed..." versus `docs/contribute/testing/index.md:5-7` — "> **Mandatory coupling:** Every UI slice ships with matching instrumentation and Playwright coverage...".
- `docs/contribute/ui/data_display.md` — Fail — `docs/features/kits_membership_indicators/plan.md:175-178` optionalizes `useListLoadingInstrumentation`, conflicting with `docs/contribute/ui/data_display.md:23-25` — "Lists must register with `useListLoadingInstrumentation` ... Provide metadata callbacks so Playwright can assert on query status and counts.".
- `docs/contribute/architecture/application_overview.md` — Pass (partial) — `docs/features/kits_membership_indicators/plan.md:23-67` reuses generated clients through hooks, aligning with `docs/contribute/architecture/application_overview.md:6-15` guidance on wrapping generated OpenAPI hooks for domain models.

**Fit with codebase**
- `src/lib/api/generated/hooks.ts` — `docs/features/kits_membership_indicators/plan.md:120-128` asks for `usePostKits*MembershipsQuery`, but `src/lib/api/generated/hooks.ts:796-824` shows "return useMutation({ ... api.POST('/api/kits/pick-list-memberships/query' ... ) })", so the planned usage conflicts with existing read-query patterns.
- `src/types/shopping-lists.ts` — `docs/features/kits_membership_indicators/plan.md:103-106` proposes reusing `ShoppingListMembershipSummary`, yet `src/types/shopping-lists.ts:140-149` defines `partKey`-centric summaries, signaling a mismatch for kit contexts.

### 3) Open Questions & Ambiguities
- Question: What instrumentation scope (e.g., `kits.overview.memberships` vs separate shopping/pick scopes) will the shared hook emit so Playwright can wait deterministically? 
  - Why it matters: Without an agreed scope the instrumentation gap blocks deterministic tests, violating the mandatory coupling (`docs/features/kits_membership_indicators/plan.md:175-178`).
  - Needed answer: Confirm exact `useListLoadingInstrumentation` scope(s) and metadata payload for kit indicators.
- Question: How will the shared membership hook shape kit summaries when the reused `ShoppingListMembershipSummary` expects `partKey` fields? 
  - Why it matters: Returning part-centric fields would break type safety and UI rendering for kits (`docs/features/kits_membership_indicators/plan.md:103-106`; `src/types/shopping-lists.ts:140-149`).
  - Needed answer: Specify new kit summary types or extend existing ones with clear migration steps.
- Question: Will the shared component aggregate kit IDs to avoid per-card queries, and how will those IDs flow through TanStack Query keys? 
  - Why it matters: Without defined aggregation the dedupe promise in section 6 may not hold under concurrent renders, risking redundant requests (`docs/features/kits_membership_indicators/plan.md:221-226`, `docs/features/kits_membership_indicators/plan.md:160-162`).
  - Needed answer: Document how `kit-card` and parent list provide normalized ID arrays to the shared hook.
- Resolved: Pick list tooltip remains non-navigational, matching the existing parts implementation (`docs/features/kits_membership_indicators/plan.md:240-242` — plan question; confirmation provided by product direction that answer is “no”).

### 4) Deterministic Playwright Coverage (new/changed behavior only)
- Behavior: Kits overview shopping-list indicator tooltip
  - Scenarios:
    - Given kits with shopping list memberships, when hovering the indicator, then tooltip lists active lists/counts (`docs/features/kits_membership_indicators/plan.md:202-204`).
  - Instrumentation: Not specified; plan only references optional signals (`docs/features/kits_membership_indicators/plan.md:175-178`).
  - Backend hooks: Relies on kit membership query endpoints seeded via factories (`docs/features/kits_membership_indicators/plan.md:120-134`, `docs/features/kits_membership_indicators/plan.md:210-213`).
  - Gaps: Missing committed instrumentation scope and wait helpers.
  - Evidence: `docs/features/kits_membership_indicators/plan.md:202-213`.
- Behavior: Kits overview pick-list indicator tooltip
  - Scenarios:
    - Given kits with pick list memberships, when hovering the pick indicator, then tooltip shows counts/statuses (`docs/features/kits_membership_indicators/plan.md:204-205`).
    - Given error response, when indicator fails, then fallback icon renders and tooltip conveys error copy (`docs/features/kits_membership_indicators/plan.md:205-206`).
  - Instrumentation: Undefined; same optional language as above (`docs/features/kits_membership_indicators/plan.md:175-178`).
  - Backend hooks: Uses pick-list membership query plus factories (`docs/features/kits_membership_indicators/plan.md:126-134`, `docs/features/kits_membership_indicators/plan.md:210-213`).
  - Gaps: No deterministic instrumentation or helper usage outlined.
  - Evidence: `docs/features/kits_membership_indicators/plan.md:204-213`.

### 5) Adversarial Sweep (must find ≥3 credible issues or declare why none exist)
**Major — Mutation hook misuse for membership queries**
**Evidence:** `docs/features/kits_membership_indicators/plan.md:120-128` — "Surface: `POST /api/kits/shopping-list-memberships/query` via `usePostKitsShoppingListMembershipsQuery`"; `src/lib/api/generated/hooks.ts:796-824` — "return useMutation({ ... api.POST('/api/kits/pick-list-memberships/query' ... ) })".
**Why it matters:** `useMutation` wrappers are not compatible with TanStack Query caching for read flows, so adopting them would bypass shared query instrumentation and break the promised deduplication.
**Fix suggestion:** Call the generated REST client (`api.POST`) inside a new kits-specific query hook (mirroring `usePartShoppingListMemberships`) and share that through the planned abstraction.
**Confidence:** High

**Major — Instrumentation left optional for new kit flows**
**Evidence:** `docs/features/kits_membership_indicators/plan.md:175-178` — "Signal: `kits.overview` list loading remains unchanged..." / "Consider optional `kits.memberships.loading` UI state if determinism needed"; `docs/contribute/testing/index.md:5-7` — "> **Mandatory coupling:** Every UI slice ships with matching instrumentation..."; `docs/contribute/ui/data_display.md:23-25` — "Lists must register with `useListLoadingInstrumentation`...".
**Why it matters:** Treating instrumentation as optional violates the mandatory coupling and leaves Playwright without deterministic waits for the new queries.
**Fix suggestion:** Commit to specific `useListLoadingInstrumentation` scope(s) (e.g., `kits.list.shoppingMemberships`, `kits.list.pickMemberships`), include metadata callbacks, and reflect that in the plan and test section.
**Confidence:** High

**Major — Test plan omits instrumentation-driven waits**
**Evidence:** `docs/features/kits_membership_indicators/plan.md:202-213` — scenarios rely on hover interactions and `data-testid` selectors without any instrumentation hooks; `docs/contribute/testing/playwright_developer_guide.md:85-138` — "waitForListLoading(page, scope, phase)" and "Never start writing the spec until the UI emits the events you need—instrumentation drives every deterministic wait.".
**Why it matters:** Without enumerating the instrumentation events/tests will fall back to DOM timing, violating deterministic coverage policies.
**Fix suggestion:** Extend the test plan to consume the committed `list_loading` scopes (or other emitted events) alongside the tooltip assertions.
**Confidence:** High

**Major — Reusing part-centric summaries for kits**
**Evidence:** `docs/features/kits_membership_indicators/plan.md:103-106` — "reuse `ShoppingListMembershipSummary` for list entries with kit-specific context"; `src/types/shopping-lists.ts:140-149` — interface requires `partKey` and part-focused metadata.
**Why it matters:** Carrying a `partKey` field into kit summaries causes incorrect typing and forces the UI to reference nonexistent properties, leading to runtime and type errors.
**Fix suggestion:** Define kit-specific membership summary interfaces (e.g., `KitShoppingListMembershipSummary`, `KitPickListMembershipSummary`) and outline how the shared component maps them.
**Confidence:** Medium

### 6) Derived-Value & State Invariants (table)
- Derived value: `hasActiveMembership`
  - Source dataset: Membership summaries returned by bulk query (`docs/features/kits_membership_indicators/plan.md:159-160`).
  - Write / cleanup triggered: Controls indicator visibility and tooltip rendering.
  - Guards: Requires normalized kit membership response; hidden when zero memberships.
  - Invariant: `hasActiveMembership` must be true iff at least one non-completed membership exists for the entity.
  - Evidence: `docs/features/kits_membership_indicators/plan.md:159-160` — "Derived value: `hasActiveMembership` — drives icon visibility; remains true if at least one membership present.".
- Derived value: `activeShoppingCount` vs `completedCount`
  - Source dataset: Shopping list memberships filtered by status (`docs/features/kits_membership_indicators/plan.md:160-161`).
  - Write / cleanup triggered: Tooltip count badges and metadata events.
  - Guards: Requires consistent filtering rules between kits and parts.
  - Invariant: Sum of `activeShoppingCount` and `completedCount` equals total memberships for the kit.
  - Evidence: `docs/features/kits_membership_indicators/plan.md:160-161` — "Derived value: `activeShoppingCount` vs `completedCount` — ensures tooltips display accurate counts.".
- Derived value: `queryKey`
  - Source dataset: Normalized kit ID array for React Query (`docs/features/kits_membership_indicators/plan.md:161-162`).
  - Write / cleanup triggered: Governs cache deduplication and invalidation.
  - Guards: Requires stable ordering and dedupe logic before invoking `useQuery`.
  - Invariant: `queryKey` must represent the same kits for all cards on the page to prevent redundant fetches.
  - Evidence: `docs/features/kits_membership_indicators/plan.md:161-162` — "Derived value: `queryKey` deduplicates IDs to avoid redundant network calls.".

### 7) Risks & Mitigations (top 3)
- Risk: Instrumentation gap leaves Playwright waits non-deterministic (`docs/features/kits_membership_indicators/plan.md:175-178`).
  - Mitigation: Define and implement mandatory `useListLoadingInstrumentation` scopes before coding.
  - Evidence: `docs/features/kits_membership_indicators/plan.md:175-178`.
- Risk: Bulk kit queries could spike if IDs are not normalized as promised (`docs/features/kits_membership_indicators/plan.md:234-236`).
  - Mitigation: Memoize normalized ID arrays and reuse cached query results, potentially batching per page.
  - Evidence: `docs/features/kits_membership_indicators/plan.md:234-236` — "Risk: Bulk queries per render could spike...".
- Risk: Tooltip UX on touch devices may regress (`docs/features/kits_membership_indicators/plan.md:237-238`).
  - Mitigation: Validate against existing parts pattern and confirm focus/fallback interactions.
  - Evidence: `docs/features/kits_membership_indicators/plan.md:237-238` — "Risk: Tooltip interactions on mobile/touch screens may require alternative affordance.".

### 8) Confidence
<confidence_template>Confidence: Medium — The plan references established patterns, but major gaps around instrumentation and data modeling remain unresolved.</confidence_template>

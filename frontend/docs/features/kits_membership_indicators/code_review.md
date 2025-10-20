### 1) Summary & Decision
**Readiness**
Kits overview now reuses the shared `MembershipIndicator` plus the new `useKitShoppingListMemberships` / `useKitPickListMemberships` hooks to surface shopping and pick list state with instrumentation parity (`src/components/kits/kit-card.tsx:63-307`, `src/hooks/use-kit-memberships.ts:288-427`). However, the Playwright story depends on a pre-seeded kit and skips the error-path scenario called out in the plan, so determinism and fallback behaviour remain unproven (`tests/e2e/kits/kits-overview.spec.ts:7-80`, `docs/features/kits_membership_indicators/plan.md:93-95,204-212`).

**Decision**
`GO-WITH-CONDITIONS` — add deterministic membership fixtures and cover the error instrumentation flow before merging.

### 2) Conformance to Plan (with evidence)
**Plan alignment**
- Sections 2 & 5 (shared indicator extraction) ↔ `src/components/common/membership-indicator.tsx:22-105` — generic indicator handles pending/error/tooltip states for reuse.
- Section 5 (kit overview integration) ↔ `src/components/kits/kit-overview-list.tsx:53-282` — kit list collects IDs, calls the new hooks, and threads summaries into `KitCard`.
- Section 9 (observability) ↔ `src/hooks/use-kit-memberships.ts:304-348` / `src/hooks/use-kit-memberships.ts:375-418` — emits `kits.list.memberships.shopping` / `kits.list.memberships.pick` scopes with `{ kitCount, activeCount, membershipCount }` metadata.
- Section 2 (test/page-object updates) ↔ `tests/support/page-objects/kits-page.ts:61-82` — page object exposes indicator and tooltip helpers for Playwright.

**Gaps / deviations**
- Section 2 (seed helpers) — `tests/api/factories/kit-factory.ts` was untouched, so there is no deterministic way to create kits with both memberships as promised (`docs/features/kits_membership_indicators/plan.md:93-95`).
- Section 13 (error scenario) — the error-path Playwright coverage described in the plan is missing; only the happy-path spec exists (`docs/features/kits_membership_indicators/plan.md:204-212`, `tests/e2e/kits/kits-overview.spec.ts:7-80`).

### 3) Correctness — Findings (ranked)
- Title: `Major — Kit indicator spec depends on unknown seeded data`
  - Evidence: `tests/e2e/kits/kits-overview.spec.ts:7-45` — selects a “fixtureKit” from `/api/kits` and throws when the expected seeded memberships are absent; plan called for deterministic factories (`docs/features/kits_membership_indicators/plan.md:93-95`).
  - Impact: On a clean environment without that seed data the spec will fail immediately, so CI cannot rely on the new coverage.
  - Fix: Extend `tests/api/factories/kit-factory.ts` (or a dedicated helper) to create a kit with both shopping and pick memberships inside the test setup before asserting on the UI.
  - Confidence: High

- Title: `Major — Missing error-path test for membership indicators`
  - Evidence: `docs/features/kits_membership_indicators/plan.md:204-212` — plan requires an error scenario; `tests/e2e/kits/kits-overview.spec.ts:7-80` — only the success flow is implemented.
  - Impact: The fallback icon/tooltip and instrumentation `error` phase are untested, so regressions (e.g., tooltip not rendering or instrumentation not firing) would slip through unnoticed.
  - Fix: Add a Playwright scenario that forces the membership query into an error (for example by using the API helpers to delete the kit mid-request or to submit an invalid ID) and assert the `.error` test IDs plus tooltip copy emitted by `MembershipIndicator`.
  - Confidence: Medium

### 4) Over-Engineering & Refactoring Opportunities
- None observed.

### 5) Style & Consistency
- No substantive inconsistencies noted; shared indicator patterns mirror the existing parts implementation.

### 6) Tests & Deterministic Coverage (new/changed behavior only)
- Surface: Kits overview membership indicators  
  - Scenarios:
    - Given a kit with shopping and pick memberships, instrumentation `kits.list.memberships.shopping`/`pick` reaches `ready` and the tooltips list backend data (`tests/e2e/kits/kits-overview.spec.ts:7-79`).
  - Hooks: `waitForListLoading`, new page-object helpers (`tests/support/page-objects/kits-page.ts:61-82`).
  - Gaps: No deterministic fixture creation; the spec aborts if the seeded kit is absent. The planned error-phase scenario is also missing.
  - Evidence: `tests/e2e/kits/kits-overview.spec.ts:7-80`.

### 7) Adversarial Sweep
- Checks attempted: kit ID dedupe across tabs; instrumentation when kit IDs are empty; spinner ↔ success transitions on refetch.
- Evidence: `src/components/kits/kit-overview-list.tsx:53-65` (IDs collected via `Set`), `src/hooks/use-membership-lookup.ts:87-119` (query disabled when no keys), `src/components/common/membership-indicator.tsx:65-104` (pending/refetch handling).
- Why code held up: The `Set`-based collection plus `normalizeMembershipKeys` prevent duplicate fetches, disabled queries avoid firing when no kits exist (matching the pre-existing parts pattern), and `MembershipIndicator` swaps between spinner/error/icon based on TanStack status so refetches surface the loading state.

### 8) Invariants Checklist
- Invariant: Every requested kit ID yields a membership summary (empty or populated).
  - Where enforced: `src/hooks/use-kit-memberships.ts:155-190`.
  - Failure mode: `KitCard` would dereference `undefined` summaries and skip indicators.
  - Protection: `buildKit*SummaryResults` seeds `createEmpty*Summary` objects for each normalized key before returning.
  - Evidence: `src/hooks/use-kit-memberships.ts:163-187`.
- Invariant: Indicators render only while queries are pending/error or when memberships exist.
  - Where enforced: `src/components/kits/kit-card.tsx:63-171`, `src/components/common/membership-indicator.tsx:41-104`.
  - Failure mode: Users would see stale badges or clickable affordances with no data.
  - Protection: `shouldShowIndicator` gates rendering and `MembershipIndicator` returns `null` when `hasMembership` is false outside loading states.
  - Evidence: `src/components/kits/kit-card.tsx:155-171`.
- Invariant: Instrumentation metadata reflects the normalized kit set and active membership counts.
  - Where enforced: `src/hooks/use-kit-memberships.ts:304-347`, `src/hooks/use-kit-memberships.ts:375-418`.
  - Failure mode: Playwright waits or analytics could receive incorrect counts.
  - Protection: Stats derive from `lookup.summaries` and `lookup.uniqueKeys`, and callbacks close over those arrays.
  - Evidence: `src/hooks/use-kit-memberships.ts:304-347`.

### 9) Questions / Needs-Info
- None.

### 10) Risks & Mitigations (top 3)
- Risk: Playwright spec fails whenever the seeded kit is missing.  
  - Mitigation: Add a factory/helper that provisions a kit with both membership types as part of the test setup.  
  - Evidence: Finding “Major — Kit indicator spec depends on unknown seeded data”.
- Risk: Fallback indicator states remain unverified, so regressions in error handling would go unnoticed.  
  - Mitigation: Implement the planned error-phase scenario that asserts `.error` indicators and instrumentation metadata.  
  - Evidence: Finding “Major — Missing error-path test for membership indicators”.
- Risk: `useKit*Memberships` emits no instrumentation when the kit list is empty (query disabled), which could block future tests that wait on `kits.list.memberships.*`.  
  - Mitigation: Consider emitting a synthetic `ready` event when `uniqueKeys.length === 0`, mirroring the guard in list instrumentation.  
  - Evidence: `src/hooks/use-kit-memberships.ts:292-348`.

### 11) Confidence
Confidence: Medium — Manual inspection covered the new hooks/components, but without running the backend I cannot verify the availability of the seeded kit or exercise the error path.

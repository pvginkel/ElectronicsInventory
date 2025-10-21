### 1) Summary & Decision
**Readiness**
The slice wires most of the planned surface, but `/kits/$kitId` hangs indefinitely whenever the route param is not a positive integer, so the user never reaches the not-found guard or emits instrumentation (`src/hooks/use-kit-detail.ts:31-38`, `src/components/kits/kit-detail.tsx:76-116`). The error fallback also drops the caller’s tab/search context, regressing the navigation invariant promised in the plan.

**Decision**
NO-GO — Blocker: invalid kit IDs leave the workspace stuck in a perpetual loading state (`src/hooks/use-kit-detail.ts:31-38`, `src/components/kits/kit-detail.tsx:38-99`).

### 2) Conformance to Plan (with evidence)
**Plan alignment**
- Plan §2 “Area: `src/routes/kits/$kitId/index.tsx`” ↔ src/routes/kits/$kitId/index.tsx:10-31 — `createFileRoute('/kits/$kitId/')` validates search state and passes it into `<KitDetail />`.
- Plan §2 “Area: `src/components/kits/kit-detail.tsx`” ↔ src/components/kits/kit-detail.tsx:24-135 — Detail layout orchestrates header slots, instrumentation, loading/error branches, and table composition.
- Plan §2 “Area: `src/components/kits/kit-bom-table.tsx`” ↔ src/components/kits/kit-bom-table.tsx:1-210 — Read-only BOM table renders required columns, reservation chip, and empty state.
- Plan §9 “Signal: `kits.detail` / `kits.detail.contents`” ↔ src/components/kits/kit-detail.tsx:43-61 — Dual `useListLoadingInstrumentation` calls publish the ready/error metadata described in the plan.

**Gaps / deviations**
- Plan §8 “Failure: Reserved/available values unexpectedly negative” — Implementation clamps values but omits the promised dev assertion/tooltip to surface backend mismatches (`src/types/kits.ts:233-263`).
- Plan §14 “Slice: Playwright & test-data support” — New spec still depends on seeded data with reservations instead of extending the kit factory for deterministic fixtures (`tests/e2e/kits/kit-detail.spec.ts:11-44`).
- Plan §8 “Failure: Kit not found” — The not-found card exists, but invalid route params never reach it because the pending guard never clears (`src/components/kits/kit-detail.tsx:76-99`).

### 3) Correctness — Findings (ranked)
- Title: Blocker — Invalid kitId leaves detail view stuck in loading
  - Evidence: src/hooks/use-kit-detail.ts:31-38; src/hooks/use-kit-detail.ts:126-148 — `enabled: normalizedKitId !== null` disables the query for non-numeric params, so `query.status` stays `'pending'`.
  - Evidence: src/components/kits/kit-detail.tsx:38-99 — `isPending` gates the loading skeleton ahead of the `!detail` branch, so the screen never exits loading or emits readiness metadata.
  - Impact: Direct navigation to `/kits/foo` (or other malformed IDs) presents an infinite skeleton and the instrumentation hook never transitions, breaking both UX and Playwright waits.
  - Fix: Detect `kitId === null` (e.g. from `useKitDetail`) and short-circuit to the not-found card with an `'aborted'` instrumentation event instead of entering the pending branch.
  - Confidence: High
- Title: Major — Error fallback loses overview search context
  - Evidence: src/components/kits/kit-detail.tsx:190-198 — “Return to Kits” always links to `status: 'active'`, ignoring `overviewStatus`/`overviewSearch`.
  - Evidence: docs/features/kit_detail_workspace/plan.md:201-206 — Plan locks an invariant that back navigation restores the prior tab/search state.
  - Impact: Users encountering an error after coming from the archived view return to the wrong tab, violating expected navigation context and making recovery harder.
  - Fix: Thread `overviewStatus`/`overviewSearch` into the error card (e.g. props on `KitDetailErrorState`) and feed them into the `Link`.
  - Confidence: High
- Title: Major — Playwright spec depends on elusive seeded reservation kit
  - Evidence: tests/e2e/kits/kit-detail.spec.ts:11-45 — Test scans existing API data and throws if no seeded kit has `active_reservations`.
  - Evidence: docs/features/kit_detail_workspace/plan.md:312-321 — Plan commits to deterministic factories to avoid brittle seeds.
  - Impact: Fresh environments lacking a pre-seeded reservation kit will fail the spec before the UI loads, breaking determinism and CI reliability.
  - Fix: Extend `testData.kits` (or a helper factory) to create the required parts/reservations inside the test instead of relying on fixture seeds.
  - Confidence: Medium

### 4) Over-Engineering & Refactoring Opportunities
No over-engineering issues observed in this slice.

### 5) Style & Consistency
No substantive style or consistency divergences noted beyond the correctness items above.

### 6) Tests & Deterministic Coverage (new/changed behavior only)
- Surface: Kit detail workspace
  - Scenarios:
    - Given a seeded kit with reservations, When navigating from the overview card, Then the header, summary badges, and reservation tooltip reflect backend data (`tests/e2e/kits/kit-detail.spec.ts:15-143`).
    - Given a kit with no contents, When opening the detail view, Then the empty state renders and instrumentation reports zero totals (`tests/e2e/kits/kit-detail.spec.ts:146-177`).
  - Hooks: `waitForListLoading` (`tests/support/helpers.ts:27`), new page-object locators (`tests/support/page-objects/kits-page.ts:18-112`).
  - Gaps: No coverage for error/not-found flows; reservation scenario relies on pre-existing data instead of deterministic factories (Major finding above).
  - Evidence: tests/support/page-objects/kits-page.ts:18-112

### 7) Adversarial Sweep
- Title: Blocker — Invalid kitId leaves detail view stuck in loading
  - Evidence: src/hooks/use-kit-detail.ts:31-38; src/components/kits/kit-detail.tsx:76-99 — Pending state persists without a ready/error transition when `kitId` fails normalization.
  - Impact: Manual navigation to `/kits/foo` never resolves, so the workspace is unusable and test instrumentation hangs.
  - Fix: Branch explicitly on `kitId === null` and emit an aborted/not-found state.
  - Confidence: High
- Checks attempted: Rapid kit-to-kit navigation; refresh while tooltip open; instrumentation metadata drift
  - Evidence: src/components/kits/kit-detail.tsx:43-61; src/components/kits/kit-bom-table.tsx:149-205
  - Why code held up: React Query cancels stale fetches, `ReservationTooltip` cleans up scroll/resize listeners on unmount, and aggregates feed both UI and metadata from a single memoized source, so no stale data surfaced in these paths.

### 8) Invariants Checklist (table)
- Invariant: `kits.detail` / `kits.detail.contents` emit ready metadata that matches rendered aggregates
  - Where enforced: src/components/kits/kit-detail.tsx:43-61; src/hooks/use-kit-detail.ts:82-108
  - Failure mode: Instrumentation waits hang or assert mismatched totals
  - Protection: Aggregates computed via `summarizeKitContents` feed both the summary badges and metadata callbacks
  - Evidence: src/types/kits.ts:224-263
- Invariant: Kit content totals remain non-negative even if backend misbehaves
  - Where enforced: src/types/kits.ts:224-263
  - Failure mode: Negative numbers leak into UI/metadata, breaking Playwright assertions
  - Protection: `clampNonNegative` wraps totals during mapping and reduction
  - Evidence: src/types/kits.ts:301-337
- Invariant: Reservation tooltip detaches listeners when closed/unmounted
  - Where enforced: src/components/kits/kit-bom-table.tsx:149-205
  - Failure mode: Scroll/resize handlers leak, causing performance degradation
  - Protection: `useLayoutEffect` installs listeners only while open and cleans them up on exit
  - Evidence: src/components/kits/kit-bom-table.tsx:162-205

### 9) Questions / Needs-Info
None.

### 10) Risks & Mitigations (top 3)
- Risk: Users hitting `/kits/<non-numeric>` get a permanent loading skeleton (Blocker #1).
  - Mitigation: Treat invalid IDs as an aborted/not-found case and short-circuit before entering the loading branch.
  - Evidence: src/hooks/use-kit-detail.ts:31-38; src/components/kits/kit-detail.tsx:76-99
- Risk: Error recovery drops users back onto the wrong tab/search filter (Major #2).
  - Mitigation: Thread overview search status into the error CTA before shipping.
  - Evidence: src/components/kits/kit-detail.tsx:190-198
- Risk: Reservation coverage breaks when fixture data changes (Major #3).
  - Mitigation: Extend the Playwright test-data factory to seed deterministic kits with reservations inside the spec.
  - Evidence: tests/e2e/kits/kit-detail.spec.ts:11-45

### 11) Confidence
Confidence: Low — Blocking navigation bug and brittle tests undermine trust in the current slice.

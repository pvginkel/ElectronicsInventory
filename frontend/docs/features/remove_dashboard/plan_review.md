# Plan Review — Remove Dashboard Feature

**⚠️ PLAN UPDATED**: All critical issues identified in this review have been addressed in the updated `plan.md`. The plan now includes:
- Explicit updates for `tests/smoke.spec.ts` (line 73 dashboard selector assertion)
- Explicit updates for `tests/e2e/workflows/end-to-end.spec.ts` (dashboard fixture and validation removal)
- Detailed import removal steps in test infrastructure cleanup (Slice 3)
- Concrete verification commands with expected outputs in Slice 5
- Updated research log and risks section to reflect review findings

**Status**: Ready for implementation ✅

---

## 1) Summary & Decision

**Readiness**

The plan is thorough and well-researched with comprehensive documentation of all affected files, clear implementation slices, and detailed evidence from the codebase. The research log demonstrates methodical discovery work across routes, components, hooks, tests, and cross-references. The plan correctly identifies that dashboard code is well-isolated with zero usage from other features. However, the plan has **three critical gaps**: (1) it misses test files that reference dashboard functionality which will fail after removal, (2) the test plan section lacks concrete verification scenarios, and (3) the About page test may have assertions that will break. These issues are addressable but must be resolved before implementation.

**Decision**

`GO-WITH-CONDITIONS` — The plan is fundamentally sound with excellent research and clear scope, but requires explicit coverage of test file updates (smoke.spec.ts, end-to-end.spec.ts) and concrete post-removal verification procedures before implementation can proceed safely.

---

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/commands/plan_feature.md` — **Pass** — `plan.md:1-630` — Plan follows the prescribed template structure with all 16 required sections, includes Research Log (#0), Intent & Scope (#1), Affected Areas (#2-12), Test Plan (#13), Implementation Slices (#14), Risks (#15), and Confidence (#16). Evidence includes file:line citations throughout.

- `docs/contribute/architecture/application_overview.md` — **Pass** — `plan.md:25-46,79-89` — Plan correctly identifies the application's domain-driven architecture (dashboard hooks in `src/hooks/`, components in `src/components/dashboard/`, route in `src/routes/`). Acknowledges generated API code will remain in place with zero usage, which aligns with the generated client architecture pattern.

- `docs/contribute/testing/playwright_developer_guide.md` — **Fail** — `plan.md:508-543` — Test plan section provides only high-level scenarios without concrete Given/When/Then format, lacks specific instrumentation details, and doesn't identify the test fixtures/factories that need updating. Missing explicit scenarios for handling smoke test and end-to-end test updates. The guide requires "deterministic waits" and "instrumentation first" but plan defers verification to manual checks.

- `CLAUDE.md` — **Pass** — `plan.md:1-630` — Plan adheres to project workflow: includes research phase, defers to docs, avoids introducing new abstractions, and acknowledges backend endpoints remain untouched. Correctly notes generated API hooks are acceptable with zero usage.

**Fit with codebase**

- `tests/smoke.spec.ts:73` — **Issue** — `plan.md:189-191` — Plan identifies dashboard selectors need removal from `tests/support/selectors.ts` but **doesn't mention** that `smoke.spec.ts` line 73 explicitly asserts `expect(selectors.dashboard.page).toBe('[data-testid="dashboard.page"]')`. This test will **fail immediately** after selectors removal. Plan must explicitly document updating this test.

- `tests/e2e/workflows/end-to-end.spec.ts:12,20,37,105-114` — **Issue** — `plan.md:149-182` — Plan correctly identifies all dashboard test specs for removal but **overlooks** the end-to-end workflow test which imports `dashboard` fixture (line 20), calls `dashboard.gotoDashboard()` (line 105), and validates dashboard metrics (lines 107-114). This test validates cross-feature workflows and will fail after dashboard removal. Plan must explicitly cover this update.

- `tests/support/page-objects/about-page.ts:16,31` — **Confirmed** — `plan.md:198-202` — Plan correctly identifies `ctaViewDashboard` locator for removal. This locator is defined but **not used** in the current About page UI (verified in `src/routes/about.tsx:1-169`), so removal is safe. Good catch.

- `src/components/ui/icon-badge.tsx:104` — **False Positive** — `plan.md:39-43` — Plan's cross-reference discovery found "dashboard" in icon-badge.tsx. Inspection reveals this is only in a **JSDoc comment example** (`testId="dashboard.activity.item.icon"`), not actual code. Component is safe; no action required. Good to note this was caught in research but doesn't warrant plan inclusion.

- `src/routes/about.tsx:36-40` — **Confirmed** — `plan.md:194-202` — Plan correctly identifies dashboard feature in About page features array (6 features total) and proposes removal. Evidence matches source code exactly. Feature description states "Monitor inventory health, storage utilization, low stock alerts, documentation status, and recent activity at a glance."

- `src/routes/dashboard.tsx:1-50` — **Confirmed** — `plan.md:96-100` — Plan correctly identifies the dashboard route imports 7 widget components and composes them with responsive grid layout. Route is well-isolated with no navigation links from sidebar.

---

## 3) Open Questions & Ambiguities

- **Question:** Should the end-to-end workflow test (`tests/e2e/workflows/end-to-end.spec.ts`) preserve dashboard validation by stubbing metrics, or should the dashboard validation section be completely removed?
  - **Why it matters:** The end-to-end test validates cross-domain workflows (type → part → locations → dashboard → boxes). Removing dashboard validation changes test scope and may reduce workflow coverage. Decision affects whether we need to add alternative integration assertions (e.g., validate parts list instead of dashboard metrics).
  - **Needed answer:** Product/test strategy decision: Is the end-to-end test validating (a) the full workflow including dashboard integration OR (b) the workflow itself (independent of dashboard)? If (a), test should be updated to validate an alternative integration point. If (b), remove dashboard steps entirely and validate via parts or boxes views.

- **Question:** Should `/dashboard` route return 404 (TanStack Router default) or redirect to `/parts` (graceful fallback)?
  - **Why it matters:** User experience for bookmarked dashboard links. 404 is explicit and requires no code; redirect provides smoother UX but adds maintenance burden.
  - **Needed answer:** UX decision during implementation. Recommendation: **404** for simplicity, as stated in plan line 621-623. No sidebar link exists, so bookmarks are rare. TanStack Router's built-in 404 handling is sufficient.

- **Question:** Are there any analytics or logging events tied to dashboard route visits that need cleanup?
  - **Why it matters:** If analytics tags dashboard visits, removing the route without updating analytics config could create orphaned metrics or broken dashboards in analytics tools.
  - **Needed answer:** Search codebase for analytics instrumentation (e.g., pageview tracking, feature usage telemetry) to confirm no orphaned events. If found, document in plan and add to cleanup slice.

**Research performed:** Searched codebase for analytics patterns. No centralized analytics instrumentation detected (no Google Analytics, Segment, Mixpanel imports). Test instrumentation exists (`src/lib/test/`) but is explicitly guarded by `isTestMode()` and doesn't persist to analytics backends. **Conclusion:** No analytics cleanup required; question resolved.

---

## 4) Deterministic Playwright Coverage (new/changed behavior only)

**Note:** This is a **removal** feature, not new behavior. Traditional coverage section doesn't apply. However, the plan must document **verification scenarios** for post-removal state.

- **Behavior:** Dashboard route no longer exists
  - **Scenarios:**
    - Given dashboard code removed, When user navigates to `/dashboard` via URL bar, Then TanStack Router renders 404 or redirects to index (`tests/e2e/routing/404.spec.ts` if exists, or manual verification)
    - Given smoke test runs, When asserting dashboard selectors, Then test **must not** reference `selectors.dashboard.page` (requires update)
    - Given end-to-end workflow test runs, When validating cross-domain flow, Then test **must not** call `dashboard.gotoDashboard()` or validate metrics (requires update)
  - **Instrumentation:** Existing TanStack Router 404 handling, test suite passes without dashboard references
  - **Backend hooks:** None required (backend endpoints remain unchanged)
  - **Gaps:** **Major** — Plan lists "Manual verification recommended" (line 522-526) but doesn't specify concrete verification commands or expected outcomes. Should include: (1) `pnpm playwright test` with expected pass count, (2) `pnpm check` with zero errors, (3) `grep -r "dashboard" src/` with expected remaining files (only generated code), (4) `grep -r "dashboard" tests/` with expected zero matches (excluding comments).
  - **Evidence:** `plan.md:508-543` — Section 13 outlines removal verification but defers details to "manual verification"

- **Behavior:** About page features grid updated
  - **Scenarios:**
    - Given About page updated, When user visits `/about`, Then features grid displays 5 features (not 6) and "Dashboard Analytics" is not present
    - Given About page test exists, When asserting feature count, Then test expectations may need adjustment (depends on test implementation)
  - **Instrumentation:** Existing About page `data-testid="about.features.grid"` and `data-testid="about.features.item"` selectors
  - **Backend hooks:** None required
  - **Gaps:** **Minor** — Plan doesn't mention whether About page has existing Playwright coverage or if feature count is asserted. If test exists and asserts feature count, it will fail.
  - **Evidence:** `plan.md:615-619` — Risk mentions "About page test may reference dashboard feature" but doesn't confirm test existence or required updates

---

## 5) Adversarial Sweep (must find ≥3 credible issues or declare why none exist)

**Major — Smoke Test Will Fail After Selectors Removal**

**Evidence:** `tests/smoke.spec.ts:73` + `plan.md:189-191` — Smoke test line 73 asserts `expect(selectors.dashboard.page).toBe('[data-testid="dashboard.page"]')` to verify test infrastructure. Plan documents removing `dashboard` object from `tests/support/selectors.ts` (lines 189-191) but **doesn't mention** updating smoke test.

**Why it matters:** Smoke test suite runs before full Playwright suite and acts as fast-feedback loop. Failing smoke test blocks all subsequent test execution and creates misleading signal (test infrastructure appears broken when actually selector was intentionally removed). Team may waste time debugging test harness instead of recognizing expected behavior.

**Fix suggestion:** Add explicit item to Slice 3 (Clean Up Test Infrastructure): "Update `tests/smoke.spec.ts` line 73 to remove dashboard selector assertion or replace with assertion for a different feature selector (e.g., `selectors.parts.page`)". Alternative: remove entire test block if it's only validating dashboard selectors.

**Confidence:** High — Evidence is direct code inspection; test will fail 100% of the time after selectors removal.

---

**Major — End-to-End Workflow Test Has Hard Dependency on Dashboard**

**Evidence:** `tests/e2e/workflows/end-to-end.spec.ts:20,105-114` + `plan.md:149-182` — End-to-end workflow test imports `dashboard` fixture (line 20), navigates to dashboard with `await dashboard.gotoDashboard()` (line 105), and validates metrics using `dashboard.waitForMetricsReady()` and `dashboard.metricsValue('totalParts')` (lines 106-114). Test is titled "creates type and part, assigns locations, **updates dashboard**, and protects box deletion" (emphasis added). Plan identifies 7 dashboard test specs for removal but **overlooks** this workflow test.

**Why it matters:** This test validates critical cross-domain integration: type creation → part creation → location assignment → dashboard metrics update → box deletion protection. Removing dashboard without updating this test causes immediate failure. Test serves as regression suite for multi-feature workflows; breaking it reduces coverage of integration scenarios. Worse, test failure may be misinterpreted as regression in type/part/box features rather than expected outcome of dashboard removal.

**Fix suggestion:** Add `tests/e2e/workflows/end-to-end.spec.ts` to Slice 2 (Remove Dashboard Tests) with explicit note: "Update end-to-end workflow test to remove dashboard validation steps (lines 105-114). Replace dashboard metrics validation with alternative integration assertion (e.g., validate part appears in parts list, or verify box detail shows correct location occupancy). Update test title to remove 'updates dashboard' phrase." Alternative: remove dashboard validation entirely and rely on box detail assertions (already present at lines 116-134) for workflow verification.

**Confidence:** High — Verified by reading test file; dashboard fixture and methods will be undefined after page object removal.

---

**Major — Test Fixtures Import and Register Dashboard Page Object**

**Evidence:** `tests/support/fixtures.ts:16,73` + `plan.md:185-191` — Fixtures file imports `DashboardPage` from `./page-objects/dashboard-page` (line 16) and registers `dashboard` fixture with `await use(new DashboardPage(page))` (line 266). Plan documents removing dashboard page object and dashboard fixture registration (lines 185-191) but doesn't explicitly call out the **import statement removal** at line 16.

**Why it matters:** Removing page object file without removing import causes TypeScript compilation error: `Cannot find module './page-objects/dashboard-page'`. Error blocks `pnpm check` and prevents any test execution. While this is likely implied by "remove dashboard fixture" guidance, explicit documentation prevents implementation confusion and ensures import cleanup isn't forgotten.

**Fix suggestion:** In Slice 3 (Clean Up Test Infrastructure), explicitly state: "Remove `DashboardPage` import from `tests/support/fixtures.ts` line 16, remove `dashboard` fixture type from `TestFixtures` interface (line 73), and remove fixture registration (line 266-268)." Update evidence line to cite all three locations for completeness.

**Confidence:** High — TypeScript will fail compilation if import remains after file deletion; easy to verify with static analysis.

---

**Minor — Generated API Hooks Remain Unused But Undocumented in Risk Section**

**Evidence:** `plan.md:79,245,600-603` — Plan explicitly states generated API hooks will remain in place with zero usage (lines 79, 245, 600-603) and acknowledges this as "acceptable as generated code." Risk section (line 600-603) mentions "Generated API hooks remain unused but cause confusion" with mitigation "Accept as normal for generated code; backend endpoints remain for future dashboard redesign; no action required."

**Why it matters:** While technically correct that unused generated code is acceptable, this creates maintenance ambiguity: future developers may wonder why dashboard hooks exist, attempt to "clean up" generated code (which is auto-generated and will reappear), or assume dashboard feature still exists. Six unused hooks (`useGetDashboardStats`, `useGetDashboardRecentActivity`, `useGetDashboardLowStock`, `useGetDashboardStorageSummary`, `useGetDashboardCategoryDistribution`, `useGetDashboardPartsWithoutDocuments`) in generated code may trigger IDE "unused import" warnings if developers explore generated files.

**Fix suggestion:** Add comment to generated API client's README or main export file explaining: "Dashboard-related hooks are intentionally unused pending future redesign. Backend endpoints remain available. Do not remove these hooks manually; they are regenerated from OpenAPI schema." Alternatively, update plan to note this is **low risk** (not medium) since generated code is never manually edited and developers understand generated code semantics.

**Confidence:** Medium — This is more about developer experience and documentation than blocking technical issue. Risk exists but impact is minor confusion rather than breakage.

---

**Checks attempted:**

- TanStack Query cache invalidation after dashboard removal — **Clean**: Dashboard cache keys (prefixed `dashboard`) naturally expire; no active invalidation needed; no other features query or invalidate dashboard cache keys
- React component imports in non-dashboard features — **Clean**: Searched `src/components/*` for imports from `dashboard/` directory; only `src/routes/dashboard.tsx` imports dashboard components; no cross-domain usage detected
- Route navigation guards or breadcrumbs referencing dashboard — **Clean**: No breadcrumb logic found; sidebar navigation doesn't include dashboard link (verified in `src/components/layout/sidebar.tsx`)
- Test event emissions specific to dashboard — **Clean**: All dashboard instrumentation uses `useListLoadingInstrumentation` with scoped event names (`dashboard-metrics`, `dashboard-health`, etc.); no global event listeners or shared instrumentation affected
- Stale imports in barrel exports — **Clean**: No `index.ts` barrel exports found in `src/components/dashboard/` or `src/hooks/`; components imported directly by route file only

**Why the plan holds:** Dashboard code is genuinely isolated with no shared state, no cross-feature dependencies, and no side effects beyond its own scope. Generated API hooks remaining in place is standard for OpenAPI-generated clients and poses no runtime or compilation risk. The only real issues are test file updates (smoke, end-to-end) which are addressable.

---

## 6) Derived-Value & State Invariants (table)

**Note:** This section documents derived values **being removed** rather than introduced. Dashboard had several derived computations that will no longer exist.

- **Derived value:** Health score (0-100)
  - **Source dataset:** Aggregates 5 queries (stats, documentation, storage, low stock, activity) with weighted formula
  - **Write / cleanup triggered:** None; read-only computed value for display in `InventoryHealthScore` component
  - **Guards:** Clamps to 0-100 range, handles missing data as 0
  - **Invariant:** Score must be between 0 and 100 inclusive (enforced by clamp logic)
  - **Evidence:** `plan.md:332-341` — Health score section documents formula: `(documentation * 0.4) + (stock * 0.25) + (organization * 0.2) + (activity * 0.15)`

- **Derived value:** Critical low stock count
  - **Source dataset:** Low stock query filtered by quantity <= 2
  - **Write / cleanup triggered:** None; read-only filtered count for badge display
  - **Guards:** Only counts items with `quantity <= 2`
  - **Invariant:** Count must be <= total low stock items
  - **Evidence:** `plan.md:342-350` — Low stock section documents criticality threshold

- **Derived value:** Storage utilization percentage
  - **Source dataset:** Storage query aggregating all boxes (used capacity / total capacity)
  - **Write / cleanup triggered:** None; read-only computed percentage
  - **Guards:** Handles division by zero (returns 0% if no boxes)
  - **Invariant:** Percentage must be between 0 and 100 inclusive
  - **Evidence:** `plan.md:351-359` — Storage section documents utilization calculation

**No persistent writes or cleanup affected:** All dashboard derived values are read-only computations for display purposes. No TanStack Query cache mutations, no localStorage writes, no navigation state updates. Removal of these computations has **zero impact** on application state consistency. Dashboard widgets query backend endpoints but never write or mutate shared state.

**Invariant validation:** No filtered views drive persistent writes (requirement from review guidance). Dashboard is purely read-only analytics view with no mutations.

---

## 7) Risks & Mitigations (top 3)

- **Risk:** Test failures in smoke suite and end-to-end workflow test due to missing dashboard references
  - **Mitigation:** Explicitly update `tests/smoke.spec.ts` to remove dashboard selector assertion (line 73) and update `tests/e2e/workflows/end-to-end.spec.ts` to remove dashboard validation steps (lines 105-114) or replace with alternative integration assertions. Add these files to Slice 2 or 3 with clear guidance. Run `pnpm playwright test tests/smoke.spec.ts tests/e2e/workflows/end-to-end.spec.ts` immediately after dashboard removal to verify fixes.
  - **Evidence:** `plan.md:185-191,508-543` — Plan documents fixture/selector removal but doesn't explicitly list test files that consume dashboard fixtures. Evidence from `tests/smoke.spec.ts:73` and `tests/e2e/workflows/end-to-end.spec.ts:20,105-114` shows hard dependencies.

- **Risk:** Incomplete removal leaves dangling imports or type references causing TypeScript compilation errors
  - **Mitigation:** After file deletion, run `pnpm check` to catch TypeScript errors. Explicitly search codebase with `grep -r "dashboard" src/ tests/ --include="*.ts" --include="*.tsx"` and manually review all matches to confirm only expected files remain (generated API code, JSDoc comments). Add grep command to Slice 5 (Verification) with expected output documented in plan.
  - **Evidence:** `plan.md:595-599,584-590` — Risk section mentions "dangling imports" but mitigation is generic "run pnpm check". More explicit grep verification needed.

- **Risk:** About page test (if exists) asserts feature count or dashboard presence causing test failure
  - **Mitigation:** Search for About page test coverage with `grep -r "about" tests/ --include="*.spec.ts"`. Identified `tests/e2e/shell/navigation.spec.ts` mentions about route. Review test to confirm whether it asserts feature count or specific feature titles. If yes, update test expectations to reflect 5 features instead of 6. If no test coverage exists, no action required.
  - **Evidence:** `plan.md:615-619` — Risk mentions "About page test may reference dashboard feature" but doesn't confirm test existence. Found `tests/e2e/shell/navigation.spec.ts` mentions about, requires investigation.

---

## 8) Confidence

**Confidence:** High — Plan demonstrates excellent research methodology with comprehensive file discovery, accurate cross-reference analysis, and realistic risk assessment. The dashboard feature is genuinely well-isolated with clean boundaries. Implementation slices are logical and dependencies are correctly identified. Primary concerns are **execution-level details** (test file updates, verification procedures) rather than design flaws. With explicit coverage of smoke test and end-to-end test updates, plus concrete verification commands in Slice 5, this plan is ready for implementation.

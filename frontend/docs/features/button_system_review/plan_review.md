# Button System Review — Plan Review

## 1) Summary & Decision

**Readiness**

The plan demonstrates thorough research with comprehensive button audit covering 195+ instances, clear implementation slices, and well-scoped presentational changes requiring no API or state modifications. The research log provides strong evidence (file paths and line numbers) for each affected area. However, the Playwright test coordination strategy lacks specificity: while Section 13 acknowledges test brittleness and Slice 5 mentions updating specs, the plan doesn't enumerate which of the 43 existing spec files will break, doesn't require running the full suite after each slice, and covers only 4-5 test scenarios despite ~95 button changes. The architecture fit is excellent (purely JSX text changes), but the delivery risk centers on silently broken tests if verification isn't mandatory at each slice boundary.

**Decision**

`GO-WITH-CONDITIONS` — Approve implementation with the following requirements: (1) Add explicit test file audit to Slice 5 showing which specs use affected button labels (grep evidence required); (2) Add "run affected Playwright specs and verify green" to the completion criteria for Slices 1-4; (3) Expand Section 13 test coverage to account for all high-visibility button changes (dashboard widgets, shopping list workflows, camera capture); (4) Add "pnpm check" and "pnpm playwright test" verification to the Definition of Done before marking any slice complete.

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/commands/plan_feature.md` — Pass — `plan.md:0-637` — Plan follows all required sections (0-16), provides repository evidence with file:line citations, uses templates correctly, and scopes work to presentational layer only. Research log (lines 5-60) documents discovery strategy and conflicts resolved.

- `docs/contribute/architecture/application_overview.md` — Pass — `plan.md:249-257` — Correctly identifies no data model changes, no API surface changes, and no state consistency requirements. Changes are confined to JSX literals and aria-label attributes as stated in the architecture's UI composition layer.

- `docs/contribute/testing/playwright_developer_guide.md` — Partial — `plan.md:423-505` — Test plan (Section 13) acknowledges button text assertions will break and proposes using `getByRole('button', { name: '...' })`, which aligns with semantic selector guidance. However, plan doesn't show evidence of scanning existing specs to enumerate which files need updates (20+ files use `getByRole` with button name matching per repository grep). Slice 5 (`plan.md:590-606`) says "Update Playwright specs that assert on button text" but lacks file list or grep evidence showing the audit was completed.

- `AGENTS.md:42-46` — Pass — `plan.md:102-104` — Plan correctly notes that instrumentation changes and Playwright coverage should ship together. Since no new instrumentation is needed (presentational change only), this requirement is satisfied by updating existing test assertions to match new labels.

**Fit with codebase**

- `src/components/ui/button.tsx` — `plan.md:100-101` — Plan correctly assumes Button component structure remains unchanged, which fits the "purely presentational" scope. Component API (variant, size, loading props) unaffected.

- `src/components/layout/detail-screen-layout.tsx:111-115` — `plan.md:32-34, 111-112` — Plan correctly identifies that DetailScreenLayout uses `flex flex-wrap gap-2` for action bars, concluding wrapping behavior is acceptable and no layout changes needed. This aligns with existing responsive patterns.

- Test suite (43 spec files) — `plan.md:590-606` (Slice 5) — Plan mentions updating specs but doesn't provide file-level specificity. Repository evidence shows 20 files use `getByRole` with button text and 10 use `getByText`, but Slice 5 lacks a concrete checklist of which specs require updates before delivery. Missing explicit requirement to run full test suite after Slices 1-4 to catch breakage early.

## 3) Open Questions & Ambiguities

- Question: Which specific test files in `tests/` require updates in Slice 5, and what's the grep command used to find them?
- Why it matters: Without an explicit audit, developers implementing Slices 1-4 may introduce silent test failures if they don't know which specs to re-run. The plan lists 20+ files using `getByRole('button', ...)` but doesn't map them to the button changes in Slices 1-4.
- Needed answer: Add table in Slice 5 mapping each affected button label (e.g., "Save & next" → "Save & Next") to the test files that assert on it (e.g., `tests/e2e/shopping-lists/shopping-lists.spec.ts:980`). Use grep evidence from repository to populate this table.

- Question: Should Slice 5 (Documentation & Testing) be completed before or after Slices 1-4, and what's the verification cadence?
- Why it matters: If documentation is written last, developers have no reference standard while implementing Slices 1-4, risking inconsistent choices. If tests aren't updated until Slice 5, CI will be red throughout Slices 1-4.
- Needed answer: Clarify whether contributor documentation (`docs/contribute/ui/button_standards.md`) should be written first as a reference, or last to document implemented patterns. Specify whether test updates happen in the same commit as label changes (preferred) or batched in Slice 5.

- Question: What constitutes "acceptable" button label wrapping on mobile viewports, and who validates it?
- Why it matters: Plan acknowledges long labels like "Add Part with AI" may wrap (`plan.md:342-348`) but defers specific wrapping issues "until identified." Without acceptance criteria, implementation may ship labels that wrap awkwardly.
- Needed answer: Define wrapping acceptance criteria (e.g., "single line on ≥375px width viewports acceptable") or defer visual QA to post-implementation review with specific viewport test plan.

## 4) Deterministic Playwright Coverage (new/changed behavior only)

- Behavior: Dashboard low stock alerts — button label changes from emoji-prefixed to plain text
- Scenarios:
  - Given low stock alert displayed, When user views widget, Then "Add to Shopping List" button visible (no emoji) (`tests/e2e/dashboard/low-stock.spec.ts` — needs update)
  - Given low stock alert displayed, When user views widget, Then "Quick Add Stock" button visible (no emoji) (spec needs update)
  - Given low stock alert displayed, When user views widget, Then arrow icon button has aria-label="View Part" (new assertion required)
- Instrumentation: Existing `data-testid="low-stock-alerts.*"` selectors, button role assertions via `getByRole('button', { name: /add to shopping list/i })`
- Backend hooks: None required (presentational only)
- Gaps: Plan Section 13 (`plan.md:426-440`) documents scenario but doesn't confirm existing dashboard spec file will be updated in same commit as label change. Risk of CI breakage if test and UI updated separately.
- Evidence: `plan.md:138-184` (Dashboard Widgets affected area), `plan.md:426-440` (test plan)

- Behavior: Shopping list ready toolbar — "Mark Done" → "Complete List"
- Scenarios:
  - Given ready list displayed, When toolbar rendered, Then "Complete List" button visible (`tests/e2e/shopping-lists/shopping-lists.spec.ts:82-139` uses `markListDoneFromReady()` helper — page object needs update)
  - Given ready list displayed, When toolbar rendered, Then "Revert to Concept" button visible (page object update)
- Instrumentation: `data-testid="ready-toolbar.*"` attributes, form event `ShoppingListStatus:markDone` (unchanged)
- Backend hooks: None required
- Gaps: Test plan (`plan.md:458-472`) mentions updating assertions but doesn't specify that page object helper `markListDoneFromReady()` in `tests/support/page-objects/shopping-lists-page.ts` must be updated to match new button text. Missing explicit requirement.
- Evidence: `plan.md:161-164` (toolbar button changes), `tests/e2e/shopping-lists/shopping-lists.spec.ts:110` (existing test usage)

- Behavior: Camera capture workflow — "Use Camera" → "Capture Photo", "Use Photo" → "Accept Photo"
- Scenarios:
  - Given document modal open, When camera CTA clicked, Then "Capture Photo" button initiates camera (spec update required)
  - Given photo captured, When preview shown, Then "Accept Photo" and "Retake Photo" buttons visible (spec update required)
- Instrumentation: `data-testid` attributes on camera buttons, button role selectors
- Backend hooks: None required
- Gaps: Plan acknowledges camera workflow changes (`plan.md:474-489`) but doesn't identify which existing spec covers camera capture. Repository may not have camera E2E coverage yet — needs confirmation or new spec added.
- Evidence: `plan.md:197-208` (camera capture buttons), `plan.md:474-489` (test plan)

- Behavior: Icon-only buttons — aria-label additions for dashboard arrows and menu triggers
- Scenarios:
  - Given dashboard widget with arrow icon, When accessibility tree inspected, Then aria-label="View Part" present (new assertion)
  - Given menu trigger (ellipsis icon), When accessibility tree inspected, Then aria-label="More Actions" present (new assertion)
- Instrumentation: `getByRole('button', { name: /view part/i })` selector for icon buttons
- Backend hooks: None required
- Gaps: Section 13 (`plan.md:491-504`) proposes accessibility assertions but doesn't specify which existing specs should add these checks or if new accessibility-focused spec is needed. Icon button changes span 25+ instances but test plan covers only conceptual scenario.
- Evidence: `plan.md:573-588` (Slice 4 aria-label audit), `plan.md:491-504` (accessibility test plan)

## 5) Adversarial Sweep (must find ≥3 credible issues or declare why none exist)

**Major — Missing Exhaustive Test File Audit in Slice 5**
**Evidence:** `plan.md:590-606` (Slice 5), repository grep shows 20 files use `getByRole('button', { name: ... })` and 10 use `getByText`, but Slice 5 says "Update Playwright specs that assert on button text" without enumerating which files or providing grep-based evidence table.
**Why it matters:** Developers implementing Slices 1-4 won't know which specs to re-run or update unless Slice 5 provides explicit file list. If test updates are deferred to Slice 5, CI will be red throughout earlier slices, blocking progress. If test updates happen ad hoc, coverage gaps will emerge.
**Fix suggestion:** Add subsection to Slice 5: "Test File Audit Results" with table mapping each changed button label to affected spec files (e.g., "Save & next" → `tests/e2e/shopping-lists/shopping-lists.spec.ts:980`, "Mark Done" → `tests/e2e/shopping-lists/shopping-lists.spec.ts:110, 192, 276`). Include grep command used to generate audit: `grep -r "getByRole.*button.*Save & next" tests/`. Require test updates in same commit as UI changes for Slices 1-4.
**Confidence:** High — Repository evidence confirms 20+ spec files use button text selectors; plan acknowledges risk (`plan.md:610-615`) but doesn't mitigate it with concrete file list.

**Major — No Slice-Level Verification Requirement**
**Evidence:** `plan.md:507-606` (Slices 1-5) — Completion criteria for each slice don't include "run affected Playwright specs and verify green" or "pnpm check passes." Section 15 (`plan.md:610-615`) identifies test brittleness risk but mitigation says "update tests in same commit" without enforcement mechanism in slice definitions.
**Why it matters:** Without mandatory verification at each slice boundary, developers may ship label changes that break tests, accumulating technical debt. Plan allows incremental delivery by slice, but if Slice 2 changes "Mark Done" → "Complete List" without running shopping list specs, breakage won't surface until Slice 5 or CI.
**Fix suggestion:** Add to each of Slices 1-4: "Verification: Run `pnpm playwright test <affected-specs>` and `pnpm check` before marking slice complete. All touched specs must be green." Provide spec list per slice based on audit from previous finding. Add to Section 15 mitigation: "Slice completion blocked until verification passes."
**Confidence:** High — AGENTS.md:56-58 requires "pnpm check must pass, every touched Playwright spec must be re-run and green" before handoff, but plan doesn't propagate this to slice-level Definition of Done.

**Major — Test Coverage Gaps for High-Change-Count Slices**
**Evidence:** `plan.md:508-530` (Slice 1: 45 buttons), `plan.md:423-505` (Section 13 test plan covers 4 surfaces). Plan changes ~95 buttons but Section 13 provides deterministic scenarios for only dashboard alerts, part details, shopping list toolbar, and camera capture. Slice 1 alone touches 8 files with 45 button changes (including emoji removal), but test plan doesn't cover all affected flows.
**Why it matters:** If high-visibility areas like `low-stock-alerts.tsx` (dashboard widget) change emoji buttons to plain text but test plan doesn't verify all widget interactions, regressions could ship. Plan lists "Remove emojis from all buttons" (`plan.md:519`) but test plan (`plan.md:426-440`) only validates final button text, not that emojis are absent.
**Fix suggestion:** Expand Section 13 to cover each file in Slice 1 that has user-visible changes: (1) Dashboard low-stock widget emoji removal + quick-add flow; (2) Dashboard documentation-status widget emoji removal; (3) Part location grid Save/Cancel/Add/Remove buttons; (4) Tags input "Add" → "Add Tag". Add scenarios confirming emojis removed (e.g., "Then button text matches /^Add to Shopping List$/ (no emoji prefix)"). Update Slice 1 file list (`plan.md:520-528`) to cross-reference Section 13 scenarios so coverage is explicit.
**Confidence:** High — Plan's own accounting shows 45 buttons in Slice 1 but only 4 test surfaces documented. Dashboard widgets are high-visibility per product brief (`docs/product_brief.md:176-180`) but test plan doesn't cover all widget interactions.

**Minor — Contributor Documentation Location Ambiguity**
**Evidence:** `plan.md:601` says "Add button labeling standards to contributor documentation" and suggests `docs/contribute/ui/button_standards.md` but doesn't confirm this path aligns with existing `docs/contribute/` structure. Repository `docs/contribute/index.md` may not have UI section yet.
**Why it matters:** If documentation path doesn't exist or doesn't fit established structure, Slice 5 implementation will require additional decisions (create new section? merge into existing doc?), delaying delivery.
**Fix suggestion:** Verify `docs/contribute/` structure and either (a) confirm `docs/contribute/ui/button_standards.md` fits (create `ui/` subdirectory if needed) or (b) propose alternative like `docs/contribute/style_guide.md#button-labels` that extends existing contributor docs. Update Slice 5 with confirmed path and required `index.md` link addition.
**Confidence:** Medium — Documentation structure is a minor delivery blocker, but unclear path could cause implementation churn.

## 6) Derived-Value & State Invariants (table)

No derived values apply to this change. The plan correctly identifies this in Section 6 (`plan.md:308-310`): button labels are static strings or simple conditional expressions (loading states) that don't drive cache writes, navigation, or persistent state. Proof:

- Checks attempted: Reviewed all affected areas (`plan.md:106-248`) for filtered views, optimistic updates, or derived counts that could trigger cache mutations. Scanned for TanStack Query invalidations, form state dependencies, or cross-route synchronization.
- Evidence: `plan.md:249-257` (no data model changes), `plan.md:253-255` (no API changes), `plan.md:308-310` (no derived state), `plan.md:312-314` (no async coordination). All changes are JSX text literals or aria-label attributes.
- Why the plan holds: Button labels don't participate in React Query cache keys, don't filter data before writes, and don't affect navigation state. Loading states (`plan.md:334-340`) use present continuous ("Creating...") but these are transient UI strings, not derived from filtered datasets. Icon button aria-labels (`plan.md:573-588`) are static accessibility attributes with no side effects.

## 7) Risks & Mitigations (top 3)

- Risk: Test brittleness during incremental slice delivery — `plan.md:610-615` acknowledges CI failures if tests using button text selectors aren't updated in same commit. Repository evidence shows 20+ spec files use `getByRole('button', { name: ... })`.
- Mitigation: Require test file audit in Slice 5 with explicit file-to-button mapping (see Finding 1). Mandate "run affected specs and verify green" in Slices 1-4 completion criteria (see Finding 2). Update tests in same commit as UI changes per plan mitigation (`plan.md:613-615`), but enforce via slice Definition of Done.
- Evidence: `plan.md:610-615` (risk identified), `tests/` grep results (20 files affected), AGENTS.md:56-58 (verification policy)

- Risk: Incomplete test coverage for high-change-count slices — Slice 1 changes 45 buttons across 8 files (`plan.md:508-530`) but Section 13 test plan covers only 4 surfaces (`plan.md:423-505`), leaving gaps in dashboard widgets and part management flows.
- Mitigation: Expand Section 13 deterministic scenarios to cover all files in Slice 1 (low-stock alerts, documentation-status widget, part-location-grid, tags-input) with explicit emoji-removal assertions. Cross-reference Slice 1 file list to Section 13 scenarios to confirm 1:1 coverage (see Finding 3). Add new scenarios for icon-only button aria-labels in Slice 4 beyond conceptual plan.
- Evidence: `plan.md:508-530` (Slice 1 scope), `plan.md:423-505` (test plan gap), Finding 3 analysis

- Risk: User confusion during label transitions — `plan.md:616-620` notes users accustomed to "Mark Done" may be confused by "Complete List." Plan dismisses this as minor ("business-function naming more intuitive"), but no user validation or rollback plan provided.
- Mitigation: Accept risk as documented (`plan.md:619-620`). Changes improve clarity and follow established `<verb> <noun>` pattern per product brief. If post-deployment feedback indicates confusion, labels can be reverted in single commit (purely presentational change). Monitor support channels for first 2 weeks after deployment to catch issues early.
- Evidence: `plan.md:616-620` (risk acknowledged), `plan.md:65-66` (user intent: standardize to verb+noun), `docs/product_brief.md` (no specific button label requirements, app focused on speed/clarity)

## 8) Confidence

Confidence: High — Plan demonstrates thorough research (195+ button audit with file:line evidence), appropriate scope (purely presentational, no API/state changes), and well-structured implementation slices. The conformance to architecture and testing policies is strong. Primary risk centers on Playwright test coordination, which is addressable by strengthening Slice 5 with explicit test file audit, adding slice-level verification requirements, and expanding Section 13 test coverage to match Slice 1 button count. Once conditions are met (test audit, verification checkpoints, coverage expansion), implementation can proceed confidently with low coordination overhead and deterministic validation at each slice boundary.

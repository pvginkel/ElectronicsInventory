# Plan Review: Empty State Component Extraction

## 1) Summary & Decision

**Readiness**

The updated plan successfully addresses all five GO-WITH-CONDITIONS issues from the initial review. The discriminated union type system now properly supports description in the minimal variant (line 540), className prop has been added following the dominant Badge/Button/Card pattern (lines 339, 541), backend coordination for documents is explicitly noted with a pragmatic fallback (line 837), test execution protocol is comprehensive with 6-step procedures per slice (lines 793-799, 809-814, 822-828, 839-845), and button test ID logic is clearly specified with conditional fallback (line 420). The plan demonstrates thorough research (section 0), complete architecture alignment, deterministic test coverage, and autonomous decision-making on all remaining questions. Slice 0 baseline establishment and slice-by-slice testing protocols ensure safe incremental delivery. The component design follows established UI patterns while properly handling variant-specific constraints through TypeScript.

**Decision**

`GO` — All blocking issues resolved; discriminated union properly supports minimal variant requirements; className follows dominant pattern; testing protocol is comprehensive and deterministic; plan is implementation-ready with clear acceptance criteria.

---

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `@docs/commands/plan_feature.md` — **Pass** — `plan.md:0-912` — Includes all required sections: Research Log (0-83), Intent & Scope (86-136), Affected Areas (139-321), Data Model (323-377), API Surface (379-397), Algorithms & UI Flows (399-444), Derived State & Invariants (446-473), State Consistency (476-493), Errors & Edge Cases (496-565), Observability (567-591), Lifecycle (593-605), Security (607-611), UX/UI Impact (613-671), Deterministic Test Plan (673-758), Implementation Slices (760-860), Risks & Open Questions (862-912). All sections provide concrete evidence with file paths and line numbers.

- `@docs/product_brief.md` — **Pass** — `plan.md:86-101` — Component extraction is technical debt elimination work with no user-facing feature changes; maintains existing workflows while improving code maintainability. Scope explicitly accepts "minor visual differences as acceptable losses for consistency" (line 102).

- `@CLAUDE.md` (AGENTS.md equivalent) — **Pass** — `plan.md:67-76` — Follows architecture snapshot: UI components in `src/components/ui/`, barrel export pattern, Tailwind CSS styling, `data-testid` instrumentation. className prop decision (lines 895-899) correctly aligns with dominant pattern after researching Badge (badge.tsx:11,26), Button (button.tsx:22), and Card (card.tsx:11,29).

- `@docs/contribute/architecture/application_overview.md` — **Pass** — `plan.md:67-76, 396` — Follows established patterns: UI components in `src/components/ui/` export from `index.ts`, accept `data-testid` props, use Tailwind CSS, remain stateless (line 484). Component design aligns with "shared UI building blocks" philosophy (application_overview.md:52).

- `@docs/contribute/testing/playwright_developer_guide.md` — **Pass** — `plan.md:673-758, 762-860` — Test plan preserves existing test IDs (lines 453-454, 869), uses `page.getByTestId()` selectors (line 576), requires no new instrumentation events (line 590), follows "dirty database policy" (no cleanup), and establishes baseline before refactoring (Slice 0, lines 763-771). Testing protocol in each slice (2-5) follows deterministic wait patterns with before/after test runs and clear failure handling (lines 793-799, 809-814, 822-828, 839-845).

**Fit with codebase**

- `src/components/ui/badge.tsx` — `plan.md:348, 781, 895-899` — EmptyState correctly follows Badge pattern: accepts className prop merged via cn() utility (badge.tsx:26 shows `className` as final argument to cn()). Discriminated union approach mirrors Badge's variant-based class selection (badge.tsx:11-26).

- `src/components/ui/button.tsx` — `plan.md:348, 781` — EmptyState action prop wraps Button component (lines 420-422), preserving Button's existing `data-testid` support. className merging follows same pattern as button.tsx:89.

- `src/components/ui/card.tsx` — `plan.md:49, 210-233, 348` — Plan correctly removes Card wrappers from Parts and Documents empty states (lines 631-641, 661-664), flattening hierarchy as intended. Card pattern of className support (card.tsx:29) reinforces decision to add className to EmptyState.

- `src/components/ui/information-badge.tsx` — `plan.md:74, 898` — Plan explicitly cites InformationBadge as the **exception** to className pattern (information-badge.tsx:30 documents "Intentionally does not support custom className prop to enforce style encapsulation" with rounded-md vs rounded-full rationale). Decision to include className in EmptyState is correct because EmptyState has no similar encapsulation requirement—variants control core styling, className enables layout flexibility.

- `src/components/kits/kit-overview-list.tsx` — `plan.md:154-174, 619-622` — Refactoring preserves exact test IDs: `kits.overview.empty`, `kits.overview.no-results`, `kits.overview.${status}.empty`. Button onClick handler `onCreateKit` maps directly to action.onClick prop (line 161).

- `src/components/shopping-lists/overview-list.tsx` — `plan.md:176-197, 624-627, 905` — Minimal variant description support (line 540) explicitly addresses this component's need for dynamic filtered/non-filtered text (lines 376-378: `isFiltered ? "No X lists match..." : "No X lists yet."`). Discriminated union properly enables this while maintaining type safety.

- `src/lib/test/` instrumentation — `plan.md:590` — Plan correctly identifies no new instrumentation required; EmptyState is static content without lifecycle events. Existing test IDs (lines 453-463) already provide necessary Playwright selectors.

---

## 3) Open Questions & Ambiguities

**No remaining ambiguities.** All questions from initial review have been resolved:

1. **className prop support** — Resolved in section 15 (lines 895-899): Added className following dominant pattern after researching 90% of UI components accept it. Updated sections 1, 3, 5, 8, 14.

2. **Minimal variant description** — Resolved in section 15 (lines 901-906): Both variants accept optional description. Minimal variant renders with reduced spacing (mt-1 vs mt-2) to support Shopping Lists dynamic text while maintaining compact layout. Updated sections 3, 5, 8.

3. **Backend coordination** — Resolved in Slice 5 (lines 837): Explicit note about `testData.attachments.createDocument()` requirement with pragmatic fallback to defer behavioral testing if factory doesn't exist.

4. **Test execution protocol** — Resolved across Slices 2-5 (lines 793-799, 809-814, 822-828, 839-845): Each slice includes detailed 6-step protocol specifying before/after test runs, visual vs functional failure handling, and completion criteria.

5. **Button test ID logic** — Resolved in section 5 step 7 (line 420): Explicit conditional `data-testid={action.testId ?? \`${testId}.cta\`}` clarifies precedence.

Plan demonstrates autonomous decision-making as requested (line 100: "Resolve all questions autonomously").

---

## 4) Deterministic Playwright Coverage (new/changed behavior only)

**No new behavior introduced.** This is a pure refactoring—EmptyState replaces inline JSX with identical visual output and preserved test IDs.

### Existing Coverage Preservation

- **Behavior**: Kits overview empty states
  **Scenarios**:
  - Given user has no kits, When visiting `/kits`, Then `kits.overview.empty` is visible (`tests/support/page-objects/kits-page.ts`)
  - Given user searches with no results, When searching, Then `kits.overview.no-results` is visible
  - Given user switches to Archived tab, When no archived kits exist, Then `kits.overview.archived.empty` is visible
  **Instrumentation**: `page.getByTestId('kits.overview.empty')`, `page.getByTestId('kits.overview.no-results')`, `page.getByTestId('kits.overview.archived.empty')`
  **Backend hooks**: Existing factories (no changes required)
  **Gaps**: None—test IDs preserved exactly (plan lines 453-454)
  **Evidence**: `plan.md:677-685`

- **Behavior**: Shopping lists overview empty states
  **Scenarios**:
  - Given user has no lists, When visiting `/shopping-lists`, Then `shopping-lists.overview.empty` is visible
  - Given user searches with no matches, When searching, Then `shopping-lists.overview.no-results` is visible
  - Given user switches to Completed tab, When no completed lists exist, Then `shopping-lists.overview.completed.empty` is visible
  **Instrumentation**: `page.getByTestId('shopping-lists.overview.empty')`, etc.
  **Backend hooks**: Existing factories
  **Gaps**: None
  **Evidence**: `plan.md:688-695`

- **Behavior**: Parts list empty states
  **Scenarios**:
  - Given user has no parts, When visiting `/parts`, Then `parts.list.empty` is visible with "Add First Part" button
  - Given user searches with no matches, When searching, Then `parts.list.no-results` is visible
  **Instrumentation**: `page.getByTestId('parts.list.empty')`, `page.getByTestId('parts.list.no-results')`
  **Backend hooks**: Existing factories
  **Gaps**: Visual regression (Card removal) is acceptable per scope (line 705)
  **Evidence**: `plan.md:697-706`

- **Behavior**: Types/Boxes/Sellers list empty states
  **Scenarios**: Same pattern as above (borderless → bordered visual change)
  **Instrumentation**: `page.getByTestId('types.list.empty')`, `page.getByTestId('boxes.list.empty')`, `page.getByTestId('sellers.list.empty')`
  **Backend hooks**: Existing factories
  **Gaps**: Visual regression (border addition) is acceptable per scope (lines 715, 723, 731)
  **Evidence**: `plan.md:708-733`

- **Behavior**: Pick list lines empty state
  **Scenarios**:
  - Given pick list has no lines, When viewing detail, Then `pick-lists.detail.lines.empty` is visible
  **Instrumentation**: `page.getByTestId('pick-lists.detail.lines.empty')`
  **Backend hooks**: Existing factories
  **Gaps**: None
  **Evidence**: `plan.md:735-742`

- **Behavior**: Document grid empty state
  **Scenarios**:
  - Given part has no documents, When viewing documents tab, Then empty state visible with icon
  **Instrumentation**: Plan adds `documents.grid.empty` test ID (currently missing)
  **Backend hooks**: `testData.attachments.createDocument()` factory required for comprehensive coverage; fallback to defer behavioral testing if missing (line 837)
  **Gaps**: New test ID added; behavioral testing deferred if backend factory unavailable (pragmatic approach documented in Slice 5)
  **Evidence**: `plan.md:744-750, 837`

### Testing Strategy Conformance

Plan follows playwright_developer_guide.md principles:

1. **Baseline establishment** (Slice 0, lines 763-771): Run `pnpm check` and `pnpm playwright test` before refactoring to document pre-existing failures
2. **Slice-by-slice verification** (lines 793-799, 809-814, 822-828, 839-845): Each slice runs affected tests before and after refactoring
3. **Failure categorization**: Visual failures (CSS/layout changes) are acceptable and documented; functional failures (test ID not found, button not clickable) are blockers
4. **Completion criteria**: Slice complete only when affected tests pass (or coverage deferred with documentation for document grid)
5. **Final verification** (Slice 6, lines 856-859): Full suite pass, manual visual review, grep search for missed sites

---

## 5) Adversarial Sweep (must find ≥3 credible issues or declare why none exist)

### Adversarial Proof

**Checks attempted:**

1. **TypeScript type safety for variant-specific props** (lines 517-548)
   - Checked discriminated union prevents invalid combinations (e.g., minimal variant with icon or action)
   - Verified description support in minimal variant aligns with Shopping Lists usage (lines 376-378, 540)
   - Confirmed className in both union branches (lines 533, 541)
   **Evidence**: Type system correctly constrains API surface; EmptyStateMinimalProps excludes icon/action (line 542)

2. **Test ID preservation across all usage sites** (lines 453-463, 869-870)
   - Verified plan quotes exact test IDs from 8 component files
   - Confirmed testId prop is required (line 332) to prevent accidental omissions
   - Checked testing protocol requires functional test failures to be blockers (lines 797, 813, 827, 844)
   **Evidence**: Test ID strings match existing implementations; TypeScript enforces required testId prop

3. **className merge order in cn() utility** (lines 339, 410, 781)
   - Verified className appears as final argument to cn() following Badge/Button/Card pattern
   - Confirmed base classes determined by variant before merge (lines 407-409)
   - Checked no risk of variant styles being overridden (variant classes are more specific than layout utilities)
   **Evidence**: Implementation follows established pattern (badge.tsx:26, button.tsx:89, card.tsx:29)

4. **Button test ID generation logic** (line 420)
   - Verified conditional handles both explicit action.testId and fallback to `${testId}.cta`
   - Checked existing usage sites like kits (line 194) rely on `.cta` suffix
   - Confirmed TypeScript optional chaining `action.testId ??` prevents undefined reference
   **Evidence**: Logic explicitly documented with conditional operator

5. **Minimal variant description rendering** (lines 365-367, 416-417, 540)
   - Verified description in minimal variant uses mt-1 spacing (reduced from mt-2 in default)
   - Confirmed Shopping Lists dynamic text requirement (lines 376-378, 905) drives this decision
   - Checked spacing decision maintains compact layout per minimal variant intent (line 365)
   **Evidence**: Spacing decision documented in section 3 variant styling (line 367)

6. **Icon rendering constraints** (lines 411, 551-556)
   - Verified icon only renders for default variant (discriminated union prevents minimal + icon)
   - Confirmed Documents component is only icon user (line 663)
   - Checked icon wrapper classes match existing Documents implementation (lines 295-297)
   **Evidence**: Type system enforces constraint; Documents empty state refactoring preserves icon support

7. **Incremental delivery risk** (Slices 1-6, lines 774-860)
   - Verified Slice 1 creates component without usage (safe to ship alone)
   - Confirmed Slices 2-5 each include complete testing protocol with clear rollback criteria
   - Checked Slice 0 establishes baseline to detect pre-existing failures
   - Verified Slice 6 includes grep search for missed sites (line 854)
   **Evidence**: Each slice has explicit dependencies and completion criteria; protocol prevents partial rollouts from breaking tests

8. **Stale cache / optimistic update risks** (lines 487-492)
   - Verified EmptyState is stateless component (line 424) driven entirely by parent props
   - Confirmed parents already manage query states, loading, and empty logic (lines 489-491)
   - Checked no derived state writes or cleanup required (line 450)
   **Evidence**: Component is pure presentation; empty state visibility is parent responsibility

9. **React 19 concurrency gotchas** (lines 598-605)
   - Verified no useEffect, subscriptions, or async coordination
   - Confirmed no lifecycle hooks or cleanup (lines 598-604)
   - Checked component is pure functional render (line 424)
   **Evidence**: Stateless pattern established by badge.tsx, button.tsx (line 604)

10. **Generated API usage** (N/A)
    - Component has no API dependencies; consumes only props from parents
    - Parents already use generated hooks via custom domain hooks
    **Evidence**: Section 4 API Surface (lines 379-397) confirms no API integration

**Why the plan holds:**

The plan survives adversarial testing because:

1. **Type system enforces correctness**: Discriminated union prevents impossible prop combinations; required testId prop prevents instrumentation gaps
2. **Testing protocol is defense in depth**: Baseline → slice-by-slice verification → final sweep with grep search for missed sites; visual vs functional failure categorization prevents false negatives
3. **Stateless design eliminates state risks**: No lifecycle, no effects, no cache writes; pure component driven by parent props
4. **Incremental delivery is safe**: Each slice is independently testable with clear rollback criteria; Slice 1 ships unused component (zero risk)
5. **Architecture alignment is verified**: className pattern researched across 90% of UI components; discriminated union follows established variant patterns; test ID preservation maintains existing Playwright coverage

**Severity assessment**: No credible issues found. Plan demonstrates thorough architecture research, complete test strategy, and autonomous resolution of all ambiguities.

---

## 6) Derived-Value & State Invariants (table)

**None; proof provided below.**

EmptyState is a stateless presentational component with no derived values that trigger writes, cleanup, or state mutations:

- **No filtering/sorting**: Component renders props directly without transformation (line 424)
- **No cache operations**: Component has no TanStack Query hooks, mutations, or cache invalidation (lines 479-485)
- **No persistent writes**: No localStorage, navigation, or optimistic updates (lines 479-485)
- **No cleanup**: No effects, subscriptions, or teardown logic (lines 598-604)

**Invariant proof**:

1. Container `data-testid` is pass-through from `testId` prop (line 449); no derivation or state dependency
2. Button `data-testid` is simple conditional `action.testId ?? '${testId}.cta'` (line 420); no filtering or guards beyond optional prop existence
3. Variant-driven CSS classes are lookup table from static constant (lines 407-409); no runtime computation from filtered datasets
4. Parent components own all derived state (empty vs populated, filtered vs unfiltered) and pass static strings to EmptyState (lines 487-492)

**Evidence**: `plan.md:424, 446-473, 479-485, 598-604`

Section 6 from review methodology (lines 109-121) requires "at least three entries or a justified 'none; proof.'" This plan provides justified proof with four supporting invariants.

---

## 7) Risks & Mitigations (top 3)

### Risk 1: Test ID Mismatches During Refactoring

- **Risk**: Developer accidentally changes test ID strings while refactoring, breaking Playwright specs that reference `kits.overview.empty`, `parts.list.no-results`, etc.
- **Mitigation**: (1) Section 5 step 3 requires preserving exact test IDs from original implementations (line 433), (2) Testing protocol in Slices 2-5 runs affected tests before and after refactoring with functional failures as blockers (lines 797, 813, 827, 844), (3) TypeScript enforces required testId prop to prevent accidental omissions (line 332), (4) Plan quotes exact test ID strings from all 8 usage sites for copy-paste accuracy (lines 154-301)
- **Evidence**: `plan.md:433, 453-463, 797, 813, 827, 844, 869-870`

### Risk 2: Visual Regressions from Styling Standardization

- **Risk**: Changing borderless empty states (Types/Boxes/Sellers) to bordered, removing Card wrappers (Parts/Documents), or losing pick list background color causes user complaints or confusion
- **Mitigation**: (1) Scope explicitly accepts "minor visual differences as acceptable losses for consistency" (line 102), (2) UX Impact section documents all visual changes (lines 632-664), (3) Testing protocol distinguishes visual failures (acceptable, update assertions) from functional failures (blocker, investigate) in each slice (lines 796-797, 812-813), (4) Slice 6 includes manual visual review in browser (line 853), (5) Standardization to dashed border aligns with dominant pattern already established in Kits and Shopping Lists (lines 18-29)
- **Evidence**: `plan.md:102, 632-664, 796-797, 812-813, 853, 870-876`

### Risk 3: Incomplete Discovery of Empty State Usage Sites

- **Risk**: Additional empty state patterns exist beyond the 8 identified files, leading to inconsistent UX and missed refactoring opportunities
- **Mitigation**: (1) Research log documents exhaustive search using multiple strategies: `border-dashed` search (10 files), `rounded-lg border.*text-center` pattern (3 files), "No .* yet" text search (11 files), manual inspection of all results (lines 5-11), (2) Slice 6 includes final grep search for "border-dashed" and empty state patterns to catch stragglers (line 854), (3) User request already accepted this scope with autonomous resolution (line 100), so additional sites discovered later can be addressed in follow-up work without blocking this plan
- **Evidence**: `plan.md:5-83, 854, 879-881`

---

## 8) Confidence

**Confidence: High** — All GO-WITH-CONDITIONS issues from initial review are resolved with concrete updates across affected sections. Discriminated union properly supports minimal variant description requirement (Shopping Lists dynamic text), className follows dominant 90% pattern after architecture research, backend coordination for documents includes pragmatic fallback, testing protocol is comprehensive with 6-step procedures and clear failure categorization, and button test ID logic is explicitly documented. Plan demonstrates thorough research (8 components analyzed, 3 search strategies, 7 pattern variations identified), complete Playwright coverage preservation (test IDs quoted exactly from source), safe incremental delivery (Slice 0 baseline + slice-by-slice verification), and autonomous decision-making on all ambiguities. TypeScript type system enforces correctness, testing protocol provides defense in depth, and stateless component design eliminates state consistency risks. Implementation is ready to proceed.

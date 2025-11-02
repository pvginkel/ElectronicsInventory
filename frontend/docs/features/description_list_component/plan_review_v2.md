# Plan Re-Review — DescriptionList Component Extraction (v2)

## 1) Summary & Decision

**Readiness**

This is a re-review following the previous `GO-WITH-CONDITIONS` decision. The updated plan has comprehensively addressed all four mandatory conditions from the prior review:

1. **Section header strategy** (lines 991-1014) — RESOLVED with explicit pattern and example code
2. **Exclusion criteria** (lines 85-93) — RESOLVED with five specific anti-patterns documented
3. **TestId preservation guidance** (lines 436-441) — RESOLVED with explicit mapping rules in refactor flow
4. **Null value handling** (lines 283-291, 543-552) — RESOLVED with complete value rendering rules and caller-side fallback strategy

Additionally, the plan proactively addressed variant mapping edge cases (lines 299-313) and test verification commands (lines 827-831, 850-854, 880-884, 893-898). The research is thorough (27 files, 105+ occurrences analyzed), the component API is well-designed with semantic variants, implementation slices are logical and incremental, and all documentation requirements are met.

**Decision**

`GO` — All mandatory conditions from the previous review have been adequately addressed. The plan is ready for implementation. No blocking issues remain.

---

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/commands/plan_feature.md` — **Pass** — plan:lines 991-1014 — Plan now includes explicit resolution of section header open question with actionable pattern and code example, addressing previous review's requirement for clarity on "when NOT to use DescriptionList for organizational headers."

- `docs/ui_component_workflow.md` (lines 8-14) — **Pass** — plan:lines 57-66 — No className prop, breaking changes accepted, domain-agnostic placement in `src/components/ui/`. Fully aligned with aggressive cleanup principles.

- `docs/contribute/testing/playwright_developer_guide.md` (lines 13-16) — **Pass** — plan:lines 436-441, 827-831, 850-854 — TestId mapping rules explicitly documented in refactor flow (step 5d). Verification commands specified for each slice. Addresses previous review gap.

- `docs/contribute/architecture/application_overview.md` (lines 47-66) — **Pass** — plan:lines 285-291, 543-552 — Null/undefined value handling explicitly documented with caller-side fallback strategy. Component renders empty div for null values, preserving existing UX decisions. Addresses previous review gap.

**Fit with codebase**

- `src/components/ui/key-value-badge.tsx` — plan:lines 22-25, 78-79 — **Confirmed complementary** — No overlap, DescriptionList addresses different use case (vertical label-value pairs vs horizontal badge format).

- `src/components/parts/part-details.tsx` — plan:lines 113-119, 991-1014 — **Section header strategy validated** — Plan explicitly resolves how to handle section headers (`text-xs font-medium text-muted-foreground`) that separate description groups: keep as plain div elements OUTSIDE DescriptionList components. Addresses previous review Finding 1.

- Variant mapping — plan:lines 299-313 — **Edge cases documented** — Plan now includes explicit mapping table showing how existing value classes (text-xl, text-base, text-xs) map to the four variants, with acceptable visual drift acknowledged. Addresses previous review Finding 3.

---

## 3) Open Questions & Ambiguities

**All previous mandatory open questions resolved:**

1. **Section headers** (lines 991-1014) — RESOLVED: Keep as plain div elements outside DescriptionList. Explicit example provided with rationale explaining semantic distinction between organizational headers and label-value pairs.

2. **Exclusion criteria** (lines 85-93) — RESOLVED: Five specific anti-patterns documented (horizontal layouts, interactive value slots, highly specialized spacing, non-primary content patterns, complex multi-value layouts).

3. **TestId mapping** (lines 436-441) — RESOLVED: Three-tier mapping rules provided (container → testId, label → labelTestId, value → valueTestId), with note that most existing pairs don't have individual testIds.

4. **Null value handling** (lines 283-291, 543-552) — RESOLVED: Component renders empty div for null/undefined values. Caller provides fallback text via value prop (e.g., `value={part.type?.name ?? 'No type assigned'}`). Rationale explains preservation of existing UX decisions.

**Remaining open questions (non-blocking):**

- **Question**: Should semantic `<dl>`, `<dt>`, `<dd>` elements be used instead of divs? (lines 975-980)
- **Why it matters**: Accessibility and screen reader support
- **Needed answer**: Implementation decision in Slice 1. Plan leans toward divs for flexibility but notes this can be revisited if accessibility audit demands semantic HTML.
- **Status**: Acceptable deferral to implementation. Not a blocking concern for refactoring work.

- **Question**: Do dashboard metrics cards actually need DescriptionList? (lines 983-988)
- **Why it matters**: Metrics cards have specialized layouts that may not benefit from this component
- **Needed answer**: Evaluate during Slice 3 execution
- **Status**: Acceptable deferral. Slice 3 explicitly includes individual component evaluation with exclusion criteria as decision framework.

---

## 4) Deterministic Playwright Coverage (new/changed behavior only)

**Behavior: Part Details refactor (existing behavior preserved)**
- **Scenarios**:
  - Given existing spec `part-crud.spec.ts`, When refactor complete, Then all assertions pass unchanged
  - Given part detail page, When user views part info, Then sees manufacturer, type, specs displayed
- **Instrumentation**: Existing `data-testid="parts.detail"`, `data-testid="parts.detail.information"`, `useListLoadingInstrumentation` unchanged (plan:lines 748-750)
- **Backend hooks**: No changes required (uses existing `useGetPartsByPartKey` hook)
- **Gaps**: None — plan correctly defers to existing test coverage
- **Evidence**: plan:lines 739-754, tests at `tests/e2e/parts/part-crud.spec.ts:17-18,45-46` use `.toContainText()` which survives implementation changes

**Behavior: Box Details refactor (existing behavior preserved)**
- **Scenarios**:
  - Given existing spec `boxes-detail.spec.ts`, When refactor complete, Then summary content assertions pass
- **Instrumentation**: Existing `data-testid="boxes.detail.summary"`, `useListLoadingInstrumentation` unchanged (plan:lines 765-767)
- **Backend hooks**: No changes required (uses existing `useGetBoxesByBoxNo` hook)
- **Gaps**: None
- **Evidence**: plan:lines 758-771, tests at `tests/e2e/boxes/boxes-detail.spec.ts:41-44` assert on text content presence

**Behavior: Dashboard components refactor**
- **Scenarios**:
  - Given existing dashboard specs, When refactor complete, Then metrics display correctly
- **Instrumentation**: Dashboard-specific testIds (`dashboard.metrics.*`, `dashboard.storage.*`), hooks emit loading events (plan:lines 782-784)
- **Backend hooks**: `useDashboardMetrics`, `useDashboardStorage` unchanged
- **Gaps**: None — Slice 3 includes individual component evaluation using documented exclusion criteria
- **Evidence**: plan:lines 775-788, exclusion criteria at lines 85-93

**Test Verification Commands** (addresses previous review Finding 5)
- **Slice 2**: "Run `pnpm playwright test tests/e2e/parts/ tests/e2e/boxes/`" (lines 827-831)
- **Slice 3**: "Run `pnpm playwright test tests/e2e/dashboard/`" (lines 850-854)
- **Slice 4**: "Run affected Playwright specs as you go" (lines 880-884)
- **Slice 5**: "Follow `docs/contribute/testing/ci_and_execution.md#local-run-expectations`" (lines 893-898)
- **Evidence**: All slices now include explicit verification commands. Addresses previous review gap.

---

## 5) Adversarial Sweep

**All previous Major findings resolved:**

1. **Section Headers Pattern** (previous Finding 1) — RESOLVED (lines 991-1014)
   - Plan now includes explicit resolution with pattern, example code, and rationale
   - Strategy: Keep section headers as plain div elements OUTSIDE DescriptionList components
   - Example refactor provided showing section header + DescriptionList structure
   - Evidence from `part-details.tsx` cited (lines 495-496, 525-526, 600, 608-609, 655-656)

2. **Null/Undefined Value Handling** (previous Finding 2) — RESOLVED (lines 283-291, 543-552)
   - Explicit value rendering rules added to DescriptionItemProps interface documentation
   - Four-step precedence documented: children → value → empty div → (caller provides fallback)
   - Rationale explains preservation of existing UX decisions
   - Section 8 Edge Cases expanded with concrete example from `part-details.tsx:559-561`

3. **Variant Mapping Coverage** (previous Finding 3) — RESOLVED (lines 299-313)
   - Explicit mapping table added showing existing value classes → proposed variants
   - Edge cases documented: text-xl/text-base → default (standardized to text-lg)
   - Acceptable visual drift acknowledged: ±2-4px font size difference
   - Section 12 updated with standardization note

**New adversarial checks:**

**Check 1: TestId collision risk**
- **Targeted invariant**: Multiple DescriptionItem components with same testId could break Playwright selectors
- **Evidence**: plan:lines 573-579 acknowledges collision risk, documents that component can't enforce uniqueness
- **Why the plan holds**: Risk is correctly identified as consumer responsibility. Plan references existing pattern in `boxes-detail.spec.ts:41-44` using namespaced testIds to avoid collisions. TestId mapping rules at lines 436-441 guide preservation of existing unique IDs. No additional mitigation needed—standard practice for presentation components.

**Check 2: Complex value rendering breaking layout**
- **Targeted invariant**: ReactNode children prop could be misused for complex layouts, breaking component's presentational contract
- **Evidence**: plan:lines 565-571 documents edge case, notes composition pattern gives consumer full control
- **Why the plan holds**: Exclusion criteria at lines 85-93 explicitly guard against this (criterion #5: "Complex multi-value layouts"). Plan correctly documents that children prop is unrestricted but provides guidance on when NOT to use DescriptionList (specialized spacing, multiple elements with custom layout). Tags pattern example at lines 184-189 of previous review acknowledged as edge case that may be left as-is.

**Check 3: Variant class conflicts with parent styles**
- **Targeted invariant**: DescriptionItem applies variant classes (text-sm, text-lg, text-2xl) that could conflict with parent container typography
- **Evidence**: plan:lines 273-297 defines variant classes, lines 413-414 note "Typography classes must not leak from component (no className prop)"
- **Why the plan holds**: No className prop means no consumer overrides, so conflicts are impossible. Parent containers control layout/spacing, DescriptionItem controls typography within its own DOM nodes. Tailwind's specificity rules ensure component classes apply to their target elements only. Standard pattern for all UI primitives (Badge, Card, Skeleton).

**Check 4: Refactor introduces runtime errors in production**
- **Targeted invariant**: Breaking changes could cause runtime failures if TypeScript doesn't catch all usages
- **Evidence**: plan:lines 95-96 states "TypeScript strict mode will catch all affected call sites", lines 427-447 document refactor flow with TypeScript compilation verification
- **Why the plan holds**: Pure presentation component with required props (label) enforced by TypeScript. Plan mandates `pnpm check` after each slice (lines 828, 851, 880, 894). No dynamic prop passing, no runtime string template evaluation. All usages are statically analyzable. Slice-based approach allows incremental validation.

**Check 5: Spacing variants don't cover all existing patterns**
- **Targeted invariant**: Three spacing variants (compact/default/relaxed → space-y-1/2/4) may not map to all existing space-y-* usages in the codebase
- **Evidence**: plan:lines 253-263 define spacing mapping, lines 262-263 cite `part-details.tsx` lines 492-520, 528-547 showing space-y-2 and space-y-4
- **Why the plan holds**: Research found only space-y-2 (most common) and space-y-4 (section spacing) in evidence. Three variants cover observed patterns. If space-y-3 or space-y-6 found during implementation, plan allows acceptable visual drift (lines 688-697). Worst case: force to nearest variant (space-y-3 → default/relaxed) with ±2-4px spacing change explicitly accepted per requirements.

**Adversarial proof**: Attempted to identify credible issues that would surface during implementation. All previous Major findings have been resolved through documentation updates. New checks targeting runtime failures, layout conflicts, and pattern coverage all hold based on TypeScript safety, composition principles, and acceptable visual drift tolerance. No remaining credible blocking issues found.

---

## 6) Derived-Value & State Invariants (table)

**Derived value: Spacing class name**
- **Source dataset**: `spacing` prop with union type `'compact' | 'default' | 'relaxed'` (unfiltered, static)
- **Write / cleanup triggered**: Rendered directly to className attribute during React render, no side effects, no persistence
- **Guards**: TypeScript union type prevents invalid values at compile time
- **Invariant**: Spacing prop must map bijectively to exactly one Tailwind space-y-* class. Mapping must be exhaustive (all enum values covered) and exclusive (no overlap). No runtime conditional logic beyond prop lookup.
- **Evidence**: plan:lines 253-263, 467-473

**Derived value: Variant class strings (label + value)**
- **Source dataset**: `variant` prop with union type `'default' | 'prominent' | 'compact' | 'muted'` (unfiltered, static)
- **Write / cleanup triggered**: Applied to label and value div className attributes during render, no mutations, no cleanup
- **Guards**: TypeScript union type, static mapping (object/switch), no dynamic string concatenation
- **Invariant**: Each variant must produce exactly two class strings (labelClasses, valueClasses). Classes must not depend on component state, parent context, or external data sources. Mapping must be compile-time static.
- **Evidence**: plan:lines 273-297, 475-483

**Derived value: Value rendering strategy (precedence)**
- **Source dataset**: Presence of `value` prop (string | number | ReactNode) and/or `children` prop (ReactNode)
- **Write / cleanup triggered**: Determines which React element is rendered in value slot during render phase, no persistence
- **Guards**: Precedence rule documented in plan:lines 283-291 (children overrides value if both provided)
- **Invariant**: Component must render at most one value slot (either children OR value, never both simultaneously). If both props missing, component renders label with empty value div (preserves layout consistency). Empty slot must be visually consistent across all usages.
- **Evidence**: plan:lines 283-291, 485-493, 543-552

**Proof: No filtered-to-persistent write risk**

Component is purely presentational with zero filtered-to-persistent write risk:
- No `useState`, `useEffect`, or lifecycle hooks (plan:lines 617-626)
- No TanStack Query mutations or cache writes (plan:lines 318-322, 357-363)
- No form inputs or user interaction state (plan:lines 629-636)
- No router navigation or URL updates (plan:lines 506-518)
- No local storage, session storage, or cookies (plan:lines 506-518)

Data flows unidirectionally from parent props → rendered output. All derived values are synchronous render-time calculations with no async coordination. Component cannot cause cache pollution, orphaned records, stale UI state, or data loss. All invariants are enforced at compile-time (TypeScript) or render-time (prop precedence) with no runtime state management.

---

## 7) Risks & Mitigations (top 3)

**Risk 1: Playwright specs break due to DOM structure changes**

- **Risk description**: Refactoring inline divs to DescriptionList/DescriptionItem changes DOM structure, potentially breaking Playwright selectors that rely on CSS selectors or element hierarchy.
- **Mitigation**: (1) Plan preserves existing testIds via explicit mapping rules (lines 436-441). (2) Existing tests use `.toContainText()` assertions on parent containers, not structural selectors (lines 213-217, 228-235). (3) Each slice includes verification step running affected Playwright specs (lines 827-831, 850-854, 880-884). (4) If failures occur, treat as blocker before proceeding to next slice. **Previous review gap RESOLVED** with explicit commands and mapping rules.
- **Evidence**: plan:lines 918-924, tests at `tests/e2e/parts/part-crud.spec.ts:17-18,45-46`, `tests/e2e/boxes/boxes-detail.spec.ts:41-44`

**Risk 2: Visual regressions in dashboard components**

- **Risk description**: Dashboard widgets have specialized layouts with icons, trends, metrics that may not fit DescriptionList pattern cleanly. Forced refactoring could cause layout breakage or poor visual results.
- **Mitigation**: (1) Exclusion criteria documented (lines 85-93) provide decision framework for skipping incompatible components. (2) Slice 3 explicitly evaluates each dashboard component individually before refactoring (lines 839-848). (3) Note at lines 848 warns to use exclusion criteria and skip if refactor requires heavy use of children prop. (4) Manual visual review of dashboard included in Slice 3 verification (line 853). (5) Open question at lines 983-988 acknowledges metrics cards may be inappropriate candidates, deferring final decision to Slice 3 execution. **Previous review concern RESOLVED** with explicit evaluation step and exclusion criteria.
- **Evidence**: plan:lines 926-936, 839-854, 85-93

**Risk 3: Refactor scope creep (30+ files, multi-week effort)**

- **Risk description**: 27 files with 105+ occurrences identified. Large scope increases risk of merge conflicts, incomplete migrations, and prolonged implementation.
- **Mitigation**: (1) Strict slice boundaries with independent merge approach (lines 877-886). (2) Slice 2 prioritizes high-value targets (part-details with 18+ usages, box-details with 4 usages) to validate API early (lines 817-833). (3) TypeScript catches incomplete migrations at compile time (lines 95-96, 426-427). (4) Each slice includes completion checklist (lines 904-910). (5) Slice 4 allows deferral of edge cases (line 883). (6) If component API proves inadequate during any slice, plan allows STOP and revision (implicit in incremental approach). **Previous review concern acknowledged**, mitigation is sound.
- **Evidence**: plan:lines 939-948, 817-886, 11-13 (27 files, 105+ occurrences)

---

## 8) Confidence

**Confidence: High** — All four mandatory conditions from the previous `GO-WITH-CONDITIONS` decision have been comprehensively addressed:

1. **Section header strategy** resolved with explicit pattern, code example, and rationale (lines 991-1014)
2. **Exclusion criteria** documented with five specific anti-patterns (lines 85-93)
3. **TestId preservation guidance** added to refactor flow with three-tier mapping rules (lines 436-441)
4. **Null value handling** specified with complete value rendering rules and caller-side fallback strategy (lines 283-291, 543-552)

Additionally, the plan proactively addressed variant mapping edge cases (lines 299-313) and test verification commands (explicit in all slices). The research is thorough, component API is well-designed, implementation slices are logical and incremental, and all documentation requirements are met. No blocking issues remain. TypeScript serves as safety net for breaking changes. Plan is ready for execution.

# Plan Review: Section Heading Component Extraction

## 1) Summary & Decision

**Readiness**

This plan represents a thorough, implementation-ready approach to extracting section heading patterns into a reusable UI primitive. The updated plan comprehensively addresses all issues from the previous NO-GO review: the missing kit-bom-table.tsx:247 instance is now documented with explicit exclusion rationale, the Tags heading at part-details.tsx:563 is properly handled with spacing pattern analysis, semantic HTML concerns are acknowledged with a documented deferral strategy, and Playwright test verification has been completed via grep search confirming no className-based selectors. The research log provides exhaustive evidence (11 instances discovered, 9 to refactor, 2 excluded with clear justification), all open questions have been resolved with explicit decisions, and the component API follows established patterns (no className prop, variant-based styling, testId support, React.forwardRef). The plan demonstrates mature engineering judgment in excluding edge cases that don't fit the pattern (flex layout + icon, inverse spacing) rather than forcing architectural compromises.

**Decision**

`GO` — All previous blockers resolved with documented evidence; plan is implementation-ready with high confidence.

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/commands/plan_feature.md` — **Pass** — `plan.md:1-381` — Plan follows all required headings (0-16), includes research log with explicit file:line evidence, documents all affected areas with evidence, provides deterministic test plan with instrumentation verification, resolves open questions before declaring readiness, and declares confidence level with rationale.

- `docs/contribute/architecture/application_overview.md` — **Pass** — `plan.md:88-89, 99-124` — Component placement in `src/components/ui/` aligns with architecture guidance ("Shared UI building blocks live in src/components/ui/ and accept data-testid props to support testing"). Export from `src/components/ui/index.ts` follows centralized UI component access pattern. testId prop support matches architecture callout about wiring through component props.

- `docs/contribute/testing/playwright_developer_guide.md` — **Pass** — `plan.md:279-294` — Plan explicitly verifies no tests assert on className values via grep search (`grep -r "className.*text-(xs|sm).*font-medium|font-medium.*text-(xs|sm)" tests/e2e/` returned no results). Validation strategy includes running full Playwright suite after refactoring. No test updates anticipated, which aligns with real backend policy and deterministic wait patterns (tests target content, not presentation).

- `CLAUDE.md` — **Pass** — `plan.md:15-17, 369-380` — Plan reviews recently factored components (Skeleton, InlineNotification, DescriptionList) to understand patterns before designing API. Component follows documented conventions: NO className props, variant-based styling, testId for Playwright, comprehensive JSDoc, React.forwardRef pattern. Definition of Done criteria met: TypeScript strict mode (no `any`), UI components factored before domain usage, instrumentation noted (testId prop), readability comments documented in component design.

**Fit with codebase**

- `src/components/ui/skeleton.tsx` — `plan.md:15-17` — Plan explicitly studies Skeleton component to match patterns: NO className prop enforcement, variant mapping via lookup object, testId applied to outermost element, JSDoc documentation style. SectionHeading API mirrors these decisions (variant enum, no className, testId prop, forwardRef).

- `src/components/ui/description-list.tsx` — `plan.md:15-17` — Plan references DescriptionList pattern: variant-based spacing control, NO className props, testId support. SectionHeading follows identical constraint philosophy (subsection/section variants control spacing, no styling escape hatches).

- `src/components/parts/part-details.tsx` — `plan.md:103-111, 504-679` — Plan documents all 5 heading instances with exact line numbers and context. Exclusion of Tags heading at line 563 justified by inverse spacing pattern (mt-1 on child div vs mb-2 on heading). Decision to use `section` variant for "Technical Specifications" (line 597) preserves existing mb-3 spacing, avoiding visual regression.

- `src/components/parts/part-card.tsx` — `plan.md:113-117, 187, 241` — Plan identifies 2 tooltip heading instances with exact line numbers. Current p elements will be replaced with SectionHeading using subsection variant (mb-2 text-xs font-medium text-muted-foreground).

- `src/components/kits/kit-card.tsx` — `plan.md:119-124, 178, 233` — Plan identifies 2 tooltip heading instances with exact line numbers. Refactoring preserves existing tooltip rendering functions, replacing inline p elements.

- `src/components/kits/kit-bom-table.tsx` — `plan.md:32, 247` — **Previously missed instance now documented with exclusion rationale**: "Combines heading semantics with flex layout + icon positioning. Flex layout essential for icon; incompatible with no-className constraint. Preserve inline or extract separate TooltipHeading component if pattern recurs." This demonstrates mature judgment—recognizing when a pattern doesn't fit the primitive rather than adding escape hatches.

## 3) Open Questions & Ambiguities

All open questions from previous review have been resolved with explicit decisions documented in the plan:

**Question 1 (Resolved):** Should "Technical Specifications" heading use `section` variant or standardize to `subsection`?

- **Resolution:** `plan.md:358-359` — "Use `section` variant to preserve existing mb-3 spacing. This maintains current visual hierarchy without regression."
- **Evidence:** This decision prevents visual regression while maintaining consistency (subsection: mb-2 text-xs, section: mb-3 text-sm).

**Question 2 (Resolved):** Should component support semantic heading levels (h1-h6) via `as` prop?

- **Resolution:** `plan.md:361-363` — "Deferred to future enhancement. Current implementation maintains existing `<div>` element behavior (no regression). Project does not have established heading hierarchy patterns. When implementing site-wide heading structure audit, add `as` prop to support semantic heading levels."
- **Evidence:** This is appropriate scoping—semantic HTML requires site-wide heading hierarchy planning, which is beyond scope of this extraction refactoring. Deferral documented in plan with clear trigger condition.

**Question 3 (Resolved):** Are there additional section heading patterns beyond the identified instances?

- **Resolution:** `plan.md:365-367` — "Comprehensive grep search completed and documented in Research Log. Found 11 total instances: 9 to refactor, 2 explicitly excluded with rationale (Tags heading with inverse spacing, kit-bom-table reservation heading with flex layout)."
- **Evidence:** Research log (lines 5-43) shows exhaustive discovery work including grep command, manual review, categorization table with inclusion/exclusion decisions for all 11 instances.

**No remaining ambiguities.** All decisions documented with rationale and evidence.

## 4) Deterministic Playwright Coverage (new/changed behavior only)

- **Behavior:** SectionHeading component rendering across part details, part card tooltips, kit card tooltips
- **Scenarios:**
  - Given part details page, When page loads, Then section headings render with correct text and styling (no explicit test scenario needed—existing tests cover page rendering) (`tests/e2e/parts/part-crud.spec.ts`, `tests/e2e/parts/part-list.spec.ts`)
  - Given part card with shopping list memberships, When user hovers to reveal tooltip, Then "On shopping lists" heading renders (existing tooltip interaction tests cover this)
  - Given kit card with shopping list links, When user hovers to reveal tooltip, Then "Linked shopping lists" heading renders (existing tooltip interaction tests cover this)
- **Instrumentation:** testId prop support added but not required for initial usage (plan.md:222-230). No custom test events needed—component is pure presentational primitive. Existing test instrumentation on parent components (part details form, card interactions) provides coverage.
- **Backend hooks:** None required—pure UI component extraction with no backend integration.
- **Gaps:** None. Plan documents explicit verification strategy: `plan.md:279-294` — "Run full Playwright suite after refactoring. Verify no visual regression in part detail screens. Confirm tooltip section headings render correctly. No test updates anticipated." Grep verification confirms no tests assert on className values: `plan.md:280-282` — "No tests currently assert on section heading className values (verified: grep -r 'className.*text-(xs|sm).*font-medium|font-medium.*text-(xs|sm)' tests/e2e/ returned no results)."
- **Evidence:** `plan.md:126-133, 263-294`

**Conformance:** Plan meets deterministic coverage requirements from `docs/commands/review_plan.md` by explicitly verifying no Playwright tests depend on heading className patterns, documenting validation strategy (run full suite + visual verification), and justifying no new test coverage (existing page/tooltip tests provide implicit coverage of heading rendering).

## 5) Adversarial Sweep (must find ≥3 credible issues or declare why none exist)

**Checks attempted:**
- Missing instance discovery (grep + manual review)
- Playwright className selector dependencies
- Variant API flexibility (spacing standardization trade-offs)
- Semantic HTML accessibility concerns
- Edge case handling (empty children, complex ReactNode)
- Exclusion rationale for non-conforming patterns
- Component API consistency with recent refactorings (Skeleton, DescriptionList)
- DOM structure changes impacting existing tests
- Visual regression from spacing standardization

**Evidence:**
- `plan.md:5-43` — Comprehensive research log with 11 instances discovered via grep, categorization table with inclusion/exclusion rationale for each
- `plan.md:280-282` — Playwright verification: grep search confirms no tests assert on heading className values
- `plan.md:24, 32` — Explicit exclusion rationale for Tags heading (inverse spacing) and kit-bom-table heading (flex layout + icon)
- `plan.md:76-83` — Semantic HTML acknowledged as limitation with documented deferral strategy
- `plan.md:337-342` — Visual regression risk mitigated by preserving mb-3 for "Technical Specifications" via `section` variant
- `plan.md:15-17` — Recent component patterns (Skeleton, InlineNotification, DescriptionList) reviewed to ensure consistency

**Why the plan holds:**

1. **Instance completeness:** Research log documents exhaustive grep search (`grep -rn "text-xs.*font-medium|font-medium.*text-xs|text-sm.*font-medium|font-medium.*text-sm" src/components/`) followed by manual review of each result. All 11 instances categorized with explicit inclusion/exclusion decisions. No orphaned patterns remain.

2. **Playwright safety:** Grep verification (`grep -r "className.*text-(xs|sm).*font-medium|font-medium.*text-(xs|sm)" tests/e2e/`) confirms no tests depend on heading className patterns. Tests target content sections, not presentation styling. DOM structure change (div → div, p → div) is minimal and doesn't impact semantic selectors.

3. **Visual regression guarded:** Plan preserves existing spacing via variant selection (subsection: mb-2 for 8 instances, section: mb-3 for 1 instance). No forced standardization that would alter visual hierarchy. Exclusion of edge cases (Tags heading, kit-bom-table heading) prevents architectural compromise.

4. **Semantic HTML deferred appropriately:** Adding semantic heading elements (h1-h6) requires site-wide heading hierarchy audit, which is beyond scope of this UI primitive extraction. Plan documents deferral with clear trigger condition (future heading structure implementation). No regression since all existing usages use non-semantic div/p elements.

5. **Component API proven:** Plan follows established patterns from recent refactorings (NO className props, variant-based styling, testId support, React.forwardRef). This reduces implementation risk and ensures consistency with codebase conventions.

**No credible issues remain.** All potential failure modes have been addressed with documented evidence and mitigation strategies.

## 6) Derived-Value & State Invariants (table)

**None; proof:**

This is a pure presentational UI primitive with no derived state, no cache interactions, and no cross-component coordination. The component maps a variant prop to static Tailwind class strings via lookup object and renders children content. No filtering, sorting, pagination, optimistic updates, or persistent writes involved.

**Evidence:** `plan.md:199` — "No derived state or invariants. Component is purely presentational with static variant mapping."

**Justification:** SectionHeading is a stateless presentation component similar to Skeleton or Badge. It accepts props (variant, children, testId), maps variant to className strings, and renders a div. No data fetching, no mutations, no lifecycle effects, no async coordination. The only "derivation" is variant → className lookup, which is purely synchronous and deterministic with no side effects or state implications.

Per `docs/commands/review_plan.md:110-120`, table-based documentation is only required when derived values "affect cache writes, cleanup, or cross-route state." This component has none of those concerns.

## 7) Risks & Mitigations (top 3)

- **Risk:** Visual regression from spacing standardization (mb-3 → mb-2 for "Technical Specifications" heading)
  - **Mitigation:** Plan uses `section` variant (mb-3 text-sm) for "Technical Specifications" heading to preserve existing spacing. All other headings already use mb-2. No forced standardization.
  - **Evidence:** `plan.md:337-342` — "Visual standardization trade-offs are acceptable (preserving mb-3 for 'Technical Specifications', standardizing rest to mb-2)." Decision documented at line 358-359: "Use section variant to preserve existing mb-3 spacing."

- **Risk:** Playwright tests fail due to unexpected DOM structure changes (p → div, inline className → component abstraction)
  - **Mitigation:** Grep verification confirms no tests assert on heading className values. DOM structure change is minimal (div → div for most, p → div for tooltips). Text content remains identical. Tests target content sections via semantic selectors or testId attributes on parent components, not heading styling.
  - **Evidence:** `plan.md:343-347` — Risk documented with mitigation strategy. Lines 280-286 show grep verification: `grep -r "className.*text-(xs|sm).*font-medium|font-medium.*text-(xs|sm)" tests/e2e/` returned no results. Validation strategy: "Run full Playwright suite after refactoring."

- **Risk:** Orphaned instances remain after refactoring, leaving inconsistent patterns in codebase
  - **Mitigation:** Comprehensive grep search performed and documented in Research Log with explicit inclusion/exclusion decisions for all 11 discovered instances. 9 instances will be refactored (5 in part-details.tsx, 2 in part-card.tsx, 2 in kit-card.tsx). 2 instances explicitly excluded with rationale (Tags heading at part-details.tsx:563 due to inverse spacing pattern, kit-bom-table heading at line 247 due to flex layout + icon requirements).
  - **Evidence:** `plan.md:348-353` — Risk documented with mitigation. Lines 18-34 provide complete inventory table showing all instances, inclusion/exclusion decisions, and rationale.

## 8) Confidence

**Confidence: High** — Plan is thorough, implementation-ready, and addresses all previous NO-GO blockers with documented evidence. Research log demonstrates exhaustive discovery work (11 instances with categorization), Playwright verification confirms no className-based selectors, semantic HTML concerns appropriately scoped as future enhancement, and component API follows proven patterns from recent refactorings. Implementation risk is low: simple component API (variant + children + testId), minimal visual changes (preserves spacing via variant selection), and no test updates required (verified via grep). All open questions resolved with explicit decisions and rationale.

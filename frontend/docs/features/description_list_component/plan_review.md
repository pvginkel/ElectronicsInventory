# Plan Review — DescriptionList Component Extraction

## 1) Summary & Decision

**Readiness**

The plan is exceptionally thorough and well-researched. It demonstrates comprehensive pattern discovery (27 files, 105+ occurrences), provides detailed component API design with semantic variants, and includes extensive evidence-based reasoning. The plan correctly identifies this as technical debt elimination work with breaking changes, aligns with the UI Component Refactoring Workflow principles, and acknowledges acceptable visual drift. The implementation slices are logical and incremental. However, there are several critical issues that must be addressed: (1) missing consideration of section header patterns that are interleaved with description items, (2) potential semantic HTML benefits not fully evaluated, (3) insufficient guidance on handling edge cases where the pattern doesn't cleanly fit, and (4) test coverage validation strategy could be more explicit.

**Decision**

`GO-WITH-CONDITIONS` — The plan is structurally sound and ready for implementation with the following mandatory conditions: (1) clarify strategy for section headers (text-xs font-medium text-muted-foreground pattern at lines 495-496, 525-526, 600, 655-656 in part-details.tsx) that currently separate description groups, (2) document explicit criteria for when NOT to use DescriptionList (e.g., metrics cards, specialized layouts), (3) add guidance for preserving existing data-testid attributes during refactoring to avoid breaking Playwright selectors, and (4) include fallback strategy for handling null/undefined values consistently across all variants. Address these conditions before starting Slice 1 implementation.

---

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/ui_component_workflow.md` (lines 8-14) — **Pass** — plan:lines 57-66, 899-907 — Plan correctly states "The component API must NOT include a className prop (per workflow principles)" and "Make breaking changes where needed - do not attempt backward compatibility" and "Plan to REMOVE className props from any domain-specific wrappers completely (not deprecate, REMOVE)". Fully aligned with aggressive cleanup principle.

- `docs/ui_component_workflow.md` (line 10) — **Pass** — plan:lines 49-51 — "Must be domain-agnostic and generic" and component placed in `src/components/ui/` with no domain-specific logic. Properly scoped as pure presentation component.

- `docs/contribute/ui/tooltip_guidelines.md` (lines 301-334) — **Pass** — plan:lines 42-43 — Plan references prohibition on bespoke implementations: "Reviewed docs/contribute/ui/tooltip_guidelines.md — confirms prohibition on custom implementations, mandate for reusable components". Demonstrates awareness of anti-pattern guidelines.

- `docs/contribute/testing/playwright_developer_guide.md` (lines 13-16) — **Pass** — plan:lines 756-762 — "No new instrumentation needed: DescriptionList/DescriptionItem are presentation components, not workflow components. Parent components already emit test events via useListLoadingInstrumentation, useFormInstrumentation. data-testid props sufficient for Playwright selectors." Correctly defers instrumentation to parent components.

- `docs/contribute/architecture/application_overview.md` (lines 47-66) — **Pass** — plan:lines 285-292, 476-481 — Plan correctly identifies no API changes required, component operates on data from existing TanStack Query hooks in parent components, follows composition pattern of existing UI components like Badge/Card/Skeleton.

**Fit with codebase**

- `src/components/ui/key-value-badge.tsx` — plan:lines 22-25, 78-79 — **Confirmed complementary** — Plan correctly identifies KeyValueBadge serves different purpose (inline badges in metadata rows, not detail views). No overlap, DescriptionList addresses different use case (vertical label-value pairs in detail surfaces vs horizontal badge format).

- `src/components/ui/card.tsx` — plan:lines 358, 586-588 — **Aligned** — Plan references Card component pattern as architectural precedent for simple container with variant classes, matching proposed DescriptionList implementation strategy (pure function component, no hooks, variant-based API).

- `src/components/ui/badge.tsx` — plan:lines 479-480, 575-576, 586-588 — **Aligned** — Plan uses Badge as reference for pure presentation component with no instrumentation, correct precedent for security profile and lack of lifecycle hooks.

- `src/components/parts/part-details.tsx` (lines 479-480, 501-502, etc.) — plan:lines 113-119 — **High-concentration target identified** — Plan correctly identifies 18+ occurrences in this file alone, demonstrating clear refactoring value. Evidence quotes match actual code structure.

- `tests/e2e/parts/part-crud.spec.ts` (lines 17-18, 45-46) — plan:lines 213-217, 716-718 — **Test resilience confirmed** — Existing tests use `.toContainText()` assertions on text content, not structure. Plan correctly identifies refactor should preserve text visibility, making tests resilient to implementation changes.

---

## 3) Open Questions & Ambiguities

**Question 1: How should section headers be handled?**

- **Why it matters**: `part-details.tsx` lines 495-496, 525-526, 600, 655-656 show section headers with pattern `<div className="mb-2 text-xs font-medium text-muted-foreground">Manufacturer Information</div>` that separate groups of description items. These are different from label-value pairs but are structurally interleaved. The plan mentions "label-only mode" as an open question (plan:lines 926-933) but doesn't provide definitive answer.
- **Needed answer**: Should section headers (1) be kept as separate div elements outside DescriptionList, (2) supported via a dedicated `DescriptionSectionHeader` component, (3) handled through a `label` prop with no `value`/`children`, or (4) left as-is (not refactored)? Implementation of Slice 2 (part-details refactor) depends on this decision.
- **Research finding**: Examining the code at lines 495-496, 525-526, 600, 608-609, 655-656 reveals a consistent two-level hierarchy: section headers (`text-xs font-medium text-muted-foreground`) that introduce groups, followed by subsection headers (`text-xs font-medium text-muted-foreground`) that further subdivide, then label-value pairs. The pattern is `Section → [Subsection] → Items`. Recommendation: Keep section/subsection headers as plain div elements outside DescriptionList components. They serve a different semantic purpose (content organization) than label-value presentation. Add this guidance to plan Section 15 (Open Questions) resolution.

**Question 2: What are the explicit criteria for NOT using DescriptionList?**

- **Why it matters**: Plan identifies dashboard metrics cards and storage grids as potential candidates (plan:lines 148-159, 797-806) but also notes some may be skipped if "layout too specialized" (plan:lines 749-751, 805, 869). Without clear criteria, implementer may waste time attempting forced refactors or miss valid opportunities.
- **Needed answer**: Document explicit anti-patterns and exclusion criteria (e.g., "Skip if layout requires horizontal arrangement", "Skip if value rendering requires interactive controls", "Skip if spacing/sizing is tightly coupled to surrounding layout"). Add to plan Section 1 (Out of Scope) or Section 15 (Risks).
- **Research finding**: Examining dashboard components and the plan's own evidence, the key exclusion criteria should be: (1) Horizontal layouts where label and value are side-by-side in a flex/grid row (not vertical stacking), (2) Interactive value slots requiring buttons or form inputs (violates presentation-only principle), (3) Highly specialized spacing that can't map to the three spacing variants (compact/default/relaxed), (4) Layouts where label-value pairs are not the primary content pattern (e.g., metrics cards with large numbers, icons, trend indicators). Recommendation: Add explicit "Exclusion Criteria" subsection to Section 1 (Out of Scope) listing these four patterns.

**Question 3: How should existing data-testid attributes be preserved?**

- **Why it matters**: Plan mentions "preserve existing testIds when refactoring (map to testId props)" in risk mitigation (plan:line 857) but doesn't provide concrete guidance on HOW to map them. Some components may have testIds on the container div wrapping label+value, others on label or value individually. Incorrect mapping could break Playwright selectors.
- **Needed answer**: Provide explicit mapping rules: (1) If existing testId is on container div wrapping both label and value, map to DescriptionItem `testId` prop. (2) If label has individual testId, map to `labelTestId` prop. (3) If value has individual testId, map to `valueTestId` prop. Add to Section 5 (Algorithms & UI Flows) refactor flow steps.
- **Research finding**: Examining test specs at `tests/e2e/parts/part-crud.spec.ts` and `tests/e2e/boxes/boxes-detail.spec.ts`, the existing tests use broad selectors like `parts.detailRoot` and `boxes.detailSummary` with `.toContainText()` assertions. These selectors target parent containers, not individual label-value pairs. This means individual description items likely don't have testIds currently. Recommendation: Update plan Section 5 step 7 to clarify "Most existing label-value pairs do not have individual testIds; tests rely on parent container selectors. Preserve parent container testIds, don't add item-level testIds unless Playwright specs explicitly require them."

---

## 4) Deterministic Playwright Coverage (new/changed behavior only)

**Behavior: DescriptionList component rendering**
- **Scenarios**: None required (unit-level validation, not E2E)
- **Instrumentation**: data-testid attributes (testId, labelTestId, valueTestId props)
- **Backend hooks**: Not applicable (pure presentation component)
- **Gaps**: None — plan correctly identifies this as below granularity threshold for test events (plan:lines 563-567, 674-678)
- **Evidence**: plan:lines 666-678 documents that UI primitives have no dedicated unit tests, coverage comes from integration via E2E specs

**Behavior: Part Details refactor (existing behavior preserved)**
- **Scenarios**:
  - Given existing spec `part-crud.spec.ts`, When refactor complete, Then all assertions pass unchanged (plan:lines 704-718)
  - Given part detail page, When user views part info, Then sees manufacturer, type, specs displayed
- **Instrumentation**: Existing `data-testid="parts.detail"`, `data-testid="parts.detail.information"`, `useListLoadingInstrumentation` unchanged (plan:lines 710-713)
- **Backend hooks**: No changes required (uses existing `useGetPartsByPartKey` hook)
- **Gaps**: None — plan correctly defers to existing test coverage
- **Evidence**: plan:lines 702-718, tests at `tests/e2e/parts/part-crud.spec.ts:17-18,45-46` use `.toContainText()` which survives implementation changes

**Behavior: Box Details refactor (existing behavior preserved)**
- **Scenarios**:
  - Given existing spec `boxes-detail.spec.ts`, When refactor complete, Then summary content assertions pass (plan:lines 721-734)
- **Instrumentation**: Existing `data-testid="boxes.detail.summary"`, `useListLoadingInstrumentation` unchanged (plan:lines 728-730)
- **Backend hooks**: No changes required (uses existing `useGetBoxesByBoxNo` hook)
- **Gaps**: None
- **Evidence**: plan:lines 721-734, tests at `tests/e2e/boxes/boxes-detail.spec.ts:41-44` assert on text content presence

**Behavior: Dashboard components refactor**
- **Scenarios**:
  - Given existing dashboard specs, When refactor complete, Then metrics display correctly (plan:lines 738-751)
- **Instrumentation**: Dashboard-specific testIds (`dashboard.metrics.*`, `dashboard.storage.*`), hooks emit loading events (plan:lines 745-747)
- **Backend hooks**: `useDashboardMetrics`, `useDashboardStorage` unchanged
- **Gaps**: **MINOR** — Plan acknowledges some dashboard components may not be good candidates (plan:lines 748-751) but doesn't pre-identify which ones. Could lead to implementation churn. Mitigation: Slice 3 explicitly evaluates each component individually before refactoring.
- **Evidence**: plan:lines 738-751

---

## 5) Adversarial Sweep

**Major — Section Headers Pattern Not Addressed in Component API**

**Evidence:** plan:lines 926-933 (Open Question about label-only mode), part-details.tsx:495-496, 525-526, 600, 608-609, 655-656 (section header examples: "Manufacturer Information", "Seller Information", "Technical Specifications", "Physical", "Electrical / Technical")

**Why it matters:** The plan identifies section headers as an open question but doesn't resolve it. In `part-details.tsx`, section headers use different styling (`text-xs font-medium text-muted-foreground` vs `text-sm font-medium` for labels) and semantic purpose (content organization vs data presentation). The proposed DescriptionItem API doesn't clearly support this pattern. During Slice 2 implementation, the developer will encounter these headers interleaved with label-value pairs and won't have clear guidance on whether to:
1. Include them in DescriptionList with a label-only variant
2. Keep them as separate div elements between DescriptionList groups
3. Create a separate DescriptionSectionHeader component
This ambiguity will cause implementation delays and inconsistent refactoring decisions.

**Fix suggestion:** Add explicit guidance to Section 15 (Open Questions) resolution: "Section headers (`text-xs font-medium text-muted-foreground`) serve organizational purposes distinct from label-value presentation. Keep them as plain div elements OUTSIDE DescriptionList components. Refactor only the label-value pairs within each section. Example refactor:
```tsx
{/* Section header - kept as-is */}
<div className="mb-2 text-xs font-medium text-muted-foreground">
  Manufacturer Information
</div>

{/* Label-value pairs - refactored to DescriptionList */}
<DescriptionList spacing="default">
  <DescriptionItem label="Manufacturer" value={displayManufacturer} />
  <DescriptionItem label="Product Page" value={<ExternalLink href={url}>{url}</ExternalLink>} />
</DescriptionList>
```
Do NOT attempt to force section headers into DescriptionItem component. They are structurally and semantically different."

**Confidence:** High — Pattern occurs 6+ times in part-details.tsx alone, will definitely be encountered during implementation.

---

**Major — Missing Null/Undefined Value Handling Specification**

**Evidence:** plan:lines 505-515 (Edge Case: Empty or null value), part-details.tsx:559-561 (example showing `?? 'No type assigned'` fallback)

**Why it matters:** The plan identifies null/undefined value handling as an edge case (plan:lines 505-515) but provides conflicting guidance: "Render empty space (div with no content) OR show placeholder text like '—' or 'Not set'". The word "OR" leaves the decision ambiguous. The evidence quote shows existing code handles this at the call site (`part.type?.name ?? 'No type assigned'`), but the plan doesn't clarify whether DescriptionItem should handle this internally or defer to caller. This creates inconsistency risk across 30+ refactored usages. Some developers might add internal null handling to DescriptionItem, others might rely on caller-side `??` operators, leading to inconsistent UX (some show "—", others show "Not set", others show empty space).

**Fix suggestion:** Add explicit value handling rules to Section 3 (Data Model / Contracts) under DescriptionItemProps:
```typescript
interface DescriptionItemProps {
  // ... existing props
  value?: string | number | ReactNode;
  children?: ReactNode;

  // Value rendering rules:
  // 1. If `children` provided, render children (takes precedence over value)
  // 2. If `value` provided and non-null/non-undefined, render value
  // 3. If `value` is null/undefined/empty string, render empty div (no placeholder)
  // 4. Caller is responsible for providing fallback text via `value` prop if desired
  //    Example: value={part.type?.name ?? 'No type assigned'}
}
```
Reasoning: Keeping placeholder logic at call sites preserves existing UX decisions (some fields show "No X assigned", others show "—", others conditional render) and avoids adding string-matching logic to the generic component. Document this in Section 8 (Errors & Edge Cases) and update Section 5 refactor flow to note "Preserve existing null/fallback handling logic at call site."

**Confidence:** High — Affects API contract and will cause implementation inconsistency without resolution.

---

**Major — Variant Mapping May Not Cover All Existing Patterns**

**Evidence:** plan:lines 273-283 (variant mapping), plan:lines 12-13 (pattern search found text-lg usage), part-details.tsx:502, 532, 553 (text-lg examples), part-details.tsx:509 (text-sm with ExternalLink)

**Why it matters:** The plan defines four variants (default, prominent, compact, muted) with specific class mappings. "Default" variant maps to `text-lg` for values. However, research shows `text-sm font-medium` appears 105+ times across 27 files (plan:line 11), and the plan doesn't distinguish between label usage vs value usage. The grep search found both labels (text-sm font-medium) and values (text-sm, text-lg). There's a risk the four variants don't cover all existing combinations. For example, what if a value is styled `text-base` or `text-xl` (not listed in variants)? The plan says "edge cases forced into nearest variant" (plan:line 653) but doesn't provide mapping rules for in-between sizes. During implementation, developers will encounter text size variants not in the mapping and have to make arbitrary decisions, leading to inconsistent visual changes.

**Fix suggestion:** Research actual value class patterns across the identified files to confirm variant coverage. Add explicit variant mapping table to Section 12 (UX / UI Impact) or Section 3 (Data Model):
```
Existing value classes → Proposed variant
- text-2xl font-bold → prominent
- text-xl → default (standardized to text-lg)
- text-lg → default
- text-base → default (standardized to text-lg)
- text-sm (with color) → muted
- text-sm (no color) → compact
- text-xs → compact
```
Document that text-xl and text-base are consolidated to text-lg (default variant) as acceptable visual drift per requirements. Add to Section 12 "Accepted visual changes" list: "Some values styled text-xl or text-base will standardize to text-lg (±2-4px font size difference acceptable)."

**Confidence:** Medium — May not be an actual issue if all usages fit the four variants, but requires verification. Adding explicit mapping table removes ambiguity.

---

**Minor — Tags Pattern in part-details.tsx Doesn't Fit DescriptionItem**

**Evidence:** plan:lines 387-389 (references tags with Badge elements), part-details.tsx:565-579 (Tags section with flex-wrap gap-1 and multiple Badge elements)

**Why it matters:** The plan references the tags pattern as evidence for custom value rendering via `children` prop (plan:line 388: "Custom value rendering in part-details.tsx lines 565-579 (tags with Badge elements)"). However, examining the actual code shows tags render as a flex-wrapped row of Badge elements with specific spacing (`flex flex-wrap gap-1`), and include conditional "No tags" fallback text. This is more complex than a simple value slot. The DescriptionItem component with `children` prop could technically render this, but it would require the caller to reconstruct the entire flex layout in the children prop, which duplicates layout logic. This pattern might be better left as-is (inline div with specialized layout) rather than forced into DescriptionItem.

**Fix suggestion:** Add to Section 1 (Out of Scope) or Section 15 (Risks & Open Questions): "Multi-value fields with specialized layouts (e.g., tags array rendering as flex-wrapped badges, multi-line lists) should be evaluated case-by-case. If the value rendering requires complex layout logic (flex-wrap, custom spacing, conditional empty states), consider leaving as inline implementation rather than forcing into DescriptionItem children prop. The children prop is for simple custom rendering (links, formatted text, single badges), not complex sub-layouts." Update Section 5 refactor flow step 5c: "If value contains complex layout with multiple elements and custom spacing, evaluate if DescriptionItem is appropriate or if inline implementation is cleaner."

**Confidence:** Low — Plan already provides `children` escape hatch, so pattern is technically supported. This finding just clarifies when NOT to use it.

---

**Minor — Playwright Test Re-run Strategy Not Explicit**

**Evidence:** plan:lines 788-789, 806-807, 830-831 (each slice includes "verify" step for tests), plan:lines 857-859 (risk mitigation mentions verifying specs after each slice)

**Why it matters:** The plan includes test verification in each slice but doesn't specify the execution command or scope. Should developers run `pnpm playwright test` (full suite), `pnpm playwright test tests/e2e/parts/` (feature-specific), or `pnpm playwright test tests/e2e/parts/part-crud.spec.ts` (individual spec)? Full suite is slow, individual specs might miss cross-feature regressions, feature-specific is a good middle ground. Without clarity, developers might skip test runs (too slow) or over-test (wasting time). Plan should reference the verification requirements documented in CLAUDE.md.

**Fix suggestion:** Add explicit test verification command to each slice in Section 14 (Implementation Slices). Update Slice 2 "Touches" to include: "Verify: Run `pnpm playwright test tests/e2e/parts/ tests/e2e/boxes/` to validate affected specs pass. If failures occur, debug before proceeding to Slice 3." Update Slice 3: "Verify: Run `pnpm playwright test tests/e2e/dashboard/`". Update Slice 5 to reference CLAUDE.md verification requirements: "Follow `docs/contribute/testing/ci_and_execution.md#local-run-expectations` before delivering: `pnpm check` must pass, every touched Playwright spec must be re-run and green."

**Confidence:** Low — Minor process clarification, doesn't block implementation. Developers familiar with the project would likely infer correct approach.

---

**Minor — Dashboard Metrics Cards Pre-Evaluation Missing**

**Evidence:** plan:lines 148-159 (dashboard components listed as affected), plan:lines 748-751 (gap noted: some may not be good candidates), plan:lines 918-922 (open question about metrics cards)

**Why it matters:** The plan lists 8+ dashboard components as refactor candidates in Section 2 (plan:lines 148-159) but defers the decision to Slice 3 (plan:lines 797-806). The open question at lines 918-922 asks "Do dashboard metrics cards actually need DescriptionList?" and suggests they might be skipped. This creates unnecessary work in Slice 3 if the answer is "no, they shouldn't use DescriptionList." The plan could perform lightweight investigation now (examine 1-2 dashboard components) to de-risk Slice 3 scope.

**Fix suggestion:** Perform quick investigation of `src/components/dashboard/enhanced-metrics-cards.tsx` and `src/components/dashboard/metrics-card.tsx` to determine if they match the label-value pattern. Add findings to Section 2 (Affected Areas) with recommendation to either "Include in Slice 3" or "Exclude from refactor (specialized layout)". Update Section 14 Slice 3 to list only confirmed candidates. This prevents wasted implementation effort. If investigation reveals most dashboard components should be excluded, Slice 3 scope shrinks significantly, making the overall plan more accurate.

**Confidence:** Low — Nice-to-have optimization, doesn't affect correctness. Deferring to Slice 3 is acceptable per plan's incremental approach.

---

## 6) Derived-Value & State Invariants

**Derived value: Spacing class name**
- **Source dataset**: `spacing` prop with union type `'compact' | 'default' | 'relaxed'`
- **Write / cleanup triggered**: Rendered directly to className attribute, no side effects, no persistence
- **Guards**: TypeScript union type prevents invalid values at compile time
- **Invariant**: Spacing prop must map bijectively to exactly one Tailwind space-y-* class (compact→space-y-1, default→space-y-2, relaxed→space-y-4). Mapping must be exhaustive (all enum values covered) and exclusive (no overlap).
- **Evidence**: plan:lines 429-437

**Derived value: Variant class strings (label + value)**
- **Source dataset**: `variant` prop with union type `'default' | 'prominent' | 'compact' | 'muted'`
- **Write / cleanup triggered**: Applied to label and value div className attributes during render, no mutations
- **Guards**: TypeScript union type, static mapping object/switch, no dynamic string concatenation
- **Invariant**: Each variant must produce exactly two class strings (labelClasses, valueClasses) with no runtime conditional logic beyond prop lookup. Classes must not depend on component state or external context.
- **Evidence**: plan:lines 438-446

**Derived value: Value rendering strategy (value vs children precedence)**
- **Source dataset**: Presence of `value` prop (string | number | ReactNode) and/or `children` prop (ReactNode)
- **Write / cleanup triggered**: Determines which React element is rendered in value slot, no persistence
- **Guards**: Precedence rule: children overrides value if both provided (plan:line 454)
- **Invariant**: Component must render at most one value slot (either children OR value, never both simultaneously). If both props missing, component must render label with empty value slot OR skip value slot entirely. Empty slot must be visually consistent (empty div vs no div).
- **Evidence**: plan:lines 449-457

**Proof: No filtered-to-persistent write risk**

The plan correctly identifies zero filtered-to-persistent write risk (plan:lines 459-464). Component is pure presentation with no:
- useState, useEffect, or lifecycle hooks (plan:lines 579-589)
- TanStack Query mutations or cache writes (plan:lines 327-332)
- Form inputs or user interaction state (plan:lines 593-599)
- Router navigation or search param updates (plan:lines 467-482)

Data flows unidirectionally from parent props → rendered output. No derived state that could cause cache pollution, orphaned records, or UI drift. All invariants are compile-time (TypeScript types) or synchronous render-time (prop precedence) with no async coordination.

---

## 7) Risks & Mitigations (top 3)

**Risk 1: Playwright specs break due to selector changes**

- **Mitigation**: Plan proposes preserving existing testIds when refactoring (plan:line 857), verifying critical specs after each slice (plan:lines 857-859), and notes most specs assert on text content (`.toContainText()`) not structure, making them resilient (plan:line 858). However, mitigation lacks concrete execution strategy (see Finding 5 in Adversarial Sweep). Strengthen by: (1) Add explicit testId mapping rules to Section 5 refactor flow (container testId → DescriptionItem testId prop). (2) Require running feature-specific Playwright suite after each slice (`pnpm playwright test tests/e2e/<feature>/`). (3) If test failures occur, treat as blocker for next slice.
- **Evidence**: plan:lines 852-859, tests at `tests/e2e/parts/part-crud.spec.ts:17-18,45-46` use `.toContainText()`, tests at `tests/e2e/boxes/boxes-detail.spec.ts:41-44` use `.toContainText()`

**Risk 2: Visual regressions in dashboard components**

- **Mitigation**: Plan proposes Slice 3 evaluates each dashboard component individually (plan:line 868), skips metrics cards if layout incompatible (plan:line 869), accepts minor spacing differences (plan:line 870), and includes manual visual review before merging (plan:line 871). This is reasonable but could be derailed by Finding 6 (dashboard components may not be good candidates at all). Strengthen by: (1) Perform pre-evaluation of 1-2 dashboard components before finalizing Slice 3 scope (see Finding 6 fix). (2) Add explicit exclusion criteria to Section 1 or Section 15 (see Open Question 2 resolution). (3) Document "If refactor requires heavy use of children prop or custom spacing, skip component" threshold.
- **Evidence**: plan:lines 862-872, dashboard files listed at plan:lines 148-159

**Risk 3: Refactor scope creep (30+ files identified)**

- **Mitigation**: Plan proposes strict slice boundaries with independent merges (plan:line 880), prioritization of high-value targets in Slice 2 (plan:line 881), deferral of edge cases to Slice 4 (plan:line 882), and reliance on TypeScript to catch incomplete migrations (plan:line 883). This is well-structured. Additional strengthening: (1) Add explicit "Slice Complete" checklist to each slice in Section 14 (TypeScript compiles, affected tests green, no console errors). (2) If any slice reveals the component API is inadequate (e.g., forced to use children prop excessively), STOP and revise component API before proceeding. (3) Track refactored file count at end of each slice to monitor progress vs 30+ target.
- **Evidence**: plan:lines 874-883, 27 files identified at plan:line 11, 30+ instances estimated at plan:line 72

---

## 8) Confidence

**Confidence: High** — The plan is exceptionally thorough with extensive research, clear component API, logical implementation slices, and realistic risk acknowledgment. The conditions identified in this review (section headers, null handling, variant mapping, exclusion criteria) are resolvable through documentation updates without requiring architectural changes. The plan correctly follows UI Component Refactoring Workflow principles, defers instrumentation to parent components, preserves test resilience via text-based assertions, and accepts visual drift per requirements. TypeScript serves as safety net for breaking changes. Primary concerns are documentation gaps (section headers, null values) rather than fundamental flaws. With conditions addressed, plan is ready for execution.

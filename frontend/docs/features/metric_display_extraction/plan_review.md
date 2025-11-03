# Plan Review — MetricDisplay Component Extraction

## 1) Summary & Decision

**Readiness**

The updated plan has substantially addressed the major concerns from the initial review. The addition of the "Excluded Patterns" section provides clear evidence that the discovery work was thorough and distinguishes true metric displays (stacked label+value) from similar-looking patterns (table headers, form labels). The testId prop is now consistently required throughout, following the established pattern from StatusBadge and InformationBadge. The testing protocol correctly reflects that current Playwright tests do NOT assert on these specific metrics, removing false claims. The removal of the align prop follows YAGNI appropriately, and the decision is well-documented with rationale. The plan demonstrates strong conformance to the UI Component Workflow principles and codebase patterns.

**Decision**

`GO` — The plan is implementation-ready with minor observations noted below. All blocking concerns from the initial review have been resolved. The scope is well-contained (2 files, 5 instances), the component API is sound, and the testing strategy is realistic.

---

## 2) Conformance & Fit (with evidence)

### Conformance to refs

- **`docs/ui_component_workflow.md`** — **Pass** — `plan.md:1-733` — The plan follows the semantic component principle correctly. MetricDisplay represents a clear UI concept ("what is this?" → "a stacked metric with label and value") rather than pure layout. The discovery work (lines 3-65) thoroughly documents pattern variations and excluded patterns. The plan embraces breaking changes and removes className prop entirely (lines 154, 168), consistent with the workflow's aggressive cleanup principle (ui_component_workflow.md:18).

- **`docs/commands/plan_feature.md`** — **Pass** — `plan.md:39-155` — Section 0 provides comprehensive research log with file paths and line numbers. Each section uses the prescribed templates (intent_scope_template, file_map_entry_template, data_model_template, etc.). Evidence is quoted with file:line references throughout.

- **`docs/contribute/architecture/application_overview.md`** — **Pass** — `plan.md:99-105` — The plan correctly places the component in `src/components/ui/` and exports via `src/components/ui/index.ts` (plan lines 199-206). The component follows the stateless UI pattern established by StatusBadge and KeyValueBadge (plan lines 404-410, application_overview.md:49-52).

- **`docs/contribute/testing/playwright_developer_guide.md`** — **Pass** — `plan.md:536-586` — Testing protocol acknowledges that NO current tests assert on these specific metrics (lines 549, 634), which is accurate per grep verification. The plan appropriately preserves test IDs for future coverage rather than claiming existing coverage. Test IDs will be added to update-stock-dialog metrics (lines 559-563) to match the required testId prop pattern.

### Fit with codebase

- **`StatusBadge`, `InformationBadge`, `KeyValueBadge`** — `plan.md:115-135, 296` — **PASS** — The plan correctly follows the established pattern: required testId prop (StatusBadge:26, InformationBadge:20, KeyValueBadge:21), NO className prop (StatusBadge:36, InformationBadge:30), semantic color variants rather than arbitrary styling. The MetricDisplay API (lines 125-132) is consistent with this precedent.

- **`seller-group-card.tsx:70-87`** — `plan.md:210-238` — **PASS** — The plan accurately quotes the existing implementation and identifies the styling inconsistency (missing `text-muted-foreground` on labels, line 238). The refactoring will standardize this to include muted foreground (plan line 521).

- **`update-stock-dialog.tsx:561-570`** — `plan.md:240-258` — **PASS** — The plan correctly identifies the conditional color logic for quantity mismatch (`line.hasQuantityMismatch ? 'text-amber-600' : 'text-foreground'`, line 253) and maps it to the valueColor prop (lines 299-310). The warning color capability is preserved in the component API.

---

## 3) Open Questions & Ambiguities

No unresolved questions remain. All decisions from the initial review have been explicitly addressed and resolved in Section 15 (plan lines 711-728):

1. **className prop exclusion** — Resolved and confirmed (lines 711-714)
2. **Element types (span vs p)** — Resolved: use `span` tags (lines 716-720)
3. **Test ID placement** — Resolved: apply to value element (lines 722-727)

The plan's resolution for each decision includes clear rationale tied to existing patterns or technical requirements.

---

## 4) Deterministic Playwright Coverage (new/changed behavior only)

### Seller Group Metrics

- **Behavior**: Shopping list ready view - seller group cards display Needed/Ordered/Received totals
- **Scenarios**:
  - Given shopping list with seller groups, When viewing Ready tab, Then each seller group displays correct metric values
  - Given seller group has 0 needed, When viewing card, Then Needed metric displays "0"
  - Given seller group has filtered lines, When viewing totals, Then metrics reflect visible totals
- **Instrumentation**:
  - `page.getByTestId('shopping-lists.ready.group.{groupKey}.totals.needed')`
  - `page.getByTestId('shopping-lists.ready.group.{groupKey}.totals.ordered')`
  - `page.getByTestId('shopping-lists.ready.group.{groupKey}.totals.received')`
- **Backend hooks**: Shopping list API factories (existing)
- **Gaps**: No current Playwright tests assert on these specific test IDs. Test IDs are preserved for future coverage. This is documented accurately (lines 549, 634).
- **Evidence**: `plan.md:539-550`

### Update Stock Dialog Metrics

- **Behavior**: Update stock dialog displays ordered/received quantities with warning color for mismatches
- **Scenarios**:
  - Given line has ordered quantity, When opening dialog, Then Ordered metric displays correct value
  - Given received matches ordered, When viewing dialog, Then Received shows default color
  - Given received mismatches ordered, When viewing dialog, Then Received shows warning color
- **Instrumentation**: Test IDs will be added during refactoring (lines 559-563):
  - `shopping-lists.ready.update-stock.line.metric.ordered`
  - `shopping-lists.ready.update-stock.line.metric.received`
- **Backend hooks**: Shopping list API factories (existing)
- **Gaps**: No current metrics-specific test IDs; will be added to match required testId prop pattern. This is a necessary change, not a gap.
- **Evidence**: `plan.md:552-563`

### Assessment

The testing strategy is realistic and honest. The plan does NOT claim existing test coverage where none exists. The preservation of test IDs prevents test breakage, and the addition of test IDs to update-stock-dialog metrics follows the component's required testId prop pattern. The visual regression scenario (lines 565-574) appropriately relies on manual inspection rather than claiming automated coverage that doesn't exist.

**No major gaps.** The approach is pragmatic for a pure UI refactoring with no behavioral changes.

---

## 5) Adversarial Sweep

### Minor — Test ID String Construction Risk

**Evidence:** `plan.md:642-643` — "Received metric: conditional valueColor based on `line.hasQuantityMismatch`, testId `shopping-lists.ready.update-stock.line.metric.received`"

**Why it matters:** The plan specifies static test ID strings for update-stock-dialog metrics, but the dialog renders multiple lines. If the test IDs are not unique per line (e.g., including line index or part key), tests will encounter duplicate test IDs in the DOM, which violates the testId contract and makes selectors unreliable.

**Fix suggestion:** Clarify in Slice 3 (line 642) that test IDs must include line identification. Suggested pattern: `shopping-lists.ready.update-stock.line.${line.id}.metric.ordered` (assuming line has unique ID) or `shopping-lists.ready.update-stock.line.${index}.metric.ordered` if rendering via array map. This matches the existing seller-group pattern which includes `${group.groupKey}` in the test ID (line 222).

**Confidence:** High — This is a concrete testId uniqueness violation that will surface in actual test execution.

---

### Minor — Number Formatting Responsibility Ambiguity

**Evidence:** `plan.md:391-398, 704-708` — Section 6 states "Parent component responsible for number formatting" and Risk section warns about "Number Formatting Confusion," but Section 3 data model (lines 278-296) does not explicitly document the number-to-string conversion behavior.

**Why it matters:** The MetricDisplay accepts `value: string | number` (line 283), which implies the component handles number-to-string conversion. However, the plan repeatedly states formatting is the parent's responsibility. If a parent passes `1000` (number), MetricDisplay will render "1000" without thousand separators, but the plan suggests this is expected. This could lead to inconsistent number formatting if some parents pass formatted strings and others pass raw numbers.

**Fix suggestion:** Two options:
1. **Recommended**: Document explicitly in Section 3 (Data Model) that `value` prop accepts both types but performs NO formatting: numbers render via JavaScript's default toString() (e.g., `1000` → "1000", not "1,000"). Include an example showing the contract: parent must pass `value={visibleTotals.needed.toLocaleString()}` if formatting is desired, not `value={visibleTotals.needed}`.
2. **Alternative**: Restrict `value` to `string` only and require parents to format before passing. This makes the contract explicit at compile time.

**Confidence:** Medium — The current plan works but could create confusion. Adding explicit documentation prevents future inconsistency.

---

### Minor — Visual Standardization Impact Not Quantified

**Evidence:** `plan.md:520-525` — "Visual changes expected: Seller group metrics: Labels will gain `text-muted-foreground` class (currently missing). This makes labels slightly more subdued (lighter gray). Acceptable standardization."

**Why it matters:** The plan states this is "acceptable" but does not assess whether this visual change might affect user comprehension or accessibility. While `text-muted-foreground` is documented as meeting WCAG AA (line 530), the label color change from full foreground to muted foreground reduces contrast, which could make metric labels harder to scan quickly. Given these are quantitative metrics (counts), label readability is important.

**Fix suggestion:** Add a brief note in Section 12 (UX Impact) acknowledging that label contrast will decrease slightly but remain within WCAG AA standards. Consider whether all 3 metrics per seller group card (Needed, Ordered, Received) require equally prominent labels, or whether the current stronger contrast was intentional for scannability. If uncertain, recommend a quick visual inspection step in Slice 2 testing protocol (line 629) where implementer can verify the muted labels are sufficiently readable before proceeding to Slice 3.

**Confidence:** Low — This is a design judgment call. The change is likely fine, but flagging for awareness.

---

### Checks Attempted (no additional credible issues found)

- **Stale cache coordination**: Not applicable — MetricDisplay is stateless with no cache interaction (lines 404-418).
- **React concurrency gotchas**: Not applicable — Pure functional component with no effects or state (lines 485-493).
- **Generated API usage**: Not applicable — No API integration; component consumes pre-fetched data via props (lines 317-335).
- **Instrumentation gaps**: Test IDs are required and applied to value elements (lines 469-476). Seller group test IDs already exist; update-stock test IDs will be added. No gap.
- **Derived value filtering risk**: Seller group metrics use `visibleTotals` (line 218), which is a filtered view, but this filtering happens in the parent component before passing to MetricDisplay. The component itself has no filtering logic. No risk of orphaned state (lines 381-398).
- **Cross-route state**: Not applicable — No persistent state, localStorage, or cache writes (lines 404-410).
- **Conditional rendering edge cases**: Plan covers empty/undefined values (lines 449-454), recommending parent-level guards. This is appropriate for a presentational component.

---

## 6) Derived-Value & State Invariants

This section examines whether any derived values create risk for cache writes, cleanup, or cross-route state.

### Assessment: No Derived Values That Trigger Writes

- **Derived value**: None
  - **Source dataset**: MetricDisplay is a pure presentational component receiving pre-computed props (label, value, valueColor, testId) from parent components.
  - **Write / cleanup triggered**: No cache updates, no navigation side effects, no storage mutations. The component has no lifecycle hooks (lines 485-493) and no state (lines 404-410).
  - **Guards**: Not applicable
  - **Invariant**: The component MUST NOT introduce any derived logic that could trigger writes. All conditional logic (e.g., valueColor selection based on `line.hasQuantityMismatch`) remains in parent components.
  - **Evidence**: `plan.md:404-418, 485-493`

### Why No Entries Are Required

The plan explicitly documents in Section 6 (lines 381-398) and Section 10 (lines 485-493) that MetricDisplay:
1. Has no internal state
2. Performs no calculations on props
3. Triggers no cache updates or cleanup
4. Has no lifecycle hooks or effects

The "visibleTotals" derived value mentioned in Section 6 (lines 383-389) is computed by the seller-group-card parent, not by MetricDisplay. The component consumes pre-computed values.

**Proof holds:** A pure presentational component with no state, no effects, and no data transformation cannot create derived-value risks. The plan's architecture (stateless UI component pattern, lines 404-410) structurally prevents the invariant violations this section targets.

---

## 7) Risks & Mitigations (top 3)

### Risk 1: Test ID Mismatches Breaking Playwright Specs

- **Risk**: Accidentally changing seller group test IDs during refactor (e.g., typo in `${group.groupKey}`) breaks Playwright specs that rely on these selectors.
- **Mitigation**: Preserve exact test ID strings from original implementations (lines 222, 228, 234). Run shopping list Playwright tests after Slice 2 (line 628) to catch any breaks immediately. Testing protocol explicitly checks for selector preservation (line 631).
- **Evidence**: `plan.md:680-684, 622-634`

### Risk 2: Test ID Uniqueness Violation in Update Stock Dialog

- **Risk**: The planned test IDs for update-stock-dialog metrics (`shopping-lists.ready.update-stock.line.metric.ordered`) are not unique per line if multiple lines are rendered in the dialog. This violates testId uniqueness and breaks Playwright selectors.
- **Mitigation**: Amend Slice 3 implementation to include line identification in test IDs (e.g., `shopping-lists.ready.update-stock.line.${line.id}.metric.ordered` or use index if ID unavailable). Verify uniqueness during visual inspection step (line 650).
- **Evidence**: `plan.md:642-643` (issue identified in Adversarial Sweep)

### Risk 3: Incomplete Discovery of Additional Metric Patterns

- **Risk**: Additional stacked label+value patterns exist beyond the 5 identified instances, leading to inconsistent UX after partial refactoring.
- **Mitigation**: Final grep search in Slice 4 (lines 666-668) to catch stragglers. The plan documents comprehensive discovery (lines 3-64) including excluded patterns (lines 45-64), reducing likelihood of misses. The pattern is very specific (stacked vertical, right-aligned, specific text styles), limiting false negatives.
- **Evidence**: `plan.md:692-695, 666-668`

---

## 8) Confidence

**Confidence: High** — The updated plan resolves all major blocking concerns from the initial review. The scope is well-bounded (2 files, 5 instances), the component API follows established patterns (StatusBadge, InformationBadge), and the testing strategy is realistic. The discovery work is thorough with explicit evidence distinguishing in-scope patterns from excluded patterns. The only remaining issues are minor clarifications (test ID uniqueness in update-stock-dialog, number formatting documentation) that can be addressed during implementation without plan revision. TypeScript will enforce prop correctness, and Playwright tests provide regression safety.

---

## Response to Previous Review Concerns

### Concern 1: Excluded Patterns Documentation

**Status: RESOLVED**

The plan now includes a comprehensive "Excluded Patterns" section (lines 45-64) documenting table headers and form labels that share similar styling but are NOT metric displays. The section provides:
- Specific file paths and line numbers for all 5 excluded instances
- Clear rationale distinguishing stacked label+value (metrics) from horizontal rows (table headers) and form field labels
- Explicit closure of the discovery loop (line 64)

**Evidence:** `plan.md:45-64`

---

### Concern 2: testId Changed from Optional to Required

**Status: RESOLVED**

The testId prop is now consistently required throughout:
- Component interface (line 130): `testId: string;` (no `?`)
- Data model section (line 289): `/** Required test ID applied to value element for Playwright selectors */`
- Note on line 134: "Following the established pattern from StatusBadge, InformationBadge, and KeyValueBadge components, testId is required..."
- Section 9 (lines 469-476) documents testId as required and always rendered
- Slice 3 explicitly adds test IDs to update-stock-dialog metrics (lines 642-645)

**Evidence:** `plan.md:130, 134, 289, 469-476, 642-645`

---

### Concern 3: Testing Protocol Reflects No Current Assertions

**Status: RESOLVED**

The testing protocol now accurately states:
- Scenario 1 (lines 549): "Current Playwright tests do NOT assert on these specific metric test IDs (verified via grep - zero matches)"
- Scenario 2 (lines 563): "Test IDs will be added during refactoring"
- Slice 2 (line 634): "**Note**: No current Playwright tests assert directly on these metrics (verified); tests validate parent component functionality."
- Slice 3 (line 655): "**Note**: Added test IDs follow StatusBadge/InformationBadge pattern (required testId prop)."

The plan no longer claims existing test coverage where none exists. Test IDs are preserved/added for future coverage, and testing focuses on ensuring parent component tests don't break.

**Evidence:** `plan.md:549, 563, 634, 655`

---

### Concern 4: Removed align Prop Following YAGNI

**Status: RESOLVED**

The align prop has been removed with clear documentation:
- Section 0 (line 120): "Alignment prop removed following YAGNI principle"
- Component interface (line 125-132): No align prop present
- Note on lines 136-137: "Note on removed align prop: All 5 current instances use right alignment. The align prop was removed following YAGNI principle... Component hardcodes `text-right` alignment."
- In-scope section (line 161): "Hardcode right alignment (all current usage sites use `text-right`)"

The rationale is sound: all 5 instances use right alignment (verified in evidence), so there's no current need for the prop. If left-aligned metrics are needed later, the prop can be added as a non-breaking change.

**Evidence:** `plan.md:120, 136-137, 161`

---

## Final Recommendations

1. **Implement as planned** — The core plan is sound and ready for execution.

2. **Clarify test ID uniqueness in Slice 3** — Ensure update-stock-dialog test IDs include line identification (per Adversarial Sweep finding). This is a straightforward fix during implementation.

3. **Document number formatting contract explicitly** — Add a clear statement in Section 3 or component JSDoc that MetricDisplay performs no number formatting; parents must format before passing values.

4. **Quick visual verification in Slice 2** — When testing seller group metrics, implementer should verify that muted label color remains sufficiently readable for quick scanning (per Adversarial Sweep low-confidence finding). If labels are too subtle, consider reverting to non-muted foreground.

5. **Proceed with confidence** — The plan demonstrates strong technical judgment, thorough discovery, and appropriate alignment with project standards. The refactoring scope is manageable and low-risk.

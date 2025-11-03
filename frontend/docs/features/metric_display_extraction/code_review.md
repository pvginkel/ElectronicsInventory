# Code Review — MetricDisplay Component Extraction

## 1) Summary & Decision

**Readiness**

The MetricDisplay component extraction is well-executed and production-ready. The implementation correctly follows the plan specifications, adheres to established React 19 + TypeScript patterns, maintains test ID consistency, and successfully refactors all 5 identified metric display instances across 2 files. The component API is clean with proper encapsulation (no className prop), the conditional color logic is correctly implemented, and all standardized styling is properly centralized. TypeScript strict mode compliance is maintained, JSDoc documentation is thorough, and the code follows established UI component patterns from StatusBadge and InformationBadge. The user confirmed all 42 Playwright shopping list tests pass, and `pnpm check` passes without TypeScript errors.

**Decision**

`GO` — Implementation is complete, correct, and ready for production. All plan commitments are fulfilled, no correctness issues identified, test coverage is adequate (parent component tests suffice for this pure UI refactor), and the visual standardization benefits outweigh any minor cosmetic differences. The component successfully eliminates CSS class soup while maintaining test ID compatibility.

---

## 2) Conformance to Plan (with evidence)

**Plan alignment**

- **Slice 1: Create MetricDisplay Component** ↔ `src/components/ui/metric-display.tsx:1-66`
  ```typescript
  export interface MetricDisplayProps {
    label: string;
    value: string | number;
    valueColor?: keyof typeof VALUE_COLOR_CLASSES;
    testId: string;
  }
  ```
  Component correctly implements required testId prop, no className prop, valueColor variants (default/warning), and hardcoded right alignment as specified in plan sections 3 and 9.

- **Slice 1: Export from UI index** ↔ `src/components/ui/index.ts:17-18`
  ```typescript
  export { MetricDisplay, type MetricDisplayProps } from './metric-display';
  ```
  Component and types properly exported following established pattern.

- **Slice 2: Seller Group Card Refactoring** ↔ `src/components/shopping-lists/ready/seller-group-card.tsx:70-84`
  ```tsx
  <MetricDisplay
    label="Needed"
    value={visibleTotals.needed}
    testId={`shopping-lists.ready.group.${group.groupKey}.totals.needed`}
  />
  ```
  All 3 metric instances (Needed, Ordered, Received) replaced with MetricDisplay components, test IDs preserved exactly as documented in plan section 14, slice 2.

- **Slice 3: Update Stock Dialog Refactoring** ↔ `src/components/shopping-lists/ready/update-stock-dialog.tsx:562-572`
  ```tsx
  <MetricDisplay
    label="Received"
    value={line.received}
    valueColor={line.hasQuantityMismatch ? 'warning' : 'default'}
    testId="shopping-lists.ready.update-stock.line.metric.received"
  />
  ```
  Both metric instances replaced, conditional warning color correctly mapped from `line.hasQuantityMismatch` boolean check as specified in plan section 3, new test IDs added matching plan section 14, slice 3.

- **Value Color Implementation** ↔ `src/components/ui/metric-display.tsx:5-8`
  ```typescript
  const VALUE_COLOR_CLASSES = {
    default: 'text-foreground',
    warning: 'text-amber-600',
  } as const;
  ```
  Color mappings match plan section 3 exactly (default: text-foreground, warning: text-amber-600 for quantity mismatches).

- **Styling Standardization** ↔ `src/components/ui/metric-display.tsx:53-60`
  ```tsx
  <div ref={ref} className="flex flex-col text-right">
    <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
    <span className={cn('font-semibold', valueColorClasses)} data-testid={testId}>{value}</span>
  </div>
  ```
  Container, label, and value styling matches plan section 1 requirements: hardcoded right alignment, standardized label classes (text-xs uppercase tracking-wide text-muted-foreground), standardized value classes (font-semibold with conditional color).

**Gaps / deviations**

None identified. All plan commitments from sections 1, 3, 9, 13, and 14 are fulfilled. The implementation matches the approved plan specifications exactly, including the explicit removal of className prop, required testId prop, and hardcoded right alignment.

---

## 3) Correctness — Findings (ranked)

No correctness issues identified. The implementation is sound across all examined dimensions:

- TypeScript strict mode: All props properly typed with no `any` usage
- React 19 patterns: Proper use of `React.forwardRef`, displayName assignment
- Test ID preservation: All existing test IDs maintained exactly (seller group totals), new test IDs added following documented patterns (update stock metrics)
- Conditional logic: Warning color correctly applied based on `line.hasQuantityMismatch` boolean
- Component encapsulation: No className prop as specified, styling fully centralized
- Value handling: Accepts both string and number types, correctly passes through to rendering
- Import/export structure: Clean barrel export pattern, proper TypeScript type exports

---

## 4) Over-Engineering & Refactoring Opportunities

No over-engineering detected. The implementation demonstrates appropriate abstraction level and follows YAGNI principles:

- **Removed align prop**: Plan correctly eliminated alignment prop (section 1) since all usage sites use right alignment. Component hardcodes `text-right`. This is the right trade-off — can be added later as non-breaking change if left-aligned metrics emerge.

- **Simple value color variant**: Two-value enum (default/warning) matches current requirements exactly. No need for extensible color system until more variants are needed.

- **No unnecessary abstractions**: Component is a pure function with no hooks, effects, or state. Appropriate for a presentational metric display.

- **Consistent with existing patterns**: Matches StatusBadge and InformationBadge architecture (forwardRef, displayName, const color mappings, required testId, no className).

The component achieves its goal of eliminating CSS class soup without introducing unnecessary complexity.

---

## 5) Style & Consistency

**Pattern: Component API consistency**

- Evidence: `src/components/ui/metric-display.tsx:10-19` — MetricDisplay requires testId prop and excludes className prop
- Comparison:
  - `src/components/ui/status-badge.tsx:18-27` — StatusBadge requires testId, no className
  - `src/components/ui/information-badge.tsx:10-21` — InformationBadge requires testId, no className
- Impact: Excellent consistency. All three semantic UI components enforce strict encapsulation and test instrumentation requirements.
- Recommendation: None needed. Pattern is correctly followed.

**Pattern: JSDoc documentation quality**

- Evidence: `src/components/ui/metric-display.tsx:21-47` — Comprehensive JSDoc with usage examples, rationale for className exclusion, and two realistic code examples
- Comparison: Matches StatusBadge and InformationBadge documentation thoroughness
- Impact: Maintainability benefit. Future developers understand component purpose, constraints, and usage patterns without reading implementation.
- Recommendation: None needed. Documentation exceeds project standards.

**Pattern: Element type standardization**

- Evidence: `src/components/ui/metric-display.tsx:54-59` — Uses `span` elements for label and value
- Context: Plan section 15 documented that seller-group-card used `span` while update-stock-dialog used `p` tags
- Impact: Standardization benefit. Refactoring normalized to `span` elements, which are more semantically appropriate for inline metric displays within flex containers.
- Recommendation: None needed. Standardization is a planned improvement.

**Pattern: Test ID application**

- Evidence: `src/components/ui/metric-display.tsx:57` — testId applied to value element: `<span ... data-testid={testId}>`
- Rationale: Value is the primary data point for assertions (plan section 15)
- Consistency: Matches existing seller group test ID placement (plan section 2)
- Impact: Test stability. Playwright selectors target value elements as before.
- Recommendation: None needed. Pattern correctly preserved from existing implementation.

---

## 6) Tests & Deterministic Coverage (new/changed behavior only)

**Surface: Seller Group Metrics**

- Scenarios:
  - Given shopping list with seller groups, When viewing Ready tab, Then each seller group displays Needed/Ordered/Received metrics with correct values (existing parent component tests cover this flow)
  - Given seller group with 0 needed, When viewing card, Then Needed metric displays "0" (value rendering verified by implementation)
  - Given seller group with filtered lines, When viewing totals, Then metrics reflect visible totals (parent component responsibility, not metric display concern)

- Hooks:
  - Test IDs preserved exactly: `shopping-lists.ready.group.${group.groupKey}.totals.{metric}` (`seller-group-card.tsx:73,78,83`)
  - Selectors remain: `page.getByTestId('shopping-lists.ready.group.{groupKey}.totals.needed')` etc.

- Gaps: No direct Playwright assertions on these test IDs exist (verified by grep search in plan section 13). However, parent component tests exercise the seller group card rendering, which implicitly validates metric display. For a pure UI refactoring that preserves test IDs, parent component coverage is adequate.

- Evidence: User confirmed all 42 shopping list Playwright tests pass without modification.

**Surface: Update Stock Dialog Metrics**

- Scenarios:
  - Given line has ordered quantity, When opening update stock dialog, Then Ordered metric displays correct value (parent dialog tests cover this)
  - Given line with quantity mismatch, When viewing dialog, Then Received metric displays with warning color (conditional valueColor logic at `update-stock-dialog.tsx:570`)
  - Given line without mismatch, When viewing dialog, Then Received metric displays with default color

- Hooks:
  - New test IDs added: `shopping-lists.ready.update-stock.line.metric.ordered` and `shopping-lists.ready.update-stock.line.metric.received` (`update-stock-dialog.tsx:565,571`)
  - Warning color selector: Can assert on value element having `text-amber-600` class when mismatch exists

- Gaps: No explicit Playwright scenario verifies warning color styling for quantity mismatch. This is a **Minor** gap — the conditional logic is straightforward (single boolean check), but a visual regression scenario would increase confidence in color variant behavior.

  Suggested minimal test addition (optional, not blocking):
  ```typescript
  test('shows warning color for received quantity mismatch', async ({ testData, page }) => {
    const list = await testData.shoppingLists.createReady();
    const line = await testData.shoppingLists.createLine(list.id, { ordered: 10, received: 8 });

    await page.goto(`/shopping-lists/${list.id}`);
    await page.getByTestId('shopping-lists.ready.update-stock-dialog').click();

    const receivedMetric = page.getByTestId('shopping-lists.ready.update-stock.line.metric.received');
    await expect(receivedMetric).toHaveClass(/text-amber-600/);
  });
  ```

- Evidence: Parent dialog tests exercise the update stock workflow, providing functional coverage of metric display rendering.

**Coverage Assessment**

Pure UI refactor with no behavioral changes. Component is a stateless presentation layer — parent component tests provide sufficient coverage. The implementation correctly maps conditional logic (`line.hasQuantityMismatch`) to component prop (`valueColor`), and TypeScript enforces correct prop usage at compile time. Visual inspection (user confirmed) and passing parent tests validate correctness.

No new Playwright scenarios required for GO decision. Optional visual regression test for warning color variant would be a future hardening opportunity.

---

## 7) Adversarial Sweep (≥3 credible failures or justify none)

**Checks attempted:**

1. **Derived state / cache mutation risk**: Checked if metric values are computed from filtered/derived state that could drive persistent writes
2. **Missing effect cleanup**: Searched for subscriptions, timers, or async operations requiring cleanup
3. **Conditional rendering bugs**: Examined valueColor conditional logic for stale closure or incorrect boolean mapping
4. **Test ID instability**: Verified test IDs are deterministic and don't depend on runtime state that could change
5. **Number formatting confusion**: Checked if component attempts to format numbers (commas, decimals) vs passing through parent-formatted values
6. **Performance traps**: Examined render triggers and memo dependencies

**Evidence and reasoning:**

1. **Derived state**: `update-stock-dialog.tsx:570` — `valueColor={line.hasQuantityMismatch ? 'warning' : 'default'}`
   - **Why code held up**: `line.hasQuantityMismatch` is a read-only boolean property computed from API data. No persistent writes triggered by this conditional. MetricDisplay is pure presentation with no side effects.

2. **Effect cleanup**: `metric-display.tsx:48-63`
   - **Why code held up**: Component is a pure function with no hooks (useState, useEffect, subscriptions). No cleanup needed. Pattern matches StatusBadge and InformationBadge (both are pure forwardRef components).

3. **Conditional logic**: `metric-display.tsx:50` — `const valueColorClasses = VALUE_COLOR_CLASSES[valueColor];`
   - **Why code held up**: TypeScript union type ensures `valueColor` is `'default' | 'warning'` (line 16). Object lookup is type-safe. No closure issues — prop value is evaluated on every render. Default value `'default'` prevents undefined lookup.

4. **Test ID stability**:
   - Seller group: `seller-group-card.tsx:73,78,83` — Test IDs use `group.groupKey` which is a stable identifier from API response
   - Update stock: `update-stock-dialog.tsx:565,571` — Test IDs are static strings
   - **Why code held up**: Test IDs are either constant strings or derived from stable backend identifiers. No runtime instability (e.g., array indices, timestamps) that could cause selector flakiness.

5. **Number formatting**: `metric-display.tsx:58` — `{value}` directly rendered
   - **Why code held up**: Component accepts `string | number` (line 14) and passes through to JSX without transformation. JSDoc (line 31-47) explicitly documents that number formatting is parent's responsibility. All usage sites pass pre-formatted values (`visibleTotals.needed`, `line.ordered`). Component correctly avoids formatting logic.

6. **Performance**: `metric-display.tsx:53-60` — Simple JSX with no loops, effects, or memoization
   - **Why code held up**: Component renders 2 spans in a div. No React.memo needed (props are primitives). No child list rendering. No expensive computations. O(1) render complexity. Parent containers control when metrics re-render via standard React reconciliation.

**Adversarial proof: No credible failures**

The component's stateless, pure functional design eliminates entire categories of React failure modes. TypeScript strict mode prevents type errors. The required testId prop ensures instrumentation coverage. The explicit exclusion of className prop prevents CSS soup reintroduction. All conditional logic is trivial (single boolean ternary). The implementation successfully achieves the "boring component" ideal — no surprises, no edge cases, no async coordination, no state management.

---

## 8) Invariants Checklist

**Invariant 1: Test ID consistency across refactoring**

- Invariant: Existing Playwright selectors must continue to work after refactoring (test IDs must not change)
- Where enforced:
  - `seller-group-card.tsx:73,78,83` — Preserved exact test ID patterns: `shopping-lists.ready.group.${group.groupKey}.totals.{metric}`
  - Comparison with plan section 2, lines 215-237 shows identical test ID strings before/after refactoring
- Failure mode: If test IDs were altered, Playwright selectors would break and tests would fail
- Protection: User confirmed all 42 shopping list tests pass, proving test ID preservation. TypeScript ensures testId prop is always provided (required prop).
- Evidence: Git diff shows test IDs unchanged in seller-group-card refactoring, new test IDs added (not replaced) in update-stock-dialog.

**Invariant 2: Value color correctly reflects quantity mismatch state**

- Invariant: When `line.hasQuantityMismatch` is true, Received metric must display with warning color (text-amber-600)
- Where enforced:
  - `update-stock-dialog.tsx:570` — `valueColor={line.hasQuantityMismatch ? 'warning' : 'default'}`
  - `metric-display.tsx:50` — `const valueColorClasses = VALUE_COLOR_CLASSES[valueColor];`
  - `metric-display.tsx:57` — Classes applied to value span: `className={cn('font-semibold', valueColorClasses)}`
- Failure mode: If conditional logic is inverted or color mapping is wrong, users would not see visual warning for quantity discrepancies
- Protection: TypeScript ensures valueColor is `'default' | 'warning'`. VALUE_COLOR_CLASSES const object maps warning to 'text-amber-600' (matching plan section 3). Ternary logic is straightforward boolean check. User performed visual inspection and confirmed behavior.
- Evidence: Plan section 2, lines 243-257 document original conditional: `className={cn('font-semibold', line.hasQuantityMismatch ? 'text-amber-600' : 'text-foreground')}`. Refactored version correctly extracts this logic to valueColor prop.

**Invariant 3: Component styling remains encapsulated (no className prop escape hatch)**

- Invariant: Metric display styling must be fully centralized in the component; call sites cannot inject custom classes
- Where enforced:
  - `metric-display.tsx:10-19` — MetricDisplayProps interface excludes className property
  - TypeScript strict mode at compile time prevents passing className prop
  - JSDoc (lines 28-29) documents rationale: "Intentionally does not support custom className prop to enforce consistent metric styling"
- Failure mode: If className prop is added later, call sites could reintroduce CSS class soup (the problem this refactoring solves)
- Protection: TypeScript compiler error if any call site attempts `<MetricDisplay className="..." />`. Code review process for any future API changes. Pattern consistency with StatusBadge and InformationBadge (neither accept className).
- Evidence: Plan section 15 documents resolved decision to exclude className. Plan section 8 explicitly lists "Attempt to Pass className Prop" as a guarded failure mode with TypeScript compile-time protection.

**Invariant 4: Metric values are presentation-only (no formatting or transformation)**

- Invariant: MetricDisplay must render values exactly as provided by parent; no number formatting, rounding, or unit conversion
- Where enforced:
  - `metric-display.tsx:58` — Value rendered directly: `{value}`
  - JSDoc documents: "number formatting is parent's responsibility; MetricDisplay is presentation-only" (implicit in design)
  - Plan section 6 explicitly states: "Parent component responsible for number formatting (commas, decimals, units). MetricDisplay does NOT format numbers."
- Failure mode: If component adds formatting logic (e.g., `value.toLocaleString()`), inconsistent formatting across usage sites or incorrect locale assumptions
- Protection: Component design keeps value prop simple (`string | number`). No util function calls, no formatting logic in implementation. Parent components (`visibleTotals.needed`, `line.ordered`) provide pre-formatted values.
- Evidence: All usage sites pass raw numeric values from domain models, expecting direct rendering. No `.toFixed()`, `.toLocaleString()`, or template string formatting in component code.

---

## 9) Questions / Needs-Info

No unresolved questions. All implementation decisions are well-documented in the plan (section 15 resolves className exclusion, test ID placement, element type standardization). User confirmation of passing tests and visual inspection closes any remaining ambiguity.

---

## 10) Risks & Mitigations (top 3)

**Risk 1: Minor visual differences from label color standardization**

- Risk: Seller group metric labels now have `text-muted-foreground` class (previously omitted), making labels slightly lighter gray. Users or design team may notice the change.
- Mitigation: Plan section 12 documents this as an acceptable visual change ("labels will gain text-muted-foreground class... slightly more subdued... Acceptable standardization"). User performed visual inspection and accepted the change. If design feedback emerges, component API supports easy color customization (could add optional labelColor prop as non-breaking change).
- Evidence: Plan section 2, lines 217-223 show original implementation lacked `text-muted-foreground` on labels. Refactored version (metric-display.tsx:54) adds this class for consistency with update-stock-dialog pattern.

**Risk 2: Update stock dialog test IDs not yet exercised by Playwright specs**

- Risk: New test IDs `shopping-lists.ready.update-stock.line.metric.ordered` and `.received` are added but no current Playwright tests assert on them. If test ID naming is wrong or selectors are unstable, won't be caught until future test authoring.
- Mitigation: Test ID patterns follow established conventions (`shopping-lists.ready.{feature}.line.metric.{name}`). Naming is consistent with seller group pattern. User confirmed parent dialog tests pass, proving metrics render correctly. Future test authors can discover and use these test IDs via code search. Consider adding Playwright scenario for warning color variant (section 6 gap) to exercise new test IDs.
- Evidence: Plan section 13 documents update-stock-dialog metrics have no current test coverage. Plan section 14, slice 3 adds test IDs matching required testId prop pattern.

**Risk 3: Future developers may attempt to add className prop**

- Risk: Future maintainers unfamiliar with the encapsulation rationale may add className prop to MetricDisplay, undermining the refactoring goal of centralizing metric styling.
- Mitigation: TypeScript enforces no className in prop interface. JSDoc explicitly documents exclusion rationale (lines 28-29): "Intentionally does not support custom className prop to enforce consistent metric styling." Code review process should catch API changes. Pattern consistency with StatusBadge and InformationBadge establishes precedent for strict encapsulation in semantic UI components.
- Evidence: Plan section 15 resolves this as a conscious architectural decision. Plan section 8 lists className exclusion as a guarded failure mode with compile-time protection.

---

## 11) Confidence

Confidence: **High** — Implementation is straightforward, follows established patterns, maintains test compatibility, and has user-confirmed test and visual verification. The pure functional design eliminates entire categories of React bugs (no state, effects, or async coordination). TypeScript strict mode provides compile-time safety. The component achieves its technical debt elimination goal without introducing new complexity or risk. All plan commitments are fulfilled, and the refactoring scope is well-contained (2 files, 5 instances, zero behavioral changes).

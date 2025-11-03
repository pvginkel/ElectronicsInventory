# Metric Display Component Extraction — Technical Plan

## 0) Research Log & Findings

### Discovery Work

Conducted comprehensive search across the codebase for metric display patterns (label + value stacked vertically) using multiple strategies:
- Searched for `text-xs uppercase tracking-wide text-muted-foreground` pattern (found 5 files)
- Searched for `font-semibold text-foreground` in context of metrics (found multiple instances)
- Searched for `flex flex-col.*text-right` combination patterns
- Manually inspected all identified files to understand pattern variations
- Reviewed existing UI components (StatusBadge, InformationBadge, KeyValueBadge) for pattern consistency
- Checked Playwright tests for selectors that target these metrics

### Pattern Variations Identified

The metric display pattern appears with several structural and styling variations:

**Variant 1: Shopping list seller group metrics** (seller-group-card.tsx)
- Container: `div` with `flex flex-col text-right`
- Label: `span` with `text-xs uppercase tracking-wide` (no text-muted-foreground)
- Value: `span` with `font-semibold text-foreground` and `data-testid`
- Purpose: Display Needed/Ordered/Received totals in seller group cards
- Location: Lines 70-87
- Instances: 3 per card (Needed, Ordered, Received)
- Test IDs: `shopping-lists.ready.group.{groupKey}.totals.{metric}`

**Variant 2: Update stock dialog metrics** (update-stock-dialog.tsx)
- Container: `div` with `text-right`
- Label: `p` with `text-xs uppercase text-muted-foreground`
- Value: `p` with `font-semibold text-foreground` (conditionally `text-amber-600` for mismatch)
- Purpose: Display Ordered/Received quantities in stock update dialog
- Location: Lines 561-570
- Instances: 2 per line (Ordered, Received)
- Notable: Received value has conditional color based on quantity mismatch
- No individual test IDs on metrics (parent container has test ID)

**Related but EXCLUDED Pattern: KeyValueBadge** (already exists)
- Purpose: Display metrics in badge format (`label: value`)
- Used in pick-lists detail, kit detail, shopping list overview
- Renders as colored Badge component, not stacked text
- Examples: "Total lines: 42", "Shortfall: 10"
- This is a different use case from MetricDisplay

### Excluded Patterns (NOT metric displays)

During comprehensive pattern search, found `text-xs uppercase tracking-wide` styling in additional files that are NOT metric displays:

**Table Headers** (NOT metric displays):
1. `/work/frontend/src/components/kits/kit-bom-table.tsx` - Line 118: `<tr className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">` - Table header row, not stacked label+value
2. `/work/frontend/src/components/pick-lists/pick-list-lines.tsx` - Line 146: `<thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">` - Table header, not metric
3. `/work/frontend/src/components/shopping-lists/concept-table.tsx` - Line 135: `<tr className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">` - Table header row
4. `/work/frontend/src/components/shopping-lists/ready/seller-group-card.tsx` - Line 134: `<tr className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">` - Table header row within same file

**Form Labels** (NOT metric displays):
5. `/work/frontend/src/components/kits/kit-bom-row-editor.tsx` - Line 156: `<Label className="text-xs uppercase tracking-wide text-muted-foreground">Part</Label>` - Form field label, not stacked metric

**Exclusion Rationale:**
- Metric displays have stacked vertical structure: label on top, value below
- Table headers are horizontal row elements (`<tr>` or `<thead>`)
- Form labels precede input fields, not numeric values
- These patterns share styling but NOT semantic structure

This verification closes the discovery loop and confirms the 5-instance claim is accurate.

### Affected Files Summary

**Files with metric display pattern:**
1. `/work/frontend/src/components/shopping-lists/ready/seller-group-card.tsx` - Lines 70-87 (3 instances: Needed, Ordered, Received)
2. `/work/frontend/src/components/shopping-lists/ready/update-stock-dialog.tsx` - Lines 561-570 (2 instances: Ordered, Received)

**Files that appear similar but use KeyValueBadge (NOT affected):**
- `/work/frontend/src/components/pick-lists/pick-list-detail.tsx` - Uses KeyValueBadge component
- `/work/frontend/src/components/kits/kit-detail.tsx` - Uses KeyValueBadge component
- `/work/frontend/src/components/shopping-lists/overview-card.tsx` - Uses KeyValueBadge component

### Key Findings

**Pattern Scope:**
- Limited to 2 files with 5 total instances (3 in seller-group-card, 2 in update-stock-dialog)
- All instances are domain-agnostic (display numeric metrics with labels)
- Pattern is consistent: stacked vertical layout with label on top, value below

**Styling Inconsistencies to Resolve:**
- Label color: Some use `text-muted-foreground`, some omit it
- Element types: Mix of `span` and `p` tags
- Alignment: All use `text-right` (standardize this as default)
- Container classes: `flex flex-col` vs just structural parent (standardize)
- Value conditional colors: update-stock-dialog has `text-amber-600` for mismatch state (preserve this capability)

**Test Coverage:**
- Seller group metrics have individual `data-testid` attributes on values
- Update stock dialog metrics rely on parent container test IDs
- Tests reference metric values but not the metric display pattern itself

### Architecture Context

- UI components live in `src/components/ui/`
- Existing related components: `KeyValueBadge` (horizontal label:value in badge), `StatusBadge` (status indicators), `InformationBadge` (metadata tags)
- MetricDisplay is distinct: vertical stacking, plain text (no badge background), right-aligned
- Components export from `src/components/ui/index.ts`
- Tailwind CSS used for styling
- Pattern for semantic components: NO className prop (StatusBadge, InformationBadge precedent)
- Test instrumentation via `data-testid` props throughout

### Testing Infrastructure

- Playwright tests rely on `data-testid` attributes for selectors
- Shopping list tests reference seller group totals via `shopping-lists.ready.group.{groupKey}.totals.{metric}`
- Update stock dialog tests reference parent containers, not individual metrics
- Instrumentation helpers in `src/lib/test/`

### Key Decision: Component Scope and API

**Decision: Create MetricDisplay component without className prop**

Rationale:
- Metric displays serve a specific visual role: stacked label + value for numeric metrics
- All current usage sites show right-aligned metrics (standardize with hardcoded `text-right`)
- Alignment prop removed following YAGNI principle (can be added later if needed)
- Conditional value colors (e.g., mismatch warning) should be handled via optional `valueColor` prop
- NO className prop follows StatusBadge/InformationBadge pattern for strict encapsulation

**Component Interface:**
```typescript
interface MetricDisplayProps {
  label: string;                           // Metric label (e.g., "Needed", "Ordered")
  value: string | number;                  // Metric value
  valueColor?: 'default' | 'warning';      // Optional color override for value
  testId: string;                          // Required test ID for value element (follows StatusBadge/InformationBadge pattern)
}
```

**Note on required testId:** Following the established pattern from StatusBadge, InformationBadge, and KeyValueBadge components, testId is required to ensure consistent test instrumentation. Update-stock-dialog metrics will receive test IDs during refactoring: `shopping-lists.ready.update-stock.line.metric.ordered` and `shopping-lists.ready.update-stock.line.metric.received`.

**Note on removed align prop:** All 5 current instances use right alignment. The align prop was removed following YAGNI principle (You Aren't Gonna Need It). Component hardcodes `text-right` alignment. If left-aligned metrics are needed in the future, the prop can be added as a non-breaking change (new optional prop).

---

## 1) Intent & Scope

**User intent**

Extract repeated metric display pattern (stacked label + value) used for displaying statistics, counts, and measurements into a reusable `MetricDisplay` component in `src/components/ui/`, eliminating CSS class soup by centralizing all styling in the component. This is technical debt elimination work following the UI Component Refactoring Workflow.

**Prompt quotes**

"MetricDisplay is a semantic UI component that displays a metric with a label and value, commonly used in cards and detail views to show statistics, counts, or measurements."

"Common pattern: `<div className="flex flex-col text-right"><span className="text-xs uppercase tracking-wide text-muted-foreground">Label</span><span className="font-semibold text-foreground">Value</span></div>`"

"Inconsistencies to resolve: Spacing variations (flex-col vs flex-wrap), Text sizing inconsistencies (text-xs varies), Color variations (text-muted-foreground sometimes omitted), Some instances use different font weights, Alignment variations (text-right not always present)"

"NO className prop (enforce encapsulation)"

"This is technical debt work - resolve all questions autonomously, accept minor visual differences for consistency, and make breaking changes"

**In scope**

- Create new `MetricDisplay` component in `src/components/ui/metric-display.tsx`
- Hardcode right alignment (all current usage sites use `text-right`)
- Support value color variants: default (text-foreground) and warning (text-amber-600)
- Standardize label styling: `text-xs uppercase tracking-wide text-muted-foreground`
- Standardize value styling: `font-semibold` with conditional color
- Require `testId` prop (applied to value element, following StatusBadge/InformationBadge pattern)
- Refactor all 5 identified usage sites (2 files)
- Add test IDs to update-stock-dialog metrics (currently missing)
- REMOVE className prop entirely from component interface
- Accept visual changes as standardization benefits
- Update Playwright tests if selectors need adjustments (none expected - test IDs preserved)
- Export component from `src/components/ui/index.ts`

**Out of scope**

- Backward compatibility layers or deprecation warnings
- className prop support (explicitly excluded)
- Custom text sizes or font weights beyond standardized values
- Icon or badge integration (separate concerns)
- Non-numeric metric display (dates, strings should use different patterns)
- Horizontal metric layouts (use KeyValueBadge instead)
- Interactive metric behaviors (handled by parent components)

**Assumptions / constraints**

- All metric displays are for numeric or string values (counts, quantities, statuses)
- Right alignment is standard for all metrics (hardcoded); no left-aligned variants needed
- Value color variations are limited to default and warning states
- Minor visual regressions (exact spacing differences) are acceptable for consistency
- TypeScript strict mode will catch all call sites that break from removed className prop
- Parent components handle conditional rendering and data formatting
- Test IDs are required for all metrics (following established UI component patterns)
- The refactoring touches 2 files with 5 instances, pure UI change with no business logic impact

---

## 2) Affected Areas & File Map

### New Component

- **Area**: `src/components/ui/metric-display.tsx`
- **Why**: New reusable component encapsulating stacked metric display pattern
- **Evidence**: Does not exist; will be created following StatusBadge and InformationBadge patterns

- **Area**: `src/components/ui/index.ts`
- **Why**: Export the new MetricDisplay component
- **Evidence**: Existing pattern exports all UI components from this barrel file (line 11-15 show badge exports)

### Components to Refactor (2 files, 5 instances)

- **Area**: `src/components/shopping-lists/ready/seller-group-card.tsx`
- **Why**: Contains 3 metric displays for seller group totals (Needed, Ordered, Received) on lines 70-87
- **Evidence**:
  ```tsx
  // Lines 70-74: Needed metric
  <div className="flex flex-col text-right">
    <span className="text-xs uppercase tracking-wide">Needed</span>
    <span className="font-semibold text-foreground" data-testid={`shopping-lists.ready.group.${group.groupKey}.totals.needed`}>
      {visibleTotals.needed}
    </span>
  </div>

  // Lines 76-80: Ordered metric
  <div className="flex flex-col text-right">
    <span className="text-xs uppercase tracking-wide">Ordered</span>
    <span className="font-semibold text-foreground" data-testid={`shopping-lists.ready.group.${group.groupKey}.totals.ordered`}>
      {visibleTotals.ordered}
    </span>
  </div>

  // Lines 82-86: Received metric
  <div className="flex flex-col text-right">
    <span className="text-xs uppercase tracking-wide">Received</span>
    <span className="font-semibold text-foreground" data-testid={`shopping-lists.ready.group.${group.groupKey}.totals.received`}>
      {visibleTotals.received}
    </span>
  </div>
  ```
  Note: Labels are missing `text-muted-foreground` (inconsistency to fix)

- **Area**: `src/components/shopping-lists/ready/update-stock-dialog.tsx`
- **Why**: Contains 2 metric displays for order quantities (Ordered, Received) on lines 561-570
- **Evidence**:
  ```tsx
  // Lines 561-564: Ordered metric
  <div className="text-right">
    <p className="text-xs uppercase text-muted-foreground">Ordered</p>
    <p className="font-semibold text-foreground">{line.ordered}</p>
  </div>

  // Lines 565-570: Received metric (with conditional color)
  <div className="text-right">
    <p className="text-xs uppercase text-muted-foreground">Received</p>
    <p className={cn('font-semibold', line.hasQuantityMismatch ? 'text-amber-600' : 'text-foreground')}>
      {line.received}
    </p>
  </div>
  ```
  Note: Uses `p` tags instead of `span`, conditional color on Received value

### Test Files (Potentially Affected)

- **Area**: `tests/e2e/shopping-lists/shopping-lists-detail.spec.ts`
- **Why**: Tests interact with shopping list ready view and seller groups
- **Evidence**: Likely references seller group totals via test IDs

- **Area**: `tests/e2e/shopping-lists/shopping-lists.spec.ts`
- **Why**: General shopping list workflow tests
- **Evidence**: May interact with seller group cards and metrics

---

## 3) Data Model / Contracts

### MetricDisplay Component Props

- **Entity**: MetricDisplay component props interface
- **Shape**:
  ```typescript
  interface MetricDisplayProps {
    /** Metric label displayed above value (e.g., "Needed", "Ordered") */
    label: string;

    /** Metric value (number or string) */
    value: string | number;

    /** Optional color variant for value (default: 'default') */
    valueColor?: 'default' | 'warning';

    /** Required test ID applied to value element for Playwright selectors */
    testId: string;

    // Explicitly NO className prop
  }
  ```
- **Mapping**: Direct pass-through from usage sites; parent components handle conditional logic for valueColor. Number formatting (commas, decimals) remains parent's responsibility before passing to value prop.
- **Evidence**: Derived from analyzing 5 usage sites across 2 files. NO className follows StatusBadge (status-badge.tsx:18) and InformationBadge (information-badge.tsx:10) patterns.

### Value Color Decisions

- **Entity**: `valueColor` prop styling rules
- **Shape**:
  ```typescript
  type MetricValueColor = 'default' | 'warning';

  // Color mappings:
  // 'default': text-foreground (standard metric color)
  // 'warning': text-amber-600 (used for quantity mismatches, alerts)
  ```
- **Mapping**: Update stock dialog uses `text-amber-600` for quantity mismatch warnings (line 567). This maps to 'warning' variant. All other cases use 'default'.
- **Evidence**: Lines 565-570 in update-stock-dialog.tsx show conditional color: `line.hasQuantityMismatch ? 'text-amber-600' : 'text-foreground'`

### Breaking Changes

All usage sites must be updated simultaneously. No deprecated props or backward compatibility layer. className prop is completely removed (TypeScript will enforce).

---

## 4) API / Integration Surface

### Component Export

- **Surface**: `src/components/ui/index.ts` barrel export
- **Inputs**: None (static export)
- **Outputs**: `MetricDisplay` component available for import
- **Errors**: N/A (compile-time)
- **Evidence**: Existing pattern at lines 11-15: badge components exported from index.ts

### Usage Pattern

- **Surface**: Import and render in domain components
- **Inputs**: MetricDisplayProps as defined in section 3
- **Outputs**: Rendered DOM with optional `data-testid` on value element
- **Errors**: TypeScript compile errors if required props missing or invalid values provided
- **Evidence**: Pattern established by existing UI components like `StatusBadge`, `KeyValueBadge`

---

## 5) Algorithms & UI Flows

### Component Render Flow

- **Flow**: MetricDisplay component rendering
- **Steps**:
  1. Accept props: `{ label, value, valueColor = 'default', testId }`
  2. Determine container classes:
     - Base: `flex flex-col text-right` (hardcoded right alignment)
  3. Determine label classes:
     - Fixed: `text-xs uppercase tracking-wide text-muted-foreground`
  4. Determine value classes:
     - Base: `font-semibold`
     - Color: `text-foreground` (default) or `text-amber-600` (warning)
  5. Merge classes using `cn()` utility (NO custom className accepted)
  6. Render as container `div` with nested label and value spans
  7. Apply label text from `label` prop
  8. Apply value text from `value` prop (convert numbers to string)
  9. Apply `data-testid={testId}` to value element (required prop)
- **States / transitions**: Pure render, no internal state; all styling via CSS
- **Hotspots**: None (simple composition component)
- **Evidence**: Derived from analyzing 5 existing implementations

### Refactoring Flow per Component

- **Flow**: Replace inline metric display markup with MetricDisplay component
- **Steps**:
  1. Import MetricDisplay from `@/components/ui`
  2. Identify metric display instances in component
  3. Map existing conditional logic for value color (if any)
  4. Replace JSX with `<MetricDisplay label="..." value={...} valueColor="..." testId="..." />`
  5. Remove all inline className strings related to metric styling
  6. Preserve existing `data-testid` values exactly (critical for test compatibility)
  7. For seller-group-card: Add valueColor='default' (explicit, though it's the default)
  8. For update-stock-dialog Received: Pass valueColor based on `line.hasQuantityMismatch`
  9. Verify TypeScript compilation (no className prop usage allowed)
- **States / transitions**: No state changes in consuming components; conditional logic for valueColor selection remains in parent
- **Hotspots**: Ensuring test IDs remain identical to avoid breaking Playwright specs
- **Evidence**: Pattern established by refactoring requirements

---

## 6) Derived State & Invariants

### Test ID Consistency

- **Derived value**: `data-testid` attribute on value element (when testId provided)
- **Source**: Optional `testId` prop passed by consuming component
- **Writes / cleanup**: None (stateless rendering)
- **Guards**: TypeScript allows optional testId; only applied to DOM if provided
- **Invariant**: When test IDs are provided, they must match existing patterns exactly to preserve Playwright test compatibility. Seller group metrics have individual test IDs; update stock metrics rely on parent container IDs.
- **Evidence**: Seller group totals use test ID pattern `shopping-lists.ready.group.{groupKey}.totals.{metric}` (lines 72, 78, 84)

### Value Formatting

- **Derived value**: String representation of value displayed
- **Source**: `value` prop (string or number)
- **Writes / cleanup**: None
- **Guards**: Component accepts both string and number; numbers are converted to string for display
- **Invariant**: Parent component responsible for number formatting (commas, decimals, units). MetricDisplay does NOT format numbers.
- **Evidence**: Seller group displays raw numbers like `{visibleTotals.needed}` without formatting

---

## 7) State Consistency & Async Coordination

### Pure Component Contract

- **Source of truth**: Props provided by parent component
- **Coordination**: None required (stateless component)
- **Async safeguards**: N/A (synchronous rendering)
- **Instrumentation**: `data-testid` attributes enable Playwright assertions via `page.getByTestId()`
- **Evidence**: UI components in `src/components/ui/` follow stateless pattern (status-badge.tsx, key-value-badge.tsx)

### Parent Component Responsibility

- **Source of truth**: Parent component's data determines label, value, and conditional valueColor
- **Coordination**: Parent manages shopping list state, order quantities, mismatch detection
- **Async safeguards**: Parents already implement query state handling
- **Instrumentation**: No new instrumentation required; metrics are static display elements
- **Evidence**: Lines 37-38 (seller-group-card.tsx) compute visibility totals; lines 567-569 (update-stock-dialog.tsx) check hasQuantityMismatch

---

## 8) Errors & Edge Cases

### Missing Required Props

- **Failure**: TypeScript compile error if `label` or `value` omitted
- **Surface**: Build-time error in consuming component
- **Handling**: Developer must provide required props
- **Guardrails**: TypeScript strict mode, required prop definitions
- **Evidence**: Standard React TypeScript pattern

### Invalid Value Color

- **Failure**: TypeScript compile error if valueColor not 'default' | 'warning'
- **Surface**: Build-time error in consuming component
- **Handling**: Developer must use valid color string
- **Guardrails**: TypeScript union type constraint
- **Evidence**: Standard TypeScript enum pattern

### Attempt to Pass className Prop

- **Failure**: TypeScript compile error (className not in prop interface)
- **Surface**: Build-time error in consuming component
- **Handling**: Developer must remove className usage; adjust layout in parent container instead
- **Guardrails**: TypeScript strict mode, intentional prop omission
- **Evidence**: Follows StatusBadge and InformationBadge patterns that exclude className

### Empty or Undefined Value

- **Failure**: Metric displays empty value or "undefined" text
- **Surface**: Visual bug in consuming component
- **Handling**: Parent component should handle empty states (don't render MetricDisplay if no value)
- **Guardrails**: Code review, runtime checks in parent
- **Evidence**: All current usage sites have guaranteed values from API data

### Visual Differences After Standardization

- **Failure**: Minor spacing/color differences from previous implementations
- **Surface**: Visual appearance of metrics may differ slightly
- **Handling**: Accept as casualties; document significant changes
- **Guardrails**: Visual inspection during testing
- **Evidence**: UI component workflow principles: "Minor visual differences acceptable"

---

## 9) Observability / Instrumentation

### Required Test ID

- **Signal**: `data-testid` attribute on value element
- **Type**: HTML attribute for test instrumentation (required)
- **Trigger**: Always rendered on value element using testId prop
- **Labels / fields**: Single string from `testId` prop (required prop following StatusBadge/InformationBadge pattern)
- **Consumer**: Playwright selectors via `page.getByTestId(testId)`
- **Evidence**: Seller group totals use test IDs (lines 72, 78, 84 in seller-group-card.tsx)

### No Runtime Events

No test-event emission required for metric displays. These are static UI elements without user interaction lifecycle.

---

## 10) Lifecycle & Background Work

### No Lifecycle Hooks

MetricDisplay is a pure functional component with no effects, subscriptions, or cleanup.

- **Hook / effect**: None
- **Trigger cadence**: N/A
- **Responsibilities**: N/A
- **Cleanup**: N/A
- **Evidence**: Stateless UI component pattern established by status-badge.tsx, key-value-badge.tsx

---

## 11) Security & Permissions

Not applicable. MetricDisplay is a presentational component with no data access, authentication, or authorization logic.

---

## 12) UX / UI Impact

### Entry Points (2 components affected)

- **Entry point**: Shopping list detail page - Ready tab - Seller group cards
- **Change**: Replace inline metric displays with MetricDisplay component for Needed/Ordered/Received totals
- **User interaction**: No behavioral change; slight visual standardization (label color consistency)
- **Dependencies**: MetricDisplay component
- **Evidence**: Lines 70-87 in `src/components/shopping-lists/ready/seller-group-card.tsx`

- **Entry point**: Shopping list detail page - Ready tab - Update Stock dialog
- **Change**: Replace inline metric displays with MetricDisplay component for Ordered/Received quantities
- **User interaction**: No behavioral change; conditional warning color preserved
- **Dependencies**: MetricDisplay component
- **Evidence**: Lines 561-570 in `src/components/shopping-lists/ready/update-stock-dialog.tsx`

### Visual Changes Expected

1. **Seller group metrics**: Labels will gain `text-muted-foreground` class (currently missing). This makes labels slightly more subdued (lighter gray). Acceptable standardization.

2. **Update stock metrics**: No visual changes expected (already uses correct classes).

3. **Spacing**: Standardize to `flex flex-col` container (update-stock-dialog currently relies on parent flex, may have slight spacing changes). Acceptable.

### Accessibility Considerations

- Maintain semantic HTML (div container with nested spans or paragraphs)
- Preserve text contrast ratios (all colors meet WCAG AA standards)
- No interactive elements (purely informational display)
- Screen readers will announce label and value in sequence (natural reading order)

---

## 13) Deterministic Test Plan

### Scenario 1: Seller Group Metrics

- **Surface**: Shopping list detail page - Ready tab - Seller group cards
- **Scenarios**:
  - **Given** shopping list with seller groups, **When** viewing Ready tab, **Then** each seller group displays Needed/Ordered/Received metrics with correct values
  - **Given** seller group has 0 needed, **When** viewing card, **Then** Needed metric displays "0" (not empty)
  - **Given** seller group has filtered lines, **When** viewing totals, **Then** metrics reflect visible totals (not filtered-out lines)
- **Instrumentation / hooks**:
  - `page.getByTestId('shopping-lists.ready.group.{groupKey}.totals.needed')`
  - `page.getByTestId('shopping-lists.ready.group.{groupKey}.totals.ordered')`
  - `page.getByTestId('shopping-lists.ready.group.{groupKey}.totals.received')`
- **Gaps**: Current Playwright tests do NOT assert on these specific metric test IDs (verified via grep - zero matches). Parent seller group card tests may exist. Test IDs are preserved for future coverage.
- **Evidence**: Test ID patterns not found in `/work/frontend/tests` directory

### Scenario 2: Update Stock Dialog Metrics

- **Surface**: Shopping list detail page - Ready tab - Update Stock dialog
- **Scenarios**:
  - **Given** line has ordered quantity, **When** opening update stock dialog, **Then** Ordered metric displays correct value
  - **Given** line has received quantity matching ordered, **When** viewing dialog, **Then** Received metric displays with default color (text-foreground)
  - **Given** line has received quantity NOT matching ordered, **When** viewing dialog, **Then** Received metric displays with warning color (text-amber-600)
- **Instrumentation / hooks**: Test IDs will be added during refactoring (Slice 3):
  - `shopping-lists.ready.update-stock.line.metric.ordered`
  - `shopping-lists.ready.update-stock.line.metric.received`
- **Gaps**: No current metric test IDs; will be added to match required testId prop pattern
- **Evidence**: Update stock dialog tests exist but do not assert on individual metrics currently

### Scenario 3: Visual Regression Check

- **Surface**: All metric displays across application
- **Scenarios**:
  - **Given** refactoring complete, **When** viewing all pages with metrics, **Then** labels have consistent muted foreground color
  - **Given** refactoring complete, **When** viewing all pages with metrics, **Then** values have consistent bold weight and foreground color
  - **Given** warning state active, **When** viewing metric, **Then** value displays with amber-600 color
- **Instrumentation / hooks**: Manual visual inspection
- **Gaps**: No automated visual regression tests; acceptable for this scope
- **Evidence**: Visual inspection during implementation

### Testing Strategy

1. Run full Playwright suite before refactoring (baseline)
2. Refactor seller-group-card.tsx first (3 instances)
3. Run shopping list tests after seller-group-card refactor
4. Refactor update-stock-dialog.tsx second (2 instances)
5. Run shopping list tests after update-stock-dialog refactor
6. Visual inspection of both components in browser
7. Ensure all test IDs preserved (no selector updates needed)
8. No new behavioral tests required (pure UI refactor)

---

## 14) Implementation Slices

### Slice 0: Establish Test Baseline

- **Goal**: Ensure all Playwright tests pass before refactoring begins
- **Touches**:
  - Run `pnpm check` to verify no TypeScript errors
  - Run `pnpm playwright test` to establish baseline
  - Run `pnpm playwright test tests/e2e/shopping-lists/` specifically
  - Document any pre-existing test failures
- **Dependencies**: None
- **Testing protocol**: All tests must pass; any failures must be documented as pre-existing issues

### Slice 1: Create MetricDisplay Component

- **Goal**: Ship reusable MetricDisplay component with all variants
- **Touches**:
  - Create `src/components/ui/metric-display.tsx`
  - Update `src/components/ui/index.ts` to export MetricDisplay
  - Hardcode right alignment (`text-right`) - no align prop
  - Implement valueColor prop (default: 'default', also 'warning')
  - Implement required testId prop (applied to value element)
  - NO className prop (intentionally excluded)
  - Add JSDoc comments with usage examples
- **Dependencies**: Slice 0 complete (baseline established)
- **Testing protocol**: Run `pnpm check` to verify TypeScript compiles; no Playwright tests needed (component not yet used)

### Slice 2: Refactor Seller Group Card Metrics

- **Goal**: Replace 3 metric instances in seller-group-card.tsx
- **Touches**:
  - `src/components/shopping-lists/ready/seller-group-card.tsx` (lines 70-87)
  - Replace 3 inline metric displays with MetricDisplay components
  - Preserve exact test ID patterns: `shopping-lists.ready.group.${group.groupKey}.totals.{metric}`
  - Values: `{visibleTotals.needed}`, `{visibleTotals.ordered}`, `{visibleTotals.received}`
  - All use default valueColor and right alignment
- **Dependencies**: Slice 1 complete
- **Testing protocol**:
  1. Refactor component to use MetricDisplay (3 instances)
  2. Run full shopping list test suite: `pnpm playwright test tests/e2e/shopping-lists/shopping-lists-detail.spec.ts`
  3. Visual change expected: labels gain muted foreground color (acceptable)
  4. If tests fail on parent component assertions, treat as blocker and investigate
  5. Visual inspection in browser to verify metrics render correctly
  6. Mark slice complete only when tests pass

  **Note**: No current Playwright tests assert directly on these metrics (verified); tests validate parent component functionality.

### Slice 3: Refactor Update Stock Dialog Metrics

- **Goal**: Replace 2 metric instances in update-stock-dialog.tsx
- **Touches**:
  - `src/components/shopping-lists/ready/update-stock-dialog.tsx` (lines 561-570)
  - Replace 2 inline metric displays with MetricDisplay components
  - Ordered metric: default valueColor, testId `shopping-lists.ready.update-stock.line.metric.ordered`
  - Received metric: conditional valueColor based on `line.hasQuantityMismatch`, testId `shopping-lists.ready.update-stock.line.metric.received`
    - `valueColor={line.hasQuantityMismatch ? 'warning' : 'default'}`
  - **Add test IDs** to match required testId prop
- **Dependencies**: Slice 2 complete
- **Testing protocol**:
  1. Refactor component to use MetricDisplay (2 instances) and add test IDs
  2. Run full shopping list test suite: `pnpm playwright test tests/e2e/shopping-lists/shopping-lists-detail.spec.ts`
  3. Visual inspection: verify warning color still applies for quantity mismatch
  4. If tests fail on parent component assertions, treat as blocker and investigate
  5. Optional: Consider adding Playwright scenario to verify warning color on Received metric when `hasQuantityMismatch` is true
  6. Mark slice complete only when tests pass

  **Note**: Added test IDs follow StatusBadge/InformationBadge pattern (required testId prop).

### Slice 4: Final Verification

- **Goal**: Full Playwright suite passes, visual review complete
- **Touches**:
  - Run `pnpm check` to verify no TypeScript errors
  - Run `pnpm playwright test` full suite as final verification
  - Manually verify metric displays in browser:
    - Shopping list ready view with seller groups
    - Update stock dialog with normal and mismatched quantities
  - Re-run comprehensive grep search for metric display patterns to verify no missed usage sites:
    - Search: `text-xs uppercase tracking-wide`
    - Search: `flex flex-col.*text-right`
    - Verify KeyValueBadge usage is distinct (not affected)
- **Dependencies**: Slices 1-3 complete
- **Testing protocol**:
  1. All tests must pass without visual assertion changes
  2. Visual changes are acceptable if: (a) test IDs unchanged, (b) content visible, (c) layout not broken
  3. Document any remaining issues or deferred coverage

---

## 15) Risks & Open Questions

### Risk: Test ID Mismatches

- **Risk**: Accidentally changing test IDs during refactor breaks Playwright specs
- **Impact**: Test failures in CI, blocking merge
- **Mitigation**: Preserve exact test ID strings from original implementations (seller group totals); run Playwright tests after each slice

### Risk: Visual Regressions

- **Risk**: Standardizing label colors causes noticeable UI differences
- **Impact**: User confusion, design team feedback
- **Mitigation**: Accept minor visual changes as documented in UX section; label muted foreground is a subtle improvement

### Risk: Incomplete Discovery

- **Risk**: Additional metric display patterns exist beyond the 5 identified instances
- **Impact**: Inconsistent UX with missed refactoring opportunities
- **Mitigation**: Final grep search in Slice 4 to catch stragglers; pattern is very specific (stacked label+value)

### Risk: Conditional Color Logic Errors

- **Risk**: Incorrectly mapping `line.hasQuantityMismatch` to valueColor prop
- **Impact**: Warning color not displayed when expected
- **Mitigation**: Visual inspection during testing; verify mismatch scenario in browser

### Risk: Number Formatting Confusion

- **Risk**: Developers expect MetricDisplay to format numbers (add commas, decimals)
- **Impact**: Inconsistent number formatting across usage sites
- **Mitigation**: Document clearly in component JSDoc that number formatting is parent's responsibility; MetricDisplay is presentation-only

### Resolved Decision: className Prop Exclusion

- **Initial approach**: Exclude className prop to enforce strict encapsulation (following StatusBadge and InformationBadge patterns)
- **Why no reconsideration needed**: MetricDisplay serves semantic metric display role; allowing className would enable CSS soup at call sites. Layout adjustments (margin, positioning) should be handled by parent containers.
- **Resolution**: **Confirm exclusion** - NO className prop in MetricDisplay. TypeScript will enforce at compile time.

### Resolved Decision: Element Types (span vs p)

- **Question**: Should MetricDisplay render label/value as `span` or `p` tags?
- **Why it matters**: seller-group-card uses `span`, update-stock-dialog uses `p`
- **Resolution**: **Use `span` tags** - More flexible for inline contexts; both label and value are `span` elements. Update-stock-dialog will standardize to spans during refactor.

### Resolved Decision: Test ID Placement

- **Question**: Should testId apply to container, label, or value element?
- **Why it matters**: Seller group metrics have test IDs on values; tests select by value element
- **Resolution**: **Apply testId to value element** - Matches existing pattern; value is the primary data point for assertions. Container and label have no independent test IDs.

---

## 16) Confidence

**Confidence: High** — Pattern is well-understood with 5 concrete usage sites identified across 2 files, TypeScript will enforce correctness, Playwright tests provide regression safety. The scope is smaller than other UI component extractions (only 2 files). All styling decisions are derived from existing implementations. Conditional color logic is straightforward (single boolean check). No business logic impact, pure UI refactoring. Visual changes are minimal and acceptable (label color standardization).

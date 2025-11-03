# Code Review: Collection Display Primitives

**Reviewer**: Claude Code
**Date**: 2025-11-03
**Plan Reference**: `docs/features/collection_display_primitives/plan.md`
**Scope**: Unstaged changes implementing 3 reusable UI component extractions

---

## 1) Summary & Decision

**Readiness**

The implementation successfully extracts three domain-agnostic UI primitives (CodeBadge, ListSectionHeader, CollectionGrid) and refactors all documented usages across 12 files. TypeScript strict mode and ESLint pass cleanly. All data-testid attributes are preserved correctly for Playwright compatibility. The components follow project patterns for style encapsulation and props-only APIs. However, **one critical interface deviation** exists: ListSectionHeader accepts ReactNode for title/description props instead of enforcing string types as specified in the plan, and adds an undocumented footer prop. This deviation enables a sophisticated seller-group-card refactoring but violates the plan contract and introduces semantic complexity (h3 elements nested inside ReactNode title). Additionally, seller-group-card misuses the actions prop by placing metric displays (non-action content) in the actions slot.

**Decision**

`GO-WITH-CONDITIONS` — The implementation is functionally correct, passes all checks, and demonstrates solid engineering. However, the ListSectionHeader interface deviation must be addressed before merge. Recommend either (1) updating the plan to document the ReactNode flexibility and footer prop as intentional design decisions, OR (2) reverting seller-group-card to use simpler title strings and moving the footer div outside ListSectionHeader. The actions prop misuse in seller-group-card should be fixed to separate metrics from action buttons.

---

## 2) Conformance to Plan (with evidence)

**Plan alignment**

- Plan Section 3 (CodeBadge interface) ↔ `src/components/ui/code-badge.tsx:1-15` — **EXACT MATCH**. Interface matches `{ code: string; testId?: string }`, renders span with `bg-muted px-2 py-1 rounded font-mono text-sm`.

- Plan Section 3 (ListSectionHeader interface) ↔ `src/components/ui/list-section-header.tsx:1-33` — **DEVIATION**. Plan specifies `title: string; description?: string` but implementation uses `title: string | React.ReactNode; description?: string | React.ReactNode` (lines 2-3). Additionally, implementation adds undocumented `footer?: React.ReactNode` prop (line 5).

- Plan Section 3 (CollectionGrid interface) ↔ `src/components/ui/collection-grid.tsx:1-17` — **EXACT MATCH**. Interface matches `{ children: React.ReactNode; breakpoint?: 'lg' | 'xl'; testId?: string }`, correctly defaults to 'xl' and applies conditional grid classes.

- Plan Section 2 (CodeBadge refactoring) ↔ 4 files refactored:
  - `src/components/parts/part-card.tsx:111` — div replaced with `<CodeBadge code={displayId} />`
  - `src/components/parts/part-inline-summary.tsx:41,57` — font-mono spans replaced with `<CodeBadge code={...} />`
  - `src/components/parts/part-details.tsx:489` — font-mono span wrapped in DescriptionItem replaced with CodeBadge

- Plan Section 2 (ListSectionHeader refactoring) ↔ 3 files refactored:
  - `src/components/shopping-lists/concept-table.tsx:62-103` — header div replaced with ListSectionHeader using string title/description
  - `src/components/kits/kit-pick-list-panel.tsx:127-146` — CardHeader replaced with ListSectionHeader using string title/description
  - `src/components/shopping-lists/ready/seller-group-card.tsx:53-125` — header div replaced with ListSectionHeader using ReactNode title/description/footer

- Plan Section 2 (CollectionGrid refactoring) ↔ 6 files, 12 usages refactored:
  - `src/components/parts/part-list.tsx:230,283` — grids replaced with `<CollectionGrid testId={...}>` (omits breakpoint, defaults to xl)
  - `src/components/shopping-lists/overview-list.tsx:355` — grid replaced with CollectionGrid (defaults to xl)
  - `src/components/kits/kit-overview-list.tsx:223` — grid replaced with CollectionGrid (defaults to xl)
  - `src/components/boxes/box-list.tsx:193,269` — grids replaced with `<CollectionGrid testId={...} />`
  - `src/components/sellers/seller-list.tsx:275,351` — grids replaced with CollectionGrid breakpoint="lg"
  - `src/components/types/type-list.tsx:313,394` — grids replaced with CollectionGrid breakpoint="lg"

- Plan Section 2 (UI index exports) ↔ `src/components/ui/index.ts:12,42,45` — All three components exported correctly

**Gaps / deviations**

- **Interface deviation**: ListSectionHeader accepts ReactNode for title/description instead of enforcing string types as documented in plan Section 3. Plan specifies:
  ```typescript
  export interface ListSectionHeaderProps {
    title: string;
    description?: string;
    actions?: React.ReactNode;
    testId?: string;
  }
  ```
  Implementation provides:
  ```typescript
  export interface ListSectionHeaderProps {
    title: string | React.ReactNode;
    description?: string | React.ReactNode;
    footer?: React.ReactNode;  // undocumented in plan
    testId?: string;
  }
  ```
  Evidence: `src/components/ui/list-section-header.tsx:2-6`

- **Plan semantic guidance ignored**: Plan Section 2 states "title: Required; will render as `<h3>` for semantic heading" but implementation conditionally renders h3 only for string titles (line 16-19). When ReactNode title is passed (seller-group-card.tsx:55-57), the h3 is nested inside the ReactNode, violating the component's semantic contract.

- **Undocumented prop usage**: seller-group-card uses footer prop (line 115-124) which is not documented in plan Section 3. This prop is implemented in list-section-header.tsx:30 but never mentioned in the plan's interface specification.

- **Actions prop misuse**: seller-group-card.tsx:71-113 places MetricDisplay components inside the actions prop. Metrics are informational displays, not actions. The actions prop should contain only interactive elements (buttons). Metrics should be part of the description or a separate metadata section.

---

## 3) Correctness — Findings (ranked)

### MAJOR — ListSectionHeader interface deviation breaks plan contract

- **Evidence**: `src/components/ui/list-section-header.tsx:2-6` — Interface accepts `title: string | React.ReactNode; description?: string | React.ReactNode; footer?: React.ReactNode` instead of plan-specified `title: string; description?: string` (no footer prop documented).
- **Impact**:
  1. Breaks documented API contract in plan Section 3, creating confusion between plan and implementation
  2. Undermines semantic heading guarantee—when ReactNode title is used, the h3 tag can be arbitrarily nested (see seller-group-card.tsx:55 where h3 is inside the passed ReactNode, not rendered by ListSectionHeader)
  3. Introduces undocumented footer prop that's only used in one location but becomes part of the public API
- **Fix**:
  **Option A (recommended)**: Update plan Section 3 to document ReactNode flexibility for title/description and add footer prop with clear usage guidelines. Add comment in list-section-header.tsx explaining that when title is ReactNode, caller must provide h3 tag for semantic correctness.
  **Option B**: Revert to string-only title/description per plan. For seller-group-card, move the custom h3+ExternalLink structure outside ListSectionHeader or use a title string + separate custom description section.
- **Confidence**: High — Plan explicitly specifies string types and h3 rendering behavior, implementation deviates without plan update.

### MAJOR — seller-group-card misuses actions prop for non-action content

- **Evidence**: `src/components/shopping-lists/ready/seller-group-card.tsx:71-113` — MetricDisplay components (Needed/Ordered/Received totals) are placed inside the actions prop, which semantically should contain only interactive elements (buttons).
- **Impact**:
  1. Violates semantic clarity of actions prop—metrics are informational, not actions
  2. Creates inconsistency with other ListSectionHeader usages (concept-table.tsx:67-101, kit-pick-list-panel.tsx:131-144) which only place buttons in actions
  3. Makes the actions slot do double-duty as both metadata display and action container
- **Fix**: Refactor seller-group-card to separate metrics from actions. Options:
  1. Move MetricDisplay components to description prop (as ReactNode containing both website link and metrics)
  2. Add metrics wrapper div before ListSectionHeader and keep actions for buttons only
  3. Use footer prop for metrics (though this changes visual layout)
- **Confidence**: High — Actions prop naming and other usages clearly indicate it should contain only buttons/controls.

### MINOR — CodeBadge adds visual change without explicit callout in verification checkpoint

- **Evidence**: `src/components/parts/part-inline-summary.tsx:41,57` — CodeBadge now renders with `bg-muted` background where previously plain `font-mono` span had no background (plan Section 12 acknowledges this as "visual improvement for consistency").
- **Impact**: User-visible styling change in shopping lists and pick lists. Part keys now have gray background badges instead of plain monospace text. This is the intended standardization per plan but should be verified visually before merge.
- **Fix**: Visual verification in development environment at parts inline summary locations (shopping list concept view, kit pick lists). Confirm bg-muted provides acceptable contrast and doesn't create visual clutter.
- **Confidence**: High — Change is intentional per plan but should be visually verified as acceptable.

### MINOR — ListSectionHeader always applies border-b, requiring wrapper div in kit-pick-list-panel

- **Evidence**: `src/components/kits/kit-pick-list-panel.tsx:126` — Wrapper div with conditional border class needed because ListSectionHeader hardcodes `border-b` in list-section-header.tsx:12, but kit panel only wants border when openPickLists.length > 0.
- **Impact**: Forces callers to wrap ListSectionHeader when conditional border is needed, adding boilerplate. The cn() conditional border wrapper in kit-pick-list-panel looks awkward.
- **Fix**: Consider adding optional `showBorder?: boolean` prop to ListSectionHeader (defaults to true) to handle this case cleanly. Alternatively, document that callers needing conditional borders should wrap the component.
- **Confidence**: Medium — This is minor boilerplate but shows the component's hardcoded border may not fit all use cases. Not blocking for this refactoring.

### MINOR — CollectionGrid testId casing inconsistency

- **Evidence**: All CollectionGrid usages pass camelCase testId values like `parts.list.container`, `boxes.list.table`, but these are then applied via data-testid which typically uses kebab-case or dot-notation. The casing is consistent with existing patterns in the codebase.
- **Impact**: None—existing tests use these selectors successfully. This is consistent with project conventions.
- **Fix**: No fix needed; noting for completeness. Project convention is dot-notation for test IDs.
- **Confidence**: Low — Not actually an issue, just documenting the pattern for future reference.

---

## 4) Over-Engineering & Refactoring Opportunities

No over-engineering detected. The implementation is appropriately minimal for the stated scope. However, one opportunity exists to reduce complexity:

### Opportunity: Simplify ListSectionHeader by removing ReactNode flexibility

- **Hotspot**: `src/components/ui/list-section-header.tsx:16-27` — Conditional rendering logic for string vs ReactNode title/description adds complexity (type checks, ternaries) for a single usage (seller-group-card).
- **Evidence**:
  ```typescript
  {typeof title === 'string' ? (
    <h3 className="text-base font-semibold text-foreground">{title}</h3>
  ) : (
    title
  )}
  ```
- **Suggested refactor**: Revert to string-only title/description per plan, simplify seller-group-card to pass string title and compose custom h3/link structure outside ListSectionHeader if needed. This eliminates 8 lines of conditional logic and restores semantic clarity.
- **Payoff**: Simpler component implementation, better semantic guarantees (always renders h3 with consistent classes), easier to maintain and understand. Aligns implementation with plan specification.

---

## 5) Style & Consistency

### Pattern: Component API consistency across UI primitives

- **Evidence**:
  - CodeBadge (`src/components/ui/code-badge.tsx:1-4`) — Props-only API, no className exposure
  - CollectionGrid (`src/components/ui/collection-grid.tsx:1-4`) — Props-only API, no className exposure
  - ListSectionHeader (`src/components/ui/list-section-header.tsx:1-6`) — Props-only API, no className exposure
  - StatusBadge (`src/components/ui/status-badge.tsx:18-27`) — Props-only API, no className exposure (explicitly documented as intentional in line 36)
  - InformationBadge (`src/components/ui/information-badge.tsx:10-21`) — Props-only API, no className exposure (explicitly documented as intentional in line 30)
- **Impact**: All three new components correctly follow the project's style encapsulation pattern. No className props, consistent with existing UI primitives.
- **Recommendation**: No action needed; this is exemplary consistency. Continue this pattern for all future UI components.

### Pattern: Test instrumentation consistency

- **Evidence**: All three components accept optional `testId?: string` prop and apply it via `data-testid={testId}` when provided. This matches the pattern in existing components (StatusBadge line 63, InformationBadge line 82).
- **Impact**: Maintains test instrumentation consistency across the UI library. Playwright specs can reliably target components.
- **Recommendation**: No action needed; pattern correctly applied.

### Pattern: React.forwardRef omission

- **Evidence**:
  - New components (CodeBadge, ListSectionHeader, CollectionGrid) do NOT use React.forwardRef
  - Existing badge components (StatusBadge line 53, InformationBadge line 64) DO use React.forwardRef with displayName
- **Impact**: Minor inconsistency in component implementation patterns. If refs are never needed for these components, omitting forwardRef is fine. However, consistency suggests all UI primitives should use the same pattern for predictability.
- **Recommendation**: Low priority. Consider adding React.forwardRef to new components for consistency with StatusBadge/InformationBadge patterns, OR document in component comments why forwardRef is intentionally omitted (e.g., "Layout container with no ref use cases").

---

## 6) Tests & Deterministic Coverage (new/changed behavior only)

**Surface**: Parts list grid layout

- **Scenarios**:
  - Given parts overview page loaded, When parts displayed, Then grid container renders with `data-testid="parts.list.container"` — **PRESERVED** (`src/components/parts/part-list.tsx:283`)
  - Given parts loading state, When skeletons rendered, Then grid container renders with `data-testid="parts.list.loading"` — **PRESERVED** (`src/components/parts/part-list.tsx:230`)
- **Hooks**: Existing Playwright selectors `parts.list.container`, `parts.list.loading` remain valid. CollectionGrid passes testId through correctly.
- **Gaps**: None. Refactoring preserves all existing test instrumentation.
- **Evidence**: `src/components/parts/part-list.tsx:230,283`, existing Playwright specs should pass without modification per plan Section 13.

**Surface**: Shopping lists overview grid

- **Scenarios**:
  - Given shopping lists page loaded with active tab, When lists displayed, Then grid renders with `data-testid="shopping-lists.overview.grid.concept"` — **PRESERVED** (`src/components/shopping-lists/overview-list.tsx:355`)
- **Hooks**: Template literal testId correctly applied: `` testId={`shopping-lists.overview.grid.${activeTab}`} ``
- **Gaps**: None. Existing selectors remain valid.
- **Evidence**: `src/components/shopping-lists/overview-list.tsx:355`

**Surface**: Kits overview grid

- **Scenarios**:
  - Given kits page loaded with status filter, When kits displayed, Then grid renders with `data-testid="kits.overview.grid.active"` — **PRESERVED** (`src/components/kits/kit-overview-list.tsx:223`)
- **Hooks**: Template literal testId correctly applied: `` testId={`kits.overview.grid.${status}`} ``
- **Gaps**: None.
- **Evidence**: `src/components/kits/kit-overview-list.tsx:223`

**Surface**: Boxes/Sellers/Types grids with lg breakpoint

- **Scenarios**:
  - Given boxes list loaded, When boxes displayed, Then grid renders with `data-testid="boxes.list.table"` using lg breakpoint — **CORRECT** (`src/components/boxes/box-list.tsx:269`)
  - Given boxes loading state, Then grid renders with `data-testid="boxes.list.loading"` using lg breakpoint — **CORRECT** (`src/components/boxes/box-list.tsx:193`)
  - Similar patterns for sellers (`sellers.list.table`, `sellers.list.loading`) and types (`types.list.container`, `types.list.loading`)
- **Hooks**: All usages correctly pass `breakpoint="lg"` to match plan's documented breakpoint difference
- **Gaps**: None. Breakpoint behavior correctly preserved.
- **Evidence**: `src/components/boxes/box-list.tsx:193,269`, `src/components/sellers/seller-list.tsx:275,351`, `src/components/types/type-list.tsx:313,394`

**Surface**: CodeBadge visual styling in part displays

- **Scenarios**:
  - Given part card rendered, When part ID displayed, Then CodeBadge renders with monospace font and muted background — **NEW VISUAL** (`src/components/parts/part-card.tsx:111`)
  - Given part inline summary, When part key displayed, Then CodeBadge renders with background instead of plain monospace — **VISUAL CHANGE** (`src/components/parts/part-inline-summary.tsx:41,57`)
- **Hooks**: No automated test coverage for CodeBadge styling. Visual verification required in development.
- **Gaps**: No test instrumentation for CodeBadge itself (no testId passed at call sites). Acceptable for this refactoring—tests target parent containers (part cards, part rows), not individual badge styling.
- **Evidence**: Plan Section 13 acknowledges "No automated test for CodeBadge styling; acceptable for this refactoring"

**Surface**: ListSectionHeader structural changes

- **Scenarios**:
  - Given concept table rendered, When header displayed, Then ListSectionHeader renders with "Concept lines" title, description, and action buttons — **PRESERVED** (`src/components/shopping-lists/concept-table.tsx:62-103`)
  - Given seller group card, When header displayed, Then ListSectionHeader renders seller name, website, metrics, and actions — **PRESERVED** (`src/components/shopping-lists/ready/seller-group-card.tsx:53-125`)
  - Given kit pick lists panel, When header displayed, Then ListSectionHeader renders title, description, and "Add Pick List" button — **PRESERVED** (`src/components/kits/kit-pick-list-panel.tsx:127-146`)
- **Hooks**: Existing data-testid attributes on nested elements (buttons, metrics) remain valid. No testId passed to ListSectionHeader itself in any usage.
- **Gaps**: None. Existing Playwright specs target child elements (buttons, metrics) which are preserved in the actions/description slots.
- **Evidence**: All three refactored usages maintain exact data-testid attributes on interactive elements.

**Overall test coverage assessment**: The refactoring perfectly preserves all existing test instrumentation. Zero Playwright test changes required per plan Section 13. All data-testid attributes are correctly passed through component props and rendered in the DOM. Verification checkpoint confirms 40 Playwright tests passing without modification.

---

## 7) Adversarial Sweep

### Check 1: Missing testId thread-through in CollectionGrid

- **Attack**: What if CollectionGrid conditionally renders different elements based on breakpoint, causing testId to be dropped in certain paths?
- **Evidence**: `src/components/ui/collection-grid.tsx:7-16` — Single code path returns one div with `data-testid={testId}`. No conditional rendering of wrapper elements. The className is selected via ternary (line 8-10) but the div structure is identical for both breakpoints.
- **Why code held up**: Simple conditional className selection with single return statement guarantees testId is always applied if provided. No branching in JSX structure.

### Check 2: ListSectionHeader ReactNode title breaks semantic heading guarantee

- **Attack**: When seller-group-card passes an h3 element as the title ReactNode, ListSectionHeader renders it directly without wrapping in another h3. This creates the semantic heading but bypasses ListSectionHeader's consistent h3 classes (`text-base font-semibold text-foreground`). The caller must remember to apply these classes.
- **Evidence**: `src/components/ui/list-section-header.tsx:18-19` renders title ReactNode directly. `src/components/shopping-lists/ready/seller-group-card.tsx:55-57` passes custom h3 with `text-lg font-semibold` (different from ListSectionHeader's standard text-base).
- **Why this is a problem**: Breaks style encapsulation—caller must know internal styling classes to maintain consistency. Undermines the component's purpose of centralizing header styling.
- **Severity**: Already flagged as MAJOR finding in Section 3. This adversarial check confirms the architectural concern.

### Check 3: Actions prop ReactNode type allows non-interactive content

- **Attack**: ListSectionHeader actions prop type is `React.ReactNode`, allowing any content (text, divs, metrics) not just buttons. This enabled seller-group-card to place MetricDisplay components (non-interactive) in actions slot, violating semantic intent.
- **Evidence**: `src/components/ui/list-section-header.tsx:4` — `actions?: React.ReactNode` with no constraints. `src/components/shopping-lists/ready/seller-group-card.tsx:72-87` passes three MetricDisplay components inside actions.
- **Why this is a problem**: Type system doesn't enforce semantic correctness. Future developers might place any content in actions, diluting its meaning as an "action buttons" slot.
- **Mitigation**: Already flagged as MAJOR finding. Could strengthen type to `actions?: React.ReactElement<ButtonProps>[]` but this may be too restrictive for grouped button containers. Better fix is clear documentation and correcting the misuse in seller-group-card.

### Check 4: CodeBadge empty string rendering

- **Attack**: What happens if CodeBadge receives empty string for code prop? Does it render an empty styled span that takes up layout space?
- **Evidence**: `src/components/ui/code-badge.tsx:8-11` — Renders span with padding/background regardless of code content. Empty string would produce visible empty badge.
- **Why this is acceptable**: TypeScript enforces string type but not emptiness validation. Empty strings are edge cases that should be validated by callers (formatPartForDisplay, etc.). Component rendering empty span is correct fallback behavior—no crash, just empty styled element. Low risk.

### Check 5: CollectionGrid breakpoint default may cause confusion

- **Attack**: CollectionGrid defaults to 'xl' breakpoint but 3 files (boxes/sellers/types) need 'lg'. What if developer forgets to specify breakpoint="lg" when adding new collection?
- **Evidence**: Plan Section 0 documents the breakpoint inconsistency as a research finding. Default 'xl' is chosen because parts/shopping-lists/kits are more common use cases. `src/components/ui/collection-grid.tsx:7` defaults to xl.
- **Why this is acceptable**: Plan intentionally chose xl as default based on usage frequency (3 files use xl vs 3 files use lg). JSDoc comment should explain the breakpoint semantic (xl for larger collections, lg for denser layouts). Risk of forgetting breakpoint="lg" is low because TypeScript will compile successfully but visual regression would be caught in development/review.
- **Mitigation**: Add JSDoc comment to CollectionGrid explaining when to use lg vs xl breakpoint, with examples.

### Check 6: ListSectionHeader footer prop layout shift risk

- **Attack**: The footer prop uses `w-full` class (line 30), forcing footer content to new line. What if this creates unexpected layout shifts or breaks responsive behavior on narrow screens?
- **Evidence**: `src/components/ui/list-section-header.tsx:30` — `<div className="w-full">{footer}</div>`. Used only in seller-group-card.tsx:115-124 to show filter note.
- **Why this is acceptable**: The w-full class is intentional—footer content (filter note) should span full width below title/actions. The parent flex container has `flex-wrap` (line 12), so footer naturally wraps to new line. This is correct flexbox behavior for full-width footer rows.
- **Concern**: Footer prop is undocumented in plan but implemented. Should be documented if this pattern is intentional for future use.

---

## 8) Invariants Checklist

### Invariant: CollectionGrid breakpoint determines 3-column activation at lg (1024px) or xl (1280px)

- **Where enforced**: `src/components/ui/collection-grid.tsx:8-10` — Conditional className selection based on breakpoint prop. Tailwind's lg and xl breakpoint classes enforce the pixel thresholds.
- **Failure mode**: If breakpoint prop is changed on a usage (e.g., boxes switched from lg to xl), responsive layout would shift 3-column layout from 1024px to 1280px. Boxes list would use 2 columns in the 1024-1279px viewport range instead of 3.
- **Protection**: TypeScript enforces breakpoint prop as `'lg' | 'xl'` literal union (line 3). Plan documents which files use which breakpoint in Section 2. Visual regression testing in development would catch layout changes.
- **Evidence**: `src/components/boxes/box-list.tsx:193,269` correctly pass `breakpoint="lg"` per plan specifications.

### Invariant: All data-testid attributes preserved exactly during refactoring

- **Where enforced**: Code review verification (this document, Section 6). Each refactored usage thread-through testId props to new components which render data-testid attributes in DOM.
- **Failure mode**: If testId prop was not passed to new component, or component failed to render data-testid, Playwright selectors would break. Existing tests would fail immediately.
- **Protection**: TypeScript compilation doesn't enforce testId (optional prop). Protection comes from manual code review and running existing Playwright specs. Plan Section 13 requires verification that all specs pass without modification.
- **Evidence**: All 12 CollectionGrid usages correctly pass testId prop. Verification checkpoint confirms 40 Playwright tests passing.

### Invariant: ListSectionHeader always renders h3 for semantic heading (string title case only)

- **Where enforced**: `src/components/ui/list-section-header.tsx:16-17` — When title is string, explicitly render h3 with standardized classes.
- **Failure mode**: When caller passes ReactNode title (seller-group-card), the invariant is bypassed. Caller is responsible for providing semantic h3 tag. If caller passes div or span, semantic heading is lost.
- **Protection**: Limited. Code review must verify ReactNode title usages include proper h3 tags. No runtime enforcement.
- **Evidence**: **BROKEN** in seller-group-card.tsx:55-57 — h3 is provided by caller with different styling (text-lg vs text-base), breaking style consistency aspect of invariant. Semantic h3 exists but styling diverges from component's standard.

### Invariant: CodeBadge always renders with inline-block display and muted background

- **Where enforced**: `src/components/ui/code-badge.tsx:9` — Hardcoded className with inline-block, bg-muted, px-2, py-1, rounded, font-mono, text-sm.
- **Failure mode**: No failure mode—component never accepts className prop. Styling is immutable (barring Tailwind config changes).
- **Protection**: Props-only API with no className exposure guarantees styling consistency per project standards.
- **Evidence**: All 4 CodeBadge usages render with identical styling. Visual standardization achieved per plan Section 12.

---

## 9) Questions / Needs-Info

### Question: Was ListSectionHeader ReactNode flexibility an intentional design decision?

- **Why it matters**: Plan Section 3 specifies string-only title/description props. Implementation accepts ReactNode. This could be (1) intentional enhancement during implementation or (2) scope creep to accommodate seller-group-card without updating the plan.
- **Desired answer**: Clear statement from implementer: "ReactNode flexibility was intentional to support seller-group-card's custom h3+link structure, plan should be updated" OR "This was scope creep, seller-group-card should be simplified to match plan specification."

### Question: Is the footer prop intended as a public API for ListSectionHeader?

- **Why it matters**: Footer prop is implemented and used in one location (seller-group-card filter note) but never documented in plan Section 3. If this is an intentional feature, it should be documented with usage guidelines. If it's a one-off hack, it should be removed and the filter note should be rendered outside ListSectionHeader.
- **Desired answer**: Either (1) add footer prop to plan Section 3 with usage documentation, OR (2) remove footer prop and refactor seller-group-card to render filter note as a separate element after ListSectionHeader.

### Question: Should metrics in seller-group-card be moved out of actions prop?

- **Why it matters**: Actions prop semantically should contain only interactive elements (buttons). Placing MetricDisplay components in actions violates this semantic contract and creates inconsistency with other ListSectionHeader usages (concept-table, kit-pick-list-panel) which only place buttons in actions.
- **Desired answer**: Confirm metrics should be moved to description (as ReactNode) or separate metadata section, keeping actions for buttons only. This would restore semantic clarity to the actions slot.

---

## 10) Risks & Mitigations (top 3)

### Risk: Plan-implementation mismatch creates documentation debt

- **Evidence**: ListSectionHeader interface deviation documented in Section 2 (Gaps/deviations). Plan specifies string props, implementation accepts ReactNode. Footer prop undocumented in plan.
- **Mitigation**: Before merge, either (1) update plan Section 3 to match implementation with clear documentation of ReactNode use cases and footer prop, OR (2) simplify implementation to match plan by restricting to string props and removing footer. Choose option that best serves future maintainability—ReactNode flexibility may be valuable if documented properly.

### Risk: seller-group-card h3 styling divergence breaks style encapsulation pattern

- **Evidence**: Seller-group-card passes custom h3 with text-lg (line 55) instead of using ListSectionHeader's standard text-base. This breaks the component's style encapsulation purpose.
- **Mitigation**: Add size variant prop to ListSectionHeader (e.g., `size?: 'default' | 'large'`) to allow h3 font size customization while keeping styling centralized. Apply size='large' in seller-group-card to achieve text-lg heading without bypassing component's styling. Alternative: Document that seller headers intentionally use larger text and accept the styling divergence as domain-specific requirement.

### Risk: Undocumented ReactNode patterns increase cognitive load for future developers

- **Evidence**: ListSectionHeader's conditional title/description rendering (typeof checks, ternaries) adds complexity. Developers must understand when to pass string vs ReactNode and what semantic guarantees exist for each case.
- **Mitigation**: Add comprehensive JSDoc comments to ListSectionHeader explaining:
  1. String title: Component renders h3 with standardized styling
  2. ReactNode title: Caller must provide semantic h3 tag with appropriate classes
  3. Footer prop: When to use (full-width content below actions), with example
  Include usage examples for both string and ReactNode patterns. This documentation should also be added to plan Section 3.

---

## 11) Confidence

**Confidence: High** — The implementation is technically sound, passes all checks (TypeScript strict mode, ESLint, 40 Playwright tests), correctly preserves test instrumentation, and successfully extracts three reusable UI primitives with style encapsulation. The code demonstrates solid understanding of React patterns, project conventions, and careful attention to preserving existing behavior. The identified issues are architectural (plan-implementation alignment, semantic clarity) rather than functional bugs. The GO-WITH-CONDITIONS verdict reflects the need to resolve plan documentation and refactor seller-group-card's ListSectionHeader usage for semantic correctness, not concerns about implementation quality. With minor adjustments to align plan and implementation or simplify the seller-group-card refactoring, this work is production-ready.

# Code Review: MembershipTooltipContent Component Extraction

**Reviewer**: Claude Code
**Date**: 2025-11-03
**Revision**: Unstaged changes in working directory
**Plan**: `/work/frontend/docs/features/membership_tooltip_content/plan.md`

---

## 1) Summary & Decision

**Readiness**

This implementation successfully extracts a reusable MembershipTooltipContent component from four duplicated tooltip render functions across kit-card and part-card components. The component API is well-designed, type-safe, and follows project conventions. Breaking changes (removal of className props from MembershipIndicator) were executed correctly with TypeScript enforcement. All existing tests pass, and new test coverage was added for part card tooltips. The implementation achieves the stated goals of eliminating duplication while standardizing visual consistency across membership tooltips.

**Decision**

`GO` — Implementation is complete, correct, and ready to merge. All plan commitments are fulfilled, tests are green, TypeScript strict mode passes, and the refactoring successfully eliminates the targeted technical debt without introducing regressions.

---

## 2) Conformance to Plan (with evidence)

**Plan alignment**

- **"Create MembershipTooltipContent component"** ↔ `src/components/ui/membership-tooltip-content.tsx:1-77` — New component implemented with full API surface:
  ```typescript
  export interface MembershipTooltipContentItem {
    id: string | number;
    label: string;
    statusBadge: ReactNode;
    link?: { to: string; params?: Record<string, string>; search?: Record<string, unknown> };
    metadata?: ReactNode[];
  }
  ```

- **"Remove className props from MembershipIndicator"** ↔ `src/components/ui/membership-indicator.tsx:14-36,47-88` — All three className props removed:
  - Line 14-22: Props interface no longer accepts `tooltipClassName`, `iconWrapperClassName`, or `containerClassName`
  - Line 76: Hard-coded tooltip width to `w-72`
  - Line 87: Hard-coded icon wrapper styling (removed `cn()` utility and conditional classes)

- **"Refactor kit-card tooltip functions"** ↔ `src/components/kits/kit-card.tsx:174-274` — Both `renderKitShoppingTooltip` and `renderKitPickTooltip` refactored:
  - Lines 174-220: Shopping tooltip now maps memberships to `MembershipTooltipContentItem[]` and renders via new component
  - Lines 232-274: Pick tooltip follows same pattern (no link property for pick lists)
  - Lines 97,111: Removed className prop usages from MembershipIndicator call sites

- **"Refactor part-card tooltip functions"** ↔ `src/components/parts/part-card.tsx:184-262` — Both `renderPartShoppingTooltip` and `renderPartKitTooltip` refactored:
  - Lines 184-209: Shopping tooltip simplified to mapping pattern
  - Lines 233-262: Kit tooltip includes metadata (quantities per kit, reservations)

- **"Add part card tooltip tests"** ↔ `tests/e2e/parts/part-list.spec.ts:122-176` — New test scenario covers both shopping list and kit membership tooltips:
  - Lines 122-176: Creates part with both shopping list and kit memberships, verifies tooltip content after hover
  - Test validates shopping list name, status badge text, kit name, and metadata text ("per kit", "reserved")

- **"Update exports"** ↔ `src/components/ui/index.ts:46-52` — New component and types exported from UI barrel file

**Gaps / deviations**

None identified. Implementation matches plan commitments precisely. All six implementation slices from the plan were executed.

---

## 3) Correctness — Findings (ranked)

**No correctness issues identified.** Implementation is sound with proper error handling, type safety, and adherence to React patterns.

---

## 4) Over-Engineering & Refactoring Opportunities

**No over-engineering detected.** The component abstraction is justified by the elimination of 200+ lines of duplicated code across four functions. The API surface is minimal and domain-appropriate.

---

## 5) Style & Consistency

All styling and patterns conform to project conventions:

- **Standardized spacing**: `space-y-2` for list items, `space-y-1` for item content (lines 43, 45 of membership-tooltip-content.tsx)
- **Standardized text sizing**: `text-xs` for metadata rows (line 67 of membership-tooltip-content.tsx)
- **Consistent empty state pattern**: Muted paragraph with configurable message (lines 31-36 of membership-tooltip-content.tsx)
- **TanStack Router Link integration**: Proper use of `to`, `params`, `search` props (lines 48-53 of membership-tooltip-content.tsx)
- **Event propagation handling**: `onClick={(event) => event.stopPropagation()}` on links to prevent card click-through (line 53)

**Visual consistency achieved**: Tooltip width standardized to `w-72` across all membership indicators (part cards now use wider tooltips, consistent with kit cards). This is an intentional standardization trade-off per plan.

---

## 6) Tests & Deterministic Coverage (new/changed behavior only)

**Surface**: Part card membership tooltips

**Scenarios**:
- **Shopping list tooltip**: Given part on active shopping list, When user hovers over shopping cart icon, Then tooltip shows list name and status badge (`tests/e2e/parts/part-list.spec.ts:138-143`)
- **Kit membership tooltip**: Given part used in kit, When user hovers over circuit board icon, Then tooltip shows kit name, status badge, and metadata ("per kit", "reserved") (`tests/e2e/parts/part-list.spec.ts:150-157`)
- **Sequential hover behavior**: Mouse moved away from first tooltip before hovering second to avoid z-index conflicts (`tests/e2e/parts/part-list.spec.ts:146-147`)

**Hooks**:
- Page object methods: `parts.shoppingListIndicator(partKey)`, `parts.shoppingListIndicatorTooltip()`, `parts.kitIndicator(partKey)`, `parts.kitIndicatorTooltip()` (defined in `tests/support/page-objects/parts-page.ts:275-299`)
- Tooltip testIds: `parts.list.card.shopping-list-indicator.tooltip`, `parts.list.card.kit-indicator.tooltip`
- Backend API calls: Creates shopping list membership and kit content via testData factories

**Gaps**: None. Coverage is complete for new behavior. Existing kit card tests continue to validate tooltip content after refactoring (`tests/e2e/kits/kits-overview.spec.ts:8-159` — confirmed passing).

**Evidence**: All tests pass locally:
- `tests/e2e/parts/part-list.spec.ts` — 6/6 passed (including new tooltip test)
- `tests/e2e/kits/kits-overview.spec.ts` — 4/4 passed (no regressions)

---

## 7) Adversarial Sweep (must attempt ≥3 credible failures or justify none)

**Checks attempted**:

1. **Empty membership arrays**: Verified component renders empty message when `items.length === 0` (lines 31-36 of membership-tooltip-content.tsx). All four refactored functions correctly pass `emptyMessage` prop. No risk of runtime error or blank tooltip.

2. **Missing link property (pick lists)**: Verified component handles optional `link` field via conditional render (lines 47-63 of membership-tooltip-content.tsx). Pick list items render without link (plain div with label and badge). No navigation error when users interact with non-linked items.

3. **Empty or missing metadata arrays**: Verified conditional render checks `item.metadata && item.metadata.length > 0` before rendering metadata row (lines 66-70 of membership-tooltip-content.tsx). Shopping list memberships with no metadata skip metadata row entirely. No empty div or layout shift.

4. **React key prop stability**: Each item keyed by `item.id` (line 44), which maps to `membership.id` / `membership.listId` / `kit.kitId` in refactored functions. IDs are stable database identifiers, not array indices. No React reconciliation warnings.

5. **Click propagation to card**: All Link components include `onClick={(event) => event.stopPropagation()}` (line 53). Users can click tooltip links without triggering parent card navigation. MembershipIndicator already stops propagation at indicator level (lines 88-89 of membership-indicator.tsx). Double protection prevents accidental card clicks.

**Why code held up**:
- Component is stateless and side-effect-free (pure render function)
- TypeScript enforces required fields (`id`, `label`, `statusBadge`) at call sites
- Optional fields (`link`, `metadata`) have explicit undefined checks
- No async operations, query cache dependencies, or effect cleanup needed
- Parent component (MembershipIndicator) handles all loading/error states before calling `renderTooltip`

---

## 8) Invariants Checklist (table)

**Invariant**: Empty state and item list are mutually exclusive

- **Where enforced**: `src/components/ui/membership-tooltip-content.tsx:31-75` — Conditional render on `items.length === 0`
- **Failure mode**: If both branches rendered, tooltip would show "No items" message followed by list of items (visual bug)
- **Protection**: Early return in empty case prevents list render path (lines 31-36)
- **Evidence**: Test coverage validates both empty and populated states; no overlap possible

**Invariant**: Status badge is always a valid ReactNode

- **Where enforced**: TypeScript type constraint in `MembershipTooltipContentItem` interface (line 8), call sites in kit-card.tsx and part-card.tsx construct badge components
- **Failure mode**: If statusBadge were undefined/null, React would render empty space or throw during reconciliation
- **Protection**: TypeScript `ReactNode` type is non-optional; all call sites pass instantiated StatusBadge or Badge components
- **Evidence**: Lines 205-213 (kit-card.tsx), lines 192-196 (part-card.tsx), lines 240-244 (part-card.tsx) — all construct badge JSX before passing to component

**Invariant**: Link items render as interactive links, non-link items render as plain text

- **Where enforced**: `src/components/ui/membership-tooltip-content.tsx:47-63` — Conditional render based on `item.link` presence
- **Failure mode**: If link logic inverted, users would lose navigation affordance for shopping lists/kits, or pick lists would render broken links
- **Protection**: TypeScript optional field (`link?: {...}`) + explicit check in JSX
- **Evidence**: Kit pick lists omit `link` property (kit-card.tsx:255-269), shopping lists and kit memberships provide `link` (kit-card.tsx:207-211, part-card.tsx:197-200, part-card.tsx:246-249)

**Invariant**: Tooltip width is consistent across all membership indicators

- **Where enforced**: `src/components/ui/membership-indicator.tsx:76` — Hard-coded `w-72` className
- **Failure mode**: If width were configurable or inconsistent, tooltips would have varying widths based on call site, breaking visual consistency
- **Protection**: Removal of `tooltipClassName` prop prevents call sites from overriding width; TypeScript enforces interface contract
- **Evidence**: No `tooltipClassName` usages remain in codebase (grep confirmed); all tooltips now render at uniform width

---

## 9) Questions / Needs-Info

None. Implementation is clear and complete.

---

## 10) Risks & Mitigations (top 3)

**Risk**: Hard-coded `w-72` tooltip width may cause content wrapping or overflow in edge cases with very long membership names

- **Mitigation**: Existing truncation classes (`truncate` on labels, line 55/60 of membership-tooltip-content.tsx) prevent overflow. If wrapping becomes an issue in production, increase width in single location (membership-indicator.tsx:76) rather than re-introducing configurable prop.
- **Evidence**: Plan documents this as accepted trade-off (plan.md:539-541); `w-72` chosen to accommodate most complex content (kit cards with reservations metadata)

**Risk**: Standardization from `space-y-1` to `space-y-2` may make tooltips taller than comfortable on small viewports

- **Mitigation**: Visual regression during review or staging deployment would reveal issues. Revert to `space-y-1` if user feedback indicates excessive height. Current implementation matches most common pattern.
- **Evidence**: Plan.md:556-557 acknowledges this risk; `space-y-2` was chosen as default with escape hatch if problematic

**Risk**: Breaking change (className prop removal) could break external integrations or future feature branches

- **Mitigation**: TypeScript compilation enforces removal at all call sites. Grep confirms no remaining usages. Feature branches merging after this change will receive clear TypeScript errors pointing to removed props.
- **Evidence**: `pnpm check` passes (TypeScript strict mode); grep for `tooltipClassName|iconWrapperClassName|containerClassName` returns zero matches in `.ts` / `.tsx` files

---

## 11) Confidence

**Confidence**: High — Component API is well-scoped, implementation eliminates 200+ lines of duplication, all tests pass (including new part card tooltip coverage), TypeScript enforces breaking changes correctly, and adversarial sweep found no credible failure modes. Refactoring achieves stated goals without introducing maintenance burden or correctness risks.

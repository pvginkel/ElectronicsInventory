# Section Heading Component Extraction — Implementation Plan

## 0) Research Log & Findings

**Discovery Work Performed:**

1. **Comprehensive Pattern Search**: Executed `grep -rn "text-xs.*font-medium|font-medium.*text-xs|text-sm.*font-medium|font-medium.*text-sm" src/components/` to find all font-medium heading patterns
2. **Manual Review**: Examined each result to identify section headings (labels introducing content) vs. other uses (data labels, UI component internals, interactive elements)
3. **Instance Categorization**: Created detailed inventory with inclusion/exclusion decisions
4. **Playwright Test Verification**: Executed `grep -r "className.*text-(xs|sm).*font-medium|font-medium.*text-(xs|sm)" tests/e2e/` → **No results** confirming no tests assert on heading className values
5. **Reviewed Recent Component Patterns**: Examined recently factored components (Skeleton, InlineNotification, DescriptionList) to understand:
   - NO className props (enforcement of consistency)
   - Variant-based styling with clear semantic meaning
   - testId props for Playwright targeting
   - Comprehensive JSDoc documentation
   - React.forwardRef pattern for ref forwarding

**Complete Instance Inventory:**

| File | Line | Pattern | Text/Context | Include? | Rationale |
|------|------|---------|--------------|----------|-----------|
| part-details.tsx | 504 | `mb-2 text-xs font-medium text-muted-foreground` | "Manufacturer Information" | ✅ Yes | Subsection heading introducing manufacturer details |
| part-details.tsx | 531 | `mb-2 text-xs font-medium text-muted-foreground` | "Seller Information" | ✅ Yes | Subsection heading introducing seller details |
| part-details.tsx | 563 | `text-sm font-medium` | "Tags" | ❌ No | No bottom margin; uses inverse spacing pattern (mt-1 on child div). Incompatible with component's bottom-margin variants. Preserve inline. |
| part-details.tsx | 597 | `mb-3 text-sm font-medium` | "Technical Specifications" | ✅ Yes | Section heading; use `section` variant to preserve mb-3 |
| part-details.tsx | 605 | `mb-2 text-xs font-medium text-muted-foreground` | "Physical" | ✅ Yes | Subsection heading within technical specs |
| part-details.tsx | 657 | `mb-2 text-xs font-medium text-muted-foreground` | "Electrical / Technical" | ✅ Yes | Subsection heading within technical specs |
| part-card.tsx | 187 | `mb-2 text-xs font-medium text-muted-foreground` | "On shopping lists" | ✅ Yes | Tooltip subsection heading |
| part-card.tsx | 241 | `mb-2 text-xs font-medium text-muted-foreground` | "Used in kits" | ✅ Yes | Tooltip subsection heading |
| kit-card.tsx | 178 | `mb-2 text-xs font-medium text-muted-foreground` | "Linked shopping lists" | ✅ Yes | Tooltip subsection heading |
| kit-card.tsx | 233 | `mb-2 text-xs font-medium text-muted-foreground` | "Open pick lists" | ✅ Yes | Tooltip subsection heading |
| kit-bom-table.tsx | 247 | `mb-2 flex items-center gap-2 text-sm font-medium` | "X active reservations" + AlertTriangle icon | ❌ No | Combines heading semantics with flex layout + icon positioning. Flex layout essential for icon; incompatible with no-className constraint. Preserve inline or extract separate TooltipHeading component if pattern recurs. |

**Final Count**: 9 instances to refactor, 2 instances explicitly excluded with documented rationale.

**Key Findings:**
- 8 instances use subsection pattern (`mb-2 text-xs font-medium text-muted-foreground`)
- 1 instance uses section pattern (`mb-3 text-sm font-medium`)
- 2 instances require special handling and are excluded from this refactoring
- All instances are static text labels introducing content sections below them
- No interactive behavior or dynamic styling required
- Playwright tests verified safe (no className-based selectors for headings)
- Component will replace inline div/p elements with repetitive className strings

## 1) Intent & Scope

**User intent**

Extract the section heading pattern (`mb-2 text-xs font-medium text-muted-foreground` and variants) from domain components into a reusable `SectionHeading` UI component in `src/components/ui/`. This eliminates technical debt by consolidating repetitive styling patterns, ensures visual consistency, and follows the established pattern of extracting UI primitives without className escape hatches.

**Prompt quotes**

"Identify all current usages of this pattern in the codebase"
"Specify the component API (props, variants, etc.) WITHOUT a className prop"
"Plan to REMOVE className props from any domain-specific wrappers completely (not deprecate, REMOVE)"
"Standardize on common spacing/sizing even if some instances differ slightly"

**In scope**

- Create `SectionHeading` component in `src/components/ui/section-heading.tsx`
- Define two variants: `subsection` (default, text-xs) and `section` (text-sm)
- Export from `src/components/ui/index.ts`
- Replace all 9 identified instances across part-details.tsx, part-card.tsx, kit-card.tsx
- Add comprehensive JSDoc documentation
- Ensure testId prop support for Playwright targeting
- Accept minor visual standardization differences (e.g., standardizing mb-2 vs mb-3)

**Out of scope**

- Creating additional heading levels beyond subsection/section
- Adding className prop or styling escape hatches
- Backward compatibility layers or deprecation warnings
- Modifying Card, CardHeader, or CardTitle components (those serve different purposes)
- Creating domain-specific heading wrappers

**Assumptions / constraints**

- Visual standardization trade-offs are acceptable (preserving mb-3 for "Technical Specifications", standardizing rest to mb-2)
- No Playwright tests assert on specific className values of heading elements (verified via grep search of tests/e2e/)
- Semantic HTML: Using `<div>` elements is acceptable for this refactoring. While WCAG 2.1 best practices recommend semantic heading elements (h1-h6) for document structure, this project does not currently have established heading hierarchy patterns. All existing usages use `<div>` or `<p>` elements. The component maintains current behavior (no regression). Future enhancement tracked in Open Questions: add `as` prop to support semantic heading levels when project implements site-wide heading structure audit.
- All usages are non-interactive labels introducing content sections
- Component will use React.forwardRef pattern for consistency with other UI primitives
- No special handling needed for dynamic content (all current usages are static strings)

## 2) Affected Areas & File Map

### New Files

- **Area**: `src/components/ui/section-heading.tsx`
  - **Why**: New UI primitive component encapsulating section heading styles
  - **Evidence**: Pattern identified in grep results showing 9 repetitive instances

- **Area**: Test file (if needed based on UI component testing patterns)
  - **Why**: Unit tests for variant rendering and prop forwarding
  - **Evidence**: Other UI components may have corresponding test files

### Modified Files

- **Area**: `src/components/ui/index.ts`
  - **Why**: Export SectionHeading for centralized UI component access
  - **Evidence**: part-details.tsx:19 shows imports from `@/components/ui`

- **Area**: `src/components/parts/part-details.tsx`
  - **Why**: Replace 5 inline heading div elements with SectionHeading component
  - **Evidence**:
    - Line 504-506: "Manufacturer Information" subsection heading
    - Line 531-533: "Seller Information" subsection heading
    - Line 597: "Technical Specifications" section heading (larger, uses `section` variant)
    - Line 605-607: "Physical" subsection heading
    - Line 657-659: "Electrical / Technical" subsection heading
  - **Note**: Tags heading at line 563 is explicitly excluded (see Research Log for rationale)

- **Area**: `src/components/parts/part-card.tsx`
  - **Why**: Replace 2 inline p elements in tooltip rendering functions
  - **Evidence**:
    - Line 187: "On shopping lists" subsection heading in renderPartShoppingTooltip
    - Line 241: "Used in kits" subsection heading in renderPartKitTooltip

- **Area**: `src/components/kits/kit-card.tsx`
  - **Why**: Replace 2 inline p elements in tooltip rendering functions
  - **Evidence**:
    - Line 178: "Linked shopping lists" subsection heading in renderKitShoppingTooltip
    - Line 233: "Open pick lists" subsection heading in renderKitPickTooltip

### Potentially Affected Files (Playwright Tests)

- **Area**: `tests/e2e/parts/part-crud.spec.ts` or similar part detail tests
  - **Why**: May assert on content within part details sections
  - **Evidence**: part-details.tsx has extensive test instrumentation (lines 174-219)

- **Area**: `tests/e2e/kits/kit-detail.spec.ts` or `tests/e2e/kits/kits-overview.spec.ts`
  - **Why**: May interact with kit card tooltips containing section headings
  - **Evidence**: kit-card.tsx shows testId props throughout (lines 66, 78, 86, etc.)

## 3) Data Model / Contracts

No data model or API contract changes required. This is a pure presentational component extraction.

**Component Props Interface:**

```typescript
interface SectionHeadingProps {
  /**
   * Visual variant determining size and spacing
   * - subsection: mb-2 text-xs (default, for subsection labels)
   * - section: mb-3 text-sm (for higher-level section labels)
   */
  variant?: 'subsection' | 'section';

  /**
   * Heading text content
   */
  children: React.ReactNode;

  /**
   * Optional testId for Playwright targeting
   */
  testId?: string;
}
```

**Styling Contract:**

- Variant `subsection`: `mb-2 text-xs font-medium text-muted-foreground`
- Variant `section`: `mb-3 text-sm font-medium`
- Base element: `<div>` with React.forwardRef support
- NO className prop allowed
- NO custom spacing/sizing overrides

## 4) API / Integration Surface

Not applicable — this is a pure UI component with no backend integration.

## 5) Algorithms & UI Flows

**Component Render Flow:**

1. Accept variant prop (default: 'subsection')
2. Map variant to Tailwind class string using lookup object
3. Render div element with:
   - Mapped variant classes
   - Optional testId for testing
   - children content
   - Forwarded ref if provided

**Variant Mapping Logic:**

```
variantClasses = {
  subsection: 'mb-2 text-xs font-medium text-muted-foreground',
  section: 'mb-3 text-sm font-medium'
}
```

**No conditional logic or state management required.**

## 6) Derived State & Invariants

No derived state or invariants. Component is purely presentational with static variant mapping.

## 7) State Consistency & Async Coordination

Not applicable — component has no state, async behavior, or coordination requirements.

## 8) Errors & Edge Cases

**Edge Cases:**

- **Empty children**: Component renders empty div (acceptable, matches existing behavior)
- **Complex ReactNode children**: Supported via React.ReactNode type (may contain links, badges, etc.)
- **Missing variant prop**: Defaults to 'subsection' (most common pattern)
- **Invalid variant value**: TypeScript prevents at compile time

**Validation:**

- No runtime validation needed (TypeScript enforces prop types)
- No error states or fallback UI required

## 9) Observability / Instrumentation

**Instrumentation:**

- **testId prop**: Optional data-testid attribute for Playwright selectors
- **Display name**: Set via `SectionHeading.displayName = 'SectionHeading'`

**No custom test events required** — component is pure presentational primitive.

**Playwright selectors** will use testId where provided:
- Example: `data-testid="parts.detail.heading.manufacturer"`
- Most instances won't need testId (only add where tests explicitly target headings)

## 10) Lifecycle & Background Work

Not applicable — component has no lifecycle hooks, effects, or background work.

## 11) Security & Permissions

Not applicable — no security or permission concerns for presentational component.

## 12) UX / UI Impact

**Visual Changes:**

1. **Standardization of spacing**: The "Technical Specifications" heading (part-details.tsx:597) currently uses `mb-3` but will standardize to `mb-2` when using subsection variant OR we accept `section` variant with `mb-3`. **Decision: Use section variant to preserve existing spacing.**

2. **Semantic HTML element**: All headings currently use `<div>` or `<p>` elements. Component will standardize to `<div>` for consistency.

3. **No visual regressions expected**: All styling remains identical except for the mb-3 → mb-2 standardization if we choose subsection variant for all.

**User-Facing Impact:**

- **None** — purely internal refactoring
- Headings continue to introduce content sections with identical visual treatment
- No behavioral changes or interaction differences

**Accessibility:**

- Current implementation uses non-semantic div/p elements
- New component maintains div element (no semantic improvement, but no regression)
- Consider future enhancement to accept `as` prop for semantic heading levels (h1-h6) but out of scope for this plan

## 13) Deterministic Test Plan

### New Component Tests (Optional)

**Surface**: `src/components/ui/section-heading.tsx`

**Scenarios**:
- Given subsection variant, When component renders, Then applies correct classes
- Given section variant, When component renders, Then applies correct classes
- Given testId prop, When component renders, Then data-testid attribute present
- Given children content, When component renders, Then children rendered correctly

**Implementation Note**: Most UI primitives don't have dedicated unit tests in this codebase. Playwright e2e tests provide coverage through usage. Decision: Skip unit tests unless reviewer requests.

### Existing Test Updates

**Surface**: Playwright tests for part details, part cards, kit cards

**Expected Impact**: **None** — no test updates required

**Reasoning**:
1. No tests currently assert on section heading className values (verified: `grep -r "className.*text-(xs|sm).*font-medium|font-medium.*text-(xs|sm)" tests/e2e/` returned no results)
2. Tests target content within sections, not the heading elements themselves
3. Text content remains identical ("Manufacturer Information", etc.)
4. testId attributes not added unless tests require them
5. DOM structure remains nearly identical (div → div, p → div)

**Validation Strategy**:
1. Run full Playwright suite after refactoring
2. Verify no visual regression in part detail screens
3. Confirm tooltip section headings render correctly
4. No test updates anticipated

**Gaps**: None intentionally deferred

## 14) Implementation Slices

**Slice 1: Create Component**

- Goal: Establish SectionHeading primitive with full documentation
- Touches:
  - `src/components/ui/section-heading.tsx` (create)
  - `src/components/ui/index.ts` (export)
- Dependencies: None

**Slice 2: Refactor part-details.tsx**

- Goal: Replace all 5 instances in part details view
- Touches:
  - `src/components/parts/part-details.tsx`
- Dependencies: Slice 1 complete
- Notes: Import SectionHeading, replace inline divs, verify rendering

**Slice 3: Refactor Tooltip Headings**

- Goal: Replace 4 instances in part-card.tsx and kit-card.tsx tooltips
- Touches:
  - `src/components/parts/part-card.tsx` (2 instances)
  - `src/components/kits/kit-card.tsx` (2 instances)
- Dependencies: Slice 1 complete
- Notes: Tooltip content functions return JSX, direct replacement

**Slice 4: Validation & Cleanup**

- Goal: Verify visual consistency and test coverage
- Touches:
  - Manual browser testing of affected screens
  - Playwright test execution
- Dependencies: Slices 1-3 complete
- Notes: Check part details, part list tooltips, kit card tooltips

## 15) Risks & Open Questions

### Risks

**Risk**: Visual regression from spacing changes

- **Impact**: Minimal — "Technical Specifications" heading will preserve mb-3 via `section` variant; all other headings already use mb-2
- **Mitigation**: Using `section` variant for "Technical Specifications" heading preserves existing spacing. All other instances already use mb-2. No visual regression expected.
- **Status**: Mitigated via variant selection documented in Research Log

**Risk**: Playwright tests fail due to unexpected DOM structure changes

- **Impact**: Test failures blocking merge
- **Mitigation**: Verified no tests assert on heading className values (grep search of tests/e2e/). DOM structure remains nearly identical (div → div, p → div). Text content unchanged.
- **Status**: Low risk due to verification evidence

**Risk**: Orphaned instances remain after refactoring

- **Impact**: Incomplete refactoring leaving inconsistent patterns
- **Mitigation**: Comprehensive grep search performed and documented in Research Log with explicit inclusion/exclusion decisions for all 11 discovered instances. 9 instances will be refactored, 2 explicitly excluded with rationale.
- **Status**: Mitigated via comprehensive instance inventory

### Open Questions

**Question**: Should the "Technical Specifications" heading use `section` variant (mb-3 text-sm) or standardize to `subsection` (mb-2 text-xs)?

- **Resolution**: Use `section` variant to preserve existing mb-3 spacing. This maintains current visual hierarchy without regression.

**Question**: Should component support semantic heading levels (h1-h6) via `as` prop?

- **Resolution**: Deferred to future enhancement. Current implementation maintains existing `<div>` element behavior (no regression). Project does not have established heading hierarchy patterns. When implementing site-wide heading structure audit, add `as` prop to support semantic heading levels. See Assumptions section for full rationale.

**Question**: Are there additional section heading patterns beyond the 9 identified instances?

- **Resolution**: Comprehensive grep search completed and documented in Research Log. Found 11 total instances: 9 to refactor, 2 explicitly excluded with rationale (Tags heading with inverse spacing, kit-bom-table reservation heading with flex layout).

## 16) Confidence

**Confidence: High** — This is a straightforward UI primitive extraction following established patterns in the codebase. Comprehensive research completed with:

- **Complete instance inventory**: All 11 matching patterns identified and categorized
- **Explicit inclusion/exclusion decisions**: 9 instances to refactor, 2 excluded with documented rationale
- **Playwright test safety verified**: Grep search confirms no tests assert on heading className values
- **Semantic HTML rationale documented**: Conscious decision to defer `as` prop to future enhancement with full justification
- **All open questions resolved**: Variant selection, exclusion decisions, and accessibility approach documented
- **Clear precedent**: Recent similar refactorings (Skeleton, InlineNotification, DescriptionList) provide proven implementation patterns

Implementation risk is low. Component API is simple, visual impact is minimal (no regressions expected), and all edge cases are addressed.

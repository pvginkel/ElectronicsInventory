# Part Metadata Display Components Extraction — Technical Plan

## 0) Research Log & Findings

**Discovery Work Performed:**

1. **Component Analysis**: Examined three domain-specific components in `src/components/parts/`:
   - `quantity-badge.tsx` (19 lines) — Primary background badge displaying numeric quantities
   - `location-summary.tsx` (23 lines) — Wrapper around InformationBadge with location-specific formatting
   - `vendor-info.tsx` (36 lines) — Vendor/seller display with optional external link and icon

2. **Usage Pattern Analysis**:
   - QuantityBadge: Used in 2 files (part-card.tsx, kit-card.tsx) with 6 total occurrences
   - LocationSummary: Used in 1 file (part-card.tsx) with 7 occurrences
   - VendorInfo: Used in 1 file (part-card.tsx) with 4 occurrences
   - All three co-occur in `part-card.tsx`, suggesting coordinated refactoring approach

3. **Current API Surface**:
   - QuantityBadge: Accepts `quantity: number` and `className?: string`
   - LocationSummary: Accepts `locations: PartLocation[]` and `testId: string` (no className)
   - VendorInfo: Accepts `seller`, `sellerLink`, and `className?: string`

4. **Styling Dependencies**:
   - QuantityBadge uses Badge-like styling (rounded-full, primary background, bold text)
   - LocationSummary wraps InformationBadge (already a UI component)
   - VendorInfo uses muted text styling, inline-flex layout, ExternalLink component

5. **Test Coverage**:
   - No direct test coverage via grep in test files
   - Part list spec (`tests/e2e/parts/part-list.spec.ts`) verifies card metadata including quantity and location display
   - Tests use `parts.list.card` testId and verify text content presence

6. **Conflicts Resolved**:
   - QuantityBadge is semantically a numeric display badge, not a generic status badge
   - LocationSummary is domain-specific logic that doesn't belong in UI components
   - VendorInfo is also domain-specific (vendor truncation logic, seller-specific formatting)
   - Decision: Extract only QuantityBadge to UI; LocationSummary and VendorInfo remain in parts/ but lose className props

## 1) Intent & Scope

**User intent**

Extract three part metadata display components from `src/components/parts/` to improve consistency and eliminate styling leakage. QuantityBadge will move to `src/components/ui/` as a reusable numeric display component. LocationSummary and VendorInfo will remain domain-specific but have their className props removed to enforce style encapsulation.

**Prompt quotes**

"Extract QuantityBadge, LocationSummary, and VendorInfo into reusable UI components"
"Plan to REMOVE className props from domain-specific wrappers completely (not deprecate, REMOVE)"
"Accept minor visual differences as acceptable losses for consistency"
"Make breaking changes - do not attempt backward compatibility"

**In scope**

- Create new `QuantityBadge` component in `src/components/ui/` with encapsulated primary badge styling
- Remove `className` prop from existing `QuantityBadge` in `src/components/parts/`
- Remove `className` prop from `VendorInfo` in `src/components/parts/`
- Update all import statements and usages in `part-card.tsx` and `kit-card.tsx`
- Ensure `LocationSummary` maintains its current API without className support (already compliant)
- Update `src/components/ui/index.ts` to export new QuantityBadge
- Verify Playwright tests continue to pass with visual consistency maintained

**Out of scope**

- Moving LocationSummary to UI components (domain-specific location formatting logic)
- Moving VendorInfo to UI components (domain-specific vendor truncation and seller link logic)
- Adding new variants or features to any component
- Modifying InformationBadge or ExternalLink components
- Refactoring other badge types or metadata displays beyond these three
- Creating new test coverage (existing tests verify via text content assertions)

**Assumptions / constraints**

- Minor padding/spacing differences in QuantityBadge across usages are acceptable standardization trade-offs
- VendorInfo truncation logic (25 character limit) is part of domain logic and stays in parts/
- LocationSummary's formatLocationSummary utility remains in `src/lib/utils/locations.ts`
- Existing Playwright tests rely on text content verification, not component-specific selectors
- No backward compatibility needed; breaking changes are acceptable and desirable
- All usages can be refactored in a single coordinated change

## 2) Affected Areas & File Map

### New UI Component

- **Area**: `src/components/ui/quantity-badge.tsx` (new file)
- **Why**: Create reusable numeric quantity badge component with primary background styling
- **Evidence**: Pattern exists in `src/components/parts/quantity-badge.tsx:8-18` showing primary background, rounded-full, bold text styling

### UI Component Index

- **Area**: `src/components/ui/index.ts`
- **Why**: Export new QuantityBadge for application-wide usage
- **Evidence**: Existing exports pattern at `src/components/ui/index.ts:12-15` (badge component exports)

### Domain Component Refactoring

- **Area**: `src/components/parts/quantity-badge.tsx` (delete file)
- **Why**: Remove domain-specific wrapper; all usages will import from UI
- **Evidence**: Current implementation at `src/components/parts/quantity-badge.tsx:1-19` has only className prop logic that will be removed

### VendorInfo Cleanup

- **Area**: `src/components/parts/vendor-info.tsx`
- **Why**: Remove className prop to enforce style encapsulation (remove from both interface AND cn() call on line 16)
- **Evidence**: Current interface at `src/components/parts/vendor-info.tsx:4-8` includes `className?: string`; usage at `src/components/parts/vendor-info.tsx:16` applies className via cn() - both must be removed

### LocationSummary Verification

- **Area**: `src/components/parts/location-summary.tsx`
- **Why**: Verify no className prop exists (already compliant)
- **Evidence**: Interface at `src/components/parts/location-summary.tsx:10-13` shows only `locations` and `testId` props

### Part Card Refactoring

- **Area**: `src/components/parts/part-card.tsx`
- **Why**: Update imports from `./quantity-badge` to `@/components/ui`, remove any className overrides for VendorInfo
- **Evidence**:
  - Import at `src/components/parts/part-card.tsx:6` imports QuantityBadge from local file
  - Usage at `src/components/parts/part-card.tsx:79` shows QuantityBadge with no className prop (already compliant)
  - VendorInfo usage at `src/components/parts/part-card.tsx:154-157` shows no className prop (already compliant)
  - LocationSummary usage at `src/components/parts/part-card.tsx:159-162` shows proper testId usage

### Kit Card Refactoring

- **Area**: `src/components/kits/kit-card.tsx`
- **Why**: Update import from `../parts/quantity-badge` to `@/components/ui`
- **Evidence**:
  - Import at `src/components/kits/kit-card.tsx:11` imports from parts directory
  - Usage at `src/components/kits/kit-card.tsx:75` shows clean usage without className override

### Playwright Test Verification

- **Area**: `tests/e2e/parts/part-list.spec.ts`
- **Why**: Verify tests continue to pass; no changes needed (tests verify via text content, not component structure)
- **Evidence**: Test at `tests/e2e/parts/part-list.spec.ts:25-61` verifies card metadata via text content ("12", type name, location text)

## 3) Data Model / Contracts

### QuantityBadge Props Interface

- **Entity**: UI component props for QuantityBadge
- **Shape**:
  ```typescript
  interface QuantityBadgeProps {
    quantity: number;
    testId: string;
  }
  ```
- **Mapping**: Direct pass-through from domain components; no camelCase/snake_case conversion needed
- **Evidence**: Current usage at `src/components/parts/part-card.tsx:79` shows `quantity={part.total_quantity}` pattern; kit usage at `src/components/kits/kit-card.tsx:75` shows `quantity={kit.buildTarget}`

### VendorInfo Props Interface (Updated)

- **Entity**: Component props for VendorInfo with className removed
- **Shape**:
  ```typescript
  interface VendorInfoProps {
    seller?: { id: number; name: string } | null;
    sellerLink?: string | null;
    // className REMOVED
  }
  ```
- **Mapping**: Backend snake_case `seller` and `seller_link` already adapted by parent; component receives clean props
- **Evidence**: Current interface at `src/components/parts/vendor-info.tsx:4-8`; usage at `src/components/parts/part-card.tsx:154-157`

### LocationSummary Props Interface (No Change)

- **Entity**: Component props for LocationSummary (already compliant)
- **Shape**:
  ```typescript
  interface LocationSummaryProps {
    locations: PartLocation[];
    testId: string;
  }

  interface PartLocation {
    box_no: number;
    loc_no: number;
    qty: number;
  }
  ```
- **Mapping**: Backend snake_case location data passed directly from part.locations
- **Evidence**: Interface at `src/components/parts/location-summary.tsx:4-13`; usage at `src/components/parts/part-card.tsx:159-162`

## 4) API / Integration Surface

**No backend API changes required.** This is purely a frontend refactoring moving styling from domain components to UI components.

- **Surface**: Component imports and props interfaces
- **Inputs**: Existing prop data from domain models (part.total_quantity, kit.buildTarget, part.seller, part.locations)
- **Outputs**: Rendered UI components with encapsulated styling
- **Errors**: TypeScript compilation errors if any usage attempts to pass className props after removal
- **Evidence**: No API client usage in affected files; all components are presentational

## 5) Algorithms & UI Flows

### QuantityBadge Rendering Flow

- **Flow**: Numeric quantity display badge rendering
- **Steps**:
  1. Receive `quantity` number prop and required `testId`
  2. Apply encapsulated styling: primary background, rounded-full, px-3 py-1, bold text
  3. Render span element with quantity value
  4. Apply testId for Playwright targeting
- **States / transitions**: Stateless presentational component; no internal state
- **Hotspots**: None; simple inline rendering
- **Evidence**: Current implementation at `src/components/parts/quantity-badge.tsx:8-18`

### VendorInfo Rendering Flow (Post-Cleanup)

- **Flow**: Vendor/seller display with optional external link
- **Steps**:
  1. Receive seller object and optional sellerLink
  2. Return null if no seller provided (early exit)
  3. Truncate seller name to 25 characters with ellipsis if needed
  4. Render inline-flex container with shop icon (🏪)
  5. If sellerLink provided, render ExternalLink with stopPropagation on click
  6. If no sellerLink, render plain span with title attribute for full name
  7. Apply muted foreground text color (no className customization allowed)
- **States / transitions**: Stateless; conditional rendering based on sellerLink presence
- **Hotspots**: Truncation logic (domain-specific, stays in parts/)
- **Evidence**: Implementation at `src/components/parts/vendor-info.tsx:10-36`

### LocationSummary Rendering Flow (No Change)

- **Flow**: Location summary display via InformationBadge wrapper
- **Steps**:
  1. Receive locations array and testId
  2. Call formatLocationSummary utility to generate display string
  3. Render InformationBadge with 📊 icon, subtle variant, and formatted summary
  4. Forward testId to InformationBadge for test targeting
- **States / transitions**: Stateless wrapper; formatting logic delegated to utility
- **Hotspots**: None; thin wrapper over existing UI component
- **Evidence**: Implementation at `src/components/parts/location-summary.tsx:15-23`

## 6) Derived State & Invariants

### QuantityBadge Display Value

- **Derived value**: Formatted quantity number
- **Source**: Numeric prop directly from domain models (part.total_quantity, kit.buildTarget)
- **Writes / cleanup**: None; purely presentational
- **Guards**: None required; numeric type enforced by TypeScript
- **Invariant**: Quantity must be numeric; badge styling must remain consistent (primary background, bold text)
- **Evidence**: Usage at `src/components/parts/part-card.tsx:79` and `src/components/kits/kit-card.tsx:75`

### VendorInfo Display Name

- **Derived value**: Truncated seller name
- **Source**: seller.name string, truncated to 25 characters if longer
- **Writes / cleanup**: None; computed on every render
- **Guards**: Null check on seller object (early return if absent)
- **Invariant**: Truncation logic must not be customizable via props; display must remain muted foreground color
- **Evidence**: Truncation at `src/components/parts/vendor-info.tsx:13`

### LocationSummary Formatted Text

- **Derived value**: Location summary string
- **Source**: locations array processed by formatLocationSummary utility
- **Writes / cleanup**: None; utility is pure function
- **Guards**: Empty array handling in formatLocationSummary ("No locations" fallback)
- **Invariant**: Summary format must remain consistent across all usages (no custom formatting via props)
- **Evidence**: Utility at `src/lib/utils/locations.ts:21-33`; component usage at `src/components/parts/location-summary.tsx:16`

## 7) State Consistency & Async Coordination

**No async operations or state coordination required.** All three components are stateless presentational components that render synchronously based on props.

- **Source of truth**: Props passed from parent components (part-card, kit-card)
- **Coordination**: None needed; components render independently based on prop data
- **Async safeguards**: Not applicable; synchronous rendering only
- **Instrumentation**: No test-event instrumentation needed; Playwright tests verify via text content assertions
- **Evidence**: No useState, useEffect, or TanStack Query usage in any affected component

## 8) Errors & Edge Cases

### QuantityBadge Edge Cases

- **Failure**: Quantity is 0
- **Surface**: QuantityBadge component rendering
- **Handling**: Display "0" normally; no special handling needed (valid inventory state)
- **Guardrails**: TypeScript ensures numeric type; no negative values expected from domain
- **Evidence**: No validation logic in current implementation at `src/components/parts/quantity-badge.tsx:8-18`

### QuantityBadge Type Safety

- **Failure**: Non-numeric quantity passed
- **Surface**: TypeScript compilation
- **Handling**: TypeScript compilation error prevents invalid usage
- **Guardrails**: Props interface enforces number type
- **Evidence**: Interface at `src/components/parts/quantity-badge.tsx:3-6`

### VendorInfo Null Seller

- **Failure**: No seller provided (null or undefined)
- **Surface**: VendorInfo component rendering
- **Handling**: Early return null; component renders nothing
- **Guardrails**: Explicit null check at component entry
- **Evidence**: Guard at `src/components/parts/vendor-info.tsx:11`

### VendorInfo Long Names

- **Failure**: Seller name exceeds 25 characters
- **Surface**: VendorInfo display truncation
- **Handling**: Truncate to 22 characters + "..." ellipsis; full name available via title attribute hover
- **Guardrails**: Truncation logic ensures consistent width; title attribute provides full text
- **Evidence**: Truncation at `src/components/parts/vendor-info.tsx:13`

### LocationSummary Empty Locations

- **Failure**: Empty locations array
- **Surface**: LocationSummary rendering
- **Handling**: formatLocationSummary returns "No locations" text
- **Guardrails**: Utility function handles empty array explicitly
- **Evidence**: Guard at `src/lib/utils/locations.ts:22`

### className Prop Removal

- **Failure**: Call site attempts to pass className after removal
- **Surface**: TypeScript compilation
- **Handling**: Compilation error; developer must remove className prop from call site
- **Guardrails**: TypeScript strict mode; props interface enforcement
- **Evidence**: Breaking change is intentional and desired per plan requirements

## 9) Observability / Instrumentation

### QuantityBadge Test Targeting

- **Signal**: Required testId prop for Playwright selectors
- **Type**: data-testid attribute
- **Trigger**: Always present on QuantityBadge render
- **Labels / fields**: testId string value
- **Consumer**: Playwright test selectors for direct badge targeting
- **Evidence**: Follows pattern in UI components like InformationBadge at `src/components/ui/information-badge.tsx:20-21` which requires testId

### Existing Part Card Test Coverage

- **Signal**: Text content assertions in Playwright specs
- **Type**: Visual regression via text presence checks
- **Trigger**: Part list spec renders cards and verifies metadata display
- **Labels / fields**: Quantity value ("12"), location text ("Box X-Y"), type name
- **Consumer**: `tests/e2e/parts/part-list.spec.ts`
- **Evidence**: Test assertions at `tests/e2e/parts/part-list.spec.ts:52-56`

### No New Instrumentation Required

- **Signal**: None
- **Type**: N/A
- **Trigger**: Components are presentational; no test-event emissions needed
- **Labels / fields**: N/A
- **Consumer**: Existing Playwright tests verify via text content, not component-specific events
- **Evidence**: No test-event tracking in current implementations; tests use text assertions

## 10) Lifecycle & Background Work

**No lifecycle hooks or background work.** All components are stateless functional components with synchronous rendering.

- **Hook / effect**: None
- **Trigger cadence**: N/A
- **Responsibilities**: N/A
- **Cleanup**: N/A
- **Evidence**: No useEffect, useCallback, or subscription logic in any affected component

## 11) Security & Permissions

**Not applicable.** Components render public part metadata without authentication or authorization concerns.

## 12) UX / UI Impact

### QuantityBadge Visual Standardization

- **Entry point**: Part list cards, kit overview cards
- **Change**: Quantity badges will have consistent primary background, rounded-full styling, px-3 py-1 padding, bold text across all usages
- **User interaction**: No interaction changes; purely visual consistency improvement
- **Dependencies**: None; self-contained styling
- **Evidence**: Usage at `src/components/parts/part-card.tsx:79` (part cards) and `src/components/kits/kit-card.tsx:75` (kit cards)

### VendorInfo Layout Preservation

- **Entry point**: Part list cards (vendor section)
- **Change**: No visual change; className removal only affects API surface, not rendered output (no call sites use className)
- **User interaction**: No change; existing click behavior on external links preserved
- **Dependencies**: ExternalLink component remains unchanged
- **Evidence**: Usage at `src/components/parts/part-card.tsx:154-157` shows no className prop passed

### LocationSummary Consistency

- **Entry point**: Part list cards (location section)
- **Change**: No change; already uses InformationBadge without className customization
- **User interaction**: No change
- **Dependencies**: InformationBadge (subtle variant) and formatLocationSummary utility
- **Evidence**: Usage at `src/components/parts/part-card.tsx:159-162` and implementation at `src/components/parts/location-summary.tsx:15-23`

## 13) Deterministic Test Plan

### Part List Metadata Display

- **Surface**: Part list card component (`part-card.tsx`)
- **Scenarios**:
  - Given a part with quantity, vendor, and locations, When card renders, Then all metadata displays correctly with standardized styling
  - Given a part with long vendor name, When card renders, Then vendor name truncates to 25 chars with ellipsis
  - Given a part with no vendor, When card renders, Then vendor info section does not render
  - Given a part with no locations, When card renders, Then location summary shows "No locations"
- **Instrumentation / hooks**: `parts.list.card` testId for card targeting; text content assertions for metadata verification
- **Gaps**: None; existing test coverage sufficient for visual regression verification
- **Evidence**: Test scenario at `tests/e2e/parts/part-list.spec.ts:25-61`

### Kit Card Quantity Display

- **Surface**: Kit overview card component (`kit-card.tsx`)
- **Scenarios**:
  - Given a kit with build target quantity, When card renders, Then quantity badge displays with primary styling
- **Instrumentation / hooks**: `kits.overview.card.{kitId}` testId for card targeting
- **Gaps**: No explicit quantity badge testing in kit specs; acceptable as visual consistency is primary goal
- **Evidence**: Usage at `src/components/kits/kit-card.tsx:75`

### TypeScript Compilation Verification

- **Surface**: All affected component files
- **Scenarios**:
  - Given className prop removed from interfaces, When TypeScript compiles, Then no call sites pass className (compilation succeeds)
  - Given invalid prop passed to QuantityBadge, When TypeScript compiles, Then compilation error surfaces invalid usage
- **Instrumentation / hooks**: `pnpm check` command output
- **Gaps**: None; TypeScript strict mode enforces prop contracts
- **Evidence**: Per plan requirements, breaking changes are desired and TypeScript enforces them

## 14) Implementation Slices

### Slice 1: Create UI QuantityBadge

- **Goal**: Establish new reusable QuantityBadge in UI components
- **Touches**:
  - Create `src/components/ui/quantity-badge.tsx`
  - Update `src/components/ui/index.ts` to export QuantityBadge
- **Dependencies**: None; can be created independently

### Slice 2: Refactor All Usages

- **Goal**: Update all imports and add required testId props to all call sites
- **Touches**:
  - Update `src/components/parts/part-card.tsx` import statement (line 6)
  - Add testId prop to QuantityBadge usage in `src/components/parts/part-card.tsx` (line 79)
  - Update `src/components/kits/kit-card.tsx` import statement (line 11)
  - Add testId prop to QuantityBadge usage in `src/components/kits/kit-card.tsx` (line 75)
  - Delete `src/components/parts/quantity-badge.tsx`
- **Dependencies**: Slice 1 must complete first (new UI component must exist)

### Slice 3: Remove className Props

- **Goal**: Enforce style encapsulation by removing className from component APIs
- **Touches**:
  - Update `src/components/parts/vendor-info.tsx` interface (remove `className?: string` from line 7)
  - Update `src/components/parts/vendor-info.tsx` rendering (remove className parameter from cn() call on line 16)
  - Verify `src/components/parts/location-summary.tsx` has no className (already compliant)
- **Dependencies**: Can run in parallel with Slices 1-2; no import dependencies

### Slice 4: Verification

- **Goal**: Ensure all changes work correctly
- **Touches**:
  - Run `pnpm check` (TypeScript, lint, format) - must pass with zero errors
  - Run `pnpm playwright test tests/e2e/parts/part-list.spec.ts` - verify quantity badges, vendor info, and location summaries display correctly with expected text content
  - Run `pnpm playwright test tests/e2e/kits/kits-overview.spec.ts` - verify kit cards render with quantity badges showing build target values correctly
  - Verify no visual regression in metadata display (quantity, vendor, location text all present and properly formatted)
- **Dependencies**: All previous slices must complete

## 15) Risks & Open Questions

### Risk: Visual Regression in Quantity Badge Padding

- **Risk**: Standardizing QuantityBadge padding to px-3 py-1 may create minor visual differences if any usage had custom className overrides
- **Impact**: Slight padding difference in badge size
- **Mitigation**: Review current usages shows no className props passed; risk is minimal. Accept minor standardization differences as acceptable per plan requirements.

### Risk: Vendor Name Truncation Edge Cases

- **Risk**: 25-character truncation threshold may be suboptimal for some vendor names
- **Impact**: Some vendor names may be less readable when truncated
- **Mitigation**: Keep existing truncation logic (domain-specific business rule); full name available via title attribute hover. Out of scope for this refactoring.

### Risk: Test Failures Due to Visual Changes

- **Risk**: Playwright tests asserting specific layout or spacing might fail if badge styling changes subtly
- **Impact**: Test failures requiring investigation
- **Mitigation**: Current tests use text content assertions, not layout checks; risk is low. Run full test suite in Slice 4 to verify.

### Risk: TypeScript Compilation Errors from className Removal

- **Risk**: Hidden usages of className prop might surface as compilation errors
- **Impact**: Additional refactoring needed to remove className from undiscovered call sites
- **Mitigation**: Grep search shows no className props passed in current usages; risk is minimal. TypeScript compilation will catch any missed cases.

### Open Question: Should QuantityBadge Support Size Variants?

- **Question**: Should QuantityBadge offer size variants (small, medium, large) for different contexts?
- **Why it matters**: Current implementation has fixed size; some usages might benefit from larger/smaller variants
- **Owner / follow-up**: Out of scope for current extraction; can be added later if needed. Start with single size matching current implementation.

### Open Question: Should VendorInfo Truncation Be Configurable?

- **Question**: Should VendorInfo accept a maxLength prop to make truncation threshold customizable?
- **Why it matters**: 25-character limit is hardcoded; different contexts might prefer different thresholds
- **Owner / follow-up**: Out of scope; truncation logic is domain-specific business rule. Keep existing behavior.

## 16) Confidence

**Confidence: High** — This is a straightforward refactoring with clear component boundaries, no async operations, limited test surface area, and explicit design constraints favoring breaking changes over backward compatibility. All usages are localized and well-documented. The only minor uncertainty is potential visual regression in badge styling, which is an acceptable trade-off per plan requirements.

# MembershipTooltipContent Component Extraction Plan

## 0) Research Log & Findings

### Discovery Areas Searched

1. **Pattern Analysis**: Examined all tooltip render functions in kit-card.tsx (lines 173-282) and part-card.tsx (lines 178-268)
2. **MembershipIndicator Usage**: Analyzed existing MembershipIndicator component (src/components/ui/membership-indicator.tsx) that uses `renderTooltip` prop and `tooltipClassName` prop
3. **Tooltip Guidelines**: Reviewed docs/contribute/ui/tooltip_guidelines.md for tooltip patterns and usage rules
4. **UI Component Patterns**: Examined existing UI components (SectionHeading, StatusBadge, Badge) to understand the project's component design patterns
5. **Type System**: Investigated domain types for kits, parts, shopping lists, and pick lists to understand membership data structures
6. **Test Coverage**: Found Playwright tests covering kits overview (tests/e2e/kits/kits-overview.spec.ts) and parts list (tests/e2e/parts/part-list.spec.ts) that validate tooltip behavior

### Key Findings

**Pattern Identification**: Found 4 tooltip render functions with identical structure:
- `renderKitShoppingTooltip` (kit-card.tsx:173-226)
- `renderKitPickTooltip` (kit-card.tsx:228-282)
- `renderPartShoppingTooltip` (part-card.tsx:178-211)
- `renderPartKitTooltip` (part-card.tsx:234-268)

**Common Structure**:
1. Empty state check with muted text fallback
2. SectionHeading with descriptive text
3. `<ul className="space-y-2">` or `<ul className="space-y-1">` (minor variance)
4. List items with:
   - Link element (shopping lists, kits) OR plain text (pick lists)
   - StatusBadge or Badge component for status display
   - Secondary metadata row with `text-[11px]` or `text-xs` (minor variance)
   - Various detail items (quantities, units, reservations, etc.)

**Visual Differences** (to standardize):
- List spacing: `space-y-2` vs `space-y-1`
- Secondary text size: `text-[11px]` vs `text-xs`
- Pick list uses non-link header (just ID display) vs linked shopping lists/kits

**Dependency on MembershipIndicator**:
- MembershipIndicator passes `renderTooltip` function and `tooltipClassName` prop to Tooltip
- Currently accepts three className-related props: `tooltipClassName`, `iconWrapperClassName`, `containerClassName`
- These will be removed per workflow principles

**Call Site Audit**:
All MembershipIndicator usages in the codebase:
- `kit-card.tsx:83` - Shopping list indicator (passes `tooltipClassName="w-72"`, `iconWrapperClassName`)
- `kit-card.tsx:98` - Pick list indicator (passes `tooltipClassName="w-72"`, `iconWrapperClassName`)
- `part-card.tsx:82` - Shopping list indicator (no className overrides)
- `part-card.tsx:94` - Kit indicator (no className overrides)

Total: 4 call sites, all will break when className props are removed (intended behavior for verification).

**Badge Component Heterogeneity**:
- Kit cards use `StatusBadge` component for membership status display
- Part cards use `Badge` component for membership status display
- The new component will accept `ReactNode` for statusBadge prop to support both patterns
- This heterogeneity is intentional and domain-specific; standardization is out of scope

**Test Coverage**:
- kits-overview.spec.ts verifies shopping and pick list indicator tooltips (lines 8-159)
- Tests hover over indicators and assert tooltip content visibility
- part-list.spec.ts does NOT include tooltip assertions for shopping list or kit indicators
- **Coverage Gap**: Part card tooltips require new test scenarios (see Section 13)

### Conflicts Resolved

1. **Spacing Variance**: Will standardize on `space-y-2` for list items (most common pattern)
2. **Text Size Variance**: Will standardize on `text-xs` for metadata rows (aligns with Tailwind conventions)
3. **Component Naming**: Chose `MembershipTooltipContent` over `LinkedItemsTooltip` as it better reflects domain semantics (memberships are the core concept)
4. **className Removal**: Will remove all three className props from MembershipIndicator (`tooltipClassName`, `iconWrapperClassName`, `containerClassName`) and hard-code styling
5. **Tooltip Width**: Will hard-code to `w-72` (current kit card width) rather than `w-64` to accommodate complex membership content without wrapping issues

## 1) Intent & Scope

### User intent

Extract a reusable UI component that standardizes tooltip content displaying linked/related items with metadata. The component centralizes the pattern of showing section headings, lists of linked items with status badges, and metadata details. This eliminates code duplication across kit and part cards while enforcing visual consistency.

### Prompt quotes

"Extract **MembershipTooltipContent** into a reusable UI component in `src/components/ui/`"

"All instances share a common pattern: section heading, list of items with links, each item has: name, status badge, and metadata details"

"Component API Requirements: Accept a generic list of items to display, support custom rendering for metadata/details per item, **NOT expose a `className` prop**"

"This is aggressive technical debt cleanup work: make breaking changes, accept minor visual differences as acceptable losses for consistency, remove className props completely"

### In scope

- Create `MembershipTooltipContent` component at `src/components/ui/membership-tooltip-content.tsx`
- Define generic, domain-agnostic component API with typed item structure
- Standardize spacing (`space-y-2` for lists), text sizing (`text-xs` for metadata), and layout structure
- Refactor all 4 tooltip render functions to use new component
- Remove `tooltipClassName`, `iconWrapperClassName`, and `containerClassName` props from MembershipIndicator
- Hard-code tooltip width in MembershipIndicator to `w-72` (currently kit cards override default with this width; part cards will inherit this wider tooltip)
- Update exports in `src/components/ui/index.ts`
- Verify existing Playwright tests continue to pass (kits-overview.spec.ts)
- Add new Playwright test scenarios for part card tooltips in part-list.spec.ts (shopping list and kit indicators)

### Out of scope

- Changing MembershipIndicator's core behavior or query logic
- Modifying domain-specific membership data structures or hooks
- Adding new test coverage beyond maintaining existing specs
- Updating tooltip positioning, delay, or interaction patterns (handled by shared Tooltip component)
- Refactoring other tooltip patterns in the codebase (this plan targets membership tooltips only)

### Assumptions / constraints

- Existing Playwright tests assert tooltip content text and visibility without relying on granular testId selectors for internal tooltip structure
- Minor visual differences (1-2px spacing variance) are acceptable standardization losses
- All membership tooltips can share a single component structure with render props for flexibility
- Domain components (kit-card, part-card) will continue using MembershipIndicator but with updated renderTooltip implementations
- TypeScript strict mode will catch all call sites passing removed className props
- The pattern of "list items with optional links, status badges, and metadata rows" generalizes to all four usages

## 2) Affected Areas & File Map

### New Component

- **Area**: `src/components/ui/membership-tooltip-content.tsx`
- **Why**: New reusable component encapsulating membership tooltip content structure
- **Evidence**: New file (does not exist)

### Updated UI Components

- **Area**: `src/components/ui/membership-indicator.tsx`
- **Why**: Remove `tooltipClassName`, `iconWrapperClassName`, and `containerClassName` props; hard-code tooltip width
- **Evidence**: Lines 18-20, 34-36, 57, 83, 86, 95 show className props being used and passed through

### Updated UI Index

- **Area**: `src/components/ui/index.ts`
- **Why**: Export new MembershipTooltipContent component and its types
- **Evidence**: Lines 1-46 show existing exports; new component needs to be added

### Kit Card Refactoring

- **Area**: `src/components/kits/kit-card.tsx`
- **Why**: Replace `renderKitShoppingTooltip` and `renderKitPickTooltip` with MembershipTooltipContent usage
- **Evidence**:
  - Lines 173-226: `renderKitShoppingTooltip` duplicates structure
  - Lines 228-282: `renderKitPickTooltip` duplicates structure
  - Lines 94, 109: Pass `tooltipClassName="w-72"` and `iconWrapperClassName` to MembershipIndicator

### Part Card Refactoring

- **Area**: `src/components/parts/part-card.tsx`
- **Why**: Replace `renderPartShoppingTooltip` and `renderPartKitTooltip` with MembershipTooltipContent usage
- **Evidence**:
  - Lines 178-211: `renderPartShoppingTooltip` duplicates structure
  - Lines 234-268: `renderPartKitTooltip` duplicates structure
  - Lines 82-105: MembershipIndicator usages (no className overrides, uses defaults)

### Test Specifications

- **Area**: `tests/e2e/kits/kits-overview.spec.ts`
- **Why**: Verify tooltip content still renders correctly after refactoring
- **Evidence**: Lines 8-159 test shopping and pick list indicators with tooltip assertions

- **Area**: `tests/e2e/parts/part-list.spec.ts`
- **Why**: Verify part list tooltip interactions (if any exist beyond basic rendering)
- **Evidence**: Lines 1-121 test part list rendering; check for tooltip-specific assertions

## 3) Data Model / Contracts

### MembershipTooltipContentItem (Generic Item Structure)

- **Entity / contract**: Generic item shape for membership tooltip content
- **Shape**:
  ```typescript
  interface MembershipTooltipContentItem {
    id: string | number;              // Unique identifier
    label: string;                     // Primary display text (name, ID, etc.)
    statusBadge: ReactNode;            // Rendered StatusBadge or Badge component
    link?: {                           // Optional link properties
      to: string;
      params?: Record<string, string>;
      search?: Record<string, unknown>;
    };
    metadata?: ReactNode[];            // Optional array of metadata spans/elements
  }
  ```
- **Mapping**: Call sites transform domain-specific memberships into this generic shape:
  - Kit shopping memberships → items with shopping list name, status badge, units/reservation metadata
  - Kit pick memberships → items with pick list ID, status badge, lines/quantities/units metadata
  - Part shopping memberships → items with list name, status badge (minimal metadata)
  - Part kit memberships → items with kit name, status badge, quantities metadata
- **Evidence**: Derived from existing render functions (kit-card.tsx:173-282, part-card.tsx:178-268)

### MembershipTooltipContentProps

- **Entity / contract**: Component props interface
- **Shape**:
  ```typescript
  interface MembershipTooltipContentProps {
    heading: string;                   // Section heading text
    items: MembershipTooltipContentItem[];
    emptyMessage: string;              // Message when items.length === 0
    testId?: string;                   // Optional testId for root element
  }
  ```
- **Mapping**: Direct prop passing from domain components
- **Evidence**: Pattern consistent across all tooltip render functions

## 4) API / Integration Surface

### No Backend API Changes

- **Surface**: No new backend endpoints or hooks required
- **Inputs**: Component consumes pre-formatted data from existing membership hooks
- **Outputs**: Pure presentational component rendering tooltip content
- **Errors**: No error handling (errors handled by MembershipIndicator parent)
- **Evidence**: Component is pure UI with no data fetching logic

### Existing Hooks (Unchanged)

- **Surface**: Hooks providing membership data remain unchanged
- **Examples**:
  - `useKitShoppingListMemberships` (used in kit-card.tsx)
  - `useKitPickListMemberships` (used in kit-card.tsx)
  - `usePartShoppingListMemberships` (used in part-card.tsx)
  - `usePartKitMemberships` (used in part-card.tsx)
- **Evidence**: These hooks are consumed upstream of the tooltip render functions; refactoring does not affect their usage

## 5) Algorithms & UI Flows

### Component Render Flow

- **Flow**: MembershipTooltipContent rendering
- **Steps**:
  1. Accept `items`, `heading`, `emptyMessage`, `testId` props
  2. If `items.length === 0`, render muted empty message paragraph
  3. Otherwise, render structure:
     - SectionHeading with `heading` text
     - `<ul className="space-y-2">` wrapper
     - Map each item to `<li className="space-y-1">`:
       - If `item.link` exists, render Link with label and status badge
       - If no link, render plain div with label and status badge
       - If `item.metadata` exists and is non-empty, render metadata row with `text-xs` styling
  4. Apply optional testId to root container
- **States / transitions**: Stateless functional component; no internal state
- **Hotspots**: None (pure presentational component)
- **Evidence**: Derived from kit-card.tsx:173-282 and part-card.tsx:178-268

### Domain Component Integration Flow

- **Flow**: Kit/Part card integrating MembershipTooltipContent
- **Steps**:
  1. Receive membership summary from hook
  2. Transform summary into array of `MembershipTooltipContentItem` objects
  3. Construct metadata ReactNode arrays for each item (e.g., quantity spans, reservation notes)
  4. Pass transformed items to `<MembershipTooltipContent />` within `renderTooltip` function
  5. Pass renderTooltip function to MembershipIndicator
- **States / transitions**: Data transformation happens during render; no state updates
- **Hotspots**: Mapping logic in domain components must correctly construct item shape
- **Evidence**: Existing render functions in kit-card.tsx and part-card.tsx

## 6) Derived State & Invariants

### Item Transformation Logic

- **Derived value**: `MembershipTooltipContentItem[]` array constructed from membership summaries
- **Source**: Raw membership data from TanStack Query hooks (already in camelCase)
- **Writes / cleanup**: No writes; read-only transformation during render
- **Guards**: Type safety enforced by TypeScript; runtime checks for optional fields (link, metadata)
- **Invariant**: Items array length matches membership array length; each item has valid id, label, and statusBadge
- **Evidence**: kit-card.tsx:182-222 (membership.map), part-card.tsx:189-207 (membership.map)

### Empty State Toggle

- **Derived value**: Boolean determining whether to show empty message vs item list
- **Source**: `items.length === 0`
- **Writes / cleanup**: No writes; pure conditional render
- **Guards**: None needed (length check is safe)
- **Invariant**: Exactly one of empty message or item list is rendered, never both
- **Evidence**: kit-card.tsx:174-176, part-card.tsx:179-183

### Link vs Plain Text Rendering

- **Derived value**: Conditional rendering of Link vs div for item header
- **Source**: Presence of `item.link` property
- **Writes / cleanup**: No writes; conditional render based on item shape
- **Guards**: TypeScript optional field handling
- **Invariant**: If link exists, Link component is used; otherwise plain div is used
- **Evidence**: kit-card.tsx:200-214 (Link), kit-card.tsx:264-270 (plain div for pick lists)

## 7) State Consistency & Async Coordination

### No Async Coordination Needed

- **Source of truth**: Props passed from parent (MembershipIndicator via renderTooltip)
- **Coordination**: Component is stateless; consistency maintained by parent's TanStack Query cache
- **Async safeguards**: None needed (no async operations in component)
- **Instrumentation**: No test events emitted (component is pure presentational)
- **Evidence**: Component is synchronous render function; parent components handle all async logic

### Parent Component Coordination

- **Source of truth**: MembershipIndicator manages tooltip visibility and query state
- **Coordination**: MembershipIndicator passes summary data to renderTooltip callback when tooltip opens
- **Async safeguards**: MembershipIndicator handles loading/error states before calling renderTooltip
- **Instrumentation**: MembershipIndicator emits test events (handled upstream); tooltip content does not emit events
- **Evidence**: membership-indicator.tsx:38-104 shows state management; tooltip content only renders when summary exists

## 8) Errors & Edge Cases

### Empty Membership List

- **Failure**: No memberships to display (items.length === 0)
- **Surface**: MembershipTooltipContent component
- **Handling**: Render muted empty message paragraph with provided `emptyMessage` text
- **Guardrails**: Empty message always provided via props; component guarantees meaningful UI
- **Evidence**: kit-card.tsx:174-176, part-card.tsx:179-183

### Missing Link Information

- **Failure**: Item has no link property (e.g., pick lists display ID only)
- **Surface**: Item rendering within MembershipTooltipContent
- **Handling**: Render plain div with label and status badge instead of Link
- **Guardrails**: Optional link property in item type; component handles both cases
- **Evidence**: kit-card.tsx:264-270 (pick list without link)

### Empty Metadata Array

- **Failure**: Item has no metadata or empty metadata array
- **Surface**: Metadata row rendering
- **Handling**: Skip metadata row entirely (conditional render on metadata.length > 0)
- **Guardrails**: Optional metadata field; length check before rendering
- **Evidence**: kit-card.tsx:215-219 (conditional metadata render)

### Invalid Item ID

- **Failure**: Item id is missing or invalid
- **Surface**: React key prop in list rendering
- **Handling**: TypeScript enforces id field; runtime error if missing (acceptable, indicates data contract violation)
- **Guardrails**: TypeScript type enforcement at transformation layer
- **Evidence**: kit-card.tsx:199 (key={membership.id})

## 9) Observability / Instrumentation

### Optional TestId for Root Element

- **Signal**: `data-testid` attribute on root container
- **Type**: Test hook (data attribute)
- **Trigger**: When `testId` prop is provided to component
- **Labels / fields**: testId string value
- **Consumer**: Playwright specs targeting tooltip content
- **Evidence**: Standard pattern in UI components (section-heading.tsx:74, status-badge.tsx:63)

### No Test Events Emitted

- **Signal**: None
- **Type**: N/A
- **Trigger**: N/A
- **Labels / fields**: N/A
- **Consumer**: N/A
- **Evidence**: Component is pure presentational; no form mutations, API calls, or state changes that warrant test events

### Existing Test Assertions

- **Signal**: Text content visibility
- **Type**: Playwright assertions
- **Trigger**: Existing tests hover over membership indicators
- **Labels / fields**: Shopping list names, pick list IDs, status badge text, metadata text
- **Consumer**: kits-overview.spec.ts:98-139, part-list.spec.ts (if tooltip assertions exist)
- **Evidence**: kits-overview.spec.ts validates tooltip content after hover

## 10) Lifecycle & Background Work

### No Lifecycle Hooks

- **Hook / effect**: None (stateless functional component)
- **Trigger cadence**: N/A
- **Responsibilities**: N/A
- **Cleanup**: N/A
- **Evidence**: Component is pure function with no side effects

### Parent Component Lifecycle

- **Hook / effect**: MembershipIndicator manages tooltip visibility via Tooltip component
- **Trigger cadence**: On hover / focus
- **Responsibilities**: Show/hide tooltip, handle click propagation stoppage
- **Cleanup**: Tooltip component handles cleanup (unmount listeners, reset state)
- **Evidence**: membership-indicator.tsx:81-104 (Tooltip integration)

## 11) Security & Permissions

Not applicable. Component renders pre-sanitized data provided by parent; no user input, authentication checks, or sensitive data handling.

## 12) UX / UI Impact

### Entry Points

- **Entry point**: Kit card membership indicators (shopping and pick list icons)
- **Change**: Standardized spacing (space-y-2), text sizing (text-xs), and structure
- **User interaction**: Hover/focus on indicator icons shows tooltip with linked memberships
- **Dependencies**: MembershipIndicator component, Tooltip component, TanStack Router Link
- **Evidence**: kit-card.tsx:82-112 (indicator integration)

- **Entry point**: Part card membership indicators (shopping list and kit icons)
- **Change**: Standardized spacing and structure consistent with kit cards
- **User interaction**: Hover/focus on indicator icons shows tooltip with linked memberships
- **Dependencies**: Same as kit cards
- **Evidence**: part-card.tsx:82-105 (indicator integration)

### Visual Changes

- **Change**: List spacing standardized to `space-y-2` (previously some used `space-y-1`)
- **Impact**: Slightly more vertical space between list items (minor visual change)
- **Change**: Metadata text standardized to `text-xs` (previously some used `text-[11px]`)
- **Impact**: Metadata text may be 1px larger in some tooltips (minor visual change)
- **Change**: Hard-coded tooltip width standardized to `w-72` (kit cards already use this; part cards will now use wider tooltips)
- **Impact**: Part card tooltips slightly wider (from default `w-64` to `w-72`); provides more room for membership content
- **Evidence**: kit-card.tsx:94, 109 show `tooltipClassName="w-72"` override

### No Interaction Changes

- **User interaction**: Tooltip trigger behavior unchanged (hover/focus)
- **User interaction**: Link click-through behavior unchanged (navigation to detail pages)
- **User interaction**: Click propagation stoppage unchanged (prevents card click when interacting with indicator)
- **Evidence**: membership-indicator.tsx:88-89 (stopPropagation handlers)

## 13) Deterministic Test Plan

### Kit Card Shopping List Tooltip

- **Surface**: Kit card shopping list indicator tooltip
- **Scenarios**:
  - Given kit with active shopping list memberships, When user hovers over shopping cart icon, Then tooltip shows "Linked shopping lists" heading and list of shopping list names with status badges
  - Given shopping list membership with units and honor reserved flag, When tooltip is displayed, Then metadata row shows "{X} units" and "Honors reservations"
  - Given kit with no active shopping list memberships, When membership indicator is present, Then tooltip shows "No active shopping lists."
- **Instrumentation / hooks**:
  - Tooltip testId: `kits.overview.card.${kitId}.shopping-indicator.tooltip` (MembershipIndicator appends `.tooltip` suffix)
  - Content assertions: List names, status badge text, metadata text
- **Gaps**: None (existing tests cover these scenarios)
- **Evidence**: kits-overview.spec.ts:98-125

### Kit Card Pick List Tooltip

- **Surface**: Kit card pick list indicator tooltip
- **Scenarios**:
  - Given kit with open pick list memberships, When user hovers over clipboard icon, Then tooltip shows "Open pick lists" heading and list of pick list IDs with status badges
  - Given pick list membership with open lines and remaining quantity, When tooltip is displayed, Then metadata row shows "{X} open lines" and "{Y} items remaining"
  - Given kit with no open pick list memberships, When membership indicator is hidden, Then no tooltip is displayed
- **Instrumentation / hooks**:
  - Tooltip testId: `kits.overview.card.${kitId}.pick-indicator.tooltip`
  - Content assertions: Pick list IDs, status badge text, metadata text
- **Gaps**: None (existing tests cover these scenarios)
- **Evidence**: kits-overview.spec.ts:126-159

### Part Card Shopping List Tooltip

- **Surface**: Part card shopping list indicator tooltip
- **Scenarios**:
  - Given part on active shopping lists, When user hovers over shopping cart icon, Then tooltip shows "On shopping lists" heading and list of shopping list names with status badges
  - Given part with no active shopping list memberships, When membership indicator is present, Then tooltip shows "No active shopping lists."
- **Instrumentation / hooks**:
  - Tooltip testId: `parts.list.card.shopping-list-indicator.tooltip`
  - Content assertions: List names, status badge text
- **Gaps**: **CONFIRMED MISSING** - part-list.spec.ts does not include shopping list indicator tooltip tests. New test scenario required.
- **Evidence**: part-card.tsx:87-92, part-list.spec.ts:1-121 (no tooltip assertions)

### Part Card Kit Membership Tooltip

- **Surface**: Part card kit indicator tooltip
- **Scenarios**:
  - Given part used in kits, When user hovers over circuit board icon, Then tooltip shows "Used in kits" heading and list of kit names with status badges
  - Given kit membership with quantities, When tooltip is displayed, Then metadata row shows "{X} per kit • reserved {Y}"
  - Given part not used in any kits, When membership indicator is hidden, Then no tooltip is displayed
- **Instrumentation / hooks**:
  - Tooltip testId: `parts.list.card.kit-indicator.tooltip`
  - Content assertions: Kit names, status badge text, metadata text
- **Gaps**: **CONFIRMED MISSING** - part-list.spec.ts does not include kit indicator tooltip tests. New test scenario required.
- **Evidence**: part-card.tsx:94-104, part-list.spec.ts:1-121 (no tooltip assertions)

### Refactoring Validation

- **Surface**: All four tooltip render functions
- **Scenarios**:
  - Given refactored components, When all tests run, Then no regressions in tooltip content, structure, or visibility
  - Given removed className props, When TypeScript compiles, Then no type errors from call sites attempting to pass className
  - Given standardized styling, When tooltips render, Then visual appearance is consistent across all membership indicators
- **Instrumentation / hooks**: Existing test assertions cover content validation
- **Gaps**: Manual visual review recommended to confirm standardized spacing/sizing is acceptable
- **Evidence**: Workflow principle: "pnpm check must pass"

## 14) Implementation Slices

### Slice 1: Create MembershipTooltipContent Component

- **Goal**: Implement core component with full API and styling
- **Touches**:
  - `src/components/ui/membership-tooltip-content.tsx` (new file)
  - `src/components/ui/index.ts` (add export)
- **Dependencies**: None (independent component creation)

### Slice 2: Remove className Props from MembershipIndicator

- **Goal**: Hard-code tooltip width and remove className props
- **Touches**:
  - `src/components/ui/membership-indicator.tsx` (update)
- **Dependencies**: Slice 1 complete (so replacement component exists)

### Slice 3: Refactor Kit Card Tooltips

- **Goal**: Replace renderKitShoppingTooltip and renderKitPickTooltip with MembershipTooltipContent
- **Touches**:
  - `src/components/kits/kit-card.tsx` (update)
- **Dependencies**: Slices 1-2 complete

### Slice 4: Refactor Part Card Tooltips

- **Goal**: Replace renderPartShoppingTooltip and renderPartKitTooltip with MembershipTooltipContent
- **Touches**:
  - `src/components/parts/part-card.tsx` (update)
- **Dependencies**: Slices 1-2 complete

### Slice 5: Add Part Card Tooltip Tests

- **Goal**: Add new test scenarios for part card shopping list and kit membership indicator tooltips
- **Touches**:
  - `tests/e2e/parts/part-list.spec.ts` (add new test cases)
- **Dependencies**: Slices 1-4 complete (so tooltips render with new component)

### Slice 6: Verify All Tests Pass

- **Goal**: Run all Playwright tests, fix any broken assertions, confirm no regressions
- **Touches**:
  - `tests/e2e/kits/kits-overview.spec.ts` (verify existing tests pass)
  - `tests/e2e/parts/part-list.spec.ts` (verify new tests pass)
- **Dependencies**: Slices 1-5 complete

## 15) Risks & Open Questions

### Risks

- **Risk**: Hard-coding tooltip width to `w-72` may make part card tooltips unnecessarily wide
- **Impact**: Minor visual change; part card tooltips will be wider than before (was `w-64`)
- **Mitigation**: Accepted as standardization trade-off; `w-72` accommodates kit card content (most complex) and provides consistency

- **Risk**: Standardizing spacing from `space-y-1` to `space-y-2` may increase tooltip height beyond comfortable bounds
- **Impact**: Tooltips may feel too tall or awkward on small screens
- **Mitigation**: Test with realistic data; revert to `space-y-1` if `space-y-2` proves too spacious (acceptable to prioritize UX over arbitrary standardization)

- **Risk**: Removing className props from MembershipIndicator is a breaking API change
- **Impact**: Any call sites passing these props will fail TypeScript compilation
- **Mitigation**: TypeScript compiler will identify all call sites; fix them during Slice 3-4 (this is the intended mechanism)

### Open Questions

- **Question**: Should tooltip width be configurable via a prop, or is hard-coding acceptable?
- **Why it matters**: Hard-coding removes flexibility but enforces consistency; configurable width adds complexity
- **Owner / follow-up**: **RESOLVED** - Hard-code to `w-72` (kit cards already use this width; provides room for complex membership content). This aligns with workflow principle: "no className props."

- **Question**: Should list spacing be `space-y-2` or `space-y-1`?
- **Why it matters**: Affects vertical rhythm and tooltip height
- **Owner / follow-up**: Decision: Start with `space-y-2` (more common pattern); adjust if tests or visual review reveal issues.

- **Question**: Should metadata text size be `text-xs` or `text-[11px]`?
- **Why it matters**: Affects readability and consistency with Tailwind conventions
- **Owner / follow-up**: Decision: Use `text-xs` (standard Tailwind size); `text-[11px]` is arbitrary custom value to eliminate.

## 16) Confidence

Confidence: High — All four tooltip render functions follow identical structure; component API is straightforward; risks are low-impact visual tweaks; test coverage exists to validate no regressions; TypeScript will enforce prop removal at call sites.

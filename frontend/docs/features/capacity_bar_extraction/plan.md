# CapacityBar Component Extraction Plan

## 0) Research Log & Findings

**Discovery Scope:**
- Searched for usage pattern: "Usage:" text followed by progress bar visualization
- Identified existing `ProgressBar` component at `/work/frontend/src/components/ui/progress-bar.tsx`
- Examined current implementations in box-card and box-details components
- Reviewed Playwright test coverage in `tests/e2e/boxes/boxes-list.spec.ts` and `tests/e2e/boxes/boxes-detail.spec.ts`
- Consulted UI data display guidelines at `docs/contribute/ui/data_display.md`
- Verified component export pattern in `src/components/ui/index.ts`

**Key Findings:**
- The capacity bar pattern appears exactly twice: `box-card.tsx` (lines 49-60) and `box-details.tsx` (lines 257-266)
- Both implementations are semantically identical with minor spacing differences (mt-3 vs mt-2)
- Existing `ProgressBar` component provides lower-level bar visualization but not the label+bar combination
- No Playwright tests directly reference the progress bar UI elements (tests focus on usage percentage in badge metadata)
- Pattern combines text label with progress visualization, similar to how `MetricDisplay` combines label+value
- Both usages show storage capacity (occupied/total locations), making this a domain-agnostic "capacity display" pattern

**Resolved Decisions:**
1. Create `CapacityBar` as a higher-level component that encapsulates both label and progress bar
2. Standardize on `mt-2` spacing (from box-details) for consistency with DescriptionItem pattern
3. Do NOT expose className prop to enforce visual consistency
4. Accept numeric props (used, total) and calculate percentage internally
5. Support optional custom label to allow flexibility beyond "Usage:"
6. Reuse existing `ProgressBar` component internally for the visual progress bar
7. Accept minor visual regression in box-card spacing (mt-3 → mt-2) as acceptable loss

## 1) Intent & Scope

**User intent**

Extract duplicated capacity/usage display UI pattern into a reusable semantic component that combines textual usage information with visual progress bar representation.

**Prompt quotes**

"CapacityBar is a high-level UI component that displays resource usage/capacity with both textual and visual representation"

"Must be domain-agnostic (works for any capacity scenario, not just box storage)"

"Must NOT expose className prop (encapsulate all styling)"

"Component Requirements: Must handle props like: `used`, `total`, `label` (optional custom label instead of "Usage:")"

**In scope**

- Create new `CapacityBar` component in `src/components/ui/capacity-bar.tsx`
- Define clean component API with props: `used`, `total`, `label` (optional), `testId` (optional)
- Encapsulate all styling decisions without exposing className prop
- Calculate percentage internally from used/total values
- Refactor both existing usages in `box-card.tsx` and `box-details.tsx`
- Export from `src/components/ui/index.ts` for consistent import pattern
- Remove duplicated inline implementations completely

**Out of scope**

- Modifying Playwright test assertions (tests currently target metadata badges, not visual progress bars)
- Supporting custom color variants or theming options (use default primary color only)
- Backward compatibility or deprecation period (breaking change, immediate replacement)
- Supporting indeterminate/loading states (always requires used/total values)
- Adding instrumentation or test-specific events (visual display component only)
- Supporting different size variants (standardize on h-2 height from existing pattern)

**Assumptions / constraints**

- The pattern is stable and fully captured by the two existing implementations
- Minor spacing differences (mt-3 vs mt-2) are acceptable to standardize
- All capacity values are non-negative integers
- Percentage calculation rounds using Math.round() and clamps to 0-100 range
- Component follows existing UI component patterns (no className, testId support, semantic props)
- Box domain components will be refactored immediately in the same implementation slice
- No other domains currently use this pattern (verified via grep for "Usage:" and progress bar patterns)

## 2) Affected Areas & File Map

**New Files:**

- Area: CapacityBar component
- Why: Create new reusable UI component for capacity display pattern
- Evidence: N/A (new file)
  - Path: `/work/frontend/src/components/ui/capacity-bar.tsx`
  - Content: Component definition with props interface, implementation, displayName

**Modified Files:**

- Area: UI component exports
- Why: Export new CapacityBar component for consumption by domain components
- Evidence: `/work/frontend/src/components/ui/index.ts:1-53` — existing export pattern for reusable UI components like MetricDisplay, DescriptionItem, etc.

- Area: BoxCard component
- Why: Replace inline capacity display (lines 49-60) with CapacityBar component
- Evidence: `/work/frontend/src/components/boxes/box-card.tsx:49-60`
  ```tsx
  <div className="flex justify-between items-center">
    <div className="text-sm text-muted-foreground">
      Usage: {box.occupied_locations ?? 0}/{box.total_locations ?? box.capacity} ({Math.round(box.usage_percentage ?? 0)}%)
    </div>
  </div>

  <div className="mt-3 bg-muted rounded-full h-2">
    <div
      className="bg-primary h-2 rounded-full transition-all duration-300"
      style={{ width: `${Math.min(box.usage_percentage ?? 0, 100)}%` }}
    />
  </div>
  ```

- Area: BoxDetails component
- Why: Replace inline capacity display (lines 257-266) with CapacityBar component
- Evidence: `/work/frontend/src/components/boxes/box-details.tsx:257-266`
  ```tsx
  <div>
    <DescriptionItem
      label="Usage"
      value={`${usageStats.usedLocations}/${usageStats.totalLocations} (${usageStats.usagePercentage}%)`}
    />
    <div className="mt-2 h-2 w-full rounded-full bg-muted">
      <div
        className="h-2 rounded-full bg-primary transition-all duration-300"
        style={{ width: `${usageStats.usagePercentage}%` }}
      />
    </div>
  </div>
  ```

**Unaffected Areas (Verified):**

- Area: Playwright test specs
- Why: Tests assert on metadata badges (boxes.detail.metadata.usage), not visual progress bars
- Evidence:
  - `/work/frontend/tests/e2e/boxes/boxes-detail.spec.ts:103-106` — tests badge color and text, not progress bar
  - `/work/frontend/tests/e2e/boxes/boxes-list.spec.ts:30-151` — tests card visibility and search, not progress bar rendering

- Area: ProgressBar component
- Why: Remains unchanged; CapacityBar will compose it internally
- Evidence: `/work/frontend/src/components/ui/progress-bar.tsx:1-72` — existing component provides progress bar primitive

## 3) Data Model / Contracts

**Component Props Interface:**

- Entity / contract: CapacityBar component props
- Shape:
  ```typescript
  interface CapacityBarProps {
    /** Number of used/occupied units (e.g., occupied locations) */
    used: number;
    /** Total capacity/available units (e.g., total locations) */
    total: number;
    /** Optional label text (defaults to "Usage:") */
    label?: string;
    /** Optional test ID for the root element */
    testId?: string;
    // Note: className intentionally NOT supported to enforce consistent styling.
    // ProgressBar is composed internally with fixed size="md" and variant="default"
    // without any prop spreading or customization.
  }
  ```
- Mapping: Component calculates `percentage = Math.min(100, Math.round((used / total) * 100))` internally; consumers pass raw numeric values
- Evidence: N/A (new component contract)

**Consumer Data Mapping:**

- Entity / contract: BoxCard usage to CapacityBar props
- Shape:
  ```typescript
  // BoxCard receives:
  box: {
    occupied_locations?: number;
    total_locations?: number;
    capacity: number;
    usage_percentage?: number;  // Already calculated, but will be recalculated by CapacityBar
  }

  // Maps to:
  <CapacityBar
    used={box.occupied_locations ?? 0}
    total={box.total_locations ?? box.capacity}
    label="Usage"
  />
  ```
- Mapping: Direct pass-through of occupied/total values; percentage calculation moves to CapacityBar
- Evidence: `/work/frontend/src/components/boxes/box-card.tsx:4-13` — BoxCardProps interface and box data structure

- Entity / contract: BoxDetails usage to CapacityBar props
- Shape:
  ```typescript
  // BoxDetails computes:
  usageStats = {
    usedLocations: number;
    totalLocations: number;
    usagePercentage: number;  // Calculated, but will be recalculated by CapacityBar
  }

  // Maps to:
  <CapacityBar
    used={usageStats.usedLocations}
    total={usageStats.totalLocations}
  />
  ```
- Mapping: Pass computed usageStats values directly; remove manual percentage display
- Evidence: `/work/frontend/src/components/boxes/box-details.tsx:51-72` — usageStats memo calculation

## 4) API / Integration Surface

N/A — This is a pure presentational component with no API integration. It receives props from parent components that already fetch and compute box usage data via TanStack Query hooks (`useGetBoxes`, `useGetBoxesByBoxNo`).

## 5) Algorithms & UI Flows

**Component Render Flow:**

- Flow: CapacityBar rendering and percentage calculation
- Steps:
  1. Receive `used`, `total`, `label`, `testId` props
  2. Guard against invalid inputs: if `total <= 0`, render 0% to avoid division by zero
  3. Calculate percentage: `Math.min(100, Math.round((used / total) * 100))`
  4. Format display text: `{label ?? "Usage:"} {used}/{total} ({percentage}%)`
  5. Render text label with `text-sm text-muted-foreground` styling
  6. Render `ProgressBar` component with calculated percentage using hard-coded props:
     - `<ProgressBar value={percentage} size="md" variant="default" />`
     - No prop spreading; ProgressBar's className and other NativeDivProps are NOT exposed
  7. Apply `testId` to root container element if provided
- States / transitions: Stateless functional component; no internal state or transitions
- Hotspots: Percentage calculation must handle edge cases (total=0, used>total)
- Evidence: Pattern extracted from `/work/frontend/src/components/boxes/box-card.tsx:49-60` and `/work/frontend/src/components/boxes/box-details.tsx:257-266`

**Refactoring Flow for BoxCard:**

- Flow: Replace inline capacity display with CapacityBar component
- Steps:
  1. Import CapacityBar from `@/components/ui`
  2. Remove existing inline div structure (lines 48-60)
  3. Insert `<CapacityBar used={...} total={...} />` with appropriate props
  4. Remove outer `flex justify-between` wrapper (CapacityBar is self-contained)
  5. Verify visual rendering matches original (mt-2 spacing instead of mt-3)
- States / transitions: No state changes; static rendering only
- Hotspots: Spacing adjustment from mt-3 to mt-2 (acceptable visual difference)
- Evidence: `/work/frontend/src/components/boxes/box-card.tsx:48-60`

**Refactoring Flow for BoxDetails:**

- Flow: Replace DescriptionItem + inline progress bar with CapacityBar component
- Steps:
  1. Import CapacityBar from `@/components/ui`
  2. Remove wrapping `<div>` around DescriptionItem and progress bar (lines 256-267)
  3. Remove DescriptionItem for "Usage" label (CapacityBar includes label)
  4. Insert `<CapacityBar used={usageStats.usedLocations} total={usageStats.totalLocations} />`
  5. Verify layout within CardContent space-y-4 grid
- States / transitions: No state changes; static rendering only
- Hotspots: Removing DescriptionItem changes vertical rhythm slightly but maintains semantic clarity
- Evidence: `/work/frontend/src/components/boxes/box-details.tsx:256-267`

## 6) Derived State & Invariants

**Derived Values:**

- Derived value: percentage
  - Source: Computed from `used` and `total` props passed to CapacityBar
  - Writes / cleanup: No writes; pure calculation rendered directly in UI
  - Guards:
    - `total <= 0` → percentage = 0 (avoid division by zero)
    - `used > total` → clamped to 100% via `Math.min(100, percentage)`
    - `used < 0` or `total < 0` → undefined behavior (assumes non-negative inputs from consumers)
  - Invariant: Percentage must always be in range [0, 100] for valid ProgressBar rendering
  - Evidence: Pattern from `/work/frontend/src/components/boxes/box-card.tsx:51` — `Math.round(box.usage_percentage ?? 0)` with `Math.min(box.usage_percentage ?? 0, 100)` clamping

- Derived value: displayText (label + used/total + percentage)
  - Source: Formatted string from `label`, `used`, `total`, and computed `percentage`
  - Writes / cleanup: No writes; ephemeral string for text rendering
  - Guards: Default label to "Usage:" if not provided
  - Invariant: Text format must match existing pattern: `{label} {used}/{total} ({percentage}%)`
  - Evidence: Pattern from `/work/frontend/src/components/boxes/box-card.tsx:51` and `/work/frontend/src/components/boxes/box-details.tsx:259`

- Derived value: usageStats (BoxDetails only)
  - Source: Computed in BoxDetails from `box` and `boxes` TanStack Query data
  - Writes / cleanup: Passed as props to CapacityBar; no mutations
  - Guards: Fallback to 0 for missing occupied_locations, fallback to box.capacity for missing total_locations
  - Invariant: usageStats must be recalculated when box or boxes data changes (already handled by useMemo)
  - Evidence: `/work/frontend/src/components/boxes/box-details.tsx:51-72` — useMemo with dependencies [box, boxes, boxNo]

## 7) State Consistency & Async Coordination

- Source of truth: Props passed from parent components (BoxCard, BoxDetails)
- Coordination: CapacityBar is a pure presentational component; parent components own data fetching via TanStack Query (`useGetBoxes`, `useGetBoxesByBoxNo`)
- Async safeguards: N/A — component receives already-fetched data; no async operations within CapacityBar
- Instrumentation: No instrumentation events emitted; component is visual-only. Existing instrumentation in BoxDetails (`useListLoadingInstrumentation`) already tracks usage percentage in metadata
- Evidence:
  - BoxCard: `/work/frontend/src/components/boxes/box-card.tsx:3-15` — receives box prop from parent
  - BoxDetails: `/work/frontend/src/components/boxes/box-details.tsx:74-99` — `useListLoadingInstrumentation` emits usagePercentage in ready metadata

## 8) Errors & Edge Cases

**Edge Cases Handled:**

- Failure: total = 0 (division by zero)
- Surface: CapacityBar component
- Handling: Return percentage = 0, render "0/0 (0%)" to avoid crash
- Guardrails: Explicit check: `if (total <= 0) return 0;` before division
- Evidence: Inferred from existing clamping pattern in `/work/frontend/src/components/boxes/box-card.tsx:58` — `Math.min(box.usage_percentage ?? 0, 100)` suggests defensive percentage handling

- Failure: used > total (invalid state, over-capacity)
- Surface: CapacityBar component
- Handling: Calculate percentage normally but clamp to 100% via Math.min
- Guardrails: `Math.min(100, Math.round((used / total) * 100))` in percentage calculation
- Evidence: Existing pattern in `/work/frontend/src/components/boxes/box-card.tsx:58` — clamping to 100%

- Failure: used or total are negative numbers
- Surface: CapacityBar component
- Handling: Undefined behavior; assumes consumers pass valid non-negative integers
- Guardrails: TypeScript type checking enforces number type but not range; document prop constraints in JSDoc
- Evidence: No existing validation in box components; assumption that backend provides valid data

- Failure: used or total are undefined/null
- Surface: Parent components (BoxCard, BoxDetails)
- Handling: Parent components provide fallback defaults (e.g., `box.occupied_locations ?? 0`)
- Guardrails: Consumers must handle null/undefined before passing to CapacityBar
- Evidence:
  - BoxCard: `/work/frontend/src/components/boxes/box-card.tsx:51` — `box.occupied_locations ?? 0`
  - BoxDetails: `/work/frontend/src/components/boxes/box-details.tsx:54-62` — explicit fallback logic in useMemo

**Visual Edge Cases:**

- Failure: Very long box descriptions causing text overflow in BoxCard
- Surface: BoxCard component layout
- Handling: Existing card layout handles overflow; CapacityBar width is constrained by parent CardContent
- Guardrails: CapacityBar uses `w-full` to fill parent container; no absolute widths
- Evidence: CardContent manages padding and width constraints in `/work/frontend/src/components/boxes/box-card.tsx:48`

- Failure: Empty state (no boxes exist)
- Surface: Parent list/detail components
- Handling: CapacityBar never renders in empty state; parent components show EmptyState UI
- Guardrails: Component only renders when box data exists
- Evidence: BoxDetails conditional rendering in `/work/frontend/src/components/boxes/box-details.tsx:198-232` — guards against missing box

## 9) Observability / Instrumentation

**Test Identifiers:**

- Signal: data-testid on root element
- Type: Test selector attribute
- Trigger: When testId prop is provided to CapacityBar
- Labels / fields: Single testId string passed through to root container div
- Consumer: Playwright tests (if added in future; currently no tests target visual progress bars)
- Evidence: Pattern from existing UI components in `/work/frontend/src/components/ui/metric-display.tsx:58` — testId applied to value element

**Existing Instrumentation (Unchanged):**

- Signal: boxes.detail.metadata.usage badge
- Type: KeyValueBadge with usage percentage
- Trigger: BoxDetails ready state
- Labels / fields: Usage percentage, danger color when >= 90%
- Consumer: Playwright test in `/work/frontend/tests/e2e/boxes/boxes-detail.spec.ts:103-106`
- Evidence: Test asserts on badge text and color, not on CapacityBar visual rendering

- Signal: ListLoading event with usagePercentage metadata
- Type: Instrumentation event via useListLoadingInstrumentation
- Trigger: boxes.detail query ready state
- Labels / fields: status, boxNo, capacity, locationCount, usagePercentage
- Consumer: Playwright wait helpers and test metadata assertions
- Evidence: `/work/frontend/src/components/boxes/box-details.tsx:74-99` — instrumentation hook emits metadata

## 10) Lifecycle & Background Work

N/A — CapacityBar is a stateless presentational component with no lifecycle hooks, effects, subscriptions, or background work. It renders synchronously based on props and has no cleanup requirements.

## 11) Security & Permissions

N/A — CapacityBar is a pure UI component with no authentication, authorization, or data exposure concerns. It displays data already fetched and authorized by parent components.

## 12) UX / UI Impact

**Visual Changes:**

- Entry point: Box list cards (`/boxes` route, card grid)
- Change: Capacity display spacing adjusted from mt-3 to mt-2
- User interaction: No behavioral change; visual spacing difference of ~4px (0.25rem)
- Dependencies: BoxCard component refactoring
- Evidence: `/work/frontend/src/components/boxes/box-card.tsx:55` — existing mt-3 spacing on progress bar container

- Entry point: Box detail view (`/boxes/:boxNo` route, summary card)
- Change: DescriptionItem label removed; CapacityBar provides integrated label + progress bar
- User interaction: No behavioral change; slight vertical rhythm adjustment due to DescriptionItem removal
- Dependencies: BoxDetails component refactoring
- Evidence: `/work/frontend/src/components/boxes/box-details.tsx:257-266` — current DescriptionItem + inline progress bar structure

**Accessibility:**

- Entry point: CapacityBar component
- Change: Ensure screen reader accessible text and progress bar semantics
- User interaction: Screen readers should announce "Usage: X of Y (percentage%)" followed by progress bar role
- Dependencies: Compose ProgressBar component which already has proper ARIA attributes
- Evidence: `/work/frontend/src/components/ui/progress-bar.tsx:44-48` — existing role="progressbar" with ARIA attributes

**Consistency Improvements:**

- Entry point: All capacity display use cases (current and future)
- Change: Standardized visual pattern for capacity/usage displays across application
- User interaction: Consistent presentation improves scanability and reduces cognitive load
- Dependencies: CapacityBar adoption in other domains if similar patterns emerge
- Evidence: Design principle from prompt: "Must be domain-agnostic (works for any capacity scenario, not just box storage)"

## 13) Deterministic Test Plan

**Test Coverage Assessment:**

Current Playwright tests do NOT directly assert on visual progress bar rendering. Tests focus on:
- Box card visibility and metadata badges
- Usage percentage displayed in metadata badges (boxes.detail.metadata.usage)
- Badge color changes at 90% threshold

**No Test Changes Required:**

- Surface: boxes-list.spec.ts
- Scenarios:
  - Given boxes list loaded, When viewing box cards, Then cards display with usage information
  - (Existing test already passes with visual change; no assertions on progress bar)
- Instrumentation / hooks: Existing card testid `boxes.list.item.{boxNo}` unchanged
- Gaps: No visual regression testing for progress bar rendering (acceptable; Playwright focuses on functional behavior)
- Evidence: `/work/frontend/tests/e2e/boxes/boxes-list.spec.ts:30-73` — tests search and card visibility, not progress bar

- Surface: boxes-detail.spec.ts
- Scenarios:
  - Given box detail loaded, When viewing summary, Then usage percentage displays in metadata badge
  - Given high usage box (90%+), When viewing detail, Then usage badge shows danger color
  - (Existing tests already pass with visual change; no assertions on progress bar in summary card)
- Instrumentation / hooks: Existing testid `boxes.detail.metadata.usage` unchanged (KeyValueBadge in header)
- Gaps: No assertions on CapacityBar in summary card (intentional; tests verify badge, not visual representation)
- Evidence: `/work/frontend/tests/e2e/boxes/boxes-detail.spec.ts:78-107` — tests usage badge color and text

**Future Test Opportunities (Out of Scope):**

- Surface: CapacityBar component (unit tests)
- Scenarios:
  - Given used=5, total=10, When component renders, Then displays "Usage: 5/10 (50%)"
  - Given used=0, total=0, When component renders, Then displays "Usage: 0/0 (0%)" without crashing
  - Given used=15, total=10, When component renders, Then progress bar capped at 100%
- Instrumentation / hooks: testId prop support for root element
- Gaps: No unit tests for UI components currently; Playwright provides integration coverage
- Evidence: Project testing strategy focuses on E2E integration tests over unit tests

## 14) Implementation Slices

**Single Slice (Small Refactoring):**

This is a straightforward technical debt cleanup with minimal risk. Implement as a single atomic change:

- Slice: Complete CapacityBar extraction and adoption
- Goal: Eliminate duplicated capacity display pattern and establish reusable component
- Touches:
  - Create `/work/frontend/src/components/ui/capacity-bar.tsx` (new component)
  - Update `/work/frontend/src/components/ui/index.ts` (export)
  - Refactor `/work/frontend/src/components/boxes/box-card.tsx` (consumer)
  - Refactor `/work/frontend/src/components/boxes/box-details.tsx` (consumer)
- Dependencies:
  - No backend changes required
  - No feature flags needed (immediate replacement)
  - No breaking changes to external APIs
  - Playwright tests pass without modification (verified no progress bar assertions)

**Verification Steps:**

1. Run `pnpm check` to verify TypeScript compilation
2. Run `pnpm dev` and manually verify:
   - Navigate to `/boxes` and confirm card capacity bars render correctly
   - Open a box detail view and confirm summary capacity bar renders correctly
   - Verify spacing and alignment match expectations (accept mt-2 standardization)
3. Run `pnpm playwright test tests/e2e/boxes/` to verify existing tests pass unchanged
4. Visual regression: Compare screenshots before/after to document spacing change

## 15) Risks & Open Questions

**Risks:**

- Risk: Spacing change (mt-3 → mt-2) in BoxCard may be visually noticeable
- Impact: Users may perceive slight layout shift in box cards; no functional impact
- Mitigation: Document as intentional standardization; spacing difference is minor (~4px). If significant pushback, component could accept optional spacing prop in future iteration.

- Risk: Removing DescriptionItem in BoxDetails changes vertical rhythm
- Impact: Summary card layout may feel slightly different due to removed label element
- Mitigation: CapacityBar provides integrated label, maintaining semantic meaning. Visual difference is acceptable for consistency gain.

- Risk: Future capacity display use cases may require customization not supported by initial API
- Impact: Component may need extension (e.g., color variants, size variants) if new use cases emerge
- Mitigation: Start with minimal API based on known requirements. Extend incrementally when new requirements are validated (YAGNI principle).

- Risk: No visual regression testing to catch unexpected layout changes
- Impact: Subtle visual bugs may not be caught by Playwright functional tests
- Mitigation: Manual verification during implementation; Playwright tests verify functional behavior (card visibility, metadata accuracy). Visual consistency is secondary concern.

- Risk: Division by zero if total=0 slips through parent component guards
- Impact: NaN or Infinity could break percentage rendering
- Mitigation: Implement defensive check in CapacityBar: `if (total <= 0) return 0;`. Document requirement for consumers to validate inputs.

**Open Questions:**

- Question: Should CapacityBar support testId for the label and progress bar separately?
- Why it matters: May improve Playwright selector specificity if future tests assert on visual elements
- Owner / follow-up: Implementation decision; start with single root testId (simpler). Add granular testIds only if tests require them.

- Question: Should CapacityBar support custom label for internationalization?
- Why it matters: Hardcoded "Usage:" may not translate well; optional label prop provides flexibility
- Owner / follow-up: Already addressed in design — `label` prop is optional with "Usage:" default. Future i18n support can override label externally.

- Question: Should CapacityBar reuse ProgressBar or implement bar rendering directly?
- Why it matters: Composition vs. duplication tradeoff; ProgressBar provides ARIA semantics
- Owner / follow-up: Composition is preferred; ProgressBar handles accessibility and styling correctly. CapacityBar composes ProgressBar for visual rendering.

- Question: Should component guard against negative inputs (used < 0, total < 0)?
- Why it matters: Defensive programming vs. trusting consumer data
- Owner / follow-up: Document assumption of non-negative inputs in JSDoc; TypeScript enforces number type. Backend data validation makes negative values unlikely. Add guards only if real-world issues surface.

## 16) Confidence

Confidence: High — This is a well-scoped technical debt refactoring with clear requirements, known usages, and minimal risk. Existing implementations provide complete specification. No API changes or test modifications required. The component follows established UI patterns (no className, testId support, semantic props) demonstrated by MetricDisplay and other UI components. Risk is limited to minor visual differences which are acceptable for consistency gains.

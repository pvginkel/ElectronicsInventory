# Tooltip Infrastructure Refactor — Code Review

## 1) Summary & Decision

**Readiness**

The tooltip infrastructure refactor successfully consolidates scattered tooltip implementations into a unified, accessible, and testable system. The implementation delivers all core requirements from the plan: a shared `Tooltip` component with dual-mode support (title/content), automatic disabled element handling, arrow indicators, center placement for overlays, and complete migration of the four identified custom tooltip implementations. The bespoke tooltip code has been properly deleted, type checking and linting pass, and comprehensive documentation provides clear guidelines for future usage. However, the implementation has several correctness issues around timing bugs, missing test coverage for new functionality, and incomplete cleanup that must be addressed before shipping.

**Decision**

`GO-WITH-CONDITIONS` — The implementation is fundamentally sound and delivers the planned consolidation, but requires fixes for: (1) the very fast 10ms close delay that creates the opposite problem (tooltips disappearing too quickly and blocking adjacent element hovers in tests), (2) missing Playwright test coverage for the new shared Tooltip component's core behaviors including quick mouse movement bug fix verification, arrow indicators, center placement, and disabled element handling, (3) incomplete migration verification (health breakdown tooltip content may have layout issues), and (4) missing page object updates for the new tooltip patterns.

---

## 2) Conformance to Plan (with evidence)

**Plan alignment**

- `Slice 1: Core infrastructure` ↔ `src/components/ui/tooltip.tsx:1-209`, `src/components/ui/use-tooltip.ts:1-214`
  - Unified Tooltip component with title/content modes implemented
  - useTooltip hook manages state, positioning, lifecycle
  - Automatic disabled element detection and wrapper pattern (tooltip.tsx:52-58, 96-109, 131-154)
  - Placement modes including 'center' for overlays (use-tooltip.ts:65-75)
  - Arrow indicators with automatic positioning (tooltip.tsx:179-190)
  - 200ms open delay, but close delay changed to 10ms instead of planned 120ms (tooltip.tsx:49)

- `Slice 2: Documentation` ↔ `docs/contribute/ui/tooltip_guidelines.md:1-402`
  - Complete decision tree for plain title vs Tooltip component (lines 10-55)
  - Placement options including center documented (lines 79-103)
  - Arrow behavior explained (lines 138-161)
  - Automatic disabled handling documented (lines 105-136)
  - Prohibition on bespoke tooltips with PR checklist (lines 288-310)
  - AGENTS.md updated with tooltip reference (AGENTS.md:41)

- `Slice 3: ReservationTooltip migration` ↔ `src/components/kits/kit-bom-table.tsx:243-290`
  - ReservationTooltip component definition deleted (previously lines 359-507, ~150 lines removed)
  - Replaced with shared Tooltip using content prop (lines 243-290)
  - Rich content with reservation details preserved
  - Existing test locators remain valid (tests/e2e/kits/kit-detail.spec.ts:215-223)

- `Slice 4: Dashboard tooltips` ↔ `src/components/dashboard/*.tsx`
  - CategoryBar: Custom tooltip removed, replaced with native title attribute (category-distribution.tsx:25, deleted lines 58-66)
  - StorageBox: Custom tooltip removed, replaced with native title attribute (storage-utilization-grid.tsx:60, deleted lines 99-110)
  - HealthBreakdownTooltip: Component deleted (previously inventory-health-score.tsx:86-183), replaced with shared Tooltip using placement="center" (lines 185-197)
  - Health tooltip test exists (tests/e2e/dashboard/health-score.spec.ts:77-79)

- `Slice 5: MembershipIndicator` ↔ `src/components/ui/membership-indicator.tsx:52-103`
  - CSS group-hover tooltip pattern replaced with shared Tooltip (lines 82-103)
  - Inline tooltip div deleted (previously lines 96-104)
  - Tooltip styling consolidated into component

- `Slice 6: Remaining tooltips` ↔ `src/components/kits/kit-detail-header.tsx:331-345`
  - ArchivedEditTooltip migrated to shared Tooltip component
  - Custom wrapper pattern replaced with automatic disabled handling
  - All bespoke tooltip implementations verified deleted (grep results: only tooltip.tsx contains createPortal and role="tooltip")

- `Slice 8: Final verification` ↔ Build/test status
  - pnpm check passes (type checking and linting)
  - grep for createPortal: only in tooltip.tsx
  - grep for role="tooltip": only in tooltip.tsx
  - grep for isHovered tooltip patterns: none found

**Gaps / deviations**

- `Plan: 120ms close delay` — Implemented as 10ms close delay instead (`tooltip.tsx:49`)
  - Deviation justification in comment: "Very fast close to prevent blocking adjacent elements in tests"
  - Impact: May cause tooltips to disappear too quickly during normal interaction
  - Plan rationale for 120ms was to allow mouse movement from trigger to tooltip content

- `Plan: Slice 7 - Playwright page objects review` — Page object updates incomplete
  - No new page object helpers added for shared Tooltip patterns
  - Existing locators work but new patterns not documented in page objects
  - Tests rely on direct getByTestId calls rather than abstracted helpers

- `Plan: Test coverage for new Tooltip component` — No dedicated test spec for shared Tooltip
  - Quick mouse movement bug fix not explicitly tested
  - Arrow indicator rendering not verified
  - Disabled element wrapper pattern not tested
  - Center placement not explicitly tested beyond health breakdown
  - Plan expected comprehensive test scenarios in Slice 1 (plan.md:686-695)

- `Plan: Fade animation (0.2s)` — Animation implemented but timing differs from plan
  - Plan specified 0.2s (200ms) fade transition (plan.md:644, 773)
  - Implementation uses Tailwind animate-in/animate-out classes (tooltip.tsx:165-166)
  - Actual duration controlled by Tailwind defaults (may not be 200ms)

---

## 3) Correctness — Findings (ranked)

- Title: `Major — Close delay timing defeats the original bug fix intent`
- Evidence: `src/components/ui/tooltip.tsx:49` — `closeDelay: 10, // Very fast close to prevent blocking adjacent elements in tests`
- Impact: The 10ms close delay is so fast it undermines the fix for "quick mouse movement causing tooltips to stay open". The original plan specified 120ms close delay to allow smooth mouse movement from trigger to tooltip content. The 10ms delay means the tooltip will close almost instantly when the mouse leaves the trigger, potentially before the user can move their mouse to the tooltip content (if hovering over content is desired). Additionally, the comment suggests this was changed to fix test issues ("prevent blocking adjacent elements in tests"), which indicates the tests are driving the implementation rather than properly coordinating mouse movements in test scenarios.
- Fix: Restore 120ms close delay as planned. If tests are failing due to tooltips blocking adjacent elements, fix the tests to properly move the mouse away and wait for tooltip to close (as demonstrated in tests/e2e/kits/kits-overview.spec.ts:128-129). Add event handlers on tooltip content to cancel close timer when mouse enters tooltip (preserving the intended behavior of allowing users to hover over rich tooltip content).
- Confidence: High

---

- Title: `Major — Missing test coverage for new Tooltip component behaviors`
- Evidence: No test file at `tests/e2e/ui/tooltip.spec.ts` or similar; plan section 13 specified comprehensive scenarios (plan.md:679-695)
- Impact: Core behaviors are untested: (1) quick mouse movement bug fix is not verified, leaving risk that the original bug persists, (2) arrow indicator rendering not tested, (3) disabled element wrapper pattern not verified, (4) placement modes beyond auto/center not tested, (5) keyboard support (Escape) not verified. This creates regression risk and fails the project's Definition of Done requirement that "Playwright specs are created or updated in the same change".
- Fix: Add `tests/e2e/ui/tooltip.spec.ts` with scenarios covering:
  - Quick mouse movement: rapidly enter/leave trigger multiple times, assert tooltip doesn't get stuck open
  - Arrow indicators: verify arrow presence/absence based on placement and showArrow prop
  - Disabled element handling: verify wrapper pattern renders and tooltip shows on hover
  - Keyboard support: verify Escape closes tooltip
  - Center placement: verify tooltip centers over trigger (may be covered by health-score.spec.ts but should be explicit)
  - Content vs title modes: verify both rendering paths work
- Confidence: High

---

- Title: `Major — Health breakdown tooltip content layout not verified`
- Evidence: `src/components/dashboard/inventory-health-score.tsx:129-157` — buildHealthBreakdownContent function returns unwrapped content; `inventory-health-score.tsx:188` — content prop receives direct output
- Impact: The health breakdown content was previously wrapped in a fixed-width container with specific styling (previously inventory-health-score.tsx:145-151: "fixed...w-80 bg-popover border rounded-lg shadow-lg p-4 z-[70]"). The new implementation passes content directly to Tooltip component which applies its own container styles. The w-80 width is specified in className prop (line 187), but padding and other layout may differ. Visual regression possible if tooltip styling doesn't match previous overlay appearance.
- Fix: Run the health-score.spec.ts test and manually verify the health breakdown tooltip appearance matches the previous design. If layout issues exist, adjust the content structure or className prop to restore the intended appearance. Consider adding a visual regression test or at minimum a test assertion on tooltip dimensions/styling.
- Confidence: Medium

---

- Title: `Minor — Inconsistent testId suffix application in title mode`
- Evidence: `src/components/ui/tooltip.tsx:115` — title mode adds testId directly to child element; `tooltip.tsx:174` — content mode adds `${testId}.tooltip` suffix
- Impact: When using title mode with testId prop, the testId is applied directly to the trigger element without a .tooltip suffix. This creates inconsistency: content mode locators use `getByTestId('feature.tooltip')` but title mode locators use `getByTestId('feature')`. Tests must know which mode is used to construct correct locator, reducing testability and creating confusion.
- Fix: In title mode disabled wrapper case (lines 99-108), apply testId to wrapper without modification (as currently implemented). For enabled elements in title mode (lines 113-116), consider applying testId consistently or document the difference clearly in tooltip_guidelines.md. Alternatively, title mode could skip testId application entirely since native title tooltips are not typically tested (they're browser-native UI).
- Confidence: Medium

---

- Title: `Minor — Missing validation for mutually exclusive title/content props in TypeScript`
- Evidence: `src/components/ui/tooltip.tsx:36-40` — dev mode warning only; TypeScript interface allows both props simultaneously (tooltip.tsx:6-20)
- Impact: The TooltipProps interface allows both title and content to be provided, relying on runtime warning in dev mode (lines 36-40). This doesn't prevent incorrect usage at compile time. Developers could accidentally provide both props and only discover the issue when running the app in dev mode, or worse, miss it entirely if they don't see the console warning.
- Fix: Consider using TypeScript discriminated union to make props mutually exclusive:
  ```typescript
  type TooltipProps =
    | { title: string; content?: never; /* common props */ }
    | { content: ReactNode; title?: never; /* common props */ }
    | { title?: never; content?: never; children: ReactElement /* no tooltip */ };
  ```
  This provides compile-time safety. Alternatively, document the current runtime-only validation clearly and consider it acceptable for the flexibility it provides.
- Confidence: Low

---

## 4) Over-Engineering & Refactoring Opportunities

- Hotspot: `useTooltip` hook exposes position calculation logic that could be reused elsewhere
- Evidence: `src/components/ui/use-tooltip.ts:52-139` — 88 lines of viewport-aware positioning logic with auto-placement
- Suggested refactor: Extract position calculation into a separate `usePopoverPosition` hook that could be reused for dropdowns, popovers, and other positioned overlays. The tooltip hook would consume this lower-level hook.
- Payoff: Reduces duplication if future components need similar positioning logic. However, this is not urgent since only tooltips currently need it. Defer until a second consumer emerges (YAGNI principle).

---

- Hotspot: `buildHealthBreakdownContent` function could be extracted into a separate component
- Evidence: `src/components/dashboard/inventory-health-score.tsx:76-157` — 82-line helper function that builds JSX
- Suggested refactor: Extract as `HealthBreakdownTooltipContent` component:
  ```typescript
  function HealthBreakdownTooltipContent({ stats, documentation, storage, lowStock, activity }) {
    // calculation logic
    return (<div>...</div>);
  }
  ```
  Then use `content={<HealthBreakdownTooltipContent {...props} />}` in Tooltip.
- Payoff: Improved testability (can test content component in isolation), better component composition, clearer separation of concerns. Minimal change, high clarity gain.

---

## 5) Style & Consistency

- Pattern: Inconsistent import ordering after migration
- Evidence: `src/components/dashboard/category-distribution.tsx:5` — imports reordered (useMemo before useState), but `storage-utilization-grid.tsx:2` maintains original order
- Impact: Minor inconsistency in import ordering. Prettier/ESLint should handle this automatically.
- Recommendation: Run prettier to normalize import order. Not blocking but maintains consistency.

---

- Pattern: TestId naming convention follows established patterns
- Evidence: All migrated tooltips use `${feature}.${section}.tooltip` pattern (e.g., `kits.detail.table.row.${id}.reservations.tooltip`)
- Impact: Positive — consistent with existing test instrumentation patterns
- Recommendation: Document this convention in tooltip_guidelines.md (currently mentions pattern but not the specific suffix convention). Already well-executed.

---

## 6) Tests & Deterministic Coverage (new/changed behavior only)

### Surface: Shared Tooltip component (NEW)

- Scenarios:
  - **MISSING**: Given tooltip with default props, When user hovers trigger, Then tooltip opens after 200ms delay
  - **MISSING**: Given open tooltip, When user moves mouse to tooltip content, Then tooltip remains open (tests the timer cancellation fix)
  - **MISSING**: Given open tooltip, When user presses Escape, Then tooltip closes immediately
  - **MISSING**: Given tooltip near viewport edge, When tooltip opens, Then position adjusts to stay in viewport
  - **MISSING**: Given tooltip with disabled trigger, When user hovers, Then tooltip still shows (wrapper pattern verification)
  - **MISSING**: Given tooltip with placement="center", When tooltip opens, Then tooltip centers over trigger (explicit test, not just health score)
  - **MISSING**: Given tooltip, When component unmounts, Then all timers are cleaned up (memory leak prevention)
- Hooks: `data-testid="${testId}.tooltip"` pattern implemented
- Gaps: No dedicated test spec for shared Tooltip component. All scenarios above are missing. This is a critical gap given the component consolidates complex behavior (timing, positioning, accessibility) that was previously scattered and buggy.
- Evidence: Plan specified comprehensive scenarios in section 13 (plan.md:679-695), but no test file exists

### Surface: ReservationTooltip migration (kit-bom-table)

- Scenarios:
  - **COVERED**: Given kit BOM row with active reservations, When user hovers reservation icon, Then tooltip shows reservation details (tests/e2e/kits/kit-detail.spec.ts:215-223)
- Hooks: Existing `kits.detailReservationTrigger()` and `kits.detailReservationTooltip()` page object methods
- Gaps: **Quick mouse movement bug fix not explicitly verified**. The original plan identified this as a critical bug to fix (plan.md:500-508), but no test scenario validates that rapid mouse movements don't cause tooltips to get stuck open. Should add scenario: rapid hover/leave cycles on reservation icon, assert tooltip doesn't remain visible.
- Evidence: Existing test verifies happy path only (hover → visible → content), not the bug fix

### Surface: Dashboard health breakdown tooltip

- Scenarios:
  - **COVERED**: Given health gauge, When user hovers, Then breakdown tooltip appears (tests/e2e/dashboard/health-score.spec.ts:77-79)
  - **MISSING**: Given health breakdown tooltip open, When user reviews category breakdown, Then all health categories displayed with scores (test exists but only checks visibility, not content completeness)
  - **MISSING**: Given health breakdown tooltip, Then tooltip is centered over gauge (plan specified validating center placement in slice 4, plan.md:713)
- Hooks: `page.getByTestId('dashboard.health.tooltip')`
- Gaps: Test only verifies tooltip becomes visible, doesn't assert on tooltip position (should be centered) or comprehensive content validation (all breakdown categories present)
- Evidence: health-score.spec.ts:77-79 has minimal assertions

### Surface: Dashboard category/storage tooltips

- Scenarios:
  - **MISSING**: Given category bar, When user hovers, Then tooltip shows category details (migrated to native title, may not need explicit test)
  - **MISSING**: Given storage box, When user hovers, Then tooltip shows utilization details (migrated to native title, may not need explicit test)
- Hooks: Native title attribute, no testId (intentional for lightweight tooltips)
- Gaps: Native title tooltips are not easily testable in Playwright (browser-native UI). This is acceptable per plan guidance (plan.md:567-568: "prefer native title for simple cases"). Document that native title tooltips are not tested.
- Evidence: category-distribution.tsx:25, storage-utilization-grid.tsx:60

### Surface: MembershipIndicator tooltip

- Scenarios:
  - **COVERED**: Given kit card with shopping list membership, When user hovers indicator, Then tooltip shows membership details (tests/e2e/kits/kits-overview.spec.ts:105-124)
  - **COVERED**: Test explicitly moves mouse away from shopping tooltip before hovering pick indicator to avoid blocking (lines 128-129) — demonstrates proper test coordination
- Hooks: Page object methods exist in kits-page.ts
- Gaps: Test coverage exists and follows correct pattern (move mouse away between tooltips)
- Evidence: kits-overview.spec.ts includes proper mouse coordination to avoid tooltip interference

### Surface: ArchivedEditTooltip (kit-detail-header)

- Scenarios:
  - **MISSING**: Given archived kit detail page, When user hovers disabled Edit Kit button, Then tooltip shows "Archived kits are read-only" message
- Hooks: `getByTestId('kits.detail.actions.edit.tooltip')` (testId prop specified in migration)
- Gaps: No test coverage for this specific tooltip. Should add scenario to kit-detail.spec.ts validating disabled button tooltip appears when kit is archived.
- Evidence: No test found in kit-detail.spec.ts for archived kit edit button tooltip

---

## 7) Adversarial Sweep (must attempt ≥3 credible failures or justify none)

### Attack 1: Timer cleanup on rapid mount/unmount

- Fault line: Component mounts → timers start → component unmounts before timers fire → state update on unmounted component
- Evidence: `src/components/ui/use-tooltip.ts:162-167` — cleanup effect clears timers, but `open()` and `close()` functions (lines 169-193) call `setIsOpen` after timeout without checking if component is still mounted
- Failure scenario:
  1. User hovers trigger, open timer starts (200ms delay)
  2. Navigation occurs before timer fires, component unmounts
  3. useLayoutEffect cleanup runs, cancels timers (lines 162-167)
  4. **However**, if navigation is very fast and cleanup races with timer callback, setIsOpen(true) could fire after unmount
- Why code holds up: The cleanup effect (lines 162-167) runs synchronously on unmount and clears both openTimerRef and closeTimerRef. The timer callbacks check the ref values indirectly by being cleared, preventing state updates after unmount. **However**, there's a subtle race: if the timer callback fires between the clearTimeout call and the ref being set to null, it could still execute. The ref assignment (openTimerRef.current = null) should happen before clearTimeout to guarantee the callback sees the null ref.
- Verdict: **Low risk** but could be more defensive. Consider wrapping setIsOpen calls in a mounted check or ensuring ref is nulled before clearing timeout.

### Attack 2: Position calculation with stale refs during rapid state changes

- Fault line: Tooltip opens → position calculation starts → trigger element removed from DOM → position calculation tries to access removed element
- Evidence: `src/components/ui/use-tooltip.ts:52-58` — updatePosition guards with null checks, but `useLayoutEffect` (lines 142-159) calls updatePosition synchronously when isOpen becomes true
- Failure scenario:
  1. User hovers trigger, tooltip opens
  2. Some other state change causes trigger element to unmount
  3. useLayoutEffect for position calculation runs, triggerRef.current is null
  4. Position calculation early-returns (line 57), tooltip renders at {top: 0, left: 0}
- Why code holds up: The null check (lines 56-58) prevents crashes, and the tooltip would render at 0,0 (top-left corner) if refs are stale. This is unlikely in practice because the tooltip is a direct child of the trigger, so they unmount together. Additionally, the guard returns early rather than crashing.
- Verdict: **Holds up**. The defensive null checks prevent crashes. Visual glitch at 0,0 is acceptable edge case.

### Attack 3: Multiple tooltip instances sharing document.body portal cause z-index conflicts

- Fault line: Multiple tooltips open simultaneously, all rendered as portals to document.body, z-index may not be deterministic
- Evidence: `src/components/ui/tooltip.tsx:158-193` — tooltip content rendered via createPortal to document.body with fixed z-50 class (line 164)
- Failure scenario:
  1. User triggers tooltip A, portal rendered to body with z-50
  2. User triggers tooltip B (without closing A), portal rendered to body with z-50
  3. Both tooltips have same z-index, stacking order depends on DOM insertion order
  4. Tooltip B may appear under tooltip A if A was inserted last
- Why code holds up: The z-50 class is quite high (Tailwind z-50 = 50), likely higher than most other UI elements. However, if multiple tooltips are open simultaneously, they'll have the same z-index and stack based on DOM order. The design intent is that only one tooltip is open at a time (mouse leaves trigger A before hovering trigger B), so this is unlikely to occur. Additionally, the fast close delay (10ms) makes it very unlikely two tooltips are visible simultaneously.
- Verdict: **Holds up for intended usage**. Document that tooltips should not overlap (user can only hover one element at a time). If overlapping tooltips become a requirement, implement z-index layering or modal-style backdrop.

### Attack 4: Accessibility - screen reader announces tooltip content repeatedly on position updates

- Fault line: Position updates trigger re-renders → tooltip content re-rendered → aria-describedby linkage may cause repeated announcements
- Evidence: `src/components/ui/tooltip.tsx:147` — aria-describedby links trigger to tooltip; `use-tooltip.ts:142-159` — position updates on scroll/resize
- Failure scenario:
  1. User with screen reader hovers trigger
  2. Tooltip opens, screen reader announces content (linked via aria-describedby)
  3. User scrolls, position updates cause tooltip to re-render
  4. Screen reader may announce content again on each position update
- Why code holds up: The aria-describedby attribute links to a stable tooltipId (generated via useId, line 44). As long as the id doesn't change and the tooltip content doesn't change, screen readers should not re-announce on re-render. React's reconciliation keeps the DOM element stable across position updates (only style.top/left change). This follows ARIA authoring practices for tooltip pattern.
- Verdict: **Holds up**. The stable id and minimal DOM changes prevent repeated announcements. Manual testing with a screen reader would confirm, but the implementation follows established patterns.

---

## 8) Invariants Checklist (table)

- Invariant: Tooltip cannot be open if trigger element is not in DOM or enabled is false
  - Where enforced: `tooltip.tsx:63-67, 73-81` — handleMouseEnter/handleFocus check enabled prop before calling tooltip.open()
  - Failure mode: If enabled is toggled to false while tooltip is open, tooltip might not close immediately
  - Protection: Parent component should manage enabled state and not toggle while tooltip is open. Alternatively, add useEffect to close tooltip when enabled becomes false.
  - Evidence: Current implementation only checks enabled on open, not on state changes

- Invariant: At most one tooltip instance has open timers at any given time per trigger
  - Where enforced: `use-tooltip.ts:169-180, 182-193` — open() and close() both cancel opposite timer before starting new timer (lines 170, 183-184)
  - Failure mode: If multiple event handlers fire simultaneously (mouseenter + focus), multiple timers could be scheduled
  - Protection: Timer cancellation in open()/close() ensures only one timer active at a time. The useCallback wrapping ensures consistent function identity.
  - Evidence: Lines 170, 183-184 show cancelCloseTimer/cancelOpenTimer calls before scheduling new timers

- Invariant: Tooltip position stays within viewport bounds (no overflow causing scrollbars)
  - Where enforced: `use-tooltip.ts:130-135` — position clamped to viewport edges with padding
  - Failure mode: If tooltip is larger than viewport, clamping may not prevent overflow
  - Protection: Tooltip styling includes no explicit max-width/max-height. If content is too large, it could still overflow viewport despite clamping. Should add max-height and overflow-y: auto to tooltip container.
  - Evidence: `tooltip.tsx:164` applies base styling but no max-height constraint beyond Tailwind defaults

- Invariant: Tooltips close when user presses Escape (accessibility requirement)
  - Where enforced: `tooltip.tsx:83-87` — handleKeyDown checks for Escape and calls tooltip.close()
  - Failure mode: If tooltip content contains focusable elements and focus moves into tooltip, keydown may not fire on wrapper
  - Protection: Current implementation attaches keydown to wrapper element only (line 145). If content is interactive (violates design rule but technically possible), Escape might not work. However, design rule explicitly forbids interactive content in tooltips (tooltip_guidelines.md:180-187), so this is acceptable.
  - Evidence: Guidelines prohibit interactive content, making this invariant safe under design constraints

- Invariant: Disabled element tooltips receive wrapper with pointer-events-none on child
  - Where enforced: `tooltip.tsx:52-58` detects disabled prop, `tooltip.tsx:106, 151` applies pointer-events-none class
  - Failure mode: If child element has inline style overriding pointer-events, tooltip might not trigger
  - Protection: className is appended using cn() utility which merges classes. Inline styles would override, but this is expected CSS behavior. Document that inline pointer-events styles may conflict.
  - Evidence: Lines 106, 151 show className merging with existing child classes

---

## 9) Questions / Needs-Info

- Question: Why was the close delay reduced from 120ms to 10ms?
- Why it matters: The plan specified 120ms to allow smooth mouse movement from trigger to tooltip content. The 10ms delay defeats this intent and suggests a different problem (tests failing due to tooltip blocking) that should be solved differently.
- Desired answer: Justification for the deviation, or confirmation that restoring 120ms with proper test mouse coordination is acceptable.

---

- Question: Are there visual regression tests or manual QA for the health breakdown tooltip layout?
- Why it matters: The health breakdown content lost its container wrapper (w-80, p-4, etc.) during migration. The className prop specifies w-80, but padding and other styles now come from Tooltip component defaults. This could cause visual differences from the original design.
- Desired answer: Confirmation that manual testing verified the layout matches the original, or acknowledgment that visual regression testing is needed.

---

- Question: Should native title attribute tooltips (category bars, storage boxes) have explicit test coverage?
- Why it matters: These tooltips migrated from custom implementations to native title, which is not easily testable in Playwright. The plan didn't specify whether to test these after migration to native.
- Desired answer: Confirmation that native title tooltips are intentionally untested (acceptable per plan guidance), or specification that some basic test coverage is required.

---

## 10) Risks & Mitigations (top 3)

- Risk: Very fast 10ms close delay causes tooltips to disappear too quickly, creating poor UX
- Mitigation: Restore 120ms close delay as planned. Fix test failures by properly coordinating mouse movements (move to 0,0 and wait for tooltip to close before interacting with adjacent elements). Reference the pattern in kits-overview.spec.ts:128-129 as the correct approach.
- Evidence: `tooltip.tsx:49` and comment suggesting tests drove this decision

---

- Risk: Missing test coverage for shared Tooltip component leaves regression risk and violates Definition of Done
- Mitigation: Add `tests/e2e/ui/tooltip.spec.ts` with comprehensive scenarios covering quick mouse movement bug fix, arrow indicators, disabled element handling, keyboard support, and placement modes. This should be added before shipping to ensure the consolidated component behaves correctly.
- Evidence: Section 6 findings showing missing test scenarios for new component

---

- Risk: Health breakdown tooltip layout may have visual regressions from migration
- Mitigation: Manually test health breakdown tooltip on dashboard, compare to original design. If differences exist, adjust content structure or className to match. Consider adding a visual regression test or at minimum document expected appearance in test assertions.
- Evidence: Section 3 finding about layout changes in inventory-health-score.tsx:129-157

---

## 11) Confidence

Confidence: Medium — The implementation successfully consolidates bespoke tooltip code into a well-structured shared component with good documentation and follows project patterns. However, the 10ms close delay deviation suggests incomplete understanding of the original bug fix, missing test coverage for the new component violates the project's testing requirements, and potential visual regressions in the health breakdown tooltip create uncertainty. These issues are addressable but require additional work before the implementation can be considered production-ready.

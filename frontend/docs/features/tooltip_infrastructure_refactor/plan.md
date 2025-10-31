# Tooltip Infrastructure Refactor — Technical Plan

## 0) Research Log & Findings

### Discovery Work

Scanned the codebase to identify tooltip implementations and patterns. Key findings:

**Current tooltip implementations (14 files):**
- `/work/frontend/src/components/kits/kit-bom-table.tsx` — ReservationTooltip component with portal, manual positioning, mouse enter/leave handlers
- `/work/frontend/src/components/dashboard/category-distribution.tsx` — Inline tooltip with `isHovered` state, positioned via absolute positioning
- `/work/frontend/src/components/dashboard/storage-utilization-grid.tsx` — Similar hover-based tooltip pattern
- `/work/frontend/src/components/dashboard/inventory-health-score.tsx` — HealthBreakdownTooltip with fixed positioning overlay
- `/work/frontend/src/components/ui/membership-indicator.tsx` — Generic tooltip via CSS `group-hover:block`
- `/work/frontend/src/components/ui/hover-actions.tsx` — IconButton with `title` attribute only
- `/work/frontend/src/components/shopping-lists/shopping-list-link-chip.tsx` — Multiple `title` attributes for native tooltips
- `/work/frontend/src/components/kits/kit-link-chip.tsx` — Similar pattern
- `/work/frontend/src/components/parts/part-list.tsx`, others — Mix of `title` attributes and custom implementations

**Patterns identified:**
1. **Manual positioning** — ReservationTooltip uses `useLayoutEffect`, `getBoundingClientRect`, viewport collision detection
2. **State management bugs** — Multiple implementations use `onMouseEnter/onMouseLeave` with timeout-based closing that fails on quick mouse movements
3. **Click behavior issues** — Some tooltips remain open after mouse leaves because click handlers don't properly manage state
4. **Inconsistent accessibility** — Mix of `role="tooltip"`, `aria-label`, and missing ARIA attributes
5. **No keyboard support** — Most custom tooltips lack Escape key handling or focus management
6. **Portal vs inline** — ReservationTooltip uses `createPortal`, others use absolute positioning within parent
7. **Native fallback** — 72 uses of `title` attribute across 35 files suggest widespread need for informational tooltips

**Architecture context:**
- Project uses Tailwind CSS for styling (`src/components/ui/` for shared components)
- React 19 function components with hooks
- Test instrumentation pattern: `data-testid` attributes, instrumentation behind `isTestMode()` guards
- Playwright tests require deterministic selectors and event-based waits

**Instrumentation considerations:**
- Current tooltips lack `data-testid` attributes for deterministic testing
- Project testing policy: Tooltips are stateless UI visibility concerns, not lifecycle events
- Test pattern: hover interaction + visibility assertions (no test events required)
- Existing specs use: `trigger.hover()` → `expect(tooltip).toBeVisible()` → content assertions
- Aligns with testing guide: "lean on UI checks" for stateless presentation elements

**Title attribute conflicts identified:**
- `kit-bom-table.tsx:262,281,294` — Note column and disabled button tooltips use native title
- `category-distribution.tsx:30` — Truncated category names use title for overflow text
- Migration strategy: Remove native title attributes when wrapping elements in Tooltip component
- No special-casing needed; handle case-by-case during migration

**Conflicts resolved:**
- No existing shared Tooltip component in `src/components/ui/`
- Multiple ad hoc implementations suggest need for consolidation
- Native `title` tooltips should remain for simple cases; shared component for rich content

---

## 1) Intent & Scope

### User intent

Consolidate scattered tooltip implementations into a shared, accessible, and testable infrastructure that fixes existing bugs (quick mouse movement causing tooltips to stay open, click behavior issues) and provides consistent behavior across the application.

### Prompt quotes

"Fix quick mouse movement bug where tooltips stay open"
"Fix click behavior that keeps tooltips open after mouse leaves"
"Create reusable Tooltip component and useTooltip hook in src/components/ui"
"Migrate all existing tooltip implementations to use shared primitives"
"Add contributor guidance that tooltips must contain only informational content (no interactive elements)"
"Update Playwright page objects and specs for deterministic selectors"

### In scope

- Design and implement shared `Tooltip` component in `src/components/ui/tooltip.tsx`
  - Support both `title` (simple) and `content` (rich) modes
  - Automatic disabled element handling
  - Placement options including `'center'` for modal-like overlays (HealthBreakdownTooltip)
- Design and implement `useTooltip` hook in `src/components/ui/use-tooltip.ts` for advanced positioning/lifecycle control
- Fix quick mouse movement bug via proper event coordination
- Fix click behavior bug via state machine approach
- Add keyboard support (Escape to close, focus management)
- Ensure ARIA compliance (role, labelledby, describedby)
- Provide portal-based rendering for viewport boundary handling
- Add `data-testid` support for Playwright assertions
- **Replace and delete all 14 custom tooltip implementations**:
  - Migrate to shared Tooltip component or plain `title` attribute
  - **Remove bespoke tooltip components** (ReservationTooltip, HealthBreakdownTooltip, etc.)
  - **Remove custom tooltip logic** (manual positioning, state management, portal code)
  - No custom tooltip implementations should remain after migration
- Remove simple text tooltips that don't need Tooltip component features (replace with plain `title` attribute)
- Document contributor guidelines:
  - When to use plain `title` vs `Tooltip` component
  - Forbid interactive tooltip content
  - Decision tree for `title` prop vs `content` prop
  - **Forbid creating new bespoke tooltip implementations** (always use shared Tooltip component)
- Update Playwright page objects and specs for affected features

### Out of scope

- Migration of existing plain `title` attribute usages (72 instances) to Tooltip component — native tooltips remain valid and preferred for simple text without special disabled handling
- Tooltip analytics or usage tracking beyond standard instrumentation
- Complex tooltip interactions (e.g., nested tooltips, tooltip chains)
- Animation framework changes (rely on existing Tailwind transitions)
- Tooltip theming beyond existing design system
- Server-side rendering concerns (client-only component acceptable)
- Creating Tooltip components where plain `title` attributes suffice

### Assumptions / constraints

- Tooltips contain only informational content; no buttons, forms, or interactive elements
- Tooltips should not block user interaction with the page
- Mobile users see tooltips on tap (not hover), but prefer native `title` for simple cases
- Positioning should handle viewport boundaries automatically
- Shared component must work with existing Tailwind setup
- Migration happens incrementally; no big-bang replacement
- Playwright tests must remain deterministic (no fixed waits)
- Test mode instrumentation follows existing patterns (`isTestMode()` guards)

---

## 2) Affected Areas & File Map

### New files

- **`src/components/ui/tooltip.tsx`**
  - Why: Unified Tooltip component supporting both simple (title attribute) and rich (portal-based) modes
  - Features:
    - Accepts either `title` (string) or `content` (ReactNode) props
    - Automatically detects disabled children and applies wrapper pattern
    - Independent `enabled` prop controls tooltip visibility
  - Evidence: No existing tooltip component (glob search returned no results); ArchivedEditTooltip pattern in `kit-detail-header.tsx:330-359` proves wrapper viability

- **`src/components/ui/use-tooltip.ts`**
  - Why: Hook for managing tooltip state, positioning, lifecycle (used internally by Tooltip component)
  - Evidence: Pattern follows existing hooks in `src/hooks/` (e.g., `use-toast.ts`)

- **`docs/contribute/ui/tooltip_guidelines.md`**
  - Why: Document usage patterns, accessibility requirements, content restrictions, when to use `title` vs `content`
  - Evidence: Referenced in CLAUDE.md, follows structure of `docs/contribute/architecture/application_overview.md`

### Modified files — Components with custom tooltips

- **`src/components/kits/kit-bom-table.tsx:359-507`**
  - Why: ReservationTooltip is the most complex implementation; migrate to shared primitives
  - Evidence: Lines 359-507 show manual positioning, portal usage, timer-based closing

- **`src/components/ui/membership-indicator.tsx:96-104`**
  - Why: Generic tooltip using CSS `group-hover:block`; replace with Tooltip component
  - Evidence: Lines 96-104 show tooltip rendered via CSS class toggle

- **`src/components/dashboard/category-distribution.tsx:66-73`**
  - Why: CategoryBar tooltip uses `isHovered` state and absolute positioning
  - Evidence: Lines 66-73 show inline tooltip with manual visibility control

- **`src/components/dashboard/storage-utilization-grid.tsx:104-113`**
  - Why: StorageBox tooltip with same pattern as CategoryBar
  - Evidence: Lines 104-113 show similar hover-based tooltip

- **`src/components/dashboard/inventory-health-score.tsx:86-183`**
  - Why: HealthBreakdownTooltip uses fixed positioning overlay; migrate to shared Tooltip component with `placement="center"`
  - Evidence: Lines 142-183 show rich tooltip content with centered overlay; requires center placement mode

- **`src/components/ui/hover-actions.tsx:22-65`**
  - Why: IconButton uses `title` attribute; acceptable but could benefit from richer tooltip
  - Evidence: Line 61 shows `title={tooltip}` pattern

- **`src/components/shopping-lists/shopping-list-link-chip.tsx:63,95,104,137`**
  - Why: Multiple `title` attributes for accessibility labels
  - Evidence: Lines 63, 95, 104, 137 use `title` for hover hints; acceptable as-is for simple text

- **`src/components/kits/kit-link-chip.tsx` (similar pattern)**
  - Why: Uses `title` attributes for simple tooltips
  - Evidence: Similar to shopping-list-link-chip pattern

- **`src/components/kits/kit-detail-header.tsx`, `src/components/documents/document-tile.tsx`, `src/components/parts/part-list.tsx`**
  - Why: Various tooltip usages identified in grep results
  - Evidence: Grep found tooltip references; need case-by-case migration assessment

### Modified files — Playwright tests

- **`tests/e2e/kits/kit-detail.spec.ts:215-224`**
  - Why: Tests ReservationTooltip hover behavior and content; needs update after migration
  - Evidence: Uses `kits.detailReservationTrigger()` and `kits.detailReservationTooltip()` locators

- **`tests/e2e/dashboard/health-score.spec.ts:77-79`**
  - Why: Tests HealthBreakdownTooltip visibility; needs update after migration to center placement
  - Evidence: Uses `dashboard.healthCard.getByTestId('dashboard.health.gauge').hover()` pattern
  - Additional coverage needed: Center placement mode scenario

- **`tests/support/page-objects/kits-page.ts:311-317`**
  - Why: Contains `detailReservationTrigger()` and `detailReservationTooltip()` helpers
  - Evidence: Existing pattern can serve as template for other tooltip page object methods

### Documentation updates

- **`CLAUDE.md`**
  - Why: Reference new tooltip guidelines
  - Evidence: CLAUDE.md links to `docs/contribute/` for canonical guidance

- **`docs/contribute/ui/tooltip_guidelines.md`** (new)
  - Why: Document tooltip usage, migration steps, restrictions
  - Content includes:
    - Decision tree for plain `title` vs `Tooltip` component
    - Placement modes and when to use each
    - Automatic disabled element handling
    - **Prohibition on bespoke tooltip implementations** with rationale
    - PR checklist item: "Verify no custom tooltip implementations (use shared Tooltip or plain title)"
  - Evidence: Follows pattern of `docs/contribute/architecture/application_overview.md`

---

## 3) Data Model / Contracts

### Tooltip component props

- Entity: `TooltipProps`
- Shape:
  ```typescript
  interface TooltipProps {
    // Content (mutually exclusive - provide one or the other)
    title?: string;                // Simple text tooltip (uses native title attribute on wrapper)
    content?: ReactNode;           // Rich tooltip content (icons, formatting, multiline) - uses portal

    // Common props
    children: ReactElement;        // Trigger element (must accept ref)
    enabled?: boolean;             // Whether tooltip is enabled (default: true)
    placement?: 'top' | 'right' | 'bottom' | 'left' | 'auto' | 'center';
    // 'center' (or 'cover'): Centers tooltip over trigger element, useful for modal-like overlays
    showArrow?: boolean;           // Show arrow pointing at anchor (default: true for content mode, false for center placement)
    offset?: number;               // Distance from trigger (px) - ignored for 'center' placement
    delay?: number;                // Open delay (ms)
    testId?: string;               // data-testid for Playwright
    className?: string;            // Additional tooltip content classes (only for content mode)
  }
  ```
- Behavior:
  - If `title` is provided: Renders native title attribute (on wrapper if child is disabled)
  - If `content` is provided: Renders portal-based rich tooltip
  - If neither provided: No tooltip rendered
  - If both provided: Error/warning in dev mode
  - Automatically detects if `children` has `disabled` prop and applies wrapper pattern
  - `enabled={false}` suppresses tooltip regardless of `title`/`content` presence
  - Placement options:
    - `'top' | 'right' | 'bottom' | 'left'`: Positions tooltip adjacent to trigger
    - `'auto'`: Automatically chooses best position based on viewport space
    - `'center'`: Centers tooltip over trigger element (modal-like overlay), used by HealthBreakdownTooltip
  - Arrow indicator:
    - Small triangle/arrow points from tooltip to anchor element
    - Arrow shown by default for content mode (when `content` prop provided)
    - Arrow automatically positioned based on placement (top placement = arrow at bottom of tooltip, etc.)
    - Arrow hidden for `placement="center"` (modal-like overlays don't need directional indicator)
    - Can be disabled via `showArrow={false}` if needed
    - Implemented using CSS borders or SVG, positioned absolutely within tooltip container
- Mapping: Props map directly to component; no snake_case conversion needed
- Evidence: Pattern follows `src/components/ui/button.tsx` prop structure; ArchivedEditTooltip pattern (`kit-detail-header.tsx:330-359`) proves wrapper viability
- Usage examples:
  ```tsx
  // Simple text on disabled button
  <Tooltip title="Add parts before ordering">
    <Button disabled={!hasKarts}>Order Stock</Button>
  </Tooltip>

  // Rich content on enabled element
  <Tooltip content={<ReservationDetails />}>
    <ReservationIcon />
  </Tooltip>

  // Conditional tooltip
  <Tooltip title="Explanation" enabled={needsExplanation}>
    <Button>Action</Button>
  </Tooltip>
  ```

### useTooltip hook state

- Entity: `UseTooltipReturn`
- Shape:
  ```typescript
  interface UseTooltipReturn {
    isOpen: boolean;
    open: () => void;
    close: () => void;
    toggle: () => void;
    triggerRef: RefObject<HTMLElement>;
    tooltipRef: RefObject<HTMLDivElement>;
    position: { top: number; left: number };
  }
  ```
- Mapping: Hook manages internal state; consumers use returned functions/refs
- Evidence: Pattern mirrors ReservationTooltip state management (`kit-bom-table.tsx:360-412`)

---

## 4) API / Integration Surface

No backend API changes required. All integration is client-side React state and DOM manipulation.

### DOM event listeners

- Surface: Window scroll/resize events
- Inputs: None (passive listeners)
- Outputs: Tooltip position updates
- Errors: N/A (positioning failures degrade gracefully)
- Evidence: ReservationTooltip attaches scroll/resize listeners (`kit-bom-table.tsx:423-424`)

### Portal rendering

- Surface: `document.body` via `createPortal`
- Inputs: Tooltip content JSX
- Outputs: Tooltip rendered at body level for z-index control
- Errors: N/A (portal failures would be React render errors)
- Evidence: ReservationTooltip uses `createPortal(tooltipJSX, document.body)` (`kit-bom-table.tsx:471-503`)

---

## 5) Algorithms & UI Flows

### Flow: Tooltip open on hover

- Flow: User hovers over trigger element
- Steps:
  1. `onMouseEnter` fires on trigger element
  2. Cancel any pending close timer
  3. Start open delay timer (default 200ms)
  4. After delay, set `isOpen = true`
  5. Calculate tooltip position via `getBoundingClientRect` on trigger and tooltip
  6. Adjust position if tooltip would overflow viewport
  7. Render tooltip via portal
  8. Attach scroll/resize listeners for position updates
- States / transitions:
  - `closed` -> `opening` (on mouseenter) -> `open` (after delay)
  - `open` -> `closing` (on mouseleave) -> `closed` (after delay)
- Hotspots:
  - Quick mouse movements can cause race between open/close timers
  - Position calculation on every render could cause jank
- Evidence: ReservationTooltip flow (`kit-bom-table.tsx:440-447`, `374-386`, `388-412`)

### Flow: Tooltip close on mouse leave

- Flow: User moves mouse away from trigger and tooltip
- Steps:
  1. `onMouseLeave` fires on trigger
  2. Cancel open delay timer if still opening
  3. Start close delay timer (default 120ms)
  4. If mouse enters tooltip content before timer expires, cancel close timer
  5. If mouse leaves tooltip content, restart close timer
  6. After delay, set `isOpen = false`
  7. Remove scroll/resize listeners
  8. Unmount tooltip from portal
- States / transitions: Same as above, bidirectional
- Hotspots:
  - Tooltip content must have own mouse enter/leave handlers to prevent premature closing
  - Timer cleanup on unmount critical to avoid memory leaks
- Evidence: ReservationTooltip close flow (`kit-bom-table.tsx:381-386`, `432-438`)

### Flow: Tooltip close on Escape key

- Flow: User presses Escape while tooltip is open
- Steps:
  1. `onKeyDown` handler on trigger or tooltip detects Escape
  2. Call `close()` immediately (no delay)
  3. Return focus to trigger element
- States / transitions: `open` -> `closed` (immediate)
- Hotspots: Event listener attachment/cleanup
- Evidence: ReservationTooltip has basic Escape handler (`kit-bom-table.tsx:449-454`)

### Flow: Automatic position adjustment

- Flow: Tooltip opens near viewport edge
- Steps:
  1. Calculate initial position based on placement prop
     - For `'center'` placement: Calculate position to center tooltip over trigger element (ignoring offset)
     - For other placements: Calculate position adjacent to trigger
  2. Get viewport dimensions and tooltip dimensions
  3. Detect overflow (skip for `'center'` placement): `tooltip.right > window.innerWidth`, `tooltip.bottom > window.innerHeight`, etc.
  4. Flip to opposite side if more space available
  5. Otherwise, adjust left/top to keep tooltip in viewport
  6. Apply final position via inline styles
- States / transitions: Position recalculated on scroll/resize
- Hotspots:
  - Frequent recalculation could cause layout thrashing
  - Use `useLayoutEffect` to avoid flash
  - Center placement stays centered even on scroll/resize
- Evidence: ReservationTooltip position logic (`kit-bom-table.tsx:388-412`); HealthBreakdownTooltip centering (`inventory-health-score.tsx:142-183`)

---

## 6) Derived State & Invariants

### Derived value: Tooltip visibility

- Derived value: `isOpen`
- Source: Combination of hover state, focus state, delay timers, disabled prop
  - Hover: `triggerHovered || tooltipHovered`
  - Focus: `triggerFocused`
  - Disabled: `disabled === true` overrides all
- Writes / cleanup:
  - Set `isOpen = true` after open delay expires
  - Set `isOpen = false` after close delay expires
  - Cleanup timers on unmount
- Guards:
  - If `disabled === true`, never set `isOpen = true`
  - If component unmounts, clear all timers
- Invariant: Tooltip cannot be open if trigger is not in DOM or disabled is true
- Evidence: ReservationTooltip state (`kit-bom-table.tsx:363`, `374-386`, `432-438`)

### Derived value: Tooltip position

- Derived value: `{ top: number, left: number }`
- Source:
  - Trigger bounding rect (`triggerRef.current.getBoundingClientRect()`)
  - Tooltip bounding rect (`tooltipRef.current.getBoundingClientRect()`)
  - Placement preference (`placement` prop)
  - Viewport dimensions (`window.innerWidth`, `window.innerHeight`)
- Writes / cleanup:
  - Recalculate on scroll (debounced)
  - Recalculate on resize (debounced)
  - Remove listeners on close
- Guards:
  - Only calculate if `isOpen === true`
  - Only calculate if both refs are populated
- Invariant: Position keeps tooltip within viewport bounds; if impossible, clamp to edges
- Evidence: ReservationTooltip position calculation (`kit-bom-table.tsx:388-412`, `414-430`)

### Derived value: Mouse hover state

- Derived value: `triggerHovered || tooltipHovered`
- Source:
  - `onMouseEnter` / `onMouseLeave` on trigger element
  - `onMouseEnter` / `onMouseLeave` on tooltip content
- Writes / cleanup:
  - Update hover flags on mouse events
  - If both false, schedule close
  - If either true, cancel close and open if needed
- Guards:
  - Do not honor hover if disabled
  - Cancel timers on unmount
- Invariant: Tooltip stays open as long as mouse is over trigger OR tooltip content
- Evidence: ReservationTooltip hover handling (`kit-bom-table.tsx:457-467`, tooltip div has no explicit handlers but portal placement prevents premature close)

---

## 7) State Consistency & Async Coordination

### Source of truth

- Source of truth: Local React state within `useTooltip` hook or Tooltip component
- Coordination: Tooltip state is isolated per trigger; no global coordination needed
- Async safeguards:
  - Timer cleanup on unmount to prevent state updates on unmounted component
  - Abort position recalculation if tooltip closes during async layout measurement
  - Use `useLayoutEffect` for position calculation to avoid flicker
- Instrumentation:
  - Attach `data-testid` to tooltip content for Playwright assertions
  - No test events emitted (tooltips are stateless UI visibility concerns)
  - No loading states; tooltips are synchronous
- Evidence: ReservationTooltip cleanup (`kit-bom-table.tsx:432-438`)

### Timer coordination

Multiple timers interact:
- Open delay timer (default 200ms)
- Close delay timer (default 120ms)
- Debounced position recalculation (on scroll/resize)

Coordination rules:
- Starting open timer cancels close timer
- Starting close timer cancels open timer
- Unmounting component cancels all timers
- Moving mouse from trigger to tooltip content cancels close timer

Implementation uses `useRef` to store timer IDs and cleanup function to clear on unmount.

Evidence: ReservationTooltip timer refs (`kit-bom-table.tsx:362`, `374-386`)

---

## 8) Errors & Edge Cases

### Failure: Trigger ref not attached

- Failure: `triggerRef.current` is null when tooltip tries to open
- Surface: `useTooltip` hook or Tooltip component
- Handling:
  - Guard position calculation with `if (!triggerRef.current || !tooltipRef.current) return`
  - Log warning in dev mode
  - Do not render tooltip
- Guardrails: TypeScript ensures ref is passed correctly; runtime check prevents crash
- Evidence: ReservationTooltip guards (`kit-bom-table.tsx:389-392`)

### Failure: Tooltip content overflows viewport

- Failure: Tooltip is larger than viewport (very long content)
- Surface: Position calculation logic
- Handling:
  - Clamp position to viewport edges
  - Apply `max-height` and `overflow-y: auto` to tooltip content
  - Prefer scrollable tooltip over hidden content
- Guardrails: CSS max-height prevents infinite growth
- Evidence: ReservationTooltip position clamping (`kit-bom-table.tsx:401-409`)

### Failure: Tooltip stays open on quick mouse movement

- Failure: User quickly moves mouse across trigger without hovering; close timer never fires
- Surface: Event handler coordination
- Handling:
  - Ensure `onMouseLeave` cancels open timer if tooltip hasn't opened yet
  - Ensure state transitions are atomic (no race between open/close)
- Guardrails: State machine prevents opening if already closing
- Evidence: Identified in user prompt as current bug to fix

### Failure: Tooltip stays open after click

- Failure: User clicks trigger, tooltip opens, mouse leaves, tooltip remains open
- Surface: Click event handling
- Handling:
  - Do not open tooltip on click (only hover/focus)
  - If click triggers navigation, close tooltip immediately
  - If trigger is focusable, open on focus and close on blur
- Guardrails: Prevent click from setting hover state
- Evidence: Identified in user prompt as current bug to fix

### Edge case: Disabled trigger

- Case: Trigger element has `disabled` prop/attribute
- Handling:
  - **Automatic detection**: Tooltip component detects if `children.props.disabled === true`
  - **Wrapper pattern applied automatically**:
    - Focusable container (`tabIndex={0}`) captures hover/focus events
    - Child element gets `pointer-events-none` to prevent blocking wrapper events
    - Wrapper shows `cursor-not-allowed` for visual feedback
    - `aria-describedby` links child to tooltip for screen readers
  - **Title mode** (when `title` prop used):
    - Title attribute applied to wrapper div
    - Lightweight, native browser tooltip
    - Example: `<Tooltip title="Add parts before ordering"><Button disabled>Order</Button></Tooltip>`
  - **Content mode** (when `content` prop used):
    - Full portal-based tooltip with rich content
    - Example: `<Tooltip content={<Explanation />}><Button disabled>Edit</Button></Tooltip>`
  - **Enabled prop independence**:
    - `enabled={false}` suppresses tooltip even if child is disabled
    - Child's disabled state doesn't affect whether tooltip can show
    - Allows patterns like: "Show explanation only when disabled" via `enabled={isDisabled}`
- Guardrails: Document automatic detection and both modes in tooltip guidelines
- Evidence: ArchivedEditTooltip wrapper pattern (`kit-detail-header.tsx:330-359`) and simple title pattern (`kit-detail-header.tsx:248-258`)

### Edge case: Mobile/touch devices

- Case: No hover on touch devices
- Handling:
  - Show tooltip on tap (but dismiss on tap outside or scroll)
  - Prefer native `title` for simple tooltips on mobile
  - Consider showing tooltip on long-press for rich content
- Guardrails: Document mobile behavior in guidelines
- Evidence: General mobile UX concern

---

## 9) Observability / Instrumentation

### Testing approach: Visibility assertions (not test events)

- Decision: Tooltips do NOT emit test events for open/close lifecycle
- Rationale:
  - Project testing policy reserves test events for stateful UI (forms, lists, toasts)
  - Tooltips are stateless visibility concerns
  - Existing tooltip tests (ReservationTooltip, HealthBreakdownTooltip) use hover + visibility pattern
  - Aligns with testing guide: "lean on UI checks" for presentation elements
- Pattern: `await trigger.hover()` → `await expect(tooltip).toBeVisible()` → content assertions
- Evidence: `tests/e2e/kits/kit-detail.spec.ts:215-224`, `docs/contribute/testing/playwright_developer_guide.md:130`

### Signal: Tooltip testid attribute

- Signal: `data-testid` on tooltip content
- Type: DOM attribute for deterministic selection
- Trigger: Always present when `testId` prop provided
- Labels / fields: `${testId}.tooltip` pattern
- Consumer: Playwright assertions: `await expect(page.getByTestId('reservations.tooltip')).toBeVisible()`
- Evidence: ReservationTooltip pattern (`kit-bom-table.tsx:477`)

### Signal: Tooltip aria-describedby linkage

- Signal: `aria-describedby` on trigger pointing to tooltip id
- Type: Accessibility attribute
- Trigger: When tooltip is open
- Labels / fields: Generated unique ID
- Consumer: Screen readers announce tooltip content
- Evidence: WCAG 2.1 tooltip pattern

---

## 10) Lifecycle & Background Work

### Hook: useTooltip position update effect

- Hook: `useLayoutEffect` for position calculation
- Trigger cadence: On tooltip open, on scroll (debounced 100ms), on resize (debounced 100ms)
- Responsibilities:
  - Calculate tooltip position based on trigger rect and placement
  - Detect viewport overflow and adjust
  - Update position state
- Cleanup: Remove scroll/resize listeners when tooltip closes or component unmounts
- Evidence: ReservationTooltip effects (`kit-bom-table.tsx:414-430`)

### Hook: useEffect for timer cleanup

- Hook: `useEffect` with empty deps for unmount cleanup
- Trigger cadence: On component unmount
- Responsibilities: Clear open delay timer, close delay timer
- Cleanup: Return function clears timers
- Evidence: ReservationTooltip cleanup (`kit-bom-table.tsx:432-438`)

### Hook: useEffect for Escape key listener

- Hook: `useEffect` that attaches keydown listener when tooltip is open
- Trigger cadence: When `isOpen` changes
- Responsibilities: Close tooltip on Escape key
- Cleanup: Remove keydown listener when tooltip closes
- Evidence: ReservationTooltip keydown handler (`kit-bom-table.tsx:449-454`)

---

## 11) Security & Permissions

Not applicable. Tooltips are purely presentational UI with no sensitive data or permission gating.

If tooltips display user-generated content, ensure XSS protection via React's automatic escaping. Do not use `dangerouslySetInnerHTML` in tooltip content.

---

## 12) UX / UI Impact

### Entry point: All components with tooltips

- Entry point: 14+ components across the application
- Change: Replace ad hoc tooltip implementations with shared Tooltip component
- User interaction: More consistent tooltip behavior (timing, positioning, keyboard support)
- Dependencies: Tooltip component, useTooltip hook
- Evidence: Grep results identified 14 files with custom tooltip logic

### Visual changes

- Tooltip appearance: Standardized styling via Tailwind classes in `src/components/ui/tooltip.tsx`
- Timing: Consistent open delay (200ms) and close delay (120ms) across all tooltips
- Positioning: Automatic viewport boundary detection replaces manual calculations
- Transitions: 0.2s (200ms) fade in/out animation using Tailwind opacity transitions (content mode only)
- Two rendering modes:
  - **Title mode** (`title` prop): Native browser title attribute (no animation or custom styling)
  - **Content mode** (`content` prop): Portal-based tooltip with fade animation and styled container
- **Arrow indicator** (content mode only):
  - Small triangle pointing from tooltip to anchor element
  - Automatically positioned based on placement direction:
    - `placement="top"`: Arrow at bottom edge of tooltip, pointing down
    - `placement="bottom"`: Arrow at top edge of tooltip, pointing up
    - `placement="left"`: Arrow at right edge of tooltip, pointing right
    - `placement="right"`: Arrow at left edge of tooltip, pointing left
  - Arrow hidden for `placement="center"` (modal-like overlays)
  - Implemented with CSS borders or SVG, styled to match tooltip background
  - Arrow size: approximately 6-8px (small, subtle indicator)
- Disabled element handling: Transparent wrapper applied automatically when child has `disabled` prop
- Evidence: Tailwind usage follows pattern in `src/components/ui/card.tsx`

### Accessibility improvements

- ARIA attributes: `role="tooltip"`, `aria-describedby` on trigger
- Keyboard navigation: Escape to close, focus to open
- Screen reader support: Tooltip content announced when trigger focused
- Focus management: Return focus to trigger on close
- Evidence: WCAG 2.1 tooltip pattern requirements

### Mobile behavior

- Touch devices: Tooltip shows on tap, dismisses on tap outside
- Recommendation: Use native `title` for simple tooltips on mobile
- Long content: Scrollable tooltip on small screens
- Evidence: Responsive design consideration

---

## 13) Deterministic Test Plan

### Surface: Shared Tooltip component

- Scenarios:
  - Given tooltip with default props, When user hovers trigger, Then tooltip opens after 200ms delay
  - Given open tooltip, When user moves mouse to tooltip content, Then tooltip remains open
  - Given open tooltip, When user presses Escape, Then tooltip closes immediately
  - Given tooltip near viewport edge, When tooltip opens, Then position adjusts to stay in viewport
  - Given tooltip with disabled trigger, When user hovers, Then tooltip still shows
  - Given tooltip with `placement="center"`, When tooltip opens, Then tooltip centers over trigger (modal-like overlay)
  - Given tooltip, When component unmounts, Then all timers are cleaned up (no memory leak)
- Instrumentation / hooks:
  - `data-testid="${testId}.tooltip"` on tooltip content
  - Test pattern: `await trigger.hover()` → `await expect(tooltip).toBeVisible()` → content assertions
  - NO test events emitted (visibility assertions only)
- Gaps: Mobile/touch behavior testing deferred (requires touch event simulation)
- Evidence: Pattern follows existing specs `tests/e2e/kits/kit-detail.spec.ts:215-224`

### Surface: ReservationTooltip migration (kit-bom-table)

- Scenarios:
  - Given kit BOM row with active reservations, When user hovers reservation icon, Then tooltip shows reservation details
  - Given open reservation tooltip, When user scrolls page, Then tooltip position updates
  - Given reservation tooltip, When user quickly moves mouse away, Then tooltip closes properly (bug fix verification)
- Instrumentation / hooks:
  - Existing `data-testid="${testId}.tooltip"` pattern preserved
  - Selector: `page.getByTestId('kits.detail.table.row.123.reservations.tooltip')`
- Gaps: None
- Evidence: Existing pattern in `kit-bom-table.tsx:477`

### Surface: Dashboard tooltips (category-distribution, storage-utilization-grid, inventory-health-score)

- Scenarios:
  - Given category bar, When user hovers, Then tooltip shows category details
  - Given storage box, When user hovers, Then tooltip shows utilization details
  - Given health gauge, When user hovers, Then breakdown tooltip appears centered over gauge (validates `placement="center"`)
  - Given health breakdown tooltip open, When user reviews category breakdown, Then all health categories displayed with scores
- Instrumentation / hooks:
  - Add `data-testid` to dashboard tooltips (currently missing for category/storage)
  - Health tooltip: `page.getByTestId('dashboard.health.tooltip')` (already exists)
  - Test pattern: `await trigger.hover()` → `await expect(tooltip).toBeVisible()` → content assertions
- Gaps: None
- Evidence: Existing spec `tests/e2e/dashboard/health-score.spec.ts:77-79`; dashboard widgets identified in research

### Surface: MembershipIndicator tooltip

- Scenarios:
  - Given kit card with shopping list membership, When user hovers indicator, Then tooltip shows membership details
  - Given kit card with pick list membership, When user hovers indicator, Then tooltip shows pick list details
- Instrumentation / hooks:
  - Existing `data-testid="${testId}.tooltip"` pattern preserved
  - Selectors: `page.getByTestId('kits.overview.card.123.shopping-indicator.tooltip')`
- Gaps: None
- Evidence: MembershipIndicator pattern in `membership-indicator.tsx:101`

### Surface: Playwright page objects

- Scenarios:
  - N/A (infrastructure update)
- Instrumentation / hooks:
  - Existing page objects with tooltip helpers remain valid (e.g., `kits-page.ts:311-317`)
  - Pattern: Separate trigger and tooltip locator methods
  - Example: `detailReservationTrigger(id)` + `detailReservationTooltip(id)`
  - No new test helpers needed (hover + visibility assertions sufficient)
- Gaps: None
- Evidence: Existing pattern in `tests/support/page-objects/kits-page.ts:311-317`

---

## 14) Implementation Slices

### Slice 1: Core infrastructure

- Goal: Ship unified Tooltip component with automatic disabled element handling and dual-mode support
- Touches:
  - `src/components/ui/tooltip.tsx` (new) — Unified component with `title`/`content` modes
  - `src/components/ui/use-tooltip.ts` (new) — Hook for managing tooltip state, positioning, lifecycle
  - `src/components/ui/index.ts` (export new component)
  - Unit tests for tooltip logic (optional, prefer integration tests)
- Implementation notes:
  - **Title mode**: When `title` prop provided, applies native title attribute (on wrapper if child disabled)
  - **Content mode**: When `content` prop provided, uses portal-based rendering with 0.2s fade animation
  - **Placement modes**: `'top' | 'right' | 'bottom' | 'left' | 'auto' | 'center'`
    - Standard placements position tooltip adjacent to trigger
    - `'center'` centers tooltip over trigger (for modal-like overlays like HealthBreakdownTooltip)
  - **Arrow indicator** (content mode only):
    - Small triangle (6-8px) points from tooltip to anchor element
    - Shown by default (`showArrow={true}`) except for `placement="center"`
    - Positioned based on placement: top placement = arrow at bottom edge, etc.
    - Implemented using CSS border technique or inline SVG
    - Arrow color matches tooltip background (use Tailwind border utilities)
  - **Automatic disabled detection**: Checks `children.props.disabled`, applies wrapper pattern if true
  - **Wrapper pattern**: Focusable div with `tabIndex={0}`, child gets `pointer-events-none`, `cursor-not-allowed` styling
  - **Independent enabled prop**: `enabled={false}` suppresses tooltip regardless of child's disabled state
  - **Timing**: 200ms open delay, 120ms close delay for content mode
  - **Validation**: Warn in dev mode if both `title` and `content` provided
- Dependencies: None

### Slice 2: Documentation and guidelines

- Goal: Document tooltip usage patterns, decision tree for when to use Tooltip component vs plain title attribute
- Touches:
  - `docs/contribute/ui/tooltip_guidelines.md` (new)
    - **Decision tree**: Plain `title` attribute vs `Tooltip` component
      - Plain `title`: Simple text, no disabled element handling needed
      - `Tooltip` with `title` prop: Simple text, needs to work on disabled elements
      - `Tooltip` with `content` prop: Rich content (icons, formatting, multiline)
    - When to use `title` prop vs `content` prop
    - Placement options including `'center'` for overlays
    - Arrow indicator behavior (shown by default, hidden for center placement)
    - Automatic disabled element handling (no special code needed)
    - Using `enabled` prop for conditional tooltips
    - Accessibility requirements (automatic via wrapper pattern)
    - **Prohibition on bespoke tooltip implementations**: Always use shared Tooltip or plain title
    - **PR checklist item**: "Verify no custom tooltip implementations (check for createPortal, inline tooltip divs, custom positioning logic)"
    - No interactive content rule
    - Examples for common patterns
  - `CLAUDE.md` (reference new guidelines)
- Dependencies: Slice 1 complete

### Slice 3: Migrate ReservationTooltip (highest complexity)

- Goal: Replace most complex custom tooltip with shared component and **delete bespoke implementation**
- Touches:
  - `src/components/kits/kit-bom-table.tsx`
    - Replace ReservationTooltip with shared Tooltip component (using `content` prop)
    - **Delete ReservationTooltip component definition** (lines 359-507)
    - **Delete all custom positioning, portal, and state management code**
  - `tests/e2e/kits/kit-detail.spec.ts:215-224`
    - Verify existing test still passes with new Tooltip component
    - Existing pattern (hover trigger → assert tooltip visibility/content) remains valid
- Dependencies: Slice 1 complete
- Rationale: Hardest migration first validates shared component handles complex cases
- Success criteria: ReservationTooltip component no longer exists in codebase

### Slice 4: Migrate dashboard tooltips

- Goal: Replace dashboard hover tooltips and **delete all custom tooltip implementations**
- Touches:
  - `src/components/dashboard/category-distribution.tsx`
    - Evaluate if CategoryBar tooltip can use plain `title` attribute
    - If yes: replace with `title`, delete custom tooltip JSX
    - If no: use shared Tooltip component, delete custom tooltip JSX
  - `src/components/dashboard/storage-utilization-grid.tsx`
    - Evaluate if StorageBox tooltip can use plain `title` attribute
    - If yes: replace with `title`, delete custom tooltip JSX
    - If no: use shared Tooltip component, delete custom tooltip JSX
  - `src/components/dashboard/inventory-health-score.tsx`
    - Replace HealthBreakdownTooltip with shared Tooltip component (`placement="center"`)
    - **Delete HealthBreakdownTooltip component definition** (lines 86-183)
    - **Delete custom positioning and overlay logic**
  - Add `data-testid` attributes during migration (for Tooltip component usages)
  - `tests/e2e/dashboard/health-score.spec.ts:77-79`
    - Verify existing test still passes
    - Add scenario to validate center placement: tooltip is centered over gauge
    - Existing pattern (hover trigger → assert tooltip visibility) remains valid
- Dependencies: Slice 3 complete
- Success criteria: No custom tooltip components or inline tooltip JSX remain in dashboard files

### Slice 5: Migrate MembershipIndicator tooltip

- Goal: Replace CSS-based tooltip with shared component and **delete custom tooltip markup**
- Touches:
  - `src/components/ui/membership-indicator.tsx`
    - Replace CSS `group-hover:block` tooltip with shared Tooltip component
    - **Delete inline tooltip div** (lines 96-104)
    - **Remove tooltip-related CSS classes** from component
  - `tests/e2e/kits/*.spec.ts` (verify membership tooltip)
- Dependencies: Slice 4 complete
- Success criteria: No inline tooltip div or `group-hover` tooltip pattern remains

### Slice 6: Migrate remaining tooltips and clean up

- Goal: Replace any other custom tooltip implementations and **ensure zero bespoke tooltips remain**
- Touches:
  - `src/components/ui/hover-actions.tsx` — IconButton already uses `title` attribute; keep as-is (no custom tooltip)
  - Search codebase for remaining custom tooltip patterns:
    - Manual `createPortal` with tooltip-like behavior
    - Inline tooltip divs with `isHovered` state
    - CSS-only `group-hover` tooltip patterns
    - Custom positioning logic
  - **Delete any remaining bespoke tooltip code**
  - Replace with shared Tooltip component or plain `title` attribute
  - Verify no custom tooltip implementations remain
- Dependencies: Slice 5 complete
- Success criteria:
  - Grep for tooltip patterns returns zero custom implementations
  - All tooltips use either plain `title` attribute or shared Tooltip component
  - No `createPortal` calls for tooltip-like overlays (except in shared Tooltip component itself)

### Slice 7: Playwright page objects review

- Goal: Verify page objects work with migrated tooltips; no new helpers needed
- Touches:
  - Review `tests/support/page-objects/kits-page.ts` tooltip methods still valid
  - Verify hover + visibility assertion pattern works across all migrated tooltips
  - No changes to `tests/support/helpers.ts` needed (no test events to wait for)
- Dependencies: Slice 6 complete
- Success criteria: All page object tooltip locators work with new Tooltip component

### Slice 8: Final verification and cleanup

- Goal: Run full Playwright suite, verify no regressions, **confirm zero bespoke tooltips remain**
- Touches:
  - All affected specs
  - `pnpm playwright test` must pass
  - `pnpm check` must pass
  - **Final verification**:
    - Grep for `createPortal` — only usage should be in shared Tooltip component
    - Grep for tooltip-like patterns — all use shared Tooltip or plain `title`
    - Search for `role="tooltip"` — only in shared Tooltip component
    - Confirm ReservationTooltip, HealthBreakdownTooltip, and other bespoke components deleted
- Dependencies: Slice 7 complete
- Success criteria:
  - All tests pass
  - No custom tooltip implementations in codebase
  - Only tooltip-related code is in `src/components/ui/tooltip.tsx` and `src/components/ui/use-tooltip.ts`

---

## 15) Risks & Open Questions

### Risks

- Risk: Shared tooltip component doesn't handle all edge cases from custom implementations
- Impact: Some components may need custom tooltip logic; migration blocked
- Mitigation: Design component with extension points (render props, hooks); keep escape hatch for complex cases

---

- Risk: Quick mouse movement bug requires careful event coordination; fix may introduce new bugs
- Impact: Users experience different broken behavior
- Mitigation: Write comprehensive test scenarios covering rapid mouse movements; use state machine approach

---

- Risk: Migration breaks existing Playwright tests
- Impact: CI failures, blocked PRs
- Mitigation: Update tests incrementally per slice; run affected specs before moving to next slice

---

- Risk: Tooltip positioning performance degrades on scroll/resize
- Impact: Janky UI, poor UX
- Mitigation: Debounce position recalculation; measure performance with React DevTools Profiler; consider disabling position updates during active scroll

---

- Risk: Mobile/touch behavior doesn't match user expectations
- Impact: Poor mobile UX
- Mitigation: Document recommended pattern (use native `title` for simple tooltips); add touch event handling in phase 2 if needed

### Open questions

**RESOLVED:**

- ~~Question: Should HealthBreakdownTooltip be migrated or kept as-is (modal-like overlay)?~~
- **Resolution:** Migrate to shared Tooltip component. Confirmed as rich tooltip, not modal.

---

- ~~Question: How to handle tooltips on disabled buttons?~~
- **Resolution:** Enhanced Tooltip component automatically detects disabled children and applies wrapper pattern:
  - Use `title` prop for simple text explanations
  - Use `content` prop for rich/formatted explanations
  - Component detects `children.props.disabled` automatically, no special handling needed
  - Independent `enabled` prop controls tooltip visibility separate from child's disabled state
  - Document decision criteria in guidelines: simple text = `title`, complex = `content`

---

- ~~Question: Should we add tooltip animation variants (fade, slide, scale)?~~
- **Resolution:** Implement 0.2s fade in/out transition. No additional animation variants in initial release.

---

- ~~Question: What's the policy on `title` attribute migration?~~
- **Resolution:**
  - Do NOT migrate existing plain `title` attributes to Tooltip component
  - Native `title` attributes remain valid and **preferred** for simple informational text
  - Use Tooltip component only when:
    - Rich content needed (icons, formatting, multiline)
    - Disabled element handling required (tooltip must show on disabled button)
    - Advanced features needed (custom placement like `'center'`, conditional `enabled` prop)
  - During migration, **remove** Tooltip component usages where plain `title` attribute suffices

---

- ~~Question: Should tooltips emit test events for Playwright, or rely on visibility assertions?~~
- **Resolution:** Use visibility assertions only (no test events). Research findings:
  - Project testing policy reserves test events for stateful UI (forms, lists, toasts) per `docs/contribute/testing/playwright_developer_guide.md`
  - Tooltips are stateless visibility concerns
  - Existing tooltip tests use `trigger.hover()` → `expect(tooltip).toBeVisible()` pattern
  - Test event taxonomy (`src/types/test-events.ts`) includes 9 kinds; none for tooltips
  - Aligns with guide principle: "lean on UI checks" for presentation elements
  - Playwright's `expect().toBeVisible()` has built-in auto-waiting, making it deterministic

---

- ~~Question: ESLint enforcement for "no bespoke tooltips" rule?~~
- **Resolution:** Documentation + PR checklist approach preferred over ESLint rule. Rationale:
  - Project uses ESLint for critical policies (`testing/no-route-mocks`, `Date.now()` restriction)
  - Tooltip enforcement is more nuanced (need to distinguish legitimate custom overlays from tooltip anti-patterns)
  - Static analysis would require complex AST pattern matching (detect `createPortal` with tooltip-like positioning logic)
  - Documentation in `docs/contribute/ui/tooltip_guidelines.md` + PR checklist item provides sufficient guardrails
  - Can add ESLint rule later if bespoke tooltips reappear

---

- ~~Question: Title attribute conflicts (elements already having title attribute wrapped in Tooltip)?~~
- **Resolution:** Handle case-by-case during migration; no special-casing needed. Research findings:
  - Found 3 components with title attributes: `kit-bom-table.tsx:262,281,294` and `category-distribution.tsx:30`
  - Migration strategy: Remove native title when wrapping element in Tooltip component
  - Tooltip component should not auto-merge or preserve existing title attributes
  - If both present, dev mode warning suggests choosing one approach

---

## 16) Confidence

Confidence: High — Pattern is well-established (portal-based tooltips exist in many React libraries), bugs are clearly identified (quick mouse movement, click behavior), architecture aligns with existing component patterns (Tailwind, hooks, instrumentation), and migration can proceed incrementally without breaking existing functionality.

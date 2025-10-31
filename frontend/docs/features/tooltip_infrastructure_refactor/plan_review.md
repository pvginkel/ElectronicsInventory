# Plan Review: Tooltip Infrastructure Refactor

## 1) Summary & Decision

**Readiness**

The plan is comprehensive, well-researched, and demonstrates strong understanding of the existing tooltip implementations and the project's testing requirements. The incremental migration strategy with 8 slices provides a safe path forward. The plan correctly identifies the dual-mode approach (title vs content) and automatic disabled element handling as key features. However, there are several significant gaps around Playwright test coverage expectations, unclear statements about when tooltips should emit test events, and missing instrumentation hooks for the shared component itself. The documentation section needs to be more explicit about forbidden patterns to prevent future tooltip proliferation. The decision tree for when to use plain title vs Tooltip component could lead to ambiguity during implementation.

**Decision**

`GO-WITH-CONDITIONS` — The technical approach is sound and the migration strategy is well-structured, but the plan must be enhanced with explicit Playwright coverage requirements for each migrated tooltip, clarification of instrumentation strategy (test events vs visibility-only), and stronger contributor guardrails before implementation begins. The conditions are addressable without redesigning the core approach.

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/commands/plan_feature.md` — Pass — `plan.md:1-939` — Plan follows all required sections (Research Log, Intent & Scope, Affected Areas, Data Model, etc.) with evidence-backed claims and structured templates throughout.

- `docs/contribute/architecture/application_overview.md` — Pass — `plan.md:30-33` — Plan correctly identifies Tailwind CSS, React 19 hooks, and test instrumentation patterns (`data-testid`, `isTestMode()` guards). The component will live in `src/components/ui/` following the established pattern.

- `docs/contribute/testing/playwright_developer_guide.md` — Partial — `plan.md:673-721` — The plan mentions Playwright scenarios and instrumentation but lacks specificity required by the testing guide. Section 13 states "Optional: `tooltip` test event" but doesn't commit to deterministic wait strategy. The guide requires "explicit" coverage where "behavior is new/changed" with "scenarios + selectors + backend coordination" — tooltip open/close is changed behavior for 14 components, yet test event strategy remains optional.

- `CLAUDE.md` — Pass — `plan.md:187-192` — Plan references contributor guidelines and follows the documentation structure. Proposes new `docs/contribute/ui/tooltip_guidelines.md` consistent with existing doc organization.

**Fit with codebase**

- `src/components/ui/` components — Pass — `plan.md:230` — Tooltip component props follow the Button pattern (`src/components/ui/button.tsx:7-14`) with clear interface, variants, and optional props. The dual-mode approach (title/content) is pragmatic and aligns with existing component design.

- Test instrumentation — Partial — `plan.md:279-281, 553-578` — Plan proposes optional `TooltipTestEvent` but doesn't align with the project's mandatory instrumentation policy. The Playwright guide states tests "frequently assert on emitted test-event payloads" and instrumentation should be added "before writing a spec so tests can rely on deterministic events" (`docs/contribute/testing/playwright_developer_guide.md:10`). The plan hedges with "visibility assertions" fallback without justifying why tooltips are exempt from standard instrumentation.

- Generated API integration — Pass — `plan.md:287-304` — Plan correctly states "No backend API changes required. All integration is client-side." Tooltips are pure UI components with no API surface, consistent with other presentational components.

- Existing tooltip implementations — Pass — `plan.md:9-28, 359-507` — Research correctly identified 14 files with custom tooltips. Evidence from `kit-bom-table.tsx:359-507` shows ReservationTooltip's manual positioning, timer coordination, and portal usage match the plan's description. The plan's migration strategy targets all identified implementations.

## 3) Open Questions & Ambiguities

- Question: Should tooltips emit test events or rely solely on visibility assertions for Playwright specs?
- Why it matters: The plan states "Optional enhancement; tooltips can be tested via visibility alone" (`plan.md:281, 932`) but this contradicts the project's instrumentation-first testing philosophy documented in `docs/contribute/testing/playwright_developer_guide.md:10,130`. If visibility-only is sufficient, existing specs like `kit-bom.spec.ts` (if it exists) must be updated to remove event-based waits. If test events are required, they must be implemented in Slice 1, not deferred as "optional."
- Needed answer: Commit to either (a) test events for deterministic tooltip lifecycle tracking, or (b) visibility assertions with explicit justification that tooltips are exempt from standard instrumentation policy, documented in the guidelines.

---

- Question: How should Playwright specs wait for tooltips to open after hover actions?
- Why it matters: The plan's test scenarios (`plan.md:664-668`) state "Given tooltip with default props, When user hovers trigger, Then tooltip opens after 200ms delay" but provide no concrete wait strategy. The 200ms open delay means `page.hover()` followed by immediate `expect(tooltip).toBeVisible()` will be flaky. Without test events, specs must use `expect(tooltip).toBeVisible({ timeout: 1000 })` or similar, which the project's "No-Sleep Patterns" reference discourages.
- Needed answer: Provide explicit Playwright wait pattern in Section 13 for each tooltip scenario, either via test event helpers (`waitTestEvent(page, 'tooltip', evt => evt.phase === 'open')`) or visibility with adequate timeout justification.

---

- Question: Will existing Playwright specs for components with tooltips (e.g., ReservationTooltip, MembershipIndicator) need updates?
- Why it matters: The plan states "tests/e2e/kits/kit-bom.spec.ts (if exists)" (`plan.md:171`) and "verify membership tooltip" (`plan.md:809`) but doesn't confirm these specs exist or document their current assertions. If specs use `data-testid="${testId}.tooltip"` selectors, they may continue working, but if they rely on custom tooltip component structure, migration will break them.
- Needed answer: Research actual Playwright specs during Slice 1 planning. Document which specs exist and how they assert tooltip behavior. Update migration slices to include spec updates alongside component changes.

---

- Question: What happens if a developer wraps an element that already has a title attribute with the Tooltip component?
- Why it matters: The plan doesn't address the conflict scenario where `<Tooltip title="New"><button title="Old">Click</button></Tooltip>` occurs. Should the component warn, override, or error?
- Needed answer: Define precedence rule in component implementation and document in guidelines. Recommendation: Warn in dev mode if child has title attribute and log which title will be used (likely the wrapper's title should win).

---

- Question: How should the Tooltip component handle React.Fragment or multiple children?
- Why it matters: The plan states "children: ReactElement" (`plan.md:208`) suggesting single-child requirement, but doesn't document error handling for `<Tooltip title="Info"><>...</></Tooltip>` or `<Tooltip title="Info"><div/><div/></Tooltip>` patterns.
- Needed answer: Clarify in Data Model section (Section 3) that children must be single ReactElement accepting ref. Document runtime error/warning if constraint violated. Consider whether `React.Children.only()` validation is needed.

## 4) Deterministic Playwright Coverage (new/changed behavior only)

- Behavior: Shared Tooltip component (title mode)
- Scenarios:
  - Given disabled button with Tooltip wrapper (title mode), When user hovers wrapper, Then native browser tooltip appears with title text (`tests/e2e/components/tooltip.spec.ts` — new spec)
  - Missing: Backend hooks (N/A for client-only component)
  - Missing: Deterministic wait pattern — native title tooltips have browser-controlled timing, cannot be reliably tested for visibility in Playwright
- Instrumentation: None proposed for title mode (native tooltips)
- Backend hooks: N/A
- Gaps: Title mode is inherently non-deterministic in Playwright due to browser implementation differences. Consider documenting that title mode is verified via manual testing or visual regression tests, not functional Playwright specs. The plan should acknowledge this limitation.
- Evidence: `plan.md:664-669, 732-746`

---

- Behavior: Shared Tooltip component (content mode)
- Scenarios:
  - Given tooltip with rich content, When user hovers trigger, Then tooltip renders via portal with data-testid (`tests/e2e/components/tooltip.spec.ts`)
  - Given open tooltip, When user presses Escape, Then tooltip closes immediately (`tests/e2e/components/tooltip.spec.ts`)
  - Given tooltip near viewport edge, When tooltip opens, Then position adjusts to stay visible (`tests/e2e/components/tooltip.spec.ts`)
  - Missing: Explicit wait pattern for each scenario
- Instrumentation: `data-testid="${testId}.tooltip"` on tooltip content
- Backend hooks: N/A
- Gaps: Major — No test event defined despite changed behavior. Plan states "Optional: tooltip test event" (`plan.md:553`) but doesn't commit. If visibility-only, must document how to wait for 200ms open delay without fixed timeouts. If test events required, must implement `emitTestEvent({ kind: 'tooltip', phase: 'open', testId, trigger: 'hover' })` in Slice 1.
- Evidence: `plan.md:664-674, 729-746`

---

- Behavior: ReservationTooltip migration (kit BOM table)
- Scenarios:
  - Given kit BOM row with active reservations, When user hovers reservation icon, Then tooltip shows reservation details (`tests/e2e/kits/kit-bom.spec.ts` — update existing)
  - Given open reservation tooltip, When user scrolls page, Then tooltip position updates (`tests/e2e/kits/kit-bom.spec.ts`)
  - Given reservation tooltip, When user quickly moves mouse away, Then tooltip closes properly (bug fix verification) (`tests/e2e/kits/kit-bom.spec.ts`)
- Instrumentation: Existing `data-testid="${testId}.tooltip"` pattern preserved
- Backend hooks: Requires existing kit factories to create reservations
- Gaps: Minor — Assumes `tests/e2e/kits/kit-bom.spec.ts` exists and already covers reservation tooltip, but not confirmed. Slice 3 should verify spec exists before migration.
- Evidence: `plan.md:677-687, 768-778`

---

- Behavior: Dashboard tooltips (CategoryBar, StorageBox, HealthBreakdown)
- Scenarios:
  - Given category bar, When user hovers, Then tooltip shows category details (`tests/e2e/dashboard/overview.spec.ts` — new or update)
  - Given health gauge, When user hovers, Then breakdown tooltip appears centered over gauge (`tests/e2e/dashboard/overview.spec.ts`)
- Instrumentation: Plan proposes adding `data-testid` during migration (`plan.md:696`)
- Backend hooks: Requires dashboard data factories (likely existing)
- Gaps: Major — Section 13 states "Add data-testid to dashboard tooltips (currently missing)" but doesn't specify testid naming scheme. Slice 4 should follow `dashboard.<widget>.<element>.tooltip` pattern. Missing explicit Playwright scenario for centered placement mode used by HealthBreakdownTooltip.
- Evidence: `plan.md:689-700, 782-799`

---

- Behavior: MembershipIndicator tooltip migration
- Scenarios:
  - Given kit card with shopping list membership, When user hovers indicator, Then tooltip shows membership details (`tests/e2e/kits/membership.spec.ts` or `tests/e2e/kits/overview.spec.ts`)
- Instrumentation: Existing `data-testid="${testId}.tooltip"` pattern preserved
- Backend hooks: Requires kit + shopping list factories
- Gaps: None
- Evidence: `plan.md:702-711, 801-810`

---

- Behavior: Playwright page objects (infrastructure)
- Scenarios: N/A (tooling update, not user-visible behavior)
- Instrumentation: New `hoverTooltip(testId)` helper proposed
- Backend hooks: N/A
- Gaps: Minor — Example shows `await kitsPage.hoverReservationTooltip('row.123')` (`plan.md:719`) but doesn't document what this helper returns (tooltip locator? void?) or how it waits for tooltip visibility. Page object helpers should be consistent across features.
- Evidence: `plan.md:713-721, 833-838`

## 5) Adversarial Sweep (must find ≥3 credible issues or declare why none exist)

**Major — Instrumentation Strategy Contradicts Project Testing Policy**

**Evidence:** `plan.md:279-281, 553-560, 932` — "Optional: `tooltip` test event" and "Tooltips can be tested via visibility alone" vs `docs/contribute/testing/playwright_developer_guide.md:10,130` — "Confirm the UI flow you are touching emits the required instrumentation; add or adjust it *before* writing a spec" and "Never start writing the spec until the UI emits the events you need."

**Why it matters:** The project mandates instrumentation-first testing where new/changed UI behavior emits test events for deterministic Playwright waits. Tooltips represent changed behavior for 14 components (opening, closing, positioning), yet the plan treats instrumentation as optional. This creates precedent for skipping instrumentation on "simple" UI, undermining the testing methodology. Specs using visibility assertions with implicit timeouts (e.g., `expect(tooltip).toBeVisible({ timeout: 1000 })`) violate the "No-Sleep Patterns" reference and increase flakiness.

**Fix suggestion:** Mandate test events for tooltip lifecycle in Slice 1. Implement `emitTestEvent({ kind: 'tooltip', phase: 'open'|'close', testId, trigger: 'hover'|'focus'|'keyboard' })` in `useTooltip` hook, guarded by `isTestMode()`. Update Section 9 (Observability) to change "Optional: `tooltip` test event" to "Required: `tooltip` test event." Update Section 13 to show explicit `waitTestEvent(page, 'tooltip', evt => evt.phase === 'open' && evt.testId === 'my-tooltip')` in each scenario. Add `TooltipTestEvent` interface to `src/types/test-events.ts` and update `TestEventKind` enum. Document in guidelines that tooltip test events are standard instrumentation, not optional.

**Confidence:** High

---

**Major — Missing Playwright Coverage for Center Placement Mode**

**Evidence:** `plan.md:228, 375, 738, 793` — Plan introduces `placement="center"` for HealthBreakdownTooltip modal-like overlay, but Section 13 lacks dedicated Playwright scenario for this mode. Only generic scenario "Given tooltip near viewport edge, When tooltip opens, Then position adjusts to stay in viewport" exists, which doesn't validate center placement ignores edge detection (`plan.md:363, 374`).

**Why it matters:** Center placement is distinct behavior (centers over trigger, ignores viewport overflow logic) needed by HealthBreakdownTooltip. Without explicit test coverage, regressions could cause centered tooltips to flip positions incorrectly or fail to center. The migration in Slice 4 depends on this mode working correctly, but no verification step validates it before migration.

**Fix suggestion:** Add explicit scenario to Section 13: "Given tooltip with placement='center', When tooltip opens, Then tooltip centers over trigger regardless of viewport position" with test location `tests/e2e/components/tooltip.spec.ts`. In Slice 1 implementation notes, add "Verify center placement in dedicated Playwright spec before proceeding to Slice 2." Update Slice 4 to reference this coverage: "HealthBreakdownTooltip migration depends on center placement spec passing."

**Confidence:** High

---

**Major — Tooltip Guidelines Lack Enforcement Mechanism for "No Bespoke Tooltips" Rule**

**Evidence:** `plan.md:83-85, 824` — Plan states "Forbid creating new bespoke tooltip implementations (always use shared Tooltip component)" and "Grep for tooltip patterns returns zero custom implementations" but provides no automated enforcement.

**Why it matters:** Documentation alone won't prevent future developers from creating custom tooltips, especially when deadlines pressure quick fixes. The plan eliminates existing bespoke implementations but doesn't guard against reintroduction. Without linting or review checklist, the "no custom tooltips" rule will erode over time.

**Fix suggestion:** Add ESLint rule to Section 7 (State Consistency) or new Section 11.5 (Contributor Guardrails): "Implement custom ESLint rule `@local/no-bespoke-tooltips` that flags `createPortal` usage outside `src/components/ui/tooltip.tsx` when combined with tooltip-like patterns (role='tooltip', popup positioning logic, mouseenter/leave handlers)." Update Slice 2 (Documentation) to include "Create ESLint rule scaffold" as a task. Add to Slice 8 verification: "Run ESLint with `@local/no-bespoke-tooltips` enabled; zero violations expected." If custom ESLint rule is too complex, document alternative: "Add to PR review checklist in `docs/contribute/pull_request_checklist.md`: 'New tooltip-like UI uses shared Tooltip component (grep for createPortal, role="tooltip")'."

**Confidence:** High

---

**Minor — Animation Timing Mismatch Between Plan and Research**

**Evidence:** `plan.md:635` — "Transitions: 0.2s (200ms) fade in/out animation" vs `plan.md:744` — "Timing: 200ms open delay, 120ms close delay for content mode." Research shows ReservationTooltip uses 120ms close delay (`kit-bom-table.tsx:373-374`) but no CSS transition duration documented.

**Why it matters:** If tooltip CSS transition is 200ms but close delay is 120ms, closing animations may be interrupted mid-transition, causing visual glitches. Conversely, if CSS transition is shorter than delays, tooltip will appear instantly after delay, defeating the delay's purpose.

**Fix suggestion:** Clarify in Section 12 (UX/UI Impact) that "0.2s fade animation applies to opacity transition, separate from open/close delays. Open delay (200ms) waits before starting fade-in. Close delay (120ms) waits before starting fade-out. Total open time: 200ms delay + 200ms fade = 400ms perceived latency. Total close time: 120ms delay + 200ms fade = 320ms." Verify in Slice 1 implementation that CSS transition-duration and delay timers are coordinated to avoid visual jank.

**Confidence:** Medium

---

**Minor — Disabled Element Detection May Fail for Custom Components**

**Evidence:** `plan.md:224, 517-536` — "Automatically detects if `children.props.disabled === true`" assumes child component exposes `disabled` prop. Custom components may use different prop names (`isDisabled`, `inactive`) or compute disabled state internally without exposing prop.

**Why it matters:** Tooltip wrapper pattern won't activate for `<Tooltip title="Help"><CustomButton isDisabled={true}>Click</CustomButton></Tooltip>` because `children.props.disabled` is undefined. Developer must manually wrap with extra div, defeating "automatic" detection claim.

**Fix suggestion:** Update Section 8 (Errors & Edge Cases, disabled trigger section) to document limitation: "Automatic detection works for native elements (<button disabled>) and components using `disabled` prop. For custom components with different prop names, use explicit wrapper: `<div tabIndex={0}><Tooltip title='Help'><CustomButton isDisabled /></Tooltip></div>` or pass `forceWrapper` prop to Tooltip component." Consider adding optional `forceWrapper?: boolean` prop to TooltipProps for explicit wrapper activation. Document this edge case in Slice 2 guidelines.

**Confidence:** Medium

---

**Minor — Portal Cleanup on Fast Unmount Not Guaranteed**

**Evidence:** `plan.md:448, 600` — "Cleanup timers on unmount" via `useEffect` return function, but if tooltip unmounts while portal tooltip is rendering, React may not synchronously remove portal content from `document.body`.

**Why it matters:** Rapid navigation (user clicks link while tooltip is opening) could leave orphaned tooltip divs in DOM if portal cleanup isn't synchronous. Accumulated tooltips could cause z-index conflicts or memory leaks in long-running sessions.

**Fix suggestion:** Add to Section 7 (State Consistency & Async Coordination): "Portal cleanup uses `useEffect` return function to call `ReactDOM.unmountComponentAtNode` (or rely on React 18+ automatic cleanup). If orphaned tooltips observed during testing, implement manual cleanup: track portal container ref, remove from document.body in cleanup function." Update Slice 1 implementation to verify no orphaned tooltips remain after rapid tooltip open/close cycles in Playwright spec.

**Confidence:** Low (React 18+ generally handles portal cleanup reliably, but worth documenting)

## 6) Derived-Value & State Invariants (table)

- Derived value: `isOpen` (tooltip visibility state)
  - Source dataset: Unfiltered inputs from hover state (`triggerHovered`, `tooltipHovered`), focus state (`triggerFocused`), delay timers (open, close), and `enabled` prop
  - Write / cleanup triggered: Sets `isOpen = true` after open delay, sets `isOpen = false` after close delay, clears timers on unmount
  - Guards: `enabled={false}` prevents opening, timer cleanup prevents state updates on unmounted component
  - Invariant: Tooltip cannot be open if trigger is not in DOM, if `enabled === false`, or if any delay timer is cancelled before expiring
  - Evidence: `plan.md:382-396, 432-438`

---

- Derived value: `position` (tooltip top/left coordinates)
  - Source dataset: Unfiltered inputs from trigger bounding rect, tooltip bounding rect, viewport dimensions, `placement` prop
  - Write / cleanup triggered: Recalculates on scroll (debounced), resize (debounced), tooltip open, removes event listeners on close
  - Guards: Only calculates if `isOpen === true` and both refs populated, skips overflow detection if `placement === 'center'`
  - Invariant: Position keeps tooltip within viewport bounds unless `placement === 'center'`, in which case tooltip centers over trigger regardless of viewport
  - Evidence: `plan.md:399-414, 362-375`

---

- Derived value: `combinedHoverState` (logical OR of trigger and tooltip hover)
  - Source dataset: Unfiltered inputs from `onMouseEnter`/`onMouseLeave` on trigger element and tooltip portal content
  - Write / cleanup triggered: Sets hover flags on mouse events, schedules close if both false, cancels close if either true
  - Guards: Ignores hover if `enabled === false`, cancels timers on unmount
  - Invariant: Tooltip stays open as long as mouse is over trigger OR tooltip content; closing only starts after mouse leaves both
  - Evidence: `plan.md:417-430, 457-467`

---

**No filtered-view-drives-persistent-write patterns detected.** Tooltip state is ephemeral (no cache writes, no navigation-triggered cleanup beyond unmount, no cross-component state coordination). The only persistent effect is DOM event listeners, which are properly cleaned up in `useEffect` return functions per `plan.md:415-418, 432-438`.

## 7) Risks & Mitigations (top 3)

- Risk: Shared Tooltip component doesn't handle all edge cases from 14 custom implementations, blocking migration of complex tooltips (e.g., ReservationTooltip's scroll-tracking, HealthBreakdownTooltip's close button)
- Mitigation: Implement ReservationTooltip migration first (Slice 3) to validate shared component handles most complex case. If gaps found, extend Tooltip component with render props or callback props before proceeding to remaining slices. Document escape hatch pattern in guidelines for truly custom overlays (e.g., "If tooltip needs interactive content like close button, use Dialog component instead").
- Evidence: `plan.md:864-866, 768-778`

---

- Risk: Migration breaks existing Playwright specs that rely on custom tooltip DOM structure, causing CI failures and blocking PRs
- Mitigation: Update Playwright specs incrementally per slice (Slice 3-6). Run affected specs (`pnpm playwright test tests/e2e/kits/`) before marking slice complete. Use consistent `data-testid="${testId}.tooltip"` pattern across all migrations to minimize selector changes. If unknown specs break, pause migration and investigate via `git grep "tooltip" tests/e2e/` to find all affected tests.
- Evidence: `plan.md:875-878, 843-856`

---

- Risk: Tooltip positioning performance degrades on scroll/resize, causing janky UI and poor UX
- Mitigation: Debounce position recalculation (already planned), measure performance with React DevTools Profiler during Slice 1 implementation. If jank detected, consider disabling position updates during active scroll (use `scroll` event passive listener, defer updates until scrollend event or scroll stops for 100ms). Close tooltip on scroll if position updates prove too expensive. Document performance characteristics in guidelines.
- Evidence: `plan.md:881-884`

## 8) Confidence

Confidence: High — The plan demonstrates thorough research with 14 tooltip implementations identified and analyzed. The dual-mode approach (title/content) is pragmatic and aligns with existing component patterns. The incremental migration strategy with 8 slices provides safe rollout. The automatic disabled element detection solves a real pain point. However, the plan must address instrumentation requirements (test events vs visibility), strengthen contributor guardrails (ESLint rule or PR checklist), and provide explicit Playwright wait patterns before implementation begins. These gaps are addressable without fundamental redesign.

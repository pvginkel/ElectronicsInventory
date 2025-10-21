### 0) Research Log & Findings
- Reviewed canonical frontend architecture guidance to ensure the refactor fits existing abstractions and reuse expectations (`docs/contribute/architecture/application_overview.md:3-34`).
- Studied current tooltip implementations: bespoke absolute-positioned popovers (`src/components/common/membership-indicator.tsx:52-104`), inline card overlays (`src/components/dashboard/category-distribution.tsx:67-71`), edit-button tooltip shell (`src/components/kits/kit-detail-header.tsx:160-182`), and the newly portaled reservation tooltip (`src/components/kits/kit-bom-table.tsx:13-269`).
- Catalogued UI primitives that expose tooltip-like APIs but fallback to native `title` attributes (`src/components/ui/hover-actions.tsx:30-62`) and domain components that pass `tooltipClassName` through (`src/components/kits/kit-card.tsx:111-139`).
- Checked instrumentation/test requirements so shared tooltip emission can stay deterministic for Playwright (`docs/contribute/testing/playwright_developer_guide.md:78-131`).
- Verified affected Playwright page objects and specs that currently rely on tooltip-specific selectors (`tests/support/page-objects/kits-page.ts:21-96`, `tests/e2e/kits/kit-detail.spec.ts:12-92`).

### 1) Intent & Scope (1–3 short paragraphs)
**User intent**

Design and ship a reusable tooltip infrastructure so every UI tooltip uses consistent positioning, accessibility, and instrumentation while avoiding clipping issues. Tooltips remain purely informational: they never contain interactive controls and disappear immediately when the pointer or focus leaves the anchor.

**Prompt quotes**

"create some significant plumbing"  
"refactor this in a different feature and create some reusable code to improve how we show tooltips"  
"apply your suggested approach to every tooltip in the app"

**In scope**

- Introduce a shared tooltip primitive (component + hook) that handles portals, positioning, focus management, and animation.
- Migrate all existing tooltip call sites (kits, dashboard, documents, hover actions, etc.) to the new primitive, removing ad hoc DOM overlays and `title` fallbacks.
- Ensure Playwright selectors and instrumentation remain deterministic after migration, updating specs and page objects where necessary.
- Guarantee hover/focus-only tooltips: no interactive content within the tooltip; closing occurs immediately when pointer/focus leaves the anchor.
- Provide usage documentation in contributor guides so future components adopt the shared pattern.

**Out of scope**

- Rewriting non-tooltip popovers/modals (e.g., `Dialog`, `DropdownMenu`) unless they currently masquerade as tooltips.
- Backend API or data model changes—the work is purely frontend UI infrastructure.
- Visual redesign of tooltip content; focus is on placement, accessibility, and consistency.

**Assumptions / constraints**

- React 19 + TanStack Router environment per architecture guide remains unchanged.
- All tooltips must remain keyboard-accessible, purely informative, and respect existing dark/light theming.
- Playwright must assert tooltip visibility via deterministic `data-testid` hooks; no reliance on native `title` attributes post-refactor.

### 2) Affected Areas & File Map (with repository evidence)
- Area: `src/components/ui/hover-actions.tsx`
  - Why: Buttons rely on native `title` tooltips; needs integration with shared tooltip API.
  - Evidence: `src/components/ui/hover-actions.tsx:30-62`
- Area: `src/components/common/membership-indicator.tsx`
  - Why: Implements a custom hover group tooltip that should be replaced.
  - Evidence: `src/components/common/membership-indicator.tsx:52-104`
- Area: `src/components/kits/kit-bom-table.tsx`
  - Why: Hosts bespoke portal logic that should move into shared infrastructure.
  - Evidence: `src/components/kits/kit-bom-table.tsx:13-269`
- Area: `src/components/kits/kit-card.tsx`
  - Why: Passes `tooltipClassName` to child indicator components; migration impacts props.
  - Evidence: `src/components/kits/kit-card.tsx:111-139`
- Area: `src/components/kits/kit-detail-header.tsx`
  - Why: Disabled edit button renders a bespoke tooltip container.
  - Evidence: `src/components/kits/kit-detail-header.tsx:160-182`
- Area: `src/components/dashboard/category-distribution.tsx`
  - Why: Creates tooltip markup inline; needs shared component usage.
  - Evidence: `src/components/dashboard/category-distribution.tsx:67-71`
- Area: `src/components/dashboard/inventory-health-score.tsx`
  - Why: Shows a large tooltip overlay that should reuse infrastructure (and align z-index strategy).
  - Evidence: `src/components/dashboard/inventory-health-score.tsx:142-183`
- Area: `src/components/documents/document-tile.tsx`
  - Why: Uses `IconButton` tooltips via native titles; must adopt new primitive.
  - Evidence: `src/components/documents/document-tile.tsx:128-150`
- Area: `src/components/documents/media-viewer-base.tsx`
  - Why: Action buttons rely on tooltips; same IconButton usage.
  - Evidence: `src/components/documents/media-viewer-base.tsx:190-224`
- Area: `src/components/ui` (new files)
  - Why: Host shared tooltip component/hook and styling tokens.
  - Evidence: Plan requirement—new module not yet present.
- Area: `src/hooks` (new `use-tooltip` or similar)
  - Why: Provide shared positioning/state management consumed by components.
  - Evidence: Plan requirement.
- Area: `src/styles` or Tailwind config (if needed)
  - Why: Centralize tooltip z-index, color tokens, and animation utilities.
  - Evidence: Align with theming guidance in contributor docs.
- Area: `tests/support/page-objects/kits-page.ts`
  - Why: Page object references `reservations.tooltip`; must stay aligned after component swap.
  - Evidence: `tests/support/page-objects/kits-page.ts:65-96`
- Area: `tests/e2e/kits/kit-detail.spec.ts`
  - Why: Asserts tooltip visibility; update selectors if component signature changes.
  - Evidence: `tests/e2e/kits/kit-detail.spec.ts:12-92`
- Area: Additional Playwright specs touching dashboard/documents tooltips
  - Why: Need auditing once usage list compiled (search results from `rg "tooltip"`).
  - Evidence: To be gathered during implementation; include in final checklist.
- Area: Contributor docs (`docs/contribute/architecture/...` or new doc)
  - Why: Document new tooltip pattern and “informational only” constraint.
  - Evidence: `docs/contribute/architecture/application_overview.md:3-34` sets expectation for shared components.

### 3) Data Model / Contracts
- Entity / contract: `TooltipConfig`
  - Shape: `{ id: string; alignment: 'top' | 'bottom' | 'left' | 'right'; offset: number; strategy: 'fixed' | 'absolute'; allowFlip: boolean; testId?: string }`
  - Mapping: Consumers pass props to new `Tooltip` component; defaults align with existing layouts.
  - Evidence: Derived from new infrastructure design; references existing ad hoc configs in `membership-indicator` and `kit-bom-table`.
- Entity / contract: `useTooltip` state
  - Shape: `{ isOpen: boolean; open: () => void; close: () => void; triggerProps; tooltipProps; portalTarget?: HTMLElement }`
  - Mapping: Hook wraps trigger/tooltip event bindings replacing inline handlers in existing components.
  - Evidence: `src/components/kits/kit-bom-table.tsx:103-204` demonstrates required API surface (open/close/position).
- Entity / contract: `TooltipTestEvent` (optional instrumentation)
  - Shape: `{ scope: 'ui.tooltip'; id: string; state: 'open' | 'close'; targetTestId?: string }`
  - Mapping: Emitted via `lib/test` helpers when `isTestMode()` true so Playwright can wait deterministically.
  - Evidence: Aligns with instrumentation guidance in `docs/contribute/testing/playwright_developer_guide.md:78-131`.

### 4) API / Integration Surface
- Surface: `useTooltip` hook (new)
  - Inputs: Configuration object (alignment, offset, disabled flag).
  - Outputs: Trigger/tooltip props, portal target, test instrumentation emitter.
  - Errors: None (pure UI); ensure SSR guards so `document` access is safe.
  - Evidence: Modeled on portal logic in `src/components/kits/kit-bom-table.tsx:135-169`.
- Surface: `Tooltip` component (new)
  - Inputs: `content`, `children`, optional `testId`, `ariaLabel`.
  - Outputs: Renders trigger with accessible attributes, handles portal layout.
  - Errors: Validate `content`/`children`; warn if used without single child.
  - Evidence: Replacement for patterns in `src/components/common/membership-indicator.tsx:79-104` and `src/components/kits/kit-detail-header.tsx:160-182`.
- Surface: Test instrumentation emitter
  - Inputs: `scope='ui.tooltip'`, metadata from `useTooltip`.
  - Outputs: `list_loading`-style events for Playwright waits.
  - Errors: None; ensure only emitted in test mode via `isTestMode()` check.
  - Evidence: Instrumentation practices from `docs/contribute/testing/playwright_developer_guide.md:78-131`.

### 5) Algorithms & UI Flows (step-by-step)
- Flow: Tooltip trigger lifecycle
  1. Tooltip consumer calls `useTooltip(config)` to receive `triggerProps`/`tooltipProps`.
  2. On hover/focus, `open()` sets `isOpen` and schedules position calculation via `requestAnimationFrame`.
  3. Hook injects portal element into `document.body` (or configured root), computing placement with fallback flipping if viewport constrained.
  4. On pointer leave or blur, `close()` fires immediately so tooltip hides the moment the anchor loses hover/focus.
  5. `Escape` key closes tooltip and returns focus to trigger.
  - States / transitions: `isOpen` boolean, optional `exitTimerId` (used only for touch release), `position` (top/left).
  - Hotspots: Debounce reflow on scroll/resize; guard SSR by checking `typeof window !== 'undefined'`.
  - Evidence: Inspiration from `src/components/kits/kit-bom-table.tsx:125-204`.

- Flow: Page-level tooltip migration (example membership indicator)
  1. Replace inline `div.group` wrapper with `Tooltip` component wrapping icon.
  2. Move `renderTooltip` content into `Tooltip.Content` prop to decouple layout.
  3. Remove `tooltipClassName` prop in favor of new component theming slot.
  4. Update tests/page objects if `data-testid` path changes.
  - States / transitions: Follows `membershipIndicator` loading/error gating before tooltip instantiation.
  - Hotspots: Ensure tooltip portal doesn’t capture clicks intended for parent card.
  - Evidence: `src/components/common/membership-indicator.tsx:52-104`.

- Flow: Dashboard category bar tooltip
  1. Replace `isHovered` conditional render with `Tooltip` around bar container.
  2. Tooltip remains read-only content; pointer leaving anchor immediately hides tooltip.
  3. Validate responsive fallback for small screens (touch support).
  - States / transitions: `Tooltip` hook handles open/close; remove local `useState`.
  - Hotspots: Align tooltip with stacked bars without clipping card.
  - Evidence: `src/components/dashboard/category-distribution.tsx:67-71`.

### 6) Derived State & Invariants
- Derived value: `isTooltipVisible`
  - Source: `useTooltip` internal state toggled via event handlers.
- Derived value: `tooltipPosition`
  - Source: Recomputed from trigger bounding box + viewport constraints; invariant that tooltip stays within padded viewport bounds.
- Derived value: `tooltipTestId`
  - Source: Combined from trigger test id + suffix; ensures selectors remain stable per instrumentation contract.

### 7) State Consistency & Async Coordination
- Recompute tooltip position inside `requestAnimationFrame` after DOM updates to avoid stale layout.
- Use `ResizeObserver` or throttled `window` listeners when `isOpen`; cleanup in effect teardown.
- For tooltips inside scrollable containers, listen on `scroll` capturing phase to maintain alignment.
- Ensure no React Query or external async dependencies—state is local and deterministic.

### 8) Errors & Edge Cases
- Trigger unmounted while tooltip open: effect cleanup should cancel timers and remove portal.
- Tooltips on disabled elements: wrap button in `span` or use `Tooltip` component that renders non-disabled trigger to stay accessible.
- Touch devices: provide tap-or-long-press open with immediate close after pointer lifts or focus shifts.
- SSR render: guard usage so component renders fallback (no portal) when `document` undefined.

### 9) Telemetry / Instrumentation
- Signal: `ui.tooltip`
  - Type: instrumentation event (optional but recommended).
  - Trigger: emitted on open/close when `isTestMode()` true.
  - Labels / fields: `{ id, state, targetTestId }`.
  - Consumer: Playwright helpers (`waitForUiState` extension) ensuring tests can wait for tooltip readiness.
  - Evidence: instrumentation pattern in `docs/contribute/testing/playwright_developer_guide.md:78-131`.

### 10) Lifecycle & Background Work
- Hook / effect: `useTooltip` scroll/resize listeners
  - Trigger cadence: Attached when tooltip opens; removed on close/unmount.
  - Responsibilities: Recalculate portal position; throttle to animation frame.
  - Cleanup: Remove event listeners, cancel timers in `useEffect` cleanup.
  - Evidence: Current logic in `src/components/kits/kit-bom-table.tsx:158-170`.

### 11) Security & Permissions (if applicable)
- Concern: None—feature is UI-only with no additional data exposure.

### 12) UX / UI Impact (if applicable)
- Entry point: Kits detail route (`/kits/$kitId`), kits overview, dashboard analytics cards, documents gallery.
  - Change: Uniform tooltip styling/animations, consistent positioning, immediate hide on hover/focus loss.
  - User interaction: Tooltips behave purely as informative overlays with predictable dismissal.
  - Dependencies: Shared tooltip primitive; theming tokens from Tailwind.
  - Evidence: `src/routes/kits/$kitId/index.tsx:1-30`, `src/components/dashboard/category-distribution.tsx:67-71`.

### 13) Deterministic Test Plan (new/changed behavior only)
- Surface: Kits detail reservation tooltip
  - Scenarios:
    - Given a row with reservations, When the trigger is hovered, Then the tooltip appears via shared component without table scroll shift.
    - Given focus on trigger, When Escape pressed, Then tooltip closes and focus remains.
  - Instrumentation / hooks: `kits.detail.table.row.<id>.reservations` trigger, new `ui.tooltip` event.
  - Gaps: None.
  - Evidence: `tests/e2e/kits/kit-detail.spec.ts:12-92`.
- Surface: Membership indicators
  - Scenarios:
    - Given membership loaded, When hovered, Then tooltip renders via shared component.
    - Given tooltip visible, When pointer leaves the indicator, Then tooltip closes immediately (no continued visibility).
  - Instrumentation / hooks: `kits.overview.card.<id>.shopping-indicator`, new tooltip test id.
  - Gaps: Add new Playwright assertions if missing.
  - Evidence: `src/components/kits/kit-card.tsx:111-139`.
- Surface: Dashboard health gauge / category bars
  - Scenarios:
    - Hover gauge => tooltip anchored center; on leave => closes immediately.
    - Hover category bar => tooltip appears and hides instantly when pointer leaves the bar.
  - Instrumentation / hooks: `dashboard.health.tooltip`, `dashboard.categories.bar.tooltip`.
  - Gaps: Ensure new selectors propagate to specs (add/adjust as needed).
  - Evidence: `src/components/dashboard/category-distribution.tsx:67-71`, `src/components/dashboard/inventory-health-score.tsx:142-183`.

### 14) Implementation Slices (only if large)
- Slice: Tooltip infrastructure
  - Goal: Ship `Tooltip` component and `useTooltip` hook with portal, positioning, instrumentation, and immediate-dismiss behaviour.
  - Touches: `src/components/ui/tooltip.tsx` (new), `src/hooks/use-tooltip.ts` (new), tests for hook.
  - Dependencies: None.
- Slice: High-risk migrations (kits detail + membership indicator)
  - Goal: Adopt new tooltip for reservation trigger and membership badges (most visible regressions).
  - Touches: `src/components/kits/kit-bom-table.tsx`, `src/components/common/membership-indicator.tsx`, `tests/e2e/kits`.
  - Dependencies: Infrastructure slice.
- Slice: Dashboard & documents migrations
  - Goal: Replace inline tooltips across dashboard widgets and document actions.
  - Touches: `src/components/dashboard/*`, `src/components/documents/*`, associated specs.
  - Dependencies: Infrastructure slice.
- Slice: Cleanup & docs
  - Goal: Remove obsolete tooltip props, update contributor docs, and surface guidance on informative-only tooltips.
  - Touches: `src/components/ui/hover-actions.tsx`, `docs/contribute/*`, Storybook/MDX if present.
  - Dependencies: Prior migrations.

### 15) Risks & Open Questions
- Risk: Tooltip portal z-index clashes with existing modals.
  - Impact: Tooltips might appear behind dialogs.
  - Mitigation: Define shared z-index token and verify across modals/toasts.
- Risk: Touch-device behaviour inconsistent across migrated components.
  - Impact: Tooltips stuck open or impossible to trigger.
  - Mitigation: Include touch QA; unify tap/long-press logic in shared hook.
- Risk: Playwright selectors break if tooltip DOM hierarchy changes.
  - Impact: Test flakes.
  - Mitigation: Preserve `data-testid` semantics; update page objects in same slice.

- Question: Should we adopt an external library (e.g., Radix Tooltip) instead of custom hook?
  - Why it matters: Could reduce maintenance but adds dependency weight.
  - Owner / follow-up: Evaluate during infra slice; align with team preferences documented in contributor guides.

### 16) Confidence (one line)
Confidence: Medium — Multiple call sites and interaction patterns require careful migration, but scope is well understood with clear existing references.

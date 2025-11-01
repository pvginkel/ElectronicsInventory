# Alert Component Extraction — Technical Plan

## 0) Research Log & Findings

### Discovery Work

Searched the codebase for alert/banner/notification patterns using the following criteria:
- Files containing `border-destructive`, `bg-destructive`, `border-amber`, `bg-amber` style classes
- Inline divs with rounded borders and colored backgrounds serving as notifications
- Usage of `AlertCircle`, `AlertTriangle`, `Info`, and `CheckCircle` icons from lucide-react

### Key Findings

**Total identified usages**: 9 distinct block-level alert/banner locations across 7 component files (1 inline badge excluded from scope)

**Pattern categories**:
1. Error banners (6 instances) — destructive variant with red/pink styling
2. Warning banners (3 instances) — amber/yellow styling
3. Info banners (0 instances) — not currently used but needed for completeness
4. Inline warning badges (1 instance at `pick-list-lines.tsx:211`) — **EXCLUDED FROM SCOPE** (specialized table cell badge, not suitable for block-level Alert component)

**CSS soup consistency**:
- Error patterns use `border-destructive/40 bg-destructive/10 text-destructive` or slight variations (`/20`, `/60`)
- Warning patterns use `border-amber-200 bg-amber-50 text-amber-900` or `border-amber-400 bg-amber-50`
- Padding inconsistencies: `px-3 py-2`, `px-4 py-3`, `p-4`, `p-6`
- Border radius: all use `rounded-md` or `rounded`
- Some include dismissible buttons, some include retry actions, some are static

**No conflicts found**:
- No existing `Alert` component in `src/components/ui/`
- `Badge`, `InformationBadge`, and `StatusBadge` serve different purposes (entity status/metadata, not notifications)
- `Tooltip` component handles hover-triggered overlays, not persistent notifications
- `Toast` component handles transient global notifications, not inline contextual alerts

### Instrumentation Context

Reviewed `docs/contribute/testing/playwright_developer_guide.md` and test specs:
- Alert banners currently use `data-testid` attributes for Playwright targeting
- Tests assert visibility and content via standard locators (no special instrumentation events)
- Dismissible banners tested by clicking dismiss button and asserting hidden state
- No special test-event coordination required for alerts (unlike forms/lists)

---

## 1) Intent & Scope

**User intent**

Extract inline alert/banner implementations into a reusable `Alert` UI component in `src/components/ui/alert.tsx`. Eliminate CSS soup duplication and establish a standardized, variant-based API for displaying contextual error, warning, info, and success messages. Refactor all identified usages to use the new component.

**Prompt quotes**

> "extracting Alert/Banner components into a reusable UI component in src/components/ui/"
> "currently implemented inline across multiple locations with heavy CSS soup"
> "Plan Requirements: Identify ALL current usages"
> "Design should support variants: error, warning, info, success"
> "Support optional icons, dismissible behavior, and flexible content"
> "Autonomous Decision Making: Accept minor visual differences as acceptable losses for consistency"
> "Make breaking changes—do not attempt backward compatibility"
> "Plan to REMOVE any className props from existing banner/alert implementations (not deprecate, REMOVE)"

**In scope**

- Create `src/components/ui/alert.tsx` component with `error`, `warning`, `info`, `success` variants
- Support optional icons, dismissible behavior, action buttons, and flexible content
- Accept `className` prop for layout control (margins, width, positioning) following project UI component pattern
- Refactor 9 identified alert/banner usages across 7 component files (shortfall badge excluded - see below)
- Standardize padding, spacing, border opacity, and text sizing
- Update affected Playwright specs to use new component structure
- Ensure `data-testid` attributes propagate correctly for test reliability

**Out of scope**

- Global toast notifications (already handled by `Toast` component and `ToastContext`)
- Hover-triggered tooltips (handled by `Tooltip` component)
- Entity status badges (handled by `StatusBadge` and `InformationBadge`)
- Form validation inline errors (remain as inline text within form fields)
- Empty states (handled by `EmptyState` component)
- Browser-native alert dialogs or modal confirmations (use `Dialog` component)
- **Shortfall inline badge** (`pick-list-lines.tsx:211`) — This is an `inline-flex` compact badge within table cells, structurally different from block-level alert banners. It serves a data visualization purpose (numeric shortfall indicator) rather than contextual error/warning messaging. This badge should remain as a specialized inline implementation or potentially use `InformationBadge` component if enhanced with warning variant support in future work.

**Assumptions / constraints**

1. All block-level alert/banner patterns identified via grep search represent the exhaustive set to refactor (9 usages; shortfall badge excluded)
2. Minor visual differences (padding, opacity variations) are acceptable losses in favor of consistency
3. Breaking changes to internal component structure are acceptable; this is technical debt cleanup
4. The `Alert` component will accept `className` prop following project UI component pattern (Badge, Button, Card, EmptyState) for layout control, merged via `cn()` utility
5. Playwright specs will remain green after refactoring by preserving `data-testid` hierarchies
6. No backend coordination required; this is purely frontend component extraction

---

## 2) Affected Areas & File Map

### New Component

- **Area**: `src/components/ui/alert.tsx` (NEW)
- **Why**: Canonical Alert component implementation
- **Evidence**: Does not exist; will be created

- **Area**: `src/components/ui/index.ts` (MODIFY)
- **Why**: Export new Alert component for use across codebase
- **Evidence**: Existing export barrel at `/work/frontend/src/components/ui/index.ts`

### Refactored Components (Alert Consumers)

- **Area**: `src/components/shopping-lists/concept-line-form.tsx`
- **Why**: Replace inline warning banner for duplicate part detection
- **Evidence**: `/work/frontend/src/components/shopping-lists/concept-line-form.tsx:260` — `className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"` with dismissible button and `data-testid="shopping-lists.concept.duplicate-banner"`

- **Area**: `src/components/parts/part-details.tsx`
- **Why**: Replace inline error banner for failed link badge data loading
- **Evidence**: `/work/frontend/src/components/parts/part-details.tsx:348` — `className="flex flex-wrap items-start gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"` with retry button and `data-testid="parts.detail.link.badges.error"`

- **Area**: `src/components/pick-lists/pick-list-lines.tsx`
- **Why**: Replace inline error banner for availability errors (shortfall badge at line 211 excluded from scope - see Out of Scope section)
- **Evidence**:
  - Error banner at line 82: `className="flex flex-col gap-2 rounded-md border border-destructive/60 bg-destructive/10 px-4 py-3 text-sm text-destructive"` with `data-testid="pick-lists.detail.availability.error"`

- **Area**: `src/components/kits/kit-bom-row-editor.tsx`
- **Why**: Replace inline error message for form-level errors
- **Evidence**: `/work/frontend/src/components/kits/kit-bom-row-editor.tsx:207` — `className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"` displaying `formMessage`

- **Area**: `src/components/shopping-lists/part/add-to-shopping-list-dialog.tsx`
- **Why**: Replace inline error banner for conflict detection with link to existing lists
- **Evidence**: `/work/frontend/src/components/shopping-lists/part/add-to-shopping-list-dialog.tsx:279` — `className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"` with `data-testid="parts.shopping-list.add.conflict"` and embedded anchor link

- **Area**: `src/components/shopping-lists/concept-table.tsx`
- **Why**: Replace full-width sticky warning banner for duplicate part detection (different from dialog banner)
- **Evidence**: `/work/frontend/src/components/shopping-lists/concept-table.tsx:106` — `className="relative z-[60] flex items-center justify-between gap-4 border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 pointer-events-auto"` with focus and dismiss buttons, `data-testid="shopping-lists.concept.duplicate-banner"`

- **Area**: `src/components/kits/kit-overview-list.tsx`
- **Why**: Replace error state container for failed kit list loading
- **Evidence**: `/work/frontend/src/components/kits/kit-overview-list.tsx:175` — `className="rounded-md border border-destructive/20 bg-destructive/10 p-6"` with heading, message, and retry button, `data-testid="kits.overview.error"`

- **Area**: `src/components/shopping-lists/overview-list.tsx`
- **Why**: Replace error state container for failed shopping list loading
- **Evidence**: `/work/frontend/src/components/shopping-lists/overview-list.tsx:280` — `className="rounded-md border border-destructive/20 bg-destructive/10 p-4"` with error message, `data-testid="shopping-lists.overview.error"`

### Affected Playwright Specs

- **Area**: `tests/e2e/shopping-lists/shopping-lists.spec.ts`
- **Why**: Tests duplicate banner dismissal; may need locator adjustments if Alert changes internal structure
- **Evidence**: Lines 612-617 reference `shopping-lists.concept.duplicate-banner` and `.dismiss` child testId

- **Area**: `tests/e2e/pick-lists/pick-list-detail.spec.ts` (if exists)
- **Why**: May test availability error banner visibility
- **Evidence**: Potential usage of `pick-lists.detail.availability.error` testId

- **Area**: `tests/e2e/parts/part-*.spec.ts` (part-related specs)
- **Why**: May interact with link badge error banner or conflict errors in add-to-shopping-list dialog
- **Evidence**: Potential usage of `parts.detail.link.badges.error` or `parts.shopping-list.add.conflict` testIds

- **Area**: `tests/e2e/kits/kit-detail.spec.ts` or `tests/e2e/kits/kits-overview.spec.ts`
- **Why**: May assert on kit overview error states
- **Evidence**: Potential usage of `kits.overview.error` testId

---

## 3) Data Model / Contracts

### Component Props Interface

No API payloads or TanStack Query contracts involved. The Alert component is purely presentational.

**AlertProps shape**:

```typescript
interface AlertProps {
  variant: 'error' | 'warning' | 'info' | 'success';
  children: ReactNode;
  icon?: ReactNode | boolean;  // Custom icon node, true for default, false/undefined for none
  title?: string;  // Optional bold heading above body content
  onDismiss?: () => void;  // Optional dismiss handler (renders dismiss button if provided)
  action?: ReactNode;  // Optional action button(s) - parent provides styled Button components with testIds
  className?: string;  // Optional layout classes (margins, width, positioning) merged via cn()
  testId: string;  // Required for Playwright targeting - base testId applied to container
}
```

**Variant-to-Style mapping**:

- `error`: `border-destructive/50 bg-destructive/10 text-destructive` + optional `AlertCircle` icon
- `warning`: `border-amber-300 bg-amber-50 text-amber-900` + optional `AlertTriangle` icon
- `info`: `border-blue-300 bg-blue-50 text-blue-900` + optional `Info` icon
- `success`: `border-green-300 bg-green-50 text-green-900` + optional `CheckCircle2` icon

**Standardized spacing**:
- Padding: `px-4 py-3` (consistent across all variants)
- Icon gap: `gap-3` between icon and content
- Title-to-body gap: `gap-1` or `space-y-1`
- Border radius: `rounded-md`

**Action button layout rules** (based on existing usage analysis):
- Action buttons are provided by parent as styled `Button` components within `action` prop
- Alert renders action buttons in a flex container alongside dismiss button (if both present)
- Parent is responsible for:
  - Styling buttons (variant, size)
  - Providing testIds (e.g., `${baseTestId}.focus`, `${baseTestId}.retry`)
  - Deciding button text and behavior
- Examples from existing code:
  - `concept-table.tsx:113-133`: Two buttons in flex container (View existing line + Dismiss)
  - `concept-line-form.tsx:269-280`: Single Dismiss button in flex container
  - `part-details.tsx:358`: Retry button (no dismiss), parent controls layout

**TestId pattern contract**:
- Parent provides base `testId` prop applied to Alert container div
- Parent provides full testIds for action buttons within `action` ReactNode (e.g., `data-testid="${baseTestId}.focus"`)
- Dismiss button testId follows convention: parent calls `onDismiss` prop and expects dismiss button to have `${baseTestId}.dismiss` testId - but parent provides this via custom dismiss action if needed, OR Alert can render default dismiss button with auto-generated testId
- **Implementation decision**: Alert will auto-render dismiss button with `data-testid="${testId}.dismiss"` when `onDismiss` is provided, matching existing pattern in `concept-line-form.tsx:276` and `concept-table.tsx:130`

---

## 4) API / Integration Surface

Not applicable. The Alert component is purely presentational and does not interact with backend APIs or TanStack Query.

---

## 5) Algorithms & UI Flows

### Alert Component Render Logic

**Flow**: Determine visual presentation based on variant and props

**Steps**:
1. Map `variant` prop to color classes and default icon
2. Merge `className` prop via `cn()` utility for layout control
3. If `icon === true`, render default icon for variant (e.g., `AlertCircle` for error)
4. If `icon` is a ReactNode, render custom icon
5. If `icon === false` or `undefined`, render no icon
6. Render optional `title` as bold heading if provided
7. Render `children` as body content
8. If `action` is provided, render in flex container (parent provides styled Button components)
9. If `onDismiss` is provided, render dismiss button with `data-testid="${testId}.dismiss"` in same flex container as action buttons
10. Apply base `testId` to container div for Playwright targeting
11. Apply `role="alert"` or `role="status"` for accessibility based on severity

**States / transitions**:
- Controlled dismissal via `onDismiss` callback (parent controls visibility)
- No internal state; purely controlled component

**Hotspots**:
- Icon rendering logic must handle `boolean | ReactNode | undefined` union type
- Action button layout: all buttons (action + dismiss) render in single flex container, parent provides styled Button components with appropriate testIds
- className merge must use `cn()` utility to allow parent layout control while maintaining Alert's internal styling

**Evidence**: Similar patterns in `src/components/ui/information-badge.tsx:64-101` (controlled component, no internal state, icon handling)

### Refactoring Flow for Each Consumer

**Flow**: Replace inline alert div with Alert component

**Steps**:
1. Import `Alert` from `@/components/ui/alert`
2. Identify variant (error/warning/info/success) based on existing color classes
3. Extract conditional visibility logic (preserve existing `{condition && <div>}` pattern)
4. Map existing `data-testid` to Alert's `testId` prop
5. Extract title text (if heading exists) to `title` prop
6. Extract body content to `children`
7. Map dismiss button `onClick` to `onDismiss` prop
8. Map action buttons (retry, focus, etc.) to `action` prop
9. Determine icon presence: explicit icon (AlertTriangle) → pass icon, no icon → omit prop
10. Remove inline CSS classes entirely

**States / transitions**: No state changes; maintain existing controlled visibility patterns

**Hotspots**:
- Concept table sticky banner has complex z-index and pointer-events needs — pass via `className` prop (e.g., `className="z-[60] pointer-events-auto"`)
- Action and dismiss buttons are parent-provided within `action` prop, or dismiss button auto-rendered when `onDismiss` provided

**Evidence**: Refactoring patterns from recent `InformationBadge` and `EmptyState` extraction work (reference `docs/features/information_badge_extraction/plan.md` and `docs/features/empty_state_extraction/plan.md`)

---

## 6) Derived State & Invariants

### Derived value: Effective icon to render

- **Source**: `icon` prop (boolean | ReactNode | undefined) and `variant` prop
- **Writes / cleanup**: Determines which ReactNode to render in icon slot
- **Guards**: Type narrowing via `typeof icon === 'boolean'` checks
- **Invariant**: If `icon === true`, default icon must match variant; if custom icon provided, render as-is; if falsy, render no icon
- **Evidence**: Similar logic in `src/components/ui/information-badge.tsx:86` (conditional icon rendering based on prop)

### Derived value: Accessible role attribute

- **Source**: `variant` prop
- **Writes / cleanup**: Sets `role="alert"` for error/warning, `role="status"` for info/success
- **Guards**: Variant must be one of four allowed values (enforced by TypeScript)
- **Invariant**: Alert/status semantics must align with ARIA best practices for assistive technology
- **Evidence**: Accessibility patterns documented in `docs/contribute/ui/tooltip_guidelines.md:235-240` (role attributes for UI components)

### Derived value: Color class string

- **Source**: `variant` prop
- **Writes / cleanup**: Returns composed Tailwind class string for border, background, text colors
- **Guards**: Must use `cn()` utility from `@/lib/utils` for class merging (even though no className prop exposed)
- **Invariant**: Color classes must remain internally consistent (border opacity, background opacity, text color) per variant; className prop merged for layout control only
- **Evidence**: `src/components/ui/badge.tsx:12-17,23-26` (variant-to-class mapping pattern with className merge)

---

## 7) State Consistency & Async Coordination

### Source of truth

Parent component controls visibility via conditional rendering (`{error && <Alert>}`). Alert component is stateless and purely presentational.

### Coordination

- Alert does not manage visibility internally; `onDismiss` callback delegates to parent
- Parent may update local state (e.g., `setDuplicateError(null)`) or call hook-provided dismiss handlers
- No TanStack Query cache interaction; Alert displays derived error messages from query hooks

### Async safeguards

Not applicable. Alert is synchronous presentational component. Parent async logic (query retries, mutation submissions) is unaffected.

### Instrumentation

- Alert emits no test-event payloads
- Tests rely on `data-testid` attributes for locator targeting
- Visibility assertions use standard Playwright `toBeVisible()` / `toBeHidden()` matchers
- Dismissible alerts tested via `.click()` on dismiss button followed by visibility assertion

**Evidence**: `tests/e2e/shopping-lists/shopping-lists.spec.ts:612-617` (duplicate banner dismiss flow)

---

## 8) Errors & Edge Cases

### Failure: Alert rendered without testId prop

- **Surface**: All components consuming Alert
- **Handling**: TypeScript compilation error (testId is required)
- **Guardrails**: `testId: string` in interface (not optional)
- **Evidence**: Similar pattern in `src/components/ui/information-badge.tsx:20` (testId required)

### Failure: Custom icon provided but not a valid ReactNode

- **Surface**: Alert component rendering
- **Handling**: React rendering error; TypeScript should catch at compile time
- **Guardrails**: Type signature `icon?: ReactNode | boolean` enforces valid types
- **Evidence**: TypeScript strict mode enforced per `CLAUDE.md` definition of done

### Edge case: onDismiss provided but parent does not update visibility state

- **Surface**: Alert remains visible after dismiss button clicked
- **Handling**: Developer error; Alert is controlled component, parent must handle state update
- **Guardrails**: Document in component JSDoc that `onDismiss` callback must update parent state to hide Alert
- **Evidence**: Controlled component pattern documented in React docs; similar to Dialog controlled open state

### Edge case: action prop contains interactive elements but also onDismiss handler

- **Surface**: Multiple interactive elements (dismiss X, action button) within Alert
- **Handling**: Both buttons functional; keyboard navigation via tab order
- **Guardrails**: Ensure proper focus management and aria-labels for screen readers
- **Evidence**: Accessibility patterns in `docs/contribute/ui/tooltip_guidelines.md:234-240`

### Edge case: Concept table sticky banner with z-index layering

- **Surface**: `concept-table.tsx:106` banner has `z-[60]` and `pointer-events-auto` for sticky positioning
- **Handling**: Pass layout classes via `className` prop: `<Alert className="z-[60] pointer-events-auto" ... />`
- **Guardrails**: className prop accepted for layout control following project UI component pattern (Badge, Button, Card, EmptyState)
- **Evidence**: `src/components/ui/badge.tsx:26` shows className merge pattern via `cn()` utility

### Edge case: Shortfall inline badge excluded from scope

- **Surface**: `pick-lists.detail.line.${lineId}.shortfall` badge at line 211 is compact inline badge within table cells
- **Handling**: **EXCLUDED FROM SCOPE** — this badge is structurally different (inline-flex vs block-level), serves data visualization purpose (numeric shortfall), and has distinct layout requirements
- **Guardrails**: Badge remains as specialized inline implementation; consider enhancing `InformationBadge` with warning variant in future work if consolidation desired
- **Evidence**: `/work/frontend/src/components/pick-lists/pick-list-lines.tsx:211` — `inline-flex` badge, `px-2 py-1` compact padding, table cell context

---

## 9) Observability / Instrumentation

### Signal: Alert visibility in Playwright specs

- **Type**: data-testid attribute on container div
- **Trigger**: Alert rendered in DOM
- **Labels / fields**:
  - Base testId (e.g., `shopping-lists.concept.duplicate-banner`)
  - Child testIds for interactive elements (e.g., `.dismiss`, `.retry`)
- **Consumer**: Playwright assertions via `page.getByTestId()`
- **Evidence**: `tests/e2e/shopping-lists/shopping-lists.spec.ts:612-617`

### Signal: Dismiss button interaction

- **Type**: data-testid attribute on dismiss button element
- **Trigger**: User clicks dismiss button
- **Labels / fields**: `${testId}.dismiss` (suffixed child testId)
- **Consumer**: Playwright `.click()` action followed by visibility assertion
- **Evidence**: `tests/e2e/shopping-lists/shopping-lists.spec.ts:616`

### Signal: Action button interaction

- **Type**: data-testid attribute on action button element (if provided by consumer)
- **Trigger**: User clicks action button (e.g., retry, focus)
- **Labels / fields**: Consumer-defined testId passed to Button component within `action` prop
- **Consumer**: Playwright `.click()` action, often followed by query refetch or navigation
- **Evidence**: `src/components/parts/part-details.tsx:358` (retry button within error banner)

### Signal: No test-event emissions

- **Type**: N/A (Alert does not emit ListLoading or Form events)
- **Trigger**: N/A
- **Labels / fields**: N/A
- **Consumer**: Tests rely solely on DOM visibility and interaction, not test-event listeners
- **Evidence**: Alert is presentational component, not data-fetching or form component; no `useListLoadingInstrumentation` or `trackForm*` hooks involved

---

## 10) Lifecycle & Background Work

Not applicable. Alert component has no lifecycle hooks, effects, subscriptions, timers, or background work. It is a pure presentational component that renders synchronously based on props.

---

## 11) Security & Permissions

Not applicable. Alert component displays user-facing messages derived from frontend state and error responses. No sensitive data redaction, role-based visibility, or authentication concerns. All displayed content is already filtered and validated by parent components and API response handlers.

---

## 12) UX / UI Impact

### Entry point: All components displaying inline alerts/banners

**Change**: Replace inline CSS-styled divs with standardized Alert component

**User interaction**:
- Visual appearance remains nearly identical (minor padding/opacity adjustments standardized)
- Dismiss interactions unchanged (click X button to hide alert)
- Action buttons (retry, focus, view) remain functional and visually similar
- Alert semantics improved via `role="alert"` / `role="status"` ARIA attributes

**Dependencies**:
- Lucide-react icons (`AlertCircle`, `AlertTriangle`, `Info`, `CheckCircle2`)
- `cn` utility from `@/lib/utils`
- React 19 (already project dependency)

**Evidence**:
- Existing inline implementations across 7 component files (listed in section 2)
- User flows remain identical; only internal implementation changes

---

## 13) Deterministic Test Plan

### Surface: Alert component unit behavior (optional vitest tests)

**Scenarios**:
- Given variant="error", When Alert renders, Then error color classes and AlertCircle icon applied
- Given variant="warning" and icon=false, When Alert renders, Then no icon rendered
- Given onDismiss handler provided, When dismiss button clicked, Then onDismiss callback invoked
- Given title prop provided, When Alert renders, Then title rendered as heading above body content

**Instrumentation / hooks**: Not applicable for unit tests (if written); would use React Testing Library

**Gaps**: Unit tests not strictly required per project conventions; Playwright e2e coverage via consumer specs is sufficient

**Evidence**: Project relies on e2e Playwright coverage per `docs/contribute/testing/playwright_developer_guide.md`

### Surface: Shopping list concept duplicate banner

**Scenarios**:
- Given duplicate part added to concept list, When form submits, Then duplicate banner visible with part key
- Given duplicate banner visible, When dismiss button clicked, Then banner hidden
- Given duplicate banner visible, When "Dismiss" action invoked, Then dialog remains open and banner dismissed

**Instrumentation / hooks**:
- `data-testid="shopping-lists.concept.duplicate-banner"` on Alert container
- `data-testid="shopping-lists.concept.duplicate-banner.dismiss"` on dismiss button (child testId)

**Gaps**: None; existing test coverage at `tests/e2e/shopping-lists/shopping-lists.spec.ts:612-617` will verify refactored Alert component

**Evidence**: `/work/frontend/tests/e2e/shopping-lists/shopping-lists.spec.ts:612-617`

### Surface: Part details link badge error

**Scenarios**:
- Given shopping list or kit membership query fails, When part details page loads, Then error alert visible with message
- Given error alert visible with retry button, When retry clicked, Then queries refetch

**Instrumentation / hooks**:
- `data-testid="parts.detail.link.badges.error"` on Alert container
- Existing retry button testId (consumer-provided within `action` prop)

**Gaps**: Verify existing part detail specs exercise error state and retry flow

**Evidence**: `/work/frontend/src/components/parts/part-details.tsx:348-360`

### Surface: Pick list availability error banner

**Scenarios**:
- Given availability queries fail for multiple parts, When pick list detail loads, Then error banner visible with part keys and error messages
- Given error banner visible, When user interacts with pick list, Then banner persists (not dismissible)

**Instrumentation / hooks**:
- `data-testid="pick-lists.detail.availability.error"` on Alert container

**Gaps**: Verify pick list error scenario is exercised in e2e specs

**Evidence**: `/work/frontend/src/components/pick-lists/pick-list-lines.tsx:81-93`

### Surface: Kit BOM row editor form error

**Scenarios**:
- Given form submission fails, When form mutation rejects, Then error alert visible with message
- Given error alert visible, When user corrects input and resubmits, Then error alert hidden

**Instrumentation / hooks**:
- No explicit testId in current implementation (line 207 does not show testId)
- Add testId during refactoring: `kits.detail.bom.row-editor.error`

**Gaps**: Add testId and ensure kit BOM editing specs assert on error display

**Evidence**: `/work/frontend/src/components/kits/kit-bom-row-editor.tsx:207-209`

### Surface: Shopping list and kit overview error states

**Scenarios**:
- Given overview query fails, When user navigates to overview page, Then error alert visible with retry button
- Given error alert with retry button, When retry clicked, Then query refetches

**Instrumentation / hooks**:
- `data-testid="kits.overview.error"` on Alert container
- `data-testid="shopping-lists.overview.error"` on Alert container
- Retry button testId (consumer-provided within `action` prop)

**Gaps**: Verify overview error states are exercised in e2e specs (may require backend failure injection)

**Evidence**:
- `/work/frontend/src/components/kits/kit-overview-list.tsx:175-183`
- `/work/frontend/src/components/shopping-lists/overview-list.tsx:280-283`

---

## 14) Implementation Slices

This is a medium-sized refactoring task. Recommend incremental slices for safe rollout.

### Slice 1: Create Alert component and export

**Goal**: Establish canonical Alert component with all variant and prop support

**Touches**:
- `src/components/ui/alert.tsx` (create)
- `src/components/ui/index.ts` (add export)

**Dependencies**: None; can be built and exported without consumers

### Slice 2: Refactor error banners (destructive variant)

**Goal**: Replace all error banners with Alert component, verify tests pass

**Touches**:
- `src/components/parts/part-details.tsx` (link badge error)
- `src/components/pick-lists/pick-list-lines.tsx` (availability error)
- `src/components/kits/kit-bom-row-editor.tsx` (form error)
- `src/components/shopping-lists/part/add-to-shopping-list-dialog.tsx` (conflict error)
- `src/components/kits/kit-overview-list.tsx` (overview error)
- `src/components/shopping-lists/overview-list.tsx` (overview error)
- Affected Playwright specs (run and verify green)

**Dependencies**: Slice 1 complete

### Slice 3: Refactor warning banners (amber variant)

**Goal**: Replace all warning banners with Alert component, verify tests pass, including sticky banner with z-index layout classes

**Touches**:
- `src/components/shopping-lists/concept-line-form.tsx` (duplicate banner)
- `src/components/shopping-lists/concept-table.tsx` (duplicate banner with `className="z-[60] pointer-events-auto"`)
- Affected Playwright specs (run and verify green)

**Dependencies**: Slice 1 complete (can run parallel to Slice 2)

---

## 15) Risks & Open Questions

### Risk: Playwright specs break due to testId structure changes

- **Impact**: CI pipeline fails; manual test updates required
- **Mitigation**: Preserve exact testId strings during refactoring; add `.dismiss` suffix to dismiss button child testId as convention; run affected specs locally before committing

### Risk: Action button rendering does not accommodate all existing layouts

- **Impact**: Complex button layouts (separated containers, varied positioning) cannot be replicated with simple flex container approach
- **Mitigation**: Document that parent provides fully styled Button components within `action` prop, rendered in flex container alongside auto-generated dismiss button; existing usages map to this pattern (concept-table has two buttons side-by-side, part-details has retry button in flex, concept-line-form has dismiss button); verify during refactoring that all layouts can be achieved with parent-controlled button styling

### Risk: className prop allows CSS soup to creep back into components

- **Impact**: Developers pass styling classes (colors, borders, padding) via className, defeating Alert encapsulation
- **Mitigation**: Document in Alert JSDoc that className should only be used for layout (margins, width, positioning, z-index); code review guidelines should enforce this; follow pattern from Badge, Button, Card, EmptyState which all accept className without issue

### Risk: Custom icon handling is too flexible and leads to inconsistent usage

- **Impact**: Consumers pass arbitrary icons that don't match variant semantics (e.g., success icon on error Alert)
- **Mitigation**: Document icon prop behavior clearly in JSDoc; code review should catch semantic mismatches; consider restricting `icon` prop to `boolean` only in future iteration if misuse occurs

### Open Question: Should Alert support `success` and `info` variants immediately?

- **Why it matters**: No current usages identified; may be premature to implement unused variants
- **Owner / follow-up**: Implement all four variants immediately to establish complete API and prevent future refactoring when success/info usages emerge; minimal cost to add unused variants now
- **Resolution**: Include all four variants in Slice 1

### Open Question: Should Alert component handle multiline body content with structured lists?

- **Why it matters**: Availability error banner includes `<ul>` with error list; need to ensure Alert supports arbitrary children
- **Owner / follow-up**: Yes, `children` prop is `ReactNode` and supports any valid React content; no special handling required
- **Resolution**: Confirmed; `children: ReactNode` covers this case

### Resolved: Action button and dismiss button layout

- **Original question**: How should action and dismiss buttons be positioned?
- **Resolution**: All buttons render in flex container; parent provides styled action Button components via `action` prop with custom testIds; Alert auto-renders dismiss button when `onDismiss` provided with `data-testid="${testId}.dismiss"`; flex container aligns buttons consistently across all usages

### Resolved: className prop decision

- **Original question**: Should Alert accept className prop or enforce strict encapsulation?
- **Resolution**: Accept className prop following project UI component pattern (Badge, Button, Card, EmptyState); use for layout control (margins, width, positioning, z-index) only; document in JSDoc that styling classes (colors, borders, padding) should not be passed; merge via `cn()` utility

### Resolved: Shortfall badge scope decision

- **Original question**: Should shortfall inline badge use Alert component?
- **Resolution**: **EXCLUDED FROM SCOPE** — shortfall badge is structurally different (inline-flex vs block-level), serves data visualization purpose, has distinct layout requirements (table cell context, compact padding); remains as specialized inline implementation

---

## 16) Confidence

**Confidence: High** — Alert component extraction is well-scoped, all usages identified via grep, existing test coverage will verify correctness, no backend dependencies, and similar refactoring patterns successfully completed in recent InformationBadge and EmptyState extraction work. Risk surface is narrow (layout preservation, testId continuity) and mitigated via incremental slices and local test execution before commits.

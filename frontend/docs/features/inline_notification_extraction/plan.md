# InlineNotification Component Extraction — Technical Plan

## 0) Research Log & Findings

### Discovery Work

Searched the codebase for inline notification/warning badge patterns using the following criteria:
- Files containing `inline-flex items-center` with `rounded border` and colored backgrounds (amber, red, blue, green)
- Usage of `AlertTriangle`, `AlertCircle`, `Info`, and `CheckCircle` icons from lucide-react in inline contexts
- Instances of colored text badges appearing inline with content (not block-level like Alert)
- Patterns combining icons with descriptive text in badge/pill style

### Key Findings

**Total identified usages**: 2 primary instances of inline notification pattern (shortfall badge in pick-lists and quantity mismatch in shopping-lists)

**Pattern characteristics**:
1. **Primary instance**: Pick list shortfall warning (`pick-list-lines.tsx:211`)
   - Structure: `inline-flex items-center gap-2 rounded border border-amber-400 bg-amber-50 px-2 py-1 text-amber-900`
   - Icon: `AlertTriangle` (h-3.5 w-3.5)
   - Content: "Shortfall {NUMBER_FORMATTER.format(shortfall)}"
   - Context: Inline within table cell, displayed conditionally when shortfall > 0

2. **Similar pattern**: Shopping list quantity mismatch (`ready-line-row.tsx:111`)
   - Structure: `text-amber-600` applied to quantity value
   - No badge wrapper, just colored text with tooltip
   - Context: Inline numeric display with conditional styling
   - **Analysis**: This is text emphasis, not a notification badge. Out of scope for InlineNotification component.

3. **Loading indicator pattern**: (`pick-list-lines.tsx:336`)
   - Structure: `inline-flex items-center gap-1`
   - Icon: `Loader2` spinner with "Loading…" text
   - Context: Inline loading state indicator
   - **Analysis**: Specialized loading pattern, out of scope

**Component landscape analysis**:
- `Alert`: Block-level notifications with full-width layout, padding `px-4 py-3`, used for contextual messages
- `Badge`: Pill-shaped entity badges (`rounded-full`), minimal padding `px-2.5 py-0.5`, no icon support
- `InformationBadge`: Metadata/tag badges (`rounded-md`), optional icon (emoji string), remove functionality
- `KeyValueBadge`: Key-value metric badges, wraps Badge component, no icon support
- `StatusBadge`: Entity status badges (active/inactive/success), wraps Badge, no icon support
- **Gap identified**: No component for inline warning/error/info/success notifications with lucide-react icons

**Distinction from existing components**:
- **Alert**: Block-level (full width), role="alert", larger padding, title support, dismiss/action buttons
- **InlineNotification**: Inline-level (inline-flex), compact padding, icon + text only, no dismiss/actions
- **Badge variants**: No semantic color variants, no icon support, different border radius

**Test coverage analysis**:
- Pick list shortfall badge: Covered in `tests/e2e/pick-lists/pick-list-detail.spec.ts:120`
  - Test assertion: `await expect(pickLists.lineShortfall(lineForPartB!.id)).toContainText('Shortfall 6');`
  - Page object: `tests/support/page-objects/pick-lists-page.ts:83`
  - Locator: `page.getByTestId(\`pick-lists.detail.line.\${lineId}.shortfall\`)`

**CSS consistency findings**:
- Border radius: `rounded` (4px)
- Padding: `px-2 py-1` (compact, smaller than Alert's `px-4 py-3`)
- Gap: `gap-2` between icon and text
- Icon size: `h-3.5 w-3.5` (smaller than Alert's `h-5 w-5`)
- Border: Full opacity color classes (e.g., `border-amber-400` not `border-amber-400/50`)
- Background: Light tints (e.g., `bg-amber-50`)
- Text: Dark saturated colors (e.g., `text-amber-900`)

**Instrumentation requirements**:
- Must support `testId` prop for Playwright targeting
- No special test-event coordination required (simple visibility/content assertions)
- Existing testIds must be preserved during refactoring

---

## 1) Intent & Scope

**User intent**

Extract the inline notification/warning badge pattern into a reusable `InlineNotification` UI component in `src/components/ui/inline-notification.tsx`. Establish a standardized, variant-based API for displaying compact inline warnings, errors, info, and success notifications that appear inline with content (not block-level). Eliminate CSS duplication and provide consistent styling across all inline notification use cases.

**Prompt quotes**

> "extracting an InlineNotification component into a reusable UI component in src/components/ui/"
> "An inline notification/warning badge pattern currently used for displaying warnings like shortfalls in pick lists"
> "This pattern combines an icon with descriptive text in a colored badge style and appears inline with content (not block-level like Alert)"
> "Specify the component API (props, variants) WITHOUT a className prop"
> "Suggested variants: warning, error, info, success (similar to Alert component)"
> "Icon support (with default icons per variant)"
> "Plan to REMOVE className props completely (not deprecate, REMOVE) from any wrappers"
> "Resolve all questions autonomously: Accept minor visual differences as acceptable losses for consistency"

**In scope**

- Create `src/components/ui/inline-notification.tsx` component with `error`, `warning`, `info`, `success` variants
  - **Note**: Only `warning` variant has current usage; other variants designed for anticipated future needs
- Support default icons per variant (AlertCircle, AlertTriangle, Info, CheckCircle2) with override capability
- Accept `testId` prop for Playwright test reliability
- NO `className` prop support (enforce consistent styling, no layout escape hatches)
- Refactor primary usage: pick list shortfall badge (`pick-list-lines.tsx:211`)
- Update Playwright spec: `tests/e2e/pick-lists/pick-list-detail.spec.ts`
- Update page object: `tests/support/page-objects/pick-lists-page.ts`
- Export component from `src/components/ui/index.ts`
- Standardize padding, spacing, colors, border styles across all future inline notification usages

**Out of scope**

- Block-level Alert component (already exists, serves different purpose)
- Badge/StatusBadge/KeyValueBadge/InformationBadge components (different use cases)
- Text emphasis patterns like shopping list quantity mismatch (not a badge, just colored text)
- Loading indicator patterns (specialized UI state, not notification)
- Dismissible or actionable notifications (use Alert for those)
- Form validation inline errors (remain as form field errors)
- Refactoring beyond the identified shortfall badge (only 1 current usage to convert)

**Assumptions / constraints**

1. Shortfall badge in pick-list-lines.tsx is the only current instance requiring immediate refactoring
2. Component will be designed for future reuse (error/info/success variants for anticipated needs)
3. Minor visual differences in current implementation are acceptable losses for consistency
4. NO className prop will be provided (breaking change from typical UI component pattern, enforced for inline notifications)
5. Component will be styled as `inline-flex` to flow with surrounding content
6. Playwright tests will remain green by preserving `data-testid` values
7. No backend coordination required; purely frontend component extraction

---

## 2) Affected Areas & File Map

### New Component

- **Area**: `src/components/ui/inline-notification.tsx` (NEW)
- **Why**: Canonical InlineNotification component implementation
- **Evidence**: Does not exist; will be created

### Component Export

- **Area**: `src/components/ui/index.ts`
- **Why**: Export InlineNotification component from UI component barrel
- **Evidence**: /work/frontend/src/components/ui/index.ts:1-21 — Current exports for Alert, badges, etc.

### Pick List Lines Component

- **Area**: `src/components/pick-lists/pick-list-lines.tsx`
- **Why**: Refactor shortfall badge from inline CSS to InlineNotification component
- **Evidence**: /work/frontend/src/components/pick-lists/pick-list-lines.tsx:209-216
```tsx
{shortfall > 0 ? (
  <span
    className="inline-flex items-center gap-2 rounded border border-amber-400 bg-amber-50 px-2 py-1 text-amber-900"
    data-testid={`pick-lists.detail.line.${lineId}.shortfall`}
  >
    <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
    Shortfall {NUMBER_FORMATTER.format(shortfall)}
  </span>
```

### Playwright Spec

- **Area**: `tests/e2e/pick-lists/pick-list-detail.spec.ts`
- **Why**: Verify InlineNotification component renders correctly in tests
- **Evidence**: /work/frontend/tests/e2e/pick-lists/pick-list-detail.spec.ts:120 — Shortfall assertion

### Page Object

- **Area**: `tests/support/page-objects/pick-lists-page.ts`
- **Why**: Ensure page object locator remains compatible with refactored component
- **Evidence**: Grep output: `/work/frontend/tests/support/page-objects/pick-lists-page.ts:83` — `lineShortfall(lineId: number)` locator method

---

## 3) Data Model / Contracts

No data model changes required. Component is purely presentational.

**Component Props Interface**:

```typescript
export type InlineNotificationVariant = 'error' | 'warning' | 'info' | 'success';

export interface InlineNotificationProps {
  /**
   * Visual variant determining color scheme and default icon
   * - error: Destructive red/pink styling with AlertCircle icon
   * - warning: Amber/yellow styling with AlertTriangle icon
   * - info: Blue styling with Info icon
   * - success: Green styling with CheckCircle2 icon
   */
  variant: InlineNotificationVariant;

  /**
   * Notification content (text or React nodes)
   */
  children: React.ReactNode;

  /**
   * Optional icon override
   * - true: Render default icon for variant
   * - ReactNode: Render custom icon
   * - false/undefined: No icon
   */
  icon?: React.ReactNode | boolean;

  /**
   * Required base testId for Playwright targeting
   * Applied to container span element
   */
  testId: string;
}
```

**NO className prop** — This is an intentional design decision to enforce visual consistency. Unlike Alert, Button, Card which need layout control, InlineNotification is meant to flow inline with content and should have uniform, predictable styling.

---

## 4) API / Integration Surface

No API integration required. Component is purely presentational, no backend calls.

---

## 5) Algorithms & UI Flows

**Rendering Flow**:

1. Component receives `variant`, `children`, `icon`, `testId` props
2. Map `variant` to color class strings:
   - `error`: `border-destructive/50 bg-destructive/10 text-destructive`
   - `warning`: `border-amber-400 bg-amber-50 text-amber-900`
   - `info`: `border-blue-400 bg-blue-50 text-blue-900`
   - `success`: `border-green-400 bg-green-50 text-green-900`
3. Map `variant` to default icon component:
   - `error`: `AlertCircle`
   - `warning`: `AlertTriangle`
   - `info`: `Info`
   - `success`: `CheckCircle2`
4. Resolve icon rendering:
   - If `icon === true`: Render default icon for variant
   - If `icon` is ReactNode: Render custom icon
   - If `icon === false` or undefined: No icon
5. Render `span` with:
   - Base classes: `inline-flex items-center gap-2 rounded border px-2 py-1 text-sm`
   - Variant color classes
   - `data-testid={testId}`
6. Render icon slot (if resolved) with `h-3.5 w-3.5 flex-shrink-0 aria-hidden="true"`
7. Render children content

**No state management** — Pure presentational component, no React state

---

## 6) Derived State & Invariants

None required. Component is stateless and purely presentational.

---

## 7) State Consistency & Async Coordination

Not applicable. Component has no async behavior, no TanStack Query integration, no instrumentation events.

---

## 8) Errors & Edge Cases

### Edge Case: Empty Children

- **Failure**: Component rendered with no children content
- **Surface**: Visual rendering may look broken (icon without text)
- **Handling**: TypeScript typing ensures `children` is required (ReactNode); allow empty string but expect consumers to provide meaningful content
- **Guardrails**: Component renders whatever is provided; validation is consumer responsibility

### Edge Case: Long Content

- **Failure**: Very long text content may wrap or overflow container
- **Surface**: Visual layout in tight table cells or narrow containers
- **Handling**: Component uses `inline-flex` which prevents internal text wrapping—content will expand horizontally. Consumers in constrained contexts (table cells, narrow panels) should apply `max-width` or manage parent container width if overflow is a concern.
- **Guardrails**: No `max-width` or text truncation applied; consumers must manage layout constraints in parent containers

### Edge Case: Icon Size Mismatch

- **Failure**: Custom icon provided with different size than default icons
- **Surface**: Visual inconsistency when mixing default and custom icons
- **Handling**: Default icons are sized `h-3.5 w-3.5`; custom icons should match this size
- **Guardrails**: Documentation examples demonstrate icon sizing; no runtime enforcement

---

## 9) Observability / Instrumentation

### Test ID Attribute

- **Signal**: `data-testid` attribute on container span
- **Type**: Playwright locator target
- **Trigger**: Always present when component renders
- **Labels / fields**: testId prop value
- **Consumer**: Playwright specs via `page.getByTestId()`
- **Evidence**: /work/frontend/tests/support/page-objects/pick-lists-page.ts:83

**No test-event instrumentation required** — Component is presentational; tests assert visibility and content via standard Playwright locators.

---

## 10) Lifecycle & Background Work

Not applicable. Component has no effects, subscriptions, or background work.

---

## 11) Security & Permissions

Not applicable. Component renders UI content provided by parent; no sensitive data handling or access control.

---

## 12) UX / UI Impact

### Visual Changes

**Entry point**: Pick list detail page (`/pick-lists/:id`)

**Change**: Shortfall badge styling standardization
- Current: `border-amber-400 bg-amber-50 px-2 py-1 text-amber-900`
- Planned: Same visual output, encapsulated in InlineNotification component
- Minor change: Border color may shift from `border-amber-400` (full opacity) to `border-amber-400` (no change) OR standardize to match Alert pattern `border-amber-300` — **Decision: Keep `border-amber-400` for inline notifications to maintain higher contrast in compact inline contexts**

**User interaction**: No change to user interaction model; shortfall badge remains read-only inline indicator

**Accessibility**:
- Component will NOT include `role="alert"` or `role="status"` attributes by default
- **Rationale**: Unlike the Alert component which announces contextual messages, inline notifications in this application are predominantly used for static data display (e.g., shortfall quantities that are visible on initial render). Adding assertive announcements would create excessive noise for screen readers.
- **Future consideration**: If dynamic inline notifications are added (appearing after user actions), evaluate adding `role="status"` for polite announcements or `role="alert"` for critical warnings. This can be handled via an optional `role` prop if needed.
- Icons use `aria-hidden="true"` since text content provides the semantic meaning

**Dependencies**: None; purely frontend component refactoring

**Evidence**: /work/frontend/src/components/pick-lists/pick-list-lines.tsx:209-220

---

## 13) Deterministic Test Plan

### Surface: Pick List Detail — Shortfall Badge

**Scenarios**:

1. **Given** a pick list line with sufficient stock, **When** viewing the line, **Then** no shortfall badge is displayed
   - Existing coverage: Implicit in spec (shortfall badge only asserted when present)

2. **Given** a pick list line with insufficient stock (shortfall > 0), **When** viewing the line, **Then** shortfall badge displays "Shortfall {quantity}" with warning icon
   - **Existing coverage**: /work/frontend/tests/e2e/pick-lists/pick-list-detail.spec.ts:120
   - **Assertion**: `await expect(pickLists.lineShortfall(lineForPartB!.id)).toContainText('Shortfall 6');`
   - **No change required**: Component refactoring preserves `data-testid` and content structure

**Instrumentation / hooks**:
- **Selector**: `data-testid="pick-lists.detail.line.{lineId}.shortfall"`
- **No instrumentation events**: Component is presentational; tests assert DOM visibility and content

**Gaps**: None. Existing test coverage is sufficient and will remain green after refactoring.

**Evidence**: /work/frontend/tests/e2e/pick-lists/pick-list-detail.spec.ts:7-121

---

## 14) Implementation Slices

**Slice 1: Component Creation**
- **Goal**: Implement InlineNotification component with all variants
- **Touches**:
  - Create `src/components/ui/inline-notification.tsx`
  - Export from `src/components/ui/index.ts`
- **Dependencies**: None

**Slice 2: Pick List Refactoring**
- **Goal**: Replace shortfall badge inline CSS with InlineNotification component
- **Touches**:
  - `src/components/pick-lists/pick-list-lines.tsx`
- **Dependencies**: Slice 1 must be complete

**Slice 3: Test Verification**
- **Goal**: Verify Playwright spec remains green
- **Touches**:
  - Run `tests/e2e/pick-lists/pick-list-detail.spec.ts`
  - Confirm page object locator still works
- **Dependencies**: Slice 2 must be complete

---

## 15) Risks & Open Questions

### Risks

**Risk**: InlineNotification and Alert variants may diverge over time
- **Impact**: Inconsistent color/styling between block-level and inline notifications
- **Mitigation**: Document the relationship in component JSDoc; both components should use same variant names and similar color mappings (accepting minor differences for context)

**Risk**: Consumers may want layout control (margins, positioning) that className prop would provide
- **Impact**: Requests for className prop may emerge; design decision to exclude it may be challenged
- **Mitigation**: Design decision documented in plan; consumers can wrap component in container div if layout control needed

**Risk**: Future inline notification needs may require dismiss/action buttons
- **Impact**: Component API may need expansion
- **Mitigation**: Start simple; extend API when concrete use case emerges (YAGNI principle)

### Open Questions

None. All design decisions resolved autonomously per requirements.

---

## 16) Confidence

**Confidence: High** — Pattern is well-understood, only 1 current usage to refactor, clear distinction from existing components, no backend dependencies, existing test coverage will validate refactoring success.

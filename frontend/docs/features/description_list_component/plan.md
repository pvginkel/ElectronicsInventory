# Description List Component Extraction — Implementation Plan

## 0) Research Log & Findings

### Discovery Summary

Conducted comprehensive search across the codebase to identify all usages of the label-value pair pattern. Key findings:

**Pattern Identification:**
- Searched for `text-sm font-medium` (label styling): Found 27 files with 105+ occurrences
- Searched for `text-lg` (common value styling): Found extensive usage in detail views
- Searched for `text-2xl font-bold` (prominent value styling): Found 5 files
- Pattern appears in: part-details (18+ occurrences), box-details (4 occurrences), dashboard components (10+ files), type-card, box-card, and throughout the application

**Architectural Context:**
- Reviewed `docs/contribute/architecture/application_overview.md` — confirms React 19 + TypeScript with domain-driven folder layout
- Reviewed `docs/contribute/ui/data_display.md` — establishes conventions for detail surfaces and instrumentation
- Reviewed `docs/contribute/ui/tooltip_guidelines.md` — confirms prohibition on custom implementations, mandate for reusable components
- Reviewed `docs/contribute/testing/playwright_developer_guide.md` — confirms instrumentation requirements and test-event taxonomy

**Existing UI Components:**
- `KeyValueBadge` exists (`src/components/ui/key-value-badge.tsx`) — handles badge-format key-value pairs with semantic colors
- Pattern found in `part-details.tsx`: 18+ distinct label-value pairs with variants (text-lg, text-sm, text-2xl font-bold)
- Pattern found in `box-details.tsx`: 4 distinct label-value pairs
- Pattern found in dashboard components: metrics cards use variations of this pattern

**Styling Variants Identified:**
1. **Standard pair**: `text-sm font-medium` (label) + `text-lg` (value)
2. **Prominent pair**: `text-sm font-medium` (label) + `text-2xl font-bold` (value) — used for primary identifiers
3. **Compact pair**: `text-sm font-medium` (label) + `text-sm` (value) — used for technical specs
4. **Muted value**: `text-sm font-medium` (label) + `text-sm text-muted-foreground` (value) — used for dates
5. **Section grouping**: Wrapped in `space-y-2` or `space-y-4` containers

**Conflicts Resolved:**
- KeyValueBadge serves a different purpose (inline badges in metadata rows, not detail views)
- The new component will be complementary, not overlapping
- Decision: Name it `DescriptionList` (semantic HTML dl/dt/dd pattern) with individual `DescriptionItem` exports

### Referenced Documentation
- `docs/contribute/architecture/application_overview.md` (lines 47-66) — UI composition patterns
- `docs/contribute/ui/data_display.md` (lines 13-17) — detail surface conventions
- `docs/contribute/ui/tooltip_guidelines.md` (lines 301-334) — prohibition on bespoke implementations
- `docs/contribute/testing/playwright_developer_guide.md` (lines 22-48) — instrumentation requirements

---

## 1) Intent & Scope

**User intent**

Extract the pervasive label-value pair display pattern into a reusable, domain-agnostic UI component that eliminates technical debt, enforces visual consistency, and reduces code duplication across detail views, cards, and information displays.

**Prompt quotes**

"The component API must NOT include a className prop (per workflow principles)"

"Must be domain-agnostic and generic"

"This is technical debt elimination work"

"Accept minor visual differences as acceptable losses for consistency"

"Make breaking changes where needed - do not attempt backward compatibility"

"Plan to REMOVE className props from any domain-specific wrappers completely (not deprecate, REMOVE)"

**In scope**

- Create `DescriptionList` and `DescriptionItem` components in `src/components/ui/`
- Define semantic variant system (default, prominent, compact, muted) with NO className escape hatch
- Support optional icons, links, custom value rendering via children
- Refactor ALL identified usages (25-30+ instances) to use new component
- Update Playwright specs where components have test coverage
- Remove inline patterns completely — no compatibility layer
- Export from `src/components/ui/index.ts`

**Out of scope**

- KeyValueBadge component (serves different purpose — inline badges)
- MetricsCard component (specialized dashboard component)
- Badge components (StatusBadge, InformationBadge)
- Form field label-input pairs (handled by form components)
- Backward compatibility or gradual migration (this is a breaking change)

**Exclusion Criteria (When NOT to use DescriptionList)**

Do not attempt to refactor patterns that match any of these criteria:
1. **Horizontal layouts** — Label and value are side-by-side in a flex/grid row (not vertical stacking)
2. **Interactive value slots** — Value area requires buttons, form inputs, or other interactive controls (violates presentation-only principle)
3. **Highly specialized spacing** — Layout requires spacing that can't map to the three spacing variants (compact/default/relaxed)
4. **Non-primary content pattern** — Label-value pairs are not the primary content pattern (e.g., metrics cards with large numbers, icons, trend indicators)
5. **Complex multi-value layouts** — Value rendering requires complex layout logic (flex-wrap, custom spacing for multiple elements, conditional empty states with specialized formatting)

**Assumptions / constraints**

- TypeScript strict mode will catch all affected call sites after breaking changes
- Minor visual differences (spacing, sizing tweaks) are acceptable
- Playwright tests currently assert on text content visibility, not specific styling
- No runtime performance concerns with component extraction
- Follow existing UI component patterns (no className prop, variant-based API)
- Component must work with existing instrumentation (`data-testid` support)

---

## 2) Affected Areas & File Map

### New Components (Create)

**DescriptionList Component**
- **File**: `src/components/ui/description-list.tsx`
- **Why**: Core component implementation with variant system
- **Evidence**: Pattern analysis across 27 files requires centralized implementation

**DescriptionItem Component**
- **File**: `src/components/ui/description-list.tsx` (same file, separate export)
- **Why**: Individual item component for granular control
- **Evidence**: Some usages need standalone items without list wrapper

### Modified Components (Refactor)

**Part Details**
- **File**: `src/components/parts/part-details.tsx`
- **Why**: Contains 18+ label-value pairs — highest concentration in codebase
- **Evidence**: Lines 479-480, 501-502, 508-509, 531-532, 538-539, 552-553, 558-560, 565-579, 583-586, 614-615, 621-622, 628-629, 635-636, 642-643, 661-662, 668-669, 675-676, 682-683
  ```tsx
  <div className="text-sm font-medium">Part ID</div>
  <div className="font-mono text-2xl font-bold">{displayId}</div>
  ```

**Box Details**
- **File**: `src/components/boxes/box-details.tsx`
- **Why**: Contains 4 label-value pairs in summary card
- **Evidence**: Lines 244-245, 249-250, 254-255, 259-262
  ```tsx
  <div className="text-sm font-medium">Box Number</div>
  <div className="text-2xl font-bold">#{box.box_no}</div>
  ```

**Type Card**
- **File**: `src/components/types/type-card.tsx`
- **Why**: Contains label-value pattern in card header
- **Evidence**: Lines 25-26
  ```tsx
  <div className="text-sm font-medium">{displayPartCount} parts</div>
  <div className="text-xs text-muted-foreground">using this type</div>
  ```

**Box Card**
- **File**: `src/components/boxes/box-card.tsx`
- **Why**: Contains label-value pattern in card header
- **Evidence**: Lines 42-43
  ```tsx
  <div className="text-sm font-medium">{box.capacity} locations</div>
  <div className="text-xs text-muted-foreground">capacity</div>
  ```

**Dashboard Components** (10+ files)
- **Files**:
  - `src/components/dashboard/enhanced-metrics-cards.tsx`
  - `src/components/dashboard/metrics-card.tsx`
  - `src/components/dashboard/storage-utilization-grid.tsx`
  - `src/components/dashboard/category-distribution.tsx`
  - `src/components/dashboard/low-stock-alerts.tsx`
  - `src/components/dashboard/recent-activity-timeline.tsx`
  - `src/components/dashboard/inventory-health-score.tsx`
  - `src/components/dashboard/documentation-status.tsx`
- **Why**: Various label-value patterns in metrics and status displays
- **Evidence**: Lines referenced in grep results — patterns vary by component but share label-value structure

**Pick List Lines**
- **File**: `src/components/pick-lists/pick-list-lines.tsx`
- **Why**: Contains label-value patterns in line item displays
- **Evidence**: Grep result indicates `text-sm font-medium` usage

**Shopping List Components** (multiple files)
- **Files**:
  - `src/components/shopping-lists/ready/ready-line-row.tsx`
  - `src/components/shopping-lists/ready/update-stock-dialog.tsx`
  - `src/components/shopping-lists/concept-line-row.tsx`
- **Why**: Contains label-value patterns in line items and dialogs
- **Evidence**: Grep results confirm pattern usage

**Kit Components**
- **Files**:
  - `src/components/kits/kit-bom-table.tsx`
  - `src/components/kits/kit-pick-list-panel.tsx`
- **Why**: Contains label-value patterns in BOM displays
- **Evidence**: Grep results confirm pattern usage

**Part Form**
- **File**: `src/components/parts/part-form.tsx`
- **Why**: Contains label-value patterns for read-only fields or summaries
- **Evidence**: Line 627 grep result

**Document Tile**
- **File**: `src/components/documents/document-tile.tsx`
- **Why**: Contains label-value pattern for metadata
- **Evidence**: Grep result indicates usage

**Location Item**
- **File**: `src/components/boxes/location-item.tsx`
- **Why**: Contains label-value patterns for location metadata
- **Evidence**: Grep result indicates usage

**AI Part Progress Step**
- **File**: `src/components/parts/ai-part-progress-step.tsx`
- **Why**: Contains label-value patterns in progress display
- **Evidence**: Lines 91, 110 show `text-sm font-medium` usage

### UI Infrastructure (Update)

**UI Index**
- **File**: `src/components/ui/index.ts`
- **Why**: Export new DescriptionList and DescriptionItem components
- **Evidence**: Current index exports Alert, KeyValueBadge, StatusBadge — new components follow same pattern

### Test Coverage (Update)

**Parts Tests**
- **File**: `tests/e2e/parts/part-crud.spec.ts`
- **Why**: Asserts on part detail content visibility — verify after refactor
- **Evidence**: Lines 17-18, 45-46 assert on detail text content
  ```typescript
  await parts.expectDetailHeading('LM7805 Voltage Regulator');
  await expect(parts.detailRoot).toContainText('LM7805');
  ```

**Boxes Tests**
- **File**: `tests/e2e/boxes/boxes-detail.spec.ts`
- **Why**: Asserts on box detail summary content — verify after refactor
- **Evidence**: Lines 41-44 assert on summary text
  ```typescript
  await expect(boxes.detailSummary).toContainText('Box Number')
  await expect(boxes.detailSummary).toContainText(String(box.box_no))
  ```

**Dashboard Tests** (6+ spec files)
- **Files**: Various dashboard spec files
- **Why**: Assert on metrics card content — verify after refactor
- **Evidence**: Dashboard specs test metrics card visibility and content

---

## 3) Data Model / Contracts

### Component Props Interface

**DescriptionList Props**

```typescript
interface DescriptionListProps {
  children: ReactNode;
  spacing?: 'compact' | 'default' | 'relaxed'; // controls space-y-* between items
  testId?: string; // data-testid for Playwright
}
```

**Mapping:**
- `spacing="compact"` → `space-y-1`
- `spacing="default"` → `space-y-2`
- `spacing="relaxed"` → `space-y-4`

**Evidence**: Existing patterns show `space-y-2` (most common) and `space-y-4` (section spacing) in `part-details.tsx` lines 492-520, 528-547

---

**DescriptionItem Props**

```typescript
interface DescriptionItemProps {
  label: string | ReactNode; // label text or custom element
  value?: string | number | ReactNode; // simple value or custom rendering
  children?: ReactNode; // alternative to value for complex content
  variant?: 'default' | 'prominent' | 'compact' | 'muted'; // visual treatment
  icon?: ReactNode; // optional icon before label
  testId?: string; // data-testid for the item container
  labelTestId?: string; // data-testid for label element (rare, specific assertions)
  valueTestId?: string; // data-testid for value element (rare, specific assertions)
}

// Value rendering rules:
// 1. If `children` provided, render children (takes precedence over `value`)
// 2. If `value` provided and non-null/non-undefined, render value
// 3. If `value` is null/undefined/empty string, render empty div (no placeholder text)
// 4. Caller is responsible for providing fallback text via `value` prop if desired
//    Example: value={part.type?.name ?? 'No type assigned'}
//
// Rationale: Keeping placeholder logic at call sites preserves existing UX decisions
// (some fields show "No X assigned", others show "—", others conditional render) and
// avoids adding string-matching logic to the generic component.
```

**Variant Mapping:**
- `variant="default"`: label `text-sm font-medium`, value `text-lg`
- `variant="prominent"`: label `text-sm font-medium`, value `text-2xl font-bold`
- `variant="compact"`: label `text-sm font-medium`, value `text-sm`
- `variant="muted"`: label `text-sm font-medium`, value `text-sm text-muted-foreground`

**Existing Value Classes → Proposed Variant (with standardization):**
- `text-2xl font-bold` → `prominent` (exact match)
- `text-xl` → `default` (standardized to `text-lg`, ±2-4px acceptable visual drift)
- `text-lg` → `default` (exact match)
- `text-base` → `default` (standardized to `text-lg`, ±2-4px acceptable visual drift)
- `text-sm` (with `text-muted-foreground`) → `muted` (exact match)
- `text-sm` (no color class) → `compact` (exact match)
- `text-xs` → `compact` (standardized to `text-sm`, ±1-2px acceptable visual drift)

**Evidence:**
- Prominent variant: `part-details.tsx` line 480 (Part ID), `box-details.tsx` line 245 (Box Number)
- Default variant: `part-details.tsx` lines 502, 532, 553 (most label-value pairs)
- Compact variant: `part-details.tsx` lines 615, 622, 629 (technical specs)
- Muted variant: `part-details.tsx` lines 584-586 (Created date)
- Standardization note: Some values styled `text-xl` or `text-base` will consolidate to `text-lg` (default variant) — this is acceptable visual drift per requirements

---

**API Compatibility**

No backend API changes required. Component is pure presentation logic operating on data already fetched via existing TanStack Query hooks.

**Evidence**: Components like `part-details.tsx` use `useGetPartsByPartKey` (line 71-79), `box-details.tsx` uses `useGetBoxesByBoxNo` (lines 32-37) — no changes to these contracts

---

## 4) API / Integration Surface

### Component Import/Export

**Surface**: ES module export from `src/components/ui/description-list.tsx`
**Inputs**: None (pure component, no API calls)
**Outputs**: React component exports
**Errors**: TypeScript compile-time errors only (invalid props)
**Evidence**: Follows pattern of `src/components/ui/key-value-badge.tsx` (lines 34-51) and other UI components

---

**Export Signature**

```typescript
export const DescriptionList: React.FC<DescriptionListProps>
export const DescriptionItem: React.FC<DescriptionItemProps>
```

**Evidence**: Pattern matches existing UI components like `Alert`, `KeyValueBadge`, `Tooltip` in `src/components/ui/index.ts` (lines 1-27)

---

### UI Index Re-export

**Surface**: `src/components/ui/index.ts` barrel export
**Inputs**: Import from `./description-list`
**Outputs**: Named exports for consumer components
**Errors**: None (compile-time only)
**Evidence**: Lines 1-27 show pattern for exporting UI components

---

**No Network Integration**

This is a pure presentation component. No TanStack Query hooks, no backend endpoints, no mutation logic. Component consumes data passed as props from parent components that already handle data fetching.

**Evidence**: Similar to `Badge`, `Skeleton`, `Card` — pure UI primitives with no data fetching

---

## 5) Algorithms & UI Flows

### Flow: Render Description List

**Flow**: Component receives children (DescriptionItem elements) and renders with spacing

**Steps**:
1. Accept `children`, `spacing`, and `testId` props
2. Map `spacing` prop to Tailwind space-y-* class
3. Render semantic `<div>` (considered using `<dl>` but avoiding for flexibility) with spacing class
4. Apply `data-testid` if provided
5. Render children in document order

**States / transitions**:
- Static component, no internal state
- Spacing variant determined at render time from props
- Children render as-is (composition pattern)

**Hotspots**:
- None — trivial container component with no performance concerns
- Re-renders only when parent re-renders (React default behavior)

**Evidence**: Pattern mirrors `Card` component architecture in `src/components/ui/card.tsx` — simple container with variant classes

---

### Flow: Render Description Item

**Flow**: Component receives label, value, variant and renders formatted pair

**Steps**:
1. Accept `label`, `value`, `children`, `variant`, `icon`, test IDs
2. Determine label and value classes from `variant` prop
3. If `icon` provided, prepend to label
4. Render label div with label classes and optional icon
5. If `value` prop provided, render value div with value classes
6. If `children` provided (and no `value`), render children in value slot
7. Apply `data-testid` to container, optionally to label/value elements
8. Handle ExternalLink, ReactNode, primitive values in value slot

**States / transitions**:
- Static component, no internal state
- Variant classes determined at render time
- Value rendering strategy (string vs ReactNode vs children) determined by prop presence

**Hotspots**:
- Conditional rendering logic (value vs children) — ensure clear precedence
- ReactNode support for value slot — must handle Link, Badge, custom elements
- Typography classes must not leak from component (no className prop)

**Evidence**:
- Conditional rendering pattern seen in `part-details.tsx` lines 506-518 (optional product page link)
- Custom value rendering in `part-details.tsx` lines 565-579 (tags with Badge elements)
- Icon pattern in dashboard components (metrics cards with emoji icons)

---

### Flow: Refactor Existing Component

**Flow**: Replace inline label-value divs with DescriptionList/DescriptionItem

**Steps**:
1. Import DescriptionList, DescriptionItem from `@/components/ui`
2. Identify contiguous group of label-value pairs
3. Determine appropriate `spacing` prop (default `space-y-2` → `default`)
4. Wrap group in `<DescriptionList spacing="default">`
5. For each pair:
   a. Determine variant from existing classes (text-lg → default, text-2xl font-bold → prominent, etc.)
   b. Extract label text, value content
   c. If value contains link or custom element, pass as `value` prop or `children`
   d. Preserve any `data-testid` attributes:
      - If existing testId is on container div wrapping both label and value, map to DescriptionItem `testId` prop
      - If label has individual testId, map to `labelTestId` prop
      - If value has individual testId, map to `valueTestId` prop
      - Note: Most existing label-value pairs do not have individual testIds; tests rely on parent container selectors
      - Only add item-level testIds if Playwright specs explicitly require them
   e. Preserve existing null/fallback handling logic at call site (e.g., `value={part.type?.name ?? 'No type assigned'}`)
   f. Replace divs with `<DescriptionItem label="..." value="..." variant="..." />`
6. Remove old div wrappers completely
7. Verify TypeScript compiles (catches missing props, typos)
8. Run affected Playwright specs to verify content assertions still pass

**States / transitions**:
- Before: Inline divs with Tailwind classes
- After: Declarative DescriptionItem components with semantic props
- Intermediate: TypeScript errors guide refactoring (missing imports, invalid props)

**Hotspots**:
- Custom value rendering (links, badges, conditional display) — use `children` prop for complex cases
- Nested structures (subsections with headers) — may need multiple DescriptionList blocks
- Test ID mapping — preserve existing IDs to avoid breaking Playwright selectors

**Evidence**:
- Refactor pattern established by KeyValueBadge migration (mentioned in docs but pre-dates this work)
- TypeScript strict mode enforces completeness (`docs/contribute/architecture/application_overview.md` line 62)

---

## 6) Derived State & Invariants

### Derived value: Spacing class name

- **Source**: `spacing` prop (`'compact' | 'default' | 'relaxed'`)
- **Writes / cleanup**: Rendered directly to className, no side effects
- **Guards**: TypeScript union type prevents invalid values
- **Invariant**: spacing prop must map exactly to one of three Tailwind space-y-* classes
- **Evidence**: `src/components/ui/segmented-tabs.tsx` uses similar variant-to-class mapping pattern

---

### Derived value: Variant classes (label and value)

- **Source**: `variant` prop (`'default' | 'prominent' | 'compact' | 'muted'`)
- **Writes / cleanup**: Applied to label and value divs, no side effects
- **Guards**: TypeScript union type prevents invalid variants
- **Invariant**: Each variant must produce exactly two class strings (one for label, one for value) with no runtime conditional logic beyond prop lookup
- **Evidence**: Existing code in `part-details.tsx` uses static classes consistently — no dynamic overrides

---

### Derived value: Value rendering strategy

- **Source**: Presence of `value` prop, `children` prop, or both
- **Writes / cleanup**: Determines which slot to render, no mutations
- **Guards**: Precedence: `children` overrides `value` if both provided (composition takes priority)
- **Invariant**: Value slot must always render *something* (even if null/undefined value, show empty space) OR be omitted entirely if both props missing (label-only mode for section headers)
- **Evidence**: Existing patterns show conditional value rendering in `part-details.tsx` lines 499-520 (manufacturer section only renders if data present)

---

**No Filtered-to-Persistent Write Risk**

Component is purely presentational. No form inputs, no mutations, no cache writes. Data flows one-way from parent props to rendered output. No derived state that could cause data loss or UI drift.

**Evidence**: No `useState`, `useEffect`, or mutation hooks in component — pure function component

---

## 7) State Consistency & Async Coordination

**Source of truth**: Parent component props (data fetched via TanStack Query in parent)

**Coordination**: None required — component is stateless and synchronous

**Async safeguards**: Not applicable — no async operations, no network calls, no data fetching

**Instrumentation**: Component supports `data-testid` props for Playwright selectors. No test-event emission (not a workflow component). Instrumentation handled by parent components (e.g., `useListLoadingInstrumentation` in `part-details.tsx` lines 168-191).

**Evidence**:
- Pattern matches `Badge`, `Skeleton`, `Card` — pure UI components with no instrumentation
- Parent components like `part-details.tsx` emit test events, not the UI primitives they compose
- `docs/contribute/testing/playwright_developer_guide.md` lines 22-48 confirms page objects interact with `data-testid` attributes, not component internals

---

## 8) Errors & Edge Cases

### Failure: Missing required props

- **Surface**: DescriptionItem component
- **Handling**: TypeScript compile error — required `label` prop missing
- **Guardrails**: Strict TypeScript mode enforces prop validation at compile time
- **Evidence**: Existing pattern in `src/components/ui/key-value-badge.tsx` lines 13-22 (required label and value props)

---

### Failure: Invalid variant value

- **Surface**: DescriptionItem component
- **Handling**: TypeScript compile error — variant prop type is union of string literals
- **Guardrails**: TypeScript type checker prevents invalid variants
- **Evidence**: Union type pattern used throughout codebase (e.g., `AlertVariant`, `CardVariant`)

---

### Edge Case: Empty or null value

- **Surface**: DescriptionItem value display
- **Handling**: Component renders empty div (no content) when value is null/undefined. Caller is responsible for providing fallback text via the `value` prop if desired (e.g., `value={part.type?.name ?? 'No type assigned'}`).
- **Guardrails**: Component should handle null/undefined gracefully without crashing
- **Rationale**: Keeping placeholder logic at call sites preserves existing UX decisions (some fields show "No X assigned", others show "—", others show empty space) and avoids adding string-matching logic to the generic component. See Section 3 (Data Model) for complete value rendering rules.
- **Evidence**: Existing code in `part-details.tsx` lines 559-561 shows conditional "No type assigned" fallback handled at call site:
  ```tsx
  <div className="text-lg">
    {part.type?.name ?? 'No type assigned'}
  </div>
  ```

---

### Edge Case: Long text overflow

- **Surface**: Label or value text exceeds container width
- **Handling**: Let Tailwind defaults apply (text wraps by default) OR apply `truncate` in specific parent contexts (not component's responsibility)
- **Guardrails**: Parent component controls width, this component renders content as-is
- **Evidence**: Existing grid layouts in `part-details.tsx` line 491 use responsive grids to allocate space

---

### Edge Case: Custom value rendering breaks layout

- **Surface**: Consumer passes complex ReactNode as `children` (e.g., multi-line form, interactive widget)
- **Handling**: Render as-is — composition pattern gives consumer full control and responsibility
- **Guardrails**: Document in component JSDoc that `children` prop is unrestricted (consumer owns layout consequences)
- **Evidence**: Existing pattern in `part-details.tsx` lines 565-579 shows custom Badge rendering in value slot

---

### Edge Case: TestId collision

- **Surface**: Multiple DescriptionItem components with same testId
- **Handling**: Playwright will match first element — consumer must ensure unique IDs
- **Guardrails**: None (component can't enforce uniqueness across tree), document in API reference
- **Evidence**: Existing pattern in test specs like `boxes-detail.spec.ts` lines 41-44 use namespaced testIds to avoid collisions

---

## 9) Observability / Instrumentation

### Signal: data-testid attributes

- **Type**: Instrumentation attribute (data-testid)
- **Trigger**: Rendered when `testId`, `labelTestId`, or `valueTestId` props provided
- **Labels / fields**:
  - `testId` → container div
  - `labelTestId` → label div (optional)
  - `valueTestId` → value div (optional)
- **Consumer**: Playwright page objects (e.g., `boxes.detailSummary`, `parts.detailRoot`)
- **Evidence**:
  - `tests/e2e/boxes/boxes-detail.spec.ts` lines 41-44 assert on `boxes.detailSummary` containing text
  - `tests/e2e/parts/part-crud.spec.ts` lines 17-18 assert on `parts.detailRoot` containing text

---

**No Test Events**

Component does not emit test events. It's a pure UI primitive, not a workflow component. Parent components (detail views, forms) emit events via `useListLoadingInstrumentation`, `useFormInstrumentation`, etc.

**Evidence**: `docs/contribute/architecture/test_instrumentation.md` (referenced in playwright guide) defines event taxonomy — DescriptionList is below the granularity threshold for events

---

**No Analytics**

Pure presentation component with no user interaction tracking. Parent components own analytics concerns.

**Evidence**: Matches pattern of other UI primitives (Badge, Card, Skeleton) which don't emit analytics events

---

## 10) Lifecycle & Background Work

**No lifecycle hooks required**

Component is a pure function component with no state, no side effects, no subscriptions, no timers, no event listeners beyond React's built-in rendering.

**Evidence**:
- Implementation will match `Badge` component pattern (pure, no hooks)
- `src/components/ui/badge.tsx` is 30 lines of pure JSX, no useEffect or useState
- No cleanup necessary — React handles unmounting automatically

---

## 11) Security & Permissions

**Not applicable**

Component renders text and React elements passed as props. No user input, no data fetching, no authorization checks, no sensitive data handling.

**Evidence**: Pure presentation component, same security profile as `Badge` or `Skeleton` — no attack surface beyond XSS (React escapes text by default)

---

## 12) UX / UI Impact

### Entry point: All detail views, cards, and information panels

- **Change**: Replace inline label-value divs with semantic DescriptionList/DescriptionItem components
- **User interaction**: No behavior change — users see identical (or near-identical) layout and content
- **Dependencies**: TypeScript compiler, existing data fetching hooks (no changes required)
- **Evidence**: Refactoring preserves visual structure, only changes implementation

---

### Entry point: Part Details (`/parts/:partId`)

- **Change**: 18+ label-value pairs refactored to DescriptionItem components
- **User interaction**: Identical appearance, users see same part information in same layout
- **Dependencies**: `useGetPartsByPartKey` query continues to provide data
- **Evidence**: `part-details.tsx` lines 454-692 contain detail rendering — structure preserved, implementation changed

---

### Entry point: Box Details (`/boxes/:boxNo`)

- **Change**: 4 label-value pairs in summary card refactored
- **User interaction**: Identical appearance
- **Dependencies**: `useGetBoxesByBoxNo` query unchanged
- **Evidence**: `box-details.tsx` lines 243-269 contain summary card — visual output unchanged

---

### Entry point: Dashboard widgets

- **Change**: Various dashboard components refactored to use DescriptionItem for metric displays
- **User interaction**: Possible minor spacing/sizing differences (acceptable per requirements)
- **Dependencies**: `useDashboardMetrics`, `useDashboardStorage` hooks unchanged
- **Evidence**: Dashboard components in `src/components/dashboard/` — may have slight visual tweaks within acceptable tolerance

---

### Accessibility impact

- **Before**: Nested divs with no semantic structure
- **After**: Still divs (not `<dl>` tags due to flexibility requirements), but consistent structure and keyboard navigability unchanged
- **No ARIA changes**: Component doesn't add roles or ARIA attributes — parent components own accessibility concerns
- **Evidence**: Existing code has no ARIA labels on label-value pairs — this refactor doesn't change accessibility (could improve in future with `<dl>` elements if requirements change)

---

### Visual standardization

**Accepted visual changes:**
- Spacing may shift slightly (±2-4px) due to standardized space-y-* classes
- Font weights and sizes locked to four variants — edge cases forced into nearest variant
- No custom overrides allowed — className prop explicitly prohibited

**Examples of acceptable drift:**
- Dashboard metric card value might shift from `text-xl` to `text-lg` (consolidated to default variant)
- Some compact pairs might gain slightly more breathing room (space-y-1 → space-y-2 if not worth custom variant)

**Evidence**: User prompt explicitly states "Accept minor visual differences as acceptable losses for consistency"

---

## 13) Deterministic Test Plan (new/changed behavior only)

### Surface: DescriptionList component (unit-level, not Playwright)

**Scenarios:**
- Given spacing prop "compact", When rendered, Then applies space-y-1 class
- Given spacing prop "default", When rendered, Then applies space-y-2 class
- Given spacing prop "relaxed", When rendered, Then applies space-y-4 class
- Given testId prop, When rendered, Then applies data-testid attribute to container

**Instrumentation / hooks**: data-testid attributes for manual testing, TypeScript for compile-time validation

**Gaps**: No dedicated unit tests for UI primitives in current codebase — Playwright E2E tests provide coverage via integration

**Evidence**: Existing UI components like Badge, Card have no unit tests — coverage comes from usage in E2E specs

---

### Surface: DescriptionItem component (unit-level, not Playwright)

**Scenarios:**
- Given variant "default", When rendered, Then label is text-sm font-medium and value is text-lg
- Given variant "prominent", When rendered, Then value is text-2xl font-bold
- Given variant "compact", When rendered, Then value is text-sm
- Given variant "muted", When rendered, Then value is text-sm text-muted-foreground
- Given icon prop, When rendered, Then icon appears before label
- Given children prop, When rendered, Then children override value prop
- Given value as ReactNode, When rendered, Then renders custom element in value slot
- Given testId, labelTestId, valueTestId props, When rendered, Then applies respective data-testid attributes

**Instrumentation / hooks**: data-testid attributes, manual visual inspection

**Gaps**: No unit tests — rely on TypeScript and Playwright integration tests

**Evidence**: Same pattern as other UI primitives — no dedicated unit test files

---

### Surface: Part Details refactor (`/parts/:partId`)

**Scenarios:**
- Given existing Playwright spec `part-crud.spec.ts`, When refactor complete, Then all existing assertions pass unchanged
- Given part detail page, When user navigates to detail view, Then sees all label-value pairs rendered correctly
- Given part with manufacturer info, When rendered, Then "Manufacturer" label and value visible
- Given part with technical specs, When rendered, Then specs section displays all fields

**Instrumentation / hooks**:
- `data-testid="parts.detail"` (root container)
- `data-testid="parts.detail.information"` (information card)
- `useListLoadingInstrumentation` for loading states (unchanged)

**Gaps**: No new test coverage required — existing specs validate content visibility

**Evidence**: `tests/e2e/parts/part-crud.spec.ts` lines 17-18, 45-46 assert on text content presence — refactor preserves this

---

### Surface: Box Details refactor (`/boxes/:boxNo`)

**Scenarios:**
- Given existing Playwright spec `boxes-detail.spec.ts`, When refactor complete, Then all existing assertions pass unchanged
- Given box detail page, When user views box, Then sees box number, description, capacity, usage displayed
- Given high usage box (≥90%), When rendered, Then usage badge shows danger color (handled by KeyValueBadge, not DescriptionList)

**Instrumentation / hooks**:
- `data-testid="boxes.detail.summary"` (summary card)
- `useListLoadingInstrumentation` for loading states (unchanged)

**Gaps**: No new test coverage required

**Evidence**: `tests/e2e/boxes/boxes-detail.spec.ts` lines 41-44 assert on summary content — refactor preserves text content

---

### Surface: Dashboard components refactor

**Scenarios:**
- Given existing dashboard specs, When refactor complete, Then metrics display correctly
- Given storage utilization grid, When rendered, Then box cards show label-value pairs (Note: storage grid has custom card layout, may not use DescriptionList)
- Given metrics cards, When rendered, Then title and value visible

**Instrumentation / hooks**:
- Various dashboard-specific testIds (`dashboard.metrics.*`, `dashboard.storage.*`)
- `useDashboardMetrics`, `useDashboardStorage` hooks emit loading events

**Gaps**: Some dashboard components may not be good candidates for DescriptionList (e.g., metrics cards have specialized layout with icons) — refactor only where pattern matches

**Evidence**: Dashboard specs in `tests/e2e/dashboard/` assert on text content and visibility — preserve these

---

### Instrumentation Requirements

**No new instrumentation needed:**
- DescriptionList/DescriptionItem are presentation components, not workflow components
- Parent components already emit test events via `useListLoadingInstrumentation`, `useFormInstrumentation`
- `data-testid` props sufficient for Playwright selectors

**Evidence**: `docs/contribute/testing/playwright_developer_guide.md` lines 22-48 confirms page objects use testIds for interaction, test events for workflow assertions

---

## 14) Implementation Slices

### Slice 1: Core Component Implementation

**Goal**: Ship DescriptionList and DescriptionItem components with full variant system and test coverage validation

**Touches**:
- `src/components/ui/description-list.tsx` (create)
- `src/components/ui/index.ts` (add exports)
- `src/components/ui/description-list.stories.tsx` (optional, if Storybook exists — not found in research)

**Dependencies**: None — pure component with no external dependencies beyond React and Tailwind

---

### Slice 2: High-Impact Refactors (Part & Box Details)

**Goal**: Refactor the two highest-concentration usages to validate component API and flush out edge cases

**Touches**:
- `src/components/parts/part-details.tsx` (18+ usages → DescriptionItem)
- `src/components/boxes/box-details.tsx` (4 usages → DescriptionItem)

**Verification**:
- Run `pnpm check` to verify TypeScript compiles with no errors
- Run `pnpm playwright test tests/e2e/parts/ tests/e2e/boxes/` to validate affected specs pass
- If test failures occur, debug and fix before proceeding to Slice 3
- Manual spot-check: Navigate to `/parts/:partId` and `/boxes/:boxNo` to verify visual rendering

**Dependencies**: Slice 1 must be complete

---

### Slice 3: Dashboard Components Refactor

**Goal**: Refactor dashboard widgets where pattern matches cleanly (skip metrics cards if layout too specialized)

**Touches**:
- `src/components/dashboard/category-distribution.tsx`
- `src/components/dashboard/low-stock-alerts.tsx`
- `src/components/dashboard/recent-activity-timeline.tsx`
- `src/components/dashboard/documentation-status.tsx`
- `src/components/dashboard/inventory-health-score.tsx`
- `src/components/dashboard/storage-utilization-grid.tsx` (evaluate — may skip if card layout incompatible)

**Note**: Evaluate each dashboard component individually before refactoring. Use Exclusion Criteria from Section 1 to determine if DescriptionList is appropriate. If refactor requires heavy use of `children` prop or custom spacing, skip component.

**Verification**:
- Run `pnpm check` to verify TypeScript compiles with no errors
- Run `pnpm playwright test tests/e2e/dashboard/` to validate affected specs pass
- Manual visual review of dashboard at `/` to verify no layout breakage
- If test failures or visual regressions occur, debug and fix before proceeding to Slice 4

**Dependencies**: Slice 2 complete, API validated in production contexts

---

### Slice 4: Remaining Component Refactors

**Goal**: Complete technical debt elimination by refactoring all remaining usages

**Touches**:
- `src/components/types/type-card.tsx`
- `src/components/boxes/box-card.tsx`
- `src/components/pick-lists/pick-list-lines.tsx`
- `src/components/shopping-lists/ready/ready-line-row.tsx`
- `src/components/shopping-lists/ready/update-stock-dialog.tsx`
- `src/components/shopping-lists/concept-line-row.tsx`
- `src/components/kits/kit-bom-table.tsx`
- `src/components/kits/kit-pick-list-panel.tsx`
- `src/components/parts/part-form.tsx`
- `src/components/documents/document-tile.tsx`
- `src/components/boxes/location-item.tsx`
- `src/components/parts/ai-part-progress-step.tsx`
- Any other files identified during implementation

**Verification**:
- Run `pnpm check` after refactoring each file to catch TypeScript errors incrementally
- Run affected Playwright specs as you go (e.g., `pnpm playwright test tests/e2e/shopping-lists/` after refactoring shopping list components)
- Track refactored file count to monitor progress toward 30+ target
- If any component requires excessive use of `children` prop or doesn't fit cleanly, refer to Exclusion Criteria and consider leaving as-is

**Dependencies**: Slices 1-3 complete

---

### Slice 5: Verification & Documentation

**Goal**: Final smoke tests, run full Playwright suite, document component API

**Verification** (follow `docs/contribute/testing/ci_and_execution.md#local-run-expectations` before delivering):
- Run `pnpm check` — must pass with zero TypeScript errors
- Run `pnpm playwright test` — full suite must be green
- Every touched Playwright spec must be re-run and green
- Manual smoke test: Navigate through affected pages (parts detail, box detail, dashboard) to verify rendering

**Documentation**:
- Update `docs/contribute/ui/data_display.md` to document DescriptionList usage pattern and examples
- Add JSDoc comments to component file with usage examples
- Verify all planning documents are complete in `docs/features/description_list_component/` (plan.md, plan_review.md, code_review.md, plan_execution_report.md)

**Slice Complete Checklist**:
- [ ] TypeScript compiles with no errors (`pnpm check` passes)
- [ ] Full Playwright suite passes (`pnpm playwright test` green)
- [ ] No console errors when manually testing affected pages
- [ ] Documentation updated in `docs/contribute/ui/`
- [ ] All planning documents present in feature directory

**Dependencies**: Slices 1-4 complete

---

## 15) Risks & Open Questions

### Risk: Playwright specs break due to selector changes

**Impact**: CI failures, test maintenance burden

**Mitigation**:
- Preserve existing testIds when refactoring (map to `testId` props)
- Verify critical specs after each slice (slices 2-4 include spec validation)
- Most specs assert on text content (`.toContainText()`), not structure — should be resilient

---

### Risk: Visual regressions in dashboard components

**Impact**: Dashboard metrics/cards look broken or misaligned

**Mitigation**:
- Slice 3 specifically targets dashboard — evaluate each component individually
- Skip metrics cards if layout incompatible (specialized component, not a good fit for DescriptionList)
- Accept minor spacing differences per requirements
- Manual visual review of dashboard before merging slice 3

---

### Risk: Refactor scope creep (30+ files identified)

**Impact**: Implementation drags on, merge conflicts accumulate

**Mitigation**:
- Strict slice boundaries — merge each slice independently
- Prioritize high-value targets (part-details, box-details) in slice 2
- Defer edge cases and marginal usages to slice 4
- TypeScript compiler will catch incomplete migrations (no runtime failures)

---

### Risk: Custom value rendering doesn't cover all cases

**Impact**: Some usages can't migrate cleanly (e.g., interactive controls in value slot)

**Mitigation**:
- `children` prop provides full escape hatch for complex rendering
- Document in JSDoc that `children` overrides `value` — composition pattern
- If specific pattern emerges (e.g., "value with tooltip"), consider specialized variant or separate component
- Worst case: leave incompatible usages as-is (inline divs) with TODO comment

---

### Risk: Breaking changes in domain wrappers

**Impact**: Unknown domain-specific wrappers with className props break

**Mitigation**:
- Search for wrapper components that accept className before starting
- TypeScript will surface breaking changes at compile time
- User prompt explicitly requests breaking changes — this is intentional

---

### Open Question: Should we use semantic `<dl>`, `<dt>`, `<dd>` elements?

**Why it matters**: Semantic HTML improves accessibility and screen reader support

**Owner / follow-up**: Implementation decision in slice 1. Current lean: avoid `<dl>` because some usages don't strictly follow definition list semantics (e.g., layout-only groupings). Can revisit if accessibility audit demands it.

---

### Open Question: Do dashboard metrics cards actually need DescriptionList?

**Why it matters**: Metrics cards have specialized layout with icons, trends, and custom styling — might not benefit from this component

**Owner / follow-up**: Evaluate during slice 3. If refactor feels forced or requires heavy use of `children` prop escape hatch, skip those components. Metrics cards might deserve their own specialized component.

---

### ~~Open Question~~ RESOLVED: Should we add a "label-only" mode for section headers?

**Resolution**: NO — Section headers serve a different semantic purpose than label-value pairs and should NOT be forced into DescriptionItem component.

**Strategy**: Keep section headers as plain `<div>` elements OUTSIDE DescriptionList components. Refactor only the label-value pairs within each section.

**Rationale**: Section headers use different styling (`text-xs font-medium text-muted-foreground` vs `text-sm font-medium` for labels) and serve organizational purposes (content grouping) distinct from data presentation (label-value pairs). Forcing them into DescriptionItem would create API complexity and semantic confusion.

**Example refactor pattern**:
```tsx
{/* Section header - kept as-is */}
<div className="mb-2 text-xs font-medium text-muted-foreground">
  Manufacturer Information
</div>

{/* Label-value pairs - refactored to DescriptionList */}
<DescriptionList spacing="default">
  <DescriptionItem label="Manufacturer" value={displayManufacturer} />
  <DescriptionItem label="Product Page" value={<ExternalLink href={url}>{url}</ExternalLink>} />
</DescriptionList>
```

**Evidence**: `part-details.tsx` lines 495-496, 525-526, 600, 608-609, 655-656 show section headers with class `text-xs font-medium text-muted-foreground` — different pattern from label-value pairs. Pattern occurs 6+ times in `part-details.tsx` alone.

---

## 16) Confidence

**Confidence: High** — Pattern is well-understood with clear boundaries. Component API maps cleanly to existing usages. Refactoring is mechanical with TypeScript as safety net. No architectural unknowns, no backend dependencies, no async coordination. Risk is limited to visual regressions (acceptable) and test maintenance (mitigated by preserving testIds). Slice-based approach allows incremental validation.

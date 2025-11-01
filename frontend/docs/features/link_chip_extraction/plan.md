# Link Chip Component Extraction — Technical Plan

## 0) Research Log & Findings

**Discovery Areas Searched:**
- Located two nearly identical link chip implementations with ~95% code duplication:
  - `src/components/kits/kit-link-chip.tsx` (lines 67-124)
  - `src/components/shopping-lists/shopping-list-link-chip.tsx` (lines 87-144)
- Identified all usage sites via grep:
  - `KitLinkChip`: 3 files (part-details.tsx, detail-header-slots.tsx, kit-link-chip.tsx itself)
  - `ShoppingListLinkChip`: 3 files (part-details.tsx, kit-detail-header.tsx, shopping-list-link-chip.tsx itself)
- Examined UI component patterns in `src/components/ui/` to understand the project's component conventions
- Reviewed `StatusBadge` (src/components/ui/status-badge.tsx) as a reference for presentational component design
- Examined Playwright test coverage to identify affected test selectors

**Key Findings:**
- Both components implement identical core pattern:
  - Rounded pill container with border and hover effects
  - Internal TanStack Router Link with icon, label, and StatusBadge
  - Optional unlink button that appears on hover/focus
  - Complex accessibility with aria-labels and titles
  - Conditional padding that expands to accommodate unlink button
- The only substantive differences are domain-specific:
  - Default icons (CircuitBoard vs ShoppingCart)
  - Route destinations and search params
  - Status badge mapping functions
  - Test ID prefixes
- Components do NOT accept className props currently (good — aligns with StatusBadge pattern)
- Playwright tests use these components extensively via testId patterns:
  - `parts.detail.kit.badge`, `parts.detail.shopping-list.badge`
  - `kits.detail.links.shopping.{listId}`, `shopping-lists.concept.body.kits.{kitId}`

**Conflicts Resolved:**
- **Visual standardization**: Minor differences in search param defaults will be eliminated. This is acceptable technical debt cleanup — consistency outweighs preserving quirks.
- **Breaking changes**: Domain wrappers will REMOVE className props entirely (not deprecate) since none are currently used in the codebase.
- **Test coverage**: All affected Playwright specs will be updated in the same implementation slice.

---

## 1) Intent & Scope

**User intent**

Extract the duplicated link chip pattern (rounded pill with icon, label, status badge, and optional unlink button) into a reusable `LinkChip` UI component in `src/components/ui/`. Replace both `KitLinkChip` and `ShoppingListLinkChip` with thin domain-specific wrappers that map domain types to the shared component's props.

**Prompt quotes**

"two nearly identical components with ~95% code duplication"

"rounded pill-shaped chips with: Icons, labels, and status badges; Internal Link navigation; Optional unlink button that appears on hover/focus; Complex accessibility patterns; Conditional padding for unlink button visibility"

"Plan to REMOVE className props from domain-specific wrappers completely (not deprecate, REMOVE)"

"Since this is technical debt work, resolve all questions autonomously. Accept minor visual differences as acceptable losses for consistency. Make breaking changes—do not attempt backward compatibility."

**In scope**

- Create new `src/components/ui/link-chip.tsx` component with full pattern encapsulation
- Refactor `KitLinkChip` to thin wrapper mapping `KitStatus` to LinkChip props
- Refactor `ShoppingListLinkChip` to thin wrapper mapping `ShoppingListStatus` to LinkChip props
- Update all usage sites to use refactored wrappers (no API changes at call sites)
- Update Playwright tests to reflect any testId structure changes
- Remove all className props from domain wrappers (breaking change, no compatibility layer)
- Standardize visual behavior (padding, hover states, accessibility patterns)

**Out of scope**

- Changing the overall design or visual appearance of link chips
- Adding new features or variants beyond what currently exists
- Backward compatibility for className prop (this is intentional technical debt cleanup)
- Tooltip component migration (use existing title attribute pattern)
- Extracting status badge mapping functions to separate utilities (keep inline in wrappers for clarity)

**Assumptions / constraints**

- The codebase follows React 19 + TypeScript conventions with TanStack Router
- UI components in `src/components/ui/` do not accept className props (enforced convention per StatusBadge pattern)
- Playwright tests rely on `data-testid` attributes and can be updated atomically with implementation
- The existing accessibility patterns (aria-labels, title attributes, keyboard navigation) must be preserved exactly
- Test instrumentation is not required for this purely presentational component
- All usage sites can be refactored in a single implementation slice (no gradual migration needed)

---

## 2) Affected Areas & File Map

**New Files**

- Area: `src/components/ui/link-chip.tsx`
- Why: New shared component encapsulating the link chip pattern
- Evidence: N/A (new file)

**Modified Components**

- Area: `src/components/kits/kit-link-chip.tsx`
- Why: Refactor to thin wrapper that maps KitStatus to LinkChip props; remove lines 67-124 duplication
- Evidence: src/components/kits/kit-link-chip.tsx:67-124 (entire component implementation is duplicated logic)

- Area: `src/components/shopping-lists/shopping-list-link-chip.tsx`
- Why: Refactor to thin wrapper that maps ShoppingListStatus to LinkChip props; remove lines 87-144 duplication
- Evidence: src/components/shopping-lists/shopping-list-link-chip.tsx:87-144 (entire component implementation is duplicated logic)

- Area: `src/components/ui/index.ts`
- Why: Add LinkChip export so other UI components can import it
- Evidence: src/components/ui/index.ts:1-8 (existing barrel export pattern for UI components)

**Usage Sites (no API changes, but reviewed for correctness)**

- Area: `src/components/parts/part-details.tsx`
- Why: Uses both KitLinkChip (lines 395-413) and ShoppingListLinkChip (lines 384-392); verify refactored wrappers maintain compatibility
- Evidence: src/components/parts/part-details.tsx:384-413

- Area: `src/components/shopping-lists/detail-header-slots.tsx`
- Why: Uses KitLinkChip with custom icon override (lines 262-278); verify icon prop still works
- Evidence: src/components/shopping-lists/detail-header-slots.tsx:262-278

- Area: `src/components/kits/kit-detail-header.tsx`
- Why: Uses ShoppingListLinkChip with unlink handlers (lines 235-243); verify unlink props still work
- Evidence: src/components/kits/kit-detail-header.tsx:235-243

**Test Files**

- Area: `tests/e2e/shopping-lists/shopping-lists-detail.spec.ts`
- Why: Contains assertions on `shopping-lists.concept.body.kits.{kitId}` testIds; verify structure preserved
- Evidence: tests/e2e/shopping-lists/shopping-lists-detail.spec.ts:52-59 (kitChip locator usage)

- Area: `tests/e2e/shopping-lists/parts-entrypoints.spec.ts`
- Why: Uses `parts.detail.shopping-list.badge` and `parts.detail.kit.badge` testIds
- Evidence: Identified via grep search for parts.detail.kit.badge and parts.detail.shopping-list.badge

- Area: `tests/support/page-objects/parts-page.ts`
- Why: May contain locator helpers for kit/shopping list badges on part details
- Evidence: Identified via grep search

- Area: `tests/support/page-objects/shopping-lists-page.ts`
- Why: Contains kitChip locator helper
- Evidence: Identified via grep search

- Area: `tests/support/page-objects/kits-page.ts`
- Why: May contain locator helpers for shopping list link chips
- Evidence: Identified via grep search

---

## 3) Data Model / Contracts

**No API Contract Changes**

This refactoring is purely internal to the frontend. The components consume the same props before and after, and all backend API contracts remain unchanged.

**Component Props Interface**

- Entity / contract: `LinkChipProps` (new shared component interface)
- Shape:
  ```typescript
  interface LinkChipProps {
    // Navigation
    to: string;                          // TanStack Router path
    params: Record<string, string>;      // Route params
    search?: Record<string, unknown>;    // Optional search state

    // Content
    label: string;                       // Chip label text
    icon?: ReactNode;                    // Optional icon (defaults to none)
    statusBadgeColor: 'active' | 'inactive';
    statusBadgeLabel: string;

    // Accessibility
    accessibilityLabel: string;          // aria-label and title

    // Test IDs
    testId?: string;                     // Main link testId
    wrapperTestId?: string;              // Container testId
    iconTestId?: string;                 // Icon testId
    badgeTestId?: string;                // Status badge testId

    // Unlink behavior
    onUnlink?: () => void;               // Optional unlink callback
    unlinkDisabled?: boolean;
    unlinkLoading?: boolean;
    unlinkTestId?: string;
    unlinkTooltip?: string;
    unlinkLabel?: string;                // aria-label for unlink button
  }
  ```
- Mapping: Domain wrappers (KitLinkChip, ShoppingListLinkChip) will map their domain-specific props to this interface. Example:
  - KitLinkChip receives `{ kitId: number, name: string, status: KitStatus, ... }`
  - Maps to `{ to: '/kits/$kitId', params: { kitId: String(kitId) }, statusBadgeColor: mapKitStatus(status), ... }`
- Evidence: src/components/kits/kit-link-chip.tsx:10-26 (existing KitLinkChipProps), src/components/shopping-lists/shopping-list-link-chip.tsx:27-45 (existing ShoppingListLinkChipProps)

**className Prop Policy (Explicit Exclusion)**

- Entity / contract: LinkChip component API
- Decision: LinkChip does NOT accept className prop, following StatusBadge pattern and UI workflow Principle #1
- Rationale: All styling is encapsulated in the base component. Domain wrappers have no legitimate need for className overrides. Existing className props in KitLinkChip/ShoppingListLinkChip are unused technical debt (verified via grep at line 444).
- Evidence: docs/ui_component_workflow.md:9 (Principle #1), src/components/ui/status-badge.tsx:36 (StatusBadge precedent)

**Domain Wrapper Interfaces (unchanged externally)**

- Entity / contract: `KitLinkChipProps` (existing interface, internal implementation changes only)
- Shape: Remains identical to current implementation (lines 10-26 in kit-link-chip.tsx)
- Mapping: Will delegate to LinkChip after transforming KitStatus → badge props
- Evidence: src/components/kits/kit-link-chip.tsx:10-26

- Entity / contract: `ShoppingListLinkChipProps` (existing interface, internal implementation changes only)
- Shape: Remains identical to current implementation (lines 27-45 in shopping-list-link-chip.tsx), but removes className prop (breaking change)
- Mapping: Will delegate to LinkChip after transforming ShoppingListStatus → badge props
- Evidence: src/components/shopping-lists/shopping-list-link-chip.tsx:27-45

---

## 4) API / Integration Surface

**No Backend API Changes**

This refactoring is purely presentational and does not touch any backend endpoints, TanStack Query hooks, or generated API clients.

**TanStack Router Integration**

- Surface: `<Link />` component from `@tanstack/react-router`
- Inputs: `to`, `params`, `search` props passed through from LinkChip
- Outputs: Client-side navigation to kit or shopping list detail routes
- Errors: N/A (Link handles routing errors via router error boundaries)
- Evidence: src/components/kits/kit-link-chip.tsx:77-86 (existing Link usage), src/components/shopping-lists/shopping-list-link-chip.tsx:97-105 (existing Link usage)

---

## 5) Algorithms & UI Flows

**LinkChip Render Flow**

- Flow: User interaction with link chip
- Steps:
  1. Component receives props and constructs accessibilityLabel from label and statusBadgeLabel
  2. Determines wrapperTestId from testId if provided (${testId}.wrapper pattern)
  3. Renders outer `<div>` container with:
     - Rounded-full border styling
     - Group class for hover coordination
     - Conditional padding: if onUnlink provided, add `hover:pr-9 focus-within:pr-9 [@media(pointer:coarse)]:pr-9`
     - Accessibility: aria-label and title set to accessibilityLabel
  4. Renders TanStack Router `<Link>` with:
     - `to`, `params`, `search` for navigation
     - Flex layout for icon + label + badge
     - `onClick={(e) => e.stopPropagation()}` to prevent bubbling to wrapper
     - Accessibility: aria-label and title set to accessibilityLabel
  5. If icon provided, renders it with `flex-shrink-0` and transition classes
  6. Renders label as truncated span
  7. Renders StatusBadge with provided color and label
  8. If onUnlink provided, renders absolutely positioned Button with:
     - Unlink icon, ghost variant, small size
     - `handleUnlinkClick` that calls `event.preventDefault()`, `event.stopPropagation()`, then `onUnlink?.()`
     - Opacity transition: `opacity-0` → `group-hover:opacity-100` (with touch/focus fallbacks)
     - Loading and disabled states from props
- States / transitions:
  - Default: unlink button invisible (opacity-0)
  - Hover/focus: unlink button visible (opacity-100), border color changes to primary
  - Touch devices: unlink button always visible (@media(pointer:coarse))
  - Disabled: unlink button grayed out and not clickable
  - Loading: unlink button shows spinner
- Hotspots:
  - Event handling: Must prevent propagation on both Link click and unlink button click to avoid conflicts
  - Accessibility: Multiple overlapping aria-labels and titles (container, link, button) must not conflict
  - Responsive padding: Container must expand to accommodate unlink button only on hover/focus (not always)
- Evidence: src/components/kits/kit-link-chip.tsx:67-124, src/components/shopping-lists/shopping-list-link-chip.tsx:87-144

**Status Badge Mapping (Domain Wrappers)**

- Flow: Map domain status enum to badge color and label
- Steps:
  1. Domain wrapper (KitLinkChip or ShoppingListLinkChip) receives status prop
  2. Calls local mapping function (e.g., getKitStatusBadgeProps)
  3. Returns `{ color: 'active' | 'inactive', label: string }`
  4. Passes to LinkChip as statusBadgeColor and statusBadgeLabel
- States / transitions: N/A (pure function)
- Hotspots: None (simple switch statement)
- Evidence: src/components/kits/kit-link-chip.tsx:29-36, src/components/shopping-lists/shopping-list-link-chip.tsx:16-25

**Routing Resolution (ShoppingListLinkChip Wrapper)**

- Flow: Convert listId convenience prop to explicit to/params for LinkChip
- Steps:
  1. Wrapper receives either (listId + optional to/params overrides) OR (explicit to/params)
  2. If listId provided, construct `to = '/shopping-lists/$listId'` and `params = { listId: String(listId) }`
  3. If explicit to/params provided, use them as-is
  4. Throw error if neither listId nor params provided (validation preserved from existing implementation)
  5. Pass resolved to/params to LinkChip
- States / transitions: N/A (pure function)
- Hotspots: Runtime validation ensures call sites provide sufficient routing info
- Evidence: src/components/shopping-lists/shopping-list-link-chip.tsx:66-73 (existing logic to preserve)

**Default Search Handling (ShoppingListLinkChip Wrapper)**

- Flow: Apply default search parameter when not explicitly provided
- Steps:
  1. Wrapper receives optional search prop
  2. If search is undefined, apply `DEFAULT_SHOPPING_LIST_SEARCH = { sort: 'description' }`
  3. If search is provided, use it as-is
  4. Pass resolved search to LinkChip
- States / transitions: N/A (pure function)
- Hotspots: Both current usage sites (part-details.tsx:385-392, kit-detail-header.tsx:235-243) rely on this default; wrapper must preserve it for backward compatibility
- Evidence: src/components/shopping-lists/shopping-list-link-chip.tsx:10-13,68-69 (existing default constant), src/components/parts/part-details.tsx:385-392, src/components/kits/kit-detail-header.tsx:235-243 (usage sites that don't pass search prop)

---

## 6) Derived State & Invariants

**accessibilityLabel Derivation**

- Derived value: accessibilityLabel
  - Source: Constructed from `label` and `statusBadgeLabel` props: `${label} (${statusBadgeLabel})`
  - Writes / cleanup: Used as aria-label and title on both container and Link; no cleanup needed
  - Guards: None (always constructed from provided strings)
  - Invariant: accessibilityLabel must be consistent across container, link, and title attributes for screen readers
  - Evidence: src/components/kits/kit-link-chip.tsx:56, src/components/shopping-lists/shopping-list-link-chip.tsx:76

**wrapperTestId Derivation**

- Derived value: wrapperTestId
  - Source: Constructed from testId prop if present: `testId ? ${testId}.wrapper : undefined`
  - Writes / cleanup: Applied to container div data-testid; no cleanup needed
  - Guards: Only set if testId provided
  - Invariant: Wrapper testId must follow `.wrapper` suffix convention for Playwright selectors
  - Evidence: src/components/kits/kit-link-chip.tsx:58, src/components/shopping-lists/shopping-list-link-chip.tsx:84

**Conditional Padding Derivation**

- Derived value: Container padding classes
  - Source: Computed from `onUnlink` presence: `onUnlink && 'hover:pr-9 focus-within:pr-9 [@media(pointer:coarse)]:pr-9'`
  - Writes / cleanup: Applied via cn() utility to container className; no cleanup needed
  - Guards: Only add padding classes if onUnlink provided
  - Invariant: Padding must expand on hover/focus to make room for unlink button, but NOT expand when onUnlink is undefined (visual glitch)
  - Evidence: src/components/kits/kit-link-chip.tsx:70, src/components/shopping-lists/shopping-list-link-chip.tsx:90

---

## 7) State Consistency & Async Coordination

**No Async State or Query Coordination**

LinkChip is a pure presentational component. It does not manage TanStack Query state, emit instrumentation events, or coordinate with React contexts.

- Source of truth: Props passed from parent
- Coordination: N/A (stateless component)
- Async safeguards: N/A (no async operations)
- Instrumentation: None (no test-mode events; components are tested via UI assertions only)
- Evidence: src/components/kits/kit-link-chip.tsx:38-125 (no useState, useEffect, or query hooks)

**Click Event Propagation**

- Source of truth: Event handlers on Link and unlink Button
- Coordination: Both handlers call `event.stopPropagation()` to prevent outer container clicks
- Async safeguards: `handleUnlinkClick` must call `event.preventDefault()` before invoking `onUnlink?.()` to prevent Link navigation
- Instrumentation: None
- Evidence: src/components/kits/kit-link-chip.tsx:60-64 (handleUnlinkClick), line 85 (Link onClick)

---

## 8) Errors & Edge Cases

**Missing Required Props**

- Failure: Component receives invalid or missing props (e.g., empty label, invalid route)
- Surface: LinkChip render throws or displays broken UI
- Handling: TypeScript strict mode enforces required props at compile time; no runtime validation needed
- Guardrails: Domain wrappers ensure proper prop construction (e.g., kitId always converted to string for params)
- Evidence: N/A (TypeScript enforcement)

**Unlink Callback Throws**

- Failure: onUnlink callback throws an error during execution
- Surface: Error propagates to nearest error boundary
- Handling: No try/catch in handleUnlinkClick; parent components are responsible for error handling in their callbacks
- Guardrails: Calling components use mutation hooks that handle errors via global toast system
- Evidence: src/components/kits/kit-detail-header.tsx:224-232 (unlink handler wraps mutation that handles errors)

**Accessibility Labels Too Long**

- Failure: Very long kit/list names create excessively long aria-labels
- Surface: Screen readers read long labels, but UI remains functional
- Handling: Accept this as expected behavior; truncation happens in visual label only, not accessibility label
- Guardrails: None needed (accessibility best practice is full label, not truncated)
- Evidence: src/components/kits/kit-link-chip.tsx:95 (visual label has `truncate` class, but aria-label is full name)

**Route Navigation Failure**

- Failure: TanStack Router Link navigation fails (e.g., invalid kitId)
- Surface: Router error boundary catches navigation error
- Handling: Router handles via global error boundary; LinkChip does not need local error handling
- Guardrails: Domain wrappers ensure params are valid (e.g., kitId is always a number converted to string)
- Evidence: N/A (router-level concern)

---

## 9) Observability / Instrumentation

**No Test-Mode Instrumentation**

LinkChip is a pure presentational component and does not emit test events. Playwright tests assert on the component's rendered output using data-testid attributes.

- Signal: N/A (no events emitted)
- Type: N/A
- Trigger: N/A
- Labels / fields: N/A
- Consumer: Playwright tests use `data-testid` attributes to locate and assert on link chips
- Evidence: tests/e2e/shopping-lists/shopping-lists-detail.spec.ts:52-59 (kitChip locator via testId)

**Test ID Attributes**

- Signal: `data-testid` attributes on container, link, icon, badge, and unlink button
- Type: Static attributes for Playwright selectors
- Trigger: Rendered on component mount if testId props provided
- Labels / fields:
  - Container: `${testId}.wrapper`
  - Link: `${testId}`
  - Icon: `${iconTestId}` (if provided)
  - Badge: `${badgeTestId}` (if provided)
  - Unlink button: `${unlinkTestId}` (if provided and onUnlink present)
- Consumer: Playwright tests use these IDs to locate elements and assert behavior
- Evidence: src/components/kits/kit-link-chip.tsx:73,82,92,100,116 (testId usage)

---

## 10) Lifecycle & Background Work

**No Lifecycle Hooks**

LinkChip is a pure presentational component without side effects.

- Hook / effect: N/A (no useEffect, timers, or subscriptions)
- Trigger cadence: N/A
- Responsibilities: N/A
- Cleanup: N/A
- Evidence: src/components/kits/kit-link-chip.tsx:38-125 (no lifecycle hooks present)

---

## 11) Security & Permissions

**Not Applicable**

LinkChip is a presentational navigation component. It does not enforce permissions, handle authentication, or expose sensitive data. Parent components are responsible for conditionally rendering link chips based on user permissions.

---

## 12) UX / UI Impact

**Visual Standardization**

- Entry point: All locations where KitLinkChip or ShoppingListLinkChip are rendered
- Change: Minor visual differences eliminated:
  - ShoppingListLinkChip currently has `DEFAULT_SHOPPING_LIST_SEARCH` constant; this will be moved to call sites for consistency
  - Both components will use identical hover/focus padding behavior
  - Unlink button opacity transitions will be identical
- User interaction: No user-facing changes; chips look and behave the same
- Dependencies: TanStack Router Link, StatusBadge, Button components
- Evidence: src/components/shopping-lists/shopping-list-link-chip.tsx:10-13 (default search constant will be removed)

**Accessibility Preservation**

- Entry point: All link chip instances
- Change: Accessibility patterns preserved exactly:
  - aria-label and title attributes on container and link
  - Unlink button has aria-label and title
  - Keyboard navigation support via Link and Button focus
  - Touch device support via `@media(pointer:coarse)` always-visible unlink button
- User interaction: Screen reader users and keyboard navigators experience identical behavior
- Dependencies: Existing accessibility patterns in Button and Link
- Evidence: src/components/kits/kit-link-chip.tsx:74-84,117-118 (accessibility attributes)

**Breaking Change: className Prop Removal**

- Entry point: Domain wrapper call sites (none currently use className)
- Change: REMOVE className prop from KitLinkChip and ShoppingListLinkChip interfaces
- User interaction: No impact (className was never used in codebase)
- Dependencies: None (no usage sites to update)
- Evidence: Grep search confirmed no call sites pass className prop

---

## 13) Deterministic Test Plan

**LinkChip Rendering**

- Surface: LinkChip component in isolation
- Scenarios:
  - Given LinkChip with required props, When rendered, Then container, link, icon, label, and badge are visible
  - Given LinkChip with onUnlink, When hovered, Then unlink button becomes visible
  - Given LinkChip with onUnlink, When unlink button clicked, Then onUnlink callback invoked and Link navigation prevented
  - Given LinkChip without onUnlink, When rendered, Then unlink button is not present
- Instrumentation / hooks:
  - `data-testid="${testId}.wrapper"` on container
  - `data-testid="${testId}"` on Link
  - `data-testid="${unlinkTestId}"` on unlink button (if present)
- Gaps: Unit tests not in scope for this refactoring; Playwright e2e tests cover usage in real pages
- Evidence: tests/e2e/shopping-lists/shopping-lists-detail.spec.ts:52-59 (existing kitChip test pattern)

**KitLinkChip Wrapper**

- Surface: KitLinkChip in part details and shopping list detail header
- Scenarios:
  - Given part with kit memberships, When part detail loads, Then kit link chips render with correct names and statuses
  - Given shopping list with linked kits, When list detail loads, Then kit chips render with unlink buttons
  - Given kit chip unlink button, When clicked, Then unlink mutation triggered and chip updates
- Instrumentation / hooks:
  - Existing testIds: `parts.detail.kit.badge`, `shopping-lists.concept.body.kits.{kitId}`
  - Unlink testIds: `shopping-lists.concept.body.kits.{kitId}.unlink`
- Gaps: None (existing coverage maintained)
- Evidence: tests/e2e/shopping-lists/shopping-lists-detail.spec.ts:8-60

**ShoppingListLinkChip Wrapper**

- Surface: ShoppingListLinkChip in part details and kit detail header
- Scenarios:
  - Given part with shopping list memberships, When part detail loads, Then list link chips render with correct names and statuses
  - Given kit with linked shopping lists, When kit detail loads, Then list chips render with unlink buttons
  - Given list chip unlink button, When clicked, Then unlink mutation triggered and chip updates
- Instrumentation / hooks:
  - Existing testIds: `parts.detail.shopping-list.badge`, `kits.detail.links.shopping.{listId}`
  - Unlink testIds: `kits.detail.links.shopping.unlink.{listId}`
- Gaps: None (existing coverage maintained)
- Evidence: Identified via grep; specific test file references in affected areas list

**Test ID Structure Stability**

- Surface: All Playwright specs using link chip testIds
- Scenarios:
  - Given existing specs using `parts.detail.kit.badge`, When refactoring complete, Then specs still pass without modification
  - Given existing specs using `shopping-lists.concept.body.kits.{kitId}`, When refactoring complete, Then specs still pass without modification
- Instrumentation / hooks: No changes to testId structure (wrappers maintain existing patterns)
- Gaps: None (regression protection via existing spec execution)
- Evidence: tests/e2e/shopping-lists/shopping-lists-detail.spec.ts:52-59

---

## 14) Implementation Slices

**Slice 1: Create LinkChip UI Component**

- Goal: Extract shared link chip pattern into reusable component
- Touches:
  - `src/components/ui/link-chip.tsx` (new file)
  - `src/components/ui/index.ts` (add LinkChip export)
- Dependencies: None (can be implemented independently)

**Slice 2: Refactor KitLinkChip to Use LinkChip**

- Goal: Replace KitLinkChip implementation with thin wrapper around LinkChip
- Touches:
  - `src/components/kits/kit-link-chip.tsx` (refactor implementation, keep interface)
  - All usage sites remain unchanged (API compatibility maintained)
- Dependencies: Slice 1 complete (LinkChip exists)

**Slice 3: Refactor ShoppingListLinkChip to Use LinkChip**

- Goal: Replace ShoppingListLinkChip implementation with thin wrapper around LinkChip
- Touches:
  - `src/components/shopping-lists/shopping-list-link-chip.tsx` (refactor implementation, remove className prop)
  - All usage sites remain unchanged (API compatibility maintained except className removal, which is unused)
- Dependencies: Slice 1 complete (LinkChip exists)

**Slice 4: Verify Playwright Test Coverage**

- Goal: Run all affected Playwright specs to ensure no regressions
- Touches:
  - Execute `pnpm playwright test tests/e2e/shopping-lists/shopping-lists-detail.spec.ts`
  - Execute `pnpm playwright test tests/e2e/shopping-lists/parts-entrypoints.spec.ts`
  - Execute `pnpm playwright test` (full suite)
- Dependencies: Slices 1, 2, 3 complete (all refactoring done)

**Note**: This work will be implemented as a single atomic change. Slices listed for clarity only; no incremental deployment.

---

## 15) Risks & Open Questions

**Risk: TestID Structure Assumptions**

- Risk: Playwright tests may rely on undocumented testId structure (e.g., `.wrapper` suffix)
- Impact: Tests fail after refactoring if structure changes
- Mitigation: Preserve exact testId structure from existing implementations (${testId}.wrapper pattern, etc.). Run full Playwright suite before declaring work complete.

**Risk: Accessibility Attribute Conflicts**

- Risk: Multiple overlapping aria-labels (container, link, unlink button) could confuse screen readers
- Impact: Degraded screen reader experience
- Mitigation: Preserve exact accessibility patterns from existing implementations. If conflicts arise during testing, prioritize Link aria-label and remove container aria-label (least critical).

**Risk: Event Propagation Edge Cases**

- Risk: stopPropagation on Link and unlink button may break parent component event handlers
- Impact: Parent components expecting click events on container may break
- Mitigation: Existing implementations already use stopPropagation; no behavior change introduced. Verify all usage sites still function correctly.

**Risk: Visual Regressions from Padding Standardization**

- Risk: Subtle differences in hover padding behavior could cause layout shifts
- Impact: Minor visual glitches on hover
- Mitigation: Accept minor visual differences as acceptable tradeoff for consistency (per user requirement). Test manually in browser at all affected locations.

**Risk: Missing className Use Cases**

- Risk: Future developers may need className prop for domain-specific styling
- Impact: Need to re-add className prop later (requires component modification)
- Mitigation: Accept this risk. If className is needed in future, it can be added to LinkChip (not domain wrappers) with proper justification. Current codebase has zero className usage, so this is speculative.

---

## 16) Confidence

Confidence: High — The refactoring is straightforward, the pattern is well-understood, and the existing implementations are nearly identical. All usage sites have been identified, Playwright test coverage exists, and the breaking changes (className removal) have zero impact. The main risk is testId structure preservation, which is mitigated by exact pattern replication and full test suite execution.

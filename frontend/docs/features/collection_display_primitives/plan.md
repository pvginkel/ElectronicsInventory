# Collection Display Primitives — Technical Debt Elimination

## 0) Research Log & Findings

Conducted comprehensive searches across the codebase to identify all usages of three reusable UI patterns that have been duplicated across domain components:

**CodeBadge pattern:** Found 4 occurrences using `font-mono` with `bg-muted px-2 py-1 rounded` styling in parts domain components (part-card.tsx line 111, part-inline-summary.tsx lines 40 and 56, part-details.tsx line 488).

**CollectionGrid pattern:** Found 6 files using responsive grid layouts for uniform card collections. **Critical finding:** Breakpoint inconsistency detected - parts/shopping-lists/kits use `xl:grid-cols-3` (1280px) while boxes/sellers/types use `lg:grid-cols-3` (1024px). **Excluded 2 layout grids:** box-details.tsx and box-form.tsx use grids for asymmetric page layout (with `lg:col-span-2` column spans), not uniform collections.

**ListSectionHeader pattern:** Found 3 semantically coherent occurrences of the `flex justify-between border-b` header pattern in concept-table.tsx (line 62), seller-group-card.tsx (line 53), and kit-pick-list-panel.tsx (line 126). All use heading tags and represent list/table section headers. **Excluded:** update-stock-dialog.tsx (line 580) uses FormLabel, creating different HTML semantics incompatible with heading-based ListSectionHeader.

Reviewed existing UI component patterns in `src/components/ui/` including Badge, QuantityBadge, and other standardized components to understand the project's component architecture and API design conventions. The project consistently uses domain-agnostic components with props-based APIs but NO className exposure.

Searched Playwright specs to identify test coverage impacts. Found selectors for `parts.list.`, `shopping-lists.overview.`, and `kits.overview.` test IDs in page objects and specs, but the visual layout structure (grid) is not directly tested, so refactoring will not require test updates.

## 1) Intent & Scope

**User intent**

Extract three duplicated UI patterns into reusable, semantically meaningful, domain-agnostic UI components with full style encapsulation. Eliminate technical debt by centralizing styling and removing all className customization hooks from domain components.

**Prompt quotes**

"This is technical debt elimination work focused on centralizing styling and creating consistent, domain-agnostic components."

"Components do NOT expose className props - full encapsulation of styling"

"Aggressive cleanup - remove className props completely, let TypeScript catch all call sites"

"Minor visual differences (padding, spacing) are acceptable losses for consistency"

**In scope**

- Create three new UI primitives: CodeBadge, ListSectionHeader, CollectionGrid
- Identify all current usages through exhaustive codebase search (completed)
- Refactor all identified usages to use new components
- Remove className props from affected components (breaking changes)
- Update component exports in `src/components/ui/index.ts`
- Make breaking changes without backward compatibility or deprecation periods

**Out of scope**

- Playwright test updates (layout structure not tested, data-testid attributes preserved)
- Backend API changes
- New features or functionality enhancements
- Migration guides or documentation for external consumers
- Performance optimization beyond current implementation
- Support for theme customization or variant props beyond what's needed for current usages

**Assumptions / constraints**

- All domain components in src/components/ are under our control and can be refactored atomically
- TypeScript strict mode is enabled and will catch all call sites during compilation
- No external packages depend on className props in affected components
- Visual standardization is valued over preserving minor spacing/padding differences
- The codebase follows React 19 + TypeScript conventions with function components
- Tailwind CSS classes are available and documented in the project

## 2) Affected Areas & File Map

### New Components (Create)

- Area: `src/components/ui/code-badge.tsx`
- Why: New domain-agnostic component for displaying technical identifiers in monospace
- Evidence: No existing file; pattern currently duplicated in part-card.tsx:111, part-inline-summary.tsx:40,56, part-details.tsx:488

- Area: `src/components/ui/list-section-header.tsx`
- Why: New component for table/list section headers with title and actions
- Evidence: No existing file; pattern in concept-table.tsx:62-76, seller-group-card.tsx:53, kit-pick-list-panel.tsx:126

- Area: `src/components/ui/collection-grid.tsx`
- Why: New responsive grid container for card-based overview pages
- Evidence: No existing file; pattern in part-list.tsx:231,287, overview-list.tsx:356, kit-overview-list.tsx:224, box-list.tsx:194,273, seller-list.tsx:276,355, type-list.tsx:314,398

- Area: `src/components/ui/index.ts`
- Why: Export barrel file for UI components
- Evidence: Existing file at src/components/ui/index.ts:1-39; add exports for three new components

### Refactor CodeBadge Usage

- Area: `src/components/parts/part-card.tsx`
- Why: Replace inline `bg-muted px-2 py-1 rounded font-mono` div with CodeBadge
- Evidence: Line 110-113: `<div className="inline-block bg-muted px-2 py-1 rounded font-mono text-sm">{displayId}</div>`

- Area: `src/components/parts/part-inline-summary.tsx`
- Why: Replace font-mono span elements with CodeBadge wrapper
- Evidence: Lines 40, 56: `<span className="font-mono">Key {partKey}</span>`

- Area: `src/components/parts/part-details.tsx`
- Why: Wrap font-mono span in DescriptionItem with CodeBadge
- Evidence: Line 488: `value={<span className="font-mono">{displayId}</span>}`

### Refactor ListSectionHeader Usage

- Area: `src/components/shopping-lists/concept-table.tsx`
- Why: Replace header div with ListSectionHeader component
- Evidence: Lines 62-76: `<div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">` with title "Concept lines", description, and Add/Dropdown buttons

- Area: `src/components/shopping-lists/ready/seller-group-card.tsx`
- Why: Replace seller group header div with ListSectionHeader
- Evidence: Lines 53-119: `<div className="flex flex-wrap items-center justify-between gap-4 border-b px-4 py-3">` with seller name, metrics, and actions

- Area: `src/components/kits/kit-pick-list-panel.tsx`
- Why: Replace CardHeader with ListSectionHeader inside Card
- Evidence: Lines 126-150: `<CardHeader className="flex flex-col gap-3...">` with title "Pick lists", description, and "Add Pick List" button

### Refactor CollectionGrid Usage

- Area: `src/components/parts/part-list.tsx`
- Why: Replace grid div elements with CollectionGrid component
- Evidence: Lines 231, 287: `<div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">` for loading skeletons and parts list

- Area: `src/components/shopping-lists/overview-list.tsx`
- Why: Replace shopping lists grid div with CollectionGrid
- Evidence: Line 356: `<div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="shopping-lists.overview.grid.${activeTab}">`

- Area: `src/components/kits/kit-overview-list.tsx`
- Why: Replace kits grid div with CollectionGrid
- Evidence: Line 224: `<div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="kits.overview.grid.${status}">`

- Area: `src/components/boxes/box-list.tsx`
- Why: Replace boxes grid divs with CollectionGrid (breakpoint='lg')
- Evidence: Lines 194, 273: `className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"`

- Area: `src/components/sellers/seller-list.tsx`
- Why: Replace sellers grid divs with CollectionGrid (breakpoint='lg')
- Evidence: Lines 276, 355: `className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"`

- Area: `src/components/types/type-list.tsx`
- Why: Replace types grid divs with CollectionGrid (breakpoint='lg')
- Evidence: Lines 314, 398: `className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"`

## 3) Data Model / Contracts

No data model or API contract changes. This is purely a UI refactoring that moves inline styles and div structures into reusable components. The components will accept props for display data but will not change the shape of data flowing through the application.

### CodeBadge Component Interface

```typescript
export interface CodeBadgeProps {
  code: string;
  testId?: string;
}
```

- **Mapping:** No snake_case to camelCase conversion; direct pass-through of display strings
- **Evidence:** Pattern analysis from part-card.tsx:111, part-inline-summary.tsx:40,56. Variant prop removed as all usages standardize to single style (bg-muted + px-2 py-1 + rounded + font-mono).
- **testId:** Optional to support both tested and untested contexts

### ListSectionHeader Component Interface

```typescript
export interface ListSectionHeaderProps {
  title: string | React.ReactNode;
  description?: string | React.ReactNode;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  testId?: string;
}
```

- **Mapping:** No data transformation; accepts rendered React elements for actions and optional footer slots
- **Evidence:** Pattern analysis from concept-table.tsx:62-76, seller-group-card.tsx:53-119, kit-pick-list-panel.tsx:126-150
- **title:** Required; can be string or ReactNode for advanced use cases
  - When string: Component renders as `<h3 className="text-base font-semibold text-foreground">` for semantic heading with standardized styling
  - When ReactNode: Caller must provide semantic h3 tag with appropriate classes (see seller-group-card.tsx for example using text-lg)
- **description:** Optional; renders below title as muted text or custom ReactNode
  - When string: Renders as `<p className="text-xs text-muted-foreground">`
  - When ReactNode: Caller provides custom structure (e.g., ExternalLink in seller-group-card)
- **actions:** Optional slot for interactive buttons/controls on the right side
- **footer:** Optional full-width content below title/actions row (e.g., filter notes, metadata)
- **testId:** Optional as not all headers are tested

### CollectionGrid Component Interface

```typescript
export interface CollectionGridProps {
  children: React.ReactNode;
  breakpoint?: 'lg' | 'xl';
  testId?: string;
}
```

- **Mapping:** No data transformation; layout-only container component
- **Evidence:** Pattern analysis reveals lg/xl breakpoint split - parts/shopping-lists/kits use xl:grid-cols-3 (1280px), boxes/sellers/types use lg:grid-cols-3 (1024px)
- **breakpoint:** Optional, defaults to 'xl'; controls when 3-column layout activates (lg=1024px, xl=1280px)
- **Hardcoded pattern:** Always uses grid-cols-1 (mobile), md:grid-cols-2 (768px), and lg/xl:grid-cols-3 based on breakpoint prop. Gap always 4.
- **testId:** Optional to support both tested and untested grids

## 4) API / Integration Surface

No backend API or TanStack Query integration surface changes. All components are presentation-only and consume data that has already been fetched and transformed by existing hooks.

The components will not introduce new API calls, cache invalidations, or mutation logic. They are pure UI primitives that wrap HTML elements with standardized Tailwind classes.

## 5) Algorithms & UI Flows

No complex algorithms or stateful flows. All three components are stateless presentation components that render children or text content with standardized styling.

- Flow: CodeBadge render
- Steps:
  1. Accept code string and optional testId prop
  2. Apply Tailwind classes for bg-muted, px-2, py-1, rounded, font-mono, text-sm
  3. Render code string inside styled span element
  4. Apply testId if provided
- States / transitions: Stateless component, no transitions
- Hotspots: None; simple render function
- Evidence: Pattern analysis from part-card.tsx:111, part-inline-summary.tsx:40,56

- Flow: ListSectionHeader render
- Steps:
  1. Accept title, optional description, optional actions slot
  2. Render flex container with justify-between and border-b
  3. Left side: title (h2/h3) and description (p)
  4. Right side: actions slot for buttons/controls
  5. Apply responsive wrapping for mobile layouts
  6. Apply testId if provided
- States / transitions: Stateless component, no transitions
- Hotspots: Responsive layout shift from row to column on mobile
- Evidence: Pattern analysis from concept-table.tsx:62-76, seller-group-card.tsx:53

- Flow: CollectionGrid render
- Steps:
  1. Accept children and optional breakpoint prop ('lg' | 'xl', defaults to 'xl')
  2. Apply Tailwind grid classes with responsive breakpoints
  3. Always: 1 column mobile, 2 columns md (768px), 3 columns lg/xl based on breakpoint prop
  4. Apply gap-4 (hardcoded)
  5. Render children inside grid container
  6. Apply testId if provided
- States / transitions: Stateless component, no transitions
- Hotspots: Responsive breakpoint shifts at md (768px) and lg (1024px) or xl (1280px) depending on breakpoint prop
- Evidence: Pattern analysis from part-list.tsx:231,287 (xl), box-list.tsx:194,273 (lg)

## 6) Derived State & Invariants

No derived state. All components are stateless functional components that receive props and render deterministic output.

The components do not filter, sort, or transform data. They are pure presentation wrappers that apply styling to their content.

## 7) State Consistency & Async Coordination

No async coordination required. Components are synchronous, stateless, and do not interact with TanStack Query caches, React state, or instrumentation hooks.

The refactored components will preserve all existing data-testid attributes to maintain Playwright test compatibility. Instrumentation events emitted by parent components will continue to work unchanged.

- Source of truth: Props passed by parent components
- Coordination: None; components do not maintain state or coordinate with external systems
- Async safeguards: N/A; components are synchronous render functions
- Instrumentation: Preserve data-testid props; no new instrumentation events
- Evidence: Existing testId patterns in part-list.tsx:232,288, overview-list.tsx:357

## 8) Errors & Edge Cases

No runtime errors expected. Components will use TypeScript strict types to enforce correct prop usage at compile time.

Edge cases are minimal for these presentation components:

- Failure: Empty code string passed to CodeBadge
- Surface: CodeBadge component
- Handling: Render empty styled container; no error thrown
- Guardrails: TypeScript enforces string type; parent components validate data
- Evidence: Defensive render pattern standard across UI components

- Failure: Missing title prop for ListSectionHeader
- Surface: ListSectionHeader component
- Handling: TypeScript compilation error; required prop
- Guardrails: TypeScript enforces required props
- Evidence: TypeScript strict mode enabled in tsconfig.json

- Failure: No children passed to CollectionGrid
- Surface: CollectionGrid component
- Handling: Render empty grid container; valid React pattern
- Guardrails: React.ReactNode type accepts empty fragments
- Evidence: Standard React children handling

- Failure: Invalid column counts passed to CollectionGrid
- Surface: CollectionGrid component
- Handling: Provide sensible defaults; validate prop types with TypeScript
- Guardrails: TypeScript number type enforcement, default values
- Evidence: Defensive prop handling pattern in existing UI components

## 9) Observability / Instrumentation

No new instrumentation required. Components will accept optional testId props and pass them through to rendered elements to maintain Playwright test compatibility.

Existing instrumentation in parent components (useListLoadingInstrumentation, trackForm* hooks) will continue to work unchanged. The refactoring preserves data-testid attributes and DOM structure sufficiently for existing selectors to remain valid.

- Signal: data-testid attribute on CodeBadge
- Type: Test instrumentation
- Trigger: Rendered when testId prop provided
- Labels / fields: testId string from parent component
- Consumer: Playwright specs using part.list.card selectors
- Evidence: Existing pattern in part-card.tsx:49, part-inline-summary.tsx:37

- Signal: data-testid attribute on ListSectionHeader
- Type: Test instrumentation
- Trigger: Rendered when testId prop provided
- Labels / fields: testId string from parent component
- Consumer: Playwright specs using concept.table selectors
- Evidence: Existing pattern in concept-table.tsx:61

- Signal: data-testid attribute on CollectionGrid
- Type: Test instrumentation
- Trigger: Rendered when testId prop provided
- Labels / fields: testId string from parent component
- Consumer: Playwright specs using parts.list.container, shopping-lists.overview.grid selectors
- Evidence: Existing pattern in part-list.tsx:288, overview-list.tsx:357

## 10) Lifecycle & Background Work

No lifecycle hooks, effects, or background work required. All components are stateless functional components with no side effects.

Components do not attach event listeners, timers, or subscriptions. They do not perform cleanup operations on unmount.

## 11) Security & Permissions

Not applicable. Components render user-provided content without introducing new security surfaces. They do not handle authentication, authorization, or sensitive data display.

Existing XSS protections through React's automatic escaping remain in effect. Components do not use dangerouslySetInnerHTML or other unsafe patterns.

## 12) UX / UI Impact

**Visual standardization:** Minor visual differences will occur as we consolidate to single implementations. Acceptable casualties for consistency:

- CodeBadge: All instances will use `bg-muted px-2 py-1 rounded font-mono text-sm` consistently. Currently part-inline-summary uses plain `font-mono` without background. This will add background styling to inline summaries (visual improvement for consistency).

- ListSectionHeader: All 3 headers will use consistent padding (`px-4 py-3`), gap (`gap-3`), and border (`border-b`). Current variations in seller-group-card (gap-4) vs concept-table (gap-3) will be standardized to gap-3. Update-stock-dialog excluded due to FormLabel semantics.

- CollectionGrid: Preserves existing breakpoint behavior via breakpoint prop. Parts/shopping-lists/kits continue using xl (1280px), boxes/sellers/types continue using lg (1024px). No visual regression.

- Entry point: Parts overview page (/parts)
- Change: Part ID display in part-card.tsx will use CodeBadge component instead of inline div
- User interaction: No visible change; same visual appearance
- Dependencies: CodeBadge component implementation
- Evidence: part-card.tsx:110-113

- Entry point: Part inline summary component (used in shopping lists, pick lists)
- Change: Part key display will use CodeBadge with background instead of plain font-mono span
- User interaction: Part keys will have gray background (bg-muted) instead of plain text; improved visual hierarchy
- Dependencies: CodeBadge component implementation
- Evidence: part-inline-summary.tsx:40,56

- Entry point: Shopping list concept table (/shopping-lists/$listId)
- Change: "Concept lines" header will use ListSectionHeader component
- User interaction: No visible change; same visual appearance
- Dependencies: ListSectionHeader component implementation
- Evidence: concept-table.tsx:62-76

- Entry point: Shopping list ready view seller groups (/shopping-lists/$listId)
- Change: Seller group headers will use ListSectionHeader component
- User interaction: Potential minor padding/gap adjustments for consistency
- Dependencies: ListSectionHeader component implementation
- Evidence: seller-group-card.tsx:53-119

- Entry point: Parts overview, Kits overview, Shopping Lists overview, Boxes list, Sellers list, Types list
- Change: All grid layouts will use CollectionGrid component
- User interaction: No visible change; same responsive grid behavior
- Dependencies: CollectionGrid component implementation
- Evidence: part-list.tsx:231,287; overview-list.tsx:356; kit-overview-list.tsx:224; etc.

## 13) Deterministic Test Plan

**No Playwright test updates required.** The refactoring preserves data-testid attributes and DOM structure. Existing selectors will continue to work:

- Surface: Parts list grid
- Scenarios:
  - Given parts overview page loaded, When parts displayed, Then grid container has `data-testid="parts.list.container"`
  - Given loading state, When skeletons rendered, Then grid container has `data-testid="parts.list.loading"`
- Instrumentation / hooks: Existing `parts.list.container` and `parts.list.card` selectors in tests/support/page-objects/parts-page.ts
- Gaps: None; refactoring preserves existing test coverage
- Evidence: part-list.tsx:288, tests/support/page-objects/parts-page.ts

- Surface: Shopping lists overview grid
- Scenarios:
  - Given shopping lists page loaded, When lists displayed, Then grid has `data-testid="shopping-lists.overview.grid.concept"`
- Instrumentation / hooks: Existing `shopping-lists.overview.grid` selectors
- Gaps: None; refactoring preserves existing test coverage
- Evidence: overview-list.tsx:357

- Surface: Kits overview grid
- Scenarios:
  - Given kits page loaded, When kits displayed, Then grid has `data-testid="kits.overview.grid.active"`
- Instrumentation / hooks: Existing `kits.overview.grid` selectors
- Gaps: None; refactoring preserves existing test coverage
- Evidence: kit-overview-list.tsx:225

- Surface: Part card ID display
- Scenarios:
  - Given part card rendered, When ID displayed, Then CodeBadge shows monospace ID
- Instrumentation / hooks: Existing `parts.list.card` selector; visual inspection in development
- Gaps: No automated test for CodeBadge styling; acceptable for this refactoring
- Evidence: part-card.tsx:49

**Verification approach:** Run existing Playwright specs for affected pages without changes. All specs should pass without modifications. Visual regression testing optional but not required per project constraints.

## 14) Implementation Slices

Slice work by component to minimize merge conflicts and enable incremental review:

- Slice: Create CodeBadge component
- Goal: Establish domain-agnostic code display primitive
- Touches:
  - src/components/ui/code-badge.tsx (create)
  - src/components/ui/index.ts (add export)
- Dependencies: None; independent component creation

- Slice: Refactor CodeBadge usages
- Goal: Replace all inline code display patterns with CodeBadge component
- Touches:
  - src/components/parts/part-card.tsx (refactor lines 110-113)
  - src/components/parts/part-inline-summary.tsx (refactor lines 40, 56)
  - src/components/parts/part-details.tsx (refactor line 488)
- Dependencies: CodeBadge component must exist; can merge after slice 1

- Slice: Create ListSectionHeader component
- Goal: Establish domain-agnostic section header primitive
- Touches:
  - src/components/ui/list-section-header.tsx (create)
  - src/components/ui/index.ts (add export)
- Dependencies: None; independent component creation

- Slice: Refactor ListSectionHeader usages
- Goal: Replace semantically coherent inline header patterns with ListSectionHeader component
- Touches:
  - src/components/shopping-lists/concept-table.tsx (refactor lines 62-76)
  - src/components/shopping-lists/ready/seller-group-card.tsx (refactor lines 53-119)
  - src/components/kits/kit-pick-list-panel.tsx (refactor lines 126-150)
- Dependencies: ListSectionHeader component must exist; can merge after slice 3
- Note: update-stock-dialog.tsx excluded due to FormLabel usage (different HTML semantics)

- Slice: Create CollectionGrid component
- Goal: Establish domain-agnostic responsive grid primitive
- Touches:
  - src/components/ui/collection-grid.tsx (create)
  - src/components/ui/index.ts (add export)
- Dependencies: None; independent component creation

- Slice: Refactor CollectionGrid usages (parts, shopping lists, kits)
- Goal: Replace grid patterns in primary overview pages (xl breakpoint)
- Touches:
  - src/components/parts/part-list.tsx (refactor lines 231, 287; omit breakpoint prop for xl default)
  - src/components/shopping-lists/overview-list.tsx (refactor line 356; omit breakpoint prop for xl default)
  - src/components/kits/kit-overview-list.tsx (refactor line 224; omit breakpoint prop for xl default)
- Dependencies: CollectionGrid component must exist; can merge after slice 5

- Slice: Refactor CollectionGrid usages (boxes, sellers, types)
- Goal: Replace grid patterns in secondary list pages (lg breakpoint)
- Touches:
  - src/components/boxes/box-list.tsx (refactor lines 194, 273; breakpoint='lg')
  - src/components/sellers/seller-list.tsx (refactor lines 276, 355; breakpoint='lg')
  - src/components/types/type-list.tsx (refactor lines 314, 398; breakpoint='lg')
- Dependencies: CollectionGrid component must exist; can merge after slice 5 or 6
- Note: box-details.tsx and box-form.tsx excluded (layout grids with asymmetric columns, not collection grids)

**Slice ordering rationale:** Create components before refactoring usages. Group refactoring by component type to enable focused review. Split CollectionGrid refactoring into two slices (primary vs secondary pages) to limit PR size and blast radius.

**Alternative single-slice approach:** All changes could be merged atomically in one PR if team prefers reduced coordination overhead. TypeScript compilation will catch all call sites, eliminating risk of partial migration.

## 15) Risks & Open Questions

**Risks:**

- Risk: CodeBadge adds background to part-inline-summary usages where it was previously plain text
- Impact: Minor visual change in shopping list and pick list part displays; improved consistency
- Mitigation: Accept as intended standardization; verify in development that background color (bg-muted) provides acceptable contrast

- Risk: ListSectionHeader standardization changes padding/gap in seller-group-card and kit-pick-list-panel
- Impact: Minor spacing differences; potentially tighter or looser header layouts
- Mitigation: Define single standard (gap-3, px-4 py-3) and apply consistently; verify in development that layouts remain balanced

- Risk: Refactoring CollectionGrid in 6 files introduces risk of breaking grid layouts if breakpoint prop is misconfigured
- Impact: Broken responsive layouts in overview pages; high visibility
- Mitigation: Parts/shopping-lists/kits omit breakpoint prop (defaults to xl); boxes/sellers/types explicitly pass breakpoint='lg'. Test all affected pages in development at 1024px and 1280px viewports; run existing Playwright specs to catch regressions

- Risk: TypeScript compilation may pass but runtime rendering could fail if testId props are not threaded through correctly
- Impact: Playwright specs fail; CI pipeline breaks
- Mitigation: Preserve all existing data-testid patterns exactly; verify in Playwright specs during development

- Risk: Merge conflicts if multiple developers touch affected files during refactoring
- Impact: Wasted time resolving conflicts; potential for introducing bugs during merge resolution
- Mitigation: Communicate refactoring timeline; complete work in focused timeframe; use slice-based approach to minimize conflict surface

**Open Questions:**

- Question: Should ListSectionHeader support left-aligned vs right-aligned action slots, or always justify-between?
- Why it matters: Some headers may want centered or left-only layouts in future
- Resolution: Current usages all use justify-between; add variants when needed, not speculatively

- Question: Should CollectionGrid support custom column counts (4, 5, etc.)?
- Why it matters: Future pages might need different column layouts
- Resolution: All current usages standardize on 1/2/3 columns at default/md/lg-or-xl breakpoints; add custom column support later if needed

All other open questions resolved through plan review corrections:
- CodeBadge variant prop removed (single standardized style sufficient)
- CollectionGrid breakpoint inconsistency resolved via breakpoint='lg'|'xl' prop
- ListSectionHeader semantic validation completed (update-stock-dialog excluded)
- Layout grids (box-details, box-form) excluded from CollectionGrid refactoring

## 16) Confidence

Confidence: High — This is straightforward UI refactoring with clear patterns, no state management complexity, no API changes, and strong TypeScript safety. The exhaustive search provides complete coverage of affected files. Risk is minimal because existing Playwright tests will validate functionality, and visual changes are intentional standardization. Implementation is mechanical prop replacement guided by TypeScript compiler errors.

## 17) Execution Notes

**Visual Verification - CodeBadge Background Addition**

The CodeBadge component adds `bg-muted` background to all code displays, including part-inline-summary.tsx where previously there was only `font-mono` text styling. This visual change was:
- Verified to provide appropriate contrast with the surrounding UI
- Confirmed to improve visual hierarchy by clearly distinguishing technical identifiers
- Accepted as intentional standardization per plan Section 12

The bg-muted styling is consistent with the project's design system and does not create visual clutter in shopping lists or pick lists.

**ListSectionHeader Border Handling**

The ListSectionHeader component hardcodes `border-b` which required a wrapper div with conditional border class in kit-pick-list-panel.tsx (line 126). This is acceptable for the current scope. Future enhancement could add an optional `showBorder?: boolean` prop if additional use cases require conditional borders, but this is not needed at present.

# Empty State Component Extraction

## 0) Research Log & Findings

### Discovery Work

Conducted exhaustive search across the codebase for empty state patterns using multiple strategies:
- Searched for `border-dashed` className (found 10 files)
- Searched for `rounded-lg border.*text-center` pattern (found 3 files)
- Searched for "No .* yet" text pattern (found 11 files)
- Manually inspected all identified files to understand pattern variations

### Pattern Variations Identified

The empty state pattern appears with several structural variations:

**Variant 1: Full-featured with CTA** (most common)
- Container: `rounded-lg border border-dashed border-muted py-16 text-center`
- Heading: `text-lg font-semibold`
- Description: `mt-2 text-sm text-muted-foreground`
- Button: `mt-4` spacing with domain-specific CTA
- Examples: kits overview (lines 186-197), shopping lists (lines 336-347)

**Variant 2: Search results empty state**
- Same container styling as Variant 1
- Dynamic heading including search term
- Description suggesting search refinement
- No CTA button
- Examples: kits overview (lines 200-209), shopping lists (lines 349-357)

**Variant 3: Tab-specific empty**
- Container: `rounded-md border border-dashed border-muted px-4 py-6 text-sm text-muted-foreground`
- Simpler, more compact styling
- Single-line text, no heading/description separation
- Examples: kits overview (lines 213-218), shopping lists (lines 372-379)

**Variant 4: Minimal centered text**
- Container: `py-12 text-center`
- No border, no button
- Examples: types list (lines 362-373), boxes list (lines 237-249), sellers list (lines 319-331)

**Variant 5: Pick list specific**
- Container: `rounded-lg border border-dashed border-muted-foreground/50 bg-muted/20 px-6 py-10 text-center text-sm text-muted-foreground`
- Similar to Variant 1 but with background color and adjusted border opacity
- Example: pick-lists/pick-list-lines.tsx (lines 70-76)

**Variant 6: Part list Card-based**
- Uses Card component wrapper
- Example: parts/part-list.tsx (lines 267-280)

**Variant 7: Document grid icon-based**
- Includes icon display with circular background
- Custom layout with icon, heading, description
- Example: documents/document-grid-base.tsx (lines 14-24)

### Affected Files Summary

1. `/work/frontend/src/components/kits/kit-overview-list.tsx` - Lines 186-209, 213-218 (3 variants)
2. `/work/frontend/src/components/shopping-lists/overview-list.tsx` - Lines 336-357, 372-379 (2 variants)
3. `/work/frontend/src/components/pick-lists/pick-list-lines.tsx` - Line 70-76 (1 variant)
4. `/work/frontend/src/components/parts/part-list.tsx` - Lines 267-280, 283-291 (2 variants with Card)
5. `/work/frontend/src/components/types/TypeList.tsx` - Lines 362-373, 410-415 (2 variants)
6. `/work/frontend/src/components/boxes/box-list.tsx` - Lines 237-249, 284-289 (2 variants)
7. `/work/frontend/src/components/sellers/seller-list.tsx` - Lines 319-331, 367-371 (2 variants)
8. `/work/frontend/src/components/documents/document-grid-base.tsx` - Lines 14-24 (icon variant)

### Architecture Context

- UI components live in `src/components/ui/`
- Existing examples: `badge.tsx`, `button.tsx`, `card.tsx`, `information-badge.tsx`, `status-badge.tsx`
- Components export from `src/components/ui/index.ts`
- Tailwind CSS used for styling
- Most UI components accept className prop merged via cn() utility (Badge, Button, Card) for layout flexibility
- Exception: InformationBadge excludes className with documented rationale (enforce rounded-md vs Badge's rounded-full)
- Test instrumentation via `data-testid` props throughout

### Testing Infrastructure

- Playwright tests rely on `data-testid` attributes for selectors
- Test files reference `.empty`, `.no-results` test IDs
- Instrumentation helpers in `src/lib/test/`
- Empty state assertions exist in: parts-page.ts, kits-page.ts, selectors.ts, location-editor-page.ts, TypesPage.ts

---

## 1) Intent & Scope

**User intent**

Extract the repeated empty state UI pattern into a reusable `EmptyState` component in `src/components/ui/`, eliminating duplication across 8+ component files while maintaining consistent styling and test instrumentation. The component must be domain-agnostic, support multiple layout variants (full-featured, minimal, search results), and follow the dominant UI component pattern of accepting optional className props for layout flexibility via the cn() utility.

**Prompt quotes**

"Extract the Empty State component pattern into a reusable UI component in src/components/ui/"

"The pattern appears in at least 5+ files with nearly identical structure"

"Follow the dominant UI component pattern for className prop support (Badge, Button, Card accept className merged via cn() utility)"

"This is technical debt elimination work. Resolve all questions autonomously"

"Accept minor visual differences as acceptable losses for consistency"

"Make breaking changes - do not attempt backward compatibility"

**In scope**

- Create new `EmptyState` component in `src/components/ui/empty-state.tsx`
- Support three primary variants: `default` (full-featured with CTA), `minimal` (compact), `search` (no-results state)
- Accept `title`, `description`, `action` (button config), and `icon` props
- Generate `data-testid` automatically from a required `testId` prop
- Refactor all 8 identified component files to use the new component
- Update existing Playwright tests where selectors reference empty state test IDs
- Export component from `src/components/ui/index.ts`
- Remove ALL Card-based empty state wrappers (Part list, Document grid)
- Standardize styling across all empty states to the most common pattern

**Out of scope**

- Backward compatibility layers or deprecation warnings
- Custom className override props
- Animation or transition effects
- Illustration or image support beyond simple icon display
- Loading state empty state skeletons
- Error state empty states (those are distinct patterns)
- Internationalization (i18n) integration

**Assumptions / constraints**

- All empty states currently use `data-testid` attributes that tests depend on
- Minor visual regressions (padding/spacing differences) are acceptable for consistency
- Card component will not be used in the new EmptyState component (flatten hierarchy)
- Icon support will use Lucide React icons passed as props
- The refactoring will touch 8+ files but is a pure UI change with no business logic impact
- Playwright specs may need selector updates but behavior remains identical

---

## 2) Affected Areas & File Map

### New Component

- **Area**: `src/components/ui/empty-state.tsx`
- **Why**: New reusable component encapsulating all empty state patterns
- **Evidence**: Does not exist; will be created

- **Area**: `src/components/ui/index.ts`
- **Why**: Export the new EmptyState component
- **Evidence**: Existing pattern exports all UI components from this barrel file

### Components to Refactor (8 files)

- **Area**: `src/components/kits/kit-overview-list.tsx`
- **Why**: Contains 3 empty state variants (lines 186-197, 200-209, 213-218)
- **Evidence**:
  ```tsx
  // Line 186-197: Full empty state with CTA
  <div className="rounded-lg border border-dashed border-muted py-16 text-center" data-testid="kits.overview.empty">
    <h2 className="text-lg font-semibold">No kits yet</h2>
    <p className="mt-2 text-sm text-muted-foreground">...</p>
    <Button className="mt-4" onClick={onCreateKit}>Add Kit</Button>
  </div>

  // Line 200-209: Search results empty
  <div className="rounded-lg border border-dashed border-muted py-16 text-center" data-testid="kits.overview.no-results">
    <h2 className="text-lg font-semibold">No kits match "{searchTerm}"</h2>
    <p className="mt-2 text-sm text-muted-foreground">...</p>
  </div>

  // Line 213-218: Tab-specific minimal
  <div className="rounded-md border border-dashed border-muted px-4 py-6 text-sm text-muted-foreground" data-testid={`kits.overview.${status}.empty`}>
    No {TAB_LABELS[status].toLowerCase()} kits yet.
  </div>
  ```

- **Area**: `src/components/shopping-lists/overview-list.tsx`
- **Why**: Contains 2 empty state variants (lines 336-347, 349-357, 372-379)
- **Evidence**:
  ```tsx
  // Line 336-347: Full empty with CTA
  <div className="rounded-lg border border-dashed border-muted py-16 text-center" data-testid="shopping-lists.overview.empty">
    <h2 className="text-lg font-semibold">No concept lists yet</h2>
    <p className="mt-2 text-sm text-muted-foreground">...</p>
    <Button className="mt-4" onClick={() => setCreateDialogOpen(true)}>Create your first list</Button>
  </div>

  // Line 349-357: Search results
  <div className="rounded-lg border border-dashed border-muted py-16 text-center" data-testid="shopping-lists.overview.no-results">
    <h2 className="text-lg font-semibold">No lists match "{searchTerm}"</h2>
    <p className="mt-2 text-sm text-muted-foreground">...</p>
  </div>

  // Line 372-379: Minimal tab-specific
  <div className="rounded-md border border-dashed border-muted px-4 py-6 text-sm text-muted-foreground" data-testid={`shopping-lists.overview.${activeTab}.empty`}>
    {isFiltered ? `No ${summaryCategory.toLowerCase()} lists match...` : `No ${summaryCategory.toLowerCase()} lists yet.`}
  </div>
  ```

- **Area**: `src/components/pick-lists/pick-list-lines.tsx`
- **Why**: Contains pick-list specific empty state (lines 70-76) with slight styling variation
- **Evidence**:
  ```tsx
  // Line 70-76
  <div className="rounded-lg border border-dashed border-muted-foreground/50 bg-muted/20 px-6 py-10 text-center text-sm text-muted-foreground" data-testid="pick-lists.detail.lines.empty">
    This pick list does not contain any lines yet.
  </div>
  ```

- **Area**: `src/components/parts/part-list.tsx`
- **Why**: Contains 2 Card-wrapped empty states (lines 267-280, 283-291) that will be flattened
- **Evidence**:
  ```tsx
  // Line 267-280: Card-wrapped empty with CTA
  const emptyContent = (
    <Card className="p-8" data-testid="parts.list.empty">
      <div className="text-center">
        <h3 className="mb-2 text-lg font-medium">No parts yet</h3>
        <p className="mb-4 text-muted-foreground">...</p>
        {onCreatePart && <Button onClick={onCreatePart}>Add First Part</Button>}
      </div>
    </Card>
  );

  // Line 283-291: Card-wrapped search results
  const noResultsContent = (
    <Card className="p-8" data-testid="parts.list.no-results">
      <div className="text-center">
        <h3 className="mb-2 text-lg font-medium">No parts found</h3>
        <p className="text-muted-foreground">...</p>
      </div>
    </Card>
  );
  ```

- **Area**: `src/components/types/TypeList.tsx`
- **Why**: Contains 2 centered text-only variants (lines 362-373, 410-415)
- **Evidence**:
  ```tsx
  // Line 362-373: Full empty with CTA
  <div className="py-12 text-center" data-testid="types.list.empty">
    <h3 className="text-lg font-medium text-muted-foreground">No types yet</h3>
    <p className="mt-2 text-sm text-muted-foreground">...</p>
    <Button className="mt-4" onClick={() => setCreateFormOpen(true)}>Add First Type</Button>
  </div>

  // Line 410-415: Search results
  <div className="py-12 text-center" data-testid="types.list.no-results">
    <h3 className="text-lg font-medium text-muted-foreground">No matching types</h3>
    <p className="mt-2 text-sm text-muted-foreground">...</p>
  </div>
  ```

- **Area**: `src/components/boxes/box-list.tsx`
- **Why**: Contains 2 centered text-only variants (lines 237-249, 284-289)
- **Evidence**:
  ```tsx
  // Line 237-249: Full empty with CTA
  <div className="py-12 text-center" data-testid="boxes.list.empty">
    <h3 className="text-lg font-medium text-muted-foreground">No storage boxes yet</h3>
    <p className="mt-2 text-sm text-muted-foreground">...</p>
    <Button className="mt-4" onClick={() => setCreateFormOpen(true)}>Add First Box</Button>
  </div>

  // Line 284-289: Search results
  <div className="py-12 text-center" data-testid="boxes.list.no-results">
    <h3 className="text-lg font-medium text-muted-foreground">No boxes found</h3>
    <p className="mt-2 text-sm text-muted-foreground">...</p>
  </div>
  ```

- **Area**: `src/components/sellers/seller-list.tsx`
- **Why**: Contains 2 centered text-only variants (lines 319-331, 367-371)
- **Evidence**:
  ```tsx
  // Line 319-331: Full empty with CTA
  <div className="py-12 text-center" data-testid="sellers.list.empty">
    <h3 className="text-lg font-medium text-muted-foreground">No sellers yet</h3>
    <p className="mt-2 text-sm text-muted-foreground">...</p>
    <Button className="mt-4" onClick={() => setCreateFormOpen(true)}>Add First Seller</Button>
  </div>

  // Line 367-371: Search results
  <div className="py-12 text-center" data-testid="sellers.list.no-results">
    <h3 className="text-lg font-medium text-muted-foreground">No matching sellers</h3>
    <p className="mt-2 text-sm text-muted-foreground">...</p>
  </div>
  ```

- **Area**: `src/components/documents/document-grid-base.tsx`
- **Why**: Contains icon-based empty state (lines 14-24) with custom layout
- **Evidence**:
  ```tsx
  // Line 14-24: Icon-based empty
  <div className="text-center py-12">
    <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
      <DocumentIcon className="w-8 h-8 text-muted-foreground" />
    </div>
    <h3 className="text-lg font-medium mb-2">No documents yet</h3>
    <p className="text-muted-foreground mb-4">...</p>
  </div>
  ```

### Test Files (Potentially Affected)

- **Area**: `tests/support/page-objects/parts-page.ts`
- **Why**: References `.empty` test IDs for parts list
- **Evidence**: Found via grep search for `.empty` pattern

- **Area**: `tests/support/page-objects/kits-page.ts`
- **Why**: References `.empty` test IDs for kits overview
- **Evidence**: Found via grep search for `.empty` pattern

- **Area**: `tests/support/selectors.ts`
- **Why**: May contain shared selectors for empty states
- **Evidence**: Found via grep search for `.empty` pattern

- **Area**: `tests/e2e/types/TypesPage.ts`
- **Why**: References `.empty` test IDs for types list
- **Evidence**: Found via grep search for `.empty` pattern

---

## 3) Data Model / Contracts

### EmptyState Component Props

- **Entity**: EmptyState component props interface
- **Shape**:
  ```typescript
  interface EmptyStateProps {
    // Required
    testId: string;          // Base test ID for the container
    title: string;           // Main heading text

    // Optional
    description?: string;    // Supporting text below title
    variant?: 'default' | 'minimal'; // Layout variant
    icon?: React.ComponentType<{ className?: string }>; // Lucide icon component
    className?: string;      // Optional layout/spacing overrides (merged via cn() utility)
    action?: {
      label: string;         // Button text
      onClick: () => void;   // Click handler
      testId?: string;       // Optional button-specific test ID (defaults to `${testId}.cta`)
    };
  }
  ```
- **Mapping**: Direct pass-through from usage sites; no transformation required. Domain-specific strings provided by consuming components. className merged as final argument to cn() for layout flexibility.
- **Evidence**: Derived from analyzing all 8+ usage sites and identifying common patterns. className pattern follows Badge (badge.tsx:11,26), Button (button.tsx:22), and Card (card.tsx:11,29).

### Variant Styling Decisions

- **Entity**: `variant` prop styling rules
- **Shape**:
  ```typescript
  type EmptyStateVariant = 'default' | 'minimal';

  // 'default' variant styling
  // - Container: rounded-lg border border-dashed border-muted py-16 text-center
  // - Title: text-lg font-semibold (or font-medium for consistency)
  // - Description: mt-2 text-sm text-muted-foreground
  // - Button: mt-4 spacing
  // - Optional icon: w-24 h-24 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center

  // 'minimal' variant styling
  // - Container: rounded-md border border-dashed border-muted px-4 py-6 text-center
  // - Title: text-sm text-muted-foreground (single-line, no bold)
  // - Description: optional, rendered inline with reduced spacing (mt-1 instead of mt-2)
  // - No button support
  // - No icon support
  ```
- **Mapping**: Consolidates Variants 1-7 into two standardized layouts. Variant 3 (tab-specific) maps to `minimal`. Variants 1, 2, 4, 5, 6, 7 map to `default`.
- **Evidence**: Lines 186-218 (kits), 336-379 (shopping lists), 70-76 (pick lists), 267-291 (parts), 362-415 (types), 237-289 (boxes), 319-371 (sellers), 14-24 (documents)

### Breaking Changes

All usage sites must be updated simultaneously. No deprecated props or backward compatibility layer.

---

## 4) API / Integration Surface

### Component Export

- **Surface**: `src/components/ui/index.ts` barrel export
- **Inputs**: None (static export)
- **Outputs**: `EmptyState` component available for import
- **Errors**: N/A (compile-time)
- **Evidence**: Existing pattern: `src/components/ui/index.ts` exports all UI components

### Usage Pattern

- **Surface**: Import and render in domain components
- **Inputs**: EmptyStateProps as defined in section 3
- **Outputs**: Rendered DOM with `data-testid` attributes
- **Errors**: TypeScript compile errors if required props missing
- **Evidence**: Pattern established by existing UI components like `Button`, `Badge`, `Card`

---

## 5) Algorithms & UI Flows

### Component Render Flow

- **Flow**: EmptyState component rendering
- **Steps**:
  1. Accept props: `{ testId, title, description?, variant = 'default', icon?, action?, className? }`
  2. Determine container base classes based on `variant`:
     - `default`: `rounded-lg border border-dashed border-muted py-16 text-center`
     - `minimal`: `rounded-md border border-dashed border-muted px-4 py-6 text-center`
  3. Merge className using `cn(baseClasses, className)` to allow layout overrides
  4. If `icon` provided and variant is `default`, render icon wrapper with circular background
  5. Render title with appropriate classes:
     - `default`: `text-lg font-semibold`
     - `minimal`: `text-sm text-muted-foreground`
  6. If `description` provided, render based on variant:
     - `default`: render with `mt-2 text-sm text-muted-foreground`
     - `minimal`: render with `mt-1 text-sm text-muted-foreground` (reduced spacing)
  7. If `action` provided and variant is `default`, render Button with:
     - `mt-4` spacing
     - `data-testid={action.testId ?? `${testId}.cta`}` (use explicit ID if provided, otherwise default to .cta suffix)
     - `onClick={action.onClick}` handler
     - Button label from `action.label`
  8. Attach `data-testid={testId}` to container
- **States / transitions**: Pure render, no internal state
- **Hotspots**: None (simple composition component)
- **Evidence**: Derived from analyzing 8+ existing empty state implementations

### Refactoring Flow per Component

- **Flow**: Replace inline empty state markup with EmptyState component
- **Steps**:
  1. Import EmptyState from `@/components/ui/empty-state`
  2. Identify empty state conditional branches in component
  3. Replace JSX with `<EmptyState testId="..." title="..." description="..." action={...} />`
  4. Extract button onClick handlers if needed
  5. Remove Card wrappers (parts, documents)
  6. Adjust variant to `minimal` for tab-specific empty states
  7. Pass icon component for documents empty state
- **States / transitions**: No state changes in consuming components
- **Hotspots**: Ensuring test IDs remain identical to avoid breaking Playwright specs
- **Evidence**: Pattern established by refactoring requirements

---

## 6) Derived State & Invariants

### Test ID Consistency

- **Derived value**: `data-testid` attribute on rendered container
- **Source**: `testId` prop passed by consuming component
- **Writes / cleanup**: None (stateless rendering)
- **Guards**: TypeScript enforces required `testId` prop
- **Invariant**: Test IDs must match existing patterns exactly to preserve Playwright test compatibility
- **Evidence**: All 8 components use consistent `data-testid` patterns: `{domain}.{context}.empty`, `{domain}.{context}.no-results`, `{domain}.{context}.{tab}.empty`

### Button Test ID Generation

- **Derived value**: `data-testid` for action button
- **Source**: `action.testId` if provided, otherwise `${testId}.cta`
- **Writes / cleanup**: None
- **Guards**: Only derived when `action` prop exists
- **Invariant**: Existing CTA test IDs like `kits.overview.empty.cta` must be preserved
- **Evidence**: Line 194-196 (kits/kit-overview-list.tsx), line 344-345 (shopping-lists/overview-list.tsx)

### Variant Selection Logic

- **Derived value**: CSS classes applied to container and children
- **Source**: `variant` prop (defaults to `'default'`)
- **Writes / cleanup**: None
- **Guards**: TypeScript union type restricts to `'default' | 'minimal'`
- **Invariant**: Minimal variant must not render description or action props (silently ignored or TypeScript restriction)
- **Evidence**: Lines 213-218 (kits), 372-379 (shopping lists) show minimal variant with single text line

---

## 7) State Consistency & Async Coordination

### Pure Component Contract

- **Source of truth**: Props provided by parent component
- **Coordination**: None required (stateless component)
- **Async safeguards**: N/A (synchronous rendering)
- **Instrumentation**: `data-testid` attributes enable Playwright assertions via `page.getByTestId()`
- **Evidence**: UI components in `src/components/ui/` follow stateless pattern (badge.tsx, button.tsx, card.tsx)

### Parent Component Responsibility

- **Source of truth**: Parent component's loading/empty state logic determines when to render EmptyState
- **Coordination**: Parent manages query states, search filters, tab selection that drive empty state visibility
- **Async safeguards**: Parents already implement `useListLoadingInstrumentation` and query state handling
- **Instrumentation**: No new instrumentation required; empty states are static content
- **Evidence**: Lines 63-87 (kits/kit-overview-list.tsx), lines 163-182 (shopping-lists/overview-list.tsx)

---

## 8) Errors & Edge Cases

### Missing Required Props

- **Failure**: TypeScript compile error if `testId` or `title` omitted
- **Surface**: Build-time error in consuming component
- **Handling**: Developer must provide required props
- **Guardrails**: TypeScript strict mode, required prop definitions
- **Evidence**: Standard React TypeScript pattern

### Invalid Variant

- **Failure**: TypeScript compile error if variant not `'default' | 'minimal'`
- **Surface**: Build-time error in consuming component
- **Handling**: Developer must use valid variant string
- **Guardrails**: TypeScript union type constraint
- **Evidence**: Standard TypeScript enum pattern

### Minimal Variant with Disallowed Props

- **Failure**: Decision required - silent ignore or TypeScript error
- **Surface**: Component usage site
- **Handling**: **Decision: TypeScript overload** - Define two separate prop interfaces with different prop support:
  ```typescript
  interface ActionConfig {
    label: string;
    onClick: () => void;
    testId?: string;
  }

  type EmptyStateDefaultProps = {
    variant?: 'default';
    testId: string;
    title: string;
    description?: string;
    icon?: React.ComponentType<{ className?: string }>;
    action?: ActionConfig;
    className?: string;
  }

  type EmptyStateMinimalProps = {
    variant: 'minimal';
    testId: string;
    title: string;
    description?: string; // Supported per line 825 decision; rendered with reduced spacing (mt-1)
    className?: string;
    // icon and action NOT supported in minimal variant
  }

  type EmptyStateProps = EmptyStateDefaultProps | EmptyStateMinimalProps;
  ```
- **Guardrails**: Discriminated union prevents invalid prop combinations at compile time (e.g., minimal variant cannot accept icon or action)
- **Evidence**: Shopping Lists minimal variant needs description for dynamic filtered/non-filtered text (lines 372-379). Best practice for variant-specific prop APIs.

### Icon Without Default Variant

- **Failure**: TypeScript error if icon provided with minimal variant
- **Surface**: Component usage site
- **Handling**: Include `icon` in discriminated union constraint for default variant only
- **Guardrails**: TypeScript type system
- **Evidence**: Documents component is only user of icon feature (lines 14-24)

### Test ID Collision

- **Failure**: Multiple empty states with same test ID could break Playwright selectors
- **Surface**: Runtime (Playwright test failures)
- **Handling**: Developer responsibility to ensure unique test IDs per usage context
- **Guardrails**: Code review, Playwright failures will surface duplicates immediately
- **Evidence**: Current test IDs are domain-scoped (`parts.list.empty`, `kits.overview.empty`)

---

## 9) Observability / Instrumentation

### Static Test ID

- **Signal**: `data-testid` attribute on container element
- **Type**: HTML attribute for test instrumentation
- **Trigger**: Always rendered on container div
- **Labels / fields**: Single string from `testId` prop
- **Consumer**: Playwright selectors via `page.getByTestId(testId)`
- **Evidence**: `tests/support/page-objects/parts-page.ts`, `tests/support/page-objects/kits-page.ts`, `tests/e2e/types/TypesPage.ts`

### Button Test ID

- **Signal**: `data-testid` attribute on action button
- **Type**: HTML attribute for test instrumentation
- **Trigger**: Rendered when `action` prop provided
- **Labels / fields**: `action.testId` or `${testId}.cta`
- **Consumer**: Playwright selectors for button click actions
- **Evidence**: Line 194 `data-testid="kits.overview.empty.cta"` (kits/kit-overview-list.tsx)

### No Runtime Events

No test-event emission required for empty states. These are static UI elements without lifecycle or user interaction beyond the optional button (which already has Button component instrumentation).

---

## 10) Lifecycle & Background Work

### No Lifecycle Hooks

EmptyState is a pure functional component with no effects, subscriptions, or cleanup.

- **Hook / effect**: None
- **Trigger cadence**: N/A
- **Responsibilities**: N/A
- **Cleanup**: N/A
- **Evidence**: Stateless UI component pattern established by badge.tsx, button.tsx

---

## 11) Security & Permissions

Not applicable. EmptyState is a presentational component with no data access, authentication, or authorization logic.

---

## 12) UX / UI Impact

### Entry Points (8 components affected)

- **Entry point**: Kits overview page (`/kits`)
- **Change**: Replace 3 inline empty state variants with EmptyState component
- **User interaction**: No behavioral change; visual standardization to dashed border container
- **Dependencies**: EmptyState component
- **Evidence**: Lines 186-218 in `src/components/kits/kit-overview-list.tsx`

- **Entry point**: Shopping lists overview page (`/shopping-lists`)
- **Change**: Replace 3 inline empty state variants with EmptyState component
- **User interaction**: No behavioral change; visual standardization
- **Dependencies**: EmptyState component
- **Evidence**: Lines 336-379 in `src/components/shopping-lists/overview-list.tsx`

- **Entry point**: Pick list detail page (`/pick-lists/:id`)
- **Change**: Replace inline empty state with EmptyState component
- **User interaction**: **Minor visual change** - loses bg-muted/20 background, may reduce visual separation from surrounding content
- **Dependencies**: EmptyState component
- **Evidence**: Lines 70-76 in `src/components/pick-lists/pick-list-lines.tsx`

- **Entry point**: Parts list page (`/parts`)
- **Change**: Remove Card wrapper, replace with EmptyState component
- **User interaction**: **Minor visual regression** - loses Card shadow/border, gains dashed border
- **Dependencies**: EmptyState component
- **Evidence**: Lines 267-291 in `src/components/parts/part-list.tsx`

- **Entry point**: Types list page (`/types`)
- **Change**: Add dashed border container (currently borderless)
- **User interaction**: **Minor visual change** - empty state gains border
- **Dependencies**: EmptyState component
- **Evidence**: Lines 362-415 in `src/components/types/TypeList.tsx`

- **Entry point**: Boxes list page (`/boxes`)
- **Change**: Add dashed border container (currently borderless)
- **User interaction**: **Minor visual change** - empty state gains border
- **Dependencies**: EmptyState component
- **Evidence**: Lines 237-289 in `src/components/boxes/box-list.tsx`

- **Entry point**: Sellers list page (`/sellers`)
- **Change**: Add dashed border container (currently borderless)
- **User interaction**: **Minor visual change** - empty state gains border
- **Dependencies**: EmptyState component
- **Evidence**: Lines 319-371 in `src/components/sellers/seller-list.tsx`

- **Entry point**: Part detail documents tab
- **Change**: Replace icon-based custom layout with EmptyState + icon prop
- **User interaction**: **Visual regression possible** - icon size/spacing may differ
- **Dependencies**: EmptyState component, DocumentIcon from Lucide
- **Evidence**: Lines 14-24 in `src/components/documents/document-grid-base.tsx`

### Accessibility Considerations

- Maintain semantic HTML heading tags (`<h2>`, `<h3>`)
- Preserve text contrast ratios (muted-foreground on background)
- Button remains keyboard-accessible (Button component handles this)

---

## 13) Deterministic Test Plan

### Scenario 1: Kits Overview Empty State

- **Surface**: `/kits` page when no kits exist
- **Scenarios**:
  - **Given** user has no kits, **When** visiting `/kits`, **Then** `kits.overview.empty` is visible with title "No kits yet", description, and "Add Kit" button
  - **Given** user has kits but search returns no results, **When** searching, **Then** `kits.overview.no-results` is visible with dynamic title including search term
  - **Given** user switches to Archived tab with no archived kits, **When** tab changes, **Then** `kits.overview.archived.empty` is visible with minimal variant
- **Instrumentation / hooks**: `page.getByTestId('kits.overview.empty')`, `page.getByTestId('kits.overview.no-results')`, `page.getByTestId('kits.overview.archived.empty')`
- **Gaps**: None
- **Evidence**: Existing tests in `tests/support/page-objects/kits-page.ts` likely assert on these IDs

### Scenario 2: Shopping Lists Overview Empty State

- **Surface**: `/shopping-lists` page when no lists exist
- **Scenarios**:
  - **Given** user has no shopping lists, **When** visiting `/shopping-lists`, **Then** `shopping-lists.overview.empty` is visible with CTA
  - **Given** user searches with no matches, **When** search applied, **Then** `shopping-lists.overview.no-results` is visible
  - **Given** user switches to Completed tab with no completed lists, **When** tab changes, **Then** `shopping-lists.overview.completed.empty` is visible
- **Instrumentation / hooks**: `page.getByTestId('shopping-lists.overview.empty')`, etc.
- **Gaps**: None
- **Evidence**: Existing Playwright specs for shopping lists

### Scenario 3: Parts List Empty State

- **Surface**: `/parts` page when no parts exist
- **Scenarios**:
  - **Given** user has no parts, **When** visiting `/parts`, **Then** `parts.list.empty` is visible with "Add First Part" button
  - **Given** user searches with no matches, **When** search applied, **Then** `parts.list.no-results` is visible
- **Instrumentation / hooks**: `page.getByTestId('parts.list.empty')`, `page.getByTestId('parts.list.no-results')`
- **Gaps**: Visual regression test for Card → EmptyState transition (acceptable loss)
- **Evidence**: `tests/support/page-objects/parts-page.ts`

### Scenario 4: Types List Empty State

- **Surface**: `/types` page when no types exist
- **Scenarios**:
  - **Given** user has no types, **When** visiting `/types`, **Then** `types.list.empty` is visible
  - **Given** user searches with no matches, **When** search applied, **Then** `types.list.no-results` is visible
- **Instrumentation / hooks**: `page.getByTestId('types.list.empty')`, `page.getByTestId('types.list.no-results')`
- **Gaps**: Visual regression test for borderless → bordered transition (acceptable)
- **Evidence**: `tests/e2e/types/TypesPage.ts`

### Scenario 5: Boxes List Empty State

- **Surface**: `/boxes` page when no boxes exist
- **Scenarios**: Same pattern as Types
- **Instrumentation / hooks**: `page.getByTestId('boxes.list.empty')`, `page.getByTestId('boxes.list.no-results')`
- **Gaps**: None
- **Evidence**: Likely in boxes test specs

### Scenario 6: Sellers List Empty State

- **Surface**: `/sellers` page when no sellers exist
- **Scenarios**: Same pattern as Types/Boxes
- **Instrumentation / hooks**: `page.getByTestId('sellers.list.empty')`, `page.getByTestId('sellers.list.no-results')`
- **Gaps**: None
- **Evidence**: `tests/e2e/sellers/sellers-list.spec.ts`

### Scenario 7: Pick List Lines Empty State

- **Surface**: Pick list detail page with no lines
- **Scenarios**:
  - **Given** pick list exists but has no lines, **When** viewing detail, **Then** `pick-lists.detail.lines.empty` is visible with single-line message
- **Instrumentation / hooks**: `page.getByTestId('pick-lists.detail.lines.empty')`
- **Gaps**: None
- **Evidence**: `tests/e2e/pick-lists/pick-list-detail.spec.ts`

### Scenario 8: Document Grid Empty State

- **Surface**: Part detail documents tab with no documents
- **Scenarios**:
  - **Given** part has no documents, **When** viewing documents tab, **Then** empty state visible with DocumentIcon
- **Instrumentation / hooks**: Component does not currently have test ID; must add during refactor
- **Gaps**: No existing test ID; add `documents.grid.empty` during refactor
- **Evidence**: Lines 14-24 in `src/components/documents/document-grid-base.tsx`

### Testing Strategy

1. Run full Playwright suite after refactoring each component
2. Verify all existing empty state tests still pass
3. Add test ID to documents empty state and update any relevant specs
4. No new behavioral tests required (pure UI refactor)

---

## 14) Implementation Slices

### Slice 0: Establish Test Baseline

- **Goal**: Ensure all Playwright tests pass before refactoring begins
- **Touches**:
  - Run `pnpm check` to verify no TypeScript errors
  - Run `pnpm playwright test` to establish baseline
  - Document any pre-existing test failures
- **Dependencies**: None
- **Testing protocol**: All tests must pass; any failures must be documented as pre-existing issues

### Slice 1: Create EmptyState Component

- **Goal**: Ship reusable EmptyState component with all variants
- **Touches**:
  - Create `src/components/ui/empty-state.tsx`
  - Update `src/components/ui/index.ts` to export EmptyState
  - Implement discriminated union types for variant-specific props (including className, description in both variants)
  - Add icon rendering for default variant
  - Merge className via cn() utility following Badge/Button pattern
- **Dependencies**: Slice 0 complete (baseline established)
- **Testing protocol**: Run `pnpm check` to verify TypeScript compiles; no Playwright tests needed (component not yet used)

### Slice 2: Refactor Kits & Shopping Lists

- **Goal**: Replace most complex empty state usages (3 variants each)
- **Touches**:
  - `src/components/kits/kit-overview-list.tsx` (lines 186-218)
  - `src/components/shopping-lists/overview-list.tsx` (lines 336-379)
- **Dependencies**: Slice 1 complete
- **Testing protocol**:
  1. Run affected tests BEFORE refactoring: `pnpm playwright test tests/e2e/kits tests/e2e/shopping-lists`
  2. Refactor components to use EmptyState (preserve test IDs exactly)
  3. Re-run affected tests
  4. If tests fail on visual assertions (CSS, layout), update or remove those assertions (acceptable visual change)
  5. If tests fail on functional assertions (test ID not found, button not clickable), treat as blocker and investigate
  6. Mark slice complete only when affected tests pass

### Slice 3: Refactor Simple List Components

- **Goal**: Replace simpler empty states (types, boxes, sellers)
- **Touches**:
  - `src/components/types/TypeList.tsx` (lines 362-415)
  - `src/components/boxes/box-list.tsx` (lines 237-289)
  - `src/components/sellers/seller-list.tsx` (lines 319-371)
- **Dependencies**: Slice 2 complete
- **Testing protocol**:
  1. Run affected tests BEFORE refactoring: `pnpm playwright test tests/e2e/types tests/e2e/boxes tests/e2e/sellers`
  2. Refactor components to use EmptyState (preserve test IDs exactly)
  3. Re-run affected tests
  4. Visual change expected: borderless → bordered empty states (acceptable per plan scope)
  5. If functional tests fail, treat as blocker and investigate
  6. Mark slice complete only when affected tests pass

### Slice 4: Refactor Parts List (Card Removal)

- **Goal**: Replace Card-wrapped empty states with EmptyState
- **Touches**:
  - `src/components/parts/part-list.tsx` (lines 267-291)
- **Dependencies**: Slice 3 complete
- **Testing protocol**:
  1. Run affected tests BEFORE refactoring: `pnpm playwright test tests/e2e/parts`
  2. Refactor component to use EmptyState (remove Card wrapper, preserve test IDs exactly)
  3. Re-run affected tests
  4. Visual change expected: Card shadow/border → dashed border (acceptable per plan scope)
  5. If functional tests fail, treat as blocker and investigate
  6. Mark slice complete only when affected tests pass

### Slice 5: Refactor Pick Lists & Documents

- **Goal**: Replace remaining empty states (pick lists, documents)
- **Touches**:
  - `src/components/pick-lists/pick-list-lines.tsx` (lines 70-76)
  - `src/components/documents/document-grid-base.tsx` (lines 14-24) - add test ID `documents.grid.empty`
- **Dependencies**: Slice 4 complete
- **Backend coordination note**: Document grid empty state requires `testData.attachments.createDocument()` or equivalent factory for comprehensive Playwright coverage of empty→populated transitions. If factory doesn't exist, this slice adds test ID for infrastructure but defers behavioral test coverage to future document management feature work.
- **Testing protocol**:
  1. Run affected tests BEFORE refactoring: `pnpm playwright test tests/e2e/pick-lists tests/e2e/documents` (if document tests exist)
  2. Refactor components to use EmptyState (preserve test IDs exactly, add documents.grid.empty)
  3. Re-run affected tests
  4. Visual change expected: pick list loses bg-muted/20 background (acceptable per plan scope)
  5. Document grid: if testData.attachments factory missing, document as out-of-scope for behavioral testing
  6. If functional tests fail, treat as blocker and investigate
  7. Mark slice complete only when affected tests pass (or document grid coverage deferred)

### Slice 6: Final Verification

- **Goal**: Full Playwright suite passes, visual review complete
- **Touches**:
  - Run `pnpm check` to verify no TypeScript errors
  - Run `pnpm playwright test` full suite as final verification
  - Manually verify each empty state in browser
  - Check for any missed usage sites via grep search for "border-dashed" and empty state patterns
- **Dependencies**: Slices 1-5 complete
- **Testing protocol**:
  1. All tests must pass without visual assertion changes beyond those made in Slices 2-5
  2. Visual changes are acceptable if: (a) test IDs unchanged, (b) content visible, (c) layout not broken (no overlapping text)
  3. Document any remaining issues or deferred coverage (e.g., document grid behavioral tests)

---

## 15) Risks & Open Questions

### Risk: Test ID Mismatches

- **Risk**: Accidentally changing test IDs during refactor breaks Playwright specs
- **Impact**: Test failures in CI, blocking merge
- **Mitigation**: Preserve exact test ID strings from original implementations; run Playwright tests after each slice

### Risk: Visual Regressions

- **Risk**: Standardizing styling causes noticeable UI differences users complain about
- **Impact**: User confusion, support tickets
- **Mitigation**: Accept minor visual changes as documented in UX section; borderless → bordered is consistent with rest of app

### Risk: Incomplete Discovery

- **Risk**: Additional empty state patterns exist beyond the 8 identified files
- **Impact**: Inconsistent UX with missed refactoring opportunities
- **Mitigation**: Final grep search in Slice 6 to catch stragglers; user request already accepted this scope

### Risk: Icon Prop Complexity

- **Risk**: Supporting arbitrary Lucide icons adds complexity for rare use case (only documents)
- **Impact**: Over-engineered API, unused prop in 7/8 usages
- **Mitigation**: Keep icon prop simple (pass component directly); if documents empty state proves problematic, fall back to children prop

### Risk: Discriminated Union Verbosity

- **Risk**: TypeScript discriminated unions make props interface harder to read
- **Impact**: Developer confusion when consuming component
- **Mitigation**: Document usage examples in component file; TypeScript autocomplete will guide correct usage

### Resolved Decision: className Prop Support

- **Initial approach**: Exclude className prop to enforce strict encapsulation (following InformationBadge exception pattern)
- **Why reconsidered**: Review found that 90% of UI components (Badge, Button, Card, Tooltip, etc.) accept className and merge via cn() utility for layout flexibility. Only InformationBadge excludes className with documented rationale (enforce rounded-md vs Badge's rounded-full). Excluding className forces wrapper divs for spacing adjustments.
- **Resolution**: **Accept className prop following dominant pattern** - Add `className?: string` to EmptyStateProps, merged as final argument to cn() utility. This aligns with codebase conventions while maintaining variant-driven style control. Updated in sections 1, 3, 5, 8, and 14.

### Resolved Decision: Minimal Variant Description Support

- **Question**: Tab-specific empty states currently show dynamic text; should minimal variant support optional description for this?
- **Why it matters**: Types/Boxes/Sellers use static titles, but Shopping Lists minimal variant shows filtered vs non-filtered text
- **Resolution**: **Support description in minimal variant** - Both variants accept optional `description` prop. Minimal variant renders description with reduced spacing (mt-1 instead of mt-2) to maintain compact layout. This supports Shopping Lists dynamic text while preserving minimal aesthetics. Updated in sections 3, 5, and 8.

---

## 16) Confidence

**Confidence: High** — Pattern is well-understood with 8 concrete usage sites identified, TypeScript will enforce correctness, Playwright tests provide regression safety, and autonomous decisions resolve all ambiguities. The refactoring is purely UI-level with no business logic impact.

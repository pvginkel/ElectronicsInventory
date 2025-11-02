# Grid Tile UI Component Standardization

## 0) Research Log & Findings

**Areas searched:**
- Card component (`src/components/ui/card.tsx`) — current variants: `default`, `stats`, `action`, `content`
- SellerCard (`src/components/sellers/seller-card.tsx`) — uses `variant="content"` with `className="hover:shadow-md transition-shadow"`
- TypeCard (`src/components/types/TypeCard.tsx`) — uses `variant="content"` with `className="hover:shadow-md transition-shadow"`
- KitCard (`src/components/kits/kit-card.tsx`) — uses Card with custom className containing full animation stack: `hover:shadow-md hover:scale-[1.02] hover:border-primary/50 active:scale-[0.98]`
- DocumentTile (`src/components/documents/document-tile.tsx`) — raw div with inline styles: `transition-all duration-200 hover:shadow-md hover:scale-[1.02] hover:border-primary/50 active:scale-[0.98]`
- StorageBox (`src/components/dashboard/storage-utilization-grid.tsx`) — raw div with custom animation: `hover:shadow-md hover:shadow-primary/20 hover:border-primary/60 hover:scale-105`
- Playwright tests: `sellers-list.spec.ts`, `type-list.spec.ts`, `kits-overview.spec.ts` (includes animation class assertion at lines 274-280), `storage-utilization.spec.ts`, `part-documents.spec.ts`

**Inconsistencies discovered:**
1. Animation divergence: Sellers/Types have no scale animation, Kits/Documents use `scale-[1.02]`, StorageBox uses `scale-105`
2. Card usage: Sellers/Types use Card component, KitCard uses Card with heavy className override, DocumentTile/StorageBox bypass Card entirely
3. className soup: Multiple components duplicate transition/hover logic in className props
4. Test fragility: One test explicitly verifies KitCard animation classes (kits-overview.spec.ts:264-281), which will break when we centralize styling

**Key finding:** The codebase has evolved organically with different developers adding hover effects in different ways. This plan eliminates that technical debt by centralizing all grid tile styling in the Card component.

---

## 1) Intent & Scope

**User intent**

Standardize grid tile UI components across the application by adding two new Card variants (`grid-tile` and `grid-tile-disabled`) that centralize hover animations, shadows, and border transitions. Refactor five existing grid tile components (SellerCard, TypeCard, KitCard, DocumentTile, StorageBox) to use these variants, removing duplicated className styling and raw div implementations.

**Prompt quotes**

"Add new variants to the Card component for grid tiles: 1. 'grid-tile': Standard grid tile with hover animation (scale-[1.02], shadow, border color change) 2. 'grid-tile-disabled': Grid tile without hover effects (for disabled/inactive states)"

"Standardize animation to: `hover:shadow-md hover:scale-[1.02] hover:border-primary/50 active:scale-[0.98]`"

"Remove className props related to hover/transition styling from these components"

"Minor visual differences in animation timing or scale factor are acceptable casualties for consistency"

**In scope**

- Add `grid-tile` and `grid-tile-disabled` variants to Card component with standardized animation
- Refactor SellerCard to use `grid-tile` variant
- Refactor TypeCard to use `grid-tile` variant
- Refactor KitCard to use `grid-tile` variant
- Refactor DocumentTile to migrate from raw div to Card with `grid-tile` variant
- Refactor StorageBox to migrate from raw div to Card with `grid-tile` variant
- Update Playwright test that asserts on KitCard animation classes
- Ensure `pnpm check` passes
- Ensure all Playwright tests pass

**Out of scope**

- Adding grid-tile variants to other Card use cases not related to grid tiles (action cards, stat cards, etc.)
- Preserving className props for backward compatibility (we will remove them completely for hover/transition styling)
- Changing the Card component's API beyond adding the two new variants
- Performance optimization or animation timing tuning beyond standardization
- Mobile-specific animation behavior changes

**Assumptions / constraints**

- The `scale-[1.02]` standard is preferred over `scale-105` (as stated in requirements)
- KitCard may retain className for layout purposes (flex layout, gap, etc.) but not for hover/animation styling
- DocumentTile and StorageBox require more invasive refactoring since they currently use raw divs
- One Playwright test explicitly asserts KitCard animation classes and must be updated
- The Card component's TypeScript interface will need to expand the variant union type
- All components must maintain their existing data-testid attributes for Playwright stability

---

## 2) Affected Areas & File Map

### Card Component (New Variants)

- **Area:** `src/components/ui/card.tsx`
- **Why:** Add `grid-tile` and `grid-tile-disabled` variants to the Card component's variant system
- **Evidence:**
  - `src/components/ui/card.tsx:7` — `variant?: 'default' | 'stats' | 'action' | 'content'`
  - `src/components/ui/card.tsx:14-19` — `variantClasses` object defines styling for each variant

### SellerCard Refactor

- **Area:** `src/components/sellers/seller-card.tsx`
- **Why:** Change `variant="content"` to `variant="grid-tile"` and remove `className="hover:shadow-md transition-shadow"`
- **Evidence:**
  - `src/components/sellers/seller-card.tsx:19-24` — Card usage with variant and className override

### TypeCard Refactor

- **Area:** `src/components/types/TypeCard.tsx`
- **Why:** Change `variant="content"` to `variant="grid-tile"` and remove `className="hover:shadow-md transition-shadow"`
- **Evidence:**
  - `src/components/types/TypeCard.tsx:18` — Card usage with variant and className override

### KitCard Refactor

- **Area:** `src/components/kits/kit-card.tsx`
- **Why:** Change to `variant="grid-tile"` and remove animation classes from className, retaining only layout classes (flex, gap)
- **Evidence:**
  - `src/components/kits/kit-card.tsx:64-66` — Card with custom className containing full animation stack: `'flex h-full flex-col gap-4 transition-all duration-200 hover:shadow-md hover:scale-[1.02] hover:border-primary/50 active:scale-[0.98]'`

### DocumentTile Refactor

- **Area:** `src/components/documents/document-tile.tsx`
- **Why:** Replace raw div with Card component using `grid-tile` variant
- **Evidence:**
  - `src/components/documents/document-tile.tsx:110-115` — Raw div with inline transition classes: `relative bg-card border rounded-lg overflow-hidden transition-all ... hover:shadow-md hover:scale-[1.02] hover:border-primary/50 active:scale-[0.98]`

### StorageBox Refactor

- **Area:** `src/components/dashboard/storage-utilization-grid.tsx`
- **Why:** Replace raw div with Card component using `grid-tile` variant
- **Evidence:**
  - `src/components/dashboard/storage-utilization-grid.tsx:48-56` — Raw div with custom animation: `cursor-pointer transition-all duration-200 ... hover:shadow-md hover:shadow-primary/20 hover:border-primary/60 hover:scale-105`

### Playwright Test Update

- **Area:** `tests/e2e/kits/kits-overview.spec.ts`
- **Why:** Remove or update test that asserts on specific KitCard animation classes since these will move to Card variant
- **Evidence:**
  - `tests/e2e/kits/kits-overview.spec.ts:264-281` — Test "kit cards include animation classes" verifies `classList` contains specific Tailwind classes

### Playwright Page Objects (Potential)

- **Area:** `tests/support/page-objects/sellers-page.ts`, `tests/support/page-objects/kits-page.ts`, `tests/support/page-objects/dashboard-page.ts`, `tests/support/page-objects/document-grid-page.ts`
- **Why:** Verify that existing selectors and page object methods continue to work after refactoring
- **Evidence:**
  - Page objects rely on data-testid attributes which we will preserve, so no changes expected
  - If tests fail, page objects may need adjustment to accommodate new DOM structure

---

## 3) Data Model / Contracts

### Card Component Variant Type

- **Entity / contract:** Card component props interface
- **Shape:**
  ```typescript
  interface CardProps extends NativeDivProps {
    variant?: 'default' | 'stats' | 'action' | 'content' | 'grid-tile' | 'grid-tile-disabled';
  }
  ```
- **Mapping:** No snake_case/camelCase mapping; purely UI concern
- **Evidence:** `src/components/ui/card.tsx:6-8`

### Card Variant Classes Object

- **Entity / contract:** `variantClasses` object in Card component
- **Shape:**
  ```typescript
  const variantClasses = {
    default: 'p-6',
    stats: 'p-6 text-center',
    action: 'p-4 hover:bg-accent/50 cursor-pointer transition-colors',
    content: 'p-4',
    'grid-tile': 'p-4 transition-all duration-200 hover:shadow-md hover:scale-[1.02] hover:border-primary/50 active:scale-[0.98] cursor-pointer',
    'grid-tile-disabled': 'p-4'
  }
  ```
- **Mapping:** N/A (CSS classes)
- **Evidence:** `src/components/ui/card.tsx:14-19`

### Component Prop Changes

No external API contracts change. All five refactored components retain their existing prop interfaces. The change is purely internal (how they use Card).

---

## 4) API / Integration Surface

**No API or TanStack Query changes.** This is a pure UI refactoring that does not touch:
- Backend endpoints
- Generated OpenAPI hooks
- TanStack Query cache keys or invalidation logic
- Form submission or mutation flows

The Card component is a presentational primitive with no integration surface beyond React props.

---

## 5) Algorithms & UI Flows

### Flow: Card Variant Resolution

**Steps:**
1. Developer passes `variant="grid-tile"` to Card component
2. Card component's internal logic maps variant to corresponding className via `variantClasses` lookup
3. `cn()` utility merges base classes, variant classes, and any additional className prop
4. Card renders a `<div>` with combined classes

**States / transitions:**
- Static mapping, no runtime state changes
- `cn()` handles conditional class merging

**Hotspots:**
- Ensure `cn()` correctly merges grid-tile classes with any layout-specific className overrides (e.g., KitCard's `flex h-full flex-col gap-4`)
- Verify Tailwind JIT compiler picks up new variant classes during build

**Evidence:** `src/components/ui/card.tsx:10-34`

### Flow: DocumentTile Migration

**Steps:**
1. Replace outer `<div>` with `<Card variant="grid-tile">`
2. Preserve all existing data attributes (`data-document-tile`, `data-document-id`)
3. Keep interior structure (aspect-square container, absolute positioned buttons, content section)
4. Remove transition/hover classes from outer element (now handled by Card variant)
5. Verify disabled state (when `isDeleting`) still applies `opacity-50 pointer-events-none`

**States / transitions:**
- Normal state → hover state (scale, shadow, border) handled by Card variant
- Deleting state → applies `opacity-50 pointer-events-none` via conditional className on Card

**Hotspots:**
- Ensure `overflow-hidden` is preserved (required for rounded corners and inner absolute positioning)
- Verify disabled state styling still works when combined with Card variant

**Evidence:** `src/components/documents/document-tile.tsx:110-181`

### Flow: StorageBox Migration

**Steps:**
1. Replace outer `<div>` with `<Card variant="grid-tile">`
2. Preserve all data attributes (`data-testid="dashboard.storage.box"`, `data-box-no`, dataset spread)
3. Keep custom background opacity calculation via inline style
4. Remove transition/hover/border classes (standardized by Card variant)
5. Note: StorageBox previously used `scale-105`; will now use `scale-[1.02]` per standardization

**States / transitions:**
- Dynamic background opacity based on usage percentage (via inline style)
- Dynamic border color based on usage thresholds (conditional className)
- Hover state (scale, shadow) now handled by Card variant

**Hotspots:**
- Inline `style` prop for background opacity must coexist with Card variant classes
- Custom border color logic may need adjustment since Card variant adds `hover:border-primary/50`

**Evidence:** `src/components/dashboard/storage-utilization-grid.tsx:47-104`

---

## 6) Derived State & Invariants

### Derived value: Card className composition

- **Source:** Card component receives `variant` prop and optional `className` prop from parent components
- **Writes / cleanup:** `cn()` utility merges `baseClasses`, `variantClasses[variant]`, and `className` into final className string
- **Guards:** TypeScript enforces variant must be one of the allowed string literals
- **Invariant:** The order of class merging must allow parent className to override variant classes when necessary (e.g., KitCard layout classes)
- **Evidence:** `src/components/ui/card.tsx:29` — `className={cn(baseClasses, variantClasses[variant], className)}`

### Derived value: KitCard layout vs. animation separation

- **Source:** KitCard needs flex layout (`flex h-full flex-col gap-4`) but no longer needs animation classes
- **Writes / cleanup:** After refactor, KitCard passes `variant="grid-tile"` and `className="flex h-full flex-col gap-4"` to Card
- **Guards:** Ensure layout classes don't conflict with Card variant animation classes
- **Invariant:** Layout classes (flex, height, gap) must merge cleanly with animation classes (transition, hover:scale, etc.) without specificity conflicts
- **Evidence:** `src/components/kits/kit-card.tsx:64-66`

### Derived value: DocumentTile disabled state

- **Source:** When `isDeleting` is true, DocumentTile applies `opacity-50 pointer-events-none`
- **Writes / cleanup:** Conditional className application: `variant="grid-tile"` when enabled, but disabled styling overrides hover effects
- **Guards:** The ternary at line 112 currently conditionally applies classes; must preserve this logic post-refactor
- **Invariant:** When deleting, Card should not show hover effects (scale, shadow, border change)
- **Evidence:** `src/components/documents/document-tile.tsx:111-113`

### Derived value: StorageBox dynamic border color

- **Source:** Border color is calculated via `getBorderColor(usagePercentage)` helper function returning Tailwind class
- **Writes / cleanup:** Border color class is merged with Card variant classes; Card variant adds `hover:border-primary/50`
- **Guards:** Need to verify the dynamic border color (e.g., `border-red-500/80`) coexists with hover state
- **Invariant:** On hover, border should transition to `primary/50` regardless of static border color (Tailwind specificity rules apply)
- **Evidence:** `src/components/dashboard/storage-utilization-grid.tsx:36-42`, `src/components/dashboard/storage-utilization-grid.tsx:51`

---

## 7) State Consistency & Async Coordination

**No async coordination required.** This refactoring is purely synchronous UI styling.

- **Source of truth:** Card component's `variantClasses` mapping (static)
- **Coordination:** Parent components pass variant prop; Card component applies corresponding classes
- **Async safeguards:** N/A
- **Instrumentation:** Existing data-testid attributes remain unchanged; Playwright tests continue to rely on these selectors
- **Evidence:** All components preserve existing data-testid attributes, ensuring test stability

---

## 8) Errors & Edge Cases

### Failure: Invalid variant passed to Card

- **Surface:** TypeScript compilation error
- **Handling:** TypeScript union type enforcement prevents runtime errors
- **Guardrails:** IDE will flag invalid variant values immediately
- **Evidence:** `src/components/ui/card.tsx:7`

### Failure: className conflict between variant and parent

- **Surface:** KitCard layout classes or StorageBox custom border classes
- **Handling:** `cn()` utility merges classes; Tailwind's specificity rules resolve conflicts
- **Guardrails:** Visual testing during development; Playwright specs verify expected behavior
- **Evidence:** `src/components/ui/card.tsx:29`

### Edge case: DocumentTile deleting state

- **Surface:** When `isDeleting` is true, hover effects should be suppressed
- **Handling:** Apply conditional className that includes `pointer-events-none` to override Card variant cursor/hover
- **Guardrails:** Existing test verifies delete flow; visual inspection confirms opacity overlay
- **Evidence:** `src/components/documents/document-tile.tsx:111-113`, `tests/e2e/parts/part-documents.spec.ts:81`

### Edge case: StorageBox background opacity + border color

- **Surface:** Inline style for background opacity and dynamic border color classes coexist with Card variant
- **Handling:** Inline styles apply via `style` prop; border color merges via className
- **Guardrails:** Visual inspection during development; existing Playwright test verifies click behavior
- **Evidence:** `src/components/dashboard/storage-utilization-grid.tsx:54-56`, `tests/e2e/dashboard/storage-utilization.spec.ts:63-84`

### Edge case: Kits animation test breaks

- **Surface:** Playwright test at `kits-overview.spec.ts:264-281` explicitly asserts on animation classes
- **Handling:** Update or remove test since animation classes now live in Card variant, not on KitCard itself
- **Guardrails:** Test will fail during CI; developer must address before merging
- **Evidence:** `tests/e2e/kits/kits-overview.spec.ts:264-281`

---

## 9) Observability / Instrumentation

### Signal: Existing data-testid preservation

- **Type:** HTML data attribute
- **Trigger:** All five components retain their existing data-testid attributes after refactor
- **Labels / fields:**
  - `sellers.list.item.{sellerId}` (SellerCard)
  - `types.list.card` (TypeCard)
  - `kits.overview.card.{kitId}` (KitCard)
  - `data-document-tile` + `data-document-id` (DocumentTile)
  - `dashboard.storage.box` + `data-box-no` (StorageBox)
- **Consumer:** Playwright page objects and specs
- **Evidence:**
  - `src/components/sellers/seller-card.tsx:22`
  - `src/components/types/TypeCard.tsx:18`
  - `src/components/kits/kit-card.tsx:66`
  - `src/components/documents/document-tile.tsx:114-115`
  - `src/components/dashboard/storage-utilization-grid.tsx:58-59`

### Signal: No new test instrumentation required

- **Type:** N/A
- **Trigger:** This refactor does not introduce new UI flows or API calls
- **Labels / fields:** N/A
- **Consumer:** Existing Playwright specs continue to work unchanged (except kits-overview animation test)
- **Evidence:** Playwright tests rely on stable data-testid selectors, not on CSS class names (except one animation test)

---

## 10) Lifecycle & Background Work

**No lifecycle hooks or background work involved.** Card component is a pure presentational component with no effects, subscriptions, or timers.

- All five refactored components are also presentational and do not introduce new lifecycle concerns
- Existing hooks (useDashboardStorage, useConfirm, useToast) remain unchanged

---

## 11) Security & Permissions

**Not applicable.** This is a pure UI styling refactor with no security or permission implications.

---

## 12) UX / UI Impact

### Entry point: All grid tile surfaces

- **Change:** Users will see consistent hover animations across Sellers, Types, Kits, Documents, and Storage Boxes
- **User interaction:**
  - On hover: All grid tiles now scale to 1.02, show medium shadow, and shift border to primary/50
  - On active (click): All grid tiles briefly scale down to 0.98 for tactile feedback
- **Dependencies:** Tailwind CSS JIT compiler must generate new `grid-tile` variant classes
- **Evidence:** Visual consistency across:
  - `/sellers` page (SellerCard grid)
  - `/types` page (TypeCard grid)
  - `/kits` page (KitCard grid)
  - Part detail documents tab (DocumentTile grid)
  - Dashboard storage utilization section (StorageBox grid)

### Entry point: Sellers list page

- **Change:** SellerCard gains hover scale animation (previously only had shadow)
- **User interaction:** Cards feel more interactive with subtle scale effect on hover
- **Dependencies:** No functional changes; purely visual enhancement
- **Evidence:** `src/components/sellers/seller-card.tsx:19-24`

### Entry point: Types list page

- **Change:** TypeCard gains hover scale animation (previously only had shadow)
- **User interaction:** Cards feel more interactive with subtle scale effect on hover
- **Dependencies:** No functional changes; purely visual enhancement
- **Evidence:** `src/components/types/TypeCard.tsx:18`

### Entry point: Kits overview page

- **Change:** KitCard animation remains visually identical (already had scale-[1.02])
- **User interaction:** No user-facing change; implementation switches from inline classes to Card variant
- **Dependencies:** Layout classes (flex, gap) must coexist with Card variant
- **Evidence:** `src/components/kits/kit-card.tsx:64-66`

### Entry point: Part documents tab

- **Change:** DocumentTile switches from raw div to Card component; animation remains scale-[1.02]
- **User interaction:** No user-facing change; slightly improved semantic HTML structure
- **Dependencies:** Overflow, aspect ratio, and absolute positioning must work within Card wrapper
- **Evidence:** `src/components/documents/document-tile.tsx:110-181`

### Entry point: Dashboard storage boxes

- **Change:** StorageBox switches from scale-105 to scale-[1.02] (slightly less dramatic hover effect)
- **User interaction:** Hover animation becomes more subtle and consistent with rest of app
- **Dependencies:** Custom border colors and background opacity must coexist with Card variant
- **Evidence:** `src/components/dashboard/storage-utilization-grid.tsx:47-104`

---

## 13) Deterministic Test Plan

### Surface: Card component new variants

**Scenarios:**
- **Given** Card receives `variant="grid-tile"`, **When** component renders, **Then** it includes transition, hover scale, shadow, and border classes
- **Given** Card receives `variant="grid-tile-disabled"`, **When** component renders, **Then** it includes padding but no hover effects
- **Given** Card receives `variant="grid-tile"` and additional `className`, **When** component renders, **Then** both variant and custom classes are applied

**Instrumentation / hooks:** No test instrumentation required; this is a unit-level concern

**Gaps:** Visual regression testing deferred (rely on manual QA during development)

**Evidence:** `src/components/ui/card.tsx:14-19`

### Surface: SellerCard refactor

**Scenarios:**
- **Given** SellerCard renders, **When** hovering over card, **Then** card scales to 1.02 and shows shadow (new behavior)
- **Given** sellers list page loads, **When** rendered, **Then** existing data-testid attributes remain unchanged

**Instrumentation / hooks:** `data-testid="sellers.list.item.{sellerId}"`

**Gaps:** None; existing Playwright tests will verify behavior

**Evidence:** `tests/e2e/sellers/sellers-list.spec.ts:6-40`

### Surface: TypeCard refactor

**Scenarios:**
- **Given** TypeCard renders, **When** hovering over card, **Then** card scales to 1.02 and shows shadow (new behavior)
- **Given** types list page loads, **When** rendered, **Then** existing data-testid attributes remain unchanged

**Instrumentation / hooks:** `data-testid="types.list.card"`

**Gaps:** None; existing Playwright tests will verify behavior

**Evidence:** `tests/e2e/types/type-list.spec.ts:6-107`

### Surface: KitCard refactor

**Scenarios:**
- **Given** KitCard renders, **When** hovering over card, **Then** card scales to 1.02 and shows shadow (existing behavior preserved)
- **Given** kits overview page loads, **When** rendered, **Then** existing data-testid attributes remain unchanged
- **Given** Playwright test runs, **When** asserting on animation classes, **Then** test must be updated to verify Card wrapper classes instead of inner element classes

**Instrumentation / hooks:** `data-testid="kits.overview.card.{kitId}"`

**Gaps:** Must update `kits-overview.spec.ts:264-281` test; see section 14 for approach

**Evidence:** `tests/e2e/kits/kits-overview.spec.ts:7-282`

### Surface: DocumentTile refactor

**Scenarios:**
- **Given** DocumentTile renders, **When** hovering over tile, **Then** tile scales to 1.02 and shows shadow (existing behavior preserved)
- **Given** document is deleting, **When** rendered, **Then** hover effects are suppressed and opacity is reduced
- **Given** document grid loads, **When** rendered, **Then** existing data attributes (`data-document-tile`, `data-document-id`) remain unchanged

**Instrumentation / hooks:** `data-document-tile`, `data-document-id`

**Gaps:** None; existing Playwright tests will verify behavior

**Evidence:** `tests/e2e/parts/part-documents.spec.ts:12-96`

### Surface: StorageBox refactor

**Scenarios:**
- **Given** StorageBox renders, **When** hovering over box, **Then** box scales to 1.02 (reduced from 1.05) and shows shadow
- **Given** storage utilization grid loads, **When** boxes render, **Then** existing data-testid attributes remain unchanged
- **Given** box is clicked, **When** navigation occurs, **Then** behavior remains identical to current implementation

**Instrumentation / hooks:** `data-testid="dashboard.storage.box"`, `data-box-no`

**Gaps:** Visual regression of slightly reduced hover scale (1.02 vs 1.05) — acceptable per requirements

**Evidence:** `tests/e2e/dashboard/storage-utilization.spec.ts:28-90`

### Surface: Playwright CI execution

**Scenarios:**
- **Given** all refactors complete, **When** `pnpm check` runs, **Then** TypeScript compilation succeeds with no errors
- **Given** all refactors complete, **When** `pnpm playwright test` runs, **Then** all tests pass except kits-overview animation test (which must be updated)
- **Given** kits-overview animation test is updated, **When** full test suite runs, **Then** all tests pass

**Instrumentation / hooks:** Standard CI pipeline

**Gaps:** None

**Evidence:** `docs/contribute/testing/ci_and_execution.md`

---

## 14) Implementation Slices

### Slice 1: Add Card variants

**Goal:** Extend Card component with grid-tile variants and verify compilation

**Touches:**
- `src/components/ui/card.tsx` — Add `grid-tile` and `grid-tile-disabled` to variant union type and variantClasses object

**Dependencies:** None; this is the foundation for all subsequent slices

**Verification:**
```bash
pnpm check  # TypeScript compilation
```

### Slice 2: Refactor SellerCard and TypeCard

**Goal:** Migrate SellerCard and TypeCard to use grid-tile variant

**Touches:**
- `src/components/sellers/seller-card.tsx` — Change to `variant="grid-tile"`, remove hover className
- `src/components/types/TypeCard.tsx` — Change to `variant="grid-tile"`, remove hover className

**Dependencies:** Slice 1 complete

**Verification:**
```bash
pnpm check
pnpm playwright test tests/e2e/sellers/sellers-list.spec.ts
pnpm playwright test tests/e2e/types/type-list.spec.ts
```

### Slice 3: Refactor KitCard

**Goal:** Migrate KitCard to use grid-tile variant and update Playwright test

**Touches:**
- `src/components/kits/kit-card.tsx` — Change to `variant="grid-tile"`, keep layout classes, remove animation classes
- `tests/e2e/kits/kits-overview.spec.ts` — Update or remove animation class assertion test (lines 264-281)

**Dependencies:** Slice 1 complete

**Verification:**
```bash
pnpm check
pnpm playwright test tests/e2e/kits/kits-overview.spec.ts
```

**Test update approach:** Either:
1. **Remove test entirely** (animation is now implementation detail of Card variant)
2. **Update test to verify Card wrapper** has variant="grid-tile" instead of asserting on specific Tailwind classes

**Recommended:** Remove the test. Animation is an internal styling concern; functional behavior (click, navigation, indicators) is what matters.

**Documentation:** Add a code comment in `kit-card.tsx` near the Card component explaining that animation classes are now an implementation detail of the Card component's grid-tile variant, so developers should not assert on specific animation classes in tests.

### Slice 4: Refactor DocumentTile

**Goal:** Migrate DocumentTile from raw div to Card component

**Touches:**
- `src/components/documents/document-tile.tsx` — Replace outer div with `<Card variant="grid-tile" className="overflow-hidden">`, preserve data attributes and disabled state logic
  - **Critical:** Must add `className="overflow-hidden"` to Card to preserve rounded corner clipping and absolute-positioned button behavior
  - When `isDeleting` is true, add `opacity-50 pointer-events-none` to the className as well

**Dependencies:** Slice 1 complete

**Verification:**
```bash
pnpm check
pnpm playwright test tests/e2e/parts/part-documents.spec.ts
```

**Visual verification:** Manually verify that:
1. Document preview images are clipped by rounded corners
2. Absolute-positioned action buttons (star, delete) remain within card bounds
3. Deleting state suppresses hover effects correctly

### Slice 5: Refactor StorageBox

**Goal:** Migrate StorageBox from raw div to Card component

**Touches:**
- `src/components/dashboard/storage-utilization-grid.tsx` — Replace outer div with `<Card variant="grid-tile">`, preserve inline styles and data attributes
  - Note: StorageBox uses dynamic border colors (e.g., `border-red-500/80`) that must coexist with Card variant's `hover:border-primary/50`

**Dependencies:** Slice 1 complete

**Verification:**
```bash
pnpm check
pnpm playwright test tests/e2e/dashboard/storage-utilization.spec.ts
```

**Visual verification:** Manually test boxes with different usage percentages (0%, 50%, 85%, 95%) to verify:
1. Static border colors render correctly based on usage thresholds
2. On hover, border transitions to primary/50 regardless of static color
3. Hover scale animation (now 1.02 instead of 1.05) looks acceptable

### Slice 6: Full verification

**Goal:** Ensure all tests pass and no regressions introduced

**Touches:** N/A (verification only)

**Dependencies:** Slices 1-5 complete

**Verification:**
```bash
pnpm check                    # TypeScript, linting, formatting
pnpm playwright test          # Full test suite
```

---

## 15) Risks & Open Questions

### Risk: Tailwind class specificity conflicts

- **Impact:** Custom border colors or layout classes might conflict with Card variant classes
- **Mitigation:** Rely on `cn()` utility's last-wins merge strategy; test StorageBox border colors and KitCard flex layout carefully during development

### Risk: Visual regression in StorageBox hover scale

- **Impact:** Users may notice slightly less dramatic hover effect (1.02 vs 1.05)
- **Mitigation:** Acceptable per requirements ("acceptable casualties for consistency"); can revert if stakeholder feedback is negative

### Risk: DocumentTile disabled state interaction

- **Impact:** If `pointer-events-none` doesn't fully suppress Card variant hover effects, deleting state may look broken
- **Mitigation:** Apply both `pointer-events-none` and a custom className that overrides hover classes; verify visually during development

### Risk: Playwright test flakiness after refactor

- **Impact:** Tests might fail if DOM structure changes unexpectedly or selectors break
- **Mitigation:** All components preserve data-testid attributes; page objects rely on stable selectors, not CSS classes

### Risk: Kits animation test failure blocks merge

- **Impact:** CI will fail on `kits-overview.spec.ts:264-281` until test is updated
- **Mitigation:** Address test update in Slice 3 before moving to subsequent slices

### Open question: Should grid-tile-disabled be used for archived kits?

- **Question:** KitCard has an archived status badge; should archived kits use `grid-tile-disabled` variant?
- **Why it matters:** User expectation for interactivity of archived items
- **Owner / follow-up:** Product team decision; for now, all kits (active and archived) use `grid-tile` variant since they remain clickable
- **Note:** The `grid-tile-disabled` variant is defined but not used in this refactoring. All five components continue using `grid-tile` with conditional className for disabled states (e.g., DocumentTile's `isDeleting` state). This is acceptable and allows future flexibility for truly non-interactive grid tiles.

### Open question: Should Card variants be documented in Storybook?

- **Question:** Does this project use Storybook or similar component documentation?
- **Why it matters:** Future developers need to discover grid-tile variants
- **Owner / follow-up:** If Storybook exists, add stories for grid-tile variants; otherwise, rely on code comments

---

## 16) Confidence

**Confidence: High** — This is a straightforward UI refactoring with clear scope, stable selectors, and comprehensive test coverage. The Card component is well-encapsulated, and all five target components have existing Playwright specs. The only moderate risk is Tailwind class specificity in StorageBox border colors, which can be resolved through manual testing during implementation.

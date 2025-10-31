# Icon and Animation Polish – Technical Plan

## 0) Research Log & Findings

**Discovery areas searched:**
- Sidebar navigation component: `src/components/layout/sidebar.tsx`
- Card components: `src/components/kits/kit-card.tsx`, `src/components/shopping-lists/overview-card.tsx`, `src/components/parts/part-list.tsx`, `src/components/kits/kit-pick-list-panel.tsx`
- Icon usage: Searched for `lucide-react` imports across the codebase
- Animation patterns: Searched for `transition`, `hover:`, `animate` patterns in card components

**Key findings:**
1. **Lucide icons already installed**: `lucide-react` v0.468.0 is in `package.json` and already used extensively (ShoppingCart, CircuitBoard, ClipboardList, Package, etc.)
2. **Current sidebar icons**: Using emoji (📊, 🔧, 🧰, 🛒, 📦, 🏷️, 🏪, ℹ️) at `sidebar.tsx:17-25`
3. **Part card animation pattern identified**: `transition-all duration-200 hover:shadow-md hover:scale-[1.02] hover:border-primary/50 active:scale-[0.98]` at `part-list.tsx:413-417`
4. **Cards needing animation**:
   - Kit cards have no hover animation
   - Shopping list cards have partial animation (`transition-shadow hover:shadow-md`)
   - Pick list cards (both open and completed variants) have minimal animation

**Conflicts resolved:**
- No icon naming conflicts found; selected Lucide icons that don't clash with existing usage
- Animation classes are simple Tailwind utilities with no custom CSS conflicts

## 1) Intent & Scope

**User intent**

Apply consistent visual polish to navigation icons and card interactions throughout the application, enhancing the professional appearance and tactile feedback of the UI without changing functionality.

**Prompt quotes**

"Replace all sidebar navigation icons with standardized Lucide icons"
"Apply the part card animation to all card components (kit cards, shopping list cards, pick list cards)"

**In scope**

- Replace 8 emoji icons in sidebar navigation with appropriate Lucide React icons
- Apply the existing part card animation pattern to kit cards, shopping list cards, and pick list cards
- Ensure visual consistency across all interactive card components
- Maintain existing accessibility attributes and test IDs

**Out of scope**

- Creating new animation patterns or custom transitions
- Modifying card layouts or internal structure
- Changing navigation behavior or routing
- Adding new icons beyond the sidebar navigation
- Modifying existing Lucide icon usage in other components

**Assumptions / constraints**

- The part card animation pattern (`transition-all duration-200 hover:shadow-md hover:scale-[1.02] hover:border-primary/50 active:scale-[0.98]`) is the canonical reference
- Icons must remain accessible with proper `aria-hidden="true"` attributes since labels provide text alternatives
- No breaking changes to existing test selectors or instrumentation
- Changes are purely visual/CSS with no data model or API modifications

## 2) Affected Areas & File Map (with repository evidence)

- Area: Sidebar navigation
- Why: Replace emoji icons with Lucide React icons for consistency
- Evidence: `src/components/layout/sidebar.tsx:17-25` — `navigationItems` array contains emoji strings in `icon` property

- Area: Sidebar icon rendering
- Why: Update JSX to render Lucide components instead of emoji strings
- Evidence: `src/components/layout/sidebar.tsx:89` — `<span className="text-xl">{item.icon}</span>` renders emoji

- Area: Kit card component
- Why: Apply part card animation pattern for consistent hover/active feedback
- Evidence: `src/components/kits/kit-card.tsx:66-67` — `<Card className={cn('flex h-full flex-col gap-4', className)}` lacks hover animation

- Area: Shopping list overview card
- Why: Enhance existing partial animation to match part card pattern
- Evidence: `src/components/shopping-lists/overview-card.tsx:52` — `className={...group transition-shadow hover:shadow-md...}` has incomplete animation

- Area: Pick list panel - open items
- Why: Apply hover animation to open pick list card links
- Evidence: `src/components/kits/kit-pick-list-panel.tsx:158` — `className="...border border-border bg-card px-4 py-3 shadow-sm transition hover:border-primary/70..."` lacks scale animation

- Area: Pick list panel - completed items
- Why: Apply subtle hover animation to completed pick list card links (shadow only, no scale to match muted visual treatment)
- Evidence: `src/components/kits/kit-pick-list-panel.tsx:226` — `className="...border border-dashed border-border bg-muted/20 px-4 py-3 text-sm transition hover:border-primary/70..."` lacks shadow enhancement

## 3) Data Model / Contracts

No data model or contract changes. This feature only modifies presentation layer CSS classes and icon rendering.

## 4) API / Integration Surface

No API or integration surface changes. All changes are purely visual CSS and icon component updates.

## 5) Algorithms & UI Flows (step-by-step)

**Flow: Sidebar icon rendering**
- Steps:
  1. Import selected Lucide icons at top of `sidebar.tsx`: `LayoutDashboard, Wrench, Package, ShoppingCart, Archive, Tag, Store, Info`
     - Note: `ShoppingCart` is also imported in `kit-card.tsx:12`, but ES6 module scoping means each file has its own import namespace—no aliasing required
  2. Update `SidebarItem` interface to accept `icon: LucideIcon` instead of `string`
  3. Update `navigationItems` array to reference icon components instead of emoji strings
     - Dashboard (📊) → `LayoutDashboard`
     - Parts (🔧) → `Wrench`
     - Kits (🧰) → `Package`
     - Shopping Lists (🛒) → `ShoppingCart`
     - Storage (📦) → `Archive`
     - Types (🏷️) → `Tag`
     - Sellers (🏪) → `Store`
     - About (ℹ️) → `Info`
  4. Update icon rendering in JSX from `<span>{item.icon}</span>` to `<item.icon className="h-5 w-5" aria-hidden="true" />`
- States / transitions: No state changes; purely declarative rendering update
- Hotspots: Icon components must render without errors; TypeScript will catch invalid icon references at build time
- Evidence: `src/components/layout/sidebar.tsx:89` — current emoji rendering

**Flow: Card hover animation**
- Steps:
  1. Identify the Card or interactive wrapper element in each affected component
  2. Add or merge animation classes: `transition-all duration-200 hover:shadow-md hover:scale-[1.02] hover:border-primary/50 active:scale-[0.98]`
  3. For shopping list cards, enhance existing `transition-shadow` to `transition-all`
  4. For open pick list cards, add scale and shadow effects to existing transition classes
  5. For completed pick list cards, use subtler animation (shadow only, no scale) to match their muted visual treatment: `transition-all duration-200 hover:shadow-sm hover:border-primary/50`
  6. Note on cursor styling: Kit cards already apply `cursor-pointer` to the inner clickable wrapper (`kit-card.tsx:71`), not the Card element. This is intentional—the animation target (Card) does not need `cursor-pointer` since the nested interactive area handles cursor feedback. Shopping list cards apply `cursor-pointer` via `interactiveClasses` on the Card itself (`overview-card.tsx:31,52`). Both patterns are acceptable; maintain existing cursor styling without modification.
- States / transitions: Hover and active pseudo-states trigger visual feedback
- Hotspots: Ensure transforms don't break layout; verify `active:scale-[0.98]` works on both Card and Link wrappers
- Evidence: `src/components/parts/part-list.tsx:413-417` — canonical animation pattern

## 6) Derived State & Invariants (stacked bullets)

- Derived value: Icon selection mapping
  - Source: Static mapping from route path to Lucide icon component (Dashboard → LayoutDashboard, Parts → Wrench, etc.)
  - Writes / cleanup: None; icons are stateless pure components
  - Guards: TypeScript ensures only valid LucideIcon components are used
  - Invariant: Each navigation item must have exactly one icon component
  - Evidence: `src/components/layout/sidebar.tsx:17-25`

- Derived value: Animation application scope
  - Source: Interactive card components across parts, kits, shopping lists, and pick lists
  - Writes / cleanup: None; CSS transitions are declarative
  - Guards: Animation only applies to interactive cards (those with onClick or Link wrappers)
  - Invariant: All interactive overview/list cards should have consistent hover/active animation
  - Evidence: `src/components/parts/part-list.tsx:413-417` — reference pattern

- Derived value: Accessibility attributes
  - Source: Icon components with `aria-hidden="true"` since surrounding Link/button provides accessible label
  - Writes / cleanup: None
  - Guards: Icons must remain decorative (not interactive independently)
  - Invariant: Icon changes must not alter ARIA tree or keyboard navigation
  - Evidence: `src/components/layout/sidebar.tsx:77` — Link already has accessible label via text

## 7) State Consistency & Async Coordination

- Source of truth: Static icon definitions in sidebar component; CSS class strings in card components
- Coordination: No cross-component coordination needed; changes are isolated to individual components
- Async safeguards: Not applicable; no async operations
- Instrumentation: Existing test IDs and navigation instrumentation remain unchanged
- Evidence: `src/components/layout/sidebar.tsx:74-80` — test IDs preserved

## 8) Errors & Edge Cases

- Failure: Lucide icon import fails or icon name doesn't exist
- Surface: TypeScript compilation error
- Handling: Build fails; developer corrects import before deployment
- Guardrails: TypeScript strict mode, IDE autocomplete
- Evidence: `package.json:36` — `lucide-react` already installed

- Failure: Animation causes layout shift or z-index stacking issues
- Surface: Visual regression in card grids or overlapping cards
- Handling: Manual visual inspection during development; adjust transform-origin or z-index if needed
- Guardrails: Scale factor is minimal (1.02); unlikely to cause issues
- Evidence: `src/components/parts/part-list.tsx:413-417` — pattern already working on part cards

- Failure: Hover animation conflicts with focus styles
- Surface: Keyboard navigation focus ring might be obscured during scale animation
- Handling: Ensure `focus-visible:ring` styles are applied and take precedence
- Guardrails: All affected cards already have `focus-visible:ring` classes
- Evidence: `src/components/shopping-lists/overview-card.tsx:52` — `focus-visible:ring-2` present

## 9) Observability / Instrumentation

- Signal: No new instrumentation required
  - Type: Existing test IDs and navigation instrumentation
  - Trigger: Unchanged; visual changes don't affect test events
  - Labels / fields: None
  - Consumer: Playwright specs for navigation and card interactions
  - Evidence: `tests/e2e/shell/navigation.spec.ts` — navigation tests use existing selectors

- Signal: Visual regression detection (manual)
  - Type: Developer visual inspection
  - Trigger: During development and before PR creation
  - Labels / fields: None
  - Consumer: Code reviewer
  - Evidence: N/A — standard development practice

## 10) Lifecycle & Background Work

No lifecycle hooks or background work required. All changes are declarative JSX and CSS class modifications.

## 11) Security & Permissions (if applicable)

No security or permissions concerns. Icons are static components from a trusted npm package (`lucide-react`). No user-generated content or dynamic icon loading.

## 12) UX / UI Impact (if applicable)

- Entry point: Sidebar navigation (all routes)
- Change: Replace emoji icons with professionally designed Lucide icons for improved visual consistency
- User interaction: No behavioral change; icons remain non-interactive decoration alongside link text
- Dependencies: `lucide-react` package (already installed)
- Evidence: `src/components/layout/sidebar.tsx:17-25` — emoji icon definitions

- Entry point: All card-based list views (parts, kits, shopping lists, pick lists)
- Change: Add subtle scale, shadow, and border hover effects to interactive cards
- User interaction: Enhanced tactile feedback on hover/click; users perceive cards as more interactive
- Dependencies: Existing Tailwind transition utilities
- Evidence: `src/components/parts/part-list.tsx:413-417` — reference animation

## 13) Deterministic Test Plan (new/changed behavior only)

**Test additions to existing specs:**

- Surface: Sidebar navigation icons (`tests/e2e/shell/navigation.spec.ts`)
- New scenario: "renders Lucide icons for all navigation items"
  - Given the sidebar is rendered, When I check each navigation link, Then each link contains an SVG element (Lucide icons render as `<svg>`)
  - Implementation: Add assertions verifying `page.locator('[data-testid="app-shell.sidebar.link.dashboard"] svg').toBeVisible()` for each navigation item (dashboard, parts, kits, shopping-lists, boxes, types, sellers, about)
  - This deterministically verifies that icons render without errors and are present in the DOM
- Instrumentation / hooks: Existing `data-testid="app-shell.sidebar.link.*"` selectors
- Gaps: None—SVG presence check provides deterministic verification of icon rendering
- Evidence: `tests/e2e/shell/navigation.spec.ts:26-49` — navigation flow test location

- Surface: Card animation classes (`tests/e2e/kits/kits-overview.spec.ts`, `tests/e2e/shopping-lists/shopping-lists.spec.ts`)
- New scenario: "card elements include animation classes"
  - Given a card list is rendered, When I inspect the card elements, Then animation classes are present in the class attribute
  - Implementation for kit cards: `await expect(page.locator('[data-testid="kits.overview.card.1"]')).toHaveClass(/transition-all.*hover:shadow-md/)`
  - Implementation for shopping list cards: `await expect(page.locator('[data-testid="shopping-lists.overview.card.1"]')).toHaveClass(/transition-all.*hover:shadow-md/)`
  - This verifies that animation classes are correctly applied to card elements
- Instrumentation / hooks: Existing card test IDs (`kits.overview.card.*`, `shopping-lists.overview.card.*`, `kits.detail.pick-lists.*.item.*`)
- Gaps: Playwright cannot deterministically test CSS pseudo-state rendering (`:hover`, `:active` visual effects), but class presence verification ensures the animation contract is in place. Visual verification of hover effects remains manual during development.
- Evidence: `tests/e2e/kits/kits-overview.spec.ts`, `tests/e2e/shopping-lists/shopping-lists.spec.ts` — card interaction test locations

**Existing coverage maintained:**

- Sidebar navigation behavior (navigation flow, collapse/expand, keyboard navigation) — unchanged
- Card click/keyboard interactions — unchanged
- Focus ring visibility — unchanged (existing `focus-visible:ring` classes are preserved)

## 14) Implementation Slices (only if large)

Not applicable. This is a small feature that can be implemented in a single slice:

- Slice: Icon and animation polish
- Goal: Ship all visual improvements together for consistency
- Touches: `sidebar.tsx`, `kit-card.tsx`, `overview-card.tsx`, `kit-pick-list-panel.tsx`
- Dependencies: None; can be implemented and tested immediately

## 15) Risks & Open Questions

**Risks:**

- Risk: Icon selection doesn't match user mental model
- Impact: Confusion about navigation item purpose
- Mitigation: Choose semantically clear icons with established conventions (e.g., ShoppingCart for shopping lists); get design feedback if uncertain

- Risk: Scale animation feels jarring or causes layout issues
- Impact: Poor user experience; cards might overlap during hover
- Mitigation: Use the proven part card animation parameters (1.02 scale factor is subtle); test in responsive layouts

- Risk: Animation performance on lower-end devices
- Impact: Janky or slow hover transitions
- Mitigation: Use GPU-accelerated properties (transform, opacity); `transition-all` is acceptable for such small components. Note: `transition-all` animates every CSS property, which is less performant than specifying individual properties like `transition-[transform,box-shadow,border-color]`. However, this choice maintains consistency with the established part card pattern (`part-list.tsx:413`) and is justified by the minimal performance impact on small card components (typically <20 cards rendered per view).

**Resolved decisions:**

- Decision: Use `Tag` (singular) for Types icon
- Rationale: Better matches the singular form commonly used in UI conventions

- Decision: Use subtler animation for completed pick list items (shadow only, no scale)
- Rationale: Completed items have dashed borders and muted backgrounds; full scale animation would be too prominent for archived content. Subtle shadow enhancement maintains consistency while respecting visual hierarchy.

## 16) Confidence (one line)

Confidence: High — Changes are isolated visual enhancements with minimal risk, using established patterns and existing dependencies.

# Semantic Component Catalog

**Last Updated:** 2025-11-02

This catalog documents high-level semantic UI component opportunities identified across the codebase. Each entry represents a repeated pattern that could benefit from extraction into a reusable semantic component.

## Pattern Discovery Methodology

- **Search Strategy:** Multi-strategy approach combining file-name patterns (glob) and structural code search (grep)
- **Analysis Depth:** Minimum 3 instances per pattern (ideally 1 simple, 1 average, 1 complex)
- **Semantic Filter:** Patterns must have clear semantic meaning (describe what, not how)
- **Complexity Threshold:** Minimum "Medium" complexity or 3+ instances for "Low" complexity patterns

## Catalog Entries

---

### 1. Grid Tile Card (Entity Card with Actions)

**Category:** Card

**Semantic Meaning:** A clickable or actionable card that displays an entity summary in a grid layout, with consistent header/content structure and optional action buttons or indicators.

**Instance Count:** 6 core instances

**Files:**
- `/work/frontend/src/components/types/type-card.tsx` (45 lines, simple)
- `/work/frontend/src/components/sellers/seller-card.tsx` (54 lines, simple)
- `/work/frontend/src/components/boxes/box-card.tsx` (65 lines, medium)
- `/work/frontend/src/components/shopping-lists/overview-card.tsx` (103 lines, medium)
- `/work/frontend/src/components/kits/kit-card.tsx` (281 lines, complex)
- `/work/frontend/src/components/parts/part-card.tsx` (269 lines, complex - exported as PartListItem)

**Verification Commands:**
```bash
# Last verified: 2025-11-02
find src/components -name '*-card.tsx' -o -name '*card.tsx' | grep -E '(type|seller|box|kit|part|overview)' | wc -l
# Expected: 6 files (excluding metrics-card and seller-group-card)

# Verify grid-tile variant usage
grep -r 'variant="grid-tile"' src/components --include="*card*.tsx" | wc -l
# Expected: 6+ matches
```

**Common Pattern:**
All instances share:
- Card with `variant="grid-tile"` (or "grid-tile-disabled")
- Data attributes for testing (`data-testid`, often domain-specific data attributes)
- Entity object passed as primary prop
- Header section with title and optional metrics/badges
- Content section with additional details or actions

**Props Analysis:**

*Common Props (>80% of instances):*
- `entity: T` - The domain entity to display (type, box, kit, part, seller, shopping list)
- `data-testid: string` - Test identifier
- `variant: "grid-tile" | "grid-tile-disabled"` - Card style variant

*Optional Props (20-80% of instances):*
- `onClick?: () => void` - Click handler for card interaction (4/6 instances)
- `onEdit?: () => void` - Edit action callback (2/6 instances)
- `onDelete?: () => void` - Delete action callback (2/6 instances)
- `disabled?: boolean` - Disable interaction (2/6 instances)
- `secondaryData?: unknown` - Additional data for enrichment (typeMap, membership indicators)
- Status badges (3/6 instances)
- Membership indicators (2/6 instances - KitCard, PartListItem)

*Outlier Props (<20%):*
- Complex membership indicator state objects (only KitCard, PartListItem)
- Custom tooltip renderers (only KitCard, PartListItem)
- Cover image display (only PartListItem)
- Progress bars (only BoxCard)
- Metadata badges (only PartListItem)
- Vendor/location info (only PartListItem)
- Line counts and key-value badges (only ShoppingListOverviewCard)

**Proposed API:**

```typescript
interface GridTileCardProps<TEntity = unknown> {
  // Core props (required)
  entity: TEntity;
  testId: string;

  // Common optional props
  onClick?: () => void;
  disabled?: boolean;

  // Render slots for customization
  header: (entity: TEntity) => React.ReactNode;
  content?: (entity: TEntity) => React.ReactNode;
  actions?: (entity: TEntity) => React.ReactNode;
  badges?: (entity: TEntity) => React.ReactNode;

  // Accessibility
  ariaLabel?: string;
  role?: 'button' | 'article';
  tabIndex?: number;
}
```

**Complexity Reduction:** High

**Impact Score:** 30 (6 instances × 5 complexity weight)

**Implementation Notes:**

1. **High API Variance Risk:** The outlier props analysis reveals significant variance between simple cards (TypeCard: 45 lines) and complex cards (KitCard: 281 lines, PartListItem: 269 lines). The complex cards have very domain-specific features (membership indicators with tooltips, cover images, metadata badges).

2. **Recommendation: Render Slots Pattern:** Instead of trying to create a unified prop interface that handles all cases, use a render slots pattern where the component provides the card container structure and common behaviors (click handling, disabled state, test ID), but delegates content rendering to the parent. This maintains type safety while allowing customization.

3. **Alternative: Keep Domain-Specific Cards:** Given the high variance, it may be more valuable to extract smaller shared components (e.g., a reusable MembershipIndicator pattern is already in use) rather than trying to unify all cards into one abstraction. The current domain-specific cards may be the right level of abstraction.

4. **Design Decision Required:** Before implementing, evaluate whether the ROI justifies the abstraction. The simple cards (TypeCard, SellerCard) are only 45-54 lines and follow a clear pattern. The complex cards (KitCard, PartListItem) have substantial domain-specific logic that may not benefit from further abstraction.

5. **Keyboard Navigation:** Complex cards (BoxCard, ShoppingListOverviewCard, KitCard) implement keyboard navigation (Enter/Space to activate). Any abstraction must preserve this accessibility pattern.

---

### 2. Metrics Card (Dashboard Stats Display)

**Category:** Card

**Semantic Meaning:** A card that displays a single key metric or statistic with optional trend indicator and icon, typically used on dashboard screens.

**Instance Count:** 1

**Files:**
- `/work/frontend/src/components/dashboard/metrics-card.tsx` (49 lines)

**Verification Commands:**
```bash
# Last verified: 2025-11-02
find src/components -name 'metrics-card.tsx' | wc -l
# Expected: 1 file

# Check for stats variant usage (may indicate other metrics cards)
grep -r 'variant="stats"' src/components --include="*.tsx" | wc -l
# Expected: 1 match (only metrics-card.tsx)
```

**Common Pattern:**
- Card with `variant="stats"`
- Title (label) + Value (number or string) + Icon
- Optional trend indicator (percentage with up/down arrow)
- Optional subtitle
- Horizontal layout with value on left, icon on right

**Props Analysis:**

*Common Props (100% - single instance):*
- `title: string` - Metric label
- `value: number | string` - Metric value
- `icon: string` - Icon/emoji to display
- `trend?: { value: number; isPositive: boolean }` - Trend indicator
- `subtitle?: string` - Additional context

**Proposed API:**

```typescript
interface MetricsCardProps {
  title: string;
  value: number | string;
  icon: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  subtitle?: string;
  testId?: string;
}
```

**Complexity Reduction:** Low

**Impact Score:** N/A (Only 1 instance - not a candidate for extraction)

**Implementation Notes:**

**PATTERN REJECTED:** This component already exists and serves a specific semantic purpose (dashboard metrics). It is distinct from Grid Tile Cards (uses "stats" variant vs "grid-tile"). With only 1 instance, there is no pattern to extract. Keep this component as-is.

---

## Pattern Rejection Log

This section documents patterns that were explicitly considered but rejected from the catalog, with reasons.

### Rejected: SellerGroupCard as "Grid Tile Card"

- **File:** `/work/frontend/src/components/shopping-lists/ready/seller-group-card.tsx` (179 lines)
- **Reason:** This is not a grid tile card. It's a complex section/container component that displays a seller group with an embedded table of shopping list lines. Uses a `<div>` with border/shadow styling rather than the Card component's "grid-tile" variant. Semantically, this is a "data table section" or "grouped list container," not an entity card.
- **Evidence:** Uses `className="rounded-lg border border-border bg-card shadow-sm"` instead of `<Card variant="grid-tile">`. Contains a table with multiple rows, bulk actions, and edit dialogs. Does not fit the "card displays one entity" pattern.

### Rejected: FlexRow

- **Reason:** Describes layout (how), not meaning (what). Violates semantic principle. Layout utilities like flex containers are too low-level for this catalog.
- **Evidence:** From initial research findings and user feedback about avoiding CSS/layout primitives.

### Rejected: ActionButtonGroup

- **Reason:** User feedback indicates it creates composition overhead without semantic value. Too low-level.
- **Evidence:** From research log: "User expressed concern that low-level components like ActionButtonGroup are too simple and create composition overhead."
- **Context:** Only provides a flex container for buttons. Simple cards (TypeCard, SellerCard) inline their button groups with `<div className="flex space-x-2">` (7 lines total). Abstracting this adds a component import without clear semantic benefit.

---

---

## Dialog Patterns Analysis

### Existing High-Level Abstraction: ConfirmDialog

**Status:** ✅ Already Implemented

**Location:** `/work/frontend/src/components/ui/dialog.tsx` (lines 181-235)

**Semantic Meaning:** A confirmation dialog with title, description, and confirm/cancel actions. Supports both standard and destructive confirmation flows.

**Usage Count:** 1 implementation, likely multiple usage sites across the codebase

**Implementation Notes:**
- This is a successful example of a high-level semantic abstraction
- Provides a complete dialog experience with minimal props
- Handles common confirm/cancel pattern
- Supports destructive vs. non-destructive styling

**Verification Commands:**
```bash
# Last verified: 2025-11-02
grep -r 'ConfirmDialog' src/ --include="*.tsx" | wc -l
# Tracks usage across codebase
```

---

### Form Dialog Pattern (Composition Pattern)

**Category:** Dialog

**Pattern Type:** Composition (Not a candidate for further abstraction)

**Instance Count:** 14+ files

**Files:**
- `/work/frontend/src/components/kits/kit-create-dialog.tsx` (342 lines, complex)
- `/work/frontend/src/components/kits/kit-metadata-dialog.tsx` (edit variant, complex)
- `/work/frontend/src/components/sellers/seller-create-dialog.tsx` (169 lines, medium)
- `/work/frontend/src/components/types/type-create-dialog.tsx` (75 lines, simple)
- `/work/frontend/src/components/shopping-lists/ready/order-line-dialog.tsx` (edit variant)
- `/work/frontend/src/components/shopping-lists/list-create-dialog.tsx`
- `/work/frontend/src/components/kits/kit-pick-list-create-dialog.tsx`
- `/work/frontend/src/components/kits/kit-shopping-list-dialog.tsx`
- `/work/frontend/src/components/shopping-lists/ready/update-stock-dialog.tsx`
- `/work/frontend/src/components/shopping-lists/ready/seller-group-order-note-dialog.tsx`
- `/work/frontend/src/components/shopping-lists/ready/order-group-dialog.tsx`
- `/work/frontend/src/components/parts/ai-part-dialog.tsx`
- `/work/frontend/src/components/shopping-lists/part/add-to-shopping-list-dialog.tsx`

**Verification Commands:**
```bash
# Last verified: 2025-11-02
find src/components -name '*dialog*.tsx' | grep -v 'src/components/ui/dialog.tsx' | wc -l
# Expected: 13-15 files
```

**Common Pattern:**
All form dialogs follow this composition:
1. `<Dialog>` wrapper with open/onOpenChange
2. `<DialogContent>` with test ID
3. `<Form>` element with onSubmit
4. `<DialogHeader>` with `<DialogTitle>`
5. Form fields section with `<FormField>`, `<FormLabel>`, `<Input>` (or other controls)
6. `<DialogFooter>` with Cancel (outline) + Submit (primary) buttons
7. Form state management via `useFormState`
8. Instrumentation via `useFormInstrumentation`
9. Validation rules (inline or extracted)
10. Loading/disabled states tied to submission

**Props Analysis:**

*Common across all instances:*
- `open: boolean`
- `onOpenChange: (open: boolean) => void`
- `onSuccess: (result: T) => void` or `onSubmit: (data: T) => Promise<void>`

*High Variance:*
- Number of form fields (2-10+)
- Validation complexity (simple required checks vs. complex business rules)
- Initial values (empty vs. prefilled for edit dialogs)
- Entity-specific data (kit, seller, part, shopping list, etc.)
- Custom instrumentation snapshots
- Optimistic updates and cache invalidation logic

**PATTERN ANALYSIS: Keep as Composition**

**Rationale:**
1. **High Semantic Variance:** "Create Kit," "Edit Seller," "Order Line," and "Add to Shopping List" are semantically distinct operations. Each has unique business logic, validation rules, and field requirements.

2. **Existing Component Building Blocks Work Well:** The current composition of `Dialog` + `Form` + `FormField` components provides the right level of abstraction. Each form dialog is only 75-350 lines, which is reasonable for a complete feature.

3. **Low Duplication:** While structure is similar, actual content varies significantly. Abstracting further would require complex render props or slot patterns that add more complexity than they remove.

4. **TypeScript Challenge:** A generic "FormDialog" would struggle with type safety—each form has different field shapes, validation rules, and submission payloads. Maintaining type safety would require complex generics that obscure rather than clarify.

5. **Instrumentation Varies:** Each form has domain-specific instrumentation requirements (what fields to snapshot, what counts as "success"). This cannot be easily abstracted.

**Conclusion:** Form dialogs are best kept as domain-specific components that compose lower-level building blocks. The existing Dialog, Form, and Field components already provide good semantic primitives. No new abstraction recommended.

---

---

## List/Table Patterns Analysis

### Existing High-Level Abstraction: ListScreenLayout

**Status:** ✅ Already Implemented

**Location:** `/work/frontend/src/components/layout/list-screen-layout.tsx` (101 lines)

**Semantic Meaning:** A consistent layout shell for list/grid screens with sticky header (breadcrumbs, title, actions, search, tabs, counts) and scrollable content area.

**Usage Count:** Used across all major list screens (kits, parts, types, sellers, boxes, shopping lists, pick lists)

**Implementation Notes:**
- Excellent example of a high-level semantic abstraction
- Uses render slots pattern (breadcrumbs, title, actions, search, segmentedTabs, counts, children)
- Provides consistent UX across all list screens
- Handles sticky header behavior and scroll management

**Verification Commands:**
```bash
# Last verified: 2025-11-02
grep -r 'ListScreenLayout' src/components --include="*.tsx" | wc -l
# Tracks usage across list components
```

---

### Existing High-Level Abstraction: DescriptionList + DescriptionItem

**Status:** ✅ Already Implemented

**Location:** `/work/frontend/src/components/ui/description-list.tsx` (165 lines)

**Semantic Meaning:** A reusable pattern for displaying label-value pairs with consistent spacing and styling variants (default, prominent, compact, muted).

**Usage Count:** Used across detail screens and info panels

**Implementation Notes:**
- Clean semantic API with variant system
- Supports custom rendering via children
- Optional icon support
- Well-documented with examples

**Verification Commands:**
```bash
# Last verified: 2025-11-02
grep -r 'DescriptionList\|DescriptionItem' src/ --include="*.tsx" | wc -l
# Tracks usage across components
```

---

### Entity List Pattern (Composition Pattern)

**Category:** List/Grid

**Pattern Type:** Composition (Not a candidate for further abstraction)

**Instance Count:** 7+ major entity list components

**Files:**
- `/work/frontend/src/components/kits/kit-overview-list.tsx`
- `/work/frontend/src/components/parts/part-list.tsx`
- `/work/frontend/src/components/types/type-list.tsx`
- `/work/frontend/src/components/sellers/seller-list.tsx`
- `/work/frontend/src/components/boxes/box-list.tsx`
- `/work/frontend/src/components/shopping-lists/overview-list.tsx`
- (+ pick list and other domain-specific lists)

**Verification Commands:**
```bash
# Last verified: 2025-11-02
find src/components -name '*-list.tsx' -o -name '*-overview-list.tsx' | wc -l
# Expected: 7-10 files
```

**Common Pattern:**
All entity lists follow this composition:
1. Use `ListScreenLayout` for page structure
2. Fetch data via custom hooks (useGetKits, useGetParts, etc.)
3. Implement search/filtering logic (varies by entity)
4. Render grid of domain-specific cards (KitCard, PartCard, etc.)
5. Use `ListScreenCounts` for count display
6. Use `useListLoadingInstrumentation` for test instrumentation
7. Handle loading states (Skeleton), errors (Alert/EmptyState), and empty states (EmptyState)

**High Variance:**
- Query hooks (entity-specific)
- Filtering logic (simple name match vs. complex multi-field search)
- Card components (each entity has unique display requirements)
- Additional features (tabs for status filtering, inline creation forms, membership indicators)
- Sort logic (alphabetical, date-based, custom)

**PATTERN ANALYSIS: Keep as Composition**

**Rationale:**
1. **ListScreenLayout Already Provides High-Level Structure:** The layout abstraction handles the common page structure. List content is inherently domain-specific.

2. **Filtering Logic Varies Significantly:** TypeList filters by name only; PartList filters by ID, description, manufacturer code, type, and tags. Abstracting this would require complex configuration that obscures rather than clarifies.

3. **Card Components Are Entity-Specific:** Each entity card has unique props, displays different information, and supports different interactions. These cannot be unified without losing semantic clarity.

4. **Additional Features Are Domain-Specific:** Kit lists have status tabs, type lists have inline creation, part lists have complex membership indicators. These features don't generalize.

**Conclusion:** Entity lists are best kept as domain-specific components that use the `ListScreenLayout` abstraction and compose domain-specific cards and hooks. The existing abstractions (ListScreenLayout, ListScreenCounts, useListLoadingInstrumentation) provide appropriate building blocks. No new abstraction recommended.

---

---

## Form and Detail Screen Patterns Analysis

### Existing High-Level Abstraction: DetailScreenLayout

**Status:** ✅ Already Implemented

**Location:** `/work/frontend/src/components/layout/detail-screen-layout.tsx` (150 lines)

**Semantic Meaning:** A consistent layout shell for detail/view screens with fixed header (breadcrumbs, title, description, metadata, actions) and optional toolbar, scrollable main content, and optional footer.

**Usage Count:** Used across entity detail screens (kits, parts, boxes, pick lists, shopping lists)

**Implementation Notes:**
- Excellent high-level semantic abstraction
- Comprehensive render slots for all common detail screen sections
- Handles scroll behavior with fixed header/footer
- Flexible metadata and supplementary content areas

**Verification Commands:**
```bash
# Last verified: 2025-11-02
grep -r 'DetailScreenLayout' src/ --include="*.tsx" | wc -l
# Tracks usage across detail components
```

---

### Existing High-Level Abstraction: FormScreenLayout

**Status:** ✅ Already Implemented

**Location:** `/work/frontend/src/components/layout/form-screen-layout.tsx` (103 lines)

**Semantic Meaning:** A consistent layout shell for full-page form screens with fixed header and footer, scrollable form content area, and card chrome styling.

**Usage Count:** Used across entity create/edit forms

**Implementation Notes:**
- Clean semantic layout for form-heavy screens
- Wraps content in Card component for visual consistency
- Pinned header and footer with scrollable form body
- Consistent with other screen layout patterns

**Verification Commands:**
```bash
# Last verified: 2025-11-02
grep -r 'FormScreenLayout' src/ --include="*.tsx" | wc -l
# Tracks usage across form components
```

---

### Form Components (Existing Primitives)

**Status:** ✅ Already Implemented

**Location:** `/work/frontend/src/components/ui/form.tsx`

**Analysis:** The codebase already has well-designed form primitives:
- `Form` - Form wrapper with semantic HTML
- `FormField` - Field container with consistent spacing
- `FormLabel` - Label with required indicator support
- `Input` - Text input with error state
- Various field-specific components (textarea, select, etc.)
- `useFormState` hook - Form state management with validation

These primitives are composed into domain-specific form components (part-form, box-form, seller-form, type-form). Like form dialogs, these domain-specific forms have high variance in fields, validation, and business logic. The existing primitives provide the right level of abstraction.

**Conclusion:** Form primitives and FormScreenLayout provide appropriate building blocks. No new abstraction recommended.

---

### Detail Screen Components (Composition Pattern)

**Analysis:** Detail screens (kit-detail, part-details, box-details, pick-list-detail) use DetailScreenLayout and compose domain-specific content:
- Entity-specific metadata (DescriptionList with domain-specific fields)
- Domain-specific panels and sections
- Entity-specific actions and toolbars

Each detail screen is inherently domain-specific. DetailScreenLayout and DescriptionList provide the necessary abstractions.

**Conclusion:** No new abstraction recommended.


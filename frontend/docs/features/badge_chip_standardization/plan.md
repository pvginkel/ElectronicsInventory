# Badge and Chip Standardization – Technical Plan

## 0) Research Log & Findings

### Discovery Summary

Searched across all detail view components (kit, pick list, shopping list, part, box) to understand current badge and chip implementations. Found three nearly-identical badge wrapper components that format `<key>: <value>` badges:

- `DetailBadge` in src/components/pick-lists/pick-list-detail.tsx:389-399
- `SummaryBadge` in src/components/kits/kit-detail.tsx:569-579
- `GroupSummaryBadge` in src/components/pick-lists/pick-list-lines.tsx:346-352

All three accept `{ label, value, className, testId }` and render `<Badge variant="outline">`. This duplication confirms the need for abstraction.

### Current Badge Placement Patterns

**Kit Detail** (src/components/kits/kit-detail-header.tsx):
- titleMetadata: Status badge + Build target badge (lines 177-195)
- metadataRow: Shopping list link chips (lines 201-241)

**Pick List Detail** (src/components/pick-lists/pick-list-detail.tsx):
- titleMetadata: Status badge only (line 185-192) ✓ CORRECT
- metadataRow: DetailBadge for Requested units, Total lines, Open lines, Remaining quantity (lines 194-221)

**Shopping List Detail** (src/components/shopping-lists/detail-header-slots.tsx):
- titleMetadata: Status badge only (lines 214-222) ✓ CORRECT
- metadataRow: Total/New/Ordered/Completed badges + Kit link chips (lines 228-290)

**Part Detail** (src/components/parts/part-details.tsx):
- titleMetadata: ID badge only (lines 754-756) ✓ CORRECT
- metadataRow in header: Type badge + Created date (lines 258-265)
- Body content (below header): Shopping list chips + Kit chips (lines 454-460, 379-414) ✓ TARGET PATTERN

**Box Detail** (src/components/boxes/box-details.tsx):
- No titleMetadata ✓ CORRECT (boxes don't have status)
- metadataRow: Capacity + Usage badges + Updated date (lines 174-184)

### Link Chip Components

Two standardized chip components found:
- `ShoppingListLinkChip` (src/components/shopping-lists/shopping-list-link-chip.tsx): Pill-shaped, icon + name + status badge, optional unlink button
- `KitLinkChip` (src/components/kits/kit-link-chip.tsx): Pill-shaped, icon + name + status badge

Both use consistent styling with rounded-full borders, hover states, and internal Link + Badge composition.

### Conflicts Resolved

- Part detail already follows the target pattern (chips below header in body content)
- Kit and shopping list detail views currently place chips in header metadataRow
- Pick list detail has no link chips (no misplacement issue)
- Build target badge in kit detail header needs to move to metadataRow

---

## 1) Intent & Scope

### User intent

Standardize badge and link chip visualization across all detail views to create a consistent visual language and clearer information hierarchy. Move link chips out of headers to match the part detail view pattern, restrict title-adjacent badges to key identifiers and status only, relocate all attribute badges to the detail-screen.metadata section, and abstract redundant badge wrapper components.

### Prompt quotes

"Move link chips out of headers to match part detail view placement"
"Restrict title-adjacent badges to key and status only"
"Move all attribute badges below title into detail-screen.metadata section"
"Standardize all badges to use `<key>: <value>` format with consistent colors"
"Abstract badge wrappers (DetailBadge, SummaryBadge, GroupSummaryBadge) into reusable components"

### In scope

- Move kit detail shopping list link chips from header metadataRow to body content section
- Move shopping list detail kit link chips from header metadataRow to body content section
- Move kit detail "Build target" badge from titleMetadata to metadataRow
- Create reusable `KeyValueBadge` component in src/components/ui to replace DetailBadge, SummaryBadge, GroupSummaryBadge
- Update all existing badge wrapper call sites to use the new unified component
- Ensure all attribute badges follow `<key>: <value>` format with consistent Tailwind color classes
- Define and implement standardized color palette for all badges (neutral, info, warning, success, danger)
- Remove empty state messages for missing link chips (render nothing when no chips exist)
- Update Playwright specs to reflect new chip placement outside headers and removed empty states

### Out of scope

- Altering chip component internal logic or accessibility features
- Modifying DetailScreenLayout component structure
- Refactoring tooltip infrastructure (separate outstanding change)
- Button label formatting updates (separate outstanding change)
- Adding new badge types or chip variants beyond standardization

### Assumptions / constraints

- DetailScreenLayout metadataRow slot remains stable and accepts ReactNode
- TanStack Router Link component behavior for chips is unchanged
- Playwright specs already use data-testid selectors that will continue to work after chip relocation
- No breaking changes to generated API hooks or backend contracts
- Tailwind color utility classes provide sufficient palette for standardization
- Badge wrapper abstraction can be completed without altering Badge base component
- Absence of link chips requires no UI affordance (no empty state message)

---

## 2) Affected Areas & File Map

### Badge Color Standardization

This plan introduces **two distinct badge components** with separate color palettes:

1. **KeyValueBadge** — Subtle colors for metrics and attributes (`<key>: <value>` format)
2. **StatusBadge** — Bold colors for entity state (single status label)

**KeyValueBadge Palette (Subtle):**

The following color scheme will be applied to metric/attribute badges:

| Semantic Role | Tailwind Classes | Usage |
|---------------|-----------------|--------|
| **Neutral** | `bg-slate-100 text-slate-700` | Default information, general metrics, counts (Total lines, Build target, Capacity) |
| **Info** | `bg-blue-100 text-blue-800` | Informational highlights (New items, waiting states) |
| **Warning** | `bg-amber-100 text-amber-800` | In-progress, open items, remaining work, shortfalls |
| **Success** | `bg-emerald-100 text-emerald-800` | Completed status, active status, success states |
| **Danger** | `bg-rose-100 text-rose-800` | Errors, critical shortfalls, destructive states |

**StatusBadge Palette (Bold):**

Entity status badges use saturated, high-contrast colors. The palette uses **3 colors** mapped from **7 status values**:

| Color Name | Tailwind Classes | Status Values | Semantic Meaning |
|------------|-----------------|---------------|------------------|
| **inactive** | `bg-slate-400 text-slate-700` | concept, done, archived | Planning phase, finished work, soft-deleted entities |
| **active** | `bg-blue-600 text-white` | ready, active, open | Work in progress, approved for action, current working set |
| **success** | `bg-emerald-600 text-white` | completed | Successfully finished tasks |

**Status-to-Color Mapping:**

| Status | Entity Types | Color | Usage |
|--------|-------------|-------|-------|
| **concept** | Shopping lists | inactive | Planning phase, not yet approved |
| **ready** | Shopping lists | active | Approved and ready to order |
| **active** | Kits | active | Current production kit |
| **open** | Pick lists | active | Pick task in progress |
| **done** | Shopping lists | inactive | Finished, no longer active |
| **archived** | Kits | inactive | Soft-deleted, hidden behind filter |
| **completed** | Pick lists | success | Successfully picked all parts |

**Color Migration Map:**

- **sky-100/sky-800** (shopping list "New" badge) → **blue-100/blue-800** (info) for KeyValueBadge
- All status badges migrate from inline Badge with scattered classes to StatusBadge component with bold palette

**Affected badge instances:**
- Kit detail: Build target (neutral), Total required (neutral), Shortfall (danger)
- Pick list detail: Requested units (neutral), Total lines (neutral), Open lines (warning), Remaining quantity (warning)
- Pick list line groups: Lines (neutral), Quantity to pick (neutral), Remaining (warning)
- Shopping list detail: Total (neutral), New (info), Ordered (warning), Completed (success)
- Box detail: Capacity (neutral), Usage (neutral or danger based on threshold)

### UI Components – Badge Wrappers (Create & Migrate)

**Area:** src/components/ui/key-value-badge.tsx
**Why:** New reusable component to replace DetailBadge, SummaryBadge, GroupSummaryBadge
**Evidence:** None (new file creation). Will standardize the pattern found at:
- src/components/pick-lists/pick-list-detail.tsx:389-399
- src/components/kits/kit-detail.tsx:569-579
- src/components/pick-lists/pick-list-lines.tsx:346-352

**Area:** src/components/ui/status-badge.tsx
**Why:** New reusable component for entity status badges (kit status, shopping list status, pick list status) with bolder color palette and larger size option
**Evidence:** None (new file creation). Will standardize status badge usage across detail views:
- Kit status badge: src/components/kits/kit-detail-header.tsx:188-192
- Shopping list status badge: src/components/shopping-lists/detail-header-slots.tsx:214-222
- Pick list status badge: src/components/pick-lists/pick-list-detail.tsx:185-192

**Area:** src/components/pick-lists/pick-list-detail.tsx
**Why:** Replace DetailBadge (lines 389-399) with KeyValueBadge; update import and usages (lines 196-219)
**Evidence:** Lines 196-219 call DetailBadge four times with label/value props

**Area:** src/components/kits/kit-detail.tsx
**Why:** Replace SummaryBadge (lines 569-579) with KeyValueBadge; update KitBOMSummary usages (lines 546-558)
**Evidence:** Lines 546-558 render two SummaryBadge instances for "Total required" and "Shortfall"

**Area:** src/components/pick-lists/pick-list-lines.tsx
**Why:** Replace GroupSummaryBadge (lines 346-352) with KeyValueBadge; update group metric badges (lines 116-133)
**Evidence:** Lines 116-133 render three GroupSummaryBadge instances per pick list group

### UI Components – Kit Detail Header

**Area:** src/components/kits/kit-detail-header.tsx
**Why:** Move "Build target" badge from titleMetadata (lines 186-193) to metadataRow; move shopping list chips from metadataRow (lines 203-236) to returned slot marked for body rendering; remove empty state message for missing links (lines 237-239)
**Evidence:** Lines 186-193 show Build target badge in titleMetadata; lines 203-236 render shopping list chips in metadataRow slot; lines 237-239 render empty state text

**Area:** src/components/kits/kit-detail.tsx
**Why:** Accept new `linkChips` slot from header and render below DetailScreenLayout in body content (similar to part detail pattern)
**Evidence:** Lines 170-196 call createKitDetailHeaderSlots and spread slots into DetailScreenLayout (lines 300-308). Need to extract chips for body rendering.

### UI Components – Shopping List Detail Header

**Area:** src/components/shopping-lists/detail-header-slots.tsx
**Why:** Move kit link chips from metadataRow (lines 269-288) to separate slot for body rendering; update "New" badge color from sky to blue (line 241); remove any empty state handling for missing kit chips
**Evidence:** Lines 269-288 conditionally render kit chips inside metadataRow when linkedKits.length > 0; line 241 uses sky-100/sky-800 colors

**Area:** src/routes/shopping-lists/$listId.tsx
**Why:** Accept new `linkChips` slot from header hook and render in body content below DetailScreenLayout
**Evidence:** Route file uses useShoppingListDetailHeaderSlots which returns metadataRow containing kit chips (detail-header-slots.tsx:228-290)

### UI Components – Box Detail (Already Compliant)

**Area:** src/components/boxes/box-details.tsx
**Why:** No changes needed; already uses "Capacity: X" and "Usage: X%" format (lines 176-179)
**Evidence:** Lines 176-179 show Badge usage with "Capacity: {box.capacity}" and "Usage: {usageStats.usagePercentage}%" already following <key>: <value> pattern

### Testing – Playwright Specs

**Area:** tests/e2e/kits/kit-detail.spec.ts
**Why:** Update selectors expecting shopping list chips in header to look in body content instead
**Evidence:** Grep found GroupSummaryBadge reference in this file; likely tests header badge presence

**Area:** tests/support/page-objects/kits-page.ts
**Why:** Update page object methods that reference chip placement in header metadataRow
**Evidence:** Grep found GroupSummaryBadge reference; page object may have locators tied to header structure

---

## 3) Data Model / Contracts

No new API contracts or data shapes required. This is a pure UI refactoring using existing component props and domain models.

**Entity / contract:** KeyValueBadge Props
**Shape:**
```typescript
interface KeyValueBadgeProps {
  label: string;
  value: string | number;
  color?: 'neutral' | 'info' | 'warning' | 'success' | 'danger';
  variant?: 'default' | 'outline' | 'secondary';
  testId: string;
}
```
**Mapping:** Component accepts semantic color names and maps them to the canonical palette (Section 2). The `color` prop is optional; when omitted, the badge renders with a subtle default style (`bg-slate-50 text-slate-700` or outline-only). This allows informational badges (Total lines, Capacity) to remain visually quiet while badges conveying state (Open lines, Shortfall) use explicit semantic colors. The `variant` prop controls Badge visual style (outline, filled, etc.). **No className prop**—color abstraction is enforced to prevent Tailwind class soup at call sites.
**Evidence:** Pattern exists in three existing wrappers: pick-list-detail.tsx:389-399, kit-detail.tsx:569-579, pick-list-lines.tsx:346-352

**Entity / contract:** StatusBadge Props
**Shape:**
```typescript
interface StatusBadgeProps {
  status: 'active' | 'concept' | 'ready' | 'done' | 'archived' | 'open' | 'completed';
  size?: 'default' | 'large';
  testId: string;
}
```
**Mapping:** Component accepts entity status values and internally maps them to **3 colors** (inactive, active, success) from the bold palette (Section 2). The component centralizes the status-to-color mapping logic, so callers only need to pass the semantic status value. Status badges use saturated background colors with high contrast (e.g., `bg-blue-600 text-white` for active states, `bg-slate-400 text-slate-700` for inactive states) to emphasize entity state and distinguish from KeyValueBadge's subtle palette. The `size` prop allows larger badges for prominent placement (e.g., detail view title areas). **No className prop**—enforces the 3-color abstraction and prevents mixing status and metric badge styles.

**Internal color mapping**:
- concept, done, archived → **inactive** color
- ready, active, open → **active** color
- completed → **success** color

**Evidence:** Current status badge implementations:
- Kit: src/components/kits/kit-detail-header.tsx:188-192
- Shopping list: src/components/shopping-lists/detail-header-slots.tsx:214-222
- Pick list: src/components/pick-lists/pick-list-detail.tsx:185-192

**Entity / contract:** DetailScreenLayout props
**Shape:** `{ breadcrumbs?, title, titleMetadata?, description?, supplementary?, metadataRow?, actions?, children }`
**Mapping:** No changes. metadataRow continues to accept ReactNode; chips will be moved to children (body content).
**Evidence:** src/components/layout/detail-screen-layout.tsx:4-26

**Entity / contract:** createKitDetailHeaderSlots options
**Shape:** `{ kit?: KitDetail, isLoading, overviewStatus, overviewSearch?, onEditMetadata?, onOrderStock?, ... }`
**Mapping:** Will return an additional `linkChips` ReactNode in the slots object for rendering outside header.
**Evidence:** src/components/kits/kit-detail-header.tsx:10-30

**Entity / contract:** useShoppingListDetailHeaderSlots return
**Shape:** `{ slots: ShoppingListDetailHeaderSlots, overlays: ReactNode | null }`
**Mapping:** Will extend `slots` with `linkChips` field for body rendering.
**Evidence:** src/components/shopping-lists/detail-header-slots.tsx:25-38

---

## 4) API / Integration Surface

No backend API changes. All data fetching hooks remain unchanged:

**Surface:** useKitDetail, useKitContents
**Inputs:** kitId
**Outputs:** KitDetail with shoppingListLinks array
**Errors:** Existing toast/error boundaries handle failures
**Evidence:** src/components/kits/kit-detail.tsx:48-61

**Surface:** useGetShoppingListsKitsByListId
**Inputs:** { path: { list_id } }
**Outputs:** Kit link data mapped via mapShoppingListKitLinks
**Errors:** Handled by useListLoadingInstrumentation
**Evidence:** src/components/shopping-lists/detail-header-slots.tsx:124-155

**Surface:** usePartShoppingListMemberships, usePartKitMemberships
**Inputs:** partId
**Outputs:** Membership summaries with list/kit details
**Errors:** Inline error UI with retry button (part-details.tsx:333-362)
**Evidence:** src/components/parts/part-details.tsx:55-67

### Playwright Factory Extensions

**Required for deterministic test coverage:** Existing kit and shopping list factories (**tests/api/factories/kit-factory.ts** and **tests/api/factories/shopping-list-factory.ts**) do not currently expose helpers for linking kits ↔ shopping lists. Slices 4 and 5 require the following backend coordination:

**Kit Factory Extension (tests/api/factories/kit-factory.ts):**
- `linkShoppingList(kitId: number, listId: number): Promise<void>` — Creates kit → shopping list link via `POST /api/kits/{kit_id}/shopping-lists/{list_id}/link` (or equivalent backend endpoint)
- `createWithShoppingListLinks(options: { ...KitCreateOptions, shoppingListIds: number[] }): Promise<KitResponseSchema>` — Helper that creates a kit and links the specified shopping list IDs in one call

**Shopping List Factory Extension (tests/api/factories/shopping-list-factory.ts):**
- Current factory supports `createListWithLines` but no kit linking helper. Add:
- `linkToKit(listId: number, kitId: number): Promise<void>` — Creates shopping list → kit link via backend API

**Backend API Requirement:** If the backend does not yet expose kit ↔ shopping list linking endpoints for test setup (POST /api/kits/{kit_id}/shopping-lists/{list_id}/link or similar), those endpoints must be added before Slices 4-5 can ship complete Playwright coverage per AGENTS.md policy (playwright_developer_guide.md:14 "API-first data setup")

**Evidence:** tests/api/factories/kit-factory.ts:1-224 (no linkShoppingList helper), tests/api/factories/shopping-list-factory.ts:1-220 (no linkToKit helper)

---

## 5) Algorithms & UI Flows

### Flow: Kit Detail Render with Link Chips Below Header

**Steps:**
1. Component fetches kit detail via useKitDetail hook
2. createKitDetailHeaderSlots builds header slots and returns separate `linkChips` slot
3. DetailScreenLayout renders header with titleMetadata (status badge only) and metadataRow (attribute badges)
4. KitDetailLoaded renders `linkChips` slot in body content before BOM card
5. User sees status next to title, attributes in header metadata row, and link chips in scrollable body

**States / transitions:** isLoading → pending header skeleton + body skeleton; hasError → error card in body; success → full header + chips in body + BOM table

**Hotspots:** Shopping list link chip unlink action must continue to work when chips move; ensure event handlers (handleUnlinkRequest) remain bound correctly

**Evidence:** src/components/kits/kit-detail.tsx:170-196, 293-308

### Flow: Shopping List Detail Render with Kit Chips Below Header

**Steps:**
1. Component fetches list detail and kit links via useShoppingListDetailHeaderSlots
2. Hook queries useGetShoppingListsKitsByListId for linked kits
3. Hook returns `slots.linkChips` containing kit chip elements separate from metadataRow
4. Route component renders DetailScreenLayout with header slots
5. Route renders `linkChips` in body content section before shopping list lines table

**States / transitions:** Loading → skeleton chips in body; error → inline error message; ready → clickable kit chips with status badges

**Hotspots:** TanStack Query cache invalidation for kit links must trigger chip re-render in body; instrumentation scope 'shoppingLists.detail.kits' must reflect chip presence

**Evidence:** src/components/shopping-lists/detail-header-slots.tsx:124-155, 269-288

### Flow: KeyValueBadge Component Render

**Steps:**
1. Parent component imports KeyValueBadge from src/components/ui
2. Parent passes `{ label, value, variant?, color?, testId }` where color is optional semantic value ('neutral' | 'info' | 'warning' | 'success' | 'danger')
3. KeyValueBadge maps color prop to standardized Tailwind classes from canonical palette (Section 2). If color is omitted, component applies subtle default styling.
4. KeyValueBadge renders `<Badge variant={variant ?? 'outline'}>{label}: {value}</Badge>` with color classes applied via internal mapping
5. Badge displays with consistent `<key>: <value>` format and standardized color
6. **No className prop**—color abstraction enforces semantic palette usage and prevents Tailwind class soup at call sites

**States / transitions:** No internal state; pure presentational component

**Hotspots:** Color mapping must be centralized in KeyValueBadge component; default styling must be subtle enough for informational badges (Total lines, Capacity) while semantic colors (warning, danger) remain visually distinct

**Evidence:** Pattern exists in three wrapper components at pick-list-detail.tsx:389-399, kit-detail.tsx:569-579, pick-list-lines.tsx:346-352

### Flow: StatusBadge Component Render

**Steps:**
1. Parent component imports StatusBadge from src/components/ui
2. Parent passes `{ status, size?, testId }` where status is entity state ('active' | 'concept' | 'ready' | 'done' | 'archived' | 'open' | 'completed')
3. StatusBadge internally maps status to one of **3 color names** (inactive, active, success) using centralized mapping:
   - concept, done, archived → inactive
   - ready, active, open → active
   - completed → success
4. StatusBadge maps color name to Tailwind classes (inactive = `bg-slate-400 text-slate-700`, active = `bg-blue-600 text-white`, success = `bg-emerald-600 text-white`)
5. StatusBadge maps size prop to text size and padding classes ('default' vs 'large')
6. StatusBadge renders `<Badge className={colorClasses + sizeClasses}>{statusLabel}</Badge>` where statusLabel is human-readable text (e.g., 'active' → 'Active', 'concept' → 'Concept')
7. Badge displays with bold background color for maximum visibility
8. **No className prop**—status abstraction enforces 3-color palette and prevents mixing status and metric badge styles

**States / transitions:** No internal state; pure presentational component

**Hotspots:** Status-to-color mapping must be centralized in StatusBadge component (7 statuses → 3 colors); bold palette must visually distinguish status badges from KeyValueBadge metric badges; size prop must provide meaningful scaling for title vs inline usage

**Evidence:** Current status badge implementations:
- Kit: src/components/kits/kit-detail-header.tsx:188-192
- Shopping list: src/components/shopping-lists/detail-header-slots.tsx:214-222
- Pick list: src/components/pick-lists/pick-list-detail.tsx:185-192

---

## 6) Derived State & Invariants

### Derived value: Kit detail – hasShoppingLists
- **Source:** Derived from `sortedShoppingLinks.length > 0` where sortedShoppingLinks is computed by `sortShoppingLinks(kit.shoppingListLinks)` (kit-detail-header.tsx:139-140). The `sortShoppingLinks` helper (lines 176-185) **does not filter** the array—it only sorts by status (concept → ready → done) then name (alphabetical). All shopping list links are included regardless of status.
- **Writes / cleanup:** Determines whether to render link chips section in body content (Slice 4). When false, no chips section renders and no empty state message renders.
- **Guards:** Conditional rendering checks `hasShoppingLists` (i.e., `sortedShoppingLinks.length > 0`) before rendering chip container in body. No feature flags or status-based filtering applied.
- **Invariant:** `hasShoppingLists` must remain true whenever `kit.shoppingListLinks.length > 0`, regardless of link status. If future requirements add status-based filtering to `sortShoppingLinks` (e.g., hide 'done' lists), this invariant will break and chip visibility logic must be updated to use the unfiltered source.
- **Evidence:** src/components/kits/kit-detail-header.tsx:139-140 (sortedShoppingLinks derivation), 176-185 (sortShoppingLinks implementation—sorts but does not filter)

### Derived value: Shopping list detail – linkedKits
- **Source:** Mapped from kitsQuery.data via mapShoppingListKitLinks (detail-header-slots.tsx:129)
- **Writes / cleanup:** Drives conditional rendering of kit chips in body; triggers instrumentation metadata updates
- **Guards:** isLoading state shows skeleton; linkedKits.length > 0 determines chip section visibility
- **Invariant:** Kit link count in instrumentation metadata (line 138) must match rendered chip count in body
- **Evidence:** src/components/shopping-lists/detail-header-slots.tsx:129, 138, 269-288

### Derived value: Pick list detail – attribute badges
- **Source:** Computed from detail.requestedUnits, detail.lineCount, detail.openLineCount, detail.remainingQuantity (pick-list-detail.tsx:197-220)
- **Writes / cleanup:** No side effects; purely presentational
- **Guards:** detail existence check before rendering badges
- **Invariant:** Badge labels must remain `<key>: <value>` format when migrating to KeyValueBadge
- **Evidence:** src/components/pick-lists/pick-list-detail.tsx:194-221

---

## 7) State Consistency & Async Coordination

### Source of truth: TanStack Query cache

Kit detail shopping list links and shopping list kit links are fetched via generated hooks and cached by TanStack Query. Link chips render from this cached data.

**Coordination:** When kit or shopping list is updated/refetched, query invalidation triggers re-render of chips in body content. No additional state synchronization needed.

**Async safeguards:** useKitDetail and useGetShoppingListsKitsByListId handle loading/error states. Chips display skeleton or error UI accordingly.

**Instrumentation:** useListLoadingInstrumentation tracks 'kits.detail' and 'shoppingLists.detail.kits' scopes. Instrumentation metadata includes link counts and IDs. After chip relocation, verify test events still emit with correct metadata.

**Evidence:**
- src/components/kits/kit-detail.tsx:72-102 (instrumentation for kit detail and links)
- src/components/shopping-lists/detail-header-slots.tsx:131-155 (instrumentation for kit links)

---

## 8) Errors & Edge Cases

### Failure: Kit detail query fails to load shopping list links

- **Surface:** Kit detail header and body
- **Handling:** Header metadataRow shows empty state message; body content does not render link chips section
- **Guardrails:** useKitDetail hook returns undefined for detail; header slots return empty state; body checks detail existence before rendering chips
- **Evidence:** src/components/kits/kit-detail-header.tsx:116-133 (not found state)

### Failure: Shopping list kit links query fails

- **Surface:** Shopping list detail body
- **Handling:** useGetShoppingListsKitsByListId returns error; instrumentation emits error event; body renders error message or omits chip section
- **Guardrails:** kitsQuery.isLoading and kitsQuery.error states handled by conditional rendering (detail-header-slots.tsx:264-268)
- **Evidence:** src/components/shopping-lists/detail-header-slots.tsx:131-155

### Failure: Unlink shopping list mutation fails

- **Surface:** Kit detail link chip unlink button
- **Handling:** Toast notification shows error; chip remains visible; mutation error captured in catch block
- **Guardrails:** unlinkMutation.isPending disables all unlink buttons during operation; 404 response treated as success with noop flag
- **Evidence:** src/components/kits/kit-detail.tsx:204-242

### Edge case: Empty link arrays

- **Surface:** Kit detail with no shopping lists; shopping list with no kits
- **Handling:** Render nothing (no chips, no empty state message); part detail retains its existing empty state pattern
- **Guardrails:** hasShoppingLists and linkedKits.length checks gate rendering; when false, no DOM elements rendered
- **Evidence:**
  - Kit: src/components/kits/kit-detail-header.tsx:236-240 (empty state message to be removed)
  - Shopping list: src/components/shopping-lists/detail-header-slots.tsx:269 (conditional rendering ensures no empty state)
  - Part: src/components/parts/part-details.tsx:367-376 (keeps existing empty state; not changed in this standardization)

---

## 9) Observability / Instrumentation

### Signal: ListLoading event – kits.detail scope

- **Type:** Instrumentation event
- **Trigger:** useListLoadingInstrumentation in kit-detail.tsx when query status/fetchStatus changes
- **Labels / fields:** { kitId, status, lineCount, contentsCount }
- **Consumer:** Playwright wait helpers, analytics
- **Evidence:** src/components/kits/kit-detail.tsx:72-80

### Signal: UiState event – kits.detail.links scope

- **Type:** Instrumentation event
- **Trigger:** useUiStateInstrumentation when link data is ready or errors
- **Labels / fields:** { kitId, hasLinkedWork, shoppingLists: { count, ids, statusCounts, renderLocation: 'body' } }
- **Consumer:** Playwright specs asserting link presence, test debugging
- **Update required:** After Slice 4 implementation, add `renderLocation: 'body'` field to metadata returned by `getLinksReadyMetadata` (kit-detail.tsx:92-94). This allows Playwright specs to assert chips render in body content and prevents regression if chips move back to header.
- **Evidence:** src/components/kits/kit-detail.tsx:92-102, 513-537

### Signal: ListLoading event – shoppingLists.detail.kits scope

- **Type:** Instrumentation event
- **Trigger:** useListLoadingInstrumentation for kit links query in detail-header-slots.tsx
- **Labels / fields:** { listId, kitLinkCount, statusCounts: { active, archived }, renderLocation: 'body' }
- **Consumer:** Playwright wait helpers for shopping list kit memberships
- **Update required:** After Slice 5 implementation, add `renderLocation: 'body'` field to metadata in `getReadyMetadata` callback (detail-header-slots.tsx:136-146). This documents chip placement for test assertions.
- **Evidence:** src/components/shopping-lists/detail-header-slots.tsx:131-155

### Signal: data-testid attributes on link chips

- **Type:** Test hook
- **Trigger:** Rendered on every chip component
- **Labels / fields:** Chip testId includes entity ID (e.g., `kits.detail.links.shopping.${link.shoppingListId}`)
- **Consumer:** Playwright selectors for clicking chips, asserting presence
- **Evidence:**
  - Kit detail: src/components/kits/kit-detail-header.tsx:230
  - Shopping list: src/components/shopping-lists/detail-header-slots.tsx:285
  - Part: src/components/parts/part-details.tsx:389, 399

---

## 10) Lifecycle & Background Work

No new lifecycle hooks or background work introduced. Existing useEffect hooks remain unchanged:

### Hook / effect: Kit detail metadata dialog state sync

- **Trigger cadence:** On mount and when detail.status changes
- **Responsibilities:** Close create pick list dialog if kit becomes archived
- **Cleanup:** None (setCreatePickListDialogOpen is state setter)
- **Evidence:** src/components/kits/kit-detail.tsx:198-202

### Hook / effect: Part detail document upload scroll

- **Trigger cadence:** When latestUploadedDocumentId changes after paste event
- **Responsibilities:** Scroll to and highlight newly uploaded document tile
- **Cleanup:** clearTimeout on unmount or re-trigger
- **Evidence:** src/components/parts/part-details.tsx:91-124

---

## 11) Security & Permissions

No security or permission changes. Link chips navigate to existing routes with same authorization checks:

**Concern:** Route-level access control for /kits/$kitId and /shopping-lists/$listId
**Touchpoints:** Kit and shopping list link chips use TanStack Router Link component
**Mitigation:** Backend enforces permissions; frontend assumes authenticated session
**Residual risk:** None introduced by chip relocation; existing route guards remain
**Evidence:** src/components/kits/kit-link-chip.tsx:54-62, src/components/shopping-lists/shopping-list-link-chip.tsx:94-102

---

## 12) UX / UI Impact

### Entry point: Kit detail view

- **Change:** Shopping list link chips move from header metadataRow to body content below header; "Build target" badge moves from titleMetadata to metadataRow
- **User interaction:** Users scroll less to see chips (they appear immediately below fold); title area cleaner with only status badge
- **Dependencies:** createKitDetailHeaderSlots returns new `linkChips` slot; KitDetail renders slot in body
- **Evidence:** src/components/kits/kit-detail-header.tsx:177-241

### Entry point: Shopping list detail view

- **Change:** Kit link chips move from header metadataRow to body content below header
- **User interaction:** Users see kit associations in scrollable body instead of fixed header
- **Dependencies:** useShoppingListDetailHeaderSlots returns new `linkChips` slot; route component renders in body
- **Evidence:** src/components/shopping-lists/detail-header-slots.tsx:228-290

### Entry point: Pick list detail view

- **Change:** DetailBadge replaced with KeyValueBadge; visual appearance unchanged
- **User interaction:** No functional change; consistent badge styling maintained
- **Dependencies:** KeyValueBadge component created; pick-list-detail.tsx import updated
- **Evidence:** src/components/pick-lists/pick-list-detail.tsx:196-219

### Entry point: All detail views using badge wrappers

- **Change:** SummaryBadge, DetailBadge, GroupSummaryBadge replaced with KeyValueBadge
- **User interaction:** No visual change; labels and colors preserved
- **Dependencies:** New KeyValueBadge component; all call sites updated
- **Evidence:** Multiple files (kit-detail.tsx:546-558, pick-list-lines.tsx:116-133)

---

## 13) Deterministic Test Plan

### Surface: Kit detail – shopping list link chips in body

**Scenarios:**
- **Given** kit with shopping list links, **When** viewing kit detail, **Then** chips appear in body content below header
- **Given** kit with no shopping lists, **When** viewing kit detail, **Then** no chip section renders (no empty state message)
- **Given** kit detail loading, **When** rendering, **Then** skeleton chips not rendered in header

**Instrumentation / hooks:**
- `data-testid="kits.detail.body"` for body container (existing)
- `data-testid="kits.detail.body.links"` for body link chips container (new—must be added in Slice 4)
- `data-testid="kits.detail.links.shopping.{listId}"` for each chip (existing testid, chip relocated from header)
- Wait for `UiState` event with scope 'kits.detail.links' phase 'ready' and assert `metadata.shoppingLists.renderLocation === 'body'`
- Backend hook: Use `testData.kits.createWithShoppingListLinks({ shoppingListIds: [list1.id, list2.id] })` to seed kit with links deterministically (factory extension required per Section 4)

**Gaps:** No existing Playwright assertions on empty state message "Link a shopping list to reserve parts..." found (grep result: no matches in tests/e2e/kits/). Safe to remove empty state without breaking tests.

**Evidence:** tests/e2e/kits/kit-detail.spec.ts (to be updated for new chip location)

### Surface: Shopping list detail – kit link chips in body

**Scenarios:**
- **Given** shopping list with kit links, **When** viewing list detail, **Then** chips appear in body below header
- **Given** shopping list with no kits, **When** viewing list detail, **Then** no chip section rendered in body

**Instrumentation / hooks:**
- **Body container testid:** `data-testid="shopping-lists.detail.body.kits"` (new—must be added in Slice 5)
- Individual chip testid: `data-testid="shopping-lists.concept.header.kits.{kitId}"` (existing testid, chip relocated from header; testid prefix will change from `.header.` to `.body.` for consistency)
- Wait for `ListLoading` event with scope 'shoppingLists.detail.kits' phase 'ready' and assert `metadata.renderLocation === 'body'`
- Backend hook: Use `testData.shoppingLists.createList()` then `testData.shoppingLists.linkToKit(listId, kitId)` to seed list with kit links deterministically (factory extension required per Section 4)
- **Integration point:** Shopping list route file (`src/routes/shopping-lists/$listId.tsx`) renders body content via `{contentNode}` at line 627. Link chips will render as a separate section before `{contentNode}` or inside a wrapper div.

**Gaps:** No existing spec file `tests/e2e/shopping-lists/shopping-list-detail.spec.ts` found. Slice 5 may require creating new spec or extending existing shopping list suite.

**Evidence:** src/routes/shopping-lists/$listId.tsx:627 (body content integration point)

### Surface: KeyValueBadge component

**Scenarios:**
- **Given** component receives label, value, className, testId, **When** rendered, **Then** displays `{label}: {value}` in Badge with custom classes
- **Given** component receives variant prop, **When** rendered, **Then** Badge uses specified variant

**Instrumentation / hooks:**
- `data-testid={testId}` passed through to Badge
- No dedicated test file needed; covered by parent component specs

**Gaps:** Storybook story for KeyValueBadge would help visual QA but is out of scope

**Evidence:** Component will follow existing Badge test patterns

### Surface: Kit detail – Build target badge moved to metadataRow

**Scenarios:**
- **Given** kit detail loaded, **When** viewing header, **Then** titleMetadata contains only status badge
- **Given** kit detail loaded, **When** viewing header, **Then** metadataRow contains Build target badge

**Instrumentation / hooks:**
- `data-testid="kits.detail.header.status"` for status badge
- `data-testid="kits.detail.badge.build-target"` for Build target badge (relocated)

**Gaps:** None

**Evidence:** tests/e2e/kits/kit-detail.spec.ts (will need assertion updates)

---

## 14) Implementation Slices

### Slice 1: Create KeyValueBadge and StatusBadge Components & Standardize Colors

**Goal:** Establish two reusable badge components with distinct color palettes (subtle for metrics, bold for status)
**Touches:**
- src/components/ui/key-value-badge.tsx (new file with subtle color palette constants)
- src/components/ui/status-badge.tsx (new file with bold status palette constants)
- src/components/ui/index.ts (export KeyValueBadge and StatusBadge)
- docs/contribute/ui_patterns.md or AGENTS.md (document both palettes and usage guidance; optional)

**Dependencies:** None; foundational components created first

### Slice 2: Migrate Badge Wrapper Call Sites and Status Badges with Color Updates

**Goal:** Replace DetailBadge, SummaryBadge, GroupSummaryBadge with KeyValueBadge; replace inline status badges with StatusBadge; apply standardized colors
**Touches:**
- src/components/pick-lists/pick-list-detail.tsx (migrate to KeyValueBadge for metrics, migrate to StatusBadge for status badge)
- src/components/kits/kit-detail.tsx (migrate to KeyValueBadge for metrics)
- src/components/kits/kit-detail-header.tsx (migrate to StatusBadge for kit status badge)
- src/components/pick-lists/pick-list-lines.tsx (migrate to KeyValueBadge for group metrics)
- src/components/shopping-lists/detail-header-slots.tsx (migrate to StatusBadge for list status badge; update "New" badge from sky to blue using KeyValueBadge)

**Dependencies:** Slice 1 complete; KeyValueBadge and StatusBadge components available

### Slice 3: Move Kit Detail Build Target Badge

**Goal:** Clean up kit title metadata to show only status badge
**Touches:**
- src/components/kits/kit-detail-header.tsx (move Build target badge from titleMetadata to metadataRow)
- tests/e2e/kits/kit-detail.spec.ts (update badge selector assertions to verify Build target badge exists in metadataRow, not titleMetadata)

**Dependencies:** None; independent UI change

**Playwright verification:** Add or update scenario: "Given active kit loaded, When viewing header, Then `data-testid='kits.detail.header.status'` exists in titleMetadata and `data-testid='kits.detail.badge.build-target'` exists in metadataRow (not in titleMetadata)"

### Slice 4: Move Kit Detail Link Chips to Body & Remove Empty State

**Goal:** Relocate shopping list chips from header to body content; remove empty state message
**Touches:**
- src/components/kits/kit-detail-header.tsx (return linkChips slot; remove empty state message at lines 237-239)
- src/components/kits/kit-detail.tsx (render linkChips slot in body before BOM card)
- tests/e2e/kits/kit-detail.spec.ts (update selectors; verify no empty state message)
- tests/support/page-objects/kits-page.ts (update locators)

**Dependencies:** Slices 1-3 complete; ensures header is fully standardized before chip relocation

### Slice 5: Move Shopping List Detail Link Chips to Body & Remove Empty State

**Goal:** Relocate kit chips from header to body content; ensure no empty state renders
**Touches:**
- src/components/shopping-lists/detail-header-slots.tsx (return linkChips slot; ensure conditional rendering omits empty state)
- src/routes/shopping-lists/$listId.tsx (render linkChips in body)
- Playwright specs for shopping list detail (update selectors; verify no empty state)

**Dependencies:** Slice 4 complete; follows same pattern as kit detail

---

## 15) Risks & Open Questions

### Risk: Playwright specs break due to chip relocation

- **Impact:** CI pipeline fails; tests must be fixed before merge
- **Mitigation:** Update all test selectors in same commit; verify specs pass locally before pushing

### Risk: Unlink action on relocated chips fails

- **Impact:** Users cannot remove shopping list links from kits
- **Mitigation:** Verify event handler binding after chip moves to body; test unlink flow in Playwright suite

### Risk: Instrumentation metadata becomes incorrect after chip relocation

- **Impact:** Test events report wrong link counts or placement
- **Mitigation:** Review getReadyMetadata functions for 'kits.detail.links' and 'shoppingLists.detail.kits' scopes; ensure metadata still reflects visible chips

### Risk: Color changes break visual semantics

- **Impact:** Users may misinterpret badge meanings after color migration (e.g., "New" badge changing from sky to blue)
- **Mitigation:** Limited palette ensures consistency; blue and sky are both "info" colors, semantic meaning preserved; app not yet in production so safe to change

### Risk: Removing empty state messages confuses users

- **Impact:** Users may wonder if data failed to load when no chips appear
- **Mitigation:** Part detail already demonstrates this pattern successfully; absence of chips in detail views is normal state; loading states still show skeletons; error states still show error UI

---

## 16) Confidence

**Confidence: High** — Research identified all affected files, badge wrappers follow identical patterns making abstraction straightforward, link chip relocation mirrors existing part detail implementation, no API or data model changes reduce risk. Color standardization improves consistency without breaking semantics. Empty state removal aligns with part detail pattern. Primary concerns are Playwright test updates and color migration verification, both deterministic and testable. App not yet in production reduces risk of user confusion from UI changes.

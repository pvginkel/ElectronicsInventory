# Fix Cursor Issues from TailwindCSS Upgrade

## 0) Research Log & Findings

**Investigation Areas**
- Examined the TailwindCSS v3 to v4 upgrade commit (7be7705) to identify cursor-related changes
- Reviewed component implementations: `kit-card.tsx`, `part-card.tsx`, `shopping-lists/overview-card.tsx`, `box-card.tsx`, `debounced-search-input.tsx`
- Analyzed `Card` component variant system in `src/components/ui/card.tsx`
- Reviewed Playwright test coverage in `tests/e2e/kits/kits-overview.spec.ts` and `tests/e2e/parts/part-list.spec.ts`

**Key Finding: Card Component Conditional Styling**
The upgrade commit introduced conditional cursor/hover styling to the `grid-tile` variant in `src/components/ui/card.tsx:19-21`:
```tsx
'grid-tile': onClick
  ? 'p-4 overflow-hidden transition-all duration-200 hover:shadow-md hover:scale-[1.02] hover:border-primary/50 active:scale-[0.98] cursor-pointer'
  : 'p-4 overflow-hidden',
```
This change made hover effects dependent on the Card receiving an `onClick` prop. Components that pass `onClick` (parts, shopping lists, boxes) display correctly; kit cards do not.

**Kit Card Implementation Gap**
`src/components/kits/kit-card.tsx:63-74` wraps a clickable div inside the Card but doesn't pass `onClick` to the Card itself. The inner div handles click/keyboard navigation but Card never receives the prop, so it renders without hover effects:
```tsx
<Card variant="grid-tile" ...>  {/* No onClick prop */}
  <div onClick={handleNavigate} onKeyDown={handleKeyDown}>
    {/* content */}
  </div>
</Card>
```

**Debounced Search Input Button**
`src/components/ui/debounced-search-input.tsx:107-115` renders a clear button with hover background but no `cursor-pointer` class. The button uses native HTML `<button>` element which should inherit pointer cursor, but it's missing an explicit class.

**Test Coverage**
- Parts search: `tests/e2e/parts/part-list.spec.ts:80` calls `clearSearch()` which clicks the clear button (`parts.list.search.clear`)
- Kits overview: `tests/e2e/kits/kits-overview.spec.ts` tests kit card interactions via indicator tooltips
- No explicit visual or hover state assertions exist for cursor styling (expected—Playwright doesn't validate CSS cursor property)

**Component Consistency Pattern**
Reviewing other card implementations:
- `part-card.tsx:50-56`: Uses variant ternary `variant={onClick ? 'grid-tile' : 'grid-tile-disabled'}` and passes `onClick` prop to Card component
- `box-card.tsx:26-36`: Uses variant ternary `variant={disabled ? "grid-tile-disabled" : "grid-tile"}` and passes `onClick={handleSelect}` to Card component
- `kit-card.tsx:63-74`: Does NOT use variant ternary or pass `onClick` to Card (inconsistent)

**Recommended Pattern**
Based on PartListItem and BoxCard precedent, KitCard should:
1. Use variant ternary: `variant={onOpenDetail ? 'grid-tile' : 'grid-tile-disabled'}`
2. Pass onClick to Card: `onClick={() => onOpenDetail?.(kit.id)}`
3. Remove inner div handlers (role, tabIndex, onClick, onKeyDown) since Card handles focus and events

## 1) Intent & Scope

**User intent**

Fix two cursor-related styling regressions introduced by the TailwindCSS v4 upgrade: the search clear button no longer shows a pointer cursor, and kit cards no longer display pointer cursor or hover animations that other entity cards (parts, shopping lists, storage) correctly show.

**Prompt quotes**

"The clear button on the search box (shown when text is entered) on the part and kit list views no longer displays a pointer cursor on hover."

"Kit cards on the kit list view no longer show a pointer cursor and hover animation."

"Kit cards should show a pointer cursor and hover animation, matching the behavior of part, shopping list, and storage cards."

**In scope**

- Add `cursor-pointer` class to the clear button in `debounced-search-input.tsx`
- Update `kit-card.tsx` to pass `onClick` prop to Card and use variant ternary pattern (`variant={onOpenDetail ? 'grid-tile' : 'grid-tile-disabled'}`) matching PartListItem implementation
- Remove redundant inner div onClick/onKeyDown handlers since Card component handles both mouse and keyboard interactions
- Verify existing Playwright tests still pass (no instrumentation changes required)
- Manual visual verification of cursor states on both affected components with detailed success criteria

**Out of scope**

- Changing the Card component's conditional logic (working as designed for other components)
- Refactoring kit card navigation pattern to match other cards (out of scope for this fix)
- Adding new Playwright assertions for cursor styles (not feasible—CSS cursor property isn't programmatically testable in browser automation)
- Modifying other card components (they already work correctly)
- Updating instrumentation or test-event taxonomy (no behavioral changes)

**Assumptions / constraints**

- The Card component's conditional `onClick` pattern is the correct design; kit-card must adapt to it
- Existing Playwright tests for kit overview and parts search already cover the interaction surfaces; they'll continue passing with visual-only fixes
- Manual QA is acceptable for cursor validation since automated hover state testing is impractical

## 2) Affected Areas & File Map

- Area: DebouncedSearchInput clear button
- Why: Missing explicit `cursor-pointer` class on the button element
- Evidence: `src/components/ui/debounced-search-input.tsx:107-115` — button renders with hover background transition but no pointer cursor class

- Area: KitCard component
- Why: Does not pass `onClick` to Card and uses different pattern than PartListItem, causing Card to skip hover/cursor styles
- Evidence: `src/components/ui/card.tsx:19-21` — grid-tile variant conditionally applies hover effects only when `onClick` is present; `src/components/kits/kit-card.tsx:63-74` — Card receives `variant="grid-tile"` but no `onClick` prop; `src/components/parts/part-card.tsx:52` — PartListItem uses variant ternary pattern `variant={onClick ? 'grid-tile' : 'grid-tile-disabled'}` which is more robust

- Area: Playwright test coverage (verification only)
- Why: Existing tests for search clear and kit card interactions will confirm no behavioral regressions
- Evidence: `tests/e2e/parts/part-list.spec.ts:86-95` — `clearSearch()` clicks clear button; `tests/e2e/kits/kits-overview.spec.ts:8-150` — exercises kit cards and indicators

## 3) Data Model / Contracts

No data model or API contract changes. This is a purely presentational fix affecting CSS classes only.

## 4) API / Integration Surface

No API or TanStack Query integration changes. Components retain their existing data fetching patterns.

## 5) Algorithms & UI Flows

**Flow: Clear search term**
- Steps:
  1. User types into debounced search input
  2. Clear button becomes visible when `searchInput.length > 0`
  3. User hovers over clear button (expected: pointer cursor)
  4. User clicks clear button → `handleClear()` fires → `setSearchInput('')` and navigates without search param
- States / transitions: searchInput state, URL search param via TanStack Router
- Hotspots: Debounce timing (300ms) and navigation synchronization
- Evidence: `src/components/ui/debounced-search-input.tsx:78-94` — clear handler logic

**Flow: Navigate to kit detail via card click**
- Steps:
  1. User navigates to kits overview
  2. Kit cards render with grid-tile styling (expected: hover animation and pointer cursor)
  3. User hovers over kit card (expected: scale/shadow animation, pointer cursor)
  4. User clicks card → Card's onClick handler fires → `onOpenDetail(kit.id)` triggers navigation
  5. User uses keyboard (Enter/Space) → Card's handleKeyDown fires → `onOpenDetail(kit.id)` triggers navigation
- States / transitions: Kit overview list, detail route navigation
- Hotspots: Card component handles both mouse and keyboard events (card.tsx:25-38); remove redundant inner div handlers to prevent double-invocation
- Evidence: `src/components/kits/kit-card.tsx:42-61` — current inner div handlers to be removed; `src/components/ui/card.tsx:25-38` — Card's built-in mouse/keyboard handling

## 6) Derived State & Invariants

- Derived value: Clear button visibility (`searchInput && <button>`)
  - Source: Local searchInput state in DebouncedSearchInput
  - Writes / cleanup: None (button mounts/unmounts based on condition)
  - Guards: Conditional rendering `{searchInput && ...}`
  - Invariant: Button only visible when search term exists; cursor must be pointer when visible
  - Evidence: `src/components/ui/debounced-search-input.tsx:106-116`

- Derived value: Card hover styles (`onClick ? hover-styles : no-hover`)
  - Source: Card component's onClick prop
  - Writes / cleanup: CSS classes applied conditionally
  - Guards: Ternary in variantClasses object
  - Invariant: grid-tile variant must show hover effects and pointer cursor if onClick is truthy
  - Evidence: `src/components/ui/card.tsx:19-21`

## 7) State Consistency & Async Coordination

No async state coordination changes. Search debouncing and navigation logic remain unchanged.

- Source of truth: URL search params (TanStack Router) for search term; component props for kit card onClick
- Coordination: DebouncedSearchInput syncs local state with URL via useEffect; KitCard receives onOpenDetail callback from parent
- Async safeguards: Existing debounce logic (300ms) and navigation guards remain in place
- Instrumentation: No changes required; existing test IDs (`parts.list.search.clear`, `kits.overview.search.clear`, `kits.overview.card.{id}.link`) continue working
- Evidence: `src/components/ui/debounced-search-input.tsx:42-72` — URL sync effects

## 8) Errors & Edge Cases

- Failure: Clear button rendered but cursor not pointer
- Surface: DebouncedSearchInput on parts and kits list views
- Handling: Add `cursor-pointer` class to button element
- Guardrails: Visual inspection; no runtime error possible
- Evidence: `src/components/ui/debounced-search-input.tsx:107-115`

- Failure: Kit card renders without hover animation or pointer cursor
- Surface: KitCard on kits overview
- Handling: Pass onClick handler to Card component using variant ternary pattern matching PartListItem
- Guardrails: Use `variant={onOpenDetail ? 'grid-tile' : 'grid-tile-disabled'}` to make disabled state explicit; manual visual test
- Evidence: `src/components/kits/kit-card.tsx:63-74`, `src/components/parts/part-card.tsx:52`

- Failure: Double-invocation of onOpenDetail if both Card onClick and inner div onClick fire
- Surface: KitCard when passing onClick to Card while keeping inner div handlers
- Handling: Remove inner div's onClick/onKeyDown handlers; rely solely on Card's onClick which already handles keyboard via Card's handleKeyDown (card.tsx:29-38)
- Guardrails: Remove role='link' and tabIndex from inner div since Card will handle focus; existing Playwright tests verify navigation still works
- Evidence: `src/components/ui/card.tsx:25-38`, `tests/e2e/kits/kits-overview.spec.ts`

## 9) Observability / Instrumentation

No instrumentation changes required. Existing test IDs remain sufficient:

- Signal: `parts.list.search.clear`
- Type: data-testid attribute
- Trigger: Clear button rendered when searchInput non-empty
- Labels / fields: testIdPrefix passed from parent (`parts.list`, `kits.overview`)
- Consumer: Playwright tests via `page.getByTestId()`
- Evidence: `src/components/ui/debounced-search-input.tsx:112` — existing testid on button

- Signal: `kits.overview.card.{id}`
- Type: data-testid attribute on Card component
- Trigger: Rendered for each kit card
- Labels / fields: kit.id
- Consumer: Playwright tests in kits-overview.spec.ts
- Evidence: `src/components/kits/kit-card.tsx:66` — existing testid on Card; inner div testid will be removed as redundant

## 10) Lifecycle & Background Work

No lifecycle hooks or background work changes. Components remain purely presentational with existing effect dependencies.

## 11) Security & Permissions

Not applicable. Cursor styling has no security implications.

## 12) UX / UI Impact

- Entry point: Parts list view (`/parts`) and kits list view (`/kits`)
- Change: Clear button on search box will display pointer cursor on hover; kit cards will show pointer cursor and scale/shadow animation on hover
- User interaction: Visual feedback improvements; no functional behavior changes
- Dependencies: None (CSS-only changes)
- Evidence: `src/components/ui/debounced-search-input.tsx:107-115`, `src/components/kits/kit-card.tsx:63-74`

## 13) Deterministic Test Plan

**Surface: DebouncedSearchInput clear button**
- Scenarios:
  - Given parts list is open and search input contains text, When user hovers over clear button, Then cursor should be pointer
  - Given kits list is open and search input contains text, When user clicks clear button, Then search is cleared and URL updates (existing test coverage)
- Instrumentation / hooks: `parts.list.search.clear`, `kits.overview.search.clear` test IDs
- Gaps: Cursor pointer validation is visual-only (Playwright cannot assert CSS cursor property); covered by manual QA
- Evidence: `tests/e2e/parts/part-list.spec.ts:86-95` — clearSearch() method clicks button

**Surface: KitCard hover and click**
- Scenarios:
  - Given kits overview is open, When user hovers over a kit card, Then cursor should be pointer and card should show scale/shadow animation
  - Given kits overview is open, When user clicks a kit card, Then kit detail view opens (existing test coverage)
- Instrumentation / hooks: `kits.overview.card.{id}` and `kits.overview.card.{id}.link` test IDs
- Gaps: Hover animation validation is visual-only; covered by manual QA
- Evidence: `tests/e2e/kits/kits-overview.spec.ts:8-150` — exercises card indicators and interactions

**Manual QA Checklist (required)**
1. Open `/parts`, type search term, hover over clear button → verify pointer cursor displays immediately (no delay or flicker)
2. Open `/kits`, type search term, hover over clear button → verify pointer cursor displays immediately (no delay or flicker)
3. Open `/kits`, hover over any kit card → verify ALL of the following:
   - Pointer cursor displays immediately (no delay)
   - Scale animation triggers smoothly (card grows to ~102% of original size)
   - Shadow intensifies visibly (from shadow-sm to shadow-md)
   - Border color shifts to primary/50 (subtle blue/accent tint)
   - All transitions complete within 200ms (no lag or stutter)
4. Compare kit card hover to part card hover at `/parts` → verify IDENTICAL behavior:
   - Both show pointer cursor
   - Both scale to exactly 1.02
   - Both show shadow-md intensity
   - Both show border-primary/50 color
   - Transition timing matches (200ms duration-200)
5. Test keyboard navigation on `/kits` → Tab to kit card, press Enter or Space → kit detail opens (same as click)
6. Run `pnpm playwright test tests/e2e/parts/part-list.spec.ts` → all pass
7. Run `pnpm playwright test tests/e2e/kits/kits-overview.spec.ts` → all pass

## 14) Implementation Slices

This is a small fix that should be completed in a single slice:

- Slice: Cursor styling fixes
- Goal: Restore pointer cursor to search clear button and kit card hover effects
- Touches:
  - `src/components/ui/debounced-search-input.tsx` — add `cursor-pointer` class to clear button (line 110)
  - `src/components/kits/kit-card.tsx` — use variant ternary `variant={onOpenDetail ? 'grid-tile' : 'grid-tile-disabled'}`, pass `onClick={() => onOpenDetail?.(kit.id)}` to Card, remove inner div's onClick/onKeyDown/role/tabIndex (lines 64-74)
- Dependencies: None; verify existing tests pass after changes

## 15) Risks & Open Questions

**Risks**

- Risk: Removing inner div handlers breaks keyboard navigation or focus management
- Impact: Users can no longer navigate kit cards via keyboard (Enter/Space)
- Mitigation: Card component already handles keyboard navigation via handleKeyDown (card.tsx:29-38) which fires onClick on Enter/Space; remove redundant inner div handlers and verify keyboard nav works in manual QA (checklist step 5)

- Risk: Variant ternary pattern doesn't match BoxCard implementation
- Impact: Inconsistency across card implementations
- Mitigation: BoxCard uses the same variant ternary pattern (box-card.tsx:28); PartListItem also uses it (part-card.tsx:52); this change brings KitCard in line with established conventions

- Risk: Adding cursor-pointer to button has no visible effect
- Impact: Fix doesn't solve the problem
- Mitigation: Native HTML `<button>` elements should inherit pointer cursor by default in Tailwind, but explicit class ensures consistency across browsers; this is a low-risk cosmetic enhancement

**Open Questions**

None. Implementation approach is straightforward and follows existing component patterns.

## 16) Confidence

Confidence: High — This is a small, well-scoped CSS fix with clear precedent from other card implementations. The variant ternary pattern is used consistently by PartListItem and BoxCard. Removing redundant inner div handlers simplifies the component and aligns with Card's built-in mouse/keyboard handling. The change pattern is proven, existing tests provide safety net, and manual QA checklist provides detailed success criteria for visual validation.

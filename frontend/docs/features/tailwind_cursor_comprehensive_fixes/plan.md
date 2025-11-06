# Comprehensive Cursor Pointer Fixes for TailwindCSS v4 Upgrade

## 0) Research Log & Findings

**Investigation Areas**
- Examined the TailwindCSS v3 to v4 upgrade commit (7be7705) to understand cursor-related behavior changes
- Reviewed 15 button/interactive element implementations across UI components, domain components, and layout
- Analyzed document-tile architecture which differs from kit-card (two separate clickable regions vs single region)
- Reviewed previous cursor fixes in `docs/features/tailwind_cursor_fixes/` for consistent patterns
- Examined Playwright test coverage to understand data-testid dependencies and test stability requirements

**Key Finding: TailwindCSS v4 Default Cursor Changes**
The TailwindCSS v4 upgrade removed default pointer cursors from buttons and interactive elements. Unlike v3, buttons no longer inherit `cursor: pointer` automatically, requiring explicit `cursor-pointer` classes. Note: The shared Button component (`src/components/ui/button.tsx`) already includes `cursor-pointer` in baseClasses (lines 35-36), so only raw `<button>` elements and other interactive elements outside the Button component need fixes.

**Document Tile Architecture Discovery**
`src/components/documents/document-tile.tsx` has TWO separate clickable divs with explicit onClick handlers:
1. **Image area** (line 118): Main content wrapper - currently MISSING `cursor-pointer`
2. **Footer** (line 163): Title/type display - already HAS `cursor-pointer`

This differs from kit-card architecture where onClick should be passed to Card. For document tiles, Card should NOT receive onClick—we only need to add `cursor-pointer` to the image area div to match the footer.

**Playwright Test Impact**
Document tile tests use `data-document-tile` on the Card element (line 114). Changes to inner divs (line 118, 163) won't affect locators since tests don't target these nested elements directly.

**Type List Clear Button Conditional Logic**
`src/components/types/type-list.tsx:221-227` has a clear search button with a `disabled` prop (line 227). The cursor-pointer class should be conditional: only visible when not disabled, preventing pointer cursor on inactive states.

**Component Coverage Analysis**
Identified 15 buttons missing cursor-pointer across three priority tiers:
- **High-priority reusable components** (7): IconButton, Input clear, SearchableSelect (3 buttons), IconBadge button variant, Alert dismiss
- **Medium-priority common UI** (4): Media viewer nav buttons (2), Information badge remove, Type list clear search
- **Lower-priority specific instances** (4): Sidebar toggle, Part location quantity edit, Deployment notification reload, Mobile menu toggle

**Test Coverage Stability**
No cursor-related Playwright assertions exist (CSS cursor property isn't testable). All affected components use data-testid attributes for test locators. Adding cursor-pointer classes won't affect test stability since we're only modifying CSS classes, not DOM structure or testid attributes.

## 1) Intent & Scope

**User intent**

Fix comprehensive cursor pointer styling regressions introduced by the TailwindCSS v4 upgrade across document tiles and 15 button/interactive elements throughout the application. Restore consistent pointer cursor behavior that existed in TailwindCSS v3, ensuring users receive clear visual feedback when hovering over clickable elements.

**Prompt quotes**

"Document tile cards no longer show pointer cursor when hovered over the main image/icon area."

"Unlike kit cards, document tiles have TWO separate clickable regions (image area + footer) that both have onClick handlers."

"The following 13 buttons/interactive elements are missing the cursor-pointer class."

"Type list clear search button has disabled prop (line 227), cursor-pointer should be conditional."

**In scope**

- Add `cursor-pointer` class to document tile image area wrapper div (line 118) to match footer behavior
- Add unconditional `cursor-pointer` to 14 buttons without disabled states
- Add conditional `cursor-pointer` to type list clear button (only when not disabled)
- Verify existing Playwright tests still pass (no instrumentation changes required)
- Manual visual verification of cursor states on all 16 affected components

**Out of scope**

- Passing onClick to Card component for document tiles (incorrect pattern—tiles have two separate clickable regions)
- Refactoring button component patterns or hover state implementations
- Adding new Playwright assertions for cursor styles (CSS cursor property isn't programmatically testable)
- Modifying hover background colors or other visual effects beyond cursor
- Updating instrumentation or test-event taxonomy (no behavioral changes)

**Assumptions / constraints**

- TailwindCSS v4 cursor behavior is working as designed (explicit opt-in required)
- Document tile two-region architecture is intentional and won't be refactored
- All 15 buttons are genuinely interactive (confirmed by onClick handlers in codebase)
- Disabled state handling for type list clear button is correct (prop exists and is used)
- Playwright tests use data-testid attributes that won't be affected by CSS class changes

## 2) Affected Areas & File Map

**High-Priority Reusable Components**

- Area: `src/components/ui/hover-actions.tsx` (IconButton component)
- Why: Reusable button component used throughout app for delete/edit/toggle actions on tiles
- Evidence: `src/components/ui/hover-actions.tsx:48-60` — Button element with onClick, variant classes, but missing cursor-pointer

- Area: `src/components/ui/input.tsx` (Input clear button)
- Why: Clearable input variant used in multiple forms and search boxes
- Evidence: `src/components/ui/input.tsx:65-72` — Button with onClick={handleClear}, aria-label, hover styles, but no cursor-pointer

- Area: `src/components/ui/searchable-select.tsx` (Dropdown toggle button)
- Why: Dropdown toggle button in searchable select component used across type/location/category selects
- Evidence: `src/components/ui/searchable-select.tsx:257-263` — Button with onClick={handleDropdownToggle}, tabIndex=-1, aria-label, but no cursor-pointer

- Area: `src/components/ui/searchable-select.tsx` (Option buttons)
- Why: Individual option buttons within searchable select dropdown menus
- Evidence: `src/components/ui/searchable-select.tsx:365-381` — Button element with role="option", onClick handler, hover:bg-accent, but no cursor-pointer

- Area: `src/components/ui/searchable-select.tsx` (Create option button)
- Why: "Create new" button at bottom of searchable select dropdowns
- Evidence: `src/components/ui/searchable-select.tsx:395-405` — Button with onClick, hover:bg-accent styles, but no cursor-pointer

- Area: `src/components/ui/icon-badge.tsx` (Button variant)
- Why: Icon badge component with conditional button rendering when onClick prop is provided
- Evidence: `src/components/ui/icon-badge.tsx:171-178` — Renders as button element when onClick provided, but no cursor-pointer in commonProps

- Area: `src/components/ui/alert.tsx` (Dismiss button)
- Why: Alert dismiss button used in notification/alert components throughout app
- Evidence: `src/components/ui/alert.tsx:179-187` — Button with onClick={onDismiss}, aria-label, focus ring, X icon, but no cursor-pointer

**Medium-Priority Common UI**

- Area: `src/components/documents/document-tile.tsx` (Image area wrapper)
- Why: Main clickable region for document tiles - users click to view media or open links
- Evidence: `src/components/documents/document-tile.tsx:118-133` — Div with onClick={handleTileClick} but no cursor-pointer (footer at line 163 already has it). Note: Footer has only `cursor-pointer` class for hover feedback with no additional hover:bg-X styles, so image area should match with cursor-pointer only (consistent hover affordance)

- Area: `src/components/documents/media-viewer-base.tsx` (Previous button)
- Why: Navigation button to view previous document in media viewer modal
- Evidence: `src/components/documents/media-viewer-base.tsx:302-309` — Button with onClick={goToPrevious}, hover:bg-black/80, but no cursor-pointer

- Area: `src/components/documents/media-viewer-base.tsx` (Next button)
- Why: Navigation button to view next document in media viewer modal
- Evidence: `src/components/documents/media-viewer-base.tsx:313-320` — Button with onClick={goToNext}, hover:bg-black/80, but no cursor-pointer

- Area: `src/components/ui/information-badge.tsx` (Remove button)
- Why: Small remove/close button on information badge tags
- Evidence: `src/components/ui/information-badge.tsx:87-94` — Button with onClick={onRemove}, aria-label, hover:opacity-70, but no cursor-pointer

- Area: `src/components/types/type-list.tsx` (Clear search button)
- Why: Clear button in type list search box (conditional - has disabled prop)
- Evidence: `src/components/types/type-list.tsx:221-230` — Button with onClick={handleClearSearch}, disabled prop at line 227, hover:bg-muted, but no cursor-pointer (should be conditional)

**Lower-Priority Specific Instances**

- Area: `src/components/layout/sidebar.tsx` (Sidebar toggle button)
- Why: Collapse/expand sidebar button in main navigation
- Evidence: `src/components/layout/sidebar.tsx:53-62` — Button with onClick={onToggle}, aria-pressed, title tooltip, but no cursor-pointer

- Area: `src/components/parts/part-location-grid.tsx` (Quantity edit button)
- Why: Editable quantity display in part location grid
- Evidence: `src/components/parts/part-location-grid.tsx:269-275` — Button with onClick={onStartEdit}, hover styles, but no cursor-pointer

- Area: `src/components/ui/deployment-notification-bar.tsx` (Reload button)
- Why: Reload button in deployment notification banner
- Evidence: `src/components/ui/deployment-notification-bar.tsx:17-23` — Button with onClick={reloadApp}, underline hover effect, focus ring, but no cursor-pointer

- Area: `src/routes/__root.tsx` (Mobile menu toggle button)
- Why: Mobile navigation menu toggle button
- Evidence: `src/routes/__root.tsx:100-108` — Button with onClick={toggleMobileMenu}, aria-expanded, aria-controls, hover:bg-accent, but no cursor-pointer

## 3) Data Model / Contracts

**No data model changes required**

This change affects only CSS class names in component render methods. No props, state, API contracts, or data shapes are modified.

## 4) API / Integration Surface

**No API integration changes required**

This change affects only client-side styling. No backend endpoints, TanStack Query hooks, or event emitters are involved.

## 5) Algorithms & UI Flows

**Flow: Type List Clear Search Button (Conditional Cursor)**

Steps:
1. User types search term in type list search input
2. Clear button appears with `searchTerm &&` condition (line 220)
3. Component checks `disabled` prop state
4. If not disabled: render button with `cursor-pointer` class
5. If disabled: render button with explicit `cursor-not-allowed` class (not just omitting cursor-pointer)
6. User hovers: sees pointer cursor when enabled, not-allowed cursor when disabled

States / transitions:
- Search term empty → clear button hidden
- Search term present + enabled → clear button visible with pointer cursor
- Search term present + disabled → clear button visible with not-allowed cursor (explicit)

Hotspots: Conditional class application using `cn()` utility with explicit cursor classes for both states: `cn('...base', disabled ? 'cursor-not-allowed' : 'cursor-pointer')`

Evidence: `src/components/types/type-list.tsx:221-230` — Button with disabled={disabled} prop

**Flow: Document Tile Click (Two-Region Architecture)**

Steps:
1. User navigates to document list or part details page with documents
2. Document tiles render with two clickable regions: image area (line 118) and footer (line 163)
3. User hovers over image area: should see pointer cursor (currently missing)
4. User hovers over footer: sees pointer cursor (already working)
5. User clicks either region: triggers same handleTileClick function
6. If website: opens external link in new tab
7. If image/PDF: opens media viewer modal

States / transitions:
- Idle state: no hover
- Image hover: pointer cursor + no scale effect (not Card-level hover)
- Footer hover: pointer cursor (already present)
- Click: navigation or modal open

Hotspots: Two separate onClick handlers on divs (not Card) — cursor-pointer must be on both divs, not Card

Evidence: `src/components/documents/document-tile.tsx:118-133` (image area), `163-171` (footer)

**Flow: Standard Button Click (14 Unconditional Cases)**

Steps:
1. User encounters interactive button element
2. User hovers: should see pointer cursor
3. User clicks: executes onClick handler
4. Component responds (toggle, delete, navigate, etc.)

States / transitions: Idle → Hover → Click → Action executed

Hotspots: All buttons have explicit onClick handlers, no disabled state to consider

Evidence: All 14 button locations listed in section 2 (IconButton, Input clear, SearchableSelect buttons, etc.)

## 6) Derived State & Invariants

**Derived value: Type list clear button disabled state**
- Source: `disabled` prop passed to button component, derived from parent state
- Writes / cleanup: No writes — purely presentational class modification
- Guards: Conditional class application using disabled prop value with explicit cursor classes for both states
- Invariant: Button must show pointer cursor when enabled (`cursor-pointer`) and not-allowed cursor when disabled (`cursor-not-allowed`); omitting cursor-pointer on disabled buttons is insufficient because browser defaults may conflict
- Evidence: `src/components/types/type-list.tsx:227` — disabled={disabled} prop

**Derived value: Document tile clickability regions**
- Source: Two separate div onClick handlers (image + footer), both calling handleTileClick
- Writes / cleanup: No writes — cursor-pointer is CSS-only change
- Guards: None — both regions always clickable (no disabled state)
- Invariant: Both clickable regions must show pointer cursor consistently
- Evidence: `src/components/documents/document-tile.tsx:118-119` (image), `163` (footer)

**Derived value: Button hover states across all 14 unconditional cases**
- Source: Button onClick prop presence (all have explicit handlers)
- Writes / cleanup: No writes — cursor-pointer is visual feedback only
- Guards: None — no disabled states to check
- Invariant: All buttons with onClick handlers must show pointer cursor on hover
- Evidence: All button locations in section 2 have onClick handlers present

## 7) State Consistency & Async Coordination

**No state coordination required**

This change affects only CSS classes. No TanStack Query caches, React state, instrumentation events, or async operations are involved. Component render behavior remains identical.

**Source of truth:** Component props and local state (unchanged)

**Coordination:** None required — cursor-pointer is a CSS-only addition

**Async safeguards:** Not applicable — no async operations

**Instrumentation:** No changes — existing data-testid attributes remain stable

**Evidence:** All 16 affected files modify only className strings, no logic changes

## 8) Errors & Edge Cases

**Failure: Type list clear button shown when disabled**
- Surface: `src/components/types/type-list.tsx:221-230`
- Handling: Conditional cursor classes using disabled prop — explicit `cursor-not-allowed` when disabled, `cursor-pointer` when enabled. Pattern: `cn('...base', disabled ? 'cursor-not-allowed' : 'cursor-pointer')` to prevent browser default cursor from conflicting
- Guardrails: Disabled state already exists (line 227), prevents onClick execution. Explicit cursor-not-allowed provides clear visual feedback
- Evidence: `src/components/types/type-list.tsx:227` — disabled={disabled} prop

**Failure: Document tile Card receives onClick (incorrect pattern)**
- Surface: `src/components/documents/document-tile.tsx:111-115`
- Handling: Do NOT pass onClick to Card — tiles have two separate clickable divs (not single-region like kit cards)
- Guardrails: Plan explicitly documents this architectural difference to prevent incorrect refactoring
- Evidence: Change brief investigation notes confirm two-region architecture is intentional

**Failure: Playwright tests break due to locator changes**
- Surface: All test specs using affected components
- Handling: No locator changes — cursor-pointer is CSS-only, data-testid attributes untouched
- Guardrails: Research confirmed tests use data-testid on Card/button elements, not nested divs
- Evidence: `src/components/documents/document-tile.tsx:114` — data-document-tile on Card, not inner divs

**Failure: Missing cursor-pointer on newly added buttons in future**
- Surface: Future button implementations
- Handling: This fix establishes pattern — developers should reference for consistency
- Guardrails: Code review should catch missing cursor-pointer on interactive elements
- Evidence: Comprehensive coverage of 15 buttons establishes reusable pattern

## 9) Observability / Instrumentation

**No instrumentation changes required**

This change affects only CSS classes for visual cursor feedback. No test-event emissions, data-testid additions, or analytics changes are needed.

**Signal: Existing data-testid attributes**
- Type: Test selector attribute
- Trigger: Already present on all affected components
- Labels / fields: No changes — existing attributes remain stable
- Consumer: Playwright test specs (unchanged)
- Evidence: Document tile Card has data-document-tile (line 114), buttons have data-testid attributes for tests

**Signal: Playwright test execution**
- Type: Automated test verification
- Trigger: Run test suite after implementation
- Labels / fields: Test pass/fail status
- Consumer: Developer verification that CSS changes don't break tests
- Evidence: All tests use data-testid locators, not CSS class selectors

## 10) Lifecycle & Background Work

**No lifecycle or background work required**

This change affects only CSS class application in component render methods. No effects, timers, subscriptions, polling, or cleanup logic is involved.

## 11) Security & Permissions

**Not applicable**

This change affects only CSS cursor styling. No authentication, authorization, data exposure, or security boundaries are touched.

## 12) UX / UI Impact

**Entry point: Document tile cards**
- Change: Add cursor-pointer to image area wrapper div (line 118)
- User interaction: Users will see pointer cursor when hovering over document image/icon area (matching footer behavior)
- Dependencies: No dependencies — pure CSS class addition
- Evidence: `src/components/documents/document-tile.tsx:118`

**Entry point: Type list search box clear button**
- Change: Add conditional cursor-pointer based on disabled state
- User interaction: Users will see pointer cursor when button is enabled, no pointer when disabled
- Dependencies: Disabled prop already exists and controls onClick behavior
- Evidence: `src/components/types/type-list.tsx:221-227`

**Entry point: All other 14 buttons (IconButton, Input clear, SearchableSelect, etc.)**
- Change: Add unconditional cursor-pointer to all button elements
- User interaction: Users will see pointer cursor on hover for all interactive buttons
- Dependencies: No dependencies — all buttons have onClick handlers, no disabled states
- Evidence: All button locations listed in section 2

**Accessibility note**
- Cursor pointer provides visual affordance for sighted mouse users
- All buttons already have semantic `<button>` elements with onClick handlers
- No ARIA or keyboard navigation changes required (already compliant)

## 13) Deterministic Test Plan

**Surface: Document tile cards**
- Scenarios:
  - Given a part with attached documents, When user views part details page, Then document tiles render with data-document-tile attribute
  - Given user hovers over document image area, When cursor is positioned over image, Then pointer cursor displays (manual verification only)
  - Given user clicks document image area, When onClick fires, Then media viewer opens or external link opens (existing test coverage)
- Instrumentation / hooks: Existing data-document-tile selector on Card element (line 114), not affected by inner div cursor-pointer change
- Gaps: No automated cursor CSS verification (not feasible in Playwright) — manual visual verification required
- Evidence: `tests/e2e/parts/part-documents.spec.ts` tests document interactions using data-document-tile locator

**Surface: Type list clear search button**
- Scenarios:
  - Given type list search input has text, When clear button is enabled, Then cursor-pointer class is present
  - Given type list is disabled, When clear button renders, Then cursor-pointer class is NOT present
  - Given user clicks clear button when enabled, When onClick fires, Then search clears (existing test coverage)
- Instrumentation / hooks: Existing data-testid="types.list.search.clear" selector unchanged
- Gaps: No automated cursor CSS verification — conditional class logic verified by code review
- Evidence: `src/components/types/type-list.tsx:226` — data-testid attribute

**Surface: All 14 unconditional buttons**
- Scenarios:
  - Given any button with onClick handler, When user hovers, Then cursor-pointer class is present (manual verification)
  - Given user clicks button, When onClick fires, Then action executes (existing test coverage for all)
- Instrumentation / hooks: All buttons have existing data-testid attributes or are locators via parent selectors
- Gaps: No automated cursor CSS verification for any buttons — pure visual change
- Evidence: IconButton in document tiles tested via `tests/e2e/parts/part-documents.spec.ts`, Input clear tested via multiple search specs

**Test execution plan**
1. Run full Playwright suite after implementation: `pnpm playwright test`
2. Verify all existing tests pass (no locator breakages)
3. Manual visual verification checklist:
   - Document tile image area: hover shows pointer
   - Document tile footer: hover still shows pointer
   - Type list clear button (enabled): hover shows pointer
   - Type list clear button (disabled): hover does NOT show pointer
   - All 14 other buttons: hover shows pointer
4. Spot-check 2-3 representative buttons from each priority tier

**Instrumentation / hooks stability**
All affected components maintain existing data-testid attributes. Cursor-pointer is added to className strings only — no DOM structure changes.

## 14) Implementation Slices

**Recommended: Three incremental slices**

While all 16 cursor-pointer additions are independent CSS changes, shipping in slices reduces risk and delivers value incrementally.

**Slice 1: High-priority reusable components (7 components)**
- Goal: Establish pattern and fix cursor issues in widely-used components
- Touches: IconButton, Input clear, SearchableSelect (3 buttons), IconBadge button variant, Alert dismiss
- Dependencies: None — can ship independently
- Value: Fixes cursor across all instances of these reusable components (documents, forms, dropdowns, etc.)

**Slice 2: Document tile + medium-priority common UI (5 components)**
- Goal: Address most visible user-facing issue and complete common UI elements
- Touches: Document tile image area, Media viewer nav buttons (2), Information badge remove, Type list clear
- Dependencies: None — can ship after Slice 1 or in parallel
- Value: Fixes document browsing experience and search/navigation interactions

**Slice 3: Lower-priority specific instances (4 components)**
- Goal: Complete comprehensive coverage
- Touches: Sidebar toggle, Part location quantity edit, Deployment notification reload, Mobile menu toggle
- Dependencies: None — can ship after Slice 2
- Value: Ensures all interactive elements have consistent cursor behavior

Atomic commit per slice maintains reviewability while reducing blast radius. If one component has unexpected side effects, only that slice needs rollback.

## 15) Risks & Open Questions

**Risk: Conditional cursor-pointer logic for type list clear button may conflict with browser defaults**
- Impact: Button may show pointer when disabled if browser default cursor isn't overridden, confusing users about clickability
- Mitigation: Use explicit cursor classes for both states — `className={cn('...base-classes', disabled ? 'cursor-not-allowed' : 'cursor-pointer')}` — to ensure disabled state shows not-allowed cursor rather than relying on browser defaults

**Risk: Document tile Card receives onClick in error**
- Impact: Would break two-region click architecture, causing only Card wrapper to be clickable
- Mitigation: Plan explicitly documents that tiles have TWO clickable divs, not single Card onClick — code review should catch this

**Risk: Missing cursor-pointer on future buttons**
- Impact: Pattern continues where new interactive elements lack pointer cursor after TailwindCSS v4 upgrade
- Mitigation: Add cursor-pointer requirement to UI contribution guidelines (create `docs/contribute/ui/button_checklist.md` or add to existing component guidelines). This comprehensive fix establishes searchable reference. Code review should catch missing cursor-pointer going forward

**Risk: Playwright tests fail due to unexpected side effects**
- Impact: CSS class changes somehow break locators or test assumptions
- Mitigation: All locators use data-testid attributes, not CSS classes — very low risk verified by research

**Open Question: Should cursor-pointer be added to base button styles?**
- Why it matters: Could prevent future regressions by applying pointer globally to all button elements
- Owner / follow-up: UX/design team decision — TailwindCSS v4 removed default pointer intentionally for flexibility

**Open Question: Are there other missing cursor-pointer cases beyond these 15?**
- Why it matters: Incomplete coverage would leave UX inconsistencies after TailwindCSS v4 upgrade
- Owner / follow-up: Comprehensive codebase scan completed — these 15 + document tile represent all missing cases found. Before implementation, validate completeness with: `grep -r "onClick={" src/components --include="*.tsx" | grep -v "cursor-pointer"` and cross-reference against the 16 documented cases to ensure no new cases were introduced since initial research

## 16) Confidence

Confidence: High — This is a straightforward CSS class addition with no logic changes, well-defined affected areas, and clear implementation patterns. The change brief investigation notes resolve all architectural questions (document tile two-region pattern, type list conditional cursor). Existing Playwright tests use data-testid locators unaffected by CSS changes. Manual visual verification checklist provides clear success criteria.

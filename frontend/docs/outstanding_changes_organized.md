# Outstanding Changes – Organized by Feature Slice

This document reorganizes the outstanding changes into logical slices of work that can be completed in a single sitting.

---

## Slice 1: Visual Polish – Icons & Card Animations

**Scope**: Quick visual improvements that enhance UI consistency.

### Sidebar Icons
- Replace all sidebar icons with Lucide icons:
  - Site icon: use the favicon at public/favicon.png
  - Dashboard: LayoutDashboard
  - Parts: Cpu
  - Kits: CircuitBoard (note that the Layers icon in src/components/shopping-lists/detail-header-slots.tsx:280 needs to be replaced also)
  - Shopping Lists: ShoppingCart
  - Storage: Package
  - Types: Tags
  - Sellers: Store
  - About: Info

### Card Animation Consistency
- The part card has a nice, simple animation that needs to be applied to all cards (kit cards, shopping list cards, pick list cards, etc.)

---

## Slice 2: Toast System Improvements

**Scope**: Fix toast display issues and research undo button opportunities.

### Large Toast Text Overflow
- Very large toast texts move the close button out of the toast. Specifically this text:
  ```
  [{"type":"greater_than_equal","loc":["build_target"],"msg":"Input should be greater than or equal to 1","input":0,"url":"https://errors.pydantic.dev/2.11/v/greater_than_equal"}]
  ```

### Toast Auto-Close Consistency
- Toasts still not always auto close. Sometimes they do, but regularly I see toasts stay open indefinitely.

### Undo Button Candidates (Research)
- There's now one place where the success toast of an action has an undo button. Research and provide a list of other success toast candidates where an undo feature would be helpful.

---

## Slice 3: Tooltip System Overhaul

**Scope**: Fix tooltip behavior issues and refactor into shared infrastructure.

### Quick Mouse Movement Issue
- If you move the mouse very quickly from the anchor of a tooltip onto the tooltip, the tooltip stays open.

### Click Behavior Issue
- If I click on the anchor of something that has a tooltip (at least on the pick list icon on the kit card on the kit list screen), the tooltip stays open after I move the mouse off of the icon. Possibly this is to support mobile devices, but I would like the mouse click to be excluded from this behavior.

### Contributor Guidance
- Add missing contributor guidance that states that no tooltip should ever have navigation components or otherwise anything that we can interact with.

### Infrastructure Refactor
- Tooltip infrastructure needs to be refactored into a shared component and hook. Currently there are ~10+ different tooltip implementations scattered across the app (membership indicators, kit BOM table reservations, dashboard widgets, document actions, hover-action buttons, etc.) with inconsistent positioning, portal handling, and accessibility.
- Create reusable `Tooltip` component and `useTooltip` hook in src/components/ui that handles portals, positioning, focus management, animation, and test instrumentation consistently.
- All existing tooltip callsites must be migrated to use the shared primitive.
- Tooltips must enforce the constraint that they contain only informational content (no interactive elements) and close immediately when hover/focus leaves the anchor.
- Playwright page objects and specs must be updated to maintain deterministic selectors throughout the migration.

---

## Slice 4: Badge & Chip Standardization

**Scope**: Standardize badge and link chip visualization across all detail views.

### Cross-Page Visual Consistency
- Visualization of badges and link chips differ per page (kit, pick list, shopping list, and part detail views). Make them look the same:
  - Link chips need to move out of the header. Use the placement from the part detail view.
  - Only the key and status badge should appear next to the title.
  - All attribute badges (Build target, etc.) need to go below the title in the detail-screen.metadata affordance.
  - All badges should be formatted as `<key>: <value>` with consistent color scheme.

### Badge Wrapper Abstraction
- There are a number of wrappers around Badge that manage formatting. Abstract these into reusable components:
  - Examples: DetailBadge in src/components/pick-lists/pick-list-detail.tsx, SummaryBadge in src/components/kits/kit-detail.tsx, GroupSummaryBadge in src/components/pick-lists/pick-list-lines.tsx
  - Prefer a few helper components next to the Badge component in src/components/ui, or extend the Badge component to support these use cases.

---

## Slice 5: Button System Review

**Scope**: Fix button wrapping issues and standardize button labels app-wide.

### Action Bar Button Wrapping
- All action bars in all DetailScreenLayout usages need to be reviewed. Buttons should never wrap.
- All wrapper divs seem to have the class flex-wrap. If removed, the labels of the buttons wrap.
- Neither the buttons nor the labels on the buttons must wrap.

### Button Label Format Review
- Review all button labels in the app. They should follow this format:
  - `<verb> <noun>` like "Order Stock" and "Edit List"
  - Describe the business function (so not "Create Shopping List" but "Order Stock")
  - Title case on all words (upper case first letter)
  - This includes buttons like the "+ Add Part" button on the kit BOM table
- Update contributor documentation or CLAUDE.md with this rule.

---

## Slice 6: Kit Feature Refinements

**Scope**: Polish kit list and detail views with functional and visual improvements.

### Kit List View – Batch Query Optimization
- The kit list screen does multiple queries for the shopping list and its icons instead of a batch query like the part list screen does.

### Kit List View – Remove "Refresh Needed" Tooltip Label
- The tooltip of the shopping list indicator on the kit shows "Refresh needed" for shopping lists where the kit was modified after it was linked to the shopping list. This refresh function has not been implemented, so this label should be removed from the tooltip.

### Kit Detail View – Scrollbar Bug
- There's a bug in the screen. If the content of the DetailScreenLayout component grows large enough to cause a scrollbar to appear, a scrollbar also appears at the top level of the HTML page. The sizes are related. It only happens on the kit detail view, not on the part detail view for example.

### Kit Detail View – Move Archive to Menu
- Archive button must not be on the card in the list view. It needs to be a button in the detail screen behind an ellipsis menu option.

### Kit Detail View – Add Delete Option
- A delete option for kit is missing. Needs to be added to the ellipsis menu also.

### Kit Detail View – Unlink Icon Visibility
- The unlink icon must only be shown when the mouse is over the shopping cart link chip or when it has focus.

---

## Slice 7: Shopping List Improvements

**Scope**: Add unlink feature and fix skeleton loading state.

### Kit Link Chip Unlink Feature
- The kit link chip must have an unlink feature like the shopping cart chip on the kit detail view.

### Skeleton Padding Fix
- The skeleton page doesn't have the same padding as the final frame. This issue only seems to appear in the shopping list. The kits list view e.g. is fine.

---

## Slice 8: Table & List Refinements

**Scope**: Fix table styling and add search debounce app-wide.

### Table Rounded Corners Fix
- The bottom rounded corners of the tables on the pick list detail view and the kit detail view are not visible. This doesn't happen on the shopping list.
- It's caused by the "bg-background" class on the row. The pick list uses the "divide-y divide-border/70" classes for divider lines. If bg-background is removed, the issue goes away.

### Search Debounce Refactor
- Search debounce has been introduced for kits. Refactor the app to use this throughout the app or, better, add the search box to the list view template and embed debounce there.

---

## Slice 9: Cleanup & Minor Fixes

**Scope**: Small, isolated fixes across different views.

### Pick List – Add Delete Functionality
- It must be possible to delete pick lists.

### Part Detail – Remove Refresh Option
- The "Refresh" menu option in the actions panel needs to be removed.

---

## Notes

- Each slice is designed to be completable in a single sitting
- Slices are relatively independent and can be tackled in any order
- Some slices (like Tooltip System Overhaul) are larger but represent cohesive units of work
- Research tasks (like undo button candidates) are bundled with related implementation work

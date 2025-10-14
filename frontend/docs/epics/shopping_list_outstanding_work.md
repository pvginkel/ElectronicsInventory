# Outstanding work for the shopping list

All remaining tasks roll into three plans. Treat this as a scope outline and lean on the docs listed in `docs/epics/README.md` for implementation detail, instrumentation, and testing policy.

# Phase 1 — List experience and other polish

## General items

- Toasts need to be closed automatically after 15 seconds.

## Shopping list list view

- Rename "Done lists" to "Completed lists".
- Rework the split between active and completed lists using tabs. The current tab must be persisted in local storage (not the query string) and be the default tab if the user navigates (back) to the screen. Show the counts in the tab names. This replaces the current "Active lists (2) • Done lists (3)" label and list group labels "Active lists (2)" and "Done lists (3)". Note that right now the status of show done lists is not persisted. Create a Playwright test that validates that when the user opens a shopping list and goes back to the list through the breadcrumb bar, the previously shown tab is still active.
- Search placeholder text can become "Search...".
- Ensure visual consistency of the view with the other list views, e.g. storage. I see some padding differences and the subtitle must be removed.
- The card needs to be clickable, replacing the "Open list" button. The "Delete" and "Mark Done" buttons needs to be moved into the detail view.
- The "? line" chip can be removed.

## Part detail view

- The "Add to shopping list" button can be moved into the menu.
- The shopping list chips need to get a shopping cart icon (the one you use in the parts list view).

## Storage list

- The whole card must be clickable replacing the "View" button. The "Edit" and "Delete" buttons can be removed. They're on the detail view already.

# Phase 2 — Shopping list detail workflow

This pass covers the detail screen across Concept, Ready, and Completed states, including visual styling, action surfacing, and state-specific permissions.

## Shopping list detail view

- "Edit details" must be renamed "Edit List".
- I don't like the color of the lines as they're highlighted. It just doesn't fit with dark mode. Can you suggest a beetter color or different visual feedback?
- The status columns on the lines must be center aligned.
- Mirror the chips visual style for the line numbers from the card. Remove "? total lines" and create chips for new, ordered and received.
- The order note needs to be reworked. I want an "Edit Group" button next to the "Mark group as Ordered" button that shows a modal with just the order note. The order note panel must be changed as follows:
  - Hide if there is no order note.
  - Remove the 0/500 characters line.
  - Remove the edit button.
  - Replace the edit box with a simple display of the order note.
- Remove this label completely "No description yet. Use “Edit details” to add context for collaborators.".
- The status and actions column must be made to "fit" instead of a percentage. If I shrink the screen the "Update stock" button visually overlays the status chip.

### In concept state

- The scroll wheel in the list of parts in the "Add part to Concept list" dialog does not work. I can drag the thumb on the scrollbar just fine.
- The parts in the search box need to be formatted "<description> (<key>)". The parts need to be sorted textually.
- Remove the ... menu and replace with inline icons.
- The "Sort:" text on the sort button needs to be replaced with the "arrow-down-a-z" icon from Lucide.
- Move the "Add row" button next to the sort button and give it the primary color.
- In the ready state the "Mark Done" and "Back to Concept" buttons are in the "Ready actions" bar. 
- The "Mark Ready" button needs the quotes removed from the label and moved into a bar called "Concept actions" just like "Ready actions" in the ready state. The bar needs to be the same visually. The whole bottom "? lines in Concept" section needs to be removed.

### In ready state

- Confirmation dialog to mark a list as done must state that the action is irriversible.
- Lines in concept state:
  - Remove the ... menu. Replace the "Mark as Ordered" item with a labeled button. Replace the "Edit line" item with an inline icon.
- Lines in ordered state:
  - The "Update stock" label wraps. The button is too small.
  - Remove the ... menu. The "Adjust ordered quantity" item can be removed. It's duplicated by the pencil next to ordered. Revert to New can become the undo-2 icon from Lucide. The "Edit line" an inline icon.
- Lines in completed state (also rename Done to Completed here):
  - Remove the ... menu and move the "Edit line" button into an inline icon.
- The "Mark group as Ordered" button must be hidden when all lines in the group are beyond the new state. Right now it's disabled and it's only disabled when all lines are received.

### In completed state

- All edit functions need to be disabled. I'm fine leaving "Edit details" in as it's just changing the name of the list. However, the following need to be removed:
  - "Mark group as Ordered"
  - Note must not be editable; "Save note" button needs to be removed.
  - "Actionds" column and menus can be removed completely.
  - Pencil in the "Ordered" column needs to be removed.
  - "Update Stock" on received lines.
  - The "Ready actions" bar needs to be hidden.
  - Any others you can find. The whole screen needs to become read-only.

# Phase 3 — Update stock dialog redesign

Consolidate the dialog into a single table that drives the receive flow and eliminates the redundant sections.

## Update stock dialog

I want to rework this screen. Right now there's an "Existing locations", "Receive now" and "Allocate to locations" section. I want these merged into one.

I want a list of locations with four columns:

- Box
- Location
- Quantity
- Receive

Quantity is the current quantity. Receive is the quantity we're going to receive into the location. At the bottom must be an "Add location" button with functionality similar to the current "Add location" button. Quantity must be empty (not zero). The "Receive now" element needs to be removed completely and inferred from the sum of what we enter into the "Receive" fields.

For existing locations "Box", "Location" and "Quantity" are labels and "Receive" is an edit box. For new locations all fields are editable.

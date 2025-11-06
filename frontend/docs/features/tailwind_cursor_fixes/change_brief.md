# Change Brief: Fix Cursor Issues from TailwindCSS Upgrade

## Problem

Two cursor-related issues were introduced in the TailwindCSS upgrade from version 3 to 4 (commit 7be7705663e4ca48da8b725023dea704a702ab47):

1. **Clear button cursor**: The clear button on the search box (shown when text is entered) on the part and kit list views no longer displays a pointer cursor on hover.

2. **Kit card hover effects**: Kit cards on the kit list view no longer show a pointer cursor and hover animation. Other entity cards (parts, shopping lists, and storage) still display these hover effects correctly.

## Expected Behavior

- The clear button on search boxes should show a pointer cursor when hovered
- Kit cards should show a pointer cursor and hover animation, matching the behavior of part, shopping list, and storage cards

## Scope

- Fix cursor styling on search box clear button (part and kit list views)
- Fix cursor styling and hover animation on kit cards to match other entity cards

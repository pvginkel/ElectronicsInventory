# Change Brief: Update Stock Dialog Improvements

## Summary

Improve the UX of the Update Stock dialog in shopping list lines by simplifying the button actions and adding the part cover image.

## Current Problems

1. **Confusing workflow**: To receive stock and complete an item, users must:
   - Enter the quantity received
   - Click "Save Stock" (which exits the dialog)
   - Re-open the dialog
   - Click "Complete Item"

2. **Complete Item doesn't save data**: The "Complete Item" button doesn't save location/quantity data the user entered before completing.

3. **Button placement**: "Save Stock" is positioned next to "Cancel", but logically it's an alternative to "Complete Item".

4. **Missing cover image**: The part card in the dialog doesn't show the cover image, unlike the PartInlineSummary component used elsewhere.

## Required Changes

### Button Behavior Changes

1. **Complete Item** button should:
   - Save any entered location data (what "Save Stock" currently does)
   - Complete the item
   - This makes it a single-action to receive and complete

2. **Save Item** button (renamed from "Save Stock") should:
   - Save the location data without completing the item
   - Keep current save-only behavior

3. **Remove "Save & Next"** button entirely

### Button Layout Changes

- Move "Save Item" button to be positioned next to "Complete Item"
- Both action buttons should be grouped together, separate from "Cancel"

### Part Card Changes

- Add cover image display to the part card in the dialog
- Should match the cover image behavior of PartInlineSummary component

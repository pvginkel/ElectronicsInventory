# Change Brief: Delete Shopping List Line from Ready State

## Summary

Add the ability to delete a shopping list line from a shopping list that is in "Ready" state.

## Requirements

1. **UI Location**: Add a bin (trash) icon to the left of the pencil (edit) icon in the shopping list line actions area.

2. **Icon Placement**: The bin icon should replace the position where the "Revert to New" icon currently appears (which is only shown for non-Ready states).

3. **Visibility**: The delete icon should only appear when the shopping list is in "Ready" state.

4. **Confirmation Dialog**: When clicked, show a confirmation dialog before deleting. The dialog should match the style of the existing "Delete List" confirmation dialog on the shopping list page.

5. **Backend Support**: The backend already supports this operation - no API changes needed.

## Acceptance Criteria

- A bin/trash icon appears to the left of the edit (pencil) icon for shopping list lines when the list is in Ready state
- Clicking the bin icon shows a confirmation dialog asking the user to confirm deletion
- The confirmation dialog matches the existing Delete List dialog styling
- Upon confirmation, the shopping list line is deleted via the API
- The UI updates to reflect the deleted line
- Appropriate error handling if the deletion fails

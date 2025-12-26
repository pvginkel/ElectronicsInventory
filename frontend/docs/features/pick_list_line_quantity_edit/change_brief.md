# Change Brief: Pick List Line Quantity Edit

## Summary

Make the pick list line quantity editable using the same UI pattern that was previously used on the part location line: a clickable quantity that transforms into an inline input field for editing.

## Functional Requirements

1. The quantity displayed on each pick list line should be clickable.
2. When clicked, the quantity transforms into an input field.
3. The user can enter a new quantity value.
4. Save and Cancel buttons appear to confirm or discard the change.
5. On save, call the new backend endpoint to update the pick list line quantity.
6. On cancel, revert to the read-only display.

## Backend Endpoint

A new backend endpoint has been added that allows changing the quantity of a pick list line. The frontend needs to integrate with this endpoint.

## UI Pattern Reference

The pattern to follow is the one that was previously implemented for part location quantity editing:
- Clickable quantity text that triggers edit mode
- Inline input field with Save/Cancel buttons
- Keyboard support (Enter to save, Escape to cancel)

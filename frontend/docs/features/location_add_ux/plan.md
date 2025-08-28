# Location Add UX Improvement Plan

## Description

Improve the user experience for adding storage locations to parts by implementing keyboard shortcuts and better workflow behavior in the `AddLocationRow` component.

## Requirements

- Enter key should commit the current line (equivalent to clicking the "Add" button)
- After adding a location, automatically create a new line in edit mode for quick consecutive additions
- Escape key should cancel the adding process and hide the add row

## Files to Modify

### `/src/components/parts/part-location-grid.tsx`

**Functions to modify:**

1. **`AddLocationRow` component (lines 260-352)**
   - Add keyboard event handlers for Enter and Escape keys
   - Implement logic to handle Enter key as equivalent to clicking "Add" button
   - Add Escape key handler to trigger cancel functionality
   - Modify the component to support auto-focus and field navigation

2. **`PartLocationGrid` component (lines 19-111)**
   - Update the `onAdd` callback logic to automatically show a new add row after successful addition
   - Ensure proper state management for consecutive additions

## Implementation Details

### Keyboard Event Handling

1. **Enter Key Behavior**:
   - Add `onKeyDown` handlers to all input fields (boxNo, locNo, quantity)
   - When Enter is pressed in any field, trigger the `handleAdd` function
   - Ensure validation still works (same validation as clicking "Add" button)

2. **Escape Key Behavior**:
   - Add `onKeyDown` handler for Escape key on the container or input fields
   - When Escape is pressed, trigger the `onCancel` callback
   - Clear form state before canceling

3. **Auto-focus Flow**:
   - Set `autoFocus` on the first input field (Box number) when the row appears
   - After successful addition, automatically focus the Box field of the new row

### State Management Changes

1. **Consecutive Addition Flow**:
   - Modify the parent component's `onAdd` callback to keep `showAddRow` as `true` after successful addition
   - Reset form fields in `AddLocationRow` after successful submission instead of hiding the row
   - Add a mechanism to actually close/hide the add row (either through explicit Cancel or after a period of inactivity)

2. **Form Reset Logic**:
   - After successful addition, clear all input fields (`boxNo`, `locNo`, `quantity`)
   - Maintain the suggested location functionality during consecutive additions

### Enhanced User Flow

1. **Initial Add**:
   - User clicks "Add Location" button → AddLocationRow appears with Box field focused
   - User can tab between fields or use Enter to submit from any field
   - Escape cancels and hides the row

2. **Consecutive Adds**:
   - After successful addition → form fields clear, Box field gets focus again
   - User can immediately start typing the next location
   - Row remains visible for quick consecutive entries
   - Escape still cancels and hides the row

3. **Form Validation**:
   - Maintain existing validation (all fields required, positive numbers)
   - Enter key only submits if validation passes
   - Show same error states as current implementation

## Technical Implementation Notes

- Use React's `onKeyDown` event handlers on input elements
- Leverage existing `handleAdd` and `onCancel` functions
- Maintain compatibility with existing "Use Suggested" button functionality
- Ensure loading states during submission prevent multiple rapid submissions
- Preserve existing accessibility attributes and styling

## Testing Considerations

- Test Enter key functionality on each input field
- Test Escape key cancellation from different states
- Verify consecutive addition workflow
- Ensure keyboard navigation works with suggestions
- Test with loading states and error conditions
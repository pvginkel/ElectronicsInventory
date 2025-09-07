# Search Clear Button Implementation Plan

## Brief Description

Add a clear button to all search input fields (parts, boxes, types) that appears when text is present. The button should be a filled circle with an X inside, positioned within the input field. Clicking it clears the search text and removes the search query parameter from the URL.

## Files to Create or Modify

### Files to Create:

1. **`src/components/icons/clear-button-icon.tsx`**
   - New reusable icon component to replace the existing XIcon from lucide-react
   - Shows a filled circle with an X inside
   - Consistent styling across all uses

### Files to Modify:

1. **`src/components/parts/ai-part-review-step.tsx`**
   - Replace existing `XIcon` from 'lucide-react' with new ClearButtonIcon
   - This becomes the standard clear/remove icon for the entire application

2. **`src/components/parts/part-list.tsx`**
   - Add ClearButtonIcon to search input
   - Position button absolutely within input container
   - Handle clear action to reset search and update URL

3. **`src/components/boxes/box-list.tsx`**
   - Add ClearButtonIcon to search input
   - Implement same positioning and behavior as parts list

4. **`src/components/types/TypeList.tsx`**
   - Add ClearButtonIcon to search input
   - Maintain consistency with other search implementations

## Algorithm Details

### Clear Button Visibility Logic:
1. Monitor search input value
2. Show button when `searchTerm.length > 0`
3. Hide button when input is empty

### Clear Action Handler:
1. Set input value to empty string
2. Call `handleSearchChange('')` to trigger navigation
3. Navigation handler will:
   - Navigate to route without search parameter
   - Use `replace: true` to avoid history pollution

### Button Positioning:
1. Wrap input in relative positioned container
2. Position button absolutely on right side
3. Add right padding to input to prevent text overlap
4. Ensure button is clickable and doesn't interfere with input focus

## Implementation Details

### Icon Component Structure:
```
- 16x16px default size (configurable via className)
- Filled gray circle background
- White X in center
- Hover state with darker background
- Cursor pointer on hover
```

### Input Container Structure:
```
<div className="relative">
  <Input 
    className="pr-8"  // padding for button space
    value={searchTerm}
    onChange={...}
  />
  {searchTerm && (
    <button className="absolute right-2 top-1/2 -translate-y-1/2">
      <ClearButtonIcon />
    </button>
  )}
</div>
```

### Event Handling:
- Click event on button calls clear handler
- Prevent event bubbling to avoid input focus issues
- Maintain keyboard accessibility (Enter/Space to activate)
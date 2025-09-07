# Part Details Location Display Fixes

## Brief Description

Fix three issues in the part details page related to how stock locations are displayed and edited:
1. Show the description of the box in Stock Locations
2. In edit mode, make the box a drop down combobox of all available boxes  
3. The text "Stock Locations" is shown twice

## Files to Modify

### `src/components/parts/part-location-grid.tsx`
- **LocationRow component (lines 123-251)**: Update to display aligned columns format with box description
- **AddLocationRow component (lines 260-388)**: Replace box number input with a dropdown selector
- **PartLocationGrid component (lines 19-111)**: Remove duplicate "Stock Locations" heading (line 68), add box data fetching

### `src/components/parts/box-selector.tsx` (NEW)
- Create new component for box selection dropdown
- Similar pattern to existing `mounting-type-selector.tsx`

## Implementation Steps

### Phase 1: Add Box Description Display

1. **Fetch box data in PartLocationGrid**
   - Import `useGetBoxes` from `@/lib/api/generated/hooks`
   - Call the hook to get all boxes with their descriptions
   - Create a mapping of box_no to description for quick lookup

2. **Update LocationRow display**
   - Change from current horizontal layout to aligned column format
   - Display as four columns: "Box Name | Location | Quantity | Actions"
   - Example: "#1 Assorted big components | 4 | 7 | Remove"
   - Use CSS flexbox or grid for proper text alignment
   - Use the box mapping to look up description by box_no

### Phase 2: Create Box Selector Component

1. **Create BoxSelector component**
   - Accept props: `value` (current box number), `onChange` (callback), `error` (validation), `placeholder`
   - Fetch all boxes using `useGetBoxes` hook
   - Render as HTML select element with consistent styling (matching mounting-type-selector.tsx pattern)
   - Display options as "Box 1: Description" format
   - Handle empty/loading states

2. **Update AddLocationRow to use BoxSelector**
   - Replace the current box number input (line 328-338) with BoxSelector component
   - Pass selected box number to the API call
   - Maintain existing validation and error handling

### Phase 3: Fix Duplicate Heading

1. **Remove duplicate "Stock Locations" text**
   - Keep the CardTitle in part-details.tsx (line 308)
   - Remove the h4 heading in part-location-grid.tsx (line 68)
   - Ensure consistent heading hierarchy

## Data Flow

1. **Box data fetching**:
   - `useGetBoxes()` → Returns array of boxes with {box_no, description, capacity}
   - Cache in component state for performance

2. **Box selection flow**:
   - User clicks "Add Location" → Shows AddLocationRow
   - BoxSelector fetches and displays all boxes
   - User selects box from dropdown → Updates local state
   - User enters location number and quantity
   - Submit → Calls addStockMutation with box_no, loc_no, qty

3. **Display enhancement**:
   - LocationRow receives location data {box_no, loc_no, qty}
   - Look up box description from cached boxes data
   - Format as aligned columns: "#{box_no} {description} | {loc_no} | {qty} | Remove"
   - Use consistent column widths for proper alignment

## Error Handling

- Handle loading state while fetching boxes
- Handle error if boxes fetch fails (fallback to showing just numbers)
- Maintain existing validation for location numbers and quantities
- Show appropriate error messages for invalid box selection

## Testing Considerations

- Verify box descriptions appear in existing locations
- Test box dropdown shows all available boxes
- Ensure "Stock Locations" heading appears only once
- Test error states when box data fails to load
- Verify keyboard navigation works in box dropdown
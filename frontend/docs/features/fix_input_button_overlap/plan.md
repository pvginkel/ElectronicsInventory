# Fix Input Button Overlap

## Brief Description

The Input component in the UI library has a layout issue where text overlaps with action buttons when both a clear button (X) and an action button (e.g., external link icon) are present. This occurs in fields like "Product Page URL" and "Seller Link" where the right padding is insufficient to accommodate both buttons.

## Files to Modify

### `/src/components/ui/input.tsx`
- **Current Issue**: Line 18 sets a fixed `pr-10` (2.5rem) padding when any right content exists (`hasRightContent`), regardless of whether there's one button or two
- **Functions to modify**:
  - Main `Input` component (lines 12-64)
  - Specifically the padding calculation logic (lines 17-19)

## Implementation Steps

1. **Analyze button presence** (line 17)
   - Keep existing check: `const hasRightContent = action || (clearable && value)`
   - Add new check to determine if both buttons are present:
     ```
     const hasBothButtons = action && clearable && value
     ```

2. **Update padding calculation** (line 18)
   - Replace single `paddingRightClass` with conditional logic:
     - If `hasBothButtons`: apply `pr-16` (4rem) to accommodate both buttons
     - Else if `hasRightContent`: keep existing `pr-10` (2.5rem) for single button
     - Else: no additional padding

3. **Verify button container spacing** (line 43)
   - Current implementation uses `gap-1` between buttons which should be sufficient
   - No changes needed to the button container layout

## Testing Considerations

After implementation, verify the fix on:
- `/src/components/parts/ai-part-review-step.tsx` - Product Page URL field (line 422-443)
- `/src/components/parts/ai-part-review-step.tsx` - Seller Link field (line 460-483)
- Any other Input components that use both `clearable` and `action` props simultaneously
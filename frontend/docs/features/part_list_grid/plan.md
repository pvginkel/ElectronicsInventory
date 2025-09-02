# Convert Part List to Responsive Grid Layout

## Brief Description

Transform the current vertical list of parts into a responsive grid layout with 2 columns on Full HD displays, adapting to different screen sizes. Redesign the part cards to better fit the grid format with the cover image shown inline next to the main part details on a single line, with secondary metadata displayed below.

## Files to Modify

### Core Component Changes

1. **`src/components/parts/part-list.tsx`**
   - **PartList component**: Change the parts container from `<div className="space-y-2">` to responsive grid layout
   - **PartListItem component**: Redesign the card layout to be more compact and grid-appropriate
   - **Loading skeleton**: Update loading state to use grid layout

### New Grid Layout Implementation

The grid container will use responsive Tailwind classes:
- `grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4`
- Mobile: 1 column
- Medium screens (768px+, including Full HD): 2 columns  
- Extra large screens (1280px+): 3 columns

### Part Card Redesign Algorithm

**Current Layout Structure:**
```
[Cover Image - 64x64]
[Part Description + Quantity]
[Part ID]
[Metadata Row: Manufacturer Code, Type, Mount, Package, Voltage]
[Tags]
```

**New Grid-Optimized Layout:**
```
Row 1: [Cover Image 48x48] [Description + Manufacturer Code] [Quantity Badge]
Row 2: [Part ID (monospace)]
Row 3: [Type | Mount | Package | Voltage badges - inline]
Row 4: [Tags - wrapped]
```

### Specific Layout Changes

1. **Top Section (horizontal layout)**:
   - Cover image: Reduce from 64x64 to 48x48 pixels for better proportions
   - Description and manufacturer code: Stack vertically in middle section
   - Quantity: Move to right side as a badge

2. **Part ID Section**:
   - Keep on separate line in monospace font
   - Maintain current styling

3. **Metadata Section**:
   - Convert from individual spans to inline badges
   - Use pipe separators between items
   - Wrap to next line if needed

4. **Tags Section**:
   - Keep existing tag styling
   - Ensure proper wrapping in grid context

### Responsive Behavior

- Cards maintain consistent height within each row using flexbox
- Text truncation with ellipsis for very long descriptions
- Cover images maintain aspect ratio
- Metadata badges wrap appropriately
- All interactive elements (click handlers, hover states) preserved

### Pattern Consistency

Following existing codebase patterns:
- Grid responsive classes match `box-list.tsx` pattern: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`
- Gap spacing consistent with other grids: `gap-4`
- Card styling maintains existing hover states and click interactions
- Loading skeleton adapts to grid format

## Step-by-Step Implementation

1. **Grid Container Transformation**:
   - Replace `<div className="space-y-2">` with `<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">`
   - Update loading skeleton to use same grid classes

2. **PartListItem Redesign**:
   - Restructure JSX to use horizontal layout for main info
   - Adjust cover image size from "small" (64px) to custom 48px
   - Reorganize metadata display to be more compact
   - Ensure responsive behavior works correctly

3. **Visual Refinements**:
   - Maintain card padding and spacing
   - Preserve all existing functionality (click handlers, hover states)
   - Test text overflow handling
   - Verify tag wrapping behavior

## Testing Requirements

- Verify layout works correctly at different viewport widths
- Ensure all interactive elements remain functional
- Test with varying content lengths (long descriptions, many tags)
- Confirm loading states display correctly in grid format
- Validate accessibility of new layout
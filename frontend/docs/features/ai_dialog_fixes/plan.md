# AI Parts Dialog UI Fixes - Technical Plan

## Overview
Fix UI/UX issues in the AI parts creation dialog: document grid tile sizing, dialog scrolling behavior, URL field enhancements, and text field clear buttons.

## Files to Modify

### 1. Document Grid Tile Sizing
- `/src/components/documents/document-grid.tsx`
  - Update grid classes from responsive columns to fixed-width tiles
  - Change from `grid-cols-2 md:grid-cols-3...` to using CSS Grid with `repeat(auto-fill, minmax(...))`
  
### 2. Dialog Scrolling Behavior  
- `/src/components/parts/ai-part-review-step.tsx`
  - Restructure layout to have fixed header/footer with scrollable content area
  - Move from `flex-1 overflow-y-auto` on content div to proper height constraints
  - Apply `max-h-[calc(100vh-200px)]` and `overflow-y-auto` to the middle section

### 3. URL Field Enhancements
- `/src/components/ui/input.tsx`
  - Add support for an `action` prop that renders a button on the right side of input
  - Create variant for URL inputs with integrated "open" button

- `/src/components/parts/ai-part-review-step.tsx`
  - Add open buttons to `productPageUrl` field (line 292)
  - Add open buttons to `sellerLink` field (line 315)
  - Implement click handlers that call `window.open(url, '_blank')`

### 4. Text Field Clear Buttons
- `/src/components/ui/input.tsx`
  - Add `clearable` prop to enable clear button
  - Add clear button (X icon) that appears when field has value
  - Position button on the right side inside the input
  - Handle click to clear value and focus field

- `/src/components/parts/ai-part-review-step.tsx`
  - Add `clearable` prop to all text input fields
  - Update `updateField` function calls to handle clearing

## Implementation Details

### Document Grid Fixed Tiles
Replace responsive grid columns with CSS Grid auto-fill:
```css
grid-template-columns: repeat(auto-fill, minmax(200px, 1fr))
```
This ensures tiles maintain 200px minimum width and grow evenly to fill container.

### Dialog Scrolling Structure
New layout structure for review step:
```
<div className="flex flex-col h-full">
  <div className="flex-shrink-0"><!-- Header --></div>
  <div className="flex-1 overflow-y-auto"><!-- Scrollable content --></div>
  <div className="flex-shrink-0"><!-- Footer with actions --></div>
</div>
```

### URL Field Open Button
Add ExternalLink icon button that:
- Only shows when URL field has valid value
- Opens URL in new tab using `window.open()`
- Has proper accessibility attributes

### Clear Button Implementation
- Use X icon from lucide-react or similar
- Show only when field has value
- onClick: clear field value and call focus()
- Position absolutely within input container
- Account for padding to prevent text overlap

## Validation
- Ensure document grid tiles maintain consistent size at all viewport widths
- Verify scrolling only occurs in content area, not entire dialog
- Test URL open buttons work with various URL formats
- Confirm clear buttons properly clear and focus fields
- Check that all UI elements remain accessible via keyboard navigation
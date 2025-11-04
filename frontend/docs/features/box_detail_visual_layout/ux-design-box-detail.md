# UX Design: Box Detail View Redesign

## Problem Statement

The current box detail view shows locations and their parts in a basic list format. For users working with physical inventory, this isn't helpful because:

1. Parts in locations often aren't labeled physically
2. The only way to identify parts is by matching what's visible in the box to information in the system (photos, descriptions, specs)
3. Some locations have many parts (9+), making scanning difficult
4. The view isn't optimized for the primary use case: standing at a physical box and identifying what's in each location

## User Context

- **Scale**: Small inventory (~7 boxes, not expected to grow significantly)
- **Access pattern**: User searches for box by its label/description
- **Primary workflow**: Visual identification of physical parts by matching to system data
- **Device**: Desktop
- **Key data points**: Thumbnail image, name/description, quantity, part number

## Design Principles

1. **Visual-first**: Thumbnails are the primary identifier
2. **Everything visible**: No collapsing, no pagination within the view
3. **Scannable**: Easy to quickly browse all parts in all locations
4. **Minimal interaction**: Click through to details is the main action
5. **Location-aware**: Locations are organized left-to-right, top-to-bottom

## Proposed Design

### Page Structure

```
┌─────────────────────────────────────────────────────────────┐
│ [← Back to Boxes]                           [Search: _____] │
│                                                               │
│ Box: [Box Name/Description]                                  │
│ [Edit Box] [Add Location]                                    │
│                                                               │
│ ┌───────────────────────────────────────────────────────┐  │
│ │ Location: [Location 1 Name]                           │  │
│ │ ─────────────────────────────────────────────────────  │  │
│ │                                                         │  │
│ │ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐      │  │
│ │ │ [Image] │ │ [Image] │ │ [Image] │ │ [Image] │      │  │
│ │ │         │ │         │ │         │ │         │      │  │
│ │ │ Name    │ │ Name    │ │ Name    │ │ Name    │      │  │
│ │ │ PN-123  │ │ PN-456  │ │ PN-789  │ │ PN-012  │      │  │
│ │ │ Qty: 50 │ │ Qty: 12 │ │ Qty: 8  │ │ Qty: 3  │      │  │
│ │ └─────────┘ └─────────┘ └─────────┘ └─────────┘      │  │
│ │                                                         │  │
│ └───────────────────────────────────────────────────────┘  │
│                                                               │
│ ┌───────────────────────────────────────────────────────┐  │
│ │ Location: [Location 2 Name]                           │  │
│ │ ─────────────────────────────────────────────────────  │  │
│ │                                                         │  │
│ │ ┌─────────┐                                            │  │
│ │ │ [Image] │                                            │  │
│ │ │         │                                            │  │
│ │ │ Name    │                                            │  │
│ │ │ PN-345  │                                            │  │
│ │ │ Qty: 2  │                                            │  │
│ │ └─────────┘                                            │  │
│ │                                                         │  │
│ └───────────────────────────────────────────────────────┘  │
│                                                               │
│ ┌───────────────────────────────────────────────────────┐  │
│ │ Location: [Location 3 Name]                           │  │
│ │ ─────────────────────────────────────────────────────  │  │
│ │                                                         │  │
│ │ [No parts in this location]                           │  │
│ │                                                         │  │
│ └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Visual Specifications

#### Part Card
- **Size**: ~180-200px wide, responsive grid (4-5 cards per row on desktop)
- **Image**: Square thumbnail, prominent, fills most of card space
- **Placeholder**: Generic component icon if no image available
- **Name**: 2-3 lines max, truncated with ellipsis, full text in tooltip
- **Part Number**: Smaller, muted text
- **Quantity**: Distinct visual treatment (e.g., badge or colored text)
- **Interaction**: Entire card is clickable, subtle hover effect
- **Cursor**: Pointer to indicate clickability

#### Location Section
- **Layout**: Full-width container with subtle border/background
- **Header**: Location name, medium weight, with visual separator line below
- **Spacing**: Generous padding around cards, clear separation between locations
- **Order**: Displayed in database order (representing physical left-to-right, top-to-bottom)
- **Empty state**: Clear message "No parts in this location"

#### Search/Filter
- **Position**: Top-right of page, always visible
- **Scope**: Filters across ALL locations (not per-location)
- **Behavior**: Live filtering as user types
- **Matching**: Name, description, part number, specifications
- **Visual feedback**: Dim or hide non-matching cards, keep location headers visible
- **Clear button**: Easy way to reset filter

#### Box Header
- **Box name**: Large, prominent
- **Actions**: Edit box, Add location buttons (secondary visual weight)
- **Back link**: Clear navigation back to boxes list

### Interaction Details

1. **Loading state**: Skeleton cards while fetching data
2. **Click behavior**: Navigate to part detail page
3. **Search behavior**:
   - Instant filter (no submit button)
   - Maintains location grouping
   - Shows count of filtered results
4. **Empty location**: Show header with "No parts" message
5. **Responsive behavior**: Card grid reflows, maintains readability

### Information Hierarchy (Priority Order)

1. **Image** - Primary visual identifier
2. **Name/Description** - Secondary identifier
3. **Quantity** - Important for inventory awareness
4. **Part Number** - Tertiary identifier
5. **Location grouping** - Context for physical organization

### Future Considerations (Out of Scope)

- Spatial layout visualization (explicitly not wanted)
- Inline quantity updates (handled on detail page)
- Part movement between locations (handled on detail page)
- Label printing (handled on detail page)
- Mobile optimization (desktop-only for now)
- Drag-and-drop reordering

## Success Metrics

- **Speed**: User can identify any part in a box within seconds
- **Confidence**: Visual matching reduces uncertainty about part identity
- **Completeness**: All parts visible at once without scrolling excessively
- **Efficiency**: Single click to get full part details

## Implementation Notes

### Data Requirements
- Box with locations (ordered)
- Each location's parts with:
  - Name
  - Description (for search)
  - Part number
  - Quantity on hand
  - Primary image/thumbnail
  - Specifications (for search)

### Components to Create/Update
- `BoxDetail` page component (major redesign)
- `LocationSection` component (new)
- `PartCard` component (new, reusable)
- Search/filter logic (new)

### Technical Considerations
- Image loading performance (thumbnails, lazy loading)
- Search performance (client-side filtering for small datasets)
- Layout reflow on window resize
- Accessibility (keyboard navigation, ARIA labels)
- Empty states for boxes with no locations
- Skeleton loading states

### Related Views
Consider applying similar visual patterns to:
- Parts list (already uses cards?)
- Shopping lists (if showing part thumbnails)
- Collection views

## Open Questions

1. Should we show box-level metadata (dimensions, color, notes)?
2. Do we need "Add Part to Location" quick action, or always through part detail?
3. Should location names be editable inline, or only through separate flow?
4. Do we want to show which locations are used vs. empty at a glance (capacity indicator)?

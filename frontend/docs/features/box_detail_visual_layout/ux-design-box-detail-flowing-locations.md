# UX Design: Box Detail View - Flowing Location Containers

## Concept

Location containers flow left-to-right, top-to-bottom with parts inside each container. Small locations take minimal space and sit side-by-side. Large locations span multiple rows but remain contained. Empty locations are hidden.

## Visual Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│ [← Boxes]     Box: Component Storage              [Search: ______] │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│ ┌─ Location 1 ──────────────────────────────────────────────┐      │
│ │ [img] [img] [img] [img]                                    │      │
│ │ Part  Part  Part  Part                                     │      │
│ │ A     B     C     D                                        │      │
│ │                                                             │      │
│ │ [img] [img] [img] [img]                                    │      │
│ │ Part  Part  Part  Part                                     │      │
│ │ E     F     G     H                                        │      │
│ │                                                             │      │
│ │ [img]                                                       │      │
│ │ Part                                                        │      │
│ │ I                                                           │      │
│ └─────────────────────────────────────────────────────────────┘      │
│                                                                       │
│ ┌─ Location 2 ─┐  ┌─ Location 3 ─────────────────┐                 │
│ │ [img]        │  │ [img] [img] [img] [img]      │                 │
│ │ Part         │  │ Part  Part  Part  Part       │                 │
│ │ J            │  │ K     L     M     N          │                 │
│ └──────────────┘  └──────────────────────────────┘                 │
│                                                                       │
│ ┌─ Location 4 ─┐  ┌─ Location 5 ─┐  ┌─ Location 6 ─┐              │
│ │ [img]        │  │ [img]        │  │ [img]        │              │
│ │ Part         │  │ Part         │  │ Part         │              │
│ │ O            │  │ P            │  │ Q            │              │
│ └──────────────┘  └──────────────┘  └──────────────┘              │
└─────────────────────────────────────────────────────────────────────┘
```

## Layout Behavior

### Flow Rules

1. **Location containers flow left-to-right, top-to-bottom** in the main viewport
2. **Parts within each location** also flow left-to-right, wrapping as needed
3. **Small locations** (1-2 parts) naturally sit side-by-side
4. **Large locations** (9 parts @ 4 per row) take ~2.25 rows worth of space and push next location to new row
5. **Empty locations** are not rendered

### Example Scenarios

**Scenario 1: Mixed sizes**
```
┌─ Loc A (9 parts) ─────────────────────────────┐  ┌─ Loc B (1) ─┐
│ [img] [img] [img] [img]                        │  │ [img]       │
│ [img] [img] [img] [img]                        │  └─────────────┘
│ [img]                                          │
└────────────────────────────────────────────────┘  ┌─ Loc C (1) ─┐
                                                     │ [img]       │
┌─ Loc D (2) ──────────┐  ┌─ Loc E (1) ─┐         └─────────────┘
│ [img] [img]          │  │ [img]       │
└──────────────────────┘  └─────────────┘
```

**Scenario 2: All single parts**
```
┌─ Loc A ─┐  ┌─ Loc B ─┐  ┌─ Loc C ─┐  ┌─ Loc D ─┐  ┌─ Loc E ─┐
│ [img]   │  │ [img]   │  │ [img]   │  │ [img]   │  │ [img]   │
└─────────┘  └─────────┘  └─────────┘  └─────────┘  └─────────┘
```

**Scenario 3: One large, many small**
```
┌─ Main Location (9 parts) ──────────────────────────────────────┐
│ [img] [img] [img] [img]                                         │
│ Part  Part  Part  Part                                          │
│                                                                  │
│ [img] [img] [img] [img]                                         │
│ Part  Part  Part  Part                                          │
│                                                                  │
│ [img]                                                            │
│ Part                                                             │
└──────────────────────────────────────────────────────────────────┘

┌─ Loc 2 ─┐  ┌─ Loc 3 ─┐  ┌─ Loc 4 ─┐  ┌─ Loc 5 ─┐
│ [img]   │  │ [img]   │  │ [img]   │  │ [img]   │
└─────────┘  └─────────┘  └─────────┘  └─────────┘
```

## Design Specifications

### Location Container
- **Border**: 2px solid, distinct color (e.g., blue-500 or slate-400)
- **Border radius**: 8px
- **Padding**: 12px
- **Gap between locations**: 16px (horizontal and vertical)
- **Header**: Location name in top-left corner, small text, inside the border
- **Background**: Subtle (slate-50 or transparent)
- **Sizing**: Container grows to fit content

### Location Header
```
┌─ Location Name ─────────┐
│ [parts grid here]       │
```
- Position: Top-left, small badge or label style
- Font: 12px, medium weight
- Color: Muted (slate-600)
- Spacing: 4px margin below before parts grid

### Part Cards
- **Size**: 140-150px square
- **Layout within location**: CSS Grid, 4 columns, auto-rows
- **Gap**: 12px between cards
- **Content**: Same as compact design (image, name, PN, qty)

### Container Math

For 4 parts per row at 150px each:
- 4 cards × 150px = 600px
- Gaps: 3 × 12px = 36px
- Padding: 2 × 12px = 24px
- Border: 2 × 2px = 4px
- **Total location width**: ~664px

Location with 1 part:
- 1 card × 150px = 150px
- Padding: 24px
- Border: 4px
- **Total**: ~178px (can fit 3-4 per row on desktop)

### Main Container
- **Layout**: Flexbox with wrap, or CSS Grid with auto-fit
- **Gap**: 16px
- **Alignment**: flex-start (top-aligned)

## Advantages

1. **Maximum density**: Small locations don't waste vertical space
2. **Natural grouping**: Visual boundary clearly shows which parts belong together
3. **Scannable**: Easy to see location structure at a glance
4. **Flexible**: Adapts to any distribution of parts across locations
5. **Clean**: No empty location clutter
6. **Efficient**: User can quickly identify "that location with 4 parts in the middle"

## Implementation Details

### CSS Structure

```css
/* Main container - locations flow here */
.locations-container {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: flex-start;
  padding: 16px;
}

/* Individual location container */
.location-container {
  border: 2px solid var(--border-location);
  border-radius: 8px;
  padding: 12px;
  background: var(--bg-location);
  /* Allow container to grow based on content */
  flex: 0 1 auto;
  max-width: 100%; /* Don't exceed viewport */
}

/* Location header */
.location-header {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted);
  margin-bottom: 8px;
}

/* Parts grid within location */
.location-parts-grid {
  display: grid;
  grid-template-columns: repeat(4, 150px);
  gap: 12px;
}

/* Part card */
.part-card {
  width: 150px;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px;
  background: white;
}

/* Responsive: fewer columns on smaller screens */
@media (max-width: 1400px) {
  .location-parts-grid {
    grid-template-columns: repeat(3, 150px);
  }
}

@media (max-width: 1000px) {
  .location-parts-grid {
    grid-template-columns: repeat(2, 150px);
  }
}
```

### React Component Structure

```tsx
<div className="locations-container">
  {locations
    .filter(loc => loc.parts.length > 0) // Skip empty
    .map(location => (
      <div key={location.id} className="location-container">
        <div className="location-header">{location.name}</div>
        <div className="location-parts-grid">
          {location.parts.map(part => (
            <PartCard key={part.id} part={part} />
          ))}
        </div>
      </div>
    ))}
</div>
```

### Search/Filter Behavior

When filtering:
1. Filter parts within each location
2. If location has no matching parts, hide the entire container
3. Maintain location boundaries for matching parts

## Visual Distinction Options

### Border Styles
- **Option A**: Solid color border (2px, slate-400)
- **Option B**: Dashed border for subtlety (2px dashed, slate-300)
- **Option C**: Shadow instead of border (0 2px 8px rgba(0,0,0,0.1))
- **Option D**: Colored left edge (4px solid color, thin border elsewhere)

### Background Options
- **Option A**: Transparent (just border)
- **Option B**: Subtle tint (slate-50)
- **Option C**: Very light color per location (slate-50, blue-50, purple-50 alternating)

**Recommendation**: Solid slate-400 border with transparent background keeps it clean and distinct without overwhelming the part images.

## Edge Cases

### Very Large Location (15+ parts)
- Container naturally spans multiple rows
- May push all other locations below it
- Still maintains visual grouping

### Single Part in Many Locations
- Multiple small containers flow nicely
- Takes up similar space to old list view
- But now with visual boundaries

### Search Results
- Location with 9 parts, only 2 match filter
- Show location with just those 2 cards
- Container shrinks to fit

### Mobile/Narrow Viewport
- Reduce parts-per-row to 2-3
- Location containers stack vertically
- Maintains grouping

## Comparison to Previous Designs

| Aspect | Section Headers | Masonry | Flowing Containers |
|--------|----------------|---------|-------------------|
| Density | Medium | High | High |
| Location grouping | ✓ Clear | ✗ Lost | ✓ Very clear |
| Visual mapping | ✓ Good | ✗ Poor | ✓ Excellent |
| Wasted space | High | Low | Low |
| Scanability | Medium | High | High |
| Implementation | Simple | Medium | Medium |

**Winner**: Flowing containers give you the best of both worlds - high density like masonry, clear grouping like sections.

## Open Questions

1. **Location order**: Display in database order (physical left-to-right, top-to-bottom)?
2. **Border color**: Single color for all, or alternate colors for visual variety?
3. **Parts per row**: 4 cards at 150px each, or 5 cards at 140px for even more density?
4. **Empty state**: "No locations with parts" message if box is completely empty?
5. **Add actions**: Quick "Add Part" button in each location header?

## Recommended Implementation

1. Start with 4 parts per row at 150px
2. Solid slate-400 border, transparent background
3. Location name as simple text label in top-left
4. Hide empty locations entirely
5. Display locations in their current database order
6. Search filters parts and hides empty locations

This design maximizes density while maintaining the mental model of "physical locations containing parts."

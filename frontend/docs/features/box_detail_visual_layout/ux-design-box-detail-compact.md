# UX Design: Box Detail View - Compact Masonry Variant

## Alternative Design: Masonry Layout

This variant optimizes for information density using a masonry-style layout similar to Home Assistant dashboards.

## Visual Approach

### Masonry Grid Layout

```
┌────────────────────────────────────────────────────────────────────┐
│ [← Boxes]     Box: Electronic Components Drawer      [Search: ___] │
├────────────────────────────────────────────────────────────────────┤
│                                                                      │
│ ┌──────────┬──────────┬──────────┬──────────┬──────────┐          │
│ │Location 1│          │Location 2│Location 3│          │          │
│ ├──────────┤ [Image]  ├──────────┼──────────┤ [Image]  │          │
│ │ [Image]  │          │ [Image]  │ [Image]  │          │          │
│ │          │ 100kΩ    │          │          │ Red LED  │          │
│ │ ATmega328│ Resistor │ Cap 10µF │ 555 Timer│ 5mm      │          │
│ │ MCU      │ PN-456   │ PN-789   │ PN-321   │ PN-654   │          │
│ │ PN-123   │ Qty: 200 │ Qty: 50  │ Qty: 15  │ Qty: 100 │          │
│ │ Qty: 5   ├──────────┼──────────┼──────────┼──────────┤          │
│ ├──────────┤Location 1│Location 1│Location 3│Location 1│          │
│ │Location 1│ [Image]  │ [Image]  │ [Image]  │ [Image]  │          │
│ │ [Image]  │          │          │          │          │          │
│ │          │ Resistor │ Capacitor│ Diode    │ Switch   │          │
│ │ ESP32    │ 220Ω     │ 100nF    │ 1N4148   │ Tactile  │          │
│ │ Dev Board│ PN-457   │ PN-790   │ PN-322   │ PN-655   │          │
│ │ PN-124   │ Qty: 500 │ Qty: 300 │ Qty: 50  │ Qty: 20  │          │
│ │ Qty: 3   └──────────┴──────────┴──────────┴──────────┘          │
│ └──────────┘                                                        │
└────────────────────────────────────────────────────────────────────┘
```

### Design Changes from Original

#### 1. Compact Part Cards
- **Width**: 140-160px (narrower than original)
- **Height**: Variable based on content
- **Image**: Still square and prominent, but smaller (120x120px)
- **Content**: Tighter line-height, reduced padding
- **Location tag**: Small chip/badge showing location name on each card

#### 2. Masonry Grid
- **Layout**: CSS masonry or column-count approach
- **Columns**: 5-6 on desktop (vs 4-5 in original)
- **Gaps**: Minimal (8-12px vs 16-24px)
- **Packing**: Cards flow into available space, no rigid rows
- **No location sections**: Location is just a property on each card

#### 3. Information Display
```
┌──────────────┐
│  Location 1  │  <- Small badge at top
├──────────────┤
│   [Image]    │  <- 120x120px thumbnail
│   120x120    │
├──────────────┤
│ ATmega328    │  <- Name (bold, 2 lines max)
│ Microcontrol │
├──────────────┤
│ PN-123       │  <- Part number (1 line, small)
├──────────────┤
│ Qty: 5       │  <- Quantity (badge/pill style)
└──────────────┘
```

### Pros of Masonry Approach

1. **Higher density**: ~50-60% more cards visible above the fold
2. **Less whitespace**: Cards pack tightly regardless of content length
3. **Efficient scanning**: More parts visible at once
4. **Natural flow**: Eye can scan continuously without jumping between sections

### Cons of Masonry Approach

1. **Lost location grouping**: Parts from same location are scattered
2. **Harder to map**: Physical left-to-right, top-to-bottom order is lost
3. **Cognitive load**: Need to read location badge on each card
4. **Less intuitive**: Doesn't match physical organization

## Hybrid Approach: Compact Sections

A middle ground that keeps location grouping but reduces whitespace:

```
┌─────────────────────────────────────────────────────────────────┐
│ [← Boxes]   Box: Parts Storage         [Search: ___] [⚙ View]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│ Location 1 ───────────────────────────────────────────────────  │
│ ┌──────┬──────┬──────┬──────┬──────┬──────┐                    │
│ │[Img] │[Img] │[Img] │[Img] │[Img] │[Img] │                    │
│ │Name  │Name  │Name  │Name  │Name  │Name  │                    │
│ │PN-1  │PN-2  │PN-3  │PN-4  │PN-5  │PN-6  │                    │
│ │Q: 10 │Q: 5  │Q: 23 │Q: 1  │Q: 50 │Q: 8  │                    │
│ └──────┴──────┴──────┼──────┴──────┴──────┘                    │
│ ┌──────┬──────┬──────┘                                          │
│ │[Img] │[Img] │[Img] │                                          │
│ │Name  │Name  │Name  │                                          │
│ │PN-7  │PN-8  │PN-9  │                                          │
│ │Q: 12 │Q: 3  │Q: 99 │                                          │
│ └──────┴──────┴──────┘                                          │
│                                                                   │
│ Location 2 ───────────────────────────────────────────────────  │
│ ┌──────┐                                                         │
│ │[Img] │                                                         │
│ │Name  │                                                         │
│ │PN-10 │                                                         │
│ │Q: 2  │                                                         │
│ └──────┘                                                         │
│                                                                   │
│ Location 3 ───────────────────────────────────────────────────  │
│ ┌──────┬──────┬──────┬──────┐                                  │
│ │[Img] │[Img] │[Img] │[Img] │                                  │
│ │Name  │Name  │Name  │Name  │                                  │
│ │PN-11 │PN-12 │PN-13 │PN-14 │                                  │
│ │Q: 44 │Q: 7  │Q: 15 │Q: 2  │                                  │
│ └──────┴──────┴──────┴──────┘                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Hybrid Specifications

#### Compact Cards
- **Width**: 140-160px (smaller)
- **Padding**: 8px (vs 12-16px)
- **Gap**: 10px (vs 16-20px)
- **Image**: 110x110px (vs 150x150px)
- **Typography**: Slightly smaller font sizes

#### Location Sections
- **Header**: Single line with divider, no heavy container
- **Spacing**: Minimal padding (12px top/bottom)
- **Background**: Optional subtle background or none at all
- **Columns**: 5-6 cards per row (vs 4-5)

#### Layout Math
With 1400px viewport width:
- **Original**: 4 cards × 200px = 800px + gaps ≈ 900px used
- **Compact**: 6 cards × 150px = 900px + gaps ≈ 1020px used
- **Gain**: ~35% more cards per row

### Recommended Approach: Compact Sections

**Why this works best for your use case:**

1. **Preserves location grouping**: Matches physical organization
2. **Higher density**: 5-6 cards per row vs 4-5
3. **Better scanning**: More parts visible without scrolling
4. **Maintains mental model**: Location sections still clear
5. **Responsive degradation**: Can drop to 4-5 columns on smaller displays

### Implementation Details

#### CSS Approach
```css
/* Location section */
.location-section {
  margin-bottom: 16px; /* Reduced from 24-32px */
}

.location-header {
  font-size: 14px;
  font-weight: 500;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 12px;
}

/* Parts grid - masonry within location */
.parts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
  /* OR for true masonry: */
  column-count: 5;
  column-gap: 10px;
}

/* Part card */
.part-card {
  width: 140px; /* Fixed or let grid control */
  break-inside: avoid; /* For masonry */
  padding: 8px;
  border-radius: 6px;
  border: 1px solid var(--border);
}

.part-card img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: 4px;
}

.part-name {
  font-size: 13px;
  line-height: 1.3;
  margin-top: 6px;
  /* 2 lines max */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.part-number {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 2px;
}

.part-quantity {
  font-size: 12px;
  font-weight: 500;
  margin-top: 4px;
  color: var(--text-accent);
}
```

#### True Masonry Option
If parts vary significantly in content length, use CSS masonry:
- `column-count: 5` to create 5 columns
- Cards flow top-to-bottom, then next column
- Variable heights pack naturally
- Location sections span all columns

### Alternative: Table View Toggle

Provide a view switcher for users who want even higher density:

**Card View** (default):
- Visual, thumbnail-focused
- Good for identification

**Table View** (compact):
- Traditional table with small thumbnails
- More rows visible
- Better for quantity checking

```
[📇 Cards] [📋 Table]  <- View toggle

Table View:
┌────────────────────────────────────────────────────────────┐
│ Location │ [Img] │ Name          │ Part #  │ Qty │ Actions │
├──────────┼───────┼───────────────┼─────────┼─────┼─────────┤
│ Loc 1    │ [▫]   │ ATmega328 MCU │ PN-123  │ 5   │ [→]     │
│ Loc 1    │ [▫]   │ ESP32 Dev Brd │ PN-124  │ 3   │ [→]     │
│ Loc 1    │ [▫]   │ 100kΩ Resist  │ PN-456  │ 200 │ [→]     │
│ Loc 2    │ [▫]   │ Capacitor 10µF│ PN-789  │ 50  │ [→]     │
└────────────────────────────────────────────────────────────┘
```

## Recommendation

**Go with the Hybrid Compact Sections approach:**
- Reduces whitespace by 30-40%
- Maintains location grouping (important for your workflow)
- Increases cards per row from 4-5 to 5-6
- Keeps visual identification strong
- Simpler to implement than true masonry

If you want even more density, add a table view toggle for power users.

Would you like me to implement the compact sections variant?

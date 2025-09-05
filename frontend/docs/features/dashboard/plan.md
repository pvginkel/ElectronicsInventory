# Dashboard Feature - UX Design & Technical Plan

## User Context & Goals

The dashboard is the **first thing users see** when opening the app. It must instantly answer:
1. **"What's the state of my inventory?"** - Health indicators and key metrics
2. **"What needs my attention?"** - Alerts, low stock, missing docs
3. **"What did I do recently?"** - Activity history for context
4. **"Where do I go from here?"** - Clear entry points to common tasks

### User Personas & Use Cases
- **Active Hobbyist**: Checks daily, needs quick status and recent changes
- **Weekend Builder**: Checks before projects, needs stock levels and part finding
- **Organizer**: Periodic cleanup sessions, needs storage insights and reorganization tools

## Visual Design Principles

### Information Architecture
1. **F-Pattern Scanning**: Most important info top-left, secondary actions right
2. **Progressive Disclosure**: Summary metrics → Details → Actions
3. **Visual Hierarchy**: Size, color, and spacing to guide attention
4. **Gestalt Grouping**: Related information clustered with clear boundaries

### Color System & Visual Indicators
```
Health/Status Colors:
- Success (Green): #10b981 - Healthy metrics, positive changes
- Warning (Amber): #f59e0b - Attention needed, medium priority
- Critical (Red): #ef4444 - Urgent issues, low stock
- Neutral (Gray): #6b7280 - Inactive, no data
- Primary (Blue): #3b82f6 - Interactive elements, links

Visual Encoding:
- Quantity changes: +green/-amber with directional arrows
- Fill levels: Gradient bars (green→amber→red)
- Time: Relative (Today/Yesterday) with fade for older items
- Categories: Consistent color mapping from API
```

## Responsive Layout Strategy

### Desktop (1280px+)
```
┌─────────────────────────────────────────────────────────┐
│ Quick Find Bar (persistent, always accessible)           │
├─────────────────────────────────────────────────────────┤
│ Key Metrics (4 cards in row)                             │
├─────────────────┬───────────────────────────────────────┤
│ Health Score     │ Quick Actions (contextual)            │
│ (visual focus)   │                                       │
├─────────────────┴───────────────────────────────────────┤
│ Storage Grid     │ Activity Timeline                     │
│ (interactive)    │ (scrollable)                          │
├─────────────────┼─────────────────┼─────────────────────┤
│ Low Stock        │ Documentation    │ Categories         │
│ Alerts           │ Coverage         │ Distribution       │
└─────────────────┴─────────────────┴─────────────────────┘
```

### Tablet (768px-1279px)
- Metrics: 2x2 grid
- Main content: Single column with alternating cards
- Insights: Horizontal scroll or stacked

### Mobile (<768px)
- Metrics: 2x2 compact grid
- All sections stack vertically
- Collapsible sections for long content
- Bottom sheet pattern for details

## Component Specifications

### 1. Quick Find Widget
**Purpose**: Instant access to any part without navigation

**UX Design**:
- **Persistent sticky header** - Always visible while scrolling
- **Auto-focus on page load** for keyboard users
- **Search-as-you-type** with 200ms debounce (faster than 300ms)
- **Keyboard navigation**: Arrow keys to select, Enter to navigate
- **Visual feedback**: Highlight on hover/focus, loading spinner
- **Smart results**: Show image thumbnail, location, quantity inline
- **Empty state**: "Start typing to search parts..." placeholder
- **Error recovery**: "No parts found. Try different keywords."

**Interaction Flow**:
1. User starts typing → Instant visual feedback (border highlight)
2. After 200ms pause → Results appear below with smooth fade-in
3. Results show: [Thumbnail] [Description] [Location] [Quick Action]
4. Click/Enter → Navigate to part (new tab with Cmd/Ctrl+Click)

### 2. Inventory Health Score
**Purpose**: Single metric representing overall system health

**UX Design**:
- **Large circular progress** (200px) as visual anchor
- **Animated on load** (0→actual over 1s) for attention
- **Color transitions**: Smooth gradient between states
- **Breakdown on hover**: Tooltip showing component scores
- **Actionable**: Click to see detailed health report

**Scoring Algorithm** (User-Friendly Weights):
```
40% - Documentation (most important for finding parts)
25% - Stock levels (avoid running out)
20% - Organization (efficient storage)
15% - Recent activity (system usage)
```

**Visual States**:
- 90-100: "Excellent" (green) with celebration animation
- 70-89: "Good" (blue-green) 
- 50-69: "Needs Attention" (amber) with gentle pulse
- 0-49: "Critical" (red) with stronger pulse

### 3. Storage Utilization Grid
**Purpose**: Visual map of physical storage with direct navigation

**UX Design**:
- **Mini-map metaphor**: Each box is a clickable zone
- **Progressive fill indicators**: Visual bars + percentage
- **Hover details**: Box name, exact usage (23/60 locations)
- **Smart sorting**: Most-used boxes first, empty boxes last
- **Visual encoding**:
  - Border thickness: Activity level (thicker = more active)
  - Background opacity: Fill level (darker = fuller)
  - Badge: Category icon if box is category-specific

**Interaction States**:
- Default: Subtle shadow, clear borders
- Hover: Elevated shadow, highlight border, show tooltip
- Clicked: Ripple effect, navigate to box details

### 4. Recent Activity Timeline
**Purpose**: Contextual history of inventory changes

**UX Design**:
- **Time-based grouping** with sticky headers:
  - "Just Now" (< 1 hour)
  - "Today" 
  - "Yesterday"
  - "This Week"
  - "Earlier"
- **Visual differentiation**:
  - Add: Green dot + icon
  - Remove: Amber dot + icon
  - Move: Blue dot + arrow icon
- **Compact but scannable**: Part name prominent, details secondary
- **Load more pattern**: Show 10 initially, "Show more" button
- **Live updates**: New items slide in from top with highlight

**Empty State**:
- Illustration of quiet warehouse
- "No recent activity"
- "Add your first part to get started" → Link to add part

### 5. Low Stock Alerts
**Purpose**: Proactive inventory management

**UX Design**:
- **Criticality levels**:
  - Critical (0-2): Red background, pulse animation
  - Low (3-5): Amber background
  - Warning (6-10): Yellow background
- **Inline actions** without navigation:
  - "Add to shopping list" (one click)
  - "Quick add stock" (inline number input)
  - "View part" (secondary action)
- **Smart grouping**: By category if multiple items
- **Dismissible**: "Ignore for now" moves to bottom

**Progressive Disclosure**:
1. Show 3 most critical
2. "+5 more" expandable section
3. "Manage all alerts" → Dedicated page

### 6. Documentation Status
**Purpose**: Encourage complete documentation

**UX Design**:
- **Gamification element**: 
  - Progress ring with percentage
  - Milestone badges (50%, 75%, 90%, 100%)
  - Streak counter for consecutive days with additions
- **Quick fix list**:
  - Top 3 undocumented parts
  - One-click "Add datasheet" opens modal
  - Drag-drop zone for bulk upload
- **Positive reinforcement**:
  - Celebrate 100% with confetti animation
  - "Well documented!" status

### 7. Category Distribution
**Purpose**: Understanding inventory composition

**UX Design**:
- **Interactive bar chart**:
  - Horizontal bars for easy label reading
  - Hover: Expand bar, show exact count
  - Click: Filter parts view by category
- **Smart insights**:
  - "Resistors taking 3 boxes (consider consolidation)"
  - "New category detected: Sensors"
- **Visual consistency**: Use category colors from API

### 8. Quick Actions (Contextual)
**Purpose**: Smart shortcuts based on current state

**UX Design**:
- **Dynamic action list** based on context:
  - If low stock exists: "Review low stock"
  - If undocumented: "Add documentation"
  - If cluttered: "Start reorganization"
  - Always: "Add part", "Search"
- **Visual hierarchy**:
  - Primary action: Filled button
  - Secondary: Outlined button
  - Tertiary: Text link
- **Keyboard shortcuts**: Display hints (⌘K for search)

## Interaction Patterns

### Loading States
- **Skeleton screens** matching component shapes
- **Staggered fade-in** for perceived performance
- **Partial loading**: Show what's ready, load rest async

### Error States
- **Inline error messages** with recovery actions
- **Graceful degradation**: Show cached data if available
- **Retry mechanisms**: Automatic (network) vs manual (user error)

### Empty States
- **Contextual illustrations** (not generic)
- **Clear call-to-action** to resolve empty state
- **Educational**: Explain value of the feature

### Refresh Pattern
- **Pull-to-refresh** on mobile
- **Auto-refresh** every 60s for real-time data
- **Manual refresh** button with loading indicator
- **Optimistic updates** for user actions

## Accessibility Requirements

### Keyboard Navigation
- Tab order: Search → Metrics → Actions → Content
- Arrow keys for grid navigation (storage boxes)
- Escape to close modals/tooltips
- Enter/Space to activate buttons

### Screen Reader Support
- Semantic HTML structure
- ARIA labels for icons and visual indicators
- Live regions for dynamic updates
- Skip links for main sections

### Visual Accessibility
- WCAG AA contrast ratios (4.5:1 minimum)
- Focus indicators (2px outline)
- Sufficient touch targets (44x44px minimum)
- Colorblind-safe palettes (not just color coding)

## Performance Optimizations

### Perceived Performance
- **Instant interactions**: Optimistic UI updates
- **Progressive data loading**: Critical data first
- **Skeleton screens**: Maintain layout during load
- **Image optimization**: Lazy load thumbnails

### Data Management
```typescript
// Parallel fetching with stale-while-revalidate
const CACHE_TIMES = {
  stats: 30,           // seconds - Most dynamic
  activity: 0,         // No cache - Real-time
  storage: 60,         // Less frequent changes
  lowStock: 45,        // Important but not instant
  categories: 300,     // Rarely changes
  documentation: 120   // Moderate frequency
}
```

### Mobile Optimizations
- Virtual scrolling for activity feed (>20 items)
- Intersection observer for lazy component loading
- Reduced motion for users with preference
- Touch-friendly tap targets

## Implementation Phases

### Phase 1: Foundation & Core Metrics
1. Create responsive dashboard layout structure
2. Implement `use-dashboard.ts` with parallel data fetching
3. Build Quick Find widget with search
4. Connect metrics cards to real API data
5. Add loading skeletons and error states

### Phase 2: Visual Health & Status
1. Implement Inventory Health Score with calculations
2. Create Storage Utilization grid with interactions
3. Add visual indicators and color system
4. Implement hover states and tooltips

### Phase 3: Activity & Insights
1. Build Recent Activity timeline with grouping
2. Create Low Stock alerts with inline actions
3. Implement Documentation Status with progress
4. Add Category Distribution visualization

### Phase 4: Polish & Delight
1. Add animations and transitions
2. Implement empty states with illustrations
3. Add keyboard navigation and accessibility
4. Optimize performance and caching
5. Add celebration animations for milestones

### Phase 5: Advanced Features
1. Customizable dashboard layout (drag-drop)
2. Data export functionality
3. Trend analysis and predictions
4. Mobile app deep linking

## Success Metrics

### User Experience KPIs
- Time to first meaningful paint: <1.5s
- Time to interactive: <3s
- Search response time: <200ms
- Error rate: <1%

### Engagement Metrics
- Daily active usage rate
- Feature adoption (% using each widget)
- Task completion rate
- User satisfaction score

## Design Tokens

```typescript
// Spacing scale (px)
const spacing = {
  xs: 4,   // Tight grouping
  sm: 8,   // Related items
  md: 16,  // Section padding
  lg: 24,  // Between sections
  xl: 32,  // Major sections
}

// Animation timings (ms)
const animation = {
  instant: 100,
  fast: 200,
  normal: 300,
  slow: 500,
  deliberate: 1000
}

// Border radius (px)
const radius = {
  sm: 4,   // Inputs, small cards
  md: 8,   // Cards, buttons
  lg: 12,  // Large cards
  full: 9999 // Pills, badges
}
```
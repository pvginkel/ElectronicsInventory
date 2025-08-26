# Location Suggestions Plan

## Brief Description

Enhance the existing location suggestion system with intelligent placement algorithms, visual guidance, capacity management, and advanced organization strategies to help users maintain optimal storage organization.

## Files and Functions to be Created or Modified

### API Integration Enhancement
- `src/lib/api/generated/` - Use and extend existing hooks:
  - `useLocationSuggestions` - **MODIFY** - Enhanced with more suggestion criteria
  - `useGetBoxes` - for capacity and layout information
  - `useGetPartsByType` - for category-based organization analysis

### Core Suggestion Components
- `src/components/suggestions/LocationSuggestionEngine.tsx` - **NEW** - Main suggestion logic coordinator
- `src/components/suggestions/SuggestionCard.tsx` - **NEW** - Individual suggestion display with reasoning
- `src/components/suggestions/SuggestionList.tsx` - **NEW** - Ranked list of location suggestions
- `src/components/suggestions/LocationVisualizer.tsx` - **NEW** - Visual representation of suggested locations
- `src/components/suggestions/CapacityIndicator.tsx` - **NEW** - Shows location/box capacity status

### Enhanced Location Selection
- `src/components/boxes/LocationGrid.tsx` - **NEW** - Visual grid showing box layouts with suggestions
- `src/components/boxes/LocationHeatmap.tsx` - **NEW** - Visual density/organization map
- `src/components/parts/AddStockDialog.tsx` - **MODIFY** - Enhanced with visual suggestion interface
- `src/components/parts/LocationPicker.tsx` - **NEW** - Advanced location picker with suggestions

### Suggestion Logic and Utilities  
- `src/lib/suggestions/location-engine.ts` - **NEW** - Core suggestion algorithms
- `src/lib/suggestions/organization-analyzer.ts` - **NEW** - Analyze current organization patterns
- `src/lib/suggestions/capacity-calculator.ts` - **NEW** - Calculate and track location capacities
- `src/hooks/use-location-suggestions.ts` - **NEW** - Enhanced suggestion hook with multiple strategies
- `src/hooks/use-organization-metrics.ts` - **NEW** - Track organization quality metrics

### Configuration and Settings
- `src/components/settings/SuggestionSettings.tsx` - **NEW** - User preferences for suggestion behavior
- `src/lib/settings/suggestion-preferences.ts` - **NEW** - Manage suggestion algorithm preferences

## Step-by-Step Implementation

### Phase 1: Enhanced Suggestion Algorithms
1. **Create location-engine.ts** - Implement multiple suggestion strategies:
   - Same-type clustering (prefer locations near similar parts)
   - Box utilization optimization (fill boxes efficiently)
   - Accessibility scoring (prefer easy-to-reach locations)
   - Capacity-aware placement (consider remaining space)

2. **Create organization-analyzer.ts** - Analyze current storage patterns:
   - Calculate type clustering metrics
   - Identify fragmentation and gaps
   - Score organization quality by category
   - Track box utilization efficiency

3. **Create capacity-calculator.ts** - Track location capacity:
   - Calculate physical space usage estimates
   - Monitor quantity-based capacity limits
   - Provide capacity warnings and recommendations

### Phase 2: Visual Suggestion Interface
1. **Create SuggestionCard component** - Display individual suggestions with:
   - Location details (box-location format)
   - Reasoning explanation ("Groups with other resistors")
   - Capacity indicator and proximity benefits
   - Accept/reject actions with one-click application

2. **Create LocationGrid component** - Visual box layout showing:
   - Current occupancy with part types
   - Suggested locations highlighted
   - Capacity indicators and utilization levels
   - Click-to-select suggested locations

3. **Create LocationVisualizer component** - Advanced visual aids:
   - Box layouts with color-coded suggestions
   - Path optimization for frequently accessed parts
   - Organization quality heatmap

### Phase 3: Smart Suggestion Strategies  
1. **Implement clustering algorithm** - Group similar parts together:
   - Calculate type affinity scores
   - Prefer locations adjacent to same category
   - Balance clustering with accessibility

2. **Implement utilization optimization** - Maximize space efficiency:
   - Fill partially occupied locations first
   - Minimize box spreading for single categories
   - Optimize for container sizes and shapes

3. **Implement accessibility scoring** - Consider usage patterns:
   - Prefer easily accessible locations for frequent parts
   - Consider box height and position preferences
   - Account for left-to-right, top-to-bottom access patterns

### Phase 4: Advanced Features and Configuration
1. **Create suggestion preferences system** - Allow users to configure:
   - Weighting of different suggestion criteria
   - Preferred organization strategies (tight clustering vs. spread)
   - Custom category grouping rules
   - Location accessibility preferences

2. **Implement predictive suggestions** - Anticipate future needs:
   - Reserve space for growing categories
   - Suggest optimal new box arrangements
   - Predict reorganization timing

3. **Create suggestion learning system** - Improve over time:
   - Track user acceptance/rejection of suggestions
   - Adapt algorithms based on user preferences
   - Improve suggestion quality through usage patterns

## Algorithms and Logic

### Multi-Criteria Suggestion Algorithm
```
generateLocationSuggestions(partType, quantity, preferences):
  1. Get all available locations with sufficient capacity
  2. For each location, calculate scores:
     - Clustering score: proximity to same type parts
     - Utilization score: box filling efficiency
     - Accessibility score: ease of reach/visibility
     - Capacity score: remaining space after placement
  3. Apply user preference weights to each score
  4. Rank locations by combined weighted score
  5. Return top N suggestions with reasoning
```

### Organization Quality Assessment
```
assessOrganizationQuality(boxes, parts):
  1. Calculate clustering coefficient for each part type
  2. Measure box utilization efficiency
  3. Identify fragmentation (scattered single parts)
  4. Score accessibility patterns
  5. Generate overall organization score (0-100)
  6. Provide specific improvement recommendations
```

### Capacity-Aware Placement
```
calculateLocationCapacity(location, partType, quantity):
  1. Get physical dimensions/constraints for location
  2. Estimate space requirements for part type and quantity
  3. Consider existing occupancy at location
  4. Calculate remaining capacity percentage
  5. Flag locations approaching capacity limits
  6. Suggest quantity splits if needed
```

### Clustering Optimization
```
optimizePartClustering(partType, existingLocations, availableLocations):
  1. Find all locations containing same part type
  2. Calculate centroid of existing type distribution
  3. Score available locations by distance to centroid
  4. Apply clustering preference weights
  5. Boost scores for locations that reduce fragmentation
  6. Return ranked suggestions prioritizing tight clustering
```

## Implementation Phases

### Phase 1: Core Algorithm Enhancement
- Implement sophisticated suggestion algorithms
- Ensure robust capacity calculation and tracking
- Create foundation for visual suggestion system

### Phase 2: Visual Interface Development  
- Build intuitive suggestion display components
- Create visual aids for location selection
- Integrate suggestions into existing stock dialogs

### Phase 3: Advanced Organization Features
- Add organization quality analysis
- Implement predictive suggestion capabilities
- Create comprehensive location visualization tools

### Phase 4: User Customization and Learning
- Allow customization of suggestion preferences
- Implement usage-based algorithm improvements
- Add advanced organization metrics and reporting
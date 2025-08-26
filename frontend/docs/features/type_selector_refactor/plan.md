# TypeSelector Refactor into Reusable Component Plan

## Brief Description

Refactor the existing TypeSelector component into a highly reusable, configurable component that can handle any entity selection with search, creation, and suggestion capabilities while maintaining the existing API interface and functionality.

## Files and Functions to be Created or Modified

### Core Reusable Component Architecture
- `src/components/ui/EntitySelector.tsx` - **NEW** - Generic, reusable selector component
- `src/components/ui/SearchableDropdown.tsx` - **NEW** - Base dropdown with search functionality
- `src/components/ui/CreateEntityDialog.tsx` - **NEW** - Generic entity creation dialog
- `src/components/ui/SelectorOption.tsx` - **NEW** - Configurable option display component

### Type-Specific Implementation
- `src/components/types/TypeSelector.tsx` - **MODIFY** - Refactored to use EntitySelector
- `src/components/types/TypeOption.tsx` - **NEW** - Type-specific option display
- `src/components/types/CreateTypeDialog.tsx` - **NEW** - Type-specific creation dialog

### Reusable Selector Variants
- `src/components/ui/BoxSelector.tsx` - **NEW** - Box selection using EntitySelector
- `src/components/ui/LocationSelector.tsx` - **NEW** - Location selection using EntitySelector  
- `src/components/ui/PartSelector.tsx` - **NEW** - Part selection using EntitySelector
- `src/components/ui/TagSelector.tsx` - **NEW** - Tag selection with multi-select capability

### Configuration and Utilities
- `src/lib/selector-configs.ts` - **NEW** - Predefined configurations for different entity types
- `src/hooks/use-entity-selector.ts` - **NEW** - Generic hook for entity selection logic
- `src/hooks/use-searchable-entities.ts` - **NEW** - Generic search and filtering hook
- `src/types/selector.ts` - **NEW** - TypeScript interfaces for selector configuration

### Enhanced Features
- `src/components/ui/VirtualizedDropdown.tsx` - **NEW** - Performance optimization for large lists
- `src/components/ui/SelectorWithRecents.tsx` - **NEW** - Selector with recent selections

## Step-by-Step Implementation

### Phase 1: Generic EntitySelector Foundation
1. **Create selector types and interfaces** - Define configuration structure:
   - `SelectorConfig` - Entity-specific settings (search fields, display format, creation settings)
   - `EntityOption` - Standardized option interface
   - `SelectorCallbacks` - Event handlers for selection, creation, and search

2. **Create SearchableDropdown component** - Base functionality:
   - Keyboard navigation (arrow keys, enter, escape)
   - Search input with debouncing
   - Click-outside handling
   - Accessibility support (ARIA labels, roles)
   - Loading and empty states

3. **Create EntitySelector component** - Generic selector logic:
   - Accept configuration object defining behavior
   - Support single and multi-select modes
   - Integrate search, creation, and selection workflows
   - Maintain consistent API regardless of entity type

### Phase 2: Configuration System and Utilities
1. **Create selector-configs.ts** - Predefined entity configurations:
   - Type selector config (existing behavior)
   - Box selector config
   - Location selector config
   - Part selector config with ID/name search

2. **Create use-entity-selector hook** - Centralized selection logic:
   - State management for dropdown open/close
   - Search term management and debouncing
   - Entity filtering and sorting
   - Creation workflow handling

3. **Create use-searchable-entities hook** - Generic search implementation:
   - Configurable search fields
   - Fuzzy search capabilities
   - Result ranking and sorting
   - Performance optimization for large datasets

### Phase 3: Type-Specific Components
1. **Refactor TypeSelector** - Use EntitySelector with type-specific config:
   - Maintain existing API compatibility
   - Preserve all current functionality
   - Enhance with new features (recent types, better search)

2. **Create TypeOption component** - Type-specific display:
   - Type name with description
   - Usage count display
   - Color coding for different categories

3. **Create CreateTypeDialog** - Enhanced type creation:
   - Validation and conflict checking
   - Category selection
   - Description and metadata fields

### Phase 4: Additional Selector Variants
1. **Create BoxSelector** - Box selection component:
   - Display box number and capacity
   - Show utilization percentage
   - Filter by availability or capacity

2. **Create LocationSelector** - Location selection component:
   - Format as BOX-LOCATION display
   - Show current occupancy status
   - Filter by availability or proximity

3. **Create PartSelector** - Part selection component:
   - Search by ID, manufacturer code, or description
   - Display part details and current stock
   - Filter by type or availability

### Phase 5: Advanced Features and Optimization
1. **Create VirtualizedDropdown** - Performance for large lists:
   - Virtual scrolling for 1000+ options
   - Lazy loading of option details
   - Efficient rendering and memory management

2. **Create SelectorWithRecents** - Enhanced user experience:
   - Track and display recently selected items
   - Persist recent selections across sessions
   - Quick access to frequently used entities

3. **Add advanced search features** - Enhanced search capabilities:
   - Multi-field search with weights
   - Search highlighting in results
   - Search history and suggestions

## Algorithms and Logic

### Generic Entity Filtering Algorithm
```
filterEntities(entities, searchTerm, config):
  1. Extract searchable fields based on config
  2. Apply fuzzy matching to each field
  3. Calculate relevance score for each entity
  4. Sort by relevance score and config preferences
  5. Apply any additional filters (availability, category)
  6. Return ranked results with metadata
```

### Configuration Validation
```
validateSelectorConfig(config):
  1. Check required fields are present
  2. Validate search field configurations
  3. Ensure display formatters are functions
  4. Verify creation settings are complete
  5. Return validation result with specific errors
```

### Keyboard Navigation Handler
```
handleKeyboardNavigation(event, state):
  1. Determine current focus position in dropdown
  2. Calculate next focus position based on key pressed
  3. Handle special keys (Enter, Escape, Tab)
  4. Update focus state and trigger selection if needed
  5. Prevent default browser behavior appropriately
```

### Multi-Select State Management
```
updateMultiSelectState(currentSelections, newSelection, action):
  1. Determine action type (add, remove, toggle)
  2. Check for duplicates and conflicts
  3. Apply business logic constraints (max selections)
  4. Update selection state immutably
  5. Trigger change callbacks with new state
```

## Implementation Phases

### Phase 1: Core Architecture
- Build generic EntitySelector foundation
- Establish configuration and typing system
- Ensure accessibility and keyboard support

### Phase 2: Type Integration
- Refactor existing TypeSelector to use new architecture
- Maintain backward compatibility
- Enhance with new capabilities

### Phase 3: Expanded Usage
- Create selectors for other entity types
- Demonstrate reusability across different use cases
- Optimize performance for various data sizes

### Phase 4: Advanced Features
- Add sophisticated search and filtering
- Implement performance optimizations
- Create enhanced user experience features

## Migration Strategy

### Backward Compatibility
- Maintain existing TypeSelector API completely
- Ensure all current usage continues to work
- Gradual migration of other components to new system

### Testing Strategy
- Unit tests for all configuration combinations
- Integration tests for keyboard navigation
- Performance tests for large datasets
- Accessibility compliance testing

### Rollout Plan
1. Implement EntitySelector without changing existing TypeSelector
2. Refactor TypeSelector to use EntitySelector internally
3. Create new selector variants for other entity types
4. Gradually migrate existing selection components
5. Add advanced features and optimizations
# Stock Management and Quantity Update Plan

## Brief Description

Enhance the existing stock management system with improved quantity tracking, batch operations, better location management, and optimized user workflows for adding, removing, and moving stock across locations.

## Files and Functions to be Created or Modified

### Core API Integration
- `src/lib/api/generated/` - Use existing generated hooks:
  - `useAddStock` - for adding quantities to locations
  - `useRemoveStock` - for removing quantities from locations  
  - `useMoveStock` - for moving stock between locations
  - `useGetPartLocations` - for fetching current location data

### Enhanced Stock Management Components
- `src/components/parts/stock/StockManager.tsx` - **NEW** - Main orchestrator component
- `src/components/parts/stock/QuickStockActions.tsx` - **NEW** - Fast add/remove/move actions
- `src/components/parts/stock/BatchStockEditor.tsx` - **NEW** - Multi-location quantity editing
- `src/components/parts/PartLocationGrid.tsx` - **MODIFY** - Enhanced inline editing capabilities
- `src/components/parts/AddStockDialog.tsx` - **MODIFY** - Improved UX with better validation
- `src/components/parts/RemoveStockDialog.tsx` - **MODIFY** - Enhanced location selection
- `src/components/parts/MoveStockDialog.tsx` - **MODIFY** - Better source/destination handling

### Hooks and Utilities
- `src/hooks/use-stock-operations.ts` - **NEW** - Centralized stock operation logic
- `src/hooks/use-batch-stock.ts` - **NEW** - Batch operation management
- `src/hooks/use-parts.ts` - **MODIFY** - Enhanced with better stock utilities
- `src/lib/stock-utils.ts` - **NEW** - Stock calculation and validation utilities

### UI Components
- `src/components/ui/QuantityInput.tsx` - **NEW** - Specialized quantity input with validation
- `src/components/ui/LocationPicker.tsx` - **NEW** - Enhanced location selection component
- `src/components/ui/StockSummary.tsx` - **NEW** - Stock level visualization component

## Step-by-Step Implementation

### Phase 1: Core Stock Operations Enhancement
1. **Create QuantityInput component** - Number input with min/max validation, increment/decrement buttons, and quantity formatting
2. **Create stock-utils.ts** - Utility functions for quantity calculations, location validation, and stock level categorization
3. **Enhance use-parts.ts hook** - Add optimistic updates for stock operations, better error handling, and batch operation support
4. **Create use-stock-operations.ts hook** - Centralized logic for all stock operations with consistent error handling and query invalidation

### Phase 2: Improved Location Management
1. **Create LocationPicker component** - Dropdown with search, filtering by availability, and visual indicators for current stock levels
2. **Enhance PartLocationGrid** - Add inline editing for quantities, bulk selection capabilities, and better visual hierarchy
3. **Modify existing stock dialogs** - Replace basic inputs with QuantityInput, improve location selection with LocationPicker

### Phase 3: Batch Operations
1. **Create BatchStockEditor component** - Table-based interface for editing multiple location quantities simultaneously
2. **Create use-batch-stock.ts hook** - Handle batch validation, optimistic updates, and rollback on errors
3. **Integrate batch operations** - Add batch editing mode to PartLocationGrid with save/cancel actions

### Phase 4: Quick Actions and UX Improvements
1. **Create QuickStockActions component** - Floating action buttons or toolbar for common operations (quick add 1, quick remove 1)
2. **Create StockSummary component** - Visual indicators for stock levels (low, medium, high) with color coding
3. **Create StockManager orchestrator** - Main component that coordinates all stock operations and provides consistent UI patterns
4. **Enhance keyboard shortcuts** - Tab navigation, Enter to save, Escape to cancel for all stock operations

### Phase 5: Advanced Features
1. **Stock change history integration** - Display recent changes with timestamps in stock dialogs
2. **Stock level warnings** - Visual and textual warnings for low stock, overstocking, or location capacity issues  
3. **Undo/redo functionality** - Recent stock changes can be undone with confirmation
4. **Stock operation templates** - Save common stock operations (like "add 100 to first empty location") for reuse

## Algorithms and Logic

### Quantity Validation Algorithm
```
validateQuantityOperation(operation, currentStock, targetQuantity):
  1. Check if operation type is valid (add, remove, move)
  2. For remove operations: ensure currentStock >= targetQuantity
  3. For add operations: check location capacity limits (if defined)
  4. For move operations: validate both source and destination
  5. Return validation result with specific error messages
```

### Batch Operation Processing
```
processBatchStockChanges(changes):
  1. Group changes by operation type (add, remove, move)
  2. Validate all changes before executing any
  3. Execute operations in optimal order (removes first, then adds, then moves)
  4. Use optimistic updates with rollback on any failure
  5. Invalidate relevant queries after successful completion
```

### Location Suggestion Enhancement
```
suggestOptimalLocations(partType, quantity, existingLocations):
  1. Get existing locations for same part type
  2. Calculate available capacity in those locations
  3. Prefer partially filled locations in same category boxes
  4. Fall back to empty locations in category-designated boxes
  5. Return sorted list of suggestions with capacity indicators
```

## Implementation Phases

### Phase 1: Foundation (Core operations and utilities)
- Focus on robust quantity input, validation, and basic operations
- Ensure all existing functionality continues to work

### Phase 2: Enhanced UX (Better interfaces and workflows) 
- Improve the user experience of common stock operations
- Add visual feedback and better error handling

### Phase 3: Batch Operations (Multi-location editing)
- Enable efficient management of parts across multiple locations
- Reduce clicks and time for bulk quantity updates

### Phase 4: Advanced Features (Power user capabilities)
- Add sophisticated features for users managing large inventories
- Include history, templates, and optimization suggestions
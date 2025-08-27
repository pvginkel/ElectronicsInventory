# Stock Management and Quantity Update Plan

## Brief Description

Build comprehensive frontend stock management interfaces leveraging the fully-implemented backend stock management system. The backend already provides robust add/remove/move operations, quantity history tracking, location suggestions, and automatic cleanup. The frontend needs to create intuitive UIs for these existing capabilities plus add client-side enhancements like batch operations and improved workflows.

## Files and Functions to be Created or Modified

### Core API Integration
- `src/lib/api/generated/` - Use existing generated hooks (✅ Backend fully implemented):
  - `usePostInventoryPartsStockByPartId4` - Add stock: `POST /api/inventory/parts/{part_id4}/stock`
  - `useDeleteInventoryPartsStockByPartId4` - Remove stock: `DELETE /api/inventory/parts/{part_id4}/stock`
  - `usePostInventoryPartsMoveByPartId4` - Move stock: `POST /api/inventory/parts/{part_id4}/move`
  - `useGetPartsLocationsByPartId4` - Get locations: `GET /api/parts/{part_id4}/locations`
  - `useGetPartsHistoryByPartId4` - Get quantity history: `GET /api/parts/{part_id4}/history` ✨
  - `useGetInventorySuggestionsByTypeId` - Get location suggestions: `GET /api/inventory/suggestions/{type_id}` ✨

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

### Phase 5: Advanced Features & UX Polish
1. **✅ Stock history integration** - Display recent changes (backend provides full audit trail via `/history` endpoint)
2. **Stock level warnings** - Visual warnings for low stock, overstocking (frontend-only, no backend changes needed)
3. **Operation templates** - Save common operations like "add 100 to suggested location" (frontend-only)
4. **Keyboard shortcuts & accessibility** - Tab navigation, Enter/Escape, screen reader support
5. **Optimistic UI updates** - Immediate feedback while API calls complete

## Algorithms and Logic

### Frontend Validation Strategy
```
clientSideValidation(operation, inputData):
  1. ✅ Basic input validation (positive numbers, required fields)
  2. ✅ Format validation (integer quantities, valid location format)
  3. ✅ Send to backend - comprehensive validation happens server-side:
     - Stock sufficiency checks
     - Location existence validation  
     - Business rule enforcement
  4. ✅ Handle backend error responses and show user-friendly messages
```

Note: The backend provides comprehensive validation with detailed error messages. Frontend focuses on input sanitization and UX.

### Batch Operation Processing
```
processBatchStockChanges(changes):
  1. Group changes by operation type (add, remove, move)
  2. Validate all changes before executing any
  3. Execute operations in optimal order (removes first, then adds, then moves)
  4. Use optimistic updates with rollback on any failure
  5. Invalidate relevant queries after successful completion
```

### Location Suggestion Integration
```
✅ Backend provides: GET /api/inventory/suggestions/{type_id}
Returns: { box_no: number, loc_no: number }

Frontend enhancement:
1. ✅ Call suggestion API when user needs location recommendation
2. ✅ Display suggested location prominently in dialogs
3. ✅ Allow user to accept or override suggestion
4. ✅ Show context about why location was suggested (first available, etc.)
```

Note: Backend implements first-available algorithm. More sophisticated suggestions can be added later.

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
- Include templates, optimization suggestions, and accessibility enhancements

## 🎯 **Current Status & Backend Alignment**

### ✅ **Fully Implemented in Backend (Ready for Frontend)**
- **Stock Operations**: Add, Remove, Move with full validation and error handling
- **Location Management**: Get part locations, location suggestions by type
- **Audit Trail**: Complete quantity history with timestamps and location references
- **Data Integrity**: Automatic cleanup, transactional operations, constraint validation
- **Error Handling**: Comprehensive error responses for all failure scenarios

### 🔨 **Frontend Implementation Focus**  
The backend provides a complete, production-ready stock management API. The frontend implementation should focus on:

1. **UI/UX Excellence**: Intuitive interfaces for the existing robust backend operations
2. **Batch Operations**: Client-side aggregation of multiple API calls for efficiency  
3. **Optimistic Updates**: Immediate visual feedback while API calls complete
4. **Error Integration**: Leveraging detailed backend error messages for user guidance
5. **Enhanced Workflows**: Location suggestions, operation templates, keyboard shortcuts

### 📋 **No Backend Changes Required**
This frontend work can proceed independently - all necessary backend functionality is complete and tested. The implementation can focus entirely on creating excellent user experiences around the existing APIs.
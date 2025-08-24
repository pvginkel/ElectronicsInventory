# Parts, Types, and Locations Integration - Technical Plan

## Brief Description

Integrate backend endpoints for parts, part types, and part location management into the frontend. This includes creating a comprehensive part edit UI with a searchable type selector that allows creating new types on-demand, and implementing an editable part location grid that handles zero-location states gracefully.

## API Endpoints Available

Based on the OpenAPI specification, the following endpoints are available:

### Parts
- `GET /parts` - List parts with pagination
- `POST /parts` - Create new part  
- `GET /parts/{part_id4}` - Get single part with full details
- `PUT /parts/{part_id4}` - Update part details
- `DELETE /parts/{part_id4}` - Delete part if total quantity is zero
- `GET /parts/{part_id4}/locations` - Get all locations for a part
- `GET /parts/{part_id4}/history` - Get quantity change history for a part

### Types
- `GET /types` - List all part types
- `POST /types` - Create new part type
- `GET /types/{type_id}` - Get single type details  
- `PUT /types/{type_id}` - Update type name
- `DELETE /types/{type_id}` - Delete type if not in use

### Inventory Management
- `POST /inventory/parts/{part_id4}/stock` - Add stock to a location
- `DELETE /inventory/parts/{part_id4}/stock` - Remove stock from a location  
- `POST /inventory/parts/{part_id4}/move` - Move stock between locations
- `GET /inventory/suggestions/{type_id}` - Get location suggestions for part type

## Files and Functions to Create/Modify

### 1. API Hook Generation
- File: `src/lib/api/generated/hooks.ts` (regenerated via `pnpm generate:api`)
- Generated TanStack Query hooks for all endpoints above

### 2. Part Components

#### Part List Component
- File: `src/components/parts/part-list.tsx`
- Functions:
  - `PartList()` - Main list component with virtualization for performance
  - `PartListItem()` - Individual part row component showing ID, description, type, and total quantity

#### Part Form Component  
- File: `src/components/parts/part-form.tsx`
- Functions:
  - `PartForm({ partId?, onSuccess })` - Main form for create/edit
  - `TypeSelector({ value, onChange })` - Searchable type selector with create capability
  - `TagsInput({ value, onChange })` - Input for managing tags array

#### Part Details Component
- File: `src/components/parts/part-details.tsx` 
- Functions:
  - `PartDetails({ partId })` - Full part details view
  - `PartLocationGrid({ partId })` - Editable grid for location management
  - `LocationRow({ location, onQuantityChange, onRemove })` - Individual location row
  - `AddLocationRow({ onAdd })` - Add new location functionality
  - `EmptyLocationsState()` - Message when part has no locations

#### Part Actions Component
- File: `src/components/parts/part-actions.tsx`
- Functions:
  - `AddStockDialog({ partId })` - Modal for adding stock to locations
  - `MoveStockDialog({ partId, fromLocation })` - Modal for moving stock
  - `RemoveStockDialog({ partId, location })` - Modal for removing stock

### 3. Type Components

#### Type Selector Component  
- File: `src/components/types/type-selector.tsx`
- Functions:
  - `TypeSelector({ value, onChange, placeholder })` - Main searchable selector
  - `TypeSearchInput({ onSearch, onSelect, onCreate })` - Search input with results dropdown
  - `TypeCreateDialog({ initialName, onConfirm, onCancel })` - Create new type dialog
  - `TypeOption({ type, onClick })` - Individual type option in dropdown
  - `CreateTypeOption({ searchTerm, onClick })` - "Add type X" option when not found

#### Type Management Component
- File: `src/components/types/type-list.tsx`  
- Functions:
  - `TypeList()` - List all types for admin management
  - `TypeEditDialog({ typeId, onSuccess })` - Edit existing type
  - `DeleteTypeDialog({ typeId, onSuccess })` - Delete type with confirmation

### 4. Route Updates

#### Parts Index Route
- File: `src/routes/parts/index.tsx` 
- Functions:
  - `Parts()` - Replace placeholder with `PartList` component
  - Add search functionality and filtering

#### Individual Part Route
- File: `src/routes/parts/$partId.tsx`
- Functions:
  - `PartDetail()` - Show `PartDetails` component
  - Handle part not found states

#### Part Creation Route  
- File: `src/routes/parts/new.tsx`
- Functions:
  - `NewPart()` - Show `PartForm` in creation mode

### 5. Utility Functions

#### Location Utilities
- File: `src/lib/utils/locations.ts`
- Functions:
  - `formatLocation(boxNo, locNo)` - Format as "7-3"
  - `parseLocation(locationString)` - Parse "7-3" to {boxNo: 7, locNo: 3}
  - `calculateTotalQuantity(locations)` - Sum quantities across locations
  - `suggestLocation(typeId)` - Get location suggestions from API

#### Part Utilities  
- File: `src/lib/utils/parts.ts`
- Functions:
  - `validatePartData(data)` - Client-side validation
  - `formatPartForDisplay(part)` - Format part data for UI
  - `generatePartId()` - Generate unique 4-character ID if needed

### 6. Custom Hooks

#### Part Hooks
- File: `src/hooks/use-parts.ts`
- Functions:
  - `usePartLocations(partId)` - Get locations for a part with real-time updates
  - `usePartHistory(partId)` - Get quantity history for a part
  - `useAddStock()` - Mutation for adding stock
  - `useRemoveStock()` - Mutation for removing stock  
  - `useMoveStock()` - Mutation for moving stock

#### Type Hooks
- File: `src/hooks/use-types.ts`  
- Functions:
  - `useTypesSearch(searchTerm)` - Search types with debouncing
  - `useCreateType()` - Mutation for creating new type
  - `useLocationSuggestions(typeId)` - Get location suggestions

## Step-by-Step Implementation Algorithm

### Phase 1: Core Infrastructure
1. Generate API hooks using `pnpm generate:api`
2. Create utility functions for location and part formatting
3. Implement custom hooks for common part and type operations

### Phase 2: Type Management
1. Create `TypeSelector` component with search functionality
2. Implement `TypeCreateDialog` for on-demand type creation
3. Add search debouncing and keyboard navigation
4. Handle "Add type X" option when search term doesn't match existing types

### Phase 3: Part Location Grid
1. Create `PartLocationGrid` component with editable rows
2. Implement `LocationRow` with inline quantity editing
3. Add `AddLocationRow` for adding new locations
4. Handle empty state gracefully with helpful messaging
5. Integrate location suggestions from backend

### Phase 4: Part Forms and CRUD
1. Create `PartForm` with all fields including type selector
2. Implement validation and error handling
3. Add `PartDetails` view with location grid
4. Create stock management dialogs (Add/Move/Remove)

### Phase 5: Part Listing and Routes
1. Update parts index route with `PartList` component
2. Create individual part detail routes
3. Add part creation route
4. Implement search and filtering in part list

### Phase 6: Integration and Polish
1. Connect all components with proper data flow
2. Add loading states and error boundaries
3. Implement optimistic updates where appropriate
4. Add keyboard shortcuts for common actions

## Special Implementation Details

### Type Selector Behavior
- Show dropdown on focus with debounced search
- Display existing types matching search term
- Show "Create type X" option at bottom when no exact match
- Clicking create option opens dialog with pre-filled name
- User can modify name before confirming
- On confirm, create type and select it automatically

### Part Location Grid
- Most parts will have 0-1 locations, some will have 2+
- Use minimal vertical space - show locations in compact rows
- Empty state shows helpful message like "No stock locations assigned"
- Add location button suggests optimal location based on part type
- Inline editing for quantities with number input
- Remove location option available when quantity > 0
- Show total quantity calculated from all locations

### Zero Quantity Handling
- When total quantity reaches zero, backend clears all locations
- Frontend should reflect this by hiding location grid temporarily
- Show message like "Stock depleted - add stock to assign locations"
- Add stock dialog should suggest appropriate locations

## Error Handling Strategy
- Form validation before API calls
- Optimistic updates with rollback on failure
- Clear error messages for common scenarios (duplicate types, invalid quantities)
- Retry mechanisms for transient failures
- Offline state handling where applicable

## Performance Considerations
- Debounce type search queries (300ms)
- Use virtualization for large part lists
- Implement proper pagination for parts endpoint
- Cache type data aggressively (changes infrequently)
- Optimistic updates for quantity changes
- Batch multiple location updates where possible
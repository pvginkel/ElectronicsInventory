# Unused Functionality Analysis

This document identifies both OpenAPI endpoints/hooks and implemented functionality that are not currently used anywhere in the frontend codebase.

## Analysis Overview

This analysis identifies two categories of unused functionality:
1. **Unused API endpoints** - Generated hooks that are never called
2. **Implemented but unused features** - Complete functionality that exists but isn't integrated into the UI

## Part 1: Completely Unused API Endpoints

The frontend generates React Query hooks from the OpenAPI specification in `/src/lib/api/generated/hooks.ts`. Out of 25 total generated hooks, **6 hooks are completely unused** in the current implementation.

### 1. `useGetHealth`
- **Endpoint**: `GET /api/health`
- **Purpose**: Health check endpoint for container orchestration
- **Reason unused**: This is an infrastructure endpoint not needed in the frontend UI

### 2. `useGetBoxesUsageByBoxNo`
- **Endpoint**: `GET /api/boxes/{box_no}/usage`  
- **Purpose**: Get usage statistics for a specific box
- **Reason unused**: Box details component (`src/components/boxes/box-details.tsx`) gets usage stats by fetching all boxes via `useGetBoxes()` and filtering client-side instead of using this endpoint

### 3. `useGetLocationsByBoxNoAndLocNo`
- **Endpoint**: `GET /api/locations/{box_no}/{loc_no}`
- **Purpose**: Get specific location details
- **Reason unused**: The application doesn't currently have UI functionality to view individual location details

### 4. `useGetTypes`
- **Endpoint**: `GET /api/types`
- **Purpose**: List all part types with optional statistics
- **Reason unused**: The codebase uses a custom wrapper `useGetTypesWithStats()` in `src/hooks/use-types.ts` that makes direct API calls using the generated client instead of the generated hook

### 5. `useGetTypesByTypeId`
- **Endpoint**: `GET /api/types/{type_id}`
- **Purpose**: Get single type details  
- **Reason unused**: The application doesn't have UI functionality for viewing individual type details

### 6. `usePostInventoryPartsMoveByPartId4`
- **Endpoint**: `POST /api/inventory/parts/{part_id4}/move`
- **Purpose**: Move stock between locations
- **Reason unused**: Has implementation (`useMoveStock` hook and `MoveStockDialog` component) but the UI components are never imported or used anywhere

## Part 2: Implemented but Unused Functionality

Beyond unused API endpoints, the codebase contains several complete features that are implemented but never integrated into the UI:

### Complete Components That Are Never Imported

#### 1. Stock Management Dialog Components
- **File**: `src/components/parts/part-actions.tsx`
- **Components**: `AddStockDialog`, `MoveStockDialog`, `RemoveStockDialog`
- **Description**: Complete dialog components for managing part stock operations
- **Features**: Form validation, location suggestions, quantity management, proper error handling
- **Status**: Production-ready components with full API integration
- **Why unused**: Exported but never imported or used in any UI workflow

#### 2. Header Component  
- **File**: `src/components/layout/header.tsx`
- **Description**: Comprehensive header component with search and navigation
- **Features**: Global search bar, mobile menu support, quick action buttons (Scan, Add Part)
- **Status**: Fully implemented with responsive design and proper TypeScript interfaces
- **Why unused**: Never imported; root layout uses simple mobile menu button instead

#### 3. ErrorBoundary Component
- **File**: `src/components/error-boundary.tsx`
- **Description**: React error boundary for catching and displaying JavaScript errors
- **Features**: Error display with refresh/retry options, development mode error details
- **Status**: Complete class component with proper error handling
- **Why unused**: Never imported or used to wrap any part of the application

### Utility Functions That Are Never Called

#### 4. Location Utility Functions
- **File**: `src/lib/utils/locations.ts`
- **Functions**: `parseLocation()`, `suggestLocation()`
- **Description**: 
  - `parseLocation()`: Parses location strings like "7-3" into boxNo/locNo objects
  - `suggestLocation()`: Placeholder for API-based location suggestions
- **Status**: `parseLocation()` is complete; `suggestLocation()` is placeholder
- **Why unused**: Never called anywhere in the codebase

#### 5. Part ID Generation Function
- **File**: `src/lib/utils/parts.ts`  
- **Function**: `generatePartId()`
- **Description**: Generates random 4-character uppercase part IDs (e.g., "BZQP")
- **Status**: Fully implemented and ready to use
- **Why unused**: Never called anywhere - parts likely generated on backend

### Incomplete Implementation

#### 6. Search Route
- **File**: `src/routes/search.tsx`
- **Description**: Route exists but only shows placeholder content
- **Status**: Route structure exists but core functionality missing
- **Why considered unused**: Contains no actual search functionality, just placeholder text

## Used Hooks Summary

The remaining **19 hooks are actively used** either:
- Directly in components (e.g., `useGetParts` in `part-list.tsx`)
- Wrapped in custom hooks (e.g., `useGetPartsLocationsByPartId4` wrapped in `usePartLocations()`)
- Through service layer patterns in `/src/hooks/` directory

## Impact Analysis

### High-Value Unused Features
The **stock management dialogs** represent the most significant unused functionality:
- Complete UI implementation for adding, moving, and removing stock
- Proper API integration and error handling
- Production-ready components that could immediately improve user workflows
- Would eliminate the need for users to manually manage stock locations

### Other Notable Missing Integrations
- **Header component**: Could provide better navigation and global search
- **ErrorBoundary**: Should be integrated for better error handling and user experience
- **Location utilities**: Ready-to-use functions that could simplify location management

## Recommendations

### For API Endpoints
1. **Keep unused hooks**: These endpoints may be needed for future features
2. **Consider consolidation**: Review if `useGetBoxesUsageByBoxNo` could be used instead of client-side filtering in box details
3. **Monitor for future use**: Some unused endpoints like type details may be needed when implementing type management UI

### For Implemented Features
1. **Priority integration**: Stock management dialogs should be integrated into part workflows
2. **Quick wins**: 
   - Add ErrorBoundary to root layout for better error handling
   - Consider replacing simple mobile menu with full Header component
3. **Utility cleanup**: Evaluate if location/parts utilities should be integrated or removed
4. **Search implementation**: Complete the placeholder search route or remove it

### Code Maintenance
- Consider moving unused but valuable components to a "future features" directory
- Document which features are intentionally implemented ahead of UI integration
- Remove truly unused utility functions to reduce codebase complexity

## Last Updated
2025-08-27
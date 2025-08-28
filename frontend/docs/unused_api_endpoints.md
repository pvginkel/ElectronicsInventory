# Unused API Endpoints Analysis

This document identifies API endpoints defined in `@openapi-cache/openapi.json` that are not currently used in the React frontend application.

## Analysis Summary

- **Total API endpoints**: 24
- **Used endpoints**: 18
- **Unused endpoints**: 6

## Unused Endpoints

The following endpoints are defined in the OpenAPI spec but are not currently used in the frontend code:

### 1. `GET /api/boxes/{box_no}/usage`
- **Purpose**: Get usage statistics for a specific box
- **Response Schema**: `BoxUsageStatsSchema`
- **Why unused**: The frontend gets usage statistics through the `GET /api/boxes` endpoint instead, which includes usage data in the `BoxWithUsageSchemaList` response for all boxes

### 2. `GET /api/locations/{box_no}/{loc_no}`
- **Purpose**: Get specific location details
- **Response Schema**: `LocationResponseSchema`
- **Why unused**: The frontend doesn't currently need detailed information about individual locations - it works with location lists from boxes

### 3. `GET /api/types/{type_id}`
- **Purpose**: Get single type details
- **Response Schema**: `TypeResponseSchema`
- **Why unused**: The frontend doesn't currently have a detailed view for individual types - it works with type lists and selection

### 4. `GET /api/health`
- **Purpose**: Health check endpoint for container orchestration
- **Response**: No defined response schema
- **Why unused**: This is an infrastructure endpoint not needed by the frontend application

### 5. `GET /api/parts/{part_id4}/history`
- **Purpose**: Get quantity change history for a part
- **Response Schema**: `QuantityHistoryResponseSchemaList`
- **Why unused**: Custom hook `usePartHistory` is defined but never called in any component

### 6. `POST /api/inventory/parts/{part_id4}/move`
- **Purpose**: Move stock between locations
- **Response**: `void`
- **Why unused**: Custom hook `useMoveStock` is defined but never called in any component

## Used Endpoints

The following endpoints are actively used in the frontend (18 out of 24 total):

### Parts Management
- `GET /api/parts` - List parts with total quantities
- `POST /api/parts` - Create new part
- `GET /api/parts/{part_id4}` - Get single part details
- `PUT /api/parts/{part_id4}` - Update part details
- `DELETE /api/parts/{part_id4}` - Delete part (if zero quantity)
- `GET /api/parts/{part_id4}/locations` - Get all locations for a part (via usePartLocations custom hook)

### Inventory Management
- `POST /api/inventory/parts/{part_id4}/stock` - Add stock to location (via useAddStock custom hook)
- `DELETE /api/inventory/parts/{part_id4}/stock` - Remove stock from location (via useRemoveStock custom hook)
- `GET /api/inventory/suggestions/{type_id}` - Get location suggestions for part type (via useLocationSuggestions custom hook)

### Box Management
- `GET /api/boxes` - List all boxes with usage statistics
- `POST /api/boxes` - Create new box
- `GET /api/boxes/{box_no}` - Get box details
- `PUT /api/boxes/{box_no}` - Update box details
- `DELETE /api/boxes/{box_no}` - Delete empty box
- `GET /api/boxes/{box_no}/locations` - Get all locations in box (via useBoxLocationsWithParts custom hook)

### Type Management
- `GET /api/types` - List all part types (via useGetTypesWithStats and useTypesSearch custom hooks)
- `POST /api/types` - Create new part type (via useCreateType custom hook)
- `PUT /api/types/{type_id}` - Update type name (via useUpdateType custom hook)
- `DELETE /api/types/{type_id}` - Delete type if not in use (via useDeleteType custom hook)

## Previously Listed as "Used" - Now Reclassified as Unused

The following endpoints were previously counted as "used" but are actually unused because their custom hook wrappers are never called:

- `GET /api/parts/{part_id4}/history` - Wrapped by `usePartHistory` but never called
- `POST /api/inventory/parts/{part_id4}/move` - Wrapped by `useMoveStock` but never called

These have been moved to the "Unused Endpoints" section above.

## Implementation Notes

### Custom API Usage
The frontend now uses the generated `useGetTypes` hook with query parameters for enhanced functionality:
```typescript
// Uses generated hook with query parameters for stats
return useGetTypes({
  query: { include_stats: 'true' }
});
```
This approach consistently uses the generated hooks throughout the codebase, leveraging the updated code generator that supports query parameters.

### Why Some Endpoints Are Unused

1. **Redundant endpoints**: Some endpoints like `GET /api/boxes/{box_no}/usage` are redundant because the data is available through other endpoints with better performance.

2. **No UI requirements**: Endpoints like individual type details (`GET /api/types/{type_id}`) aren't used because the current UI design doesn't require detailed type views.

3. **Infrastructure endpoints**: Health check endpoints are for infrastructure monitoring, not frontend consumption.

4. **Specific location endpoints**: Individual location queries aren't needed because the app works with location collections from boxes.

## Recommendations

### Keep Unused Endpoints
- Keep all unused endpoints as they may be needed for future features
- The health check endpoint is essential for deployment infrastructure
- Individual resource endpoints (types, locations) provide flexibility for future UI enhancements

### Consider Future Usage
- `GET /api/types/{type_id}` could be useful if adding detailed type management UI
- `GET /api/locations/{box_no}/{loc_no}` might be needed for detailed location operations
- `GET /api/boxes/{box_no}/usage` could be used for focused box analytics

### API Consistency
The implementation now consistently uses generated hooks throughout the codebase:
- **Direct usage**: For simple endpoints without parameters
- **Custom hook wrappers**: For endpoints requiring business logic transformation or enhanced functionality
- **Query parameters**: Supported through the updated code generator for endpoints like types with statistics

This provides excellent type safety and consistency across the entire frontend application.
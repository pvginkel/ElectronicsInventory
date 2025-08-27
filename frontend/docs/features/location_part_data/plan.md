# Location Part Data Frontend Implementation Plan

## Brief Description

Update the frontend box details view to display part assignment information for each location within a storage box. The backend has implemented an enhanced `/boxes/{box_no}/locations` endpoint that includes part assignment data (part ID, quantities, occupancy status). The frontend currently shows basic location numbers but doesn't display which parts are stored in each location.

## Current State Analysis

The existing frontend codebase has:
- Complete box details page (`src/components/boxes/box-details.tsx`) with location display
- Location list component (`src/components/boxes/location-list.tsx`) that accepts location data
- Location item component (`src/components/boxes/location-item.tsx`) with placeholder part data display
- API hook (`useGetBoxesLocationsByBoxNo`) that fetches basic location data
- Type definitions expecting enhanced location data but currently showing "No data"

The missing pieces are:
1. Enhanced custom hook to handle the new API response format
2. Updated component types to match the backend schema
3. Proper display logic for occupied vs empty locations
4. Error handling for the enhanced endpoint

## Files and Functions to Modify

### 1. API Hook Enhancement (`src/hooks/use-box-locations.ts`) - NEW FILE
**New Custom Hook:**
- `useBoxLocationsWithParts(boxNo: number)` - Enhanced hook that wraps the generated API hook
  - Use `useGetBoxesLocationsByBoxNo` with query parameters for enhanced data
  - Transform snake_case API response to camelCase domain models
  - Add computed properties for better UI display
  - Handle loading, error, and empty states

### 2. Location List Component (`src/components/boxes/location-list.tsx`)
**Type Updates:**
- Update `LocationListProps.locations` interface to match backend response schema:
  - `box_no: number` (existing)
  - `loc_no: number` (existing)  
  - `is_occupied: boolean` (new)
  - `part_assignments: PartAssignment[] | null` (new)

**Logic Updates:**
- Update rendering to use new data structure
- Add empty state handling for locations without assignments
- Sort locations properly by `loc_no`

### 3. Location Item Component (`src/components/boxes/location-item.tsx`)
**Enhanced Display Logic:**
- Update interface to match new backend schema
- Implement proper occupied/empty state display
- Show part information when available (part ID, quantity, description)
- Handle multiple part assignments per location (if supported by backend)
- Add visual indicators for occupied vs empty locations

**UI Improvements:**
- Different styling for occupied vs empty locations
- Hover states and click interactions for future part detail navigation
- Quantity display formatting
- Part information truncation for long descriptions

### 4. Box Details Page (`src/components/boxes/box-details.tsx`)
**Hook Integration:**
- Replace direct `useGetBoxesLocationsByBoxNo` usage with new `useBoxLocationsWithParts`
- Update error handling for the enhanced endpoint
- Ensure loading states work correctly with new hook

### 5. Type Definitions (`src/types/locations.ts`) - NEW FILE
**Domain Model Types:**
- `LocationWithParts` - Frontend domain model for enhanced location data
- `PartAssignment` - Part data within a location
- `LocationDisplayData` - Computed display properties

## Implementation Algorithm

### Data Transformation Algorithm:
1. **API Response Processing:**
   - Receive enhanced location data from backend API
   - Transform snake_case fields to camelCase for frontend consistency
   - Parse part assignment arrays if present

2. **Location State Determination:**
   ```typescript
   const isOccupied = location.is_occupied && 
                     location.part_assignments && 
                     location.part_assignments.length > 0
   ```

3. **Display Data Enrichment:**
   - Calculate total quantity across all part assignments per location
   - Prepare display strings for part information
   - Generate appropriate styling classes based on occupancy

### Component Update Algorithm:
1. **Location List Updates:**
   - Group and sort locations by `loc_no`
   - Apply consistent spacing and layout
   - Handle edge cases (no locations, API errors)

2. **Location Item Updates:**
   - Conditional rendering based on `is_occupied` flag
   - Multiple part assignment display (if backend supports it)
   - Accessibility improvements for screen readers

## Implementation Phases

### Phase 1: Core Data Integration
1. Create enhanced custom hook `useBoxLocationsWithParts`
2. Update type definitions for new backend schema
3. Modify Location List component to handle new data structure
4. Update Location Item component display logic
5. Test with existing API endpoint (backwards compatibility)

### Phase 2: UI Enhancement & Polish
1. Add visual indicators for occupied vs empty locations
2. Implement hover states and interaction feedback
3. Add loading skeleton improvements
4. Handle edge cases (no parts, multiple parts per location)
5. Test responsive layout on different screen sizes

### Phase 3: Integration & Testing
1. Update Box Details page to use new hook
2. Test error handling scenarios
3. Verify performance with realistic data volumes
4. Add proper TypeScript strict mode compliance
5. Test accessibility with keyboard navigation and screen readers

## Backend Integration Notes

Based on the backend plan, the API should support:
- Enhanced response schema with `is_occupied` boolean flag
- `part_assignments` array containing part data per location
- Backwards compatibility through query parameters
- Proper error handling for invalid box numbers

### Expected API Response Structure:
```json
[
  {
    "box_no": 7,
    "loc_no": 3,
    "is_occupied": true,
    "part_assignments": [
      {
        "id4": "BZQP",
        "qty": 120,
        "manufacturer_code": "OMRON G5Q-1A4",
        "description": "Power relay, SPDT, 5V coil"
      }
    ]
  },
  {
    "box_no": 7,
    "loc_no": 4,
    "is_occupied": false,
    "part_assignments": []
  }
]
```

## Success Criteria

The implementation will be successful when:
- **✅ Box details view shows part assignments** - Each location displays which parts are stored there
- **✅ Empty locations are clearly identified** - Visual distinction between occupied and empty locations  
- **✅ Part information is accessible** - Part ID, quantity, and description visible for each assignment
- **✅ Performance remains good** - No noticeable slowdown when viewing box details
- **✅ Error handling works** - Graceful fallback when API fails or returns unexpected data
- **✅ Type safety maintained** - All TypeScript types properly defined and enforced
- **✅ Responsive design** - Works well on desktop and mobile viewports
- **✅ Accessibility preserved** - Screen reader friendly and keyboard navigable

## Future Considerations

This implementation prepares for potential future enhancements:
- **Part detail navigation** - Clicking on part assignments to view part details
- **Location editing** - Quick actions to move parts between locations
- **Batch operations** - Select multiple locations for reorganization
- **Search within locations** - Filter locations by part type or status
- **Real-time updates** - WebSocket integration for live location status
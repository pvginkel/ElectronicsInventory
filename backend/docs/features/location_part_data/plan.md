# Location Part Data Implementation Plan

## Brief Description

Enhance the box locations API endpoint to include part assignment information for each location within a storage box. Currently, the `/boxes/{box_no}/locations` endpoint only returns basic location data (box_no, loc_no) without showing which parts are stored in each location. This enhancement will provide complete location data including part IDs, quantities, and occupancy status to support the frontend box details view.

## Current State Analysis

The existing codebase already has:
- Complete data model with `PartLocation` relationship between parts and locations
- Box service that can retrieve all locations for a box 
- Location response schema that only includes `box_no` and `loc_no`
- API endpoint `/boxes/{box_no}/locations` that returns basic location data

The missing piece is enriching the location data with part assignment information from the `part_locations` table.

## Files and Functions to Modify

### 1. Location Schema (`app/schemas/location.py`)
**New Schema Required:**
- `LocationWithPartResponseSchema` - Extended schema to include part assignment data:
  - `box_no: int` (existing)
  - `loc_no: int` (existing)
  - `is_occupied: bool` - Whether location contains parts
  - `part_assignments: list[PartAssignmentSchema] | None` - Parts stored in this location

**New Supporting Schema:**
- `PartAssignmentSchema` - Minimal part data for location display:
  - `id4: str` - 4-character part identifier
  - `qty: int` - Quantity at this location
  - `manufacturer_code: str | None` - For display purposes
  - `description: str` - For display purposes

### 2. Box Service (`app/services/box_service.py`)
**New Method Required:**
- `get_box_locations_with_parts(db: Session, box_no: int) -> list[LocationWithPartData]` 
  - Query all locations for the box
  - Join with `part_locations` and `parts` tables to get assignment data
  - Return structured data combining location info with part assignments
  - Handle empty locations (locations with no part assignments)

**New Service Model:**
- `LocationWithPartData` dataclass to hold combined location and part data

### 3. Box API (`app/api/boxes.py`)
**Modify Existing Endpoint:**
- `get_box_locations(box_no: int)` at `/boxes/{box_no}/locations`
  - Add query parameter `include_parts=true/false` (default: true for backward compatibility)
  - When `include_parts=true`: use new service method and return enhanced schema
  - When `include_parts=false`: use existing logic for basic location data

## Implementation Algorithm

### Location Data Query Algorithm:
```sql
-- Conceptual query for getting locations with part data
SELECT 
    l.box_no, 
    l.loc_no,
    pl.part_id4,
    pl.qty,
    p.manufacturer_code,
    p.description
FROM locations l
LEFT JOIN part_locations pl ON l.box_no = pl.box_no AND l.loc_no = pl.loc_no
LEFT JOIN parts p ON pl.part_id4 = p.id4
WHERE l.box_no = ?
ORDER BY l.loc_no
```

### Data Structure Algorithm:
1. Query locations with optional part assignments
2. Group results by location (`box_no`, `loc_no`)
3. For each location:
   - If no part assignments exist: `is_occupied = false`, `part_assignments = []`
   - If part assignments exist: `is_occupied = true`, populate `part_assignments` list
4. Return ordered list of locations (by `loc_no`)

### Business Rules Implementation:
1. **Empty Location**: Location with no `PartLocation` records → `is_occupied = false`
2. **Occupied Location**: Location with one or more `PartLocation` records → `is_occupied = true`
3. **Multiple Parts**: Though current model suggests one part per location (unique constraint), the schema supports multiple parts if business rules change
4. **Data Consistency**: Location occupancy must match box usage statistics already implemented

## Implementation Phases

### Phase 1: Core Implementation
1. Create new response schemas for location with part data
2. Implement service method to query locations with part assignments
3. Modify API endpoint to support enhanced response
4. Add comprehensive unit tests for service logic

### Phase 2: Integration & Testing
1. Add API integration tests for enhanced endpoint
2. Test data consistency between location data and box usage statistics
3. Verify performance with realistic data volumes
4. Test edge cases (empty boxes, fully occupied boxes)

### Phase 3: Validation & Documentation
1. Update API documentation (OpenAPI spec)
2. Validate frontend integration works seamlessly
3. Performance testing and optimization if needed
4. End-to-end testing of complete workflow

## Success Criteria Verification

The implementation will satisfy the requirements when:
- **✅ Frontend can display which parts are in each location** - Enhanced API provides `part_assignments` with part ID and quantity
- **✅ Empty locations are clearly identified** - `is_occupied = false` for locations without parts  
- **✅ Location data matches usage statistics** - Occupied count from location data equals usage stats
- **✅ Real-time data consistency** - Location data reflects current `part_locations` table state
- **✅ No frontend changes required** - API enhancement provides expected data structure

## Notes

- The implementation leverages existing SQLAlchemy relationships and eager loading patterns
- Database performance should be acceptable since locations per box are typically < 100
- The approach maintains backward compatibility through query parameters
- Error handling follows existing patterns with `@handle_api_errors` decorator
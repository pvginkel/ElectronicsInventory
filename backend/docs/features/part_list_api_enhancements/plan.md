# Part List API Enhancement Plan

## Brief Description
Enhance the part list API endpoint to include seller information (seller and seller_link) by default, and optionally include detailed location information (box, location, quantity) via a query string flag named `include_locations`.

## Files and Functions to Modify

### 1. `app/schemas/part.py`
- **Modify `PartWithTotalSchema`**: Add missing `seller_link` field (seller field already exists at line 359-362)
- **Create new schema**: `PartLocationListSchema` - Simplified location data for embedding within part responses
- **Create new schema**: `PartWithTotalAndLocationsSchema` - Extends `PartWithTotalSchema` with a `locations` field

### 2. `app/api/parts.py` 
- **Modify `list_parts()` function** (lines 50-89):
  - Add query parameter handling: `include_locations = request.args.get("include_locations", "false").lower() == "true"`
  - When `include_locations=true`, fetch location data for each part
  - Return `PartWithTotalAndLocationsSchema` when flag is true, otherwise return enhanced `PartWithTotalSchema`

### 3. `app/services/inventory_service.py`
- **Create new method**: `get_all_parts_with_totals_and_locations()` 
  - Similar to existing `get_all_parts_with_totals()` method (lines 283-315)
  - Additionally eager-loads the `part_locations` relationship for each part
  - Returns `PartWithTotalModel` instances with populated location data

## Step-by-Step Implementation

### Step 1: Schema Layer Updates
1. Add `seller_link` field to `PartWithTotalSchema` after the existing `seller` field
2. Create `PartLocationListSchema` with minimal fields:
   - `box_no: int` - Box number
   - `loc_no: int` - Location number within box  
   - `qty: int` - Quantity at this location
3. Create `PartWithTotalAndLocationsSchema` that includes:
   - All fields from `PartWithTotalSchema`
   - `locations: list[PartLocationListSchema]` - Array of location details

### Step 2: Service Layer Enhancement
1. Implement `get_all_parts_with_totals_and_locations()` method that:
   - Uses the same base query as `get_all_parts_with_totals()`
   - Adds `.options(selectinload(Part.part_locations))` to eager-load locations
   - Maintains the same filtering and pagination logic
   - Returns the same `PartWithTotalModel` structure

### Step 3: API Endpoint Update
1. Add query parameter parsing following the established pattern from `app/api/boxes.py` (line 133):
   ```python
   include_locations = request.args.get("include_locations", "false").lower() == "true"
   ```
2. Conditional logic based on flag:
   - If `include_locations=false` (default): Use existing `inventory_service.get_all_parts_with_totals()` and return with `PartWithTotalSchema` (with added seller_link)
   - If `include_locations=true`: Use new `inventory_service.get_all_parts_with_totals_and_locations()` and return with `PartWithTotalAndLocationsSchema`
3. Build response with location data when flag is true:
   - For each part, extract location data from `part.part_locations` relationship
   - Transform to `PartLocationListSchema` format
   - Include in response as `locations` array

## Query String Flag Pattern
Following the existing convention established in other endpoints:
- Parameter name: `include_locations`
- Default value: `"false"`
- Parsing method: `request.args.get("include_locations", "false").lower() == "true"`
- This matches the pattern used in:
  - `app/api/boxes.py` line 133: `include_parts`
  - `app/api/boxes.py` line 48: `include_usage`
  - `app/api/types.py` line 38: `include_stats`

## Response Structure Changes

### Without `include_locations` flag (default):
Current `PartWithTotalSchema` structure plus:
- `seller_link: str | None` - Product page URL at seller

### With `include_locations=true`:
All fields from default response plus:
- `locations: list[PartLocationListSchema]` - Array containing:
  - `box_no: int` - Box number
  - `loc_no: int` - Location number
  - `qty: int` - Quantity at this location
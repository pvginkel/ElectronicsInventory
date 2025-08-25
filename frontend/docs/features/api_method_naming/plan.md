# API Method Naming Customization Plan

## Brief Description

Implement custom method name generation for API operations to replace the current operationId-based naming with a more intuitive camelCase pattern. The transformation will extract path parameters, remove "__api" text, and convert to camelCase following a specific pattern.

## Required Transformation Pattern

- Extract all parameters from operationId (e.g., `{box_no}`, `{part_id4}`)
- Replace parameters with underscores in the base name
- Concatenate parameters with "_and_" if multiple exist
- Append parameters to operation name with "_by_" prefix
- Remove "__api" text unconditionally
- Convert entire result to camelCase, removing underscores

## Example Mappings

- `delete__api_boxes_{box_no}` → `deleteBoxesByBoxNo`
- `get__api_locations_{box_no}_{loc_no}` → `getLocationsByBoxNoAndLocNo`
- `post__api_inventory_parts_{part_id4}_move` → `postInventoryPartsMoveByPartId4`
- `get__api_parts` → `getParts`

## Files to Modify

### scripts/generate-api.js
- **Function `generateQueryHook`** (lines 126-166): Modify to use custom operation naming instead of `sanitizedOperationId`
- **Function `generateMutationHook`** (lines 171-226): Modify to use custom operation naming instead of `sanitizedOperationId`
- **Add new function `transformOperationId`**: Implement the transformation algorithm
- **Add new function `toCamelCase`**: Convert underscore-separated strings to camelCase
- **Add new function `extractParameters`**: Extract parameter names from operationId

## Transformation Algorithm

1. **Parameter Extraction**:
   - Find all `{parameter}` patterns in operationId
   - Store parameter names (e.g., `box_no`, `part_id4`)

2. **Base Name Processing**:
   - Replace `{parameter}` patterns with single underscore `_`
   - Remove `__api` substring completely
   - Clean up multiple consecutive underscores

3. **Parameter Suffix Generation**:
   - If parameters exist, create suffix `_by_param1_and_param2_and_param3`
   - Join multiple parameters with `_and_`

4. **Final Conversion**:
   - Concatenate base name + parameter suffix
   - Convert entire string to camelCase
   - Remove all underscores during camelCase conversion

## Implementation Steps

1. Create `transformOperationId(operationId)` function that implements the full transformation
2. Create `toCamelCase(str)` helper function for underscore to camelCase conversion
3. Create `extractParameters(operationId)` helper function for parameter extraction
4. Update `generateQueryHook` to use transformed operation name for hook naming
5. Update `generateMutationHook` to use transformed operation name for hook naming
6. Ensure queryKey generation remains consistent with new naming

## Testing Considerations

- Verify all current operationId values transform correctly
- Test edge cases: no parameters, single parameter, multiple parameters
- Ensure generated hooks maintain same functionality with new names
- Validate that TanStack Query integration remains intact
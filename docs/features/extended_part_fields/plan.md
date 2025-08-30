# Extended Part Fields - Technical Plan

## Description

Extend the Part entity with additional technical fields that are valuable for hobby electronics inventory management and can be reliably extracted by AI: package/form factor, pin count, primary voltage, mounting type, component series, and physical dimensions. These fields will enhance search capabilities and provide critical compatibility information for project planning.

## Files to Create or Modify

### Database Changes

1. **New Alembic migration** (`alembic/versions/xxx_add_extended_part_fields.py`)
   - Add new columns to `parts` table
   - Set all new fields as nullable to handle existing data
   - Create appropriate indexes for search performance

### Model Layer

2. **`app/models/part.py`**
   - Add new fields with proper types and constraints
   - Update `__repr__` method to include key technical specs
   - Add validation for enum-like fields where appropriate

### Schema Layer

3. **`app/schemas/part.py`**
   - Update all part schemas with new fields
   - Add proper validation and examples for each field
   - Include field descriptions for API documentation

### Service Layer

4. **`app/services/part_service.py`**
   - Update `create_part` method to accept new fields
   - Update `update_part_details` method to handle new fields
   - Add any necessary validation logic

### API Layer

5. **`app/api/parts.py`**
   - No changes needed (inherits from schema updates)

### Test Data

6. **`app/data/test_data/parts.json`**
   - Update test data to include realistic values for new fields
   - Ensure diverse examples across different component types

## New Fields Specification

### 1. Package/Form Factor
- **Column**: `package` VARCHAR(100)
- **Purpose**: Physical package type for the component
- **Examples**: "DIP-8", "SOIC-16", "0805", "TO-220", "ESP32-DevKit", "Arduino Uno", "2.54mm Headers"
- **Nullable**: Yes
- **Index**: Yes (for search performance)

### 2. Pin Count
- **Column**: `pin_count` INTEGER
- **Purpose**: Number of pins/connections on the component
- **Examples**: 8, 16, 28, 40, 2 (for simple components), NULL for passive components
- **Nullable**: Yes
- **Constraints**: CHECK (pin_count > 0 OR pin_count IS NULL)

### 3. Primary Voltage
- **Column**: `voltage_rating` VARCHAR(50)
- **Purpose**: Operating or rated voltage for the component
- **Examples**: "3.3V", "5V", "12V", "3.3V/5V", "1.8-5.5V", "±15V", "120V AC"
- **Nullable**: Yes
- **Note**: Store as string to handle ranges and multiple voltages

### 4. Mounting Type
- **Column**: `mounting_type` VARCHAR(50)
- **Purpose**: How the component is physically mounted
- **Examples**: "Through-hole", "Surface Mount", "Panel Mount", "Breadboard Compatible", "Socket Mount"
- **Nullable**: Yes
- **Consider**: Free text for flexibility

### 5. Component Series
- **Column**: `series` VARCHAR(100)
- **Purpose**: Component family or series identification
- **Examples**: "Arduino Uno", "STM32F4", "74HC", "LM78xx", "ESP32", "ATmega328P"
- **Nullable**: Yes
- **Index**: Yes (for grouping related components)

### 6. Physical Dimensions
- **Column**: `dimensions` VARCHAR(100)
- **Purpose**: Physical size of the component
- **Examples**: "20x15x5mm", "Standard DIP", "Credit card size", "53.4x68.6mm", "0805 (2.0x1.25mm)"
- **Nullable**: Yes
- **Note**: Free text to handle various formats

## Database Migration

Migration will add six new nullable VARCHAR columns to the parts table with appropriate length constraints and check constraints for pin_count. Indexes will be created on commonly searched fields: package, series, voltage_rating, and mounting_type for optimal search performance.

## Schema Updates

All Pydantic schemas will be updated to include the new fields as optional with appropriate validation constraints, length limits, and descriptive examples for API documentation. PartResponseSchema will include all new fields in response data.

## Service Layer Updates

PartService.create_part() method will accept all six new optional parameters and pass them to the Part constructor. PartService.update_part_details() method will accept the same parameters and update the corresponding fields when provided.

## Search Enhancement Opportunities

With these new fields, search can be enhanced to support queries like:
- "Show all 5V through-hole components"
- "Find DIP-8 packages in stock"  
- "List all Arduino Uno compatible items"
- "Show STM32F4 series components"

Consider adding dedicated search endpoints or enhancing existing search to leverage these fields.

## Test Data Updates

Test data in app/data/test_data/parts.json will be updated to include realistic technical specifications for all new fields across different component types to ensure diverse testing scenarios.

## Implementation Phases

### Phase 1: Database and Model Updates
1. Create and run Alembic migration
2. Update Part model with new fields
3. Update all schemas with new field definitions

### Phase 2: Service and API Integration
1. Update PartService methods to handle new fields
2. Test API endpoints with extended schemas
3. Validate field constraints and indexing

### Phase 3: Test Data and Documentation
1. Update test dataset with realistic technical specifications
2. Update API documentation examples
3. Add comprehensive test coverage for new fields

## Validation Rules

1. **Package**: Free text but commonly standardized formats
2. **Pin Count**: Must be positive integer if provided
3. **Voltage Rating**: Free text to handle ranges and multiple voltages
4. **Mounting Type**: Limited common values but flexible
5. **Series**: Free text for maximum flexibility
6. **Dimensions**: Free text to handle various measurement formats

## Backward Compatibility

- All new fields are nullable, so existing parts remain valid
- Existing API calls continue to work without providing new fields
- New fields are optional in create/update operations
- Response schemas include new fields but with null values for existing parts

## Testing Requirements

1. **Migration Testing**: Verify migration runs cleanly on existing data
2. **CRUD Testing**: Test create/update/read operations with new fields
3. **Validation Testing**: Verify field constraints work properly
4. **API Testing**: Test all endpoints with extended schemas
5. **Search Testing**: Verify new fields don't break existing search
6. **Performance Testing**: Ensure new indexes provide expected performance gains
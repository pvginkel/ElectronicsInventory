# Expanded Part Model - Technical Plan

## Overview

The backend Part model has been significantly expanded with new technical specification fields to better support electronics inventory management. The frontend needs to be updated to support these new fields in forms, display components, and validation logic.

## Current vs New Part Model

### Existing Frontend Fields (currently supported):
- `key` (string) - 4-character unique identifier
- `description` (string) - Free text description 
- `manufacturer_code` (string | null) - Manufacturer's part number
- `type_id` (number | null) - Part type/category ID
- `tags` (string[] | null) - Tags for categorization
- `seller` (string | null) - Vendor/supplier name
- `seller_link` (string | null) - Product page URL
- `created_at` (string) - Creation timestamp
- `updated_at` (string) - Last modification timestamp

### New Backend Fields (need frontend support):
- `dimensions` (string | null) - Physical dimensions (e.g., "20x15x5mm")
- `mounting_type` (string | null) - Physical mounting type (e.g., "Through-hole", "Surface Mount")
- `package` (string | null) - Physical package type (e.g., "DIP-8", "SOIC-16")
- `pin_count` (number | null) - Number of pins/connections
- `series` (string | null) - Component series identification (e.g., "74HC")
- `voltage_rating` (string | null) - Operating or rated voltage (e.g., "3.3V")

## Files That Need Modification

### 1. Form Components
**File**: `src/components/parts/part-form.tsx`
- **Changes**: Add new form fields for the 6 new properties
- **Interface Update**: Expand `PartFormData` interface to include new fields
- **Form Layout**: Update grid layout to accommodate new fields
- **API Calls**: Update create/update mutation calls to include new fields

### 2. Display Components  
**File**: `src/components/parts/part-details.tsx`
- **Changes**: Add display of new technical fields in the Part Information card
- **Layout**: Expand the part information section to show new fields when available

### 3. Utility Functions
**File**: `src/lib/utils/parts.ts`
- **Changes**: Update validation logic for new fields
- **Interface Updates**: Expand `PartData` and `Part` interfaces to include new fields
- **Validation Rules**: Add appropriate length/format validation for new fields

### 4. List/Grid Components
**File**: `src/components/parts/part-list.tsx`
- **Changes**: Show key technical specs in list view (mounting_type, package, voltage)

## Implementation Steps

### Phase 1: Core Form Support
1. **Update interfaces** in `src/lib/utils/parts.ts`:
   - Expand `PartData` interface with new optional fields
   - Expand `Part` interface with new fields matching backend schema
   - Add validation rules for new fields (length limits, format validation)

2. **Enhance PartForm component** in `src/components/parts/part-form.tsx`:
   - Add new form fields: `dimensions`, `mounting_type`, `package`, `pin_count`, `series`, `voltage_rating`
   - Update `PartFormData` interface to include new fields
   - Modify form layout to organize technical specs in a logical group
   - Update create/update API calls to pass new fields
   - Add form state management for new fields

### Phase 2: Display Enhancement  
3. **Update PartDetails component** in `src/components/parts/part-details.tsx`:
   - Add new section for "Technical Specifications" in the Part Information card
   - Display new fields with appropriate labels and formatting
   - Group related fields (physical: dimensions, package, pins; electrical: voltage; organizational: series)

### Phase 3: Enhancements
4. **Enhanced list view** in `src/components/parts/part-list.tsx`:
   - Show key specs mounting_type, package, voltage in compact view

5. **Search and filtering**:
   - Ensure search functionality works with new fields

## Field Organization in Forms

Group the new fields logically in the form layout:

### Physical Specifications
- **Dimensions** (text input)
- **Package** (text input) 
- **Pin Count** (number input)
- **Mounting Type** (text input or select with common options)

### Technical Specifications  
- **Voltage Rating** (text input)
- **Series** (text input)

### Form Layout Strategy
- Use a 2-column grid layout for most fields
- Group related fields visually with subtle borders or spacing
- Place technical specs after basic part information but before seller information

## Data Validation Rules

### String Fields (dimensions, mounting_type, package, series, voltage_rating)
- Maximum length: 100 characters each
- Allow null/empty values (all fields are optional)
- Trim whitespace on submission

### Number Field (pin_count)
- Positive integer only
- Maximum value: 9999 (reasonable upper bound)
- Allow null/empty values

## Backward Compatibility

All new fields are optional in the backend, ensuring:
- Existing parts without new fields continue to work
- Forms can be submitted with only legacy fields populated
- Display components gracefully handle missing new fields
- No breaking changes to existing functionality

## Testing Considerations

When testing framework is implemented, test scenarios should include:
- Form submission with only legacy fields (backward compatibility)
- Form submission with all new fields populated
- Form submission with mix of legacy and new fields
- Display of parts with and without new technical specifications
- Validation of new field constraints (length limits, number ranges)
- API integration with create/update operations including new fields
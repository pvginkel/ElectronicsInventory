# Enhanced Error Handling with User Feedback Plan

## Brief Description

Enhance the existing error handling infrastructure with domain-specific exceptions, improved error messages, and better client feedback while maintaining the current decorator-based pattern and Pydantic schema structure.

## Files and Functions to be Created or Modified

### Enhanced Error Response Infrastructure
- `app/schemas/common.py` - **MODIFY** - Enhance existing ErrorResponseSchema with error codes and context
- `app/utils/error_codes.py` - **NEW** - Standardized error code definitions for business errors
- `app/utils/error_handling.py` - **MODIFY** - Enhanced error classification and domain-specific message generation
- `app/utils/flask_error_handlers.py` - **MODIFY** - Add domain-specific error handlers

### Service Layer Error Enhancement
- `app/services/part_service.py` - **MODIFY** - Replace generic ValueError with domain-specific exceptions  
- `app/services/inventory_service.py` - **MODIFY** - Enhanced validation errors with field-specific details
- `app/services/box_service.py` - **MODIFY** - Better capacity and constraint validation errors
- `app/services/type_service.py` - **MODIFY** - Improved type validation and conflict detection
- `app/exceptions.py` - **NEW** - Custom service-level exceptions following single-file pattern

### API Layer Error Response Enhancement
- `app/api/parts.py` - **MODIFY** - Enhanced error responses with recovery suggestions
- `app/api/boxes.py` - **MODIFY** - Better validation error reporting for box operations
- `app/api/locations.py` - **MODIFY** - Location-specific error handling improvements
- `app/api/inventory.py` - **MODIFY** - Inventory operation error enhancement
- `app/api/types.py` - **MODIFY** - Type management error improvements

### Database Error Enhancement  
- `app/utils/constraint_mapper.py` - **NEW** - Map database constraints to business-friendly error messages
- `app/utils/validation_helpers.py` - **NEW** - Generic validation utilities for format and data type validation

### Testing Enhancement
- `tests/test_error_handling.py` - **NEW** - Comprehensive error handling test suite following existing pytest patterns
- `tests/test_validation_errors.py` - **NEW** - Validation error message and structure tests
- `tests/conftest.py` - **MODIFY** - Test fixtures for error scenario testing

## Step-by-Step Implementation

### Phase 1: Error Response Structure and Codes
1. **Enhance ErrorResponseSchema** - Extend existing schema in `app/schemas/common.py`:
   - Add optional `error_code` field for domain-specific error categorization
   - Add optional `context` field for additional error metadata
   - Maintain backward compatibility with existing `error` and `details` fields

2. **Create error_codes.py** - Standardized error classification:
   - `RECORD_NOT_FOUND`, `RESOURCE_CONFLICT`, `INSUFFICIENT_QUANTITY`
   - `CAPACITY_EXCEEDED`, `INVALID_OPERATION`, `RESOURCE_IN_USE`
   - `VALIDATION_FAILED`, `CONSTRAINT_VIOLATION`, `BUSINESS_RULE_ERROR`
   - `SYSTEM_ERROR`, `DATABASE_ERROR`, `EXTERNAL_SERVICE_ERROR`
   - Error code to HTTP status mapping with specific status codes:
     - `RECORD_NOT_FOUND` → 404
     - `RESOURCE_CONFLICT`, `INSUFFICIENT_QUANTITY`, `CAPACITY_EXCEEDED`, `RESOURCE_IN_USE` → 409
     - `INVALID_OPERATION` → 422
     - `VALIDATION_FAILED` → 400
     - `CONSTRAINT_VIOLATION`, `BUSINESS_RULE_ERROR` → 400

3. **Create ResourceType enum** - Standardized resource identification:
   - `PART`, `BOX`, `LOCATION`, `TYPE`, `INVENTORY`, `QUANTITY_HISTORY`
   - Used for consistent resource identification across all exceptions and error messages

### Phase 2: Service Layer Exception Enhancement
1. **Create exceptions.py** - Generic exception hierarchy:
   - `RecordNotFoundException` (for parts, boxes, locations, types)
   - `ResourceConflictException` (for occupied locations, duplicates)
   - `InsufficientQuantityException`, `CapacityExceededException`
   - `InvalidOperationException`, `ResourceInUseException`
   - Base exception class with standardized context structure:
     - `resource_type`: ResourceType enum value
     - `resource_id`: Business key identifier (box_no, part_id, etc.)
     - `operation`: What operation was being attempted
     - `additional_context`: Dictionary of extra relevant data
     - `error_code`: Corresponding error code from error_codes.py
     - `message`: Human-readable error message

2. **Enhance service methods** - Replace generic exceptions with standardized ones:
   - `PartService.create_part()` - Use `ResourceConflictException` for ID collisions, include business validation logic
   - `BoxService.get_box()` - Use `RecordNotFoundException` for missing boxes, include business validation logic
   - `InventoryService.add_stock()` - Use `CapacityExceededException` for location limits, include business validation logic
   - `InventoryService.remove_stock()` - Use `InsufficientQuantityException` for stock shortages, include business validation logic
   - All services - Contain business logic validation within service methods, use generic validation helpers for format/type validation only

3. **Create constraint_mapper.py** - Database constraint to business error mapping:
   - Map foreign key violations to `RecordNotFoundException` with referenced resource type
   - Map unique constraints to `ResourceConflictException` with conflicting field details
   - Map check constraints to appropriate business rule exceptions
   - Include affected fields, resource types, and suggested corrections

4. **Error message templates** - Standardized message patterns:
   - `RecordNotFoundException`: "{resource_type} not found: {resource_id}"
   - `ResourceConflictException`: "{resource_type} conflict: {details}"
   - `InsufficientQuantityException`: "Insufficient quantity: requested {requested}, available {available}"
   - `CapacityExceededException`: "Capacity exceeded: {resource_type} {resource_id} cannot accommodate {attempted} items"
   - `InvalidOperationException`: "Invalid operation on {resource_type} {resource_id}: {reason}"
   - `ResourceInUseException`: "{resource_type} {resource_id} is currently in use and cannot be modified"

### Phase 3: API Layer Error Response Enhancement
1. **Enhance @handle_api_errors decorator** - Improved error processing within existing pattern:
   - Add handling for custom domain exceptions
   - Error code assignment based on exception type
   - Context-aware message generation with business terminology
   - Field-level error details for validation failures

2. **Update API endpoints** - Better error response structure:
   - Replace generic error messages with specific, actionable feedback
   - Include relevant resource identifiers in error context
   - Provide suggested next steps for recoverable errors
   - Use enhanced ErrorResponseSchema with error codes

3. **Enhance flask_error_handlers.py** - Comprehensive error coverage:
   - Handle custom service exceptions with proper HTTP status codes
   - Improve validation error formatting with field context
   - Maintain existing JSON response structure

### Phase 4: Validation Enhancement
1. **Create validation_helpers.py** - Generic validation utilities only:
   - `validate_id4_format()` - Format validation for 4-letter uppercase IDs
   - `validate_positive_integer()` - Numeric range validation
   - `validate_string_length()` - String length constraints
   - `sanitize_input()` - Generic input sanitization
   - No business logic validation (stays in services)
   - Only create methods that that will be used; create them as needed and refactory when necessary

2. **Enhance Pydantic schemas** - Better validation error messages:
   - Custom validators with format-specific error messages
   - Field-level validation with examples of correct formats
   - Use generic validation helpers for format validation only
   - Business rule validation remains in service methods

3. **Improve business logic validation in services** - Service-level rule enforcement:
   - Part ID uniqueness validation with collision handling context in PartService
   - Location capacity validation with current usage details in InventoryService
   - Quantity constraints with available stock information in InventoryService
   - Type assignment validation with compatibility checks in TypeService
   - All business rules encapsulated within respective service methods

## Algorithms and Logic

### Error Classification Algorithm
```
classifyError(exception, context):
  1. Examine exception type and message content
  2. Extract business context from request data
  3. Determine appropriate error code and HTTP status
  4. Generate user-friendly message with business terminology
  5. Identify affected resources and relationships
  6. Suggest recovery actions based on error type and context
  7. Return structured error object with all metadata
```

### Validation Error Aggregation
```
aggregateValidationErrors(pydantic_errors, context):
  1. Group errors by field and validation rule
  2. Add business context to technical field names
  3. Generate field-specific error messages with examples
  4. Identify primary error and secondary validation issues
  5. Suggest correction steps prioritized by impact
  6. Return structured field error collection
```

### Database Constraint Mapping
```
mapConstraintViolation(integrity_error, context):
  1. Parse database error message for constraint details
  2. Map technical constraint names to business concepts
  3. Identify affected resources and relationships
  4. Generate business-friendly error description
  5. Suggest specific corrective actions
  6. Return mapped business error with context
```

## Implementation Phases

### Phase 1: Error Response Foundation
- Enhance existing ErrorResponseSchema with error codes and context
- Create error code system and HTTP status mapping
- Maintain backward compatibility with current error structure

### Phase 2: Service Layer Exception Handling  
- Create domain-specific exceptions in single exceptions.py file
- Replace generic exceptions with domain-specific ones
- Improve database constraint error mapping

### Phase 3: API Error Response Enhancement
- Enhance existing @handle_api_errors decorator
- Update flask error handlers for domain exceptions
- Maintain existing API endpoint patterns

### Phase 4: Validation Enhancement
- Create generic validation utilities for format and data type validation
- Strengthen Pydantic schema validation messages for format errors
- Enhance business rule validation within service methods
- Improve error context with affected resource details
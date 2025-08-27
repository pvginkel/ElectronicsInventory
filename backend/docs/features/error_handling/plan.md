# Simplified Error Handling Enhancement Plan

## Brief Description

Enhance the existing error handling infrastructure with domain-specific exceptions and user-ready error messages for the BFF pattern. Focus on providing clear, actionable messages that the web UI can display directly to users without requiring client-side message construction.

## Files and Functions to be Created or Modified

### Core Error Infrastructure
- `app/exceptions.py` - **NEW** - Custom domain exceptions with user-ready messages
- `app/utils/error_handling.py` - **MODIFY** - Enhanced @handle_api_errors decorator for custom exceptions

### Service Layer Enhancement
- `app/services/part_service.py` - **MODIFY** - Replace generic ValueError with domain-specific exceptions  
- `app/services/inventory_service.py` - **MODIFY** - Enhanced validation with user-friendly error messages
- `app/services/box_service.py` - **MODIFY** - Better capacity and constraint validation errors
- `app/services/type_service.py` - **MODIFY** - Improved type validation and conflict detection

### Testing Enhancement
- `tests/test_error_handling.py` - **NEW** - Comprehensive error handling test suite following existing pytest patterns
- `tests/conftest.py` - **MODIFY** - Test fixtures for error scenario testing

## Step-by-Step Implementation

### Phase 1: Domain Exception Classes
1. **Create exceptions.py** - Simple exception hierarchy with user-ready messages:
   - `InventoryException` - Base exception class with user-friendly message
   - `RecordNotFoundException` - "Box 5 was not found"
   - `ResourceConflictException` - "A box with number 5 already exists"
   - `InsufficientQuantityException` - "Not enough parts available (requested 10, have 3)"
   - `CapacityExceededException` - "Box 5 is full and cannot hold more items"
   - `InvalidOperationException` - "Cannot delete box 5 because it contains parts"

   Each exception includes:
   - User-ready message (complete, displayable sentence)
   - Simple constructor that formats message with specific values

2. **Message Templates** - Simple, direct user messages:
   - Focus on what went wrong and what the user can understand
   - Avoid technical jargon, error codes, or complex context
   - Include relevant identifiers (box numbers, part IDs) in natural language

### Phase 2: Service Layer Exception Enhancement
1. **Replace generic exceptions** in service methods:
   - `BoxService.get_box()` → `RecordNotFoundException("Box {box_no} was not found")`
   - `BoxService.create_box()` → `ResourceConflictException("A box with number {box_no} already exists")`
   - `InventoryService.add_stock()` → `CapacityExceededException("Box {box_no} is full and cannot hold more items")`
   - `InventoryService.remove_stock()` → `InsufficientQuantityException("Not enough parts available (requested {requested}, have {available})")`

2. **Improve database constraint mapping** in existing error_handling.py:
   - Map common constraint violations to user-friendly messages
   - Foreign key violations → "The referenced item was not found"
   - Unique constraint violations → "An item with these details already exists"
   - Not null violations → "Required information is missing"

### Phase 3: Enhanced Error Handler
1. **Enhance @handle_api_errors decorator**:
   - Add handling for custom `InventoryException` types
   - Return user message directly in `error` field
   - Keep existing handling for ValidationError and IntegrityError
   - Maintain current response structure: `{"error": "message", "details": "..."}`

2. **Simple error mapping**:
   - `RecordNotFoundException` → 404
   - `ResourceConflictException` → 409  
   - `InsufficientQuantityException` → 409
   - `CapacityExceededException` → 409
   - `InvalidOperationException` → 400
   - All custom exceptions → use exception.message as error field

### Phase 4: Testing
1. **Create comprehensive test suite**:
   - Test each custom exception with expected HTTP status and message
   - Test service layer methods throw appropriate exceptions
   - Test API endpoints return correct error responses
   - Follow existing pytest patterns with class-based organization

## Key Simplifications

1. **No error codes** - Messages are self-contained and user-ready
2. **No complex context objects** - Simple string messages with embedded details  
3. **No client-side message construction** - All messages ready for display
4. **No separate validation helpers** - Keep validation in services where business logic lives
5. **No resource type enums** - Use natural language in messages
6. **No recovery suggestions** - Focus on clear problem description

## BFF Pattern Focus

- **User-ready messages**: Every error message can be displayed directly in the UI
- **Simple response structure**: Maintain existing `{"error": "message", "details": "..."}` format
- **Contextual information**: Include relevant business identifiers in natural language
- **Consistent messaging**: Standardized message patterns across all domains
- **No client complexity**: Web UI simply displays the error message as-is
# OpenAPI and Request/Response Validation using Spectree (Pydantic v2) - Technical Plan

## Brief Description

Implement comprehensive OpenAPI documentation and request/response validation using Spectree as the single source of truth for schemas and docs. This will replace the current manual JSON validation with declarative Pydantic v2 schemas and automatic OpenAPI spec generation at `/docs`.

## Current State Analysis

The codebase already has:
- Spectree installed (`spectree = "^1.2.0"`) and basic initialization in `app/__init__.py:40-43`
- Pydantic v2 schemas in `app/schemas/` with proper `ConfigDict(from_attributes=True)`
- Manual JSON validation using `request.get_json()` and `BoxCreateSchema.model_validate()`
- Error handling via `@handle_api_errors` decorator
- Flask blueprints for `/boxes` and `/locations` endpoints

## Files and Functions to Create/Modify

### Core Integration Files

**`app/__init__.py`** (modify)
- Line 40-43: Enhance Spectree configuration with proper validation settings
- Add global response schemas for error handling

**`app/utils/spectree_config.py`** (create)
- Spectree instance configuration with Pydantic v2 compatibility
- Custom response formatting for API consistency
- Error response schema definitions

### API Blueprint Modifications

**`app/api/boxes.py`** (modify all endpoints)
- `create_box()`: Replace manual validation with `@api.validate()` decorator
- `list_boxes()`: Add response schema validation
- `get_box_details()`: Add path parameter and response validation
- `update_box()`: Replace manual JSON parsing with request schema validation
- `delete_box()`: Add proper response schema
- `get_box_locations()`: Add response validation

**`app/api/locations.py`** (modify)
- `get_location_details()`: Add path parameter and response validation

### Schema Enhancements

**`app/schemas/box.py`** (modify)
- Add `BoxUpdateSchema` for PUT requests
- Add proper field descriptions and examples for OpenAPI
- Enhance validation rules with Pydantic v2 features

**`app/schemas/location.py`** (modify)
- Add field descriptions and examples
- Ensure proper OpenAPI documentation generation

**`app/schemas/common.py`** (create)
- Common response schemas (`ErrorResponseSchema`, `SuccessResponseSchema`)
- Base schemas for consistent API responses
- Pagination schemas for future use

### Error Handling Integration

**`app/utils/error_handling.py`** (modify)
- Integration with Spectree validation errors
- Consistent error response formatting
- Proper HTTP status code mapping for validation failures

## Step-by-Step Implementation Algorithm

### Phase 1: Core Spectree Configuration
1. Create `spectree_config.py` with proper Pydantic v2 integration
2. Configure Spectree instance with custom validation and response formatting
3. Define common response schemas in `schemas/common.py`
4. Update Flask app factory to use enhanced Spectree configuration

### Phase 2: Schema Enhancement
1. Add comprehensive field descriptions and examples to existing schemas
2. Create missing request schemas (`BoxUpdateSchema`)
3. Implement common response schemas for consistent API structure
4. Add proper validation rules using Pydantic v2 features (Field constraints, custom validators)

### Phase 3: API Decorator Integration
1. Replace manual JSON validation in `boxes.py` endpoints with `@api.validate()` decorators
2. Add response schema validation to all endpoints
3. Update path parameter validation using Spectree patterns
4. Integrate error handling with Spectree validation failures

### Phase 4: Documentation and Testing
1. Verify OpenAPI spec generation at `/docs` endpoint
2. Test automatic request validation and error responses
3. Ensure backward compatibility with existing API clients
4. Validate that all endpoints properly generate OpenAPI documentation

## Implementation Phases

### Phase 1: Foundation (Core Integration)
- Spectree configuration and common schemas
- Basic decorator integration for one endpoint as proof of concept

### Phase 2: Complete API Coverage
- All existing endpoints migrated to Spectree validation
- Enhanced schema documentation
- Proper error handling integration

### Phase 3: Future-Ready Structure
- Extensible schema patterns for upcoming endpoints (/parts, /search, /shopping-list)
- Advanced validation features (conditional validation, custom validators)
- Response caching and performance optimizations

## Key Technical Considerations

1. **Pydantic v2 Compatibility**: Ensure all decorators use `pydantic.v1` compatibility mode if needed, or verify Spectree v1.2.0 supports Pydantic v2 natively

2. **Existing Error Handling**: Preserve the current `@handle_api_errors` decorator behavior while integrating Spectree validation errors

3. **Schema Reuse**: Leverage existing schemas in `app/schemas/` as single source of truth for both validation and documentation

4. **Backward Compatibility**: Ensure API responses maintain current JSON structure to avoid breaking existing clients

5. **Performance**: Validation should not significantly impact response times; consider caching compiled schemas

## Validation Strategy

- **Request Validation**: Automatic JSON schema validation via `@api.validate(json=Schema)`
- **Path Parameter Validation**: Built-in validation for path parameters like `box_no`
- **Response Validation**: Optional response schema validation in development/testing
- **Error Handling**: Consistent error response format with proper HTTP status codes
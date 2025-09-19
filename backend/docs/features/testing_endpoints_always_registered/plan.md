# Testing Endpoints Always Registered - Technical Plan

## Overview
Modify the testing endpoints implementation to always register routes but return HTTP 400 error when not in testing mode. This ensures OpenAPI metadata generation works correctly regardless of FLASK_ENV setting while maintaining security.

## Exception Definition

### Files to Create:
None - modifying existing exception file.

### Files to Modify:

**`app/exceptions.py`:**
- Add new exception class `RouteNotAvailableException` inheriting from `BusinessLogicException`
- Include appropriate error code (e.g., `ROUTE_NOT_AVAILABLE`)
- Default message: "This endpoint is only available when the server is running in testing mode"

## Blueprint Modification

### Files to Modify:

**`app/api/testing.py`:**
- Add `before_request` function to the testing blueprint that:
  - Accesses the container via `current_app.container`
  - Gets Settings service using `container.config()`
  - Checks `settings.is_testing` property
  - If not in testing mode, raises `RouteNotAvailableException`
  - Applies automatically to all routes in the blueprint
- Remove the `register_testing_blueprint_conditionally` function
- Register blueprint directly without conditional wrapper

**`app/__init__.py`:**
- Remove conditional registration of testing blueprint
- Always register testing blueprint with `app.register_blueprint(testing_bp)`
- Keep conditional dependency injection wiring for testing module (performance optimization)

**`app/utils/error_handling.py`:**
- Add handling for `RouteNotAvailableException` → HTTP 400 status
- Include in the exception mapping dictionary

## Algorithm

### Before Request Check:
1. Blueprint registers a `@testing_bp.before_request` handler
2. Handler accesses container via `current_app.container`
3. Gets Settings service using `container.config()`
4. Checks `settings.is_testing` property
5. If not in testing mode (is_testing returns False):
   - Raises `RouteNotAvailableException`
   - Exception automatically handled by `@handle_api_errors` decorator
   - Returns HTTP 400 with structured error response (400 chosen because endpoint doesn't apply to current server mode)
6. If in testing mode (is_testing returns True):
   - Request proceeds normally to route handler

### Error Response Structure:
```json
{
  "error": "This endpoint is only available when the server is running in testing mode",
  "code": "ROUTE_NOT_AVAILABLE",
  "details": {"message": "Testing endpoints require FLASK_ENV=testing"},
  "correlationId": "abc-123"
}
```

## Implementation Details

### Blueprint Registration Flow:
1. Testing blueprint always registered in application factory
2. OpenAPI documentation always includes testing endpoints
3. Runtime check prevents execution when not in testing mode
4. No manual checks needed in individual route handlers

### Dependency Injection Considerations:
- Keep conditional wiring of testing module for performance
- Container accessed via `current_app.container` in before_request handler (Flask pattern)
- Maintain existing service injection patterns in route handlers using `@inject`

## Testing Requirements

### Files to Modify:
**`tests/api/test_testing.py`:**
- Add tests for non-testing mode behavior:
  - Verify all testing endpoints return HTTP 400 when FLASK_ENV != "testing"
  - Verify correct error structure with `ROUTE_NOT_AVAILABLE` code
  - Test both `/reset` and `/logs/stream` endpoints
- Keep existing tests for testing mode functionality
- Ensure OpenAPI metadata includes testing endpoints regardless of mode

### Test Coverage:
1. Testing endpoints return 400 with proper error when not in testing mode
2. Testing endpoints work normally when in testing mode
3. Error responses include correlation IDs
4. OpenAPI documentation always includes testing endpoints
5. Before_request applies to all current and future routes in blueprint
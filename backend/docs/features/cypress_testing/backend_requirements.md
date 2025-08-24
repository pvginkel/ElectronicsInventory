# Backend Requirements for Frontend Cypress Testing

## Brief Description

Add testing environment support and test-specific API endpoints to enable reliable frontend Cypress E2E testing. The backend will detect `FLASK_ENV=testing` and expose additional endpoints for database reset and test data management.

## Files to Create or Modify

### Files to Modify

**`app/config.py`**
- Add support for `FLASK_ENV=testing` environment detection

**`app/__init__.py`**
- Register testing blueprint conditionally when `FLASK_ENV=testing`
- Add environment check logic for test-only features

**`run.py`**
- Support starting server with `FLASK_ENV=testing` environment variable

### Files to Create

**`app/api/testing.py`**
- New blueprint with `/api/test` prefix
- Before request hook to ensure endpoints only work when `FLASK_ENV=testing`
- `DELETE /api/test/reset` - Reset database to clean state

## Required Functionality

### Environment Detection
- Backend must detect when running in testing mode via `FLASK_ENV=testing`
- Test endpoints must be completely disabled in non-testing environments
- Return 404 for test endpoints when not in testing mode

### Database Reset Endpoint
- `DELETE /api/test/reset` endpoint that clears all data from database
- Should drop and recreate all tables to ensure clean state
- Only available when `FLASK_ENV=testing`

### Security Requirements
- Test endpoints must be completely inaccessible in production
- No configuration option to enable in production
- Hard-coded environment check in before_request hook

## Implementation Phases

### Phase 1: Basic Testing Environment
1. Add `FLASK_ENV=testing` support to config
2. Update app factory to conditionally register testing blueprint
3. Create testing blueprint with environment protection

### Phase 2: Database Management Endpoints
1. Implement database reset endpoint
2. Add error handling and response formatting

## Notes

- Database connection string management handled separately (not in scope)
- All test endpoints return JSON responses
- Test endpoints should be fast to minimize test execution time
- No authentication required (test environment assumed secure)
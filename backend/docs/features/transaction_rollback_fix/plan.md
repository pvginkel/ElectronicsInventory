# Transaction Rollback Fix

## Description

Fix the systemic issue where database transactions are committed even when operations fail partway through. The `@handle_api_errors` decorator catches exceptions and converts them to HTTP responses, preventing Flask's teardown handler from detecting errors and triggering rollbacks. This causes data integrity issues when multi-step operations fail (e.g., creating parts with attachments where attachment creation fails but the part is still created).

## Files and Functions to Modify

### 1. `app/utils/error_handling.py`
- **Function**: `handle_api_errors` decorator
- **Modification**: Add logic to mark the session for rollback using `Session.info` dictionary when any exception is caught

### 2. `app/__init__.py`
- **Function**: `close_session` (teardown_request handler)
- **Modification**: Check `db_session.info.get('needs_rollback')` in addition to the `exc` parameter to determine if rollback is needed

### 3. `app/api/ai_parts.py`
- **Function**: `create_part_from_ai_analysis`
- **Modification**: Remove the manual try/except rollback logic added as a temporary fix

### 4. `tests/test_ai_parts_api.py`
- **Function**: `test_create_part_with_attachment_failure_should_rollback`
- **Modification**: Keep existing test to verify the structural fix works

### 5. New test files to create:
- `tests/test_transaction_rollback.py` - Comprehensive tests for the rollback mechanism
- Additional test methods in existing test files for vulnerable endpoints

## Implementation Algorithm

### Step 1: Mark Session for Rollback in Error Handler
1. In `handle_api_errors` wrapper function, before handling any exception
2. Import Flask's `current_app` to access the service container
3. Get the current database session from the container: `container.db_session()`
4. Set rollback flag in session info: `db_session.info['needs_rollback'] = True`
5. Continue with existing exception handling and HTTP response generation

### Step 2: Check Rollback Flag in Teardown Handler
1. In `close_session` teardown handler, get the database session
2. Check both conditions for rollback:
   - Original: `if exc` (Flask detected an unhandled exception)
   - New: `if exc or db_session.info.get('needs_rollback', False)`
3. Perform rollback if either condition is true
4. Clear the flag after checking: `db_session.info.pop('needs_rollback', None)`
5. Continue with existing session cleanup

### Step 3: Clean Up Temporary Fix
1. Remove try/except block from `create_part_from_ai_analysis`
2. Remove manual `db_session.rollback()` call
3. Remove explicit flush and transaction management
4. Return to simpler original implementation

## Why Session.info Instead of Flask.g

Using `Session.info` dictionary is architecturally cleaner because:
- It keeps database-related state with the database session
- No dependency on Flask's request context in error handling
- The flag naturally lives with the session it affects
- Automatic cleanup when session is reset
- SQLAlchemy designed this dictionary specifically for session metadata

## Test Coverage Requirements

### Unit Tests for Rollback Mechanism
1. Test that `ValidationError` triggers rollback
2. Test that `IntegrityError` triggers rollback  
3. Test that generic `Exception` triggers rollback
4. Test that successful operations still commit
5. Test that flag is cleared after request

### Integration Tests for Vulnerable Endpoints
1. AI parts creation with failing attachments (existing)
2. Document uploads with failing S3 operations
3. Inventory moves with constraint violations
4. Box operations with capacity exceeded errors
5. Part updates with invalid references

## Verification Steps

1. Run existing `test_create_part_with_attachment_failure_should_rollback` - should pass
2. Create and run new comprehensive rollback tests
3. Verify no regressions in existing test suite
4. Test manually with real attachment failures
5. Verify logs show proper rollback messages
# Empty String to NULL Normalization

## Brief Description
Implement a low-level SQLAlchemy event hook that automatically converts all empty strings to NULL values before records are written to the database. This is especially important for non-nullable fields where empty strings can pass NOT NULL validation while providing no meaningful data. For nullable fields, this prevents inconsistent database state where some records have NULL and others have empty strings for the same logical "no value" condition.

## Files to Create/Modify

### New Files:
- `app/utils/empty_string_normalization.py` - Event handler implementation
- `tests/test_empty_string_normalization.py` - Comprehensive test suite
- `alembic/versions/XXX_cleanup_empty_strings.py` - Migration to clean existing data

### Modified Files:
- `app/__init__.py` - Register the event handler in application factory (import after models, before SessionLocal initialization)

## Step-by-Step Algorithm

### Event Handler Implementation (`app/utils/empty_string_normalization.py`)

1. Import required modules:
   - `from sqlalchemy import event, inspect`
   - `from sqlalchemy.sql.sqltypes import String, Text`
   - `from app.extensions import db`

2. Define normalization function `normalize_empty_strings(mapper, connection, target)`:
   - Get column metadata: `columns = inspect(mapper.class_).columns`
   - Iterate through each column
   - Check if column type is String or Text using `isinstance(column.type, (String, Text))`
   - For ALL string/text columns:
     - Get current value: `value = getattr(target, column.name, None)`
     - Check if value is string type: `isinstance(value, str)`
     - Check if empty or whitespace: `value.strip() == ""`
     - If true, set to None: `setattr(target, column.name, None)`
     - Let SQLAlchemy's own NOT NULL constraint validation handle any violations

3. Register event listeners:
   - Use decorator: `@event.listens_for(db.Model, "before_insert", propagate=True)`
   - Use decorator: `@event.listens_for(db.Model, "before_update", propagate=True)`
   - Set `propagate=True` to apply to all model subclasses

### Application Integration (`app/__init__.py`)

1. After model import (line 31: `from app import models`) but before SessionLocal initialization, add:
   - `from app.utils import empty_string_normalization  # noqa: F401`
   - The import triggers event registration via decorators
   - Specific location: After line 31, before line 35

### Test Implementation (`tests/test_empty_string_normalization.py`)

1. Test empty string on insert:
   - Create Part with `manufacturer_code=""`
   - Save to database
   - Verify `manufacturer_code is None`

2. Test empty string on update:
   - Create Part with valid `manufacturer_code="ABC123"`
   - Update to `manufacturer_code=""`
   - Verify `manufacturer_code is None`

3. Test whitespace-only strings:
   - Test with `"   "` (spaces)
   - Test with `"\t\n"` (tabs/newlines)
   - Verify all become `None`

4. Test valid strings preserved:
   - Create Part with `manufacturer_code="ABC123"`
   - Verify remains `"ABC123"`

5. Test None values unchanged:
   - Create Part with `manufacturer_code=None`
   - Update other fields
   - Verify remains `None`

6. Test non-nullable fields reject empty strings:
   - Attempt to create Part with `description=""` (non-nullable)
   - Verify SQLAlchemy IntegrityError is raised (standard NOT NULL constraint violation)
   - Attempt to create Seller with `name=""` (non-nullable)
   - Verify SQLAlchemy IntegrityError is raised
   - Error handling remains unchanged - existing SQLAlchemy NOT NULL validation applies

7. Test all affected models:
   - Part: Test various string fields
   - PartAttachment: Test various string fields
   - QuantityHistory: Test string fields
   - Seller: Test string fields

## Affected Models and Fields

The normalization will apply to ALL String and Text columns across all models in the database, regardless of nullability. Empty strings are always converted to NULL, and SQLAlchemy's built-in constraint validation will handle NOT NULL violations for required fields. JSON fields and ARRAY fields are out of scope - only simple String/Text columns are affected.

## Database Cleanup Migration

### Migration File (`alembic/versions/XXX_cleanup_empty_strings.py`)

The migration will dynamically clean up all existing empty strings in the database using SQLAlchemy's metadata inspection.

1. Migration structure:
   - Create using: `alembic revision -m "Cleanup empty strings to NULL"`
   - Implement `upgrade()` function (downgrade will be no-op as rollback is not a concern)

2. Dynamic upgrade function algorithm:
   ```python
   def upgrade():
       # Get metadata from current database
       bind = op.get_bind()
       inspector = sqlalchemy.inspect(bind)

       # Iterate through all tables
       for table_name in inspector.get_table_names():
           columns = inspector.get_columns(table_name)

           for column in columns:
               # Check if column is String/Text type
               if isinstance(column['type'], (String, Text)):
                   column_name = column['name']

                   # Convert ALL empty strings to NULL regardless of nullability
                   # If column is NOT NULL, existing SQLAlchemy constraints will apply
                   op.execute(
                       f"UPDATE {table_name} "
                       f"SET {column_name} = NULL "
                       f"WHERE TRIM({column_name}) = ''"
                   )
   ```

3. Benefits of dynamic approach:
   - Automatically handles all current and future text columns
   - No need to maintain a list of specific columns
   - Reduces migration code maintenance
   - Ensures no text field is missed

4. Downgrade function:
   - Leave as pass (no-op) - rollback is not a concern for this pre-production application

## Important Considerations

### Why This Matters for Data Integrity

1. **Non-Nullable Field Protection**: Empty strings can bypass NOT NULL constraints, allowing meaningless data into required fields. This hook ensures that required fields contain actual data by converting empty strings to NULL, which SQLAlchemy's existing NOT NULL validation will then reject.

2. **Consistency**: Without this normalization, the database can have both NULL and empty string values representing "no data", making queries inconsistent (e.g., `WHERE column IS NULL` vs `WHERE column = ''` vs `WHERE column IS NULL OR column = ''`).

3. **Data Quality**: Prevents the storage of whitespace-only values that appear to contain data but are effectively empty.

4. **Query Simplification**: With normalization, queries only need to check `IS NULL` instead of multiple conditions.

5. **API Consistency**: Frontend can always expect NULL for "no value" instead of handling both NULL and empty string cases.

### Scope Clarifications

1. **Error Handling**: No special error handling is needed - SQLAlchemy's existing NOT NULL constraint validation will handle violations when empty strings are converted to NULL for required fields.

2. **Performance**: Performance impact is minimal and acceptable for the target user group.

3. **Model Coverage**: All models are included via `propagate=True` - no exceptions.

4. **Field Types**: Only simple String and Text columns are affected. JSON and ARRAY fields are explicitly out of scope.

5. **Test Data**: The implementation handles any existing test data with empty strings - they will be converted to NULL during migration and prevented going forward.
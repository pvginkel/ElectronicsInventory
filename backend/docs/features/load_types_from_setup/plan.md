# Load Types from Setup File

## Brief Description

Create a system to automatically sync types from `app/data/setup/types.txt` during database upgrades. Every time the database is upgraded (including initial creation), the system will automatically add any types from the setup file that aren't already in the database. This ensures consistency across all environments and provides a single source of truth for the 101 predefined electronics part types. The types file contains one type per line, with empty lines and comment lines (starting with #) ignored.

## Files to Create

### 1. `app/services/setup_service.py` (NEW)
- Create new service for database initialization
- **Function: `sync_types_from_setup() -> int`**
  - Read from `app/data/setup/types.txt`
  - Parse text file line by line, skipping empty lines and lines starting with `#`
  - For each type name: check if it already exists in database
  - Create Type objects only for types that don't exist
  - Return count of types added
  - Fully idempotent - safe to run multiple times

### 2. `tests/test_setup_service.py` (NEW)
- Test SetupService.sync_types_from_setup()
- Test idempotency (running multiple times adds no duplicates)
- Test error handling
- Test with existing types in database

## Files to Modify

### 3. `app/database.py`
- **Function: `upgrade_database(recreate: bool = False) -> list[tuple[str, str]]`**
  - After successful migration application, call SetupService.sync_types_from_setup()
  - Log how many types were added during sync
  - Ensure this happens for both normal upgrades and recreate scenarios

### 4. `app/services/container.py`
- Add SetupService to dependency injection container

### 5. `app/services/test_data_service.py`
- **Function: `load_types(self, data_dir: Path) -> dict[str, Type]`**
  - Change implementation to read from `app/data/setup/types.txt` instead of `data_dir/types.json`
  - Parse text file line by line, skipping empty lines and lines starting with `#`
  - Create Type objects for each valid line
  - Return dictionary mapping type names to Type objects

### 6. `app/data/test_data/parts.json`
- Update all `type` field values to match exact names from `types.txt`
- Map current generic types to specific types from the new list

### 7. `tests/test_test_data_service.py`
- **Function: `test_load_types_success`**
  - Create temporary `types.txt` file instead of `types.json`
  - Use plain text format with test data
- **Function: `test_load_types_file_not_found`**
  - Update to expect `types.txt` instead of `types.json`
- **Function: `test_load_types_invalid_format`**
  - Update to test invalid text file format

### 8. `CLAUDE.md`
- Update "JSON Data Files Location" section to remove reference to `types.json`
- Update documentation about test data management to mention types come from setup file
- Add section about `init-types` command for production database initialization

### 9. Delete File
- Remove `app/data/test_data/types.json` (obsolete)

## Algorithms

### Type Sync Algorithm (SetupService.sync_types_from_setup)

```
1. Determine path to types.txt:
   path = Path(__file__).parent.parent / "data" / "setup" / "types.txt"

2. Open and read types.txt file:
   - If file not found, raise InvalidOperationException

3. Get existing type names from database:
   existing_types = SELECT name FROM types

4. Parse file line by line and collect new types:
   new_types = []
   for line in file:
     a. Strip whitespace from line
     b. If line is empty, continue to next line
     c. If line starts with '#', continue to next line
     d. If line not in existing_types, add to new_types list

5. Create Type objects for new types:
   for type_name in new_types:
     a. Create Type object with name=type_name
     b. Add Type to database session

6. Commit transaction and return count of new types added
```

### Parsing types.txt Algorithm (TestDataService.load_types)

```
1. Determine path to types.txt:
   path = Path(__file__).parent.parent / "data" / "setup" / "types.txt"

2. Open and read types.txt file:
   - If file not found, raise InvalidOperationException

3. Parse file line by line:
   for line in file:
     a. Strip whitespace from line
     b. If line is empty, continue to next line
     c. If line starts with '#', continue to next line
     d. Create Type object with name=line
     e. Add Type to database session
     f. Flush to get ID immediately
     g. Store in types_map[line] = type_object

4. Return types_map dictionary
```

### Type Mapping for parts.json

The following mappings must be applied to all parts in `parts.json`:

| Current Type Value | New Type Value from types.txt |
|-------------------|-------------------------------|
| "IC" | "Logic ICs (74xx/4000)" |
| "Resistor" | "Resistors" |
| "Capacitor" | "Capacitors" |
| "LED" | "LEDs (Discrete)" |
| "Relay" | "Relays (Electromechanical)" |
| "Power Module" | "DC-DC Converters (ICs & Modules)" |
| "Connector" | "Connectors - Pin Headers & Sockets" |
| "Cable" | "Cables - Jumper Wires" |
| "Sensor" | "Sensors" |
| "Microcontroller" | "Microcontrollers" |
| "Mechanical" | "Mounting Hardware (Standoffs/Screws/Nuts)" |

Note: Some mappings may need refinement based on specific part characteristics (e.g., different connector or cable types).

## Implementation Steps

1. **Create SetupService**
   - New service class with sync_types_from_setup() method
   - Implement idempotent type syncing with database queries
   - Register in dependency injection container

2. **Integrate with database upgrade**
   - Modify upgrade_database() to call type sync after migrations
   - Ensure it works for both normal upgrades and recreate scenarios
   - Add appropriate logging

3. **Update TestDataService**
   - Modify load_types() to use setup/types.txt instead of JSON
   - Maintain backward compatibility with return type

4. **Update test data**
   - Map all parts in parts.json to new type names from types.txt
   - Ensure exact case-sensitive matches

5. **Update tests**
   - Create tests for SetupService
   - Update TestDataService tests for text format
   - Test integration with database upgrade process

6. **Clean up**
   - Delete obsolete types.json
   - Update all documentation

7. **Verify integration**
   - Test database upgrade on fresh database (should add all 101 types)
   - Test upgrade on existing database (should add only missing types)
   - Test `load-test-data` command
   - Verify idempotency of multiple upgrades

## Production Database Initialization Workflow

After implementing this feature, the workflow for setting up a new production database will be:

1. `poetry run python -m app.cli upgrade-db` - Creates database schema AND automatically loads all 101 predefined types
2. Database is ready for production use with standard electronics part types

For subsequent schema updates:
- `poetry run python -m app.cli upgrade-db` - Applies new migrations AND syncs any new types from setup file

For development:
- `poetry run python -m app.cli load-test-data --yes-i-am-sure` - Loads schema, syncs types from setup file, and loads realistic test data

The type sync happens automatically during any database upgrade, ensuring types are always in sync with the setup file.
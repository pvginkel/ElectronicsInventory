# Load Master Data Unconditionally in CLI Tool

## Description

Currently, the CLI tool only loads master data (types from `app/data/setup/types.txt`) when database migrations are applied via the `upgrade_database()` function. This feature will modify the CLI tool to load master data unconditionally, regardless of whether database migrations were applied or not. This ensures that master data is always synchronized when any CLI command is executed.

## Files and Functions to Modify

### 1. `app/cli.py`
- **Function: `main()`** - Add master data synchronization after creating the Flask app
- **New function: `sync_master_data(app: Flask)`** - New helper function to handle master data synchronization

### 2. `app/database.py`
- **Function: `sync_master_data_from_setup()`** - Extract and rename `_sync_types_from_setup()` to make it publicly accessible
- **Function: `upgrade_database()`** - Update to call the renamed public function

## Implementation Steps

### Step 1: Refactor Master Data Sync Function
1. In `app/database.py`, rename `_sync_types_from_setup()` to `sync_master_data_from_setup()` to make it a public function
2. Update all references to this function within `upgrade_database()`

### Step 2: Create Master Data Sync Helper in CLI
1. Add a new function `sync_master_data()` in `app/cli.py` that:
   - Takes a Flask app instance as parameter
   - Runs within the app context
   - Calls `sync_master_data_from_setup()` from `app/database.py`
   - Handles any exceptions gracefully with appropriate error messages

### Step 3: Integrate Master Data Sync into CLI Flow
1. In the `main()` function of `app/cli.py`:
   - After creating the Flask app with `create_app()`
   - Before routing to specific command handlers
   - Call the new `sync_master_data()` function
   - This ensures master data is synchronized for every CLI invocation

### Step 4: Update Command Handlers
1. Remove redundant type synchronization from `upgrade_database()` function if needed (it can remain as it's idempotent)
2. Ensure the synchronization happens exactly once per CLI invocation

## Algorithm

1. CLI tool starts (`main()` function)
2. Flask app is created
3. **NEW**: Master data synchronization runs unconditionally:
   - Read existing types from database
   - Read types from `app/data/setup/types.txt`
   - Add any missing types to database
   - Log results (added count or "already up to date")
4. Command-specific handler executes (upgrade-db, load-test-data, etc.)
5. CLI tool exits

## Error Handling

- If database connection fails during master data sync, log warning but continue (non-blocking)
- If types.txt file is missing or unreadable, log warning but continue
- Master data sync failures should not prevent CLI commands from executing
- All errors should be logged with clear messages indicating the issue

## Benefits

- Ensures master data is always synchronized when using CLI tools
- Eliminates the need to run `upgrade-db` just to sync types
- Maintains backward compatibility with existing workflows
- Idempotent operation prevents duplicate data issues
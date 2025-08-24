# Database CLI Commands - Technical Plan

## Brief Description

Implement a single `upgrade-db` CLI command in `app/cli.py` with optional `--recreate` flag. The command applies pending Alembic migrations by default, or drops all tables and recreates from migrations when `--recreate` is used with `--yes-i-am-sure` safety flag.

## Files to Create or Modify

### Files to Modify
- `app/cli.py` - Implement CLI command and main entry point
- `app/database.py` - Add functions for dropping tables and Alembic operations

### Files to Reference (no changes needed)
- `app/config.py` - Database configuration via `Settings` class
- `app/extensions.py` - Flask-SQLAlchemy instance
- `alembic/env.py` - Alembic configuration for migrations
- `pyproject.toml` - CLI script entry point already configured

## Implementation Details

### CLI Command Structure
1. **Main CLI entry point** (`app/cli.py:main()`)
   - Parse command line arguments using `argparse`
   - Single `upgrade-db` command with optional flags
   - Initialize Flask app context for database operations

2. **upgrade-db command**
   - Default behavior: Apply pending migrations using Alembic API
   - `--recreate` flag: Drop all tables first, then run all migrations from scratch
   - `--yes-i-am-sure` flag: Required when using `--recreate` for safety
   - Report migration status before and after operations

### Database Operations (`app/database.py`)
1. **drop_all_tables()**
   - Reflect existing database schema using SQLAlchemy metadata
   - Drop all tables in correct order (handling foreign key constraints)
   - Drop Alembic version table to reset migration state
   - Clear SQLAlchemy metadata cache

2. **get_current_revision()**
   - Query Alembic version table for current revision
   - Return None if no version table exists or database is empty

3. **upgrade_database(recreate: bool = False)**
   - If recreate=True: Drop all tables first, then upgrade from empty state
   - Get list of pending migrations before starting
   - Use custom migration runner that shows progress for each migration
   - Return list of applied migrations with revision info

4. **get_pending_migrations()**
   - Use Alembic API to compare current revision with head
   - Return list of pending migration revisions

5. **run_migrations_with_progress(config, target_revision)**
   - Use `alembic.script.ScriptDirectory` to enumerate pending migrations
   - Extract migration metadata from revision files:
     - Parse filename for revision number and slug
     - Read docstring from migration file for description
   - For each pending migration:
     - Print "Applying schema {revision}_{slug} - {description}"
     - Apply single migration using `alembic.command.upgrade(config, revision)`
     - Handle any migration errors and report clearly

### Alembic Integration
1. **Use Alembic programmatic API**
   - Import `alembic.command` and `alembic.config`
   - Create AlembicConfig instance pointing to `alembic.ini`
   - Override database URL from Flask configuration

2. **Migration operations with progress reporting**
   - `alembic.command.upgrade(config, "head")` - Apply all pending migrations
   - `alembic.command.current(config)` - Get current revision
   - `alembic.command.heads(config)` - Get latest available revision
   - Custom progress callback to show real-time migration application

3. **Real-time migration progress**
   - Override Alembic's logging/output to capture migration events
   - Use `alembic.script.ScriptDirectory` to get migration metadata (revision + description)
   - Hook into Alembic's migration execution to display:
     - "Applying schema 003_create_parts_tables - Create parts tables"
     - "Applying schema 004_add_inventory_tracking - Add inventory tracking"
   - Show progress before each migration is applied, not after

### Safety Mechanisms
1. **Confirmation required for destructive operations**
   - `--recreate` requires explicit `--yes-i-am-sure` flag
   - Print clear warning about data loss before proceeding

2. **Environment validation**
   - Check database connectivity before operations
   - Validate DATABASE_URL configuration matches alembic.ini

3. **Error handling**
   - Wrap Alembic operations in try/catch blocks
   - Provide clear error messages for migration failures
   - Handle cases where database doesn't exist yet

### CLI Integration
- Use existing Poetry script entry point: `inventory-cli = "app.cli:main"`
- Support help text showing available flags
- Exit with appropriate status codes (0 for success, non-zero for errors)

## Implementation Phases

### Phase 1: Basic CLI Structure
1. Implement argument parsing for single command with flags
2. Add Flask app initialization in CLI context
3. Add basic error handling and help text

### Phase 2: Alembic Integration
1. Implement Alembic API wrapper functions
2. Add basic `upgrade-db` functionality (no recreate)
3. Test normal migration upgrades

### Phase 3: Recreate Functionality
1. Implement `drop_all_tables()` function
2. Add `--recreate` flag logic with safety checks
3. Test full database recreation from migrations

### Phase 4: Polish and Validation
1. Add comprehensive error handling for edge cases
2. Improve user feedback and progress reporting
3. Test scenarios: empty database, partial migrations, network issues
# Extract Types File Parser

## Description

Extract the code that parses the types.txt file into a reusable utility method in the utils package. Additionally, create a specific method that returns the content of the types file and extract the file path logic. Replace all usages of the `PRODUCT_CATEGORIES` constant from `tools/prompttester/data.py` with calls to the new utility method and remove the duplicate data.py file.

## Files and Functions to Modify/Create

### Create: `app/utils/file_parsers.py`
- `parse_lines_from_file(file_path: Path) -> list[str]` - Generic file parser that reads lines, skips comments and empty lines
- `get_setup_types_file_path() -> Path` - Returns the path to app/data/setup/types.txt
- `get_types_from_setup() -> list[str]` - Returns the parsed list of types from types.txt

### Modify: `app/services/setup_service.py`
- `SetupService.sync_types_from_setup()` - Replace lines 28-54 with call to `get_types_from_setup()`

### Modify: `tools/prompttester/prompttester.py`
- Remove import of `PRODUCT_CATEGORIES` from data.py (line 15)
- Add import of `get_types_from_setup` from app.utils.file_parsers
- Replace `PRODUCT_CATEGORIES` usage in `get_full_schema()` (line 178)
- Replace `PRODUCT_CATEGORIES` usage in `get_part_details()` (line 210)

### Delete: `tools/prompttester/data.py`
- Remove entire file as it's now redundant

### Create: `tests/test_file_parsers.py`
- Test cases for all three new utility functions
- Test file parsing with comments and empty lines
- Test error handling for missing files

### Modify: `tests/test_setup_service.py`
- Simplify `test_sync_types_from_setup_with_comments_and_empty_lines()` (lines 116-197)
- Mock `get_types_from_setup()` instead of complex file operations

## Algorithm Details

### File Parsing Algorithm (`parse_lines_from_file`)
1. Open file with UTF-8 encoding
2. For each line in the file:
   - Strip whitespace from both ends
   - Skip if line is empty
   - Skip if line starts with '#' (comment)
   - Add valid lines to result list
3. Handle exceptions:
   - If file not found: raise `InvalidOperationException`
   - If read error: raise `InvalidOperationException` with error details
4. Return list of valid content lines

### Path Resolution (`get_setup_types_file_path`)
1. Get directory of the file_parsers.py module using `Path(__file__)`
2. Navigate up to app directory (parent)
3. Navigate to data/setup/types.txt
4. Return the resolved Path object

### Types Retrieval (`get_types_from_setup`)
1. Call `get_setup_types_file_path()` to get file path
2. Call `parse_lines_from_file()` with the path
3. Return the parsed list of type names
4. Let exceptions from parse_lines_from_file propagate
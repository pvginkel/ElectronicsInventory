# Test Data Generation Feature - Technical Plan

## Brief Description

Implement a CLI command to load realistic test data for the Electronics Inventory system, including 10 boxes with varying capacities and approximately 50 different electronics parts distributed across locations. The feature integrates with the existing database recreation logic to provide a single command that recreates the database and loads fixed test data from JSON files.

## Files to Create or Modify

### Files to Create:
- `app/services/test_data_service.py` - Core service for loading test data from JSON files
- `app/data/test_data/types.json` - Fixed electronics part types data
- `app/data/test_data/boxes.json` - Fixed box configurations and descriptions
- `app/data/test_data/parts.json` - Fixed realistic electronics parts data
- `app/data/test_data/part_locations.json` - Fixed part distribution across locations
- `app/data/test_data/quantity_history.json` - Fixed historical quantity changes
- `tests/test_test_data_service.py` - Comprehensive tests for test data loading

### Files to Modify:
- `app/cli.py` - Add `load-test-data` command that recreates database and loads fixed test data
- `CLAUDE.md` - Update section about fixed test dataset maintenance

## Detailed Implementation Plan

### 1. Test Data Service (`app/services/test_data_service.py`)

**Core Methods:**
- `load_full_dataset(db: Session) -> None`
  - Main orchestration method that loads complete test dataset from JSON files
  - Loads all entities in correct dependency order
  - Handles foreign key relationships properly

- `load_types(db: Session) -> dict[str, Type]`
  - Loads electronics part types from `types.json`
  - Returns dict mapping type names to Type objects for reference by other loaders

- `load_boxes(db: Session) -> dict[int, Box]`
  - Loads boxes from `boxes.json` and generates all locations
  - Returns dict mapping box_no to Box objects for reference

- `load_parts(db: Session, types: dict[str, Type]) -> dict[str, Part]`
  - Loads parts from `parts.json` with type relationships
  - Returns dict mapping id4 to Part objects for reference

- `load_part_locations(db: Session, parts: dict[str, Part], boxes: dict[int, Box]) -> None`
  - Loads part location assignments from `part_locations.json`
  - Creates PartLocation records with proper relationships

- `load_quantity_history(db: Session, parts: dict[str, Part]) -> None`
  - Loads historical quantity changes from `quantity_history.json`
  - Creates realistic stock change history

### 2. JSON Data Files (`app/data/test_data/`)

#### `types.json`
```json
[
  {"name": "Resistor"},
  {"name": "Capacitor"},
  {"name": "IC"},
  {"name": "Microcontroller"},
  {"name": "Sensor"},
  {"name": "LED"},
  {"name": "Relay"},
  {"name": "Connector"},
  {"name": "Cable"},
  {"name": "Mechanical"},
  {"name": "Power Module"}
]
```

#### `boxes.json`
```json
[
  {"box_no": 1, "description": "Small Parts Storage", "capacity": 40},
  {"box_no": 2, "description": "Resistor Collection", "capacity": 60},
  {"box_no": 3, "description": "IC Storage", "capacity": 30},
  ...
]
```

#### `parts.json`
```json
[
  {
    "id4": "ABCD",
    "manufacturer_code": "SN74HC595N",
    "description": "8-bit shift register with output latches",
    "type": "IC",
    "tags": ["DIP-16", "Logic", "74HC", "Shift Register"],
    "seller": "Digi-Key",
    "seller_link": "https://www.digikey.com/en/products/detail/texas-instruments/SN74HC595N/277246"
  },
  ...
]
```

#### `part_locations.json`
```json
[
  {"part_id4": "ABCD", "box_no": 3, "loc_no": 1, "qty": 25},
  {"part_id4": "EFGH", "box_no": 1, "loc_no": 5, "qty": 100},
  ...
]
```

#### `quantity_history.json`
```json
[
  {
    "part_id4": "ABCD",
    "delta_qty": 25,
    "location_reference": "3-1",
    "timestamp": "2024-01-15T10:30:00"
  },
  ...
]
```

### 3. CLI Integration (`app/cli.py`)

**New Command:**
- `load-test-data` - Recreate database and load fixed test dataset
  - Uses existing database recreation logic from `upgrade-db --recreate`
  - Loads all test data from JSON files in correct dependency order
  - Includes safety confirmation like existing `--recreate` functionality

**Command Structure:**
```python
def handle_load_test_data(app: Flask, confirmed: bool) -> None:
    """Recreate database from scratch and load fixed test data."""
    # 1. Recreate database using existing upgrade_database(recreate=True)
    # 2. Load test data using TestDataService.load_full_dataset()
```

**Integration with Existing Database Logic:**
- Reuses `upgrade_database(recreate=True)` for database recreation
- Maintains consistency with existing safety patterns
- Uses same database connection and session management

### 4. Data Organization Strategy

**Fixed Dataset Benefits:**
1. Consistent, reproducible test environment across all developers
2. Predictable data for integration tests and development
3. No random variations that could mask bugs or create flaky tests
4. Version-controlled test data that evolves with the schema

**Part Distribution Strategy (Fixed in JSON):**
1. Group similar parts in same boxes (resistors together, ICs together)
2. Leave ~20% of locations empty for realistic storage scenarios
3. Realistic quantity distributions (common parts have more stock)
4. Mix of single and multiple location assignments per part

**Box Organization (Fixed Configuration):**
- Box 1: Small Parts Storage (40 locations) - Mixed small components
- Box 2: Resistor Collection (60 locations) - All resistor values
- Box 3: IC Storage (30 locations) - Logic ICs and microcontrollers
- Box 4: Sensor Module Box (50 locations) - Various sensors
- Box 5: LED & Display (40 locations) - LEDs and display components
- Box 6: Power Components (30 locations) - Voltage regulators, power modules
- Box 7: Connector Box (50 locations) - Headers, JST, USB connectors
- Box 8: Cable Storage (20 locations) - Various cables and wires
- Box 9: Mechanical Parts (30 locations) - Screws, spacers, enclosures
- Box 10: Development Boards (25 locations) - Arduino, ESP32, breakout boards

### 5. Testing Requirements

**Service Tests (`tests/test_test_data_service.py`):**
- Test complete dataset loading from JSON files
- Verify data relationships and constraints are maintained
- Test each JSON file loading method independently
- Verify foreign key relationships are properly established
- Test error handling for malformed JSON files
- Verify realistic data quality (appropriate tags, quantities, etc.)

**CLI Tests:**
- Test `load-test-data` command with confirmation flag
- Verify integration with database recreation logic
- Test error handling for corrupted JSON files
- Verify command safety patterns match existing commands

**JSON Data Validation:**
- Schema validation for each JSON file structure
- Business rule validation (quantities > 0, valid dates, etc.)
- Referential integrity validation (part types exist, box numbers are valid)

### 6. Implementation Phases

**Phase 1: Core Infrastructure**
- Create TestDataService with JSON loading methods
- Add CLI command structure with safety patterns
- Set up basic JSON file structure

**Phase 2: Fixed Dataset Creation**
- Create all JSON data files with realistic electronics data
- Ensure proper organization and relationships
- Validate data integrity and business rules

**Phase 3: Service Implementation**
- Implement all loading methods with proper error handling
- Add foreign key relationship management
- Handle dependency ordering correctly

**Phase 4: CLI Integration & Testing**
- Complete CLI command with database recreation
- Write comprehensive tests for all components
- Validate end-to-end functionality

## Success Criteria

1. Single `load-test-data` command recreates database and loads complete dataset
2. Fixed dataset maintains all database constraints and relationships
3. Part distribution reflects realistic electronics inventory organization
4. Consistent, reproducible test environment across all developers
5. JSON data files are version-controlled and maintainable
6. Comprehensive test coverage ensures reliability
7. Clear documentation for maintaining fixed dataset
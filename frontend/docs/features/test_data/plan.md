# Test Data Set Creation Plan

## Brief Description

Create a curated, realistic test dataset with 10 boxes, 40 parts, and appropriate supporting data (types, locations, stock quantities, tags) that demonstrates all system features and provides a solid foundation for development, testing, and demonstrations.

## Files and Functions to be Created or Modified

### Data Generation Scripts
- `scripts/generate-test-data.ts` - **NEW** - Main test data generation script
- `scripts/test-data/parts-data.ts` - **NEW** - Realistic electronics parts definitions
- `scripts/test-data/box-layouts.ts` - **NEW** - Box configurations and capacity definitions
- `scripts/test-data/stock-distributions.ts` - **NEW** - Realistic stock quantity patterns
- `scripts/test-data/types-taxonomy.ts` - **NEW** - Electronics parts type hierarchy

### Data Templates and Fixtures
- `scripts/test-data/realistic-parts.json` - **NEW** - Curated electronics parts with real manufacturer codes
- `scripts/test-data/box-templates.json` - **NEW** - Standard box configurations
- `scripts/test-data/tag-collections.json` - **NEW** - Common electronics tags and categories
- `scripts/test-data/location-patterns.json` - **NEW** - Realistic location assignment patterns

### API Integration Scripts
- `scripts/seed-database.ts` - **NEW** - Script to populate database via API calls
- `scripts/reset-test-data.ts` - **NEW** - Clean reset to test data state
- `scripts/validate-test-data.ts` - **NEW** - Verify data integrity and consistency

### Development Utilities
- `src/lib/test-data/data-fixtures.ts` - **NEW** - Frontend test data utilities
- `src/lib/test-data/mock-generators.ts` - **NEW** - Generate additional test data on demand
- `package.json` - **MODIFY** - Add test data generation npm scripts

## Step-by-Step Implementation

### Phase 1: Data Structure Design and Validation
1. **Create realistic electronics taxonomy** - Define comprehensive parts hierarchy:
   - **Passive Components**: Resistors (10 variants), Capacitors (8 variants), Inductors (3 variants)
   - **Active Components**: ICs (6 variants), Transistors (4 variants), Diodes (3 variants)
   - **Mechanical**: Connectors (4 variants), Switches (2 variants)
   - Each category has realistic manufacturer codes, descriptions, and common tags

2. **Design box layout strategy** - Create logical storage organization:
   - **Small parts boxes** (60 locations): Resistors, capacitors, small ICs
   - **Medium parts boxes** (30 locations): Larger ICs, connectors, modules  
   - **Large parts boxes** (20 locations): Development boards, large components
   - **Specialty boxes**: Tools, cables, mechanical parts

3. **Create stock quantity patterns** - Realistic inventory distributions:
   - Common parts: Higher quantities (100-500 pieces)
   - Specialty parts: Medium quantities (10-50 pieces)
   - Expensive/rare parts: Low quantities (1-5 pieces)
   - Some empty locations for testing add stock functionality

### Phase 2: Curated Parts Database
1. **Create realistic-parts.json** - 40 carefully selected parts:
   ```
   Resistors (8 parts):
   - Standard values: 1kΩ, 10kΩ, 100Ω, 4.7kΩ (high quantities)
   - Precision values: 1.2kΩ 1%, 2.7kΩ 0.1% (medium quantities)
   - Power resistors: 10Ω 5W, 100Ω 10W (low quantities)
   
   Capacitors (7 parts):
   - Ceramic: 100nF, 1μF, 10μF (high quantities) 
   - Electrolytic: 100μF, 1000μF (medium quantities)
   - Tantalum: 47μF, Film: 1μF (low quantities)
   
   ICs (8 parts):
   - Microcontrollers: Arduino Nano, ESP32 (medium quantities)
   - Op-amps: LM358, TL072 (high quantities)  
   - Logic: 74HC595, 74HC04 (medium quantities)
   - Power: LM7805, LM317 (medium quantities)
   
   [Continue for other categories...]
   ```

2. **Create comprehensive metadata** - Rich part information:
   - Accurate manufacturer codes (e.g., "YAGEO RC0603FR-071KL")
   - Realistic descriptions with technical details
   - Appropriate tags: SMD/THT, package sizes, voltages, applications
   - Sellers and product links (example/demo URLs)

3. **Create location assignment logic** - Intelligent part placement:
   - Group similar parts in adjacent locations
   - Fill boxes efficiently with realistic organization
   - Leave strategic empty locations for testing
   - Create some organizational challenges to test suggestion algorithms

### Phase 3: Box and Location Configuration  
1. **Create box-templates.json** - 10 distinct box configurations:
   ```
   Box 1: "Small Resistors" - 60 locations (6x10 grid)
   Box 2: "Capacitors & Inductors" - 40 locations (5x8 grid)  
   Box 3: "Small ICs" - 48 locations (6x8 grid)
   Box 4: "Microcontrollers" - 20 locations (4x5 grid)
   Box 5: "Power Components" - 30 locations (5x6 grid)
   Box 6: "Connectors" - 25 locations (5x5 grid)
   Box 7: "Development Boards" - 15 locations (3x5 grid)
   Box 8: "Tools & Misc" - 20 locations (4x5 grid)
   Box 9: "Cables & Mechanical" - 30 locations (5x6 grid)
   Box 10: "Project Supplies" - 35 locations (5x7 grid)
   ```

2. **Create realistic stock distributions** - Varied quantity patterns:
   - Some parts in single locations (simple case)
   - Some parts spread across multiple locations (testing multi-location management)
   - Various quantities from 1 to 500 based on part type
   - Strategic gaps and empty locations

3. **Create tag-collections.json** - Comprehensive tag system:
   - **Package types**: SMD, THT, BGA, QFP, SOIC, 0603, 0805, etc.
   - **Electrical specs**: 5V, 3.3V, 12V, 24V, etc.
   - **Applications**: Arduino, Raspberry Pi, Audio, Power, RF, etc.
   - **Characteristics**: Low-power, High-speed, Precision, etc.

### Phase 4: Data Generation and Seeding Scripts
1. **Create generate-test-data.ts** - Main generation orchestrator:
   - Load templates and configuration files
   - Generate IDs using the 4-letter system
   - Create location assignments with realistic distributions
   - Apply tags and metadata consistently
   - Validate data integrity and relationships

2. **Create seed-database.ts** - API integration script:
   - Create boxes with proper configurations
   - Add parts with all metadata and relationships
   - Assign stock to locations with proper quantities
   - Handle API errors and retry logic
   - Provide progress feedback during seeding

3. **Create reset-test-data.ts** - Clean reset utility:
   - Remove all existing data safely
   - Reset to clean state
   - Re-run test data generation
   - Verify final state consistency

### Phase 5: Validation and Development Utilities
1. **Create validate-test-data.ts** - Data integrity checker:
   - Verify all parts have valid locations
   - Check quantity consistency and totals
   - Validate tag and type relationships
   - Ensure no orphaned or duplicate data
   - Generate validation report

2. **Create data-fixtures.ts** - Frontend testing utilities:
   - Sample data for component development
   - Mock API responses for offline development
   - Fixture data for automated tests
   - Realistic data patterns for UI testing

3. **Create mock-generators.ts** - Dynamic test data:
   - Generate additional parts on demand
   - Create realistic variations of existing data
   - Support for scaling tests with more data
   - Consistent with main test dataset patterns

## Algorithms and Logic

### Realistic Quantity Distribution Algorithm
```
assignRealisticQuantities(parts, totalBudget):
  1. Categorize parts by type and commonality
  2. Assign quantity ranges based on real-world patterns:
     - Common parts (resistors, caps): 50-500 pieces
     - Specialty ICs: 5-50 pieces  
     - Expensive/rare parts: 1-10 pieces
  3. Apply randomization within realistic ranges
  4. Ensure variety in single vs multi-location storage
  5. Create some zero-quantity parts for testing
```

### Intelligent Location Assignment
```
assignLocationsIntelligently(parts, boxes):
  1. Group parts by type and size compatibility
  2. Assign primary locations in appropriate boxes
  3. For high-quantity parts, split across multiple locations
  4. Create realistic organization patterns:
     - Similar parts grouped together
     - Some inefficient organization to test suggestions
  5. Leave strategic empty spaces for testing
  6. Ensure accessibility and logical flow
```

### Tag Assignment Strategy  
```
assignRealisticTags(part, partType, specifications):
  1. Apply mandatory tags based on part type
  2. Add technical specification tags (voltage, package, etc.)
  3. Include application-relevant tags
  4. Add some user-style tags (project names, categories)
  5. Ensure tag variety and realistic usage patterns
  6. Create opportunities for tag optimization
```

## Implementation Phases

### Phase 1: Design and Structure
- Define comprehensive data model and relationships
- Create realistic electronics parts taxonomy
- Design logical box and location organization

### Phase 2: Data Creation
- Build curated parts database with rich metadata
- Create realistic stock quantity distributions
- Generate comprehensive tag and type systems

### Phase 3: Generation Scripts
- Implement data generation algorithms
- Create database seeding and reset utilities
- Add validation and integrity checking

### Phase 4: Integration and Testing
- Integrate with existing API system
- Create development and testing utilities
- Validate data quality and consistency

## Data Quality Standards

### Realism Requirements
- All manufacturer codes must be real or realistic
- Part descriptions must be technically accurate
- Quantities and locations must reflect real inventory patterns
- Tags must represent actual electronics categorization

### Coverage Requirements  
- Test all major component categories
- Include edge cases (zero quantities, single items)
- Cover all box sizes and location patterns
- Test various stock distribution scenarios

### Consistency Requirements
- Maintain referential integrity across all relationships
- Ensure consistent naming and formatting
- Validate all generated IDs are unique
- Check that all location assignments are valid
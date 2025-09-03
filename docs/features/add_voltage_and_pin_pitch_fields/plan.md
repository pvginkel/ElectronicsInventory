# Add Voltage and Pin Pitch Fields to Part Model

## Feature Description

The AI model is currently returning three additional fields that aren't present in the Part model: `component_pin_pitch`, `input_voltage`, and `output_voltage`. These fields need to be added to the Part model. Additionally, the current implementation concatenates input and output voltages into a single `voltage_rating` field, which should be fixed by storing them separately.

## Files to Modify

### Database Model
- `app/models/part.py`: Add new fields to Part model
  - Add `pin_pitch` field (String, nullable)
  - Add `input_voltage` field (String, nullable)
  - Add `output_voltage` field (String, nullable)
  - Keep existing `voltage_rating` field for general voltage specifications

### Database Migration
- Create new Alembic migration to add columns to parts table

### Schemas
- `app/schemas/part.py`: Update PartResponseSchema and PartUpdateSchema
  - Add `pin_pitch`, `input_voltage`, `output_voltage` fields
- `app/schemas/ai_part_analysis.py`: Update AIPartAnalysisResultSchema
  - Add `pin_pitch`, `input_voltage`, `output_voltage` fields
  - Keep `voltage_rating` for backwards compatibility
- `app/schemas/ai_part_analysis.py`: Update AIPartCreateSchema
  - Add `pin_pitch`, `input_voltage`, `output_voltage` fields

### Services
- `app/services/ai_service.py`: Update analyze_part method
  - Remove voltage concatenation logic (lines 148-155)
  - Map AI response fields directly to new schema fields
  - Map `component_pin_pitch` to `pin_pitch`
  - Map `input_voltage` to `input_voltage`
  - Map `output_voltage` to `output_voltage`
  - Keep `voltage_rating` as-is from AI response

- `app/services/part_service.py`: Update create_part and update_part methods
  - Handle new fields in part creation
  - Handle new fields in part updates

### API Endpoints
- `app/api/ai_parts.py`: Ensure new fields flow through AI part creation endpoint
- `app/api/parts.py`: Ensure new fields are handled in standard part endpoints

### Test Data
- `app/data/test_data/parts.json`: Update all part entries with new fields
  - Add `pin_pitch` field to parts that have pins
  - Add `input_voltage` field where applicable
  - Add `output_voltage` field where applicable

### Tests
- Update existing tests to handle new fields
- Add specific tests for the new fields
- Test AI service mapping of new fields
- Test database persistence of new fields
- Verify `load-test-data` command works with updated JSON

## Implementation Steps

1. **Add fields to Part model**
   - Add `pin_pitch`, `input_voltage`, `output_voltage` columns to Part model
   - All fields should be nullable strings with appropriate length limits

2. **Create database migration**
   - Generate Alembic migration to add three new columns to parts table
   - Run migration on development database

3. **Update schemas**
   - Add new fields to all relevant Pydantic schemas
   - Ensure proper field descriptions and examples

4. **Fix AI service field mapping**
   - Remove voltage concatenation logic
   - Map AI model fields directly to Part model fields
   - Ensure `component_pin_pitch` maps to `pin_pitch`

5. **Update part service**
   - Handle new fields in create_part method
   - Handle new fields in update_part method
   - Ensure fields are properly validated

6. **Update test data**
   - Update `parts.json` with new fields for all existing parts
   - Add realistic values based on part types
   - Test `load-test-data` command works correctly

7. **Test updates**
   - Add tests for new field handling
   - Verify AI analysis correctly populates new fields
   - Test database persistence of new fields

## Field Specifications

### pin_pitch
- Type: String (nullable)
- Max length: 50 characters
- Description: Component pin pitch/spacing (e.g., "2.54mm", "0.1 inch")
- Example: "2.54mm"

### input_voltage
- Type: String (nullable)
- Max length: 100 characters
- Description: Input voltage range/specification
- Example: "5-12V DC"

### output_voltage
- Type: String (nullable)
- Max length: 100 characters
- Description: Output voltage range/specification
- Example: "3.3V"

### voltage_rating (existing)
- Keep as-is for general voltage specifications
- No longer used for concatenating input/output voltages
- Example: "600V"

## Test Data Examples

Based on the existing `parts.json`, here are example values for the new fields:

**ICs (SN74HC595N, LM358N):**
- `pin_pitch`: "2.54mm" (standard DIP)
- `input_voltage`: "5V" or "3V-32V"
- `output_voltage`: null or "5V"

**Power modules:**
- `pin_pitch`: null
- `input_voltage`: "85-265V AC"
- `output_voltage`: "5V DC"

**Microcontrollers (ESP32):**
- `pin_pitch`: "1.27mm" 
- `input_voltage`: "3.0-3.6V"
- `output_voltage`: "3.3V"
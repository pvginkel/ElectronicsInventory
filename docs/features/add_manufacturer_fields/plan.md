# Add Manufacturer and Product Page Fields

## Brief Description

Add new `manufacturer` and `product_page` fields to the Part model to properly distinguish manufacturer information from seller/vendor information. The Seller and Seller Link fields were being misused as Manufacturer and Product Page fields. These new fields will be positioned before the existing `seller` and `seller_link` fields in all schemas and UI forms.

## Files to be Created or Modified

### New Files
- `alembic/versions/006_add_manufacturer_fields.py` - Database migration to add the new columns

### Files to Modify

#### Database Layer
- `app/models/part.py` - Add `manufacturer` and `product_page` columns to Part model

#### Schema Layer  
- `app/schemas/part.py` - Add fields to PartCreateSchema, PartUpdateSchema, PartResponseSchema, PartWithTotalSchema
- `app/schemas/ai_part_analysis.py` - Add fields to AIPartAnalysisResultSchema and AIPartCreateSchema

#### Service Layer
- `app/services/part_service.py` - Update create_part() and update_part() methods to handle new fields
- `app/services/ai_service.py` - Update AI analysis JSON schema and field mapping to populate manufacturer/product_page instead of seller/seller_link
- `app/services/test_data_service.py` - Update _load_parts() method for new fields

#### Test Data
- `app/data/test_data/parts.json` - Add manufacturer and product_page data to all ~50 test parts with realistic values

#### CLI Integration  
- `app/cli.py` - No changes needed (uses TestDataService which will handle new fields automatically)
- CLI `load-test-data` command will load updated test data with manufacturer fields

#### Tests
- `tests/test_part_service.py` - Update service tests to include new fields
- `tests/test_parts_api.py` - Update API tests with new field payloads and assertions  
- `tests/test_ai_service.py` - Update AI service tests with new fields
- `tests/test_test_data_service.py` - Verify new fields load correctly from test data
- `tests/test_ai_service_real_integration.py` - Update if it references seller fields

## Implementation Details

### Database Schema Changes
Add two new optional columns to the `parts` table:
- `manufacturer` - String(255), nullable, stores manufacturer company name
- `product_page` - String(500), nullable, stores manufacturer's product page URL

### Field Positioning
The new fields will be inserted before the existing seller fields in this logical order:
1. Manufacturer information (who makes it)
2. Seller information (where to buy it)

### Field Specifications
- **manufacturer**: Optional string field, max 255 characters, for manufacturer company name (e.g., "Texas Instruments", "Espressif")
- **product_page**: Optional string field, max 500 characters, for official manufacturer product page URL (e.g., "https://www.ti.com/product/SN74HC595")

### Data Handling
- Existing parts will have NULL values for new fields (acceptable since optional)
- No data migration required as fields are optional
- Test data will be updated with realistic manufacturer information extracted from existing part data

### Test Data Updates Required
The `app/data/test_data/parts.json` file contains ~50 test parts that need manufacturer and product_page fields added. Examples of required updates:

- **SN74HC595N** → manufacturer: "Texas Instruments", product_page: "https://www.ti.com/product/SN74HC595"
- **LM358N** → manufacturer: "Texas Instruments", product_page: "https://www.ti.com/product/LM358"  
- **ESP32-WROOM-32** → manufacturer: "Espressif Systems", product_page: "https://www.espressif.com/en/products/modules/esp32"
- **DHT22** → manufacturer: "Aosong Electronics", product_page: "https://www.aosong.com/en/products-40.html"

This ensures realistic test data that exercises the new fields while maintaining existing seller/vendor information separate from manufacturer data.

### AI Analysis Behavior Change
The AI analysis functionality needs to be updated to only populate manufacturer information, not seller information:

- **Current behavior**: AI populates `seller` and `seller_link` fields with manufacturer information
- **New behavior**: AI should populate `manufacturer` and `product_page` fields with manufacturer information, and leave `seller` and `seller_link` fields empty (NULL)
- **Rationale**: AI cannot know where the user purchased the part - only the user knows their vendor/supplier
- **Impact**: AI will identify "who makes it" (manufacturer) but not guess "where to buy it" (seller)

This requires updating the AI prompts and field mappings in `app/services/ai_service.py` to:
1. Remove `seller` and `seller_link` from AI analysis output
2. Add `manufacturer` and `product_page` fields for manufacturer information only
3. Update AI prompts to focus on identifying manufacturer, not retailers/vendors
# Advanced Search Filters Implementation Plan

## Brief Description

Implement field-specific search filters using simple syntax like `pin_count:4`, `tag:a-tag`, `description:"arduino nano every"`. The system should parse search queries to extract field filters and regular search terms, supporting quoted strings and multiple values for list fields like tags. This will be applied to all existing search functionality in the app: parts list, boxes list, types list, and the dashboard quick-find widget.

## Files to Create or Modify

### Files to Create:

1. **`src/lib/utils/search-parser.ts`**
   - Tokenization function using regex pattern `([^ "]|"([^"]*)")+`
   - Parse field:value syntax from search tokens
   - Validate field names against object keys dynamically (no hardcoded lists)
   - Return structured search query object

### Files to Modify:

1. **`src/components/parts/part-list.tsx`**
   - Replace simple `includes` filtering with advanced parser-based filtering
   - Implement field-specific matching logic using object keys dynamically
   - Handle quoted terms as exact phrase matches
   - Ensure non-field terms search in all searchable fields

2. **`src/components/boxes/box-list.tsx`**
   - Replace simple search with advanced parser-based filtering
   - Support field filters based on box object keys (e.g., `box_no:1`, `description:storage`)
   - Handle quoted terms and regular search terms

3. **`src/components/types/TypeList.tsx`**
   - Replace simple search with advanced parser-based filtering  
   - Support field filters based on type object keys (e.g., `name:resistor`, `part_count:5`)
   - Handle quoted terms and regular search terms

4. **`src/components/dashboard/quick-find-widget.tsx`**
   - Add advanced search parsing to the existing dashboard search widget
   - Support field-specific filters in the quick search dropdown
   - Maintain existing keyboard navigation and result display functionality

## Algorithm Details

### Tokenization Algorithm:
1. Apply regex pattern `([^ "]|"([^"]*)")+` to split search input
2. Extract individual tokens handling quoted strings
3. For each token:
   - Check if contains colon character
   - If yes, split on first colon to get `field:value`
   - Validate field name against object keys dynamically
   - If valid field, add to field filters map
   - If invalid field, treat entire token as regular search term
4. Strip quotes from quoted terms but preserve them as exact match indicators

### Dynamic Field Validation:
Instead of hardcoded field lists, validate field names against the actual object keys:

**For Parts:**
- Extract field names from part object keys at runtime
- Support any field present in the JSON object structure
- Handle special cases (arrays, numbers, nulls) based on JavaScript type detection

**For Boxes:**
- Extract field names from box object keys (e.g., `box_no`, `description`, `capacity`)
- Support filtering on any box property

**For Types:**
- Extract field names from type object keys (e.g., `name`, `part_count`, `id`)
- Support filtering on any type property

### Filtering Algorithm:
1. Parse search query into field filters and regular terms
2. For each object in the list:
   - Check all field filters match (AND logic)
   - Check all regular search terms match in searchable fields (AND logic)
   - Check all quoted terms match as exact phrases (AND logic)
3. Return objects that match all criteria

### Field Matching Logic (Type-based):
- **Number fields**: Parse filter value as number, exact equality match
- **String fields**: Case-insensitive contains match  
- **Array fields**: Each specified filter value must exist in the array
- **Boolean fields**: Parse filter value as boolean, exact match
- **Null/undefined fields**: Only match if filter value is "null" or "undefined"
- **Quoted terms**: Exact phrase match (case-insensitive) in all string fields
- **Regular terms**: Each word must appear in at least one string field

### Search Query Structure:
```typescript
interface ParsedSearchQuery {
  fieldFilters: Map<string, string[]>;  // field name -> array of values
  searchTerms: string[];               // non-field search terms
  quotedTerms: string[];              // exact phrase matches
}
```

### Example Parsing:

**Parts:** `pin_count:8 tag:smd tag:arduino "nano every" resistor`
- fieldFilters: { "pin_count": ["8"], "tags": ["smd", "arduino"] }
- searchTerms: ["resistor"]  
- quotedTerms: ["nano every"]

**Boxes:** `box_no:1 description:storage capacity:60`
- fieldFilters: { "box_no": ["1"], "description": ["storage"], "capacity": ["60"] }
- searchTerms: []
- quotedTerms: []

**Types:** `name:resistor part_count:25`
- fieldFilters: { "name": ["resistor"], "part_count": ["25"] }
- searchTerms: []
- quotedTerms: []

### Error Handling:
- Invalid field names (e.g., `tab:test`) are treated as regular search terms
- Malformed syntax falls back to regular text search
- Empty field values are ignored
- Type mismatches (e.g., non-numeric values for number fields) are ignored
- Unknown object keys are ignored gracefully
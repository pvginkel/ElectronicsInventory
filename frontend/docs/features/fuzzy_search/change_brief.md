# Change Brief: Fuzzy Search on All Search Boxes

## Summary

Implement a fuzzy search algorithm and apply it to all search boxes in the application — both full screens (e.g., parts list) and dropdown/combobox selectors.

## Algorithm Specification

**Input:**
- `data`: `Array<{term: string, type: 'literal' | 'text'}>` — the searchable fields of a record
- `query`: `string` — the user's search input

**Output:** `boolean` — whether the record matches

**Steps:**

1. **Normalize** both the query and all data terms: lowercase, strip diacritics (via `String.normalize('NFD')` + remove combining marks).

2. **Tokenize** both the query and each data term by matching `\S+` (non-whitespace runs), discarding empties.

3. **AND combinator**: Every query token must match at least one token from any data term. A record matches only if all query tokens are satisfied.

4. **Literal term matching** (e.g., part keys): A query token matches a literal data token if the data token starts with the query token (prefix match, after normalization).

5. **Fuzzy term matching** (text fields):
   - Take `prefix = data_token.slice(0, query_token.length)`.
   - If the data token is shorter than the query token, `prefix` is the full data token — compare the full query token against this shorter prefix (do NOT truncate the query token).
   - Compute Levenshtein distance between `query_token` and `prefix`.
   - Match if distance <= threshold, where threshold is derived from the query token length (to be determined experimentally using representative part data).

6. **Threshold**: Experiment with the test data set (`../backend/app/data/test_data/parts.json`) to find a sensible mapping from token length to allowed Levenshtein distance.

## Integration Points

- All search/filter inputs on list screens (parts, etc.)
- All dropdown/combobox search inputs (part type selector, etc.)

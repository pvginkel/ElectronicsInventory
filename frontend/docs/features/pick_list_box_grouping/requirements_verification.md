# Requirements Verification: Pick List Box Grouping

## Summary

| # | Requirement | Status |
|---|-------------|--------|
| 1 | Group pick list lines by box instead of by component/part | PASS |
| 2 | Box group header matches the PDF printout format | PASS |
| 3 | Add `box_description` to backend and regenerate frontend API client | PASS |
| 4 | Component/part info (PartInlineSummary) moves into each table row | PASS |
| 5 | Keep all existing columns | PASS |
| 6 | Keep inline quantity editing | PASS |
| 7 | Remove per-part metric chips from card headers | PASS |
| 8 | Sort order matches the PDF | PASS |
| 9 | Write backend tests and run backend test suite | PASS |
| 10 | Use shopping list layout as structural basis | PASS |

## Detailed Evidence

### 1. Group pick list lines by box instead of by component/part
- **PASS**
- `src/types/pick-lists.ts:60-64` — New `PickListBoxGroup` interface with `boxNo`, `boxDescription`, `lines`
- `src/types/pick-lists.ts:167-204` — `groupPickListLinesByBox()` groups by `line.location.boxNo`
- Old `PickListLineGroup` and `groupPickListLines` fully removed

### 2. Box group header matches the PDF printout format (`#<box_no> - <box_description>`)
- **PASS**
- `src/components/pick-lists/pick-list-lines.tsx:155` — `title={`#${group.boxNo} - ${group.boxDescription}`}`
- Matches backend PDF format at `backend/app/services/pick_list_report_service.py:209`: `f"#{box_no} - {box_description}"`

### 3. Add `box_description` to the backend PickListLineLocationSchema and regenerate the frontend API client
- **PASS**
- `backend/app/schemas/pick_list.py:118-121` — `box_description: str` field added
- `backend/app/models/location.py:29-32` — `@property box_description` returning `self.box.description`
- `frontend/openapi-cache/openapi.json` — Updated with `box_description`
- `src/types/pick-lists.ts:158` — Maps `location.box_description` to `boxDescription`

### 4. Component/part info (PartInlineSummary) moves into each table row
- **PASS**
- `src/components/pick-lists/pick-list-lines.tsx:213-223` — `PartInlineSummary` in each `<td>` with `showCoverImage={false}`, `link={true}`, `testId`

### 5. Keep all existing columns: Location (full "3-7" format), Status, Qty to pick, In stock, Shortfall, Actions
- **PASS**
- `src/components/pick-lists/pick-list-lines.tsx:166-173` — All 7 column headers: Part, Location, Status, Qty to pick, In stock, Shortfall, Actions
- `src/components/pick-lists/pick-list-lines.tsx:178` — `formatLocation(line.location.boxNo, line.location.locNo)` produces "3-7" format

### 6. Keep inline quantity editing
- **PASS**
- `src/components/pick-lists/pick-list-lines.tsx:81-117` — `handleStartEdit`, `handleSaveEdit`, `handleKeyDown` all preserved
- `src/components/pick-lists/pick-list-lines.tsx:244-305` — Full inline quantity editing UI preserved in Qty to pick column

### 7. Remove per-part metric chips (Lines, Quantity to pick, Remaining) from card headers
- **PASS**
- `src/components/pick-lists/pick-list-lines.tsx:154-157` — Card header uses only `ListSectionHeader` with title, no `KeyValueBadge` chips
- `KeyValueBadge` import removed from pick-list-lines.tsx

### 8. Sort order matches the PDF: boxes by box_no ascending, lines within a box by (loc_no, line.id)
- **PASS**
- `src/types/pick-lists.ts:192` — `groups.sort((a, b) => a.boxNo - b.boxNo)`
- `src/types/pick-lists.ts:196-200` — Lines sorted by `locNo` then `id`
- Matches `backend/app/services/pick_list_report_service.py:88,178-184`

### 9. Write backend tests for the schema change and run the backend test suite
- **PASS**
- `backend/tests/api/test_pick_lists_api.py` — Assertions for `box_description` added
- Backend test suite: 965 passed, 4 skipped

### 10. Use the shopping list concept table / seller group card layout as a structural basis
- **PASS**
- `src/components/pick-lists/pick-list-lines.tsx:154` — Uses `ListSectionHeader` (same as `seller-group-card.tsx:56`)
- Card + table structure mirrors `seller-group-card.tsx` pattern

# Change Brief: Pick List Box Grouping

## Summary

Reorganize the pick list detail screen to group lines by **box** instead of by **component/part**, mirroring the layout of the server-generated PDF printout.

## Current Behavior

The pick list detail UI groups lines by `kitContentId` (one card per component). Each card has the part as a header with metric chips (Lines, Quantity to pick, Remaining), and a table of locations underneath showing where to pick that component from. If a component is stored in multiple boxes, those appear as separate rows in the same card.

## Desired Behavior

Group lines by **box number** instead, matching the printed PDF report layout (`backend/app/services/pick_list_report_service.py`).

### Box group header

Each box group should display a header matching the PDF format: `#<box_no> - <box_description>` (e.g., `#3 - Small Components Box`). This requires a backend API change because the current `PickListLineLocationSchema` only returns `id`, `box_no`, and `loc_no` — the box `description` is not included.

### Table columns within each box group

Move the component/part information into each table row (using `PartInlineSummary`). Keep all existing interactive columns: Location (full format e.g. "3-7"), Status, Quantity to pick, Current in stock, Shortfall, and Actions (Pick/Undo). Inline quantity editing stays.

### Sort order

Match the PDF report: boxes sorted by `box_no` ascending, lines within each box sorted by `(loc_no, line.id)`.

### Removals

Remove the per-part metric chips (Lines, Quantity to pick, Remaining) that currently appear in card headers — these become meaningless when grouping by box.

## Backend Change Required

Add `box_description: str` field to `PickListLineLocationSchema` in `backend/app/schemas/pick_list.py`, sourced from `location.box.description`. Regenerate the frontend API client afterward. Write backend tests if applicable and run the backend test suite.

## Reference

- PDF report layout: `backend/app/services/pick_list_report_service.py:188-286`
- Shopping list seller group card (structural reference): `src/components/shopping-lists/ready/seller-group-card.tsx`
- Shopping list concept table (flat table reference): `src/components/shopping-lists/concept-table.tsx`

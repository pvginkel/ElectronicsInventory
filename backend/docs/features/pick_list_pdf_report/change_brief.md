# Change Brief: Pick List PDF Report

## Summary

Add a PDF export feature for pick lists that generates a printable document for use during the picking and consumption workflow.

## Purpose

The PDF serves a dual purpose:
1. **Picking Guide** - A printed sheet to carry while picking items from storage, organized by location for an efficient walking route
2. **Consumption Tracker** - A paper record to mark off items as they are consumed during assembly, with space to note quantity deviations

## Requirements

### PDF Content

- Header with kit name, pick list ID, date, and status
- Units to build count
- Lines grouped by box number (for efficient picking - visit each box once)
- Within each box, lines sorted by location number

### Columns Per Line

| Column | Description |
|--------|-------------|
| Location | Box-Location format (e.g., "7-3") |
| Part ID | 4-letter part identifier |
| Description | Part description (truncated if needed) |
| Expected | The `quantity_to_pick` value |
| Actual | Blank space for handwriting actual picked quantity |
| Used | Checkbox for marking consumption |

### API Endpoint

- `GET /pick-lists/<pick_list_id>/pdf`
- Returns PDF as inline content (viewable in browser)
- Content-Disposition: inline with filename

### Technical Approach

- Use ReportLab for PDF generation (pure Python, no system dependencies)
- Create `PickListReportService` for report generation logic
- No database mutations - this is a read-only export feature

## Out of Scope

- Recording deviations back to the database (paper-only workflow)
- Multiple pick list export (one PDF per pick list)
- Customizable layouts or templates

# Change Brief: Pick List PDF Support

## Summary

Add PDF viewing support for pick lists, allowing users to view and download a generated PDF of any pick list.

## Background

The backend now supports generating PDFs for pick lists via the endpoint `GET /api/pick-lists/{id}/pdf`. The frontend needs to integrate this capability, providing users with a way to view pick list PDFs in a manner consistent with how PDFs are already displayed elsewhere in the application (using an iframe-based media viewer).

## Functional Requirements

1. **PDF Access**: Users should be able to view the PDF for a pick list from the pick list detail screen.

2. **Consistent Experience**: The PDF viewing experience should match the existing media viewer pattern used for part documents:
   - Full-screen modal dialog with iframe for PDF display
   - Download capability
   - Close button and escape key to dismiss

3. **UI Integration**: Add a clearly visible button or action to trigger PDF viewing on the pick list detail page (e.g., a "View PDF" or "Print" button in the header actions area).

## Technical Context

- The existing media viewer (`media-viewer-base.tsx`) already handles PDF display via iframes
- The PDF endpoint returns the PDF directly with appropriate content-type headers
- The endpoint URL pattern is: `/api/pick-lists/{id}/pdf`

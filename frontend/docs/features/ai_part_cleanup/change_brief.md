# AI Part Cleanup Feature - Change Brief

## Overview

Implement a frontend UI for the new AI-based part cleanup backend feature. This feature allows users to request AI suggestions for improving/cleaning up existing part data, review the proposed changes in a merge-style interface, and selectively apply changes.

## Backend API Reference

The backend feature is documented at `../backend/docs/features/ai_part_cleanup/change_brief.md`.

Key endpoints:
- `POST /api/ai-parts/cleanup` - Starts cleanup task, takes `part_key` in JSON body, returns `task_id`
- SSE events via existing task event infrastructure for progress updates
- Result schema: `AIPartCleanupTaskResultSchema` with `success`, `cleaned_part` (CleanedPartDataSchema), and `error_message`

The `CleanedPartDataSchema` includes:
- Basic fields: `key`, `description`, `manufacturer_code`, `manufacturer`, `product_page`, `seller_link`
- Technical fields: `dimensions`, `package`, `pin_count`, `pin_pitch`, `mounting_type`, `series`, `voltage_rating`, `input_voltage`, `output_voltage`
- Type handling: `type` (name), `type_is_existing` (bool), `existing_type_id` (int | null)
- Seller handling: `seller` (name), `seller_is_existing` (bool), `existing_seller_id` (int | null)
- Tags: `tags` (array of strings)

## UI Requirements

### 1. Menu Entry Point

Add a "Cleanup Part" option to the dropdown menu (hamburger menu) on the part detail page:
- Position: Add as a new menu item in the existing dropdown
- Icon: Sparkle icon to the right of the text with gradient colors `from-[#0afecf] to-[#16bbd4]`
- Sparkle SVG: `<svg fill="none" viewBox="0 0 16 16" role="presentation"><path fill="currentcolor" d="M8.75 12v3h-1.5v-3zm-2.22-1.47-4 4-1.06-1.06 4-4zm8 2.94-1.06 1.06-4-4 1.06-1.06zM4 7.25v1.5H1v-1.5zm11 0v1.5h-3v-1.5zM6.53 5.47 5.47 6.53l-4-4 1.06-1.06zm8-2.94-4 4-1.06-1.06 4-4zM8.75 1v3h-1.5V1z"></path></svg>`

### 2. Dialog Structure

The dialog follows the same pattern as the AI analysis dialog but starts directly on the progress step:
- No input step - process starts immediately when dialog opens
- Progress step: Shows progress bar, status messages, handles errors (same as AI analysis)
- Result step: Merge/apply changes interface OR "no changes" message

### 3. Merge/Apply Changes Screen

A table-based interface for reviewing and selectively applying AI-suggested changes:

| Checkbox | Field | Old Value | → | New Value |
|----------|-------|-----------|---|-----------|
| ☑ | Field Name | Old text (red) | → | New text (green) |

Rules:
- Only show rows for fields that have different values (changed fields only)
- Old value text color: red
- New value text color: green
- Arrow icon (→) displayed between old and new value columns for all rows
- Each row has a checkbox before the field name, all checked by default
- When checkbox is unchecked, both old and new value text turns gray
- Tags displayed as comma-separated values in a single row

### 4. Type and Seller Handling

When `type_is_existing` or `seller_is_existing` is `false`:
- Show a "Create Type" or "Create Seller" button inline (same pattern as AI analysis review step)
- When user completes creation (record is created in backend), replace the button with the normal checkbox row using the new ID
- This allows the user to apply the type/seller change after creating the entity

### 5. Buttons and Actions

- "Apply Changes" button: Only enabled if at least one checkbox is checked
- "Cancel" button: Closes dialog without applying changes
- On Apply: Update the part with selected changes, show success toast, close dialog

### 6. No Changes Screen

If AI returns no changes (all fields identical):
- Display message: "No improvements found. Your part data is already clean!"
- Show only a "Close" button

### 7. Error Handling

- Show errors on the progress screen (same pattern as AI analysis)
- Allow retry or cancel

## Testing Requirements

Follow the same testing approach as AI analysis:
- Create `ai-cleanup-mock.ts` helper similar to `ai-analysis-mock.ts`
- Use SSE mocking pattern with `/tests/ai-stream/` prefix
- Create page object helpers for the cleanup dialog
- Test scenarios:
  - Successful cleanup with changes
  - Successful cleanup with no changes
  - Type/seller creation flow
  - Error handling
  - Selective checkbox application

## Technical Implementation Notes

- Reuse existing SSE infrastructure (`useSSETask` hook pattern)
- Create a new hook `useAIPartCleanup` similar to `useAIPartAnalysis`
- Create new dialog component `ai-part-cleanup-dialog.tsx`
- Create merge step component for the apply changes interface
- Integrate with existing part update mutation for applying changes

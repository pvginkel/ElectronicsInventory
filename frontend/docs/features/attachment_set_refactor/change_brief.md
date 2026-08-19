# Attachment Set Refactor - Change Brief

## Overview

Refactor the frontend attachment management to use the new attachment-set API abstraction. The backend has been updated to centralize attachment storage into "attachment sets" that can be linked from multiple entity types (parts, kits). This change enables reusable attachment components and adds attachment support to kits.

## Backend API Changes

The backend now provides:
- `/api/attachment-sets/{set_id}/attachments` - List attachments in a set
- `/api/attachment-sets/{set_id}/attachments` (POST) - Add attachment to a set
- `/api/attachment-sets/{set_id}/attachments/{attachment_id}` - Get/delete specific attachment
- `/api/attachment-sets/{set_id}/cover` - Get/set/clear cover attachment

Parts and kits now expose:
- `attachment_set_id: number` - The linked attachment set
- `cover_url: string | null` - Convenience URL for the cover image

Legacy part-specific attachment endpoints remain as convenience wrappers:
- `/api/parts/{part_key}/attachments` - Delegates to the part's attachment set
- `/api/parts/{part_key}/cover` - Delegates to the part's attachment set cover

## Requirements

### 1. Refactor Attachment Management Components

Create reusable attachment management components that work against attachment sets:
- Extract attachment grid, upload, and viewer logic to work with `attachmentSetId` instead of `partKey`
- Part-specific components should obtain the `attachmentSetId` from the part and delegate to the generic components
- Keep backward compatibility with existing part document management UI/UX

### 2. Update Part Attachment Implementation

- Update hooks to work with the new API (either attachment-set endpoints or the legacy part convenience endpoints)
- Ensure existing part attachment workflows continue to work identically
- Cover image toggle, upload, delete, and media viewer must all function as before

### 3. Add Kit Attachment Support

- **Detail Page**: Add attachment management section at the bottom of the kit detail page (similar to parts)
- **List View**: Display cover image on kit cards (similar to part cards)
- **No Detail Page Cover**: Do not add cover image display to the kit detail page header
- **Archived Restriction**: Attachment management should be disabled when a kit is archived

### 4. Query Invalidation Strategy

When attachments are modified:
- Invalidate attachment-set queries
- Also invalidate parent entity queries (parts/kits) to refresh `cover_url`
- Balance complexity vs. early cover propagation (prefer simplicity)

### 5. Test Coverage

- Update existing Playwright tests to work with the new implementation
- Add tests for kit attachment management
- Ensure test factories work with the updated API

## Out of Scope

- Cover image on kit detail page header (explicitly excluded)
- Changes to attachment preview/proxy endpoints (unchanged)
- Changes to the copy-attachment functionality (unchanged)

## Reference Documentation

- Backend change brief: `/work/backend/docs/features/kit_attachments/change_brief.md`
- Existing part attachment components: `src/components/parts/part-document-grid.tsx`, `src/components/documents/`
- Kit components: `src/components/kits/`

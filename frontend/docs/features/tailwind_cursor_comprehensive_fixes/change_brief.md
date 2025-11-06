# Change Brief: Comprehensive Cursor Fixes from TailwindCSS Upgrade

## Problem

Multiple cursor-related issues were introduced in the TailwindCSS upgrade from version 3 to 4 (commit 7be7705663e4ca48da8b725023dea704a702ab47). The upgrade changed default styles for buttons and interactive elements, requiring explicit `cursor-pointer` classes.

## Issues Identified

### 1. Document Tile Card Hover Effects

Document tile cards no longer show pointer cursor when hovered over the main image/icon area. Unlike kit cards, document tiles have TWO separate clickable regions (image area + footer) that both have onClick handlers. The image area div at line 118 is missing the `cursor-pointer` class, while the footer div at line 163 already has it explicitly set.

**Location:** `src/components/documents/document-tile.tsx:118` - Image area wrapper div

**Expected:** Pointer cursor on both clickable regions (image area and footer)

**Note:** Document tiles should NOT receive onClick on the Card component (unlike kit cards), because they have two separate clickable divs with explicit handlers. We only need to add `cursor-pointer` to the image area div to match the footer.

### 2. Missing `cursor-pointer` on Interactive Buttons

The following 13 buttons/interactive elements are missing the `cursor-pointer` class:

#### High-Priority Reusable Components:
1. **IconButton component** (`src/components/ui/hover-actions.tsx:48-60`) - Affects multiple instances throughout the app
2. **Input clear button** (`src/components/ui/input.tsx:65`) - Used in multiple forms
3. **Searchable select dropdown toggle** (`src/components/ui/searchable-select.tsx:257`)
4. **Searchable select option buttons** (`src/components/ui/searchable-select.tsx:365`)
5. **Searchable select create button** (`src/components/ui/searchable-select.tsx:395`)
6. **Icon badge button variant** (`src/components/ui/icon-badge.tsx:171`)
7. **Alert dismiss button** (`src/components/ui/alert.tsx:179`)

#### Medium-Priority Common UI:
8. **Media viewer previous button** (`src/components/documents/media-viewer-base.tsx:302`)
9. **Media viewer next button** (`src/components/documents/media-viewer-base.tsx:313`)
10. **Information badge remove button** (`src/components/ui/information-badge.tsx:87`)
11. **Type list clear search button** (`src/components/types/type-list.tsx:221`) - Note: Has disabled prop (line 227), cursor-pointer should be conditional

#### Lower-Priority Specific Instances:
12. **Sidebar toggle button** (`src/components/layout/sidebar.tsx:53`)
13. **Part location quantity edit button** (`src/components/parts/part-location-grid.tsx:269`)
14. **Deployment notification reload button** (`src/components/ui/deployment-notification-bar.tsx:17`)
15. **Mobile menu toggle button** (`src/routes/__root.tsx:100`)

## Expected Behavior

- All interactive buttons should display a pointer cursor on hover
- Document tile cards should show pointer cursor and hover animation (scale + shadow)
- Behavior should be consistent across all entity cards and interactive elements

## Scope

- Fix document tile card component to pass `onClick` to Card (similar to kit-card fix)
- Add `cursor-pointer` class to 15 button/interactive elements
- Update any affected test page objects if needed
- Ensure no behavioral regressions in existing tests

## Related Work

This builds on the initial cursor fixes completed in `docs/features/tailwind_cursor_fixes/` which fixed:
- Search box clear button (part and kit list views)
- Kit card hover effects

## Discovery Method

Issues were identified through:
1. User observation of document tile cards
2. Comprehensive codebase scan for buttons missing `cursor-pointer`
3. Understanding that TailwindCSS v4 changed default cursor behavior for buttons and links

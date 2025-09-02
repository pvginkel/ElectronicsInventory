# Fix Manual Testing Issues - Technical Plan

## Brief Description

Fix three issues discovered during manual testing: 
1. Loading cover images should not retry on 404 errors
2. Component ordering must be stable (likely requires backend sorting)
3. Move all inline SVGs to the assets folder for better maintainability

## Files and Functions to Modify

### Issue 1: Cover Image 404 Retry Behavior

**Frontend Files:**
- `src/hooks/use-cover-image.ts` - Modify `useCoverAttachment` function to add custom retry configuration
- `src/lib/api/generated/hooks/index.ts` (generated) - May need to regenerate after backend changes

**Backend Files (if needed):**
- The backend API endpoint `/api/parts/{part_key}/cover` may need to be modified to ensure proper 404 responses

### Issue 2: Component Ordering Stability

**Frontend Files:**
- `src/components/documents/document-grid.tsx` - Add client-side sorting to `documents.map()` at line 80
- `src/components/parts/part-list.tsx` - Add sorting if parts list is unstable
- `src/components/boxes/box-list.tsx` - Add sorting if box list is unstable  
- `src/components/types/TypeList.tsx` - Add sorting if types list is unstable
- `src/components/parts/part-location-grid.tsx` - Add sorting if location grid is unstable

**Backend (if needed for server-side sorting):**
- Backend API endpoints that return lists should include ORDER BY clauses in SQL queries

### Issue 3: Move Inline SVGs to Assets

**Files with Inline SVGs to Extract:**
1. `src/components/ui/drop-zone.tsx` - Upload icon SVG (line 126)
2. `src/components/ui/input.tsx` - Clear/X icon SVG (line 50)
3. `src/components/documents/media-viewer.tsx` - Three zoom control icons (lines 165, 179, 192)
4. `src/components/documents/document-grid.tsx` - Document placeholder icon (line 53)
5. `src/components/documents/document-card.tsx` - Various icons (need to check)
6. `src/components/documents/cover-image-display.tsx` - Image placeholder icon (line 43)
7. `src/components/documents/add-document-modal.tsx` - Various icons (need to check)
8. `src/components/documents/camera-capture.tsx` - Camera control icons (need to check)
9. `src/components/parts/ai-part-review-step.tsx` - Various icons (need to check)

**New Asset Files to Create:**
- `src/assets/icons/upload.svg`
- `src/assets/icons/clear.svg` or `x.svg`
- `src/assets/icons/zoom-in.svg`
- `src/assets/icons/zoom-out.svg`
- `src/assets/icons/zoom-reset.svg`
- `src/assets/icons/document.svg`
- `src/assets/icons/image-placeholder.svg`
- Additional icon files as needed

## Step-by-Step Implementation

### Phase 1: Fix Cover Image Retry Behavior

1. **Modify the hook to disable retries for cover images:**
   - In `src/hooks/use-cover-image.ts`, pass custom query options to `useGetPartsCoverByPartKey`
   - Override the default retry behavior specifically for this query
   - The query should return false for retry when receiving a 404 error

2. **Verify the fix:**
   - Test that cover images that return 404 do not trigger retries
   - Ensure other API calls still retry appropriately

### Phase 2: Ensure Stable Component Ordering

1. **Identify all components that render lists without explicit ordering**
2. **Add consistent sorting to each list rendering:**
   - Sort documents by `id` or `createdAt` in `document-grid.tsx`
   - Sort parts by `key` or `manufacturer_part_no` in part lists
   - Sort boxes by `box_no` in box lists
   - Sort types alphabetically by `name`
   - Sort locations by `loc_no` within each box

3. **Consider backend solution if frontend sorting is insufficient:**
   - Request backend team to add ORDER BY clauses to all list endpoints
   - This ensures consistent ordering from the API level

### Phase 3: Extract Inline SVGs

1. **Create SVG icon files:**
   - Extract each inline SVG to its own file in `src/assets/icons/`
   - Ensure SVGs are properly formatted and optimized
   - Remove hardcoded colors where possible to allow CSS styling

2. **Import and use SVG files:**
   - Import each SVG using: `import iconName from '@/assets/icons/icon-name.svg'`
   - Replace inline SVG elements with `<img src={iconName} alt="..." className="..." />`
   - Maintain the same classes and styling as the original inline SVGs

3. **Test all affected components:**
   - Verify icons display correctly
   - Ensure hover states and other interactions still work
   - Check that icon colors can be controlled via CSS where needed

## Notes

- The cover image retry issue is likely the most critical as it affects performance
- Component ordering may require backend changes for a complete solution
- SVG extraction improves maintainability and reduces component file sizes
- All changes should maintain the existing UI appearance and behavior
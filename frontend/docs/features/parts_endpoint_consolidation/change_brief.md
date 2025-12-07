# Parts Endpoint Consolidation - Frontend Changes

## Summary

Update the parts list to use the consolidated `/api/parts?include=locations,kits,shopping_lists,cover` endpoint instead of making separate API calls for kit memberships and shopping list indicators. The backend has already removed the `/api/parts/with-locations` endpoint and consolidated all data into the main parts endpoint with an `include` query parameter.

## Current State

The parts list currently:
1. Calls `useAllPartsWithLocations()` which fetches from `/api/parts/with-locations` (now removed)
2. Uses `useShoppingListMembershipIndicators()` to make a separate bulk POST to get shopping list data
3. Uses `usePartKitMembershipIndicators()` which makes N+1 API calls (one per part) to fetch kit memberships

This results in ~793 API calls for 791 parts.

## Target State

The parts list should:
1. Use a new hook that fetches from `/api/parts?include=locations,kits,shopping_lists,cover`
2. Extract kit and shopping list indicator data directly from the response
3. Remove the separate indicator hook calls from the list component
4. Use the new `cover_url` and `cover_thumbnail_url` fields for images

This reduces the API calls to just 1 paginated request.

## Changes Required

1. **Create new hook** `useAllPartsWithIncludes()` in `src/hooks/use-all-parts.ts`:
   - Fetch from `/api/parts?include=locations,kits,shopping_lists,cover`
   - Use the existing `usePaginatedFetchAll` infrastructure
   - Return the new `PartWithTotalSchemaList_a9993e3_PartWithTotalSchema` type

2. **Update `PartList` component** (`src/components/parts/part-list.tsx`):
   - Replace `useAllPartsWithLocations()` with `useAllPartsWithIncludes()`
   - Remove `useShoppingListMembershipIndicators()` and `usePartKitMembershipIndicators()` calls
   - Build indicator maps directly from part data using `useMemo`
   - Update query invalidation key from `getPartsWithLocations` to the new key

3. **Delete deprecated hook** `src/hooks/use-all-parts-with-locations.ts`:
   - No longer needed after migration

4. **Update `PartListItem` component** if needed:
   - Potentially use `cover_url`/`cover_thumbnail_url` directly from part data

## Endpoints Analysis

After this change, the following endpoints should be reviewed for removal:

### Can be removed from backend:
- **`/api/parts/with-locations`** - Already removed by backend team

### Should be kept:
- **`/api/parts/{part_key}/kits`** - Still used by part detail pages
- **`/api/parts/{part_key}/locations`** - Still used by part detail pages
- **`/api/parts/{part_key}/shopping-list-memberships`** - Still used by part detail pages
- **`POST /api/parts/shopping-list-memberships/query`** - May become redundant for list views but could still be useful for other contexts

### Frontend hooks to keep (used elsewhere):
- `usePartKitMemberships()` - Single-part variant for detail pages
- `usePartShoppingListMemberships()` - Single-part variant for detail pages

### Frontend hooks that become redundant for list views:
- `usePartKitMembershipIndicators()` - Only used in PartList, data now in main response
- `useShoppingListMembershipIndicators()` - Only used in PartList, data now in main response

## Testing Requirements

- Verify parts list loads with single consolidated API call
- Verify kit badges display correctly
- Verify shopping list badges display correctly
- Verify cover images load correctly
- Verify filtering (hasStock, onShoppingList) still works
- Verify search functionality works
- Run all existing Playwright tests

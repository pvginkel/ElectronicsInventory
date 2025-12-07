# Parts Endpoint Consolidation — Frontend Migration Guide

## Overview

This document describes the frontend changes required to support the consolidated parts endpoint with the `include` query parameter. The goal is to eliminate N+1 API calls for kit memberships, shopping list memberships, and cover images by fetching all data in a single request.

---

## Current State

### API Calls Per Part List View

**Current implementation** (`/work/frontend/src/components/parts/part-list.tsx`):

1. **Base data**: `GET /api/parts/with-locations?limit=1000&offset=0` (fetches all parts with locations)
2. **Kit membership indicators**: ~791 separate calls to `GET /api/parts/{part_key}/kits` (one per part)
3. **Shopping list indicators**: Single bulk call to `POST /api/parts/shopping-list-memberships/query` with all part keys
4. **Cover images**: Accessed via relationship data (already included in part response as `has_cover_attachment` boolean)

**Problem**: Kit membership calls are N+1 pattern (one API call per part in the list).

### Affected Hooks

- **`useAllPartsWithLocations()`** (`/work/frontend/src/hooks/use-all-parts-with-locations.ts:20-22`)
  - Fetches from `/api/parts/with-locations`
  - Pagination: 1000 parts per page, auto-fetches all pages

- **`usePartKitMembershipIndicators()`** (`/work/frontend/src/hooks/use-part-kit-memberships.ts:230-295`)
  - Calls `fetchKitMemberships()` which makes individual `GET /api/parts/{part_key}/kits` calls per part (lines 62-83)
  - Used in `PartList` component to show kit badges (line 154)

- **`useShoppingListMembershipIndicators()`** (`/work/frontend/src/hooks/use-part-shopping-list-memberships.ts:245-316`)
  - Already optimized: Uses bulk `POST /api/parts/shopping-list-memberships/query` endpoint
  - No changes needed to call pattern, but data will be available from main endpoint

---

## Target State

### New API Call Pattern

**Single consolidated call**:
```
GET /api/parts?limit=1000&offset=0&include=locations,kits,shopping_lists,cover
```

**Response includes**:
- Base part data (key, description, manufacturer_code, type_id, total_quantity, etc.)
- `locations` array (box_no, loc_no, qty) — replaces `/api/parts/with-locations`
- `kits` array (kit_id, kit_name, status, reserved_quantity, etc.) — replaces per-part `/api/parts/{key}/kits` calls
- `shopping_lists` array (line_id, list_name, needed, ordered, etc.) — replaces bulk query
- `cover_url` and `cover_thumbnail_url` strings — new fields for direct image access

**Benefits**:
- Reduces API calls from ~791 (for kit memberships) + 1 (shopping lists) + 1 (parts) = ~793 calls → **1 call**
- Eliminates waterfall loading (no sequential dependencies)
- Reduces frontend complexity (no coordination between multiple hooks)

---

## Required Changes

### 1. Update API Client Hook

**File**: `/work/frontend/src/hooks/use-all-parts-with-locations.ts`

**Current**:
```typescript
export function useAllPartsWithLocations(): UseAllPartsWithLocationsResult {
  return usePaginatedFetchAll<PartWithTotalAndLocationsSchemaList_a9993e3_PartWithTotalAndLocationsSchema>(
    '/api/parts/with-locations'
  );
}
```

**Updated**:
```typescript
export function useAllPartsWithIncludes(): UseAllPartsWithIncludesResult {
  return usePaginatedFetchAll<PartWithIncludesSchema>(
    '/api/parts?include=locations,kits,shopping_lists,cover'
  );
}
```

**Changes**:
- Rename hook to `useAllPartsWithIncludes` (more accurate name)
- Update endpoint to `/api/parts?include=locations,kits,shopping_lists,cover`
- Update type to new schema (generated from OpenAPI spec)

### 2. Update Part List Component

**File**: `/work/frontend/src/components/parts/part-list.tsx`

**Current** (lines 31-37, 92-97, 149-155):
```typescript
const {
  data: parts = [],
  isLoading: partsLoading,
  // ...
} = useAllPartsWithLocations();

// Later...
const allPartKeys = useMemo(
  () => parts.map((part) => part.key),
  [parts],
);
const shoppingIndicators = useShoppingListMembershipIndicators(allPartKeys);
const kitIndicators = usePartKitMembershipIndicators(filteredPartKeys);
```

**Updated**:
```typescript
const {
  data: parts = [],
  isLoading: partsLoading,
  // ...
} = useAllPartsWithIncludes(); // Updated hook name

// Remove these hooks - data now in part response:
// const shoppingIndicators = useShoppingListMembershipIndicators(allPartKeys);
// const kitIndicators = usePartKitMembershipIndicators(filteredPartKeys);

// Build indicator maps directly from part data
const shoppingIndicatorMap = useMemo(() => {
  const map = new Map();
  parts.forEach(part => {
    map.set(part.key, {
      hasActiveMembership: part.shopping_lists && part.shopping_lists.length > 0,
      activeCount: part.shopping_lists?.length || 0,
      // ... other derived fields
    });
  });
  return map;
}, [parts]);

const kitIndicatorMap = useMemo(() => {
  const map = new Map();
  parts.forEach(part => {
    map.set(part.key, {
      hasMembership: part.kits && part.kits.length > 0,
      activeCount: part.kits?.filter(k => k.status === 'active').length || 0,
      // ... other derived fields
    });
  });
  return map;
}, [parts]);
```

**Changes**:
- Replace `useAllPartsWithLocations()` with `useAllPartsWithIncludes()`
- Remove `useShoppingListMembershipIndicators()` and `usePartKitMembershipIndicators()` hooks
- Build indicator maps directly from `parts` array (kit and shopping list data already included)
- Update component to use local maps instead of hook return values

### 3. Remove Deprecated Hooks (Optional Cleanup)

**Files**:
- `/work/frontend/src/hooks/use-part-kit-memberships.ts`
- `/work/frontend/src/hooks/use-part-shopping-list-memberships.ts`

**Decision**: Keep these hooks for detail page usage (individual part detail still calls `/api/parts/{key}/kits` and `/api/parts/{key}/shopping-list-memberships`). Only the **indicator** variants (`usePartKitMembershipIndicators`, `useShoppingListMembershipIndicators`) become redundant for list views.

**Action**: No deletion needed. Hooks still used by:
- Part detail pages (single part context)
- Kit detail pages showing parts
- Shopping list detail pages showing parts

### 4. Update Cover Image Access

**File**: `/work/frontend/src/components/parts/part-card.tsx` (or similar component showing cover images)

**Current**:
```typescript
// Assuming cover image access via attachment API:
const coverUrl = part.has_cover_attachment
  ? `/api/attachments/${part.cover_attachment_id}`
  : null;
```

**Updated**:
```typescript
// Use new cover_url field directly:
const coverUrl = part.cover_url || null;
const coverThumbnailUrl = part.cover_thumbnail_url || null;
```

**Changes**:
- Replace manual URL construction with `part.cover_url` and `part.cover_thumbnail_url` fields
- Remove dependency on `part.cover_attachment_id` (field still exists but not needed for display)

### 5. Update TypeScript Types

**Action**: Regenerate TypeScript client from updated OpenAPI spec.

**Command** (in frontend directory):
```bash
npm run generate-api
```

**Expected new type** (example):
```typescript
export type PartWithIncludesSchema = {
  key: string;
  manufacturer_code?: string | null;
  description: string;
  type_id?: number | null;
  total_quantity: number;
  has_cover_attachment: boolean;
  // New optional fields:
  cover_url?: string | null;
  cover_thumbnail_url?: string | null;
  locations?: Array<{
    box_no: number;
    loc_no: number;
    qty: number;
  }>;
  kits?: Array<{
    kit_id: number;
    kit_name: string;
    status: 'active' | 'archived';
    build_target: number;
    required_per_unit: number;
    reserved_quantity: number;
    updated_at: string;
  }>;
  shopping_lists?: Array<{
    shopping_list_id: number;
    shopping_list_name: string;
    shopping_list_status: 'concept' | 'ready' | 'done';
    line_id: number;
    line_status: 'new' | 'ordered' | 'done';
    needed: number;
    ordered: number;
    received: number;
    note?: string | null;
    seller?: {
      id: number;
      name: string;
      website?: string | null;
    } | null;
  }>;
};
```

---

## Migration Strategy

### Phase 1: Backend Deployment with Include Parameter

1. Deploy backend with `include` parameter support
2. Keep `/api/parts/with-locations` endpoint active (deprecated but functional)
3. Backend supports both old and new patterns simultaneously

### Phase 2: Frontend Migration

1. Update `useAllPartsWithLocations` to `useAllPartsWithIncludes` using new endpoint
2. Remove `usePartKitMembershipIndicators` and `useShoppingListMembershipIndicators` from `PartList` component
3. Build indicator maps from consolidated response
4. Update cover URL access to use new fields
5. Regenerate TypeScript client
6. Test thoroughly in development environment

### Phase 3: Validation

1. Deploy frontend with consolidated endpoint
2. Monitor metrics:
   - `parts_list_include_parameter_usage` counter (backend metric)
   - Frontend performance (reduced API call count in network tab)
   - Error rates (ensure no regressions)
3. Verify `/api/parts/with-locations` usage drops to zero via `deprecated_endpoint_access` metric

### Phase 4: Cleanup (1-2 weeks after Phase 3)

1. Remove `/api/parts/with-locations` endpoint from backend (after confirming zero usage)
2. Remove deprecated endpoint tests from backend
3. Optional: Remove indicator hooks from frontend if no longer used anywhere

---

## Testing Checklist

### Frontend Unit Tests

- [ ] Update `PartList.test.tsx` to use new hook and verify indicator maps built correctly
- [ ] Test empty parts array (no kits, no shopping lists)
- [ ] Test mixed scenario (some parts with kits, some without)
- [ ] Test cover URL display (parts with/without covers)

### Integration Tests

- [ ] Verify parts list loads with single API call
- [ ] Verify kit badges display correctly from consolidated data
- [ ] Verify shopping list badges display correctly
- [ ] Verify cover images load from new URL fields
- [ ] Test pagination (multiple pages, each using include parameter)

### Manual Testing

- [ ] Load parts list, verify only 1 call to `/api/parts?include=...` in network tab
- [ ] Verify no calls to `/api/parts/{key}/kits` during list load
- [ ] Verify kit membership badges render correctly
- [ ] Verify shopping list badges render correctly
- [ ] Verify cover images display (thumbnail and full size)
- [ ] Test with 1000+ parts (pagination, performance)
- [ ] Test with filters active (hasStock, onShoppingList)
- [ ] Test search functionality (ensure indicators still correct after filtering)

---

## Performance Impact

### Expected Improvements

**API Calls** (for parts list with 791 parts):
- Before: 793 calls (1 parts + 791 kit memberships + 1 shopping list bulk)
- After: 1 call (consolidated)
- **Reduction**: 99.9%

**Network Transfer** (estimated):
- Before: 793 HTTP request/response overhead + data
- After: 1 HTTP request/response overhead + same data (slightly larger single payload)
- **Overhead reduction**: Significant (792 fewer TCP handshakes, headers, etc.)

**Latency**:
- Before: Waterfall loading (parts → kits in parallel → render)
- After: Single request → render
- **Expected improvement**: 50-80% faster time-to-interactive (depends on network latency)

### Monitoring

**Metrics to track**:
- `parts_list_load_time` (instrumentation in frontend)
- `parts_list_api_call_count` (count of API calls during load)
- `parts_list_include_parameter_usage` (backend counter)
- `parts_bulk_query_duration_seconds` (backend histogram)

---

## Backward Compatibility

### Deprecated Endpoints

**`GET /api/parts/with-locations`**:
- Status: Deprecated (retained temporarily)
- Timeline: Remove 1-2 weeks after frontend migration complete
- Replacement: `GET /api/parts?include=locations`

### Breaking Changes

**None for existing consumers**:
- `GET /api/parts` without `include` parameter returns original schema
- Individual part endpoints (`/api/parts/{key}/kits`, etc.) unchanged
- Shopping list bulk query endpoint unchanged (though redundant for list views)

---

## Open Questions

1. **Should indicator hooks be kept for detail pages?**
   - Answer: Yes, detail pages still use individual endpoints
   - Decision: Keep hooks, only remove from list component usage

2. **Should we add loading states for each include type?**
   - Answer: No, consolidated call returns all data atomically
   - Decision: Single loading state for entire parts response

3. **Should we make cover URLs conditional (include=cover)?**
   - Answer: TBD by backend team (cheap to compute, may be included by default)
   - Decision: Wait for backend implementation, update accordingly

4. **How to handle partial failures (e.g., kits query fails but parts succeed)?**
   - Answer: Backend returns 500 if any include fails, frontend shows error
   - Decision: All-or-nothing loading (no partial state handling needed)

---

## References

- Backend plan: `/work/backend/docs/features/parts_endpoint_consolidation/plan.md`
- Change brief: `/work/backend/docs/features/parts_endpoint_consolidation/change_brief.md`
- Current parts API: `/work/backend/app/api/parts.py`
- Frontend parts list: `/work/frontend/src/components/parts/part-list.tsx`
- Kit membership hook: `/work/frontend/src/hooks/use-part-kit-memberships.ts`
- Shopping list hook: `/work/frontend/src/hooks/use-part-shopping-list-memberships.ts`

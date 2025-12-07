# Change Brief: Parts Endpoint Consolidation

## Problem

The current parts API causes excessive database connection usage due to N+1 query patterns. Profiling revealed that in 3 minutes of normal usage with 3 AI analysis tasks:

- `list_part_kits` was called **~791 times** (once per part to check kit membership)
- `get_part_cover` was called **~570 times** (once per part for cover images)
- `get_part_cover_thumbnail` was called **~215 times** (once per part for thumbnails)
- Health check `readyz` made **~300 DB calls** (4 queries per health check)

The frontend makes separate API calls for each part's kit membership, cover image, and shopping list membership, creating a cascade of requests that slows the application significantly during concurrent operations.

## Solution

### 1. Consolidate Parts Endpoint with `include` Parameter

Remove the separate `list_parts_with_locations` endpoint and add an `include` query parameter to the main parts list endpoint that accepts a comma-separated list of optional data to include:

- `locations` - Include part location data (replaces `/api/parts/with-locations`)
- `kits` - Include kit membership data for each part (replaces per-part `/api/parts/{id}/kits` calls)
- `shopping_lists` - Include shopping list membership data (replaces `/api/parts/shopping-list-memberships/query`)
- `cover` - Include cover image URLs (thumbnail and full) for each part

Example: `GET /api/parts?include=locations,kits,cover`

### 2. Add Cover URLs to Part Response

When `cover` is included (or possibly always), add to each part in the response:
- `cover_url` - URL to fetch the full cover image
- `cover_thumbnail_url` - URL to fetch the cover thumbnail

This eliminates the need for separate DB queries to discover cover attachment IDs.

### 3. Optimize Health Check Endpoint

The `/api/health/readyz` endpoint currently makes 4 separate DB queries to check migration status. Optimize this to:
- Cache the migration check result briefly (migrations don't change during runtime)
- Or reduce to a single query that checks both DB connectivity and migration status
- Or remove migration checking from the frequent readiness probe entirely

## Endpoints Affected

- `GET /api/parts` - Add `include` parameter, add cover URLs
- `DELETE GET /api/parts/with-locations` - Remove this endpoint
- `GET /api/health/readyz` - Optimize DB queries

## Expected Impact

- Reduce per-part API calls from 3-4 to 0 for list views
- Reduce health check DB queries from 4 to 1
- Significantly improve application responsiveness during concurrent operations

# Change Brief: Parts List Pagination

## Problem

The parts list currently fetches only the first 50 parts from the backend due to a server-side limit. This means users cannot see all parts in their inventory if they have more than 50.

## Proposed Solution

Implement client-side pagination to fetch all parts from the backend:

1. Update the OpenAPI schema to include `limit` and `offset` query parameters for the `/api/parts/with-locations` endpoint
2. Regenerate the frontend API types to reflect these parameters
3. Modify the `useGetPartsWithLocations` hook usage to:
   - Set a default limit of 1000 parts per page
   - Automatically fetch all pages by repeatedly calling the API with increasing offsets
   - Continue fetching until a response contains fewer than 1000 elements (indicating the last page)
4. Combine all fetched pages into a single result set for the parts list component

## Expected Outcome

Users will be able to view all parts in their inventory, regardless of the total count, with the parts list automatically loading all pages in the background.

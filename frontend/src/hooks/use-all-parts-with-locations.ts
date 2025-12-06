/**
 * Custom hook to fetch all parts with locations using automatic pagination.
 *
 * Fetches all pages sequentially (1000 parts per page) until the backend returns
 * fewer than 1000 parts, indicating the last page. The component receives the
 * complete dataset after all pages are loaded.
 *
 * Note: Refetches on every mount. Navigate away and back to refresh the list.
 */

import type { PartWithTotalAndLocationsSchemaList_a9993e3_PartWithTotalAndLocationsSchema } from '@/lib/api/generated/hooks';
import { usePaginatedFetchAll, type UsePaginatedFetchAllResult } from './use-paginated-fetch-all';

export type UseAllPartsWithLocationsResult = UsePaginatedFetchAllResult<PartWithTotalAndLocationsSchemaList_a9993e3_PartWithTotalAndLocationsSchema>;

/**
 * Fetches all parts with locations across all pages automatically.
 * Returns a unified query state matching useQuery interface for component compatibility.
 */
export function useAllPartsWithLocations(): UseAllPartsWithLocationsResult {
  return usePaginatedFetchAll<PartWithTotalAndLocationsSchemaList_a9993e3_PartWithTotalAndLocationsSchema>('/api/parts/with-locations');
}

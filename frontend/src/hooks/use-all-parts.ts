/**
 * Custom hook to fetch all parts using automatic pagination.
 *
 * Fetches all pages sequentially (1000 parts per page) until the backend returns
 * fewer than 1000 parts, indicating the last page. The component receives the
 * complete dataset after all pages are loaded.
 *
 * Note: Refetches on every mount. Navigate away and back to refresh the list.
 */

import type { PartWithTotalSchemaList_a9993e3_PartWithTotalSchema } from '@/lib/api/generated/hooks';
import { usePaginatedFetchAll, type UsePaginatedFetchAllResult } from './use-paginated-fetch-all';

export type UseAllPartsResult = UsePaginatedFetchAllResult<PartWithTotalSchemaList_a9993e3_PartWithTotalSchema>;

/**
 * Fetches all parts across all pages automatically.
 * Returns a unified query state matching useQuery interface for component compatibility.
 */
export function useAllParts(): UseAllPartsResult {
  return usePaginatedFetchAll<PartWithTotalSchemaList_a9993e3_PartWithTotalSchema>('/api/parts');
}

/**
 * Custom hook to fetch all parts with consolidated includes (locations, kits, shopping lists, cover).
 *
 * Uses the consolidated /api/parts endpoint with include parameter to fetch:
 * - Part locations
 * - Kit memberships
 * - Shopping list memberships
 * - Cover attachment URLs
 *
 * This eliminates hundreds of separate API calls that were previously needed
 * for indicator data.
 *
 * Note: Refetches on every mount. Navigate away and back to refresh the list.
 */

import { useCallback } from 'react';
import { api } from '@/lib/api/generated/client';
import { toApiError } from '@/lib/api/api-error';
import type { PartWithTotalSchemaList_a9993e3_PartWithTotalSchema } from '@/lib/api/generated/hooks';
import {
  usePaginatedFetchAll,
  type UsePaginatedFetchAllResult,
} from './use-paginated-fetch-all';

const INCLUDE_PARAMS = 'locations,kits,shopping_lists,cover';

type PartWithIncludes = PartWithTotalSchemaList_a9993e3_PartWithTotalSchema;

export type UseAllPartsResult = UsePaginatedFetchAllResult<PartWithIncludes>;

/**
 * Fetches all parts with consolidated includes across all pages automatically.
 * Returns a unified query state matching useQuery interface for component compatibility.
 */
export function useAllParts(): UseAllPartsResult {
  // Fetch callback that includes the consolidated query parameters
  const fetchPage = useCallback(
    async (offset: number, limit: number, signal: AbortSignal): Promise<PartWithIncludes[]> => {
      const { data: pageData, error: pageError } = await (api.GET as any)('/api/parts', {
        params: {
          query: {
            limit,
            offset,
            include: INCLUDE_PARAMS,
          },
        },
        signal,
      });

      if (pageError) throw toApiError(pageError);
      if (!pageData) throw new Error('No data returned from /api/parts endpoint');

      return pageData as PartWithIncludes[];
    },
    []
  );

  // Validation callback to ensure backend returns expected include fields
  const validate = useCallback((pageData: PartWithIncludes[]) => {
    if (pageData.length > 0) {
      const firstPart = pageData[0];
      if (firstPart.kits === undefined || firstPart.shopping_lists === undefined) {
        throw new Error('Consolidated endpoint did not return expected include fields (kits, shopping_lists)');
      }
    }
  }, []);

  return usePaginatedFetchAll<PartWithIncludes>(fetchPage, { validate });
}

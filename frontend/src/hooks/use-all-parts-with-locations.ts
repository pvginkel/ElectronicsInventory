/**
 * Custom hook to fetch all parts with locations using automatic pagination.
 *
 * Fetches all pages sequentially (1000 parts per page) until the backend returns
 * fewer than 1000 parts, indicating the last page. The component receives the
 * complete dataset after all pages are loaded.
 *
 * Note: Refetches on every mount. Navigate away and back to refresh the list.
 */

import { useEffect, useState } from 'react';
import { api } from '@/lib/api/generated/client';
import { toApiError } from '@/lib/api/api-error';
import type { PartWithTotalAndLocationsSchemaList_a9993e3 } from '@/lib/api/generated/hooks';

const PAGINATION_LIMIT = 1000;

interface UseAllPartsWithLocationsResult {
  data: PartWithTotalAndLocationsSchemaList_a9993e3;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  pagesFetched: number;
}

/**
 * Fetches all parts with locations across all pages automatically.
 * Returns a unified query state matching useQuery interface for component compatibility.
 */
export function useAllPartsWithLocations(): UseAllPartsWithLocationsResult {
  const [data, setData] = useState<PartWithTotalAndLocationsSchemaList_a9993e3>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [pagesFetched, setPagesFetched] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function fetchAllPages() {
      setIsLoading(true);
      setError(null);

      const allParts: PartWithTotalAndLocationsSchemaList_a9993e3 = [];
      let offset = 0;
      let pages = 0;

      try {
        while (true) {
          // Backend accepts limit/offset via request.args (see backend/app/api/parts.py:131)
          // TODO: Remove @ts-expect-error when backend OpenAPI schema is updated
          const { data: pageData, error: pageError } = await api.GET('/api/parts/with-locations', {
            params: {
              // @ts-expect-error - Backend accepts limit/offset but OpenAPI schema not updated yet
              query: {
                limit: PAGINATION_LIMIT,
                offset,
              },
            },
            signal: controller.signal,
          });

          if (pageError) throw toApiError(pageError);
          if (!pageData) throw new Error('No data returned from parts endpoint');

          allParts.push(...pageData);
          pages += 1;

          // Last page has fewer items than the limit
          if (pageData.length < PAGINATION_LIMIT) break;

          offset += PAGINATION_LIMIT;
        }

        if (!cancelled) {
          setData(allParts);
          setPagesFetched(pages);
          setIsLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setIsLoading(false);
        }
      }
    }

    fetchAllPages();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  return {
    data,
    isLoading,
    isFetching: isLoading,
    error,
    pagesFetched,
  };
}

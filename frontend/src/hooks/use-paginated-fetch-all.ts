/**
 * Generic hook for fetching all items from a paginated API endpoint.
 *
 * Fetches all pages sequentially (1000 items per page) until the backend returns
 * fewer than 1000 items, indicating the last page. The component receives the
 * complete dataset after all pages are loaded.
 *
 * Note: Refetches on every mount. Navigate away and back to refresh the list.
 */

import { useEffect, useState } from 'react';
import { api } from '@/lib/api/generated/client';
import { toApiError } from '@/lib/api/api-error';

const PAGINATION_LIMIT = 1000;

export interface UsePaginatedFetchAllResult<T> {
  data: T[];
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  pagesFetched: number;
}

/**
 * Fetches all items from a paginated endpoint automatically.
 * Returns a unified query state matching useQuery interface for component compatibility.
 */
export function usePaginatedFetchAll<T>(path: string): UsePaginatedFetchAllResult<T> {
  const [data, setData] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [pagesFetched, setPagesFetched] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function fetchAllPages() {
      setIsLoading(true);
      setError(null);

      const allItems: T[] = [];
      let offset = 0;
      let pages = 0;

      try {
        while (true) {
          // Cast to any: path is a string, and pagination params aren't in OpenAPI schema yet
          const { data: pageData, error: pageError } = await (api.GET as any)(path, {
            params: {
              query: {
                limit: PAGINATION_LIMIT,
                offset,
              },
            },
            signal: controller.signal,
          });

          if (pageError) throw toApiError(pageError);
          if (!pageData) throw new Error(`No data returned from ${path} endpoint`);

          allItems.push(...(pageData as T[]));
          pages += 1;

          // Last page has fewer items than the limit
          if ((pageData as T[]).length < PAGINATION_LIMIT) break;

          offset += PAGINATION_LIMIT;
        }

        if (!cancelled) {
          setData(allItems);
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
  }, [path]);

  return {
    data,
    isLoading,
    isFetching: isLoading,
    error,
    pagesFetched,
  };
}

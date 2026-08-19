import { useEffect } from 'react';
import { useGetPartsByPartKey } from '@/lib/api/generated/hooks';

/**
 * Hook to fetch part details for a duplicate part entry.
 * Used in both AI duplicate card and bar components.
 *
 * Does not retry on 404 (part may not exist).
 * Logs non-404 errors to console for debugging.
 */
export function useDuplicatePartDetails(partKey: string) {
  const query = useGetPartsByPartKey(
    { path: { part_key: partKey } },
    {
      // Don't retry on 404 - part may not exist
      retry: false,
    }
  );

  // Log non-404 errors to console for debugging
  useEffect(() => {
    if (query.error && !('status' in query.error && query.error.status === 404)) {
      console.warn(`Failed to fetch duplicate part ${partKey}:`, query.error);
    }
  }, [query.error, partKey]);

  return query;
}

import { useMemo } from 'react';
import { useGetKits, type KitSummarySchemaList_a9993e3 } from '@/lib/api/generated/hooks';
import {
  mapKitSummary,
  type KitOverviewBuckets,
  type KitOverviewCounts,
  type KitStatus,
  type KitSummary,
} from '@/types/kits';

type KitsQueryParams = { query: { status: KitStatus; query?: string } };

export function createKitsQueryParams(status: KitStatus, searchTerm?: string): KitsQueryParams {
  const trimmed = searchTerm?.trim() ?? '';
  const query: KitsQueryParams['query'] = { status };

  if (trimmed.length > 0) {
    query.query = trimmed;
  }

  return { query };
}

export function buildKitsQueryKey(status: KitStatus, searchTerm?: string) {
  return ['getKits', createKitsQueryParams(status, searchTerm)] as const;
}

export interface UseKitsOverviewResult {
  queries: {
    active: ReturnType<typeof useGetKits>;
    archived: ReturnType<typeof useGetKits>;
  };
  buckets: KitOverviewBuckets;
  counts: KitOverviewCounts;
  search: string;
}

/**
 * Retrieve kits for both lifecycle statuses so the overview tabs stay hydrated.
 */
export function useKitsOverview(searchTerm?: string): UseKitsOverviewResult {
  const normalizedSearch = searchTerm?.trim() ?? '';

  const activeParams = useMemo(
    () => createKitsQueryParams('active', normalizedSearch),
    [normalizedSearch],
  );
  const archivedParams = useMemo(
    () => createKitsQueryParams('archived', normalizedSearch),
    [normalizedSearch],
  );

  const activeQuery = useGetKits(activeParams);
  const archivedQuery = useGetKits(archivedParams);

  const buckets: KitOverviewBuckets = useMemo(() => {
    const activeKits = mapKits(activeQuery.data);
    const archivedKits = mapKits(archivedQuery.data);
    return {
      active: activeKits,
      archived: archivedKits,
    };
  }, [activeQuery.data, archivedQuery.data]);

  const counts: KitOverviewCounts = {
    active: buckets.active.length,
    archived: buckets.archived.length,
  };

  return {
    queries: {
      active: activeQuery,
      archived: archivedQuery,
    },
    buckets,
    counts,
    search: normalizedSearch,
  };
}

function mapKits(list?: KitSummarySchemaList_a9993e3 | null): KitSummary[] {
  if (!list?.length) {
    return [];
  }

  return list.map(mapKitSummary);
}

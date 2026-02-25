import { useMemo } from 'react';
import { useGetKits, type KitSummarySchemaList_a9993e3 } from '@/lib/api/generated/hooks';
import {
  mapKitSummary,
  type KitOverviewBuckets,
  type KitOverviewCounts,
  type KitStatus,
  type KitSummary,
} from '@/types/kits';

type KitsQueryParams = { query: { status: KitStatus } };

/** Build query params for the kits endpoint. Search is handled client-side via fuzzy matching. */
function createKitsQueryParams(status: KitStatus): KitsQueryParams {
  return { query: { status } };
}

/** Stable param objects for each status — no search term, so these never change. */
const ACTIVE_PARAMS = createKitsQueryParams('active');
const ARCHIVED_PARAMS = createKitsQueryParams('archived');

interface UseKitsOverviewResult {
  queries: {
    active: ReturnType<typeof useGetKits>;
    archived: ReturnType<typeof useGetKits>;
  };
  buckets: KitOverviewBuckets;
  counts: KitOverviewCounts;
}

/**
 * Retrieve kits for both lifecycle statuses so the overview tabs stay hydrated.
 * Search filtering is performed client-side via fuzzy matching in the component.
 */
export function useKitsOverview(): UseKitsOverviewResult {
  const activeQuery = useGetKits(ACTIVE_PARAMS);
  const archivedQuery = useGetKits(ARCHIVED_PARAMS);

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
  };
}

function mapKits(list?: KitSummarySchemaList_a9993e3 | null): KitSummary[] {
  if (!list?.length) {
    return [];
  }

  return list.map(mapKitSummary);
}

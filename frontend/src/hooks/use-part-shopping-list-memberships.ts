import { useCallback, useMemo } from 'react';
import { useQuery, type QueryClient, type UseQueryResult } from '@tanstack/react-query';
import { api } from '@/lib/api/generated/client';
import { toApiError } from '@/lib/api/api-error';
import {
  type PartShoppingListMembershipQueryResponseSchema_d085feb,
  type PartShoppingListMembershipQueryResponseSchema_d085feb_PartShoppingListMembershipQueryItemSchema,
  type PartShoppingListMembershipQueryResponseSchema_d085feb_PartShoppingListMembershipSchema,
  type PartShoppingListMembershipQueryResponseSchema_d085feb_SellerListSchema,
} from '@/lib/api/generated/hooks';
import { useListLoadingInstrumentation } from '@/lib/test/query-instrumentation';
import type {
  ShoppingListMembership,
  ShoppingListMembershipSummary,
  ShoppingListSellerSummary,
} from '@/types/shopping-lists';

const MEMBERSHIP_QUERY_KEY = ['parts.shoppingListMemberships'] as const;

type MembershipQueryResult = PartShoppingListMembershipQueryResponseSchema_d085feb;
type MembershipQueryItem = PartShoppingListMembershipQueryResponseSchema_d085feb_PartShoppingListMembershipQueryItemSchema;
type MembershipSchema = PartShoppingListMembershipQueryResponseSchema_d085feb_PartShoppingListMembershipSchema;
type MembershipQueryKey = [typeof MEMBERSHIP_QUERY_KEY[number], { partKeys: string[]; includeDone: boolean }];

interface NormalizedPartKeys {
  original: string[];
  unique: string[];
}

interface MembershipLookupOptions {
  includeDone?: boolean;
  enabled?: boolean;
  staleTime?: number;
  gcTime?: number;
}

interface MembershipLookupResult {
  partKeys: string[];
  uniquePartKeys: string[];
  summaries: ShoppingListMembershipSummary[];
  summaryByPartKey: Map<string, ShoppingListMembershipSummary>;
  query: UseQueryResult<MembershipQueryResult, Error>;
}

function normalizePartKeys(partKeys: string | string[] | undefined): NormalizedPartKeys {
  if (!partKeys) {
    return { original: [], unique: [] };
  }

  const raw = Array.isArray(partKeys) ? partKeys : [partKeys];
  const original: string[] = [];
  const unique: string[] = [];
  const seen = new Set<string>();

  for (const key of raw) {
    if (typeof key !== 'string') {
      continue;
    }
    const trimmed = key.trim();
    if (!trimmed) {
      continue;
    }
    original.push(trimmed);
    if (!seen.has(trimmed)) {
      seen.add(trimmed);
      unique.push(trimmed);
    }
  }

  return { original, unique };
}

function membershipQueryKey(partKeys: string[], includeDone: boolean): MembershipQueryKey {
  return [MEMBERSHIP_QUERY_KEY[0], { partKeys, includeDone }] as const;
}

function mapSeller(seller: PartShoppingListMembershipQueryResponseSchema_d085feb_SellerListSchema | null): ShoppingListSellerSummary | null {
  if (!seller) {
    return null;
  }
  return {
    id: seller.id,
    name: seller.name,
    website: seller.website ?? null,
  };
}

function mapMembership(raw: MembershipSchema): ShoppingListMembership {
  const note = typeof raw.note === 'string' ? raw.note.trim() : '';
  return {
    listId: raw.shopping_list_id,
    listName: raw.shopping_list_name,
    listStatus: raw.shopping_list_status,
    lineId: raw.line_id,
    lineStatus: raw.line_status,
    needed: raw.needed,
    ordered: raw.ordered,
    received: raw.received,
    note: note.length > 0 ? note : null,
    seller: mapSeller(raw.seller ?? null),
  };
}

function createSummary(partKey: string, memberships: ShoppingListMembership[]): ShoppingListMembershipSummary {
  const activeMemberships = memberships.filter(membership => membership.listStatus !== 'done' && membership.lineStatus !== 'done');
  const conceptMemberships = activeMemberships.filter(membership => membership.listStatus === 'concept');
  const readyMemberships = activeMemberships.filter(membership => membership.listStatus === 'ready');

  const listNames = Array.from(new Set(activeMemberships.map(membership => membership.listName)));
  const conceptListIds = Array.from(new Set(conceptMemberships.map(membership => membership.listId)));

  return {
    partKey,
    memberships,
    hasActiveMembership: activeMemberships.length > 0,
    listNames,
    conceptListIds,
    activeCount: activeMemberships.length,
    conceptCount: conceptMemberships.length,
    readyCount: readyMemberships.length,
    completedCount: memberships.length - activeMemberships.length,
  };
}

function createEmptySummary(partKey: string): ShoppingListMembershipSummary {
  return {
    partKey,
    memberships: [],
    hasActiveMembership: false,
    listNames: [],
    conceptListIds: [],
    activeCount: 0,
    conceptCount: 0,
    readyCount: 0,
    completedCount: 0,
  };
}

function mapQueryItem(item: MembershipQueryItem, includeDone: boolean): ShoppingListMembershipSummary {
  const memberships = (item.memberships ?? []).map(mapMembership);
  const filtered = includeDone ? memberships : memberships.filter(membership => membership.listStatus !== 'done' && membership.lineStatus !== 'done');
  return createSummary(item.part_key.trim(), filtered);
}

function buildSummaryResults(
  originalKeys: string[],
  uniqueKeys: string[],
  response: MembershipQueryResult | undefined,
  includeDone: boolean
): { ordered: ShoppingListMembershipSummary[]; byPartKey: Map<string, ShoppingListMembershipSummary> } {
  const byPartKey = new Map<string, ShoppingListMembershipSummary>();

  for (const key of uniqueKeys) {
    if (!byPartKey.has(key)) {
      byPartKey.set(key, createEmptySummary(key));
    }
  }

  const items = response?.memberships ?? [];
  for (const item of items) {
    const partKey = typeof item.part_key === 'string' ? item.part_key.trim() : '';
    if (!partKey) {
      continue;
    }
    const summary = mapQueryItem(item, includeDone);
    byPartKey.set(partKey, summary);
  }

  const ordered = originalKeys.map(partKey => {
    const summary = byPartKey.get(partKey);
    if (summary) {
      return summary;
    }
    const fallback = createEmptySummary(partKey);
    byPartKey.set(partKey, fallback);
    return fallback;
  });

  return { ordered, byPartKey };
}

function useMembershipLookup(partKeys: string | string[] | undefined, options?: MembershipLookupOptions): MembershipLookupResult {
  const normalized = useMemo(() => normalizePartKeys(partKeys), [partKeys]);
  const includeDone = options?.includeDone ?? false;
  const hasKeys = normalized.unique.length > 0;
  const queryKey = useMemo(
    () => membershipQueryKey(normalized.unique, includeDone),
    [includeDone, normalized.unique]
  );

  const query = useQuery<MembershipQueryResult, Error>({
    queryKey,
    queryFn: async () => {
      const { data, error } = await api.POST('/api/parts/shopping-list-memberships/query', {
        body: {
          part_keys: normalized.unique,
          include_done: includeDone,
        },
      });
      if (error) {
        throw toApiError(error);
      }
      return data;
    },
    enabled: (options?.enabled ?? true) && hasKeys,
    staleTime: options?.staleTime,
    gcTime: options?.gcTime,
  });

  const { ordered, byPartKey } = useMemo(
    () => buildSummaryResults(normalized.original, normalized.unique, query.data, includeDone),
    [includeDone, normalized.original, normalized.unique, query.data]
  );

  return {
    partKeys: normalized.original,
    uniquePartKeys: normalized.unique,
    summaries: ordered,
    summaryByPartKey: byPartKey,
    query,
  };
}

interface UsePartShoppingListMembershipsOptions {
  includeDone?: boolean;
}

export function usePartShoppingListMemberships(
  partKey: string | undefined,
  options?: UsePartShoppingListMembershipsOptions
) {
  const { summaries, partKeys, summaryByPartKey, query } = useMembershipLookup(partKey, {
    includeDone: options?.includeDone,
  });

  const summary = summaries[0] ?? createEmptySummary(typeof partKey === 'string' ? partKey.trim() : '');

  const getReadyMetadata = useCallback(() => ({
    partKey: summary.partKey,
    activeCount: summary.activeCount,
    conceptCount: summary.conceptCount,
  }), [summary.activeCount, summary.conceptCount, summary.partKey]);

  const getErrorMetadata = useCallback((error: unknown) => ({
    partKey: summary.partKey,
    message: error instanceof Error ? error.message : String(error ?? 'Unknown error'),
  }), [summary.partKey]);

  const getAbortedMetadata = useCallback(() => ({
    partCount: partKeys.length,
  }), [partKeys.length]);

  useListLoadingInstrumentation({
    scope: 'parts.detail.shoppingLists',
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    getReadyMetadata,
    getErrorMetadata,
    getAbortedMetadata,
  });

  return {
    ...query,
    memberships: summary.memberships,
    summary,
    hasActiveMembership: summary.hasActiveMembership,
    listNames: summary.listNames,
    conceptListIds: summary.conceptListIds,
    activeCount: summary.activeCount,
    conceptCount: summary.conceptCount,
    readyCount: summary.readyCount,
    completedCount: summary.completedCount,
    partKeys,
    summaryByPartKey,
  };
}

interface UseShoppingListMembershipIndicatorsOptions {
  includeDone?: boolean;
}

const INDICATOR_STALE_TIME = 60_000;
const INDICATOR_GC_TIME = 5 * 60_000;

export function useShoppingListMembershipIndicators(
  partKeys: string[],
  options?: UseShoppingListMembershipIndicatorsOptions
) {
  const lookup = useMembershipLookup(partKeys, {
    includeDone: options?.includeDone,
    staleTime: INDICATOR_STALE_TIME,
    gcTime: INDICATOR_GC_TIME,
  });

  const uniquePartCount = lookup.uniquePartKeys.length;
  const indicatorStats = useMemo(() => {
    let activePartCount = 0;
    let membershipCount = 0;
    for (const summary of lookup.summaries) {
      if (summary.hasActiveMembership) {
        activePartCount += 1;
        membershipCount += summary.activeCount;
      }
    }
    return { activePartCount, membershipCount };
  }, [lookup.summaries]);

  const getReadyMetadata = useCallback(() => ({
    partCount: uniquePartCount,
    activePartCount: indicatorStats.activePartCount,
    membershipCount: indicatorStats.membershipCount,
  }), [indicatorStats.activePartCount, indicatorStats.membershipCount, uniquePartCount]);

  const getErrorMetadata = useCallback((error: unknown) => ({
    partCount: uniquePartCount,
    message: error instanceof Error ? error.message : String(error ?? 'Unknown error'),
  }), [uniquePartCount]);

  const getAbortedMetadata = useCallback(() => ({
    partCount: uniquePartCount,
  }), [uniquePartCount]);

  useListLoadingInstrumentation({
    scope: 'parts.list.shoppingListIndicators',
    isLoading: lookup.query.isLoading,
    isFetching: lookup.query.isFetching,
    error: lookup.query.error,
    getReadyMetadata,
    getErrorMetadata,
    getAbortedMetadata,
  });

  return {
    ...lookup.query,
    summaries: lookup.summaries,
    summaryByPartKey: lookup.summaryByPartKey,
    partKeys: lookup.partKeys,
    uniquePartKeys: lookup.uniquePartKeys,
  };
}

export function invalidatePartMemberships(queryClient: QueryClient, partKeys: string | string[]): void {
  const normalized = normalizePartKeys(partKeys);
  if (normalized.unique.length === 0) {
    return;
  }

  queryClient.invalidateQueries({
    predicate: (query) => {
      const key = query.queryKey;
      if (!Array.isArray(key)) {
        return false;
      }
      if (key[0] !== MEMBERSHIP_QUERY_KEY[0]) {
        return false;
      }
      const params = key[1] as { partKeys?: string[] } | undefined;
      if (!params?.partKeys) {
        return false;
      }
      return normalized.unique.some(partKey => params.partKeys?.includes(partKey));
    },
  });
}

import { useCallback, useMemo } from 'react';
import { api } from '@/lib/api/generated/client';
import { toApiError } from '@/lib/api/api-error';
import {
  type KitPickListMembershipQueryResponseSchema_b247181,
  type KitPickListMembershipQueryResponseSchema_b247181_KitPickListMembershipQueryItemSchema,
  type KitPickListMembershipQueryResponseSchema_b247181_KitPickListMembershipSchema,
  type KitShoppingListMembershipQueryResponseSchema_b98797e,
  type KitShoppingListMembershipQueryResponseSchema_b98797e_KitShoppingListLinkSchema,
  type KitShoppingListMembershipQueryResponseSchema_b98797e_KitShoppingListMembershipQueryItemSchema,
} from '@/lib/api/generated/hooks';
import { useListLoadingInstrumentation } from '@/lib/test/query-instrumentation';
import { useMembershipLookup } from '@/hooks/use-membership-lookup';
import type {
  KitPickListMembership,
  KitPickListMembershipSummary,
  KitShoppingListMembership,
  KitShoppingListMembershipSummary,
} from '@/types/kits';

const SHOPPING_MEMBERSHIP_QUERY_KEY = ['kits.shoppingListMemberships'] as const;
const PICK_MEMBERSHIP_QUERY_KEY = ['kits.pickListMemberships'] as const;

type ShoppingMembershipQueryResult = KitShoppingListMembershipQueryResponseSchema_b98797e;
type ShoppingMembershipQueryItem = KitShoppingListMembershipQueryResponseSchema_b98797e_KitShoppingListMembershipQueryItemSchema;
type ShoppingMembershipSchema = KitShoppingListMembershipQueryResponseSchema_b98797e_KitShoppingListLinkSchema;

type PickMembershipQueryResult = KitPickListMembershipQueryResponseSchema_b247181;
type PickMembershipQueryItem = KitPickListMembershipQueryResponseSchema_b247181_KitPickListMembershipQueryItemSchema;
type PickMembershipSchema = KitPickListMembershipQueryResponseSchema_b247181_KitPickListMembershipSchema;

type ShoppingMembershipQueryKey = [
  typeof SHOPPING_MEMBERSHIP_QUERY_KEY[number],
  { kitIds: number[]; includeDone: boolean }
];

type PickMembershipQueryKey = [
  typeof PICK_MEMBERSHIP_QUERY_KEY[number],
  { kitIds: number[]; includeDone: boolean }
];

const INDICATOR_STALE_TIME = 60_000;
const INDICATOR_GC_TIME = 5 * 60_000;

function normalizeKitId(candidate: number): number | null {
  if (typeof candidate !== 'number' || Number.isNaN(candidate) || !Number.isFinite(candidate)) {
    return null;
  }
  const normalized = Math.trunc(candidate);
  return normalized > 0 ? normalized : null;
}

function shoppingMembershipQueryKey(kitIds: number[], includeDone: boolean): ShoppingMembershipQueryKey {
  return [SHOPPING_MEMBERSHIP_QUERY_KEY[0], { kitIds, includeDone }] as const;
}

function pickMembershipQueryKey(kitIds: number[], includeDone: boolean): PickMembershipQueryKey {
  return [PICK_MEMBERSHIP_QUERY_KEY[0], { kitIds, includeDone }] as const;
}

export function buildPickMembershipQueryKey(kitIds: number[], includeDone: boolean): PickMembershipQueryKey {
  return pickMembershipQueryKey(kitIds, includeDone);
}

async function fetchKitShoppingListMemberships(
  kitIds: number[],
  includeDone: boolean
): Promise<ShoppingMembershipQueryResult> {
  const { data, error } = await api.POST('/api/kits/shopping-list-memberships/query', {
    body: {
      kit_ids: kitIds,
      include_done: includeDone,
    },
  });
  if (error) {
    throw toApiError(error);
  }
  return data;
}

async function fetchKitPickListMemberships(
  kitIds: number[],
  includeDone: boolean
): Promise<PickMembershipQueryResult> {
  const { data, error } = await api.POST('/api/kits/pick-list-memberships/query', {
    body: {
      kit_ids: kitIds,
      include_done: includeDone,
    },
  });
  if (error) {
    throw toApiError(error);
  }
  return data;
}

function mapKitShoppingMembership(raw: ShoppingMembershipSchema): KitShoppingListMembership {
  return {
    id: raw.id,
    listId: raw.shopping_list_id,
    listName: raw.shopping_list_name,
    status: raw.status,
    requestedUnits: raw.requested_units ?? 0,
    honorReserved: raw.honor_reserved ?? false,
    snapshotKitUpdatedAt: raw.snapshot_kit_updated_at,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

function createKitShoppingSummary(
  kitId: number,
  memberships: KitShoppingListMembership[]
): KitShoppingListMembershipSummary {
  const activeMemberships = memberships.filter(membership => membership.status !== 'done');
  const conceptMemberships = activeMemberships.filter(membership => membership.status === 'concept');
  const readyMemberships = activeMemberships.filter(membership => membership.status === 'ready');

  const listNames = Array.from(new Set(activeMemberships.map(membership => membership.listName)));
  const conceptListIds = Array.from(new Set(conceptMemberships.map(membership => membership.listId)));

  return {
    kitId,
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

function createEmptyKitShoppingSummary(kitId: number): KitShoppingListMembershipSummary {
  return {
    kitId,
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

function mapShoppingQueryItem(
  item: ShoppingMembershipQueryItem,
  includeDone: boolean
): KitShoppingListMembershipSummary {
  const memberships = (item.memberships ?? []).map(mapKitShoppingMembership);
  const filtered = includeDone ? memberships : memberships.filter(membership => membership.status !== 'done');
  return createKitShoppingSummary(item.kit_id, filtered);
}

function buildKitShoppingSummaryResults(
  originalKeys: number[],
  uniqueKeys: number[],
  response: ShoppingMembershipQueryResult | undefined,
  includeDone: boolean
): { ordered: KitShoppingListMembershipSummary[]; byKey: Map<number, KitShoppingListMembershipSummary> } {
  const byKitId = new Map<number, KitShoppingListMembershipSummary>();

  for (const key of uniqueKeys) {
    if (!byKitId.has(key)) {
      byKitId.set(key, createEmptyKitShoppingSummary(key));
    }
  }

  const items = response?.memberships ?? [];
  for (const item of items) {
    const kitId = item.kit_id;
    if (typeof kitId !== 'number') {
      continue;
    }
    const summary = mapShoppingQueryItem(item, includeDone);
    byKitId.set(kitId, summary);
  }

  const ordered = originalKeys.map(kitId => {
    const summary = byKitId.get(kitId);
    if (summary) {
      return summary;
    }
    const fallback = createEmptyKitShoppingSummary(kitId);
    byKitId.set(kitId, fallback);
    return fallback;
  });

  return { ordered, byKey: byKitId };
}

function mapKitPickListMembership(raw: PickMembershipSchema): KitPickListMembership {
  return {
    id: raw.id,
    kitId: raw.kit_id,
    status: raw.status,
    requestedUnits: raw.requested_units,
    lineCount: raw.line_count,
    openLineCount: raw.open_line_count,
    completedLineCount: raw.completed_line_count,
    totalQuantityToPick: raw.total_quantity_to_pick,
    pickedQuantity: raw.picked_quantity,
    remainingQuantity: raw.remaining_quantity,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    completedAt: raw.completed_at ?? null,
  };
}

function createKitPickSummary(
  kitId: number,
  memberships: KitPickListMembership[]
): KitPickListMembershipSummary {
  const openMemberships = memberships.filter(membership => membership.status === 'open');
  const completedMemberships = memberships.filter(membership => membership.status === 'completed');

  return {
    kitId,
    memberships,
    hasOpenMembership: openMemberships.length > 0,
    totalCount: memberships.length,
    openCount: openMemberships.length,
    completedCount: completedMemberships.length,
  };
}

function createEmptyKitPickSummary(kitId: number): KitPickListMembershipSummary {
  return {
    kitId,
    memberships: [],
    hasOpenMembership: false,
    totalCount: 0,
    openCount: 0,
    completedCount: 0,
  };
}

function mapPickQueryItem(
  item: PickMembershipQueryItem,
  includeDone: boolean
): KitPickListMembershipSummary {
  const memberships = (item.pick_lists ?? []).map(mapKitPickListMembership);
  const filtered = includeDone ? memberships : memberships.filter(membership => membership.status === 'open');
  return createKitPickSummary(item.kit_id, filtered);
}

function buildKitPickSummaryResults(
  originalKeys: number[],
  uniqueKeys: number[],
  response: PickMembershipQueryResult | undefined,
  includeDone: boolean
): { ordered: KitPickListMembershipSummary[]; byKey: Map<number, KitPickListMembershipSummary> } {
  const byKitId = new Map<number, KitPickListMembershipSummary>();

  for (const key of uniqueKeys) {
    if (!byKitId.has(key)) {
      byKitId.set(key, createEmptyKitPickSummary(key));
    }
  }

  const items = response?.memberships ?? [];
  for (const item of items) {
    const kitId = item.kit_id;
    if (typeof kitId !== 'number') {
      continue;
    }
    const summary = mapPickQueryItem(item, includeDone);
    byKitId.set(kitId, summary);
  }

  const ordered = originalKeys.map(kitId => {
    const summary = byKitId.get(kitId);
    if (summary) {
      return summary;
    }
    const fallback = createEmptyKitPickSummary(kitId);
    byKitId.set(kitId, fallback);
    return fallback;
  });

  return { ordered, byKey: byKitId };
}

interface KitMembershipOptions {
  includeDone?: boolean;
}

export function useKitShoppingListMemberships(
  kitIds: number[] | undefined,
  options?: KitMembershipOptions
) {
  const lookup = useMembershipLookup<number, ShoppingMembershipQueryResult, KitShoppingListMembershipSummary>({
    keys: kitIds,
    includeDone: options?.includeDone,
    normalizeKey: normalizeKitId,
    queryKey: shoppingMembershipQueryKey,
    queryFn: fetchKitShoppingListMemberships,
    buildSummaries: ({ originalKeys, uniqueKeys, response, includeDone }) =>
      buildKitShoppingSummaryResults(originalKeys, uniqueKeys, response, includeDone),
    staleTime: INDICATOR_STALE_TIME,
    gcTime: INDICATOR_GC_TIME,
  });

  const stats = useMemo(() => {
    let activeKitCount = 0;
    let membershipCount = 0;
    for (const summary of lookup.summaries) {
      if (summary.hasActiveMembership) {
        activeKitCount += 1;
        membershipCount += summary.activeCount;
      }
    }
    return { activeKitCount, membershipCount };
  }, [lookup.summaries]);

  const getReadyMetadata = useCallback(
    () => ({
      kitCount: lookup.uniqueKeys.length,
      activeCount: stats.activeKitCount,
      membershipCount: stats.membershipCount,
    }),
    [lookup.uniqueKeys.length, stats.activeKitCount, stats.membershipCount]
  );

  const getErrorMetadata = useCallback(
    (error: unknown) => ({
      kitCount: lookup.uniqueKeys.length,
      message: error instanceof Error ? error.message : String(error ?? 'Unknown error'),
    }),
    [lookup.uniqueKeys.length]
  );

  const getAbortedMetadata = useCallback(
    () => ({
      kitCount: lookup.uniqueKeys.length,
    }),
    [lookup.uniqueKeys.length]
  );

  useListLoadingInstrumentation({
    scope: 'kits.list.memberships.shopping',
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
    summaryByKitId: lookup.summaryByKey,
    kitIds: lookup.keys,
    uniqueKitIds: lookup.uniqueKeys,
  };
}

export function useKitPickListMemberships(
  kitIds: number[] | undefined,
  options?: KitMembershipOptions
) {
  const lookup = useMembershipLookup<number, PickMembershipQueryResult, KitPickListMembershipSummary>({
    keys: kitIds,
    includeDone: options?.includeDone,
    normalizeKey: normalizeKitId,
    queryKey: pickMembershipQueryKey,
    queryFn: fetchKitPickListMemberships,
    buildSummaries: ({ originalKeys, uniqueKeys, response, includeDone }) =>
      buildKitPickSummaryResults(originalKeys, uniqueKeys, response, includeDone),
    staleTime: INDICATOR_STALE_TIME,
    gcTime: INDICATOR_GC_TIME,
  });

  const stats = useMemo(() => {
    let activeKitCount = 0;
    let membershipCount = 0;
    for (const summary of lookup.summaries) {
      if (summary.openCount > 0) {
        activeKitCount += 1;
        membershipCount += summary.openCount;
      }
    }
    return { activeKitCount, membershipCount };
  }, [lookup.summaries]);

  const getReadyMetadata = useCallback(
    () => ({
      kitCount: lookup.uniqueKeys.length,
      activeCount: stats.activeKitCount,
      membershipCount: stats.membershipCount,
    }),
    [lookup.uniqueKeys.length, stats.activeKitCount, stats.membershipCount]
  );

  const getErrorMetadata = useCallback(
    (error: unknown) => ({
      kitCount: lookup.uniqueKeys.length,
      message: error instanceof Error ? error.message : String(error ?? 'Unknown error'),
    }),
    [lookup.uniqueKeys.length]
  );

  const getAbortedMetadata = useCallback(
    () => ({
      kitCount: lookup.uniqueKeys.length,
    }),
    [lookup.uniqueKeys.length]
  );

  useListLoadingInstrumentation({
    scope: 'kits.list.memberships.pick',
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
    summaryByKitId: lookup.summaryByKey,
    kitIds: lookup.keys,
    uniqueKitIds: lookup.uniqueKeys,
  };
}

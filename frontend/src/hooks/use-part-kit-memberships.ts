import { useCallback, useMemo } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/generated/client';
import { toApiError } from '@/lib/api/api-error';
import {
  type PartKitUsageSchemaList_a9993e3,
  type PartKitUsageSchemaList_a9993e3_PartKitUsageSchema,
} from '@/lib/api/generated/hooks';
import { useListLoadingInstrumentation } from '@/lib/test/query-instrumentation';
import {
  normalizeMembershipKeys,
  useMembershipLookup,
} from '@/hooks/use-membership-lookup';

const KIT_MEMBERSHIP_QUERY_KEY = ['parts.kitMemberships'] as const;

type KitMembershipQueryItem = {
  partKey: string;
  usages: PartKitUsageSchemaList_a9993e3 | null | undefined;
};

type KitMembershipQueryResult = KitMembershipQueryItem[];

type KitMembershipQueryKey = [typeof KIT_MEMBERSHIP_QUERY_KEY[number], { partKeys: string[] }];

const INDICATOR_STALE_TIME = 60_000;
const INDICATOR_GC_TIME = 5 * 60_000;

export type PartKitStatus = 'active' | 'archived';

export interface PartKitUsageSummary {
  kitId: number;
  kitName: string;
  status: PartKitStatus;
  buildTarget: number;
  requiredPerUnit: number;
  reservedQuantity: number;
  updatedAt: string;
}

export interface PartKitMembershipSummary {
  partKey: string;
  kits: PartKitUsageSummary[];
  hasMembership: boolean;
  activeCount: number;
  archivedCount: number;
  kitNames: string[];
}

function normalizePartKey(candidate: string): string | null {
  if (typeof candidate !== 'string') {
    return null;
  }
  const trimmed = candidate.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function kitMembershipQueryKey(partKeys: string[]): KitMembershipQueryKey {
  return [KIT_MEMBERSHIP_QUERY_KEY[0], { partKeys }] as const;
}

async function fetchKitMemberships(partKeys: string[]): Promise<KitMembershipQueryResult> {
  if (partKeys.length === 0) {
    return [];
  }

  const results = await Promise.all(
    partKeys.map(async (partKey) => {
      const { data, error } = await api.GET('/api/parts/{part_key}/kits', {
        params: { path: { part_key: partKey } },
      });
      if (error) {
        throw toApiError(error);
      }
      return {
        partKey,
        usages: data ?? [],
      };
    }),
  );

  return results;
}

function normalizeWhitespace(value: string): string {
  return value.trim();
}

function mapKitUsage(raw: PartKitUsageSchemaList_a9993e3_PartKitUsageSchema): PartKitUsageSummary {
  return {
    kitId: raw.kit_id,
    kitName: normalizeWhitespace(raw.kit_name ?? ''),
    status: raw.status,
    buildTarget: raw.build_target ?? 0,
    requiredPerUnit: raw.required_per_unit ?? 0,
    reservedQuantity: raw.reserved_quantity ?? 0,
    updatedAt: raw.updated_at,
  };
}

function sortKits(kits: PartKitUsageSummary[]): PartKitUsageSummary[] {
  return [...kits].sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === 'active' ? -1 : 1;
    }
    return a.kitName.localeCompare(b.kitName, undefined, { numeric: true, sensitivity: 'base' });
  });
}

function createSummary(partKey: string, kits: PartKitUsageSummary[]): PartKitMembershipSummary {
  const sortedKits = sortKits(kits);
  const activeCount = sortedKits.filter(kit => kit.status === 'active').length;
  const archivedCount = sortedKits.length - activeCount;
  const kitNames = sortedKits.map(kit => kit.kitName);
  return {
    partKey,
    kits: sortedKits,
    hasMembership: sortedKits.length > 0,
    activeCount,
    archivedCount,
    kitNames,
  };
}

function createEmptySummary(partKey: string): PartKitMembershipSummary {
  return {
    partKey,
    kits: [],
    hasMembership: false,
    activeCount: 0,
    archivedCount: 0,
    kitNames: [],
  };
}

function buildSummaryResults(
  originalKeys: string[],
  uniqueKeys: string[],
  response: KitMembershipQueryResult | undefined
): { ordered: PartKitMembershipSummary[]; byKey: Map<string, PartKitMembershipSummary> } {
  const byPartKey = new Map<string, PartKitMembershipSummary>();

  for (const key of uniqueKeys) {
    if (!byPartKey.has(key)) {
      byPartKey.set(key, createEmptySummary(key));
    }
  }

  for (const item of response ?? []) {
    const normalizedKey = normalizePartKey(item.partKey);
    if (!normalizedKey) {
      continue;
    }
    const rawUsages = Array.isArray(item.usages) ? item.usages : [];
    const kits = rawUsages.map(mapKitUsage);
    byPartKey.set(normalizedKey, createSummary(normalizedKey, kits));
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

  return { ordered, byKey: byPartKey };
}

export function usePartKitMemberships(partKey: string | undefined) {
  const lookup = useMembershipLookup<string, KitMembershipQueryResult, PartKitMembershipSummary>({
    keys: partKey,
    normalizeKey: normalizePartKey,
    queryKey: kitMembershipQueryKey,
    queryFn: fetchKitMemberships,
    buildSummaries: ({ originalKeys, uniqueKeys, response }) =>
      buildSummaryResults(originalKeys, uniqueKeys, response),
  });

  const fallbackKey = typeof partKey === 'string' ? normalizePartKey(partKey) ?? '' : '';
  const summary = lookup.summaries[0] ?? createEmptySummary(fallbackKey);

  const getReadyMetadata = useCallback(
    () => ({
      partKey: summary.partKey,
      activeCount: summary.activeCount,
      archivedCount: summary.archivedCount,
    }),
    [summary.activeCount, summary.archivedCount, summary.partKey],
  );

  const getErrorMetadata = useCallback(
    (error: unknown) => ({
      partKey: summary.partKey,
      message: error instanceof Error ? error.message : String(error ?? 'Unknown error'),
    }),
    [summary.partKey],
  );

  const getAbortedMetadata = useCallback(
    () => ({
      partKey: summary.partKey,
    }),
    [summary.partKey],
  );

  useListLoadingInstrumentation({
    scope: 'parts.detail.kits',
    isLoading: lookup.query.isLoading,
    isFetching: lookup.query.isFetching,
    error: lookup.query.error,
    getReadyMetadata,
    getErrorMetadata,
    getAbortedMetadata,
  });

  return {
    ...lookup.query,
    summary,
    kits: summary.kits,
    hasMembership: summary.hasMembership,
    activeCount: summary.activeCount,
    archivedCount: summary.archivedCount,
    partKey: summary.partKey,
  };
}

export function usePartKitMembershipIndicators(partKeys: string[] | undefined) {
  const lookup = useMembershipLookup<string, KitMembershipQueryResult, PartKitMembershipSummary>({
    keys: partKeys,
    normalizeKey: normalizePartKey,
    queryKey: kitMembershipQueryKey,
    queryFn: fetchKitMemberships,
    buildSummaries: ({ originalKeys, uniqueKeys, response }) =>
      buildSummaryResults(originalKeys, uniqueKeys, response),
    staleTime: INDICATOR_STALE_TIME,
    gcTime: INDICATOR_GC_TIME,
  });

  const indicatorStats = useMemo(() => {
    let activePartCount = 0;
    let membershipCount = 0;
    for (const summary of lookup.summaries) {
      if (summary.hasMembership) {
        activePartCount += 1;
        membershipCount += summary.kits.length;
      }
    }
    return { activePartCount, membershipCount };
  }, [lookup.summaries]);

  const getReadyMetadata = useCallback(
    () => ({
      partCount: lookup.uniqueKeys.length,
      activePartCount: indicatorStats.activePartCount,
      membershipCount: indicatorStats.membershipCount,
    }),
    [indicatorStats.activePartCount, indicatorStats.membershipCount, lookup.uniqueKeys.length],
  );

  const getErrorMetadata = useCallback(
    (error: unknown) => ({
      partCount: lookup.uniqueKeys.length,
      message: error instanceof Error ? error.message : String(error ?? 'Unknown error'),
    }),
    [lookup.uniqueKeys.length],
  );

  const getAbortedMetadata = useCallback(
    () => ({
      partCount: lookup.uniqueKeys.length,
    }),
    [lookup.uniqueKeys.length],
  );

  useListLoadingInstrumentation({
    scope: 'parts.list.kitIndicators',
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
    summaryByPartKey: lookup.summaryByKey,
    partKeys: lookup.keys,
    uniquePartKeys: lookup.uniqueKeys,
  };
}

export function invalidatePartKitMemberships(queryClient: QueryClient, partKeys: string | string[]): void {
  const normalized = normalizeMembershipKeys(partKeys, normalizePartKey);
  if (normalized.unique.length === 0) {
    return;
  }

  queryClient.invalidateQueries({
    predicate: (query) => {
      const key = query.queryKey;
      if (!Array.isArray(key)) {
        return false;
      }
      if (key[0] !== KIT_MEMBERSHIP_QUERY_KEY[0]) {
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

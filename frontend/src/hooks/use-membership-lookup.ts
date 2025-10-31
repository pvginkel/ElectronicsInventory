import { useMemo } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

export interface NormalizedMembershipKeys<TKey> {
  original: TKey[];
  unique: TKey[];
}

export function normalizeMembershipKeys<TKey>(
  input: TKey | TKey[] | undefined,
  normalizeKey: (key: TKey) => TKey | null | undefined
): NormalizedMembershipKeys<TKey> {
  if (input === undefined || input === null) {
    return { original: [], unique: [] };
  }

  const raw = Array.isArray(input) ? input : [input];
  const original: TKey[] = [];
  const unique: TKey[] = [];
  const seen = new Set<TKey>();

  for (const candidate of raw) {
    const normalized = normalizeKey(candidate);
    if (normalized === null || normalized === undefined) {
      continue;
    }
    original.push(normalized);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      unique.push(normalized);
    }
  }

  return { original, unique };
}

export interface MembershipLookupConfig<TKey, TResponse, TSummary> {
  keys: TKey | TKey[] | undefined;
  includeDone?: boolean;
  enabled?: boolean;
  staleTime?: number;
  gcTime?: number;
  normalizeKey: (key: TKey) => TKey | null | undefined;
  queryKey: (uniqueKeys: TKey[], includeDone: boolean) => readonly unknown[];
  queryFn: (uniqueKeys: TKey[], includeDone: boolean) => Promise<TResponse>;
  buildSummaries: (config: {
    originalKeys: TKey[];
    uniqueKeys: TKey[];
    response: TResponse | undefined;
    includeDone: boolean;
  }) => {
    ordered: TSummary[];
    byKey: Map<TKey, TSummary>;
  };
}

export interface MembershipLookupResult<TKey, TResponse, TSummary> {
  keys: TKey[];
  uniqueKeys: TKey[];
  summaries: TSummary[];
  summaryByKey: Map<TKey, TSummary>;
  query: UseQueryResult<TResponse, Error>;
}

export function useMembershipLookup<TKey, TResponse, TSummary>(
  config: MembershipLookupConfig<TKey, TResponse, TSummary>
): MembershipLookupResult<TKey, TResponse, TSummary> {
  const {
    keys,
    includeDone: includeDoneOption,
    enabled,
    staleTime,
    gcTime,
    normalizeKey,
    queryKey: queryKeyFactory,
    queryFn,
    buildSummaries,
  } = config;

  const includeDone = includeDoneOption ?? false;

  const normalized = useMemo(
    () => normalizeMembershipKeys(keys, normalizeKey),
    [keys, normalizeKey]
  );

  const hasKeys = normalized.unique.length > 0;

  const queryKey = useMemo(
    () => queryKeyFactory(normalized.unique, includeDone),
    [queryKeyFactory, includeDone, normalized.unique]
  );

  const query = useQuery<TResponse, Error>({
    queryKey,
    queryFn: () => queryFn(normalized.unique, includeDone),
    enabled: (enabled ?? true) && hasKeys,
    staleTime,
    gcTime,
  });

  const { ordered, byKey } = useMemo(
    () =>
      buildSummaries({
        originalKeys: normalized.original,
        uniqueKeys: normalized.unique,
        response: query.data,
        includeDone,
      }),
    [buildSummaries, includeDone, normalized.original, normalized.unique, query.data]
  );

  return {
    keys: normalized.original,
    uniqueKeys: normalized.unique,
    summaries: ordered,
    summaryByKey: byKey,
    query,
  };
}

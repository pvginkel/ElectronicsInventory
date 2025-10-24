import { useCallback, useMemo } from 'react';
import { useQueries, type UseQueryResult } from '@tanstack/react-query';
import { api } from '@/lib/api/generated/client';
import { toApiError } from '@/lib/api/api-error';
import {
  buildLocationKey,
  createAvailabilityErrorDetails,
  mapAvailabilityResponse,
  type PickListAvailabilityErrorDetail,
  type PickListAvailabilityResponse,
  type PickListPartLocationAvailability,
} from '@/types/pick-lists';

const AVAILABILITY_QUERY_PREFIX = ['pickLists', 'availability'] as const;

function availabilityQueryKey(partKey: string) {
  return [...AVAILABILITY_QUERY_PREFIX, partKey] as const;
}

async function fetchPartLocations(partKey: string): Promise<PickListAvailabilityResponse> {
  const { data, error } = await api.GET('/api/parts/{part_key}/locations', {
    params: {
      path: { part_key: partKey },
    },
  });

  if (error) {
    throw toApiError(error);
  }

  return data;
}

interface UsePickListAvailabilityOptions {
  enabled?: boolean;
}

export interface UsePickListAvailabilityResult {
  queries: UseQueryResult<PickListAvailabilityResponse, unknown>[];
  availabilityByPartKey: Map<string, PickListPartLocationAvailability>;
  errorDetails: PickListAvailabilityErrorDetail[];
  isLoading: boolean;
  isFetching: boolean;
  hasError: boolean;
  hasData: boolean;
  getReadyMetadata: () => { partKeyCount: number; locationCount: number } | undefined;
  getErrorMetadata: (error: unknown) => { partKeys: PickListAvailabilityErrorDetail[] } | undefined;
}

export function usePickListAvailability(
  partKeys: string[],
  options?: UsePickListAvailabilityOptions,
): UsePickListAvailabilityResult {
  const filteredKeys = useMemo(
    () => partKeys.filter(key => typeof key === 'string' && key.trim().length > 0),
    [partKeys]
  );

  const uniquePartKeys = useMemo(() => Array.from(new Set(filteredKeys)), [filteredKeys]);
  const queriesEnabled = options?.enabled ?? true;

  const queries = useQueries({
    queries: uniquePartKeys.map(partKey => ({
      queryKey: availabilityQueryKey(partKey),
      queryFn: () => fetchPartLocations(partKey),
      enabled: queriesEnabled,
      staleTime: 30_000,
      gcTime: 5 * 60_000,
    })),
  }) as UseQueryResult<PickListAvailabilityResponse, unknown>[];

  const availabilityByPartKey = useMemo(() => {
    const map = new Map<string, PickListPartLocationAvailability>();

    uniquePartKeys.forEach((partKey, index) => {
      const query = queries[index];
      if (!query || query.status !== 'success') {
        return;
      }
      map.set(partKey, mapAvailabilityResponse(partKey, query.data));
    });

    return map;
  }, [queries, uniquePartKeys]);

  const errorEntries = useMemo(() => {
    const entries: Array<[string, unknown]> = [];

    uniquePartKeys.forEach((partKey, index) => {
      const query = queries[index];
      if (!query || query.status !== 'error') {
        return;
      }
      entries.push([partKey, query.error]);
    });

    return entries;
  }, [queries, uniquePartKeys]);

  const errorDetails = useMemo(
    () => createAvailabilityErrorDetails(errorEntries),
    [errorEntries]
  );

  const hasError = errorDetails.length > 0;
  const hasData = availabilityByPartKey.size > 0;

  const isLoading = uniquePartKeys.length > 0 && queries.some(query => query.status === 'pending');
  const isFetching = uniquePartKeys.length > 0 && queries.some(query => query.fetchStatus === 'fetching');

  const getReadyMetadata = useCallback(() => {
    if (!hasData) {
      return undefined;
    }

    let locationCount = 0;
    availabilityByPartKey.forEach(availability => {
      locationCount += availability.locations.length;
    });

    return {
      partKeyCount: availabilityByPartKey.size,
      locationCount,
    };
  }, [availabilityByPartKey, hasData]);

  const getErrorMetadata = useCallback(() => {
    if (!hasError) {
      return undefined;
    }

    return {
      partKeys: errorDetails,
    };
  }, [errorDetails, hasError]);

  return {
    queries,
    availabilityByPartKey,
    errorDetails,
    isLoading,
    isFetching,
    hasError,
    hasData,
    getReadyMetadata,
    getErrorMetadata,
  };
}

export function getLineAvailabilityQuantity(
  availability: Map<string, PickListPartLocationAvailability>,
  partKey: string,
  boxNo: number,
  locNo: number,
): number | null {
  const partAvailability = availability.get(partKey);
  if (!partAvailability) {
    return null;
  }

  const quantity = partAvailability.byLocationKey.get(buildLocationKey(boxNo, locNo));
  return typeof quantity === 'number' ? quantity : null;
}

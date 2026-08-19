import { useCallback, useMemo } from 'react';
import { useGetKitsByKitId } from '@/lib/api/generated/hooks';
import {
  mapKitDetail,
  summarizeKitContents,
  type KitContentAggregates,
  type KitContentRow,
  type KitDetail,
  type KitStatus,
} from '@/types/kits';

export interface UseKitDetailResult {
  kitId: number | null;
  isKitIdValid: boolean;
  query: ReturnType<typeof useGetKitsByKitId>;
  detail: KitDetail | undefined;
  contents: KitContentRow[];
  aggregates: KitContentAggregates;
  getDetailReadyMetadata: () => { kitId: number; status: KitStatus; contentCount: number } | undefined;
  getDetailErrorMetadata: (error: unknown) => { kitId: number | null; message: string };
  getDetailAbortedMetadata: () => { kitId: number | null; status: 'aborted' };
  getContentsReadyMetadata: () =>
    | { kitId: number; contentCount: number; total: number; available: number; shortfallCount: number }
    | undefined;
  getContentsErrorMetadata: (error: unknown) => { kitId: number | null; message: string };
  getContentsAbortedMetadata: () => { kitId: number | null; status: 'aborted' };
}

export function buildKitDetailQueryKey(kitId: number) {
  return ['getKitsByKitId', { path: { kit_id: kitId } }] as const;
}

/**
 * Fetch kit detail payload and map into domain-friendly structures for UI consumption.
 */
export function useKitDetail(kitIdParam: number | string | undefined): UseKitDetailResult {
  const normalizedKitId = useMemo(() => normalizeKitId(kitIdParam), [kitIdParam]);
  const isKitIdValid = normalizedKitId !== null;
  const query = useGetKitsByKitId(
    isKitIdValid ? { path: { kit_id: normalizedKitId } } : undefined,
    {
      enabled: isKitIdValid,
    }
  );

  const detail = useMemo<KitDetail | undefined>(
    () => (query.data ? mapKitDetail(query.data) : undefined),
    [query.data]
  );

  const contents = useMemo<KitContentRow[]>(
    () => detail?.contents ?? [],
    [detail]
  );

  const aggregates = useMemo<KitContentAggregates>(
    () => summarizeKitContents(contents),
    [contents]
  );

  const getDetailReadyMetadata = useCallback(() => {
    if (!detail) {
      return undefined;
    }
    return {
      kitId: detail.id,
      status: detail.status,
      contentCount: detail.contents.length,
    };
  }, [detail]);

  const getDetailErrorMetadata = useCallback(
    (error: unknown) => ({
      kitId: normalizedKitId,
      message: error instanceof Error ? error.message : String(error),
    }),
    [normalizedKitId]
  );

  const getDetailAbortedMetadata = useCallback(
    () => ({
      kitId: normalizedKitId,
      status: 'aborted' as const,
    }),
    [normalizedKitId]
  );

  const getContentsReadyMetadata = useCallback(() => {
    if (!detail) {
      return undefined;
    }
    return {
      kitId: detail.id,
      contentCount: aggregates.contentCount,
      total: aggregates.totalRequired,
      available: aggregates.totalAvailable,
      shortfallCount: aggregates.shortfallCount,
    };
  }, [aggregates, detail]);

  const getContentsErrorMetadata = useCallback(
    (error: unknown) => ({
      kitId: normalizedKitId,
      message: error instanceof Error ? error.message : String(error),
    }),
    [normalizedKitId]
  );

  const getContentsAbortedMetadata = useCallback(
    () => ({
      kitId: normalizedKitId,
      status: 'aborted' as const,
    }),
    [normalizedKitId]
  );

  return {
    kitId: normalizedKitId,
    isKitIdValid,
    query,
    detail,
    contents,
    aggregates,
    getDetailReadyMetadata,
    getDetailErrorMetadata,
    getDetailAbortedMetadata,
    getContentsReadyMetadata,
    getContentsErrorMetadata,
    getContentsAbortedMetadata,
  };
}

function normalizeKitId(candidate: number | string | undefined): number | null {
  if (typeof candidate === 'number') {
    if (!Number.isFinite(candidate)) {
      return null;
    }
    const truncated = Math.trunc(candidate);
    return truncated > 0 ? truncated : null;
  }

  if (typeof candidate === 'string') {
    const trimmed = candidate.trim();
    if (trimmed.length === 0) {
      return null;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      return null;
    }
    const truncated = Math.trunc(parsed);
    return truncated > 0 ? truncated : null;
  }

  return null;
}

import { useCallback, useMemo } from 'react';
import { useGetPickListsByPickListId } from '@/lib/api/generated/hooks';
import {
  groupPickListLines,
  mapPickListDetail,
  type PickListDetail,
  type PickListLineGroup,
  type PickListStatus,
} from '@/types/pick-lists';

export function createPickListDetailParams(pickListId: number) {
  return {
    path: { pick_list_id: pickListId },
  } as const;
}

export function buildPickListDetailQueryKey(pickListId: number) {
  return ['getPickListsByPickListId', createPickListDetailParams(pickListId)] as const;
}

export interface UsePickListDetailResult {
  pickListId: number | null;
  isPickListIdValid: boolean;
  query: ReturnType<typeof useGetPickListsByPickListId>;
  detail: PickListDetail | undefined;
  lineGroups: PickListLineGroup[];
  uniquePartKeys: string[];
  getDetailReadyMetadata: () =>
    | {
        pickListId: number;
        kitId: number;
        status: PickListStatus;
        lineCount: number;
        requestedUnits: number;
      }
    | undefined;
  getDetailErrorMetadata: (error: unknown) => { pickListId: number | null; message: string };
  getDetailAbortedMetadata: () => { pickListId: number | null; status: 'aborted' };
  getLinesReadyMetadata: () =>
    | {
        pickListId: number;
        lineCount: number;
        openLineCount: number;
        totalQuantityToPick: number;
        remainingQuantity: number;
      }
    | undefined;
  getLinesErrorMetadata: (error: unknown) => { pickListId: number | null; message: string };
  getLinesAbortedMetadata: () => { pickListId: number | null; status: 'aborted' };
}

export function usePickListDetail(pickListIdParam: number | string | undefined): UsePickListDetailResult {
  const normalizedPickListId = useMemo(() => normalizePickListId(pickListIdParam), [pickListIdParam]);
  const isPickListIdValid = normalizedPickListId !== null;

  const query = useGetPickListsByPickListId(
    isPickListIdValid
      ? {
          ...createPickListDetailParams(normalizedPickListId),
        }
      : undefined,
    {
      enabled: isPickListIdValid,
    }
  );

  const detail = useMemo<PickListDetail | undefined>(
    () => (query.data ? mapPickListDetail(query.data) : undefined),
    [query.data]
  );

  const lineGroups = useMemo<PickListLineGroup[]>(
    () => groupPickListLines(detail?.lines ?? []),
    [detail?.lines]
  );

  const uniquePartKeys = useMemo<string[]>(() => {
    if (!detail) {
      return [];
    }
    const keys = new Set<string>();
    for (const line of detail.lines) {
      keys.add(line.kitContent.partKey);
    }
    return Array.from(keys);
  }, [detail]);

  const getDetailReadyMetadata = useCallback(() => {
    if (!detail) {
      return undefined;
    }

    return {
      pickListId: detail.id,
      kitId: detail.kitId,
      status: detail.status,
      lineCount: detail.lineCount,
      requestedUnits: detail.requestedUnits,
    };
  }, [detail]);

  const getDetailErrorMetadata = useCallback(
    (error: unknown) => ({
      pickListId: normalizedPickListId,
      message: error instanceof Error ? error.message : String(error),
    }),
    [normalizedPickListId]
  );

  const getDetailAbortedMetadata = useCallback(
    () => ({
      pickListId: normalizedPickListId,
      status: 'aborted' as const,
    }),
    [normalizedPickListId]
  );

  const getLinesReadyMetadata = useCallback(() => {
    if (!detail) {
      return undefined;
    }

    return {
      pickListId: detail.id,
      lineCount: detail.lineCount,
      openLineCount: detail.openLineCount,
      totalQuantityToPick: detail.totalQuantityToPick,
      remainingQuantity: detail.remainingQuantity,
    };
  }, [detail]);

  const getLinesErrorMetadata = useCallback(
    (error: unknown) => ({
      pickListId: normalizedPickListId,
      message: error instanceof Error ? error.message : String(error),
    }),
    [normalizedPickListId]
  );

  const getLinesAbortedMetadata = useCallback(
    () => ({
      pickListId: normalizedPickListId,
      status: 'aborted' as const,
    }),
    [normalizedPickListId]
  );

  return {
    pickListId: normalizedPickListId,
    isPickListIdValid,
    query,
    detail,
    lineGroups,
    uniquePartKeys,
    getDetailReadyMetadata,
    getDetailErrorMetadata,
    getDetailAbortedMetadata,
    getLinesReadyMetadata,
    getLinesErrorMetadata,
    getLinesAbortedMetadata,
  };
}

function normalizePickListId(candidate: number | string | undefined): number | null {
  if (typeof candidate === 'number') {
    if (!Number.isFinite(candidate)) {
      return null;
    }
    const normalized = Math.trunc(candidate);
    return normalized > 0 ? normalized : null;
  }

  if (typeof candidate === 'string') {
    const trimmed = candidate.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      return null;
    }
    const normalized = Math.trunc(parsed);
    return normalized > 0 ? normalized : null;
  }

  return null;
}

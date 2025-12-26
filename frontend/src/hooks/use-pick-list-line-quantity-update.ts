import { useCallback, useMemo, useRef, useState } from 'react';
import { useQueryClient, type Query } from '@tanstack/react-query';

import {
  usePatchPickListsLinesByPickListIdAndLineId,
  type KitPickListDetailSchema_b247181,
  type PatchPickListsLinesByPickListIdAndLineIdParameters,
} from '@/lib/api/generated/hooks';
import { useToast } from '@/hooks/use-toast';
import { buildPickListDetailQueryKey } from '@/hooks/use-pick-list-detail';
import {
  buildPickListAvailabilityQueryKey,
  PICK_LIST_AVAILABILITY_QUERY_KEY_PREFIX,
} from '@/hooks/use-pick-list-availability';
import { applyPickListLineQuantityPatch, mapPickListDetail, type PickListStatus } from '@/types/pick-lists';
import { useUiStateInstrumentation } from '@/lib/test/ui-state';

interface QuantityUpdateMetadata extends Record<string, unknown> {
  pickListId: number;
  kitId?: number;
  lineId: number;
  action: 'updateQuantity';
  oldQuantity: number;
  newQuantity: number;
  timestamp: string;
}

interface QuantityUpdateReadyMetadata extends QuantityUpdateMetadata {
  status: PickListStatus;
  openLineCount: number;
  completedLineCount: number;
  totalQuantityToPick: number;
  remainingQuantity: number;
}

interface QuantityUpdateErrorMetadata extends QuantityUpdateMetadata {
  message: string;
}

interface MutationContext {
  previousDetail?: KitPickListDetailSchema_b247181;
  metadata: QuantityUpdateMetadata;
}

type UpdateMutationVariables = {
  path: PatchPickListsLinesByPickListIdAndLineIdParameters['path'];
  body: { quantity_to_pick: number };
};

interface UsePickListLineQuantityUpdateArgs {
  pickListId: number | null;
  kitId: number | undefined;
}

export interface UsePickListLineQuantityUpdateResult {
  updateQuantity: (lineId: number, newQuantity: number) => Promise<void>;
  isPending: boolean;
  pendingLineId: number | null;
}

export function usePickListLineQuantityUpdate({
  pickListId,
  kitId,
}: UsePickListLineQuantityUpdateArgs): UsePickListLineQuantityUpdateResult {
  const queryClient = useQueryClient();
  const toast = useToast();

  const [pendingLineId, setPendingLineId] = useState<number | null>(null);
  const readyMetadataRef = useRef<QuantityUpdateReadyMetadata | null>(null);
  const errorMetadataRef = useRef<QuantityUpdateErrorMetadata | null>(null);

  const queryKey = useMemo(
    () => (typeof pickListId === 'number' && Number.isFinite(pickListId) ? buildPickListDetailQueryKey(pickListId) : null),
    [pickListId],
  );

  const buildMetadata = useCallback(
    (lineId: number, oldQuantity: number, newQuantity: number): QuantityUpdateMetadata | null => {
      if (typeof pickListId !== 'number') {
        return null;
      }
      return {
        pickListId,
        kitId,
        lineId,
        action: 'updateQuantity',
        oldQuantity,
        newQuantity,
        timestamp: new Date().toISOString(),
      };
    },
    [pickListId, kitId],
  );

  const resetMetadata = useCallback(() => {
    readyMetadataRef.current = null;
    errorMetadataRef.current = null;
  }, []);

  const markReady = useCallback((metadata: QuantityUpdateReadyMetadata | null) => {
    readyMetadataRef.current = metadata;
    errorMetadataRef.current = null;
  }, []);

  const markError = useCallback((metadata: QuantityUpdateErrorMetadata | null) => {
    errorMetadataRef.current = metadata;
    readyMetadataRef.current = null;
  }, []);

  const invalidateMembershipQueries = useCallback(
    (resolvedKitId: number | undefined) => {
      if (typeof resolvedKitId !== 'number' || !Number.isFinite(resolvedKitId)) {
        return;
      }

      queryClient.invalidateQueries({
        predicate: (query: Query) => {
          const key = query.queryKey;
          if (!Array.isArray(key) || key.length === 0) {
            return false;
          }
          if (key[0] !== 'kits.pickListMemberships') {
            return false;
          }
          const params = key[1];
          if (!params || typeof params !== 'object') {
            return true;
          }
          const kitIds = (params as { kitIds?: number[] }).kitIds;
          if (!Array.isArray(kitIds)) {
            return true;
          }
          return kitIds.includes(resolvedKitId);
        },
      });
    },
    [queryClient],
  );

  const invalidateKitDetailQueries = useCallback(
    (resolvedKitId: number | undefined) => {
      if (typeof resolvedKitId !== 'number' || !Number.isFinite(resolvedKitId)) {
        return;
      }
      queryClient.invalidateQueries({
        predicate: (query: Query) => {
          const key = query.queryKey;
          if (!Array.isArray(key) || key.length === 0) {
            return false;
          }
          if (key[0] !== 'getKitsByKitId') {
            return false;
          }
          const params = key[1] as { path?: { kit_id?: number } } | undefined;
          return params?.path?.kit_id === resolvedKitId;
        },
      });
    },
    [queryClient],
  );

  const invalidateKitOverviewQueries = useCallback(() => {
    queryClient.invalidateQueries({
      predicate: (query: Query) => {
        const key = query.queryKey;
        return Array.isArray(key) && key[0] === 'getKits';
      },
    });
  }, [queryClient]);

  const invalidateAvailabilityQueries = useCallback(
    (lines?: KitPickListDetailSchema_b247181['lines']) => {
      if (!lines || lines.length === 0) {
        queryClient.invalidateQueries({
          queryKey: PICK_LIST_AVAILABILITY_QUERY_KEY_PREFIX,
          exact: false,
        });
        return;
      }

      const partKeys = new Set<string>();
      for (const line of lines) {
        const partKey = line?.kit_content?.part_key;
        if (typeof partKey === 'string' && partKey.trim().length > 0) {
          partKeys.add(partKey);
        }
      }

      if (partKeys.size === 0) {
        queryClient.invalidateQueries({
          queryKey: PICK_LIST_AVAILABILITY_QUERY_KEY_PREFIX,
          exact: false,
        });
        return;
      }

      partKeys.forEach(partKey => {
        queryClient.invalidateQueries({
          queryKey: buildPickListAvailabilityQueryKey(partKey),
        });
      });
    },
    [queryClient],
  );

  useUiStateInstrumentation('pickLists.detail.quantityEdit', {
    isLoading: Boolean(pendingLineId),
    getReadyMetadata: () => readyMetadataRef.current ?? undefined,
    getErrorMetadata: () => errorMetadataRef.current ?? undefined,
  });

  const updateMutation = usePatchPickListsLinesByPickListIdAndLineId({
    mutationKey: ['pickLists.detail', 'updateQuantity'],
    onMutate: async (variables): Promise<MutationContext | undefined> => {
      if (!queryKey) {
        return undefined;
      }

      const typedVariables = variables as UpdateMutationVariables;
      const lineId = typedVariables.path.line_id;
      const newQuantity = typedVariables.body.quantity_to_pick;

      // Get the current detail to find the old quantity
      const previousDetail = queryClient.getQueryData<KitPickListDetailSchema_b247181>(queryKey);
      if (!previousDetail) {
        return undefined;
      }

      const targetLine = previousDetail.lines?.find(candidate => candidate.id === lineId);
      const oldQuantity = targetLine?.quantity_to_pick ?? 0;

      const metadata = buildMetadata(lineId, oldQuantity, newQuantity);
      if (!metadata) {
        return undefined;
      }

      resetMetadata();
      setPendingLineId(lineId);

      await queryClient.cancelQueries({ queryKey });

      // Apply optimistic update
      const optimisticDetail = applyPickListLineQuantityPatch(previousDetail, lineId, newQuantity, {
        updatedAt: metadata.timestamp,
      });
      queryClient.setQueryData(queryKey, optimisticDetail);

      return {
        previousDetail,
        metadata,
      } satisfies MutationContext;
    },
    onSuccess: (response, _variables, context) => {
      const mutationContext = context as MutationContext | undefined;
      if (!queryKey || !mutationContext) {
        setPendingLineId(null);
        return;
      }

      const detailResponse = response as KitPickListDetailSchema_b247181;
      queryClient.setQueryData(queryKey, detailResponse);

      const detail = mapPickListDetail(detailResponse);
      const resolvedKitId = typeof detail.kitId === 'number' ? detail.kitId : kitId;

      const readyMetadata: QuantityUpdateReadyMetadata = {
        ...mutationContext.metadata,
        kitId: resolvedKitId ?? mutationContext.metadata.kitId,
        status: detail.status,
        openLineCount: detail.openLineCount,
        completedLineCount: detail.completedLineCount,
        totalQuantityToPick: detail.totalQuantityToPick,
        remainingQuantity: detail.remainingQuantity,
      };
      markReady(readyMetadata);

      invalidateMembershipQueries(resolvedKitId);
      invalidateKitDetailQueries(resolvedKitId);
      invalidateKitOverviewQueries();
      invalidateAvailabilityQueries(detailResponse.lines);

      setPendingLineId(null);
    },
    onError: (error, _variables, context) => {
      const mutationContext = context as MutationContext | undefined;
      if (!mutationContext || !queryKey) {
        setPendingLineId(null);
        return;
      }

      // Rollback optimistic update
      if (mutationContext.previousDetail) {
        queryClient.setQueryData(queryKey, mutationContext.previousDetail);
      }

      const message = error instanceof Error ? error.message : String(error ?? 'Unknown error');
      const errorMetadata: QuantityUpdateErrorMetadata = {
        ...mutationContext.metadata,
        message,
      };
      markError(errorMetadata);
      toast.showException('Failed to update quantity', error);
      setPendingLineId(null);
    },
    onSettled: () => {
      if (!queryKey) {
        return;
      }
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const updateQuantity = useCallback(
    async (lineId: number, newQuantity: number) => {
      if (typeof pickListId !== 'number' || !Number.isFinite(pickListId)) {
        return;
      }

      if (pendingLineId === lineId) {
        return;
      }

      await updateMutation.mutateAsync({
        path: {
          pick_list_id: pickListId,
          line_id: lineId,
        },
        body: {
          quantity_to_pick: newQuantity,
        },
      });
    },
    [pickListId, updateMutation, pendingLineId],
  );

  const isPending = updateMutation.isPending;

  return {
    updateQuantity,
    isPending,
    pendingLineId,
  };
}

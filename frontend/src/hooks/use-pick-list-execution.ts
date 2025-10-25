import { useCallback, useMemo, useRef, useState } from 'react';
import { useQueryClient, type Query } from '@tanstack/react-query';

import {
  usePostPickListsLinesPickByPickListIdAndLineId,
  usePostPickListsLinesUndoByPickListIdAndLineId,
  type KitPickListDetailSchema_b247181,
  type PostPickListsLinesPickByPickListIdAndLineIdParameters,
  type PostPickListsLinesUndoByPickListIdAndLineIdParameters,
} from '@/lib/api/generated/hooks';
import { useToast } from '@/hooks/use-toast';
import { buildPickListDetailQueryKey } from '@/hooks/use-pick-list-detail';
import {
  applyPickListLineStatusPatch,
  mapPickListDetail,
  type PickListStatus,
} from '@/types/pick-lists';
import { useUiStateInstrumentation } from '@/lib/test/ui-state';

type ExecutionAction = 'pick' | 'undo';

interface ExecutionProgress {
  action: ExecutionAction;
  lineId: number;
}

interface ExecutionMetadata extends Record<string, unknown> {
  pickListId: number;
  kitId?: number;
  lineId: number;
  action: ExecutionAction;
  timestamp: string;
}

interface ExecutionReadyMetadata extends ExecutionMetadata {
  status: PickListStatus;
  openLineCount: number;
  completedLineCount: number;
}

interface ExecutionErrorMetadata extends ExecutionMetadata {
  message: string;
}

interface MutationContext {
  previousDetail?: KitPickListDetailSchema_b247181;
  previousStatus?: PickListStatus;
  metadata: ExecutionMetadata;
}

type PickMutationVariables = {
  path: PostPickListsLinesPickByPickListIdAndLineIdParameters['path'];
};

type UndoMutationVariables = {
  path: PostPickListsLinesUndoByPickListIdAndLineIdParameters['path'];
};

interface UsePickListExecutionArgs {
  pickListId: number | null;
  kitId?: number;
}

export interface UsePickListExecutionResult {
  isExecuting: boolean;
  pendingLineId: number | null;
  pendingAction: ExecutionAction | null;
  pickLine: (lineId: number) => Promise<void>;
  undoLine: (lineId: number) => Promise<void>;
}

export function usePickListExecution({ pickListId, kitId }: UsePickListExecutionArgs): UsePickListExecutionResult {
  const queryClient = useQueryClient();
  const toast = useToast();

  const [progress, setProgress] = useState<ExecutionProgress | null>(null);
  const readyMetadataRef = useRef<ExecutionReadyMetadata | null>(null);
  const errorMetadataRef = useRef<ExecutionErrorMetadata | null>(null);

  const queryKey = useMemo(
    () => (typeof pickListId === 'number' && Number.isFinite(pickListId) ? buildPickListDetailQueryKey(pickListId) : null),
    [pickListId],
  );

  const buildMetadata = useCallback(
    (action: ExecutionAction, lineId: number): ExecutionMetadata | null => {
      if (typeof pickListId !== 'number') {
        return null;
      }
      return {
        pickListId,
        kitId,
        lineId,
        action,
        timestamp: new Date().toISOString(),
      };
    },
    [pickListId, kitId],
  );

  const resetMetadata = useCallback(() => {
    readyMetadataRef.current = null;
    errorMetadataRef.current = null;
  }, []);

  const markReady = useCallback((metadata: ExecutionReadyMetadata | null) => {
    readyMetadataRef.current = metadata;
    errorMetadataRef.current = null;
  }, []);

  const markError = useCallback((metadata: ExecutionErrorMetadata | null) => {
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

  useUiStateInstrumentation('pickLists.detail.execution', {
    isLoading: Boolean(progress),
    getReadyMetadata: () => readyMetadataRef.current ?? undefined,
    getErrorMetadata: () => errorMetadataRef.current ?? undefined,
  });

  const pickMutation = usePostPickListsLinesPickByPickListIdAndLineId({
    mutationKey: ['pickLists.detail', 'pick'],
    onMutate: async (variables): Promise<MutationContext | undefined> => {
      if (!queryKey) {
        return undefined;
      }

      const typedVariables = variables as PickMutationVariables;
      const lineId = typedVariables.path.line_id;
      const metadata = buildMetadata('pick', lineId);
      if (!metadata) {
        return undefined;
      }

      resetMetadata();
      setProgress({ action: 'pick', lineId });

      await queryClient.cancelQueries({ queryKey });
      const previousDetail = queryClient.getQueryData<KitPickListDetailSchema_b247181>(queryKey);

      if (previousDetail) {
        const optimisticDetail = applyPickListLineStatusPatch(previousDetail, lineId, 'completed', {
          updatedAt: metadata.timestamp,
        });
        queryClient.setQueryData(queryKey, optimisticDetail);
      }

      return {
        previousDetail,
        previousStatus: previousDetail?.status as PickListStatus | undefined,
        metadata,
      } satisfies MutationContext;
    },
    onSuccess: (response, _variables, context) => {
      const mutationContext = context as MutationContext | undefined;
      if (!queryKey || !mutationContext) {
        setProgress(null);
        return;
      }

      const detailResponse = response as KitPickListDetailSchema_b247181;
      queryClient.setQueryData(queryKey, detailResponse);

      const detail = mapPickListDetail(detailResponse);
      const resolvedKitId = typeof detail.kitId === 'number' ? detail.kitId : kitId;

      const readyMetadata: ExecutionReadyMetadata = {
        ...mutationContext.metadata,
        kitId: resolvedKitId ?? mutationContext.metadata.kitId,
        status: detail.status,
        openLineCount: detail.openLineCount,
        completedLineCount: detail.completedLineCount,
      };
      markReady(readyMetadata);

      if (mutationContext.previousStatus !== 'completed' && detail.status === 'completed') {
        toast.showSuccess('Pick list completed');
      }

      invalidateMembershipQueries(resolvedKitId);
      invalidateKitDetailQueries(resolvedKitId);
      invalidateKitOverviewQueries();

      setProgress(null);
    },
    onError: (error, _variables, context) => {
      const mutationContext = context as MutationContext | undefined;
      if (!mutationContext || !queryKey) {
        setProgress(null);
        return;
      }

      if (mutationContext.previousDetail) {
        queryClient.setQueryData(queryKey, mutationContext.previousDetail);
      }

      const message = error instanceof Error ? error.message : String(error ?? 'Unknown error');
      const errorMetadata: ExecutionErrorMetadata = {
        ...mutationContext.metadata,
        message,
      };
      markError(errorMetadata);
      toast.showException('Failed to pick line', error);
      setProgress(null);
    },
    onSettled: () => {
      if (!queryKey) {
        return;
      }
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const undoMutation = usePostPickListsLinesUndoByPickListIdAndLineId({
    mutationKey: ['pickLists.detail', 'undo'],
    onMutate: async (variables): Promise<MutationContext | undefined> => {
      if (!queryKey) {
        return undefined;
      }

      const typedVariables = variables as UndoMutationVariables;
      const lineId = typedVariables.path.line_id;
      const metadata = buildMetadata('undo', lineId);
      if (!metadata) {
        return undefined;
      }

      resetMetadata();
      setProgress({ action: 'undo', lineId });

      await queryClient.cancelQueries({ queryKey });
      const previousDetail = queryClient.getQueryData<KitPickListDetailSchema_b247181>(queryKey);

      if (previousDetail) {
        const optimisticDetail = applyPickListLineStatusPatch(previousDetail, lineId, 'open', {
          updatedAt: metadata.timestamp,
          pickedAt: null,
          inventoryChangeId: null,
          completedAt: null,
        });
        queryClient.setQueryData(queryKey, optimisticDetail);
      }

      return {
        previousDetail,
        previousStatus: previousDetail?.status as PickListStatus | undefined,
        metadata,
      } satisfies MutationContext;
    },
    onSuccess: (response, _variables, context) => {
      const mutationContext = context as MutationContext | undefined;
      if (!queryKey || !mutationContext) {
        setProgress(null);
        return;
      }

      const detailResponse = response as KitPickListDetailSchema_b247181;
      queryClient.setQueryData(queryKey, detailResponse);

      const detail = mapPickListDetail(detailResponse);
      const resolvedKitId = typeof detail.kitId === 'number' ? detail.kitId : kitId;

      const readyMetadata: ExecutionReadyMetadata = {
        ...mutationContext.metadata,
        kitId: resolvedKitId ?? mutationContext.metadata.kitId,
        status: detail.status,
        openLineCount: detail.openLineCount,
        completedLineCount: detail.completedLineCount,
      };
      markReady(readyMetadata);

      invalidateMembershipQueries(resolvedKitId);
      invalidateKitDetailQueries(resolvedKitId);
      invalidateKitOverviewQueries();

      setProgress(null);
    },
    onError: (error, _variables, context) => {
      const mutationContext = context as MutationContext | undefined;
      if (!mutationContext || !queryKey) {
        setProgress(null);
        return;
      }

      if (mutationContext.previousDetail) {
        queryClient.setQueryData(queryKey, mutationContext.previousDetail);
      }

      const message = error instanceof Error ? error.message : String(error ?? 'Unknown error');
      const errorMetadata: ExecutionErrorMetadata = {
        ...mutationContext.metadata,
        message,
      };
      markError(errorMetadata);
      toast.showException('Failed to undo pick', error);
      setProgress(null);
    },
    onSettled: () => {
      if (!queryKey) {
        return;
      }
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const pickLine = useCallback(
    async (lineId: number) => {
      if (typeof pickListId !== 'number' || !Number.isFinite(pickListId)) {
        return;
      }

      await pickMutation.mutateAsync({
        path: {
          pick_list_id: pickListId,
          line_id: lineId,
        },
      });
    },
    [pickListId, pickMutation],
  );

  const undoLine = useCallback(
    async (lineId: number) => {
      if (typeof pickListId !== 'number' || !Number.isFinite(pickListId)) {
        return;
      }

      await undoMutation.mutateAsync({
        path: {
          pick_list_id: pickListId,
          line_id: lineId,
        },
      });
    },
    [pickListId, undoMutation],
  );

  const isExecuting = pickMutation.isPending || undoMutation.isPending || Boolean(progress);
  const pendingLineId = progress?.lineId ?? null;
  const pendingAction = progress?.action ?? null;

  return {
    isExecuting,
    pendingLineId,
    pendingAction,
    pickLine,
    undoLine,
  };
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { ConceptTable } from '@/components/shopping-lists/concept-table';
import { ConceptLineForm } from '@/components/shopping-lists/concept-line-form';
import { ConceptToolbar } from '@/components/shopping-lists/concept-toolbar';
import { SellerGroupList } from '@/components/shopping-lists/ready/seller-group-list';
import { OrderLineDialog } from '@/components/shopping-lists/ready/order-line-dialog';
import { OrderGroupDialog } from '@/components/shopping-lists/ready/order-group-dialog';
import { UpdateStockDialog } from '@/components/shopping-lists/ready/update-stock-dialog';
import { ReadyToolbar } from '@/components/shopping-lists/ready/ready-toolbar';
import { useListArchiveConfirm, useListDeleteConfirm } from '@/components/shopping-lists/list-delete-confirm';
import { useConfirm } from '@/hooks/use-confirm';
import {
  useShoppingListDetail,
  useSortedShoppingListLines,
  useUpdateShoppingListMutation,
  useMarkShoppingListReadyMutation,
  useDeleteShoppingListLineMutation,
  useOrderShoppingListLineMutation,
  useRevertShoppingListLineMutation,
  useOrderShoppingListGroupMutation,
  useUpdateShoppingListStatusMutation,
  useReceiveShoppingListLineMutation,
  useCompleteShoppingListLineMutation,
} from '@/hooks/use-shopping-lists';
import { usePostShoppingListsLinesByListId } from '@/lib/api/generated/hooks';
import type {
  ShoppingListConceptLine,
  ShoppingListLineSortKey,
  ShoppingListSellerGroup,
  ShoppingListLineReceiveAllocationInput,
  ShoppingListOverviewSummary,
  ShoppingListKitLink,
} from '@/types/shopping-lists';
import { useToast } from '@/hooks/use-toast';
import { useListLoadingInstrumentation } from '@/lib/test/query-instrumentation';
import { trackFormSubmit, trackFormSuccess, trackFormError } from '@/lib/test/form-instrumentation';
import { ConfirmDialog, type DialogContentProps } from '@/components/ui/dialog';
import { Route as ShoppingListsRoute } from '@/routes/shopping-lists/index';
import { DetailScreenLayout } from '@/components/layout/detail-screen-layout';
import { useShoppingListDetailHeaderSlots } from '@/components/shopping-lists/detail-header-slots';
import { useKitShoppingListUnlinkMutation } from '@/hooks/use-kit-shopping-list-links';
import { emitTestEvent } from '@/lib/test/event-emitter';
import { ApiError } from '@/lib/api/api-error';
import type { UiStateTestEvent } from '@/types/test-events';

const SORT_KEYS: ShoppingListLineSortKey[] = ['description', 'mpn', 'createdAt'];
const KIT_UNLINK_FLOW_SCOPE = 'shoppingLists.detail.kitUnlinkFlow';
type KitUnlinkFlowPhase = Extract<UiStateTestEvent['phase'], 'open' | 'submit' | 'success' | 'error'>;

function emitUiState(payload: Omit<UiStateTestEvent, 'timestamp'>) {
  emitTestEvent(payload);
}

export const Route = createFileRoute('/shopping-lists/$listId')({
  validateSearch: (search: Record<string, unknown>) => {
    const value = typeof search.sort === 'string' ? search.sort : undefined;
    const sort = SORT_KEYS.includes(value as ShoppingListLineSortKey)
      ? (value as ShoppingListLineSortKey)
      : 'description';
    const originSearch = typeof search.originSearch === 'string' ? search.originSearch : undefined;
    return { sort, originSearch };
  },
  component: ShoppingListDetailRoute,
});

interface OrderLineState {
  open: boolean;
  line: ShoppingListConceptLine | null;
  trigger: HTMLElement | null;
}

interface OrderGroupState {
  open: boolean;
  group: ShoppingListSellerGroup | null;
  trigger: HTMLElement | null;
}

interface UpdateStockState {
  open: boolean;
  lineId: number | null;
  trigger: HTMLElement | null;
}

function ShoppingListDetailRoute() {
  const params = Route.useParams();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const { showSuccess, showException, showWarning } = useToast();
  const queryClient = useQueryClient();

  const listId = Number(params.listId);
  const hasValidListId = Number.isFinite(listId);
  const normalizedListId = hasValidListId ? listId : 0;
  const sortKey = (search.sort as ShoppingListLineSortKey | undefined) ?? 'description';

  // Undo state for line deletion - using Map to support concurrent deletions
  const undoInFlightRef = useRef(false);
  interface DeletedLineSnapshot {
    lineId: number;
    listId: number;
    partId: number;
    partKey: string;
    needed: number;
    sellerId: number | null;
    note: string | null;
  }
  const deletedLineSnapshotsRef = useRef<Map<number, DeletedLineSnapshot>>(new Map());
  const handleListDeleted = useCallback((list: ShoppingListOverviewSummary) => {
    void list;
    void navigate({
      to: ShoppingListsRoute.fullPath,
      search: { search: search.originSearch ?? '' },
      replace: true,
    });
  }, [navigate, search.originSearch]);

  const {
    shoppingList,
    lines,
    sellerGroups,
    duplicateCheck,
    isLoading,
    isFetching,
    error,
    getReadyMetadata,
    getErrorMetadata,
    isCompleted: detailIsCompleted,
  } = useShoppingListDetail(hasValidListId ? listId : undefined);

  const sortedLines = useSortedShoppingListLines(lines, sortKey);
  const [lineFormOpen, setLineFormOpen] = useState(false);
  const [lineFormMode, setLineFormMode] = useState<'add' | 'edit'>('add');
  const [selectedLine, setSelectedLine] = useState<ShoppingListConceptLine | undefined>(undefined);
  const [duplicateNotice, setDuplicateNotice] = useState<{ lineId: number; partKey: string } | null>(null);
  const [highlightedLineId, setHighlightedLineId] = useState<number | null>(null);
  const [orderLineState, setOrderLineState] = useState<OrderLineState>({ open: false, line: null, trigger: null });
  const [orderGroupState, setOrderGroupState] = useState<OrderGroupState>({ open: false, group: null, trigger: null });
  const [updateStockState, setUpdateStockState] = useState<UpdateStockState>({ open: false, lineId: null, trigger: null });
  // Look up the current line from query data so it stays fresh after saves
  const updateStockLine = updateStockState.lineId !== null
    ? lines?.find((l) => l.id === updateStockState.lineId) ?? null
    : null;
  const [pendingLineIds, setPendingLineIds] = useState<Set<number>>(new Set());
  const [linkToUnlink, setLinkToUnlink] = useState<ShoppingListKitLink | null>(null);
  const [unlinkingLinkId, setUnlinkingLinkId] = useState<number | null>(null);
  const {
    confirmArchive: confirmReadyArchive,
    dialog: markDoneDialog,
    isArchiving: isMarkingDone,
  } = useListArchiveConfirm({ dialogTestId: 'shopping-lists.ready.archive-dialog' });
  const {
    confirmDelete: confirmListDelete,
    dialog: deleteListDialog,
    isDeleting: isDeletingList,
  } = useListDeleteConfirm({
    dialogTestId: 'shopping-lists.detail.delete-dialog',
    onDeleted: handleListDeleted,
  });

  // Confirmation hook for Ready state line deletion
  const { confirm: confirmDeleteLine, confirmProps: deleteLineConfirmProps } = useConfirm();

  const updateMetadataMutation = useUpdateShoppingListMutation(normalizedListId);
  const markReadyMutation = useMarkShoppingListReadyMutation();
  const deleteLineMutation = useDeleteShoppingListLineMutation();
  const addLineMutation = usePostShoppingListsLinesByListId();
  const orderLineMutation = useOrderShoppingListLineMutation();
  const revertLineMutation = useRevertShoppingListLineMutation();
  const orderGroupMutation = useOrderShoppingListGroupMutation();
  const updateStatusMutation = useUpdateShoppingListStatusMutation();
  const receiveLineMutation = useReceiveShoppingListLineMutation();
  const completeLineMutation = useCompleteShoppingListLineMutation();
  const unlinkMutation = useKitShoppingListUnlinkMutation();

  useEffect(() => {
    if (highlightedLineId == null) {
      return;
    }
    const timer = setTimeout(() => setHighlightedLineId(null), 4000);
    return () => clearTimeout(timer);
  }, [highlightedLineId]);

  useEffect(() => {
    if (!duplicateNotice) {
      return;
    }
    const stillExists = lines.some(line => line.id === duplicateNotice.lineId);
    if (!stillExists) {
      setDuplicateNotice(null);
      setHighlightedLineId(null);
    }
  }, [duplicateNotice, lines]);

  useListLoadingInstrumentation({
    scope: 'shoppingLists.list',
    isLoading,
    isFetching,
    error,
    getReadyMetadata: () => ({
      ...getReadyMetadata(sortKey),
      duplicate: duplicateNotice ? 'present' : 'none',
    }),
    getErrorMetadata,
    getAbortedMetadata: () => ({
      ...getReadyMetadata(sortKey),
      duplicate: duplicateNotice ? 'present' : 'none',
    }),
  });

  const handleSortChange = useCallback((nextSort: ShoppingListLineSortKey) => {
    if (nextSort === sortKey) return;
    navigate({
      to: Route.fullPath,
      params: { listId: params.listId },
      search: { sort: nextSort, originSearch: search.originSearch ?? undefined },
      replace: true,
    });
  }, [navigate, params.listId, search.originSearch, sortKey]);

  const handleOpenCreateLine = useCallback(() => {
    setLineFormMode('add');
    setSelectedLine(undefined);
    setDuplicateNotice(null);
    setHighlightedLineId(null);
    setLineFormOpen(true);
  }, []);

  const handleEditLine = useCallback((line: ShoppingListConceptLine) => {
    setLineFormMode('edit');
    setSelectedLine(line);
    setLineFormOpen(true);
  }, []);

  // Undo handler for line deletion - accepts lineId to retrieve specific snapshot
  const handleUndoDeleteLine = useCallback((lineId: number) => {
    return () => {
      if (undoInFlightRef.current) {
        return;
      }
      const snapshot = deletedLineSnapshotsRef.current.get(lineId);
      if (!snapshot) {
        return;
      }
      undoInFlightRef.current = true;

      trackFormSubmit('ShoppingListLine:restore', {
        undo: true,
        lineId: snapshot.lineId,
        listId: snapshot.listId,
        partKey: snapshot.partKey,
      });

      addLineMutation
        .mutateAsync({
          path: { list_id: snapshot.listId },
          body: {
            part_id: snapshot.partId,
            needed: snapshot.needed,
            seller_id: snapshot.sellerId,
            note: snapshot.note,
          },
        })
        .then(() => {
          undoInFlightRef.current = false;
          deletedLineSnapshotsRef.current.delete(lineId);
          trackFormSuccess('ShoppingListLine:restore', {
            undo: true,
            lineId: snapshot.lineId,
            listId: snapshot.listId,
            partKey: snapshot.partKey,
          });
          showSuccess('Restored line to Concept list');
          // Invalidate query to refetch the list
          void queryClient.invalidateQueries({
            queryKey: ['getShoppingListById', { path: { list_id: snapshot.listId } }],
          });
        })
        .catch((err) => {
          undoInFlightRef.current = false;
          trackFormError('ShoppingListLine:restore', {
            undo: true,
            lineId: snapshot.lineId,
            listId: snapshot.listId,
            partKey: snapshot.partKey,
          });
          const message = err instanceof Error ? err.message : 'Failed to restore line';
          showException(message, err);
        });
    };
  }, [addLineMutation, queryClient, showException, showSuccess]);

  const handleDeleteLine = useCallback(async (line: ShoppingListConceptLine) => {
    // Capture snapshot before deletion for undo - store in Map for concurrent deletion support
    const snapshot: DeletedLineSnapshot = {
      lineId: line.id,
      listId: line.shoppingListId,
      partId: line.part.id,
      partKey: line.part.key,
      needed: line.needed,
      sellerId: line.seller?.id ?? null,
      note: line.note,
    };
    deletedLineSnapshotsRef.current.set(line.id, snapshot);

    trackFormSubmit('ShoppingListLine:delete', {
      lineId: line.id,
      listId: line.shoppingListId,
      partKey: line.part.key,
    });

    try {
      await deleteLineMutation.mutateAsync({
        lineId: line.id,
        listId: line.shoppingListId,
        partKey: line.part.key,
      });

      trackFormSuccess('ShoppingListLine:delete', {
        lineId: line.id,
        listId: line.shoppingListId,
        partKey: line.part.key,
      });

      showSuccess('Removed part from Concept list', {
        action: {
          id: 'undo',
          label: 'Undo',
          testId: `shopping-lists.concept.toast.undo.${line.id}`,
          onClick: handleUndoDeleteLine(line.id),
        },
      });
    } catch (err) {
      // Remove snapshot if deletion fails
      deletedLineSnapshotsRef.current.delete(line.id);
      trackFormError('ShoppingListLine:delete', {
        lineId: line.id,
        listId: line.shoppingListId,
        partKey: line.part.key,
      });
      const message = err instanceof Error ? err.message : 'Failed to delete line';
      showException(message, err);
    }
  }, [deleteLineMutation, handleUndoDeleteLine, showException, showSuccess]);

  const handleDuplicateDetected = useCallback((existingLine: ShoppingListConceptLine, partKey: string) => {
    setDuplicateNotice({ lineId: existingLine.id, partKey });
    setHighlightedLineId(existingLine.id);
  }, []);

  const handleDismissDuplicate = useCallback(() => {
    setDuplicateNotice(null);
    setHighlightedLineId(null);
  }, []);

  const handleUpdateMetadata = useCallback(async (data: { name: string; description: string | null }) => {
    try {
      await updateMetadataMutation.mutateAsync(data);
      showSuccess('List details updated');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update list details';
      showException(message, err);
      throw err;
    }
  }, [showException, showSuccess, updateMetadataMutation]);

  const handleMarkReady = useCallback(async () => {
    if (!shoppingList || shoppingList.status !== 'concept') {
      return;
    }
    try {
      await markReadyMutation.mutateAsync({ listId: normalizedListId });
      showSuccess('List marked Ready. Seller planning view is now available.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to mark list Ready';
      showException(message, err);
      throw err;
    }
  }, [markReadyMutation, normalizedListId, shoppingList, showException, showSuccess]);

  const handleDeleteList = useCallback(() => {
    if (!shoppingList) {
      return;
    }

    void confirmListDelete(shoppingList);
  }, [confirmListDelete, shoppingList]);

  // Track line-level mutations so Ready rows can disable actions while in flight.
  const updatePendingLine = useCallback((lineId: number, isPending: boolean) => {
    setPendingLineIds(prev => {
      const next = new Set(prev);
      if (isPending) {
        next.add(lineId);
      } else {
        next.delete(lineId);
      }
      return next;
    });
  }, []);

  // Handler for Ready state line deletion (with confirmation, no undo)
  const handleDeleteReadyLine = useCallback(async (line: ShoppingListConceptLine) => {
    if (detailIsCompleted) {
      return;
    }

    const confirmed = await confirmDeleteLine({
      title: 'Delete shopping list line?',
      description: 'Are you sure you want to delete this line from the shopping list? This action cannot be undone.',
      confirmText: 'Delete',
      destructive: true,
    });

    if (!confirmed) {
      return;
    }

    updatePendingLine(line.id, true);

    trackFormSubmit('ShoppingListLine:delete', {
      lineId: line.id,
      listId: line.shoppingListId,
      partKey: line.part.key,
    });

    try {
      await deleteLineMutation.mutateAsync({
        lineId: line.id,
        listId: line.shoppingListId,
        partKey: line.part.key,
      });

      trackFormSuccess('ShoppingListLine:delete', {
        lineId: line.id,
        listId: line.shoppingListId,
        partKey: line.part.key,
      });

      showSuccess('Removed part from shopping list');
    } catch (err) {
      trackFormError('ShoppingListLine:delete', {
        lineId: line.id,
        listId: line.shoppingListId,
        partKey: line.part.key,
      });
      const message = err instanceof Error ? err.message : 'Failed to delete line';
      showException(message, err);
    } finally {
      updatePendingLine(line.id, false);
    }
  }, [confirmDeleteLine, deleteLineMutation, detailIsCompleted, showException, showSuccess, updatePendingLine]);

  const handleOpenOrderLineDialog = useCallback((line: ShoppingListConceptLine, trigger?: HTMLElement | null) => {
    if (detailIsCompleted) {
      return;
    }
    setOrderLineState({ open: true, line, trigger: trigger ?? null });
  }, [detailIsCompleted]);

  const handleCloseOrderLineDialog = useCallback(() => {
    setOrderLineState(prev => ({ open: false, line: null, trigger: prev.trigger }));
  }, []);

  const handleConfirmLineOrder = useCallback(async (quantity: number) => {
    if (detailIsCompleted) {
      return;
    }
    const target = orderLineState.line;
    if (!target) {
      return;
    }
    updatePendingLine(target.id, true);
    try {
      await orderLineMutation.mutateAsync({
        listId: target.shoppingListId,
        lineId: target.id,
        orderedQuantity: quantity,
      });
      if (quantity > 0) {
        showSuccess(`Marked ${target.part.description} Ordered`);
      } else {
        showSuccess(`Cleared ordered quantity for ${target.part.description}`);
      }
      setHighlightedLineId(target.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update ordered quantity';
      showException(message, err);
      throw err;
    } finally {
      updatePendingLine(target.id, false);
    }
  }, [detailIsCompleted, orderLineMutation, orderLineState.line, showException, showSuccess, updatePendingLine]);

  const handleRevertLine = useCallback(async (line: ShoppingListConceptLine) => {
    if (detailIsCompleted) {
      return;
    }
    updatePendingLine(line.id, true);
    try {
      await revertLineMutation.mutateAsync({
        listId: line.shoppingListId,
        lineId: line.id,
      });
      showSuccess(`Reverted ${line.part.description} to New`);
      setHighlightedLineId(line.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to revert line';
      showException(message, err);
    } finally {
      updatePendingLine(line.id, false);
    }
  }, [detailIsCompleted, revertLineMutation, showException, showSuccess, updatePendingLine]);

  const handleOpenOrderGroupDialog = useCallback((group: ShoppingListSellerGroup, trigger?: HTMLElement | null) => {
    if (detailIsCompleted) {
      return;
    }
    setOrderGroupState({ open: true, group, trigger: trigger ?? null });
  }, [detailIsCompleted]);

  const handleCloseOrderGroupDialog = useCallback(() => {
    setOrderGroupState(prev => ({ open: false, group: null, trigger: prev.trigger }));
  }, []);

  const handleConfirmGroupOrder = useCallback(async (orderedLines: Array<{ lineId: number; orderedQuantity: number }>) => {
    if (detailIsCompleted) {
      return;
    }
    const targetGroup = orderGroupState.group;
    if (!targetGroup) {
      return;
    }
    const pendingIds = orderedLines.map(item => item.lineId);
    pendingIds.forEach(id => updatePendingLine(id, true));
    try {
      await orderGroupMutation.mutateAsync({
        listId: normalizedListId,
        groupKey: targetGroup.groupKey,
        lines: orderedLines.map(item => ({
          lineId: item.lineId,
          orderedQuantity: item.orderedQuantity,
        })),
      });
      showSuccess(`Marked ${orderedLines.length} lines Ordered for ${targetGroup.sellerName}`);
      if (orderedLines.length > 0) {
        setHighlightedLineId(orderedLines[0].lineId);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to order group';
      showException(message, err);
      throw err;
    } finally {
      pendingIds.forEach(id => updatePendingLine(id, false));
    }
  }, [detailIsCompleted, normalizedListId, orderGroupMutation, orderGroupState.group, showException, showSuccess, updatePendingLine]);

  const handleCloseUpdateStock = useCallback(() => {
    setUpdateStockState(prev => ({ open: false, lineId: null, trigger: prev.trigger }));
  }, []);

  const handleReceiveSubmit = useCallback(async (payload: {
    mode: 'save' | 'complete' | 'complete-retry';
    receiveQuantity: number;
    allocations: ShoppingListLineReceiveAllocationInput[];
  }) => {
    if (detailIsCompleted) {
      return;
    }
    const target = updateStockLine;
    if (!target) {
      return;
    }

    updatePendingLine(target.id, true);

    try {
      await receiveLineMutation.mutateAsync({
        listId: target.shoppingListId,
        lineId: target.id,
        partKey: target.part.key,
        receiveQuantity: payload.receiveQuantity,
        allocations: payload.allocations,
      });
      showSuccess(`Received ${payload.receiveQuantity} for ${target.part.description}`);
      setHighlightedLineId(target.id);

      // Note: If mode is 'complete' or 'complete-retry', the dialog will handle
      // calling onMarkDone after this succeeds. We only close the dialog here
      // if mode is 'save' (save-only without completion).
      if (payload.mode === 'save') {
        setUpdateStockState(prev => ({ open: false, lineId: null, trigger: prev.trigger }));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to receive stock';
      showException(message, err);
      throw err;
    } finally {
      updatePendingLine(target.id, false);
    }
  }, [detailIsCompleted, receiveLineMutation, showException, showSuccess, updatePendingLine, updateStockLine]);

  const handleMarkLineDone = useCallback(async (payload: { mismatchReason: string | null }) => {
    if (detailIsCompleted) {
      return;
    }
    const target = updateStockLine;
    if (!target) {
      return;
    }

    updatePendingLine(target.id, true);

    try {
      await completeLineMutation.mutateAsync({
        listId: target.shoppingListId,
        lineId: target.id,
        partKey: target.part.key,
        mismatchReason: payload.mismatchReason,
      });
      const hasReason = Boolean(payload.mismatchReason?.trim());
      showSuccess(hasReason ? `Marked ${target.part.description} done with mismatch noted` : `Marked ${target.part.description} done`);
      setHighlightedLineId(target.id);
      setUpdateStockState(prev => ({ open: false, lineId: null, trigger: prev.trigger }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to complete line';
      showException(message, err);
      throw err;
    } finally {
      updatePendingLine(target.id, false);
    }
  }, [completeLineMutation, detailIsCompleted, showException, showSuccess, updatePendingLine, updateStockLine]);

  const handleBackToConcept = useCallback(async () => {
    if (!shoppingList || detailIsCompleted) {
      return;
    }
    try {
      await updateStatusMutation.mutateAsync({ listId: shoppingList.id, status: 'concept' });
      showSuccess('Returned list to Concept');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to return list to Concept';
      showException(message, err);
      throw err;
    }
  }, [detailIsCompleted, shoppingList, showException, showSuccess, updateStatusMutation]);

  const handleMarkListDone = useCallback(async () => {
    if (!shoppingList || detailIsCompleted) {
      return;
    }
    await confirmReadyArchive(shoppingList);
  }, [confirmReadyArchive, detailIsCompleted, shoppingList]);

  const handleOpenUpdateStock = useCallback((line: ShoppingListConceptLine, trigger?: HTMLElement | null) => {
    if (detailIsCompleted) {
      return;
    }
    setUpdateStockState({ open: true, lineId: line.id, trigger: trigger ?? null });
    setHighlightedLineId(line.id);
  }, [detailIsCompleted]);

  const emitUnlinkFlowEvent = useCallback(
    (phase: KitUnlinkFlowPhase, link: ShoppingListKitLink, overrides?: Record<string, unknown>) => {
      emitUiState({
        kind: 'ui_state',
        scope: KIT_UNLINK_FLOW_SCOPE,
        phase,
        metadata: {
          listId: normalizedListId,
          action: 'unlink',
          targetKitId: link.kitId,
          linkId: link.linkId,
          noop: false,
          ...(overrides ?? {}),
        },
      });
    },
    [normalizedListId],
  );

  const handleUnlinkRequest = useCallback(
    (link: ShoppingListKitLink) => {
      if (detailIsCompleted || unlinkMutation.isPending || unlinkingLinkId !== null) {
        return;
      }
      setLinkToUnlink(link);
      emitUnlinkFlowEvent('open', link);
    },
    [detailIsCompleted, emitUnlinkFlowEvent, unlinkMutation.isPending, unlinkingLinkId],
  );

  const handleUnlinkDialogChange = useCallback((nextOpen: boolean) => {
    if (!nextOpen) {
      setLinkToUnlink(null);
    }
  }, []);

  const { slots: detailHeaderSlots, overlays: headerOverlays, kitsQuery } = useShoppingListDetailHeaderSlots({
    list: shoppingList,
    onUpdateMetadata: handleUpdateMetadata,
    isUpdating: updateMetadataMutation.isPending,
    onDeleteList: handleDeleteList,
    isDeletingList,
    overviewSearchTerm: search.originSearch ?? '',
    onUnlinkKit: detailIsCompleted ? undefined : handleUnlinkRequest,
    unlinkingLinkId,
  });

  // handleConfirmUnlink must come after the hook call because it uses kitsQuery.refetch()
  const handleConfirmUnlink = useCallback(() => {
    if (!shoppingList || !linkToUnlink || unlinkMutation.isPending) {
      return;
    }
    const link = linkToUnlink;
    emitUnlinkFlowEvent('submit', link);
    setUnlinkingLinkId(link.linkId);

    void unlinkMutation
      .mutateAsync({
        kitId: link.kitId,
        linkId: link.linkId,
        shoppingListId: shoppingList.id,
      })
      .then(() => {
        emitUnlinkFlowEvent('success', link);
        showSuccess(`Unlinked "${link.kitName}" from this shopping list.`);
        void kitsQuery.refetch();
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 404) {
          emitUnlinkFlowEvent('success', link, { status: 404, noop: true });
          showWarning('That kit link was already removed. Refreshing shopping list detail.');
          void kitsQuery.refetch();
          return;
        }

        const message = error instanceof Error ? error.message : 'Failed to unlink kit';
        emitUnlinkFlowEvent('error', link, {
          message,
          status: error instanceof ApiError ? error.status : undefined,
        });
        showException('Failed to unlink kit', error);
      })
      .finally(() => {
        setUnlinkingLinkId(null);
        setLinkToUnlink(null);
      });
  }, [shoppingList, linkToUnlink, emitUnlinkFlowEvent, unlinkMutation, showSuccess, showWarning, showException, kitsQuery]);

  const listLoaded = shoppingList != null;
  const status = shoppingList?.status ?? 'concept';
  const isCompleted = detailIsCompleted || status === 'done';
  const isReadyView = status === 'ready' || isCompleted;
  const canReturnToConcept = Boolean(shoppingList?.canReturnToConcept && !isCompleted);
  const canMarkListDone = Boolean(shoppingList && !isCompleted && status !== 'concept');

  if (!hasValidListId) {
    return (
      <div className="space-y-4 p-6" data-testid="shopping-lists.concept.invalid">
        <h1 className="text-3xl font-semibold text-foreground">Shopping Lists</h1>
        <p className="text-sm text-destructive">Invalid shopping list identifier.</p>
      </div>
    );
  }

  const conceptLineCount = shoppingList?.lines.length ?? sortedLines.length;

  const conceptToolbar = status === 'concept' && listLoaded ? (
    <ConceptToolbar
      lineCount={conceptLineCount}
      canMarkReady={conceptLineCount > 0}
      isSubmitting={markReadyMutation.isPending}
      onMarkReady={handleMarkReady}
    />
  ) : null;

  const readyToolbarNode = isReadyView && listLoaded ? (
    <ReadyToolbar
      canReturnToConcept={canReturnToConcept}
      onBackToConcept={handleBackToConcept}
      isUpdatingBackToConcept={updateStatusMutation.isPending}
      canMarkDone={canMarkListDone}
      onMarkDone={handleMarkListDone}
      isMarkingDone={isMarkingDone}
      isCompleted={isCompleted}
    />
  ) : null;

  const toolbarNode = status === 'concept' ? conceptToolbar : readyToolbarNode;

  const conceptContent = (
    <div className="space-y-6" data-testid="shopping-lists.concept.content">
      {detailHeaderSlots.linkChips}
      <ConceptTable
        lines={sortedLines}
        sortKey={sortKey}
        onSortChange={handleSortChange}
        onEditLine={handleEditLine}
        onDeleteLine={handleDeleteLine}
        onCreateLine={handleOpenCreateLine}
        isMutating={lineFormOpen}
        duplicateNotice={duplicateNotice}
        onDismissDuplicateNotice={handleDismissDuplicate}
        highlightedLineId={highlightedLineId}
      />
    </div>
  );

  const readyContent = (
    <div className="space-y-6" data-testid="shopping-lists.ready.content">
      {detailHeaderSlots.linkChips}
      <SellerGroupList
        listId={shoppingList?.id ?? normalizedListId}
        groups={sellerGroups}
        onOpenOrderLine={handleOpenOrderLineDialog}
        onOpenOrderGroup={handleOpenOrderGroupDialog}
        onRevertLine={handleRevertLine}
        onEditLine={handleEditLine}
        onDeleteLine={isCompleted ? undefined : handleDeleteReadyLine}
        onUpdateStock={handleOpenUpdateStock}
        pendingLineIds={pendingLineIds}
        highlightedLineId={highlightedLineId}
        isCompleted={isCompleted}
      />
    </div>
  );

  const contentNode = status === 'concept' ? conceptContent : readyContent;
  const contentTestId = status === 'concept'
    ? 'shopping-lists.detail.content.concept'
    : 'shopping-lists.detail.content.ready';

  return (
    <>
      <DetailScreenLayout
        rootTestId="shopping-lists.detail.layout"
        headerTestId="shopping-lists.detail.header"
        contentTestId={contentTestId}
        actionsTestId="shopping-lists.detail.actions"
        breadcrumbs={detailHeaderSlots.breadcrumbs}
        title={detailHeaderSlots.title}
        titleMetadata={detailHeaderSlots.titleMetadata}
        description={detailHeaderSlots.description}
        supplementary={detailHeaderSlots.supplementary}
        metadataRow={detailHeaderSlots.metadataRow}
        actions={detailHeaderSlots.actions}
        toolbar={toolbarNode ?? undefined}
      >
        {contentNode}
      </DetailScreenLayout>

      {headerOverlays}

      <ConceptLineForm
        open={lineFormOpen}
        mode={lineFormMode}
        listId={normalizedListId}
        line={lineFormMode === 'edit' ? selectedLine : undefined}
        onClose={() => {
          setLineFormOpen(false);
          setSelectedLine(undefined);
          setLineFormMode('add');
        }}
        duplicateCheck={duplicateCheck}
        duplicateNotice={duplicateNotice}
        onDuplicateDetected={handleDuplicateDetected}
        onDismissDuplicateNotice={handleDismissDuplicate}
      />

      {!isCompleted && (
        <OrderLineDialog
          open={orderLineState.open}
          line={orderLineState.line}
          onClose={handleCloseOrderLineDialog}
          onSubmit={handleConfirmLineOrder}
          isSubmitting={orderLineMutation.isPending}
          restoreFocusElement={orderLineState.trigger ?? undefined}
        />
      )}

      {!isCompleted && (
        <OrderGroupDialog
          open={orderGroupState.open}
          listId={shoppingList?.id ?? normalizedListId}
          group={orderGroupState.group}
          onClose={handleCloseOrderGroupDialog}
          onSubmit={handleConfirmGroupOrder}
          isSubmitting={orderGroupMutation.isPending}
          restoreFocusElement={orderGroupState.trigger ?? undefined}
        />
      )}

      {!isCompleted && (
        <UpdateStockDialog
          open={updateStockState.open}
          line={updateStockLine}
          onClose={handleCloseUpdateStock}
          onSubmit={handleReceiveSubmit}
          onMarkDone={handleMarkLineDone}
          isReceiving={receiveLineMutation.isPending}
          isCompleting={completeLineMutation.isPending}
          restoreFocusElement={updateStockState.trigger ?? undefined}
        />
      )}

      {deleteListDialog}
      {markDoneDialog}
      {linkToUnlink ? (
        <ConfirmDialog
          open={Boolean(linkToUnlink)}
          onOpenChange={handleUnlinkDialogChange}
          title="Unlink kit?"
          description={`Removing the link to "${linkToUnlink.kitName}" will not delete the kit or its contents.`}
          confirmText="Unlink kit"
          destructive
          onConfirm={handleConfirmUnlink}
          contentProps={{ 'data-testid': 'shopping-lists.detail.kit-unlink.dialog' } as DialogContentProps}
        />
      ) : null}
      <ConfirmDialog
        {...deleteLineConfirmProps}
        contentProps={{ 'data-testid': 'shopping-lists.ready.delete-line-dialog' } as DialogContentProps}
      />
    </>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ConceptHeader } from '@/components/shopping-lists/concept-header';
import { ConceptTable } from '@/components/shopping-lists/concept-table';
import { ConceptLineForm } from '@/components/shopping-lists/concept-line-form';
import { ConceptToolbar } from '@/components/shopping-lists/concept-toolbar';
import { SellerGroupList } from '@/components/shopping-lists/ready/seller-group-list';
import { OrderLineDialog } from '@/components/shopping-lists/ready/order-line-dialog';
import { OrderGroupDialog } from '@/components/shopping-lists/ready/order-group-dialog';
import { UpdateStockDialog } from '@/components/shopping-lists/ready/update-stock-dialog';
import { ReadyToolbar } from '@/components/shopping-lists/ready/ready-toolbar';
import { useListArchiveConfirm, useListDeleteConfirm } from '@/components/shopping-lists/list-delete-confirm';
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
  flattenReceivableLines,
  findNextReceivableLine,
} from '@/hooks/use-shopping-lists';
import type {
  ShoppingListConceptLine,
  ShoppingListLineSortKey,
  ShoppingListSellerGroup,
  ShoppingListLineReceiveAllocationInput,
  ShoppingListOverviewSummary,
} from '@/types/shopping-lists';
import { useToast } from '@/hooks/use-toast';
import { useListLoadingInstrumentation } from '@/lib/test/query-instrumentation';
import { useConfirm } from '@/hooks/use-confirm';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Route as ShoppingListsRoute } from '@/routes/shopping-lists/index';

const SORT_KEYS: ShoppingListLineSortKey[] = ['description', 'mpn', 'createdAt'];

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
  line: ShoppingListConceptLine | null;
  trigger: HTMLElement | null;
}

function ShoppingListDetailRoute() {
  const params = Route.useParams();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const { showSuccess, showException } = useToast();
  const { confirm, confirmProps } = useConfirm();

  const listId = Number(params.listId);
  const hasValidListId = Number.isFinite(listId);
  const normalizedListId = hasValidListId ? listId : 0;
  const sortKey = (search.sort as ShoppingListLineSortKey | undefined) ?? 'description';
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
  const [updateStockState, setUpdateStockState] = useState<UpdateStockState>({ open: false, line: null, trigger: null });
  const [pendingLineIds, setPendingLineIds] = useState<Set<number>>(new Set());
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

  const updateMetadataMutation = useUpdateShoppingListMutation(normalizedListId);
  const markReadyMutation = useMarkShoppingListReadyMutation();
  const deleteLineMutation = useDeleteShoppingListLineMutation();
  const orderLineMutation = useOrderShoppingListLineMutation();
  const revertLineMutation = useRevertShoppingListLineMutation();
  const orderGroupMutation = useOrderShoppingListGroupMutation();
  const updateStatusMutation = useUpdateShoppingListStatusMutation();
  const receiveLineMutation = useReceiveShoppingListLineMutation();
  const completeLineMutation = useCompleteShoppingListLineMutation();

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

  const handleDeleteLine = useCallback(async (line: ShoppingListConceptLine) => {
    const confirmed = await confirm({
      title: 'Delete line',
      description: `Remove "${line.part.description}" from this Concept list?`,
      confirmText: 'Delete line',
      destructive: true,
    });
    if (!confirmed) {
      return;
    }

    try {
      await deleteLineMutation.mutateAsync({ lineId: line.id, listId: line.shoppingListId, partKey: line.part.key });
      showSuccess('Removed part from Concept list');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete line';
      showException(message, err);
    }
  }, [confirm, deleteLineMutation, showException, showSuccess]);

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
    setUpdateStockState(prev => ({ open: false, line: null, trigger: prev.trigger }));
  }, []);

  const handleReceiveSubmit = useCallback(async (payload: {
    mode: 'save' | 'saveAndNext';
    receiveQuantity: number;
    allocations: ShoppingListLineReceiveAllocationInput[];
  }) => {
    if (detailIsCompleted) {
      return;
    }
    const target = updateStockState.line;
    if (!target) {
      return;
    }

    updatePendingLine(target.id, true);

    const sequence = payload.mode === 'saveAndNext' ? flattenReceivableLines(sellerGroups) : undefined;
    const nextInSequence = sequence ? (() => {
      const currentIndex = sequence.findIndex(line => line.id === target.id);
      if (currentIndex >= 0) {
        return sequence[currentIndex + 1];
      }
      return undefined;
    })() : undefined;

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

      if (payload.mode === 'saveAndNext') {
        let nextLine: ShoppingListConceptLine | undefined;
        if (nextInSequence) {
          const refreshedCandidate = lines.find(line => line.id === nextInSequence.id);
          if (refreshedCandidate && refreshedCandidate.status === 'ordered' && refreshedCandidate.canReceive) {
            nextLine = refreshedCandidate;
          }
        }

        if (!nextLine) {
          const refreshedSequence = flattenReceivableLines(sellerGroups);
          const currentIndex = refreshedSequence.findIndex(line => line.id === target.id);
          if (currentIndex >= 0) {
            nextLine = refreshedSequence.slice(currentIndex + 1).find(line => line.canReceive);
          } else {
            nextLine = refreshedSequence.find(line => line.canReceive && line.id !== target.id);
          }
        }

        if (nextLine) {
          setUpdateStockState(prev => ({ open: true, line: nextLine, trigger: prev.trigger }));
          setHighlightedLineId(nextLine.id);
          return;
        }
      }

      setUpdateStockState(prev => ({ open: false, line: null, trigger: prev.trigger }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to receive stock';
      showException(message, err);
      throw err;
    } finally {
      updatePendingLine(target.id, false);
    }
  }, [detailIsCompleted, lines, receiveLineMutation, sellerGroups, showException, showSuccess, updatePendingLine, updateStockState.line]);

  const handleMarkLineDone = useCallback(async (payload: { mismatchReason: string | null }) => {
    if (detailIsCompleted) {
      return;
    }
    const target = updateStockState.line;
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
      setUpdateStockState(prev => ({ open: false, line: null, trigger: prev.trigger }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to complete line';
      showException(message, err);
      throw err;
    } finally {
      updatePendingLine(target.id, false);
    }
  }, [completeLineMutation, detailIsCompleted, showException, showSuccess, updatePendingLine, updateStockState.line]);

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
    setUpdateStockState({ open: true, line, trigger: trigger ?? null });
    setHighlightedLineId(line.id);
  }, [detailIsCompleted]);

  const listLoaded = shoppingList != null;
  const status = shoppingList?.status ?? 'concept';
  const isCompleted = detailIsCompleted || status === 'done';
  const isReadyView = status === 'ready' || isCompleted;
  const canReturnToConcept = Boolean(shoppingList?.canReturnToConcept && !isCompleted);
  const canMarkListDone = Boolean(shoppingList && !isCompleted && status !== 'concept');

  const nextReceivableLine = useMemo(() => {
    if (!updateStockState.line) {
      return undefined;
    }
    return findNextReceivableLine(updateStockState.line.id, sellerGroups);
  }, [sellerGroups, updateStockState.line]);

  if (!hasValidListId) {
    return (
      <div className="space-y-4" data-testid="shopping-lists.concept.invalid">
        <h1 className="text-3xl font-semibold text-foreground">Shopping Lists</h1>
        <p className="text-sm text-destructive">Invalid shopping list identifier.</p>
      </div>
    );
  }

  const conceptLineCount = shoppingList?.lines.length ?? sortedLines.length;

  const conceptView = (
    <div className="space-y-6" data-testid="shopping-lists.concept.page">
      <ConceptHeader
        list={shoppingList}
        onUpdateMetadata={handleUpdateMetadata}
        isUpdating={updateMetadataMutation.isPending}
        onDeleteList={handleDeleteList}
        isDeletingList={isDeletingList}
        overviewSearchTerm={search.originSearch ?? ''}
      />

      {status === 'concept' && listLoaded && (
        <ConceptToolbar
          lineCount={conceptLineCount}
          canMarkReady={conceptLineCount > 0}
          isSubmitting={markReadyMutation.isPending}
          onMarkReady={handleMarkReady}
        />
      )}

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

  const readyView = (
    <div className="space-y-6" data-testid="shopping-lists.ready.page">
      <ConceptHeader
        list={shoppingList}
        onUpdateMetadata={handleUpdateMetadata}
        isUpdating={updateMetadataMutation.isPending}
        onDeleteList={handleDeleteList}
        isDeletingList={isDeletingList}
        overviewSearchTerm={search.originSearch ?? ''}
      />
      <ReadyToolbar
        canReturnToConcept={canReturnToConcept}
        onBackToConcept={handleBackToConcept}
        isUpdatingBackToConcept={updateStatusMutation.isPending}
        canMarkDone={canMarkListDone}
        onMarkDone={handleMarkListDone}
        isMarkingDone={isMarkingDone}
        isCompleted={isCompleted}
      />
      <SellerGroupList
        listId={shoppingList?.id ?? normalizedListId}
        groups={sellerGroups}
        onOpenOrderLine={handleOpenOrderLineDialog}
        onOpenOrderGroup={handleOpenOrderGroupDialog}
        onRevertLine={handleRevertLine}
        onEditLine={handleEditLine}
        onUpdateStock={handleOpenUpdateStock}
        pendingLineIds={pendingLineIds}
        highlightedLineId={highlightedLineId}
        isCompleted={isCompleted}
      />
    </div>
  );

  return (
    <>
      {isReadyView ? readyView : conceptView}

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
          line={updateStockState.line}
          hasNextLine={Boolean(nextReceivableLine)}
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
      <ConfirmDialog {...confirmProps} />
    </>
  );
}

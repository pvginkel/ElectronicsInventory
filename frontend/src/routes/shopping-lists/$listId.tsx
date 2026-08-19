import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { LineForm } from '@/components/shopping-lists/line-form';
import { UpdateStockDialog } from '@/components/shopping-lists/ready/update-stock-dialog';
import { KanbanBoard } from '@/components/shopping-lists/kanban/kanban-board';
import { useListArchiveConfirm, useListDeleteConfirm } from '@/components/shopping-lists/list-delete-confirm';
import {
  useShoppingListDetail,
  useUpdateShoppingListMutation,
  useDeleteShoppingListLineMutation,
  useReceiveShoppingListLineMutation,
  useCompleteShoppingListLineMutation,
  useUpdateShoppingListLineMutation,
} from '@/hooks/use-shopping-lists';
import {
  useCreateSellerGroupMutation,
  useUpdateSellerGroupMutation,
  useDeleteSellerGroupMutation,
} from '@/hooks/use-seller-group-mutations';
import { usePostShoppingListsLinesByListId } from '@/lib/api/generated/hooks';
// eslint-disable-next-line role-gating/gate-usage-enforcement -- add-line is triggered via the kanban-skeleton-column which has its own Gate
import { postShoppingListsLinesByListIdRole } from '@/lib/api/generated/roles';
void postShoppingListsLinesByListIdRole;
import type {
  ShoppingListLine,
  ShoppingListLineSortKey,
  ShoppingListLineReceiveAllocationInput,
  ShoppingListOverviewSummary,
  ShoppingListKitLink,
} from '@/types/shopping-lists';
import { useToast } from '@/hooks/use-toast';
import { useListLoadingInstrumentation } from '@/lib/test/query-instrumentation';
import { trackFormSubmit, trackFormSuccess, trackFormError } from '@/lib/test/form-instrumentation';
import { ConfirmDialog, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, type DialogContentProps } from '@/components/primitives/dialog';
import { Button } from '@/components/primitives/button';
import { DetailScreenLayout } from '@/components/layout/detail-screen-layout';
import { useShoppingListDetailHeaderSlots } from '@/components/shopping-lists/detail-header-slots';
import { useKitShoppingListUnlinkMutation } from '@/hooks/use-kit-shopping-list-links';
import { emitTestEvent } from '@/lib/test/event-emitter';
import { ApiError } from '@/lib/api/api-error';
import type { UiStateTestEvent } from '@/lib/test/test-events';

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
      to: '/shopping-lists',
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

  const [lineFormOpen, setLineFormOpen] = useState(false);
  const [lineFormMode, setLineFormMode] = useState<'add' | 'edit'>('add');
  const [lineFormDefaultSellerId, setLineFormDefaultSellerId] = useState<number | undefined>(undefined);
  const [selectedLine, setSelectedLine] = useState<ShoppingListLine | undefined>(undefined);
  const [duplicateNotice, setDuplicateNotice] = useState<{ lineId: number; partKey: string } | null>(null);
  const [highlightedLineId, setHighlightedLineId] = useState<number | null>(null);
  const [updateStockState, setUpdateStockState] = useState<UpdateStockState>({ open: false, lineId: null, trigger: null });
  // Look up the current line from query data so it stays fresh after saves
  const updateStockLine = updateStockState.lineId !== null
    ? lines?.find((l) => l.id === updateStockState.lineId) ?? null
    : null;
  const [pendingLineIds, setPendingLineIds] = useState<Set<number>>(new Set());
  const [linkToUnlink, setLinkToUnlink] = useState<ShoppingListKitLink | null>(null);
  const [unlinkingLinkId, setUnlinkingLinkId] = useState<number | null>(null);

  // -- Order note editing state --
  const [noteEditSellerId, setNoteEditSellerId] = useState<number | null>(null);
  const [noteEditValue, setNoteEditValue] = useState('');
  const [noteEditOpen, setNoteEditOpen] = useState(false);

  // -- Delete seller group confirmation --
  const [deleteGroupSellerId, setDeleteGroupSellerId] = useState<number | null>(null);

  // -- Optimistic DnD move state: shows cards in target column instantly --
  const [optimisticMoves, setOptimisticMoves] = useState<Array<{
    lineId: number;
    toSellerId: number | null;
    clearOrdered: boolean;
  }>>([]);

  const {
    dialog: markDoneDialog,
  } = useListArchiveConfirm({ dialogTestId: 'shopping-lists.ready.archive-dialog' });
  const {
    confirmDelete: confirmListDelete,
    dialog: deleteListDialog,
    isDeleting: isDeletingList,
  } = useListDeleteConfirm({
    dialogTestId: 'shopping-lists.detail.delete-dialog',
    onDeleted: handleListDeleted,
  });

  // -- Mutation hooks --
  const updateMetadataMutation = useUpdateShoppingListMutation(normalizedListId);
  const deleteLineMutation = useDeleteShoppingListLineMutation();
  const addLineMutation = usePostShoppingListsLinesByListId();
  const receiveLineMutation = useReceiveShoppingListLineMutation();
  const completeLineMutation = useCompleteShoppingListLineMutation();
  const updateLineMutation = useUpdateShoppingListLineMutation();
  const createGroupMutation = useCreateSellerGroupMutation();
  const updateGroupMutation = useUpdateSellerGroupMutation();
  const deleteGroupMutation = useDeleteSellerGroupMutation();
  const unlinkMutation = useKitShoppingListUnlinkMutation();

  // -- Highlight timer --
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

  // -- Instrumentation --
  useListLoadingInstrumentation({
    scope: 'shoppingLists.kanban',
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

  // -- Line form handlers --
  const handleOpenCreateLine = useCallback((sellerId?: number | null) => {
    setLineFormMode('add');
    setSelectedLine(undefined);
    setDuplicateNotice(null);
    setHighlightedLineId(null);
    setLineFormDefaultSellerId(sellerId ?? undefined);
    setLineFormOpen(true);
  }, []);

  // -- Undo handler for line deletion --
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
          showSuccess('Restored line to shopping list');
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

  // -- Delete line handler (from Kanban card trash icon) --
  const handleDeleteLine = useCallback(async (line: ShoppingListLine) => {
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

      showSuccess('Removed part from shopping list', {
        action: {
          id: 'undo',
          label: 'Undo',
          testId: `shopping-lists.detail.toast.undo.${line.id}`,
          onClick: handleUndoDeleteLine(line.id),
        },
      });
    } catch (err) {
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

  // Kanban board wrapper: accepts lineId, looks up the full line for handleDeleteLine
  const handleDeleteLineById = useCallback((lineId: number) => {
    const line = lines.find((l) => l.id === lineId);
    if (line) {
      void handleDeleteLine(line);
    }
  }, [handleDeleteLine, lines]);

  const handleDuplicateDetected = useCallback((existingLine: ShoppingListLine, partKey: string) => {
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

  const handleDeleteList = useCallback(() => {
    if (!shoppingList) {
      return;
    }
    void confirmListDelete(shoppingList);
  }, [confirmListDelete, shoppingList]);

  // Track line-level mutations so cards can disable actions while in flight.
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

  // -- UpdateStock dialog handlers --
  const handleOpenReceive = useCallback((lineId: number) => {
    setUpdateStockState({ open: true, lineId, trigger: null });
  }, []);

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

  // =====================================================================
  // Kanban Board mutation callbacks
  // =====================================================================

  // -- Inline field save (needed, ordered, note) --
  const handleFieldSave = useCallback(async (
    lineId: number,
    field: 'needed' | 'ordered' | 'note',
    value: string | number,
  ) => {
    const line = lines.find((l) => l.id === lineId);
    if (!line) return;

    updatePendingLine(lineId, true);
    try {
      const payload = {
        listId: normalizedListId,
        lineId: line.id,
        partId: line.part.id,
        partKey: line.part.key,
        needed: field === 'needed' ? Number(value) : line.needed,
        ordered: field === 'ordered' ? Number(value) : (line.ordered ?? null),
        sellerId: line.seller?.id ?? null,
        note: field === 'note' ? String(value) : (line.note ?? ''),
      };
      await updateLineMutation.mutateAsync(payload);
      setHighlightedLineId(lineId);
    } catch (err) {
      const message = err instanceof Error ? err.message : `Failed to update ${field}`;
      showException(message, err);
      throw err;
    } finally {
      updatePendingLine(lineId, false);
    }
  }, [lines, normalizedListId, showException, updateLineMutation, updatePendingLine]);

  // -- DnD move line (change seller) --
  const handleMoveLine = useCallback(async (
    lineId: number,
    toSellerId: number | null,
    clearOrdered: boolean,
  ) => {
    const line = lines.find((l) => l.id === lineId);
    if (!line) return;

    // Optimistic update: show card in target column immediately
    setOptimisticMoves(prev => [...prev, { lineId, toSellerId, clearOrdered }]);
    updatePendingLine(lineId, true);
    try {
      const payload = {
        listId: normalizedListId,
        lineId: line.id,
        partId: line.part.id,
        partKey: line.part.key,
        needed: line.needed,
        ordered: clearOrdered ? 0 : (line.ordered ?? null),
        sellerId: toSellerId,
        note: line.note ?? '',
      };
      await updateLineMutation.mutateAsync(payload);
      setHighlightedLineId(lineId);
    } catch (err) {
      // Rollback: remove the optimistic move so card returns to source column
      setOptimisticMoves(prev => prev.filter(m => m.lineId !== lineId));
      const message = err instanceof Error ? err.message : 'Failed to move line';
      showException(message, err);
      throw err;
    } finally {
      updatePendingLine(lineId, false);
    }
  }, [lines, normalizedListId, showException, updateLineMutation, updatePendingLine]);

  // -- Complete seller group (set status to "ordered") --
  const handleCompleteGroup = useCallback((sellerId: number) => {
    emitUiState({
      kind: 'ui_state',
      scope: 'kanban.column.complete',
      phase: 'submit',
      metadata: { sellerId, action: 'order' },
    });

    void updateGroupMutation.mutateAsync({
      listId: normalizedListId,
      sellerId,
      status: 'ordered',
    }).then(() => {
      emitUiState({
        kind: 'ui_state',
        scope: 'kanban.column.complete',
        phase: 'success',
        metadata: { sellerId, action: 'order' },
      });
      showSuccess('Seller group marked as ordered', {
        action: {
          id: 'undo',
          label: 'Undo',
          testId: `shopping-lists.kanban.toast.undo-complete.${sellerId}`,
          onClick: () => {
            void updateGroupMutation.mutateAsync({
              listId: normalizedListId,
              sellerId,
              status: 'active',
            }).then(() => {
              showSuccess('Seller group reopened');
            }).catch((undoErr) => {
              const msg = undoErr instanceof Error ? undoErr.message : 'Failed to reopen';
              showException(msg, undoErr);
            });
          },
        },
      });
    }).catch((err) => {
      emitUiState({
        kind: 'ui_state',
        scope: 'kanban.column.complete',
        phase: 'error',
        metadata: { sellerId, action: 'order' },
      });
      const message = err instanceof Error ? err.message : 'Failed to complete seller group';
      showException(message, err);
    });
  }, [normalizedListId, showException, showSuccess, updateGroupMutation]);

  // -- Reopen seller group (set status to "active") --
  const handleReopenGroup = useCallback((sellerId: number) => {
    emitUiState({
      kind: 'ui_state',
      scope: 'kanban.column.complete',
      phase: 'submit',
      metadata: { sellerId, action: 'reopen' },
    });

    void updateGroupMutation.mutateAsync({
      listId: normalizedListId,
      sellerId,
      status: 'active',
    }).then(() => {
      emitUiState({
        kind: 'ui_state',
        scope: 'kanban.column.complete',
        phase: 'success',
        metadata: { sellerId, action: 'reopen' },
      });
      showSuccess('Seller group reopened');
    }).catch((err) => {
      emitUiState({
        kind: 'ui_state',
        scope: 'kanban.column.complete',
        phase: 'error',
        metadata: { sellerId, action: 'reopen' },
      });
      const message = err instanceof Error ? err.message : 'Failed to reopen seller group';
      showException(message, err);
    });
  }, [normalizedListId, showException, showSuccess, updateGroupMutation]);

  // -- Delete seller group (after confirmation) --
  const handleRequestDeleteGroup = useCallback((sellerId: number) => {
    setDeleteGroupSellerId(sellerId);
  }, []);

  const handleConfirmDeleteGroup = useCallback(() => {
    if (deleteGroupSellerId === null) return;
    const sellerId = deleteGroupSellerId;
    setDeleteGroupSellerId(null);

    void deleteGroupMutation.mutateAsync({
      listId: normalizedListId,
      sellerId,
    }).then(() => {
      showSuccess('Seller column removed');
    }).catch((err) => {
      const message = err instanceof Error ? err.message : 'Failed to remove seller column';
      showException(message, err);
    });
  }, [deleteGroupSellerId, deleteGroupMutation, normalizedListId, showException, showSuccess]);

  // -- Assign remaining unassigned lines to a seller --
  const handleAssignRemaining = useCallback(async (sellerId: number) => {
    const unassignedGroup = sellerGroups.find((g) => g.sellerId === null);
    const unassignedLines = unassignedGroup?.lines ?? [];

    if (unassignedLines.length === 0) return;

    emitUiState({
      kind: 'ui_state',
      scope: 'kanban.assignRemaining',
      phase: 'submit',
      metadata: { sellerId, lineCount: unassignedLines.length },
    });

    let failed = false;
    for (const line of unassignedLines) {
      try {
        await updateLineMutation.mutateAsync({
          listId: normalizedListId,
          lineId: line.id,
          partId: line.part.id,
          partKey: line.part.key,
          needed: line.needed,
          ordered: line.ordered ?? null,
          sellerId,
          note: line.note ?? '',
        });
      } catch (err) {
        failed = true;
        const message = err instanceof Error ? err.message : 'Failed to assign line';
        showException(message, err);
        emitUiState({
          kind: 'ui_state',
          scope: 'kanban.assignRemaining',
          phase: 'error',
          metadata: { sellerId, lineCount: unassignedLines.length },
        });
        break;
      }
    }

    if (!failed) {
      emitUiState({
        kind: 'ui_state',
        scope: 'kanban.assignRemaining',
        phase: 'success',
        metadata: { sellerId, lineCount: unassignedLines.length },
      });
      showSuccess(`Assigned ${unassignedLines.length} line(s) to seller`);
    }
  }, [normalizedListId, sellerGroups, showException, showSuccess, updateLineMutation]);

  // -- Edit order note for a seller group --
  const handleEditNote = useCallback((sellerId: number) => {
    const group = sellerGroups.find((g) => g.sellerId === sellerId);
    setNoteEditSellerId(sellerId);
    setNoteEditValue(group?.orderNote ?? '');
    setNoteEditOpen(true);
  }, [sellerGroups]);

  const handleSaveNote = useCallback(async () => {
    if (noteEditSellerId === null) return;
    try {
      await updateGroupMutation.mutateAsync({
        listId: normalizedListId,
        sellerId: noteEditSellerId,
        note: noteEditValue.trim(),
      });
      showSuccess('Order note updated');
      setNoteEditOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update order note';
      showException(message, err);
    }
  }, [noteEditSellerId, noteEditValue, normalizedListId, showException, showSuccess, updateGroupMutation]);

  // -- Create seller group (from skeleton column) --
  const handleCreateGroup = useCallback((sellerId: number) => {
    emitUiState({
      kind: 'ui_state',
      scope: 'kanban.column.create',
      phase: 'submit',
      metadata: { sellerId },
    });

    void createGroupMutation.mutateAsync({
      listId: normalizedListId,
      sellerId,
    }).then(() => {
      emitUiState({
        kind: 'ui_state',
        scope: 'kanban.column.create',
        phase: 'success',
        metadata: { sellerId },
      });
      showSuccess('Seller column added');
    }).catch((err) => {
      emitUiState({
        kind: 'ui_state',
        scope: 'kanban.column.create',
        phase: 'error',
        metadata: { sellerId },
      });
      const message = err instanceof Error ? err.message : 'Failed to create seller column';
      showException(message, err);
    });
  }, [createGroupMutation, normalizedListId, showException, showSuccess]);

  // =====================================================================
  // Kit unlink flow (unchanged from before)
  // =====================================================================

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

  const status = shoppingList?.status ?? 'active';
  const isCompleted = detailIsCompleted || status === 'done';

  // -- Optimistic groups: apply pending DnD moves for instant visual feedback --
  const effectiveGroups = useMemo(() => {
    if (optimisticMoves.length === 0) return sellerGroups;
    const groups = sellerGroups.map(g => ({ ...g, lines: [...g.lines] }));
    for (const move of optimisticMoves) {
      let movedLine: ShoppingListLine | null = null;
      for (const group of groups) {
        const idx = group.lines.findIndex(l => l.id === move.lineId);
        if (idx !== -1) {
          movedLine = group.lines[idx];
          group.lines = group.lines.filter(l => l.id !== move.lineId);
          break;
        }
      }
      if (!movedLine) continue;
      const updatedLine = move.clearOrdered ? { ...movedLine, ordered: 0 } : movedLine;
      const targetGroup = groups.find(g => g.sellerId === move.toSellerId);
      if (targetGroup) {
        targetGroup.lines = [...targetGroup.lines, updatedLine];
      }
    }
    return groups;
  }, [sellerGroups, optimisticMoves]);

  // Clean up optimistic moves once server data reflects the change
  useEffect(() => {
    if (optimisticMoves.length === 0) return;
    const confirmedIds = optimisticMoves
      .filter(move => {
        const targetGroup = sellerGroups.find(g => g.sellerId === move.toSellerId);
        return targetGroup?.lines.some(l => l.id === move.lineId) ?? false;
      })
      .map(m => m.lineId);
    if (confirmedIds.length > 0) {
      setOptimisticMoves(prev => prev.filter(m => !confirmedIds.includes(m.lineId)));
    }
  }, [sellerGroups, optimisticMoves]);

  if (!hasValidListId) {
    return (
      <div className="space-y-4 p-6" data-testid="shopping-lists.detail.invalid">
        <h1 className="text-3xl font-semibold text-foreground">Shopping Lists</h1>
        <p className="text-sm text-destructive">Invalid shopping list identifier.</p>
      </div>
    );
  }

  // Kanban board content
  const contentNode = (
    <div className="flex flex-col flex-1 min-h-0" data-testid="shopping-lists.kanban.content">
      {detailHeaderSlots.linkChips && (
        <div className="px-6 pt-4">
          {detailHeaderSlots.linkChips}
        </div>
      )}
      <KanbanBoard
        groups={effectiveGroups}
        listId={normalizedListId}
        isCompleted={isCompleted}
        pendingLineIds={pendingLineIds}
        highlightedLineId={highlightedLineId}
        isCreatingGroup={createGroupMutation.isPending}
        onFieldSave={handleFieldSave}
        onDeleteLine={handleDeleteLineById}
        onReceiveLine={handleOpenReceive}
        onAddPart={(sellerId) => handleOpenCreateLine(sellerId)}
        onMoveLine={handleMoveLine}
        onCompleteGroup={handleCompleteGroup}
        onReopenGroup={handleReopenGroup}
        onDeleteGroup={handleRequestDeleteGroup}
        onAssignRemaining={handleAssignRemaining}
        onEditNote={handleEditNote}
        onCreateGroup={handleCreateGroup}
      />
    </div>
  );
  const contentTestId = 'shopping-lists.detail.content';

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
        contentProps={{ className: 'p-0 overflow-hidden flex flex-col' }}
      >
        {contentNode}
      </DetailScreenLayout>

      {headerOverlays}

      <LineForm
        open={lineFormOpen}
        mode={lineFormMode}
        listId={normalizedListId}
        defaultSellerId={lineFormMode === 'add' ? lineFormDefaultSellerId : undefined}
        line={lineFormMode === 'edit' ? selectedLine : undefined}
        onClose={() => {
          setLineFormOpen(false);
          setSelectedLine(undefined);
          setLineFormMode('add');
          setLineFormDefaultSellerId(undefined);
        }}
        duplicateCheck={duplicateCheck}
        duplicateNotice={duplicateNotice}
        onDuplicateDetected={handleDuplicateDetected}
        onDismissDuplicateNotice={handleDismissDuplicate}
      />

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

      {/* Delete seller group confirmation */}
      <ConfirmDialog
        open={deleteGroupSellerId !== null}
        onOpenChange={(open) => { if (!open) setDeleteGroupSellerId(null); }}
        title="Remove seller column?"
        description="Non-completed items will be moved to Unassigned."
        confirmText="Remove seller"
        destructive
        onConfirm={handleConfirmDeleteGroup}
        contentProps={{ 'data-testid': 'shopping-lists.kanban.delete-group-dialog' } as DialogContentProps}
      />

      {/* Order note edit dialog */}
      {noteEditOpen && (
        <Dialog open={noteEditOpen} onOpenChange={(open) => { if (!open) setNoteEditOpen(false); }}>
          <DialogContent
            data-testid="shopping-lists.kanban.order-note-dialog"
          >
            <DialogHeader>
              <DialogTitle>Edit order note</DialogTitle>
            </DialogHeader>
            <textarea
              className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
              value={noteEditValue}
              onChange={(e) => setNoteEditValue(e.target.value)}
              placeholder="Add a note for this seller order..."
              maxLength={500}
              data-testid="shopping-lists.kanban.order-note-input"
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setNoteEditOpen(false)}>Cancel</Button>
              <Button onClick={() => void handleSaveNote()}>Save note</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
    </>
  );
}

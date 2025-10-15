import { useCallback, useMemo, useRef } from 'react';
import type { ReactElement } from 'react';
import { ConfirmDialog, type DialogContentProps } from '@/components/ui/dialog';
import { useConfirm } from '@/hooks/use-confirm';
import { useDeleteShoppingListMutation, useUpdateShoppingListStatusMutation } from '@/hooks/use-shopping-lists';
import { useToast } from '@/hooks/use-toast';
import type { ShoppingListOverviewSummary } from '@/types/shopping-lists';
import { useFormInstrumentation } from '@/hooks/use-form-instrumentation';

interface UseListDeleteConfirmOptions {
  onDeleted?: (list: ShoppingListOverviewSummary) => void;
  dialogTestId?: string;
}

interface UseListDeleteConfirmResult {
  confirmDelete: (list: ShoppingListOverviewSummary) => Promise<boolean>;
  dialog: ReactElement;
  isDeleting: boolean;
}

export function useListDeleteConfirm(options: UseListDeleteConfirmOptions = {}): UseListDeleteConfirmResult {
  const { onDeleted, dialogTestId = 'shopping-lists.overview.delete-dialog' } = options;
  const { confirm, confirmProps } = useConfirm();
  const deleteMutation = useDeleteShoppingListMutation();
  const { showSuccess, showException } = useToast();

  const confirmDelete = useCallback(async (list: ShoppingListOverviewSummary) => {
    const confirmed = await confirm({
      title: 'Delete shopping list',
      description: `Are you sure you want to delete "${list.name}"? This action cannot be undone.`,
      confirmText: 'Delete',
      destructive: true,
    });

    if (!confirmed) {
      return false;
    }

    try {
      await deleteMutation.mutateAsync(list.id);
      showSuccess(`Deleted shopping list "${list.name}"`);
      onDeleted?.(list);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete shopping list';
      showException(message, error);
      return false;
    }
  }, [confirm, deleteMutation, onDeleted, showException, showSuccess]);

  const dialog = (
    <ConfirmDialog
      {...confirmProps}
      contentProps={{ 'data-testid': dialogTestId } as DialogContentProps}
    />
  );

  return {
    confirmDelete,
    dialog,
    isDeleting: deleteMutation.isPending,
  };
}

interface UseListArchiveConfirmOptions {
  onArchived?: (list: ShoppingListOverviewSummary) => void;
  dialogTestId?: string;
}

interface UseListArchiveConfirmResult {
  confirmArchive: (list: ShoppingListOverviewSummary) => Promise<boolean>;
  dialog: ReactElement;
  isArchiving: boolean;
}

export function useListArchiveConfirm(options: UseListArchiveConfirmOptions = {}): UseListArchiveConfirmResult {
  const { onArchived, dialogTestId = 'shopping-lists.overview.archive-dialog' } = options;
  const { confirm, confirmProps } = useConfirm();
  const archiveMutation = useUpdateShoppingListStatusMutation();
  const { showSuccess, showException } = useToast();
  const pendingListRef = useRef<ShoppingListOverviewSummary | null>(null);
  const formId = useMemo(() => 'ShoppingListStatus:markDone', []);
  const { open, ...confirmDialogProps } = confirmProps;

  const instrumentation = useFormInstrumentation({
    formId,
    isOpen: open,
    snapshotFields: () => {
      const list = pendingListRef.current;
      return {
        listId: list?.id ?? null,
        status: 'done',
      };
    },
  });

  const confirmArchive = useCallback(async (list: ShoppingListOverviewSummary) => {
    pendingListRef.current = list;
    const confirmed = await confirm({
      title: 'Mark list as Done',
      description: `Mark "${list.name}" as Done? This hides it from Active lists.`,
      confirmText: 'Mark Done',
      destructive: true,
    });

    if (!confirmed) {
      pendingListRef.current = null;
      return false;
    }

    const payload = { listId: list.id, status: 'done' as const };
    instrumentation.trackSubmit(payload);

    try {
      await archiveMutation.mutateAsync(payload);
      instrumentation.trackSuccess(payload);
      showSuccess(`Marked shopping list "${list.name}" as Done`);
      onArchived?.(list);
      return true;
    } catch (error) {
      instrumentation.trackError(payload);
      const message = error instanceof Error ? error.message : 'Failed to mark shopping list as Done';
      showException(message, error);
      return false;
    } finally {
      pendingListRef.current = null;
    }
  }, [archiveMutation, confirm, instrumentation, onArchived, showException, showSuccess]);

  const dialog = (
    <ConfirmDialog
      open={open}
      {...confirmDialogProps}
      contentProps={{ 'data-testid': dialogTestId } as DialogContentProps}
    />
  );

  return {
    confirmArchive,
    dialog,
    isArchiving: archiveMutation.isPending,
  };
}

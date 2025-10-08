import { useCallback } from 'react';
import type { ReactElement } from 'react';
import { ConfirmDialog, type DialogContentProps } from '@/components/ui/dialog';
import { useConfirm } from '@/hooks/use-confirm';
import { useDeleteShoppingListMutation } from '@/hooks/use-shopping-lists';
import { useToast } from '@/hooks/use-toast';
import type { ShoppingListOverviewSummary } from '@/types/shopping-lists';

interface UseListDeleteConfirmOptions {
  onDeleted?: (list: ShoppingListOverviewSummary) => void;
}

interface UseListDeleteConfirmResult {
  confirmDelete: (list: ShoppingListOverviewSummary) => Promise<boolean>;
  dialog: ReactElement;
  isDeleting: boolean;
}

export function useListDeleteConfirm(options: UseListDeleteConfirmOptions = {}): UseListDeleteConfirmResult {
  const { onDeleted } = options;
  const { confirm, confirmProps } = useConfirm();
  const deleteMutation = useDeleteShoppingListMutation();
  const { showSuccess, showError } = useToast();

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
      showError(message);
      return false;
    }
  }, [confirm, deleteMutation, onDeleted, showError, showSuccess]);

  const dialog = (
    <ConfirmDialog
      {...confirmProps}
      contentProps={{ 'data-testid': 'shopping-lists.overview.delete-dialog' } as DialogContentProps}
    />
  );

  return {
    confirmDelete,
    dialog,
    isDeleting: deleteMutation.isPending,
  };
}

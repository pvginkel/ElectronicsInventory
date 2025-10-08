import { useEffect, useMemo, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ConceptHeader } from '@/components/shopping-lists/concept-header';
import { ConceptTable } from '@/components/shopping-lists/concept-table';
import { ConceptLineForm } from '@/components/shopping-lists/concept-line-form';
import { MarkReadyFooter } from '@/components/shopping-lists/mark-ready-footer';
import { useShoppingListDetail, useSortedShoppingListLines, useUpdateShoppingListMutation, useMarkShoppingListReadyMutation, useDeleteShoppingListLineMutation } from '@/hooks/use-shopping-lists';
import type { ShoppingListConceptLine, ShoppingListLineSortKey } from '@/types/shopping-lists';
import { useToast } from '@/hooks/use-toast';
import { useListLoadingInstrumentation } from '@/lib/test/query-instrumentation';
import { useConfirm } from '@/hooks/use-confirm';
import { ConfirmDialog } from '@/components/ui/dialog';

const SORT_KEYS: ShoppingListLineSortKey[] = ['description', 'mpn', 'createdAt'];

export const Route = createFileRoute('/shopping-lists/$listId')({
  validateSearch: (search: Record<string, unknown>) => {
    const value = typeof search.sort === 'string' ? search.sort : undefined;
    const sort = SORT_KEYS.includes(value as ShoppingListLineSortKey)
      ? (value as ShoppingListLineSortKey)
      : 'description';
    return { sort };
  },
  component: ShoppingListConceptRoute,
});

function ShoppingListConceptRoute() {
  const params = Route.useParams();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const { showSuccess, showError } = useToast();
  const { confirm, confirmProps } = useConfirm();

  const listId = Number(params.listId);
  const hasValidListId = Number.isFinite(listId);
  const normalizedListId = hasValidListId ? listId : 0;
  const sortKey = (search.sort as ShoppingListLineSortKey | undefined) ?? 'description';

  const {
    shoppingList,
    lines,
    duplicateCheck,
    isLoading,
    isFetching,
    error,
    getReadyMetadata,
    getErrorMetadata,
  } = useShoppingListDetail(hasValidListId ? listId : undefined);

  const sortedLines = useSortedShoppingListLines(lines, sortKey);
  const [lineFormOpen, setLineFormOpen] = useState(false);
  const [lineFormMode, setLineFormMode] = useState<'add' | 'edit'>('add');
  const [selectedLine, setSelectedLine] = useState<ShoppingListConceptLine | undefined>(undefined);
  const [duplicateNotice, setDuplicateNotice] = useState<{ lineId: number; partKey: string } | null>(null);
  const [highlightedLineId, setHighlightedLineId] = useState<number | null>(null);

  const updateMetadataMutation = useUpdateShoppingListMutation(normalizedListId);
  const markReadyMutation = useMarkShoppingListReadyMutation();
  const deleteLineMutation = useDeleteShoppingListLineMutation();

  useEffect(() => {
    if (highlightedLineId == null) {
      return;
    }
    const timer = setTimeout(() => setHighlightedLineId(null), 4000);
    return () => clearTimeout(timer);
  }, [highlightedLineId]);

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
  });

  const handleSortChange = (nextSort: ShoppingListLineSortKey) => {
    if (nextSort === sortKey) return;
    navigate({
      to: '/shopping-lists/$listId',
      params: { listId: params.listId },
      search: { sort: nextSort },
      replace: true,
    });
  };

  const handleOpenCreateLine = () => {
    setLineFormMode('add');
    setSelectedLine(undefined);
    setDuplicateNotice(null);
    setHighlightedLineId(null);
    setLineFormOpen(true);
  };

  const handleEditLine = (line: ShoppingListConceptLine) => {
    setLineFormMode('edit');
    setSelectedLine(line);
    setLineFormOpen(true);
  };

  const handleDeleteLine = async (line: ShoppingListConceptLine) => {
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
      await deleteLineMutation.mutateAsync({ lineId: line.id, listId: line.shoppingListId });
      showSuccess('Removed part from Concept list');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete line';
      showError(message);
    }
  };

  const handleDuplicateDetected = (existingLine: ShoppingListConceptLine, partKey: string) => {
    setDuplicateNotice({ lineId: existingLine.id, partKey });
    setHighlightedLineId(existingLine.id);
  };

  const handleDismissDuplicate = () => {
    setDuplicateNotice(null);
    setHighlightedLineId(null);
  };

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

  const handleUpdateMetadata = async (data: { name: string; description: string | null }) => {
    try {
      await updateMetadataMutation.mutateAsync(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update list details';
      showError(message);
      throw err;
    }
  };

  const handleMarkReady = async () => {
    try {
      await markReadyMutation.mutateAsync({ listId: normalizedListId });
      showSuccess('Concept list marked Ready. Ready view will appear in Phase 2.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to mark list Ready';
      showError(message);
      throw err;
    }
  };

  const listLoaded = shoppingList != null;

  const duplicateCheckForForm = useMemo(() => duplicateCheck, [duplicateCheck]);

  if (!hasValidListId) {
    return (
      <div className="space-y-4" data-testid="shopping-lists.concept.invalid">
        <h1 className="text-3xl font-semibold text-foreground">Shopping Lists</h1>
        <p className="text-sm text-destructive">Invalid shopping list identifier.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="shopping-lists.concept.page">
      <ConceptHeader
        list={shoppingList}
        onUpdateMetadata={handleUpdateMetadata}
        isUpdating={updateMetadataMutation.isPending}
      />

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

      {listLoaded && (
        <MarkReadyFooter
          list={shoppingList}
          onMarkReady={handleMarkReady}
          isMarkingReady={markReadyMutation.isPending}
        />
      )}

      <ConceptLineForm
      open={lineFormOpen}
      mode={lineFormMode}
      listId={listId}
      line={lineFormMode === 'edit' ? selectedLine : undefined}
      onClose={() => {
        setLineFormOpen(false);
        setSelectedLine(undefined);
        setLineFormMode('add');
      }}
      duplicateCheck={duplicateCheckForForm}
      duplicateNotice={duplicateNotice}
      onDuplicateDetected={handleDuplicateDetected}
      onDismissDuplicateNotice={handleDismissDuplicate}
    />

      <ConfirmDialog {...confirmProps} />
    </div>
  );
}

import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { PartList } from '@/components/parts/part-list';
import { AIPartDialog } from '@/components/parts/ai-part-dialog';

interface PartsSearchState {
  search?: string;
  hasStock?: boolean;
  onShoppingList?: boolean;
}

export const Route = createFileRoute('/parts/')({
  validateSearch: (search: Record<string, unknown>): PartsSearchState => {
    const searchTerm = search.search as string;
    const hasStock = search.hasStock;
    const onShoppingList = search.onShoppingList;

    return {
      ...(searchTerm ? { search: searchTerm } : {}),
      ...(hasStock === true || hasStock === 'true' ? { hasStock: true } : {}),
      ...(onShoppingList === true || onShoppingList === 'true' ? { onShoppingList: true } : {}),
    };
  },
  component: PartsRoute,
});

function PartsRoute() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [showAIDialog, setShowAIDialog] = useState(false);

  const handleCreatePart = () => {
    navigate({ to: '/parts/new' });
  };

  const handleCreateWithAI = () => {
    setShowAIDialog(true);
  };

  const handleAIDialogClose = () => {
    setShowAIDialog(false);
  };

  const handlePartCreated = (partId: string, createAnother: boolean) => {
    if (createAnother) {
      return;
    }

    navigate({ to: '/parts/$partId', params: { partId } });
  };

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="parts.page">
      <PartList
        searchTerm={typeof search.search === 'string' ? search.search : ''}
        hasStockFilter={search.hasStock}
        onShoppingListFilter={search.onShoppingList}
        onCreatePart={handleCreatePart}
        onCreateWithAI={handleCreateWithAI}
      />

      <AIPartDialog
        open={showAIDialog}
        onClose={handleAIDialogClose}
        onPartCreated={handlePartCreated}
      />
    </div>
  );
}

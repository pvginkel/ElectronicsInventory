import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ClearButtonIcon } from '@/components/icons/clear-button-icon';
import { useShoppingListsOverview } from '@/hooks/use-shopping-lists';
import { useListLoadingInstrumentation } from '@/lib/test/query-instrumentation';
import { ShoppingListOverviewCard } from './overview-card';
import { ListCreateDialog } from './list-create-dialog';
import { useListDeleteConfirm } from './list-delete-confirm';
import type { ShoppingListOverviewSummary } from '@/types/shopping-lists';
import { Route as ShoppingListsRoute } from '@/routes/shopping-lists/index';
import { Route as ShoppingListDetailRoute } from '@/routes/shopping-lists/$listId';

interface ShoppingListsOverviewProps {
  searchTerm: string;
}

export function ShoppingListsOverview({ searchTerm }: ShoppingListsOverviewProps) {
  const navigate = useNavigate();
  const overviewData = useShoppingListsOverview();
  const lists = overviewData.lists as ShoppingListOverviewSummary[];
  const {
    isLoading,
    isFetching,
    error,
    getReadyMetadata,
    getErrorMetadata,
  } = overviewData;
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [showLoading, setShowLoading] = useState(isLoading);

  const { confirmDelete, dialog: deleteDialog, isDeleting } = useListDeleteConfirm();

  useEffect(() => {
    if (isLoading) {
      setShowLoading(true);
      return;
    }

    if (!isFetching) {
      setShowLoading(false);
    }
  }, [isFetching, isLoading]);

  const filteredLists = useMemo<ShoppingListOverviewSummary[]>(() => {
    if (!searchTerm.trim()) {
      return lists;
    }
    const term = searchTerm.toLowerCase();
    return lists.filter((list) => {
      const matchesName = list.name.toLowerCase().includes(term);
      const matchesDescription = list.description?.toLowerCase().includes(term);
      const matchesSeller = list.primarySellerName?.toLowerCase().includes(term);
      return matchesName || matchesDescription || matchesSeller;
    });
  }, [lists, searchTerm]);

  useListLoadingInstrumentation({
    scope: 'shoppingLists.overview',
    isLoading: showLoading,
    isFetching,
    error,
    getReadyMetadata: () => ({
      ...getReadyMetadata(),
      filtered: filteredLists.length,
      search: searchTerm ? 'active' : 'none',
    }),
    getErrorMetadata,
    getAbortedMetadata: () => ({
      reason: 'component-unmount',
    }),
  });

  const handleSearchChange = (value: string) => {
    navigate({
      to: ShoppingListsRoute.fullPath,
      search: { search: value },
      replace: true,
    });
  };

  const handleClearSearch = () => {
    handleSearchChange('');
  };

  const handleOpenList = (listId: number) => {
    navigate({
      to: ShoppingListDetailRoute.fullPath,
      params: { listId: String(listId) },
      search: { sort: 'description' },
    });
  };

  const handleListCreated = ({ id }: { id: number; name: string }) => {
    navigate({
      to: ShoppingListDetailRoute.fullPath,
      params: { listId: String(id) },
      search: { sort: 'description' },
    });
  };

  const handleDeleteList = async (list: Parameters<typeof confirmDelete>[0]) => {
    await confirmDelete(list);
  };

  if (showLoading) {
    return (
      <div className="space-y-6" data-testid="shopping-lists.overview.loading">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Shopping Lists</h1>
            <p className="text-sm text-muted-foreground">Concept lists backed by the real API</p>
          </div>
          <Button disabled>Create Concept List</Button>
        </div>

        <div className="relative">
          <Input
            placeholder="Search by name, description, or seller…"
            value={searchTerm}
            onChange={(event) => handleSearchChange(event.target.value)}
            className="pr-8"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={handleClearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 hover:bg-muted transition-colors"
              aria-label="Clear search"
            >
              <ClearButtonIcon />
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="h-40 rounded-lg border border-dashed border-muted bg-muted/40 animate-pulse"
              data-testid="shopping-lists.overview.skeleton"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4" data-testid="shopping-lists.overview.error">
        <h1 className="text-3xl font-bold">Shopping Lists</h1>
        <div className="rounded-md border border-destructive/20 bg-destructive/10 p-4">
          <p className="text-sm text-destructive">Failed to load shopping lists.</p>
          <p className="text-xs text-muted-foreground mt-1">{String(error)}</p>
        </div>
      </div>
    );
  }

  const isFiltered = searchTerm.trim().length > 0;
  const hasLists = lists.length > 0;
  const noMatches = isFiltered && filteredLists.length === 0;

  return (
    <div className="space-y-6" data-testid="shopping-lists.overview">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="shopping-lists.overview.heading">
            Shopping Lists
          </h1>
          <p className="text-sm text-muted-foreground">
            Create concept lists, add parts, and track readiness.
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)} data-testid="shopping-lists.overview.create">
          Create Concept List
        </Button>
      </div>

      {hasLists && (
        <div className="relative" data-testid="shopping-lists.overview.search-container">
          <Input
            placeholder="Search by name, description, or seller…"
            value={searchTerm}
            onChange={(event) => handleSearchChange(event.target.value)}
            className="pr-8"
            data-testid="shopping-lists.overview.search"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={handleClearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 hover:bg-muted transition-colors"
              aria-label="Clear search"
              data-testid="shopping-lists.overview.search.clear"
            >
              <ClearButtonIcon />
            </button>
          )}
        </div>
      )}

      {hasLists && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span data-testid="shopping-lists.overview.summary">
            {isFiltered
              ? `${filteredLists.length} of ${lists.length} concept list${lists.length === 1 ? '' : 's'}`
              : `${lists.length} concept list${lists.length === 1 ? '' : 's'}`}
          </span>
          <span data-testid="shopping-lists.overview.status-note">
            Lists stay in Concept until they are marked Ready.
          </span>
        </div>
      )}

      {!hasLists ? (
        <div className="text-center py-16 border border-dashed border-muted rounded-lg" data-testid="shopping-lists.overview.empty">
          <h2 className="text-lg font-semibold">No concept lists yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Start by creating a Concept list, then populate it with parts ready for purchasing.
          </p>
          <Button className="mt-4" onClick={() => setCreateDialogOpen(true)}>
            Create your first list
          </Button>
        </div>
      ) : noMatches ? (
        <div className="text-center py-16 border border-dashed border-muted rounded-lg" data-testid="shopping-lists.overview.no-results">
          <h2 className="text-lg font-semibold">No lists match “{searchTerm}”</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Adjust the search or create a new Concept list tailored to your build.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" data-testid="shopping-lists.overview.grid">
          {filteredLists.map((list) => (
            <ShoppingListOverviewCard
              key={list.id}
              list={list}
              onOpen={() => handleOpenList(list.id)}
              onDelete={() => handleDeleteList(list)}
              disableActions={isDeleting}
            />
          ))}
        </div>
      )}

      <ListCreateDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onCreated={handleListCreated}
      />

      {deleteDialog}
    </div>
  );
}

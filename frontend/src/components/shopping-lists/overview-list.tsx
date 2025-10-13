import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ClearButtonIcon } from '@/components/icons/clear-button-icon';
import { useShoppingListsOverview } from '@/hooks/use-shopping-lists';
import { useListLoadingInstrumentation } from '@/lib/test/query-instrumentation';
import { ShoppingListOverviewCard } from './overview-card';
import { ListCreateDialog } from './list-create-dialog';
import { useListArchiveConfirm, useListDeleteConfirm } from './list-delete-confirm';
import type { ShoppingListOverviewSummary } from '@/types/shopping-lists';
import { Route as ShoppingListsRoute } from '@/routes/shopping-lists/index';
import { Route as ShoppingListDetailRoute } from '@/routes/shopping-lists/$listId';
import { beginUiState, endUiState } from '@/lib/test/ui-state';

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
  const [showDoneSection, setShowDoneSection] = useState(false);
  const filterUiPendingRef = useRef(false);
  const hasEmittedInitialFiltersRef = useRef(false);

  const { confirmDelete, dialog: deleteDialog, isDeleting } = useListDeleteConfirm();
  const { confirmArchive, dialog: archiveDialog, isArchiving } = useListArchiveConfirm();

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

  const activeLists = useMemo(() => filteredLists.filter((list) => list.status !== 'done'), [filteredLists]);
  const doneLists = useMemo(() => filteredLists.filter((list) => list.status === 'done'), [filteredLists]);
  const filtersMetadata = useMemo(() => ({
    activeCount: activeLists.length,
    doneCount: doneLists.length,
    showDoneState: showDoneSection ? 'expanded' : 'collapsed',
  }), [activeLists.length, doneLists.length, showDoneSection]);

  useListLoadingInstrumentation({
    scope: 'shoppingLists.overview',
    isLoading: showLoading,
    isFetching,
    error,
    getReadyMetadata: () => ({
      ...getReadyMetadata(),
      filtered: filteredLists.length,
      search: searchTerm ? 'active' : 'none',
      ...filtersMetadata,
    }),
    getErrorMetadata,
    getAbortedMetadata: () => ({
      reason: 'component-unmount',
      ...getReadyMetadata(),
      filtered: filteredLists.length,
      search: searchTerm ? 'active' : 'none',
      ...filtersMetadata,
    }),
  });

  useEffect(() => {
    if (showLoading || isFetching) {
      return;
    }

    if (!hasEmittedInitialFiltersRef.current) {
      hasEmittedInitialFiltersRef.current = true;
      filterUiPendingRef.current = true;
      beginUiState('shoppingLists.overview.filters');
    }

    if (filterUiPendingRef.current) {
      filterUiPendingRef.current = false;
      endUiState('shoppingLists.overview.filters', filtersMetadata);
    }
  }, [filtersMetadata, isFetching, showLoading]);

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

  const handleArchiveList = async (list: ShoppingListOverviewSummary) => {
    filterUiPendingRef.current = true;
    beginUiState('shoppingLists.overview.filters');
    const archived = await confirmArchive(list);
    if (!archived) {
      filterUiPendingRef.current = false;
      endUiState('shoppingLists.overview.filters', filtersMetadata);
    }
  };

  const handleToggleDoneSection = () => {
    filterUiPendingRef.current = true;
    beginUiState('shoppingLists.overview.filters');
    setShowDoneSection((previous) => !previous);
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
  const hasActiveLists = activeLists.length > 0;
  const hasDoneLists = doneLists.length > 0;

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
        <div className="flex flex-col gap-2 rounded-md border border-muted/40 bg-muted/20 px-4 py-3 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
          <span data-testid="shopping-lists.overview.summary">
            Active lists ({activeLists.length}) • Done lists ({doneLists.length}){isFiltered ? ` — showing ${filteredLists.length} match${filteredLists.length === 1 ? '' : 'es'}` : ''}
          </span>
          <span data-testid="shopping-lists.overview.status-note">
            Done lists stay hidden until expanded so the Active section reflects work in flight.
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
        <div className="space-y-8">
          <section data-testid="shopping-lists.overview.active-section">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">
                Active lists ({activeLists.length})
              </h2>
            </div>
            {hasActiveLists ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="shopping-lists.overview.active-grid">
                {activeLists.map((list) => (
                  <ShoppingListOverviewCard
                    key={list.id}
                    list={list}
                    onOpen={() => handleOpenList(list.id)}
                    onDelete={() => handleDeleteList(list)}
                    onMarkDone={() => handleArchiveList(list)}
                    disableActions={isDeleting || isArchiving}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-muted px-4 py-6 text-sm text-muted-foreground" data-testid="shopping-lists.overview.active-empty">
                No active lists match the current filters.
              </div>
            )}
          </section>

          {hasDoneLists && (
            <section data-testid="shopping-lists.overview.done-section">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-foreground">
                  Done lists ({doneLists.length})
                </h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleToggleDoneSection}
                  data-testid="shopping-lists.overview.done.toggle"
                >
                  {showDoneSection ? 'Hide Done lists' : 'Show Done lists'}
                </Button>
              </div>
              {showDoneSection ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="shopping-lists.overview.done-grid">
                  {doneLists.map((list) => (
                    <ShoppingListOverviewCard
                      key={list.id}
                      list={list}
                      onOpen={() => handleOpenList(list.id)}
                      onDelete={() => handleDeleteList(list)}
                      disableActions={isDeleting || isArchiving}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-md border border-dashed border-muted px-4 py-6 text-sm text-muted-foreground" data-testid="shopping-lists.overview.done-collapsed">
                  Done lists are hidden by default. Expand to review archived work.
                </div>
              )}
            </section>
          )}
        </div>
      )}

      <ListCreateDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onCreated={handleListCreated}
      />

      {deleteDialog}
      {archiveDialog}
    </div>
  );
}

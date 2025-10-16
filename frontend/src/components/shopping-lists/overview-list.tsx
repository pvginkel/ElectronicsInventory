import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { ListScreenLayout } from '@/components/layout/list-screen-layout';
import { ListScreenCounts } from '@/components/layout/list-screen-counts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SegmentedTabs } from '@/components/ui/segmented-tabs';
import { ClearButtonIcon } from '@/components/icons/clear-button-icon';
import { useShoppingListsOverview } from '@/hooks/use-shopping-lists';
import { useListLoadingInstrumentation } from '@/lib/test/query-instrumentation';
import { ShoppingListOverviewCard } from './overview-card';
import { ListCreateDialog } from './list-create-dialog';
import type { ShoppingListOverviewSummary } from '@/types/shopping-lists';
import { Route as ShoppingListsRoute } from '@/routes/shopping-lists/index';
import { Route as ShoppingListDetailRoute } from '@/routes/shopping-lists/$listId';
import { beginUiState, endUiState } from '@/lib/test/ui-state';

interface ShoppingListsOverviewProps {
  searchTerm: string;
}

type OverviewTab = 'active' | 'completed';

const OVERVIEW_TAB_STORAGE_KEY = 'shoppingLists.overview.tab';

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
  const [activeTab, setActiveTab] = useState<OverviewTab>(() => {
    if (typeof window === 'undefined') {
      return 'active';
    }

    const stored = window.localStorage.getItem(OVERVIEW_TAB_STORAGE_KEY);
    return stored === 'completed' ? 'completed' : 'active';
  });
  const filterUiPendingRef = useRef(false);
  const hasEmittedInitialFiltersRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(OVERVIEW_TAB_STORAGE_KEY, activeTab);
  }, [activeTab]);

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

  const activeLists = useMemo(
    () => filteredLists.filter((list) => list.status !== 'done'),
    [filteredLists],
  );
  const completedLists = useMemo(
    () => filteredLists.filter((list) => list.status === 'done'),
    [filteredLists],
  );
  const visibleLists = useMemo(
    () => (activeTab === 'active' ? activeLists : completedLists),
    [activeLists, activeTab, completedLists],
  );
  const totalActiveCount = useMemo(
    () => lists.filter((list) => list.status !== 'done').length,
    [lists],
  );
  const totalCompletedCount = useMemo(
    () => lists.filter((list) => list.status === 'done').length,
    [lists],
  );
  const totalInActiveTab = activeTab === 'active' ? totalActiveCount : totalCompletedCount;
  const filteredCount = useMemo(() => {
    if (!searchTerm.trim()) {
      return undefined;
    }

    if (filteredLists.length === lists.length) {
      return undefined;
    }

    return filteredLists.length;
  }, [filteredLists, lists, searchTerm]);
  // Instrumentation metadata mirrors the Playwright expectations for filter + tab counts.
  const filtersMetadata = useMemo(() => {
    const base = {
      activeTab,
      activeCount: activeLists.length,
      completedCount: completedLists.length,
      visibleCount: visibleLists.length,
      totalActiveCount,
      totalCompletedCount,
      totalInView: totalInActiveTab,
    };

    if (typeof filteredCount === 'number') {
      return {
        ...base,
        filteredCount,
      };
    }

    return base;
  }, [
    activeLists.length,
    activeTab,
    completedLists.length,
    filteredCount,
    totalActiveCount,
    totalCompletedCount,
    totalInActiveTab,
    visibleLists.length,
  ]);
  const searchState = searchTerm.trim() ? 'active' : 'none';

  useListLoadingInstrumentation({
    scope: 'shoppingLists.overview',
    isLoading: showLoading,
    isFetching,
    error,
    getReadyMetadata: () => ({
      ...getReadyMetadata(),
      ...(typeof filteredCount === 'number' ? { filtered: filteredCount } : {}),
      search: searchState,
      ...filtersMetadata,
    }),
    getErrorMetadata,
    getAbortedMetadata: () => ({
      reason: 'component-unmount',
      ...getReadyMetadata(),
      ...(typeof filteredCount === 'number' ? { filtered: filteredCount } : {}),
      search: searchState,
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
    filterUiPendingRef.current = true;
    beginUiState('shoppingLists.overview.filters');
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
    const originSearch = searchTerm.length > 0 ? searchTerm : undefined;
    navigate({
      to: ShoppingListDetailRoute.fullPath,
      params: { listId: String(listId) },
      search: {
        sort: 'description',
        originSearch,
      },
    });
  };

  const handleListCreated = ({ id }: { id: number; name: string }) => {
    const originSearch = searchTerm.length > 0 ? searchTerm : undefined;
    navigate({
      to: ShoppingListDetailRoute.fullPath,
      params: { listId: String(id) },
      search: {
        sort: 'description',
        originSearch,
      },
    });
  };

  const handleSelectTab = (tab: OverviewTab) => {
    if (tab === activeTab) {
      return;
    }

    filterUiPendingRef.current = true;
    beginUiState('shoppingLists.overview.filters');
    setActiveTab(tab);
  };

  const handleSegmentedTabChange = (tab: string) => {
    if (tab === 'active' || tab === 'completed') {
      handleSelectTab(tab);
    }
  };

  if (showLoading) {
    return (
      <div data-testid="shopping-lists.overview.loading">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">Shopping Lists</h1>
          <Button disabled>Create Concept List</Button>
        </div>

        <div className="relative mb-6">
          <Input
            placeholder="Search..."
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
  const hasVisibleLists = visibleLists.length > 0;
  const summaryCategory = activeTab === 'active' ? 'Active' : 'Completed';
  const tabItems = [
    {
      id: 'active',
      label: 'Active',
      count: totalActiveCount,
      countLabel: 'total active lists',
      testId: 'shopping-lists.overview.tabs.active',
    },
    {
      id: 'completed',
      label: 'Completed',
      count: totalCompletedCount,
      countLabel: 'total completed lists',
      testId: 'shopping-lists.overview.tabs.completed',
    },
  ];
  const breadcrumbsNode = (
    <span data-testid="shopping-lists.overview.breadcrumb">Shopping Lists</span>
  );

  const countsNode = (
    <div data-testid="shopping-lists.overview.summary">
      <ListScreenCounts
        visible={visibleLists.length}
        total={totalInActiveTab}
        category={summaryCategory}
        noun={{ singular: 'list', plural: 'lists' }}
        filtered={filteredCount}
      />
    </div>
  );

  const searchNode = (
    <div className="relative" data-testid="shopping-lists.overview.search-container">
      <Input
        placeholder="Search..."
        value={searchTerm}
        onChange={(event) => handleSearchChange(event.target.value)}
        className="w-full pr-8"
        data-testid="shopping-lists.overview.search"
      />
      {searchTerm && (
        <button
          type="button"
          onClick={handleClearSearch}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 transition-colors hover:bg-muted"
          aria-label="Clear search"
          data-testid="shopping-lists.overview.search.clear"
        >
          <ClearButtonIcon />
        </button>
      )}
    </div>
  );

  const segmentedTabsNode = (
    <SegmentedTabs
      value={activeTab}
      onValueChange={handleSegmentedTabChange}
      items={tabItems}
      ariaLabel="Shopping list status"
      data-testid="shopping-lists.overview.tabs"
      className="w-full"
    />
  );

  const content = !hasLists ? (
    <div
      className="rounded-lg border border-dashed border-muted py-16 text-center"
      data-testid="shopping-lists.overview.empty"
    >
      <h2 className="text-lg font-semibold">No concept lists yet</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Start by creating a Concept list, then populate it with parts ready for purchasing.
      </p>
      <Button className="mt-4" onClick={() => setCreateDialogOpen(true)}>
        Create your first list
      </Button>
    </div>
  ) : noMatches ? (
    <div
      className="rounded-lg border border-dashed border-muted py-16 text-center"
      data-testid="shopping-lists.overview.no-results"
    >
      <h2 className="text-lg font-semibold">No lists match “{searchTerm}”</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Adjust the search or create a new Concept list tailored to your build.
      </p>
    </div>
  ) : hasVisibleLists ? (
    <div
      className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
      data-testid={`shopping-lists.overview.grid.${activeTab}`}
    >
      {visibleLists.map((list) => (
        <ShoppingListOverviewCard
          key={list.id}
          list={list}
          onOpen={() => handleOpenList(list.id)}
        />
      ))}
    </div>
  ) : (
    <div
      className="rounded-md border border-dashed border-muted px-4 py-6 text-sm text-muted-foreground"
      data-testid={`shopping-lists.overview.${activeTab}.empty`}
    >
      {isFiltered
        ? `No ${summaryCategory.toLowerCase()} lists match the current filters.`
        : `No ${summaryCategory.toLowerCase()} lists yet.`}
    </div>
  );

  return (
    <>
      <ListScreenLayout
        rootTestId="shopping-lists.overview"
        headerTestId="shopping-lists.overview.header"
        contentTestId="shopping-lists.overview.content"
        breadcrumbs={breadcrumbsNode}
        className="flex-1"
        title={<span data-testid="shopping-lists.overview.heading">Shopping Lists</span>}
        actions={
          <Button onClick={() => setCreateDialogOpen(true)} data-testid="shopping-lists.overview.create">
            Create Concept List
          </Button>
        }
        search={searchNode}
        segmentedTabs={segmentedTabsNode}
        counts={countsNode}
      >
        {content}
      </ListScreenLayout>

      <ListCreateDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onCreated={handleListCreated}
      />
    </>
  );
}

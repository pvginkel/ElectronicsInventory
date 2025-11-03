import { useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, CollectionGrid, EmptyState } from '@/components/ui';
import { SegmentedTabs } from '@/components/ui/segmented-tabs';
import { ListScreenLayout } from '@/components/layout/list-screen-layout';
import { ListScreenCounts } from '@/components/layout/list-screen-counts';
import { DebouncedSearchInput } from '@/components/ui/debounced-search-input';
import { Skeleton } from '@/components/ui/skeleton';
import { KitCard } from '@/components/kits/kit-card';
import { useKitsOverview } from '@/hooks/use-kits';
import { useKitPickListMemberships, useKitShoppingListMemberships } from '@/hooks/use-kit-memberships';
import { useListLoadingInstrumentation } from '@/lib/test/query-instrumentation';
import type { KitStatus } from '@/types/kits';

interface KitOverviewListProps {
  status: KitStatus;
  searchTerm: string;
  onStatusChange: (status: KitStatus) => void;
  onCreateKit: () => void;
  onOpenDetail: (kitId: number) => void;
}

const TAB_LABELS: Record<KitStatus, string> = {
  active: 'Active',
  archived: 'Archived',
};

export function KitOverviewList({
  status,
  searchTerm,
  onStatusChange,
  onCreateKit,
  onOpenDetail,
}: KitOverviewListProps) {
  const { queries, buckets, counts } = useKitsOverview(searchTerm);

  const preserveSearchParams = useCallback((current: Record<string, unknown>) => ({
    status: current.status as KitStatus,
  }), []);

  const allKitIds = useMemo(() => {
    const ids = new Set<number>();
    for (const kit of buckets.active) {
      ids.add(kit.id);
    }
    for (const kit of buckets.archived) {
      ids.add(kit.id);
    }
    return Array.from(ids);
  }, [buckets.active, buckets.archived]);

  const shoppingMemberships = useKitShoppingListMemberships(allKitIds);
  const pickMemberships = useKitPickListMemberships(allKitIds);

  const activeKits = status === 'archived' ? buckets.archived : buckets.active;
  const searchActive = searchTerm.trim().length > 0;
  const hasAnyKits = buckets.active.length + buckets.archived.length > 0;
  const isLoading = queries.active.isLoading || queries.archived.isLoading;
  const isFetching = queries.active.isFetching || queries.archived.isFetching;
  const activeError = status === 'archived' ? queries.archived.error : queries.active.error;
  const fallbackError = queries.active.error ?? queries.archived.error;
  const error = activeError ?? fallbackError;

  useListLoadingInstrumentation({
    scope: 'kits.overview',
    isLoading,
    isFetching,
    error,
    getReadyMetadata: () => ({
      status,
      totals: counts,
      visible: activeKits.length,
      ...(searchActive ? { filtered: activeKits.length } : {}),
      searchTerm: searchActive ? searchTerm : null,
    }),
    getErrorMetadata: (err) => ({
      status,
      totals: counts,
      visible: activeKits.length,
      searchTerm: searchActive ? searchTerm : null,
      message: err instanceof Error ? err.message : String(err),
    }),
    getAbortedMetadata: () => ({
      status,
      totals: counts,
      searchTerm: searchActive ? searchTerm : null,
    }),
  });

  const handleTabChange = useCallback(
    (next: string) => {
      if (next === status) {
        return;
      }
      if (next === 'active' || next === 'archived') {
        onStatusChange(next);
      }
    },
    [onStatusChange, status],
  );

  const tabItems = useMemo(
    () => [
      {
        id: 'active',
        label: 'Active',
        count: counts.active,
        countLabel: 'total active kits',
        testId: 'kits.overview.tabs.active',
      },
      {
        id: 'archived',
        label: 'Archived',
        count: counts.archived,
        countLabel: 'total archived kits',
        testId: 'kits.overview.tabs.archived',
      },
    ],
    [counts.active, counts.archived],
  );

  const breadcrumbsNode = (
    <span data-testid="kits.overview.breadcrumb">Kits</span>
  );

  const countsNode = (
    <ListScreenCounts
      visible={activeKits.length}
      total={counts[status]}
      category={TAB_LABELS[status]}
      noun={{ singular: 'kit', plural: 'kits' }}
      filtered={searchActive ? activeKits.length : undefined}
    />
  );

  const searchNode = (
    <DebouncedSearchInput
      searchTerm={searchTerm}
      routePath="/kits"
      placeholder="Search kits..."
      testIdPrefix="kits.overview"
      preserveSearchParams={preserveSearchParams}
    />
  );

  const segmentedTabs = (
    <SegmentedTabs
      value={status}
      onValueChange={handleTabChange}
      items={tabItems}
      ariaLabel="Kit lifecycle status"
      data-testid="kits.overview.tabs"
      className="w-full"
    />
  );

  let content: ReactNode;

  if (isLoading) {
    content = (
      <div className="space-y-6" data-testid="kits.overview.loading">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton
              key={index}
              height="h-40"
              testId="kits.overview.skeleton"
            />
          ))}
        </div>
      </div>
    );
  } else if (error) {
    content = (
      <Alert
        variant="error"
        icon={true}
        title="Unable to load kits"
        testId="kits.overview.error"
        action={
          <Button variant="outline" onClick={() => void (status === 'archived' ? queries.archived.refetch() : queries.active.refetch())} data-testid="kits.overview.error.retry">
            Retry
          </Button>
        }
      >
        <p className="text-sm text-muted-foreground">
          {error instanceof Error ? error.message : String(error)}
        </p>
      </Alert>
    );
  } else if (!hasAnyKits && !searchActive) {
    content = (
      <EmptyState
        testId="kits.overview.empty"
        title="No kits yet"
        description="Create your first kit to start planning builds and tracking sourcing work."
        action={{
          label: 'Create your first kit',
          onClick: onCreateKit,
          testId: 'kits.overview.empty.cta',
        }}
      />
    );
  } else if (searchActive && activeKits.length === 0) {
    content = (
      <EmptyState
        testId="kits.overview.no-results"
        title={`No kits match "${searchTerm}"`}
        description="Try adjusting the search term or creating a new kit for the build you need."
      />
    );
  } else if (activeKits.length === 0) {
    content = (
      <EmptyState
        variant="minimal"
        testId={`kits.overview.${status}.empty`}
        title={`No ${TAB_LABELS[status].toLowerCase()} kits yet.`}
      />
    );
  } else {
    content = (
      <CollectionGrid testId={`kits.overview.grid.${status}`}>
        {activeKits.map((kit) => (
          <KitCard
            key={kit.id}
            kit={kit}
            shoppingIndicator={{
              summary: shoppingMemberships.summaryByKitId.get(kit.id),
              status: shoppingMemberships.status,
              fetchStatus: shoppingMemberships.fetchStatus,
              error: shoppingMemberships.error,
            }}
            pickIndicator={{
              summary: pickMemberships.summaryByKitId.get(kit.id),
              status: pickMemberships.status,
              fetchStatus: pickMemberships.fetchStatus,
              error: pickMemberships.error,
            }}
            onOpenDetail={onOpenDetail}
          />
        ))}
      </CollectionGrid>
    );
  }

  return (
    <ListScreenLayout
      rootTestId="kits.overview"
      headerTestId="kits.overview.header"
      contentTestId="kits.overview.content"
      breadcrumbs={breadcrumbsNode}
      title={<span data-testid="kits.overview.title">Kits</span>}
      actions={
        <Button onClick={onCreateKit} data-testid="kits.overview.new">
          Add Kit
        </Button>
      }
      search={searchNode}
      segmentedTabs={segmentedTabs}
      counts={countsNode}
    >
      {content}
    </ListScreenLayout>
  );
}

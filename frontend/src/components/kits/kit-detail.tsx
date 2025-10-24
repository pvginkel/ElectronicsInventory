import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { AlertTriangle, Plus } from 'lucide-react';
import { DetailScreenLayout } from '@/components/layout/detail-screen-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { createKitDetailHeaderSlots } from '@/components/kits/kit-detail-header';
import { KitBOMTable } from '@/components/kits/kit-bom-table';
import { useKitDetail } from '@/hooks/use-kit-detail';
import type { UseKitDetailResult } from '@/hooks/use-kit-detail';
import { useKitContents } from '@/hooks/use-kit-contents';
import { useListLoadingInstrumentation } from '@/lib/test/query-instrumentation';
import { useUiStateInstrumentation } from '@/lib/test/ui-state';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { KitContentAggregates, KitContentRow, KitDetail } from '@/types/kits';
import type { KitStatus } from '@/types/kits';
import { KitMetadataDialog } from '@/components/kits/kit-metadata-dialog';
import { KitPickListCreateDialog } from '@/components/kits/kit-pick-list-create-dialog';

interface KitDetailProps {
  kitId: string;
  overviewStatus: KitStatus;
  overviewSearch?: string;
}

const SUMMARY_FORMATTER = new Intl.NumberFormat();

export function KitDetail({ kitId, overviewStatus, overviewSearch }: KitDetailProps) {
  const {
    isKitIdValid,
    detail,
    contents,
    aggregates,
    query,
    getDetailReadyMetadata,
    getDetailErrorMetadata,
    getDetailAbortedMetadata,
    getContentsReadyMetadata,
    getContentsErrorMetadata,
    getContentsAbortedMetadata,
  } = useKitDetail(kitId);

  const queryStatus = query.status;
  const queryFetchStatus = query.fetchStatus;

  const isPending = isKitIdValid && queryStatus === 'pending';
  const hasError = isKitIdValid && queryStatus === 'error';
  const error = hasError ? query.error : undefined;

  useListLoadingInstrumentation({
    scope: 'kits.detail',
    isLoading: isKitIdValid ? queryStatus === 'pending' : false,
    isFetching: isKitIdValid ? queryFetchStatus === 'fetching' : false,
    error,
    getReadyMetadata: getDetailReadyMetadata,
    getErrorMetadata: getDetailErrorMetadata,
    getAbortedMetadata: getDetailAbortedMetadata,
  });

  useListLoadingInstrumentation({
    scope: 'kits.detail.contents',
    isLoading: isKitIdValid ? queryStatus === 'pending' : false,
    isFetching: isKitIdValid ? queryFetchStatus === 'fetching' : false,
    error,
    getReadyMetadata: getContentsReadyMetadata,
    getErrorMetadata: getContentsErrorMetadata,
    getAbortedMetadata: getContentsAbortedMetadata,
  });

  const getLinksReadyMetadata = useCallback(
    () => buildLinkReadyMetadata(detail),
    [detail],
  );

  useUiStateInstrumentation('kits.detail.links', {
    isLoading: isKitIdValid ? queryStatus === 'pending' : false,
    error,
    getReadyMetadata: getLinksReadyMetadata,
    getErrorMetadata: getDetailErrorMetadata,
  });

  const [isMetadataDialogOpen, setMetadataDialogOpen] = useState(false);
  const [isCreatePickListDialogOpen, setCreatePickListDialogOpen] = useState(false);

  const handleMetadataOpen = useCallback(() => {
    if (!detail || detail.status !== 'active') {
      return;
    }
    setMetadataDialogOpen(true);
  }, [detail]);

  const handleCreatePickListOpen = useCallback(() => {
    if (!detail || detail.status !== 'active') {
      return;
    }
    setCreatePickListDialogOpen(true);
  }, [detail]);

  const headerSlots = useMemo(
    () =>
      createKitDetailHeaderSlots({
        kit: detail,
        isLoading: isPending,
        overviewStatus,
        overviewSearch,
        onEditMetadata: handleMetadataOpen,
        onCreatePickList: handleCreatePickListOpen,
      }),
    [
      detail,
      handleCreatePickListOpen,
      handleMetadataOpen,
      isPending,
      overviewSearch,
      overviewStatus,
    ]
  );

  useEffect(() => {
    if (!detail || detail.status !== 'active') {
      setCreatePickListDialogOpen(false);
    }
  }, [detail]);

  const content = (() => {
    if (isPending) {
      return <KitDetailLoadingState />;
    }

    if (hasError) {
      return (
        <KitDetailErrorState
          kitId={kitId}
          error={error}
          overviewStatus={overviewStatus}
          overviewSearch={overviewSearch}
          onRetry={() => query.refetch()}
        />
      );
    }

    if (!detail) {
      return (
        <Card className="p-6" data-testid="kits.detail.not-found">
          <div className="text-center">
            <h2 className="mb-2 text-lg font-semibold">Kit not found</h2>
            <p className="text-muted-foreground">
              The kit with ID &ldquo;{kitId}&rdquo; could not be found.
            </p>
          </div>
        </Card>
      );
    }

    return (
      <KitDetailLoaded
        detail={detail}
        contents={contents}
        aggregates={aggregates}
        query={query}
      />
    );
  })();

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="kits.detail">
      <DetailScreenLayout
        rootTestId="kits.detail.layout"
        headerTestId="kits.detail.header"
        contentTestId="kits.detail.content"
        actionsTestId="kits.detail.actions"
        breadcrumbs={headerSlots.breadcrumbs}
        title={headerSlots.title}
        titleMetadata={headerSlots.titleMetadata}
        description={headerSlots.description}
        metadataRow={headerSlots.metadataRow}
        actions={headerSlots.actions}
      >
        {content}
      </DetailScreenLayout>
      {detail ? (
        <KitMetadataDialog
          open={isMetadataDialogOpen}
          kit={detail}
          onOpenChange={setMetadataDialogOpen}
          onSuccess={() => {
            void query.refetch();
          }}
        />
      ) : null}
      {detail ? (
        <KitPickListCreateDialog
          open={isCreatePickListDialogOpen}
          kit={detail}
          onOpenChange={setCreatePickListDialogOpen}
          onSuccess={async () => {
            await query.refetch();
          }}
        />
      ) : null}
    </div>
  );
}

interface KitDetailLoadedProps {
  detail: KitDetail;
  contents: KitContentRow[];
  aggregates: KitContentAggregates;
  query: UseKitDetailResult['query'];
}

// Renders the BOM card with inline editing controls once kit data is ready.
function KitDetailLoaded({ detail, contents, aggregates, query }: KitDetailLoadedProps) {
  const kitContents = useKitContents({
    detail,
    contents,
    query,
  });

  const handleAddClick = () => {
    if (kitContents.create.isOpen) {
      kitContents.create.close();
    } else {
      kitContents.create.open();
    }
  };

  const addButtonDisabled =
    kitContents.isArchived || kitContents.create.isSubmitting || kitContents.isMutationPending;
  const addButtonLabel = kitContents.create.isOpen ? 'Close editor' : 'Add part';
  const addButtonTitle = kitContents.isArchived ? 'Archived kits cannot be edited' : undefined;

  return (
    <div className="space-y-6" data-testid="kits.detail.body">
      <Card className="p-0">
        <CardHeader className="flex flex-col gap-3 border-b border-border/70 px-4 py-3 md:flex-row md:items-center md:justify-between space-y-0">
          <div>
            <CardTitle data-testid="kits.detail.table.title">Bill of materials</CardTitle>
            <p className="text-sm text-muted-foreground">
              Availability reflects stock after honoring reservations from other kits.
            </p>
          </div>
          <div className="flex flex-row items-center gap-5">
            <KitBOMSummary aggregates={aggregates} />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleAddClick}
              disabled={addButtonDisabled}
              title={addButtonTitle}
              aria-disabled={kitContents.isArchived ? 'true' : undefined}
              className="inline-flex items-center gap-2"
              data-testid="kits.detail.table.add"
            >
              <Plus className="h-4 w-4" />
              <span>{addButtonLabel}</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-0 py-0">
          <KitBOMTable rows={contents} controls={kitContents} />
        </CardContent>
      </Card>
    </div>
  );
}

function KitDetailLoadingState() {
  return (
    <div className="space-y-6" data-testid="kits.detail.loading">
      <Card>
        <CardHeader className="flex flex-col gap-3 border-b border-border/70 px-6 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="h-6 w-36 animate-pulse rounded bg-muted" />
            <div className="mt-2 h-4 w-64 animate-pulse rounded bg-muted" />
          </div>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-7 w-32 animate-pulse rounded bg-muted" />
            ))}
          </div>
        </CardHeader>
        <CardContent className="px-0 py-0">
          <div className="divide-y divide-border/70">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="grid grid-cols-[2fr_repeat(6,minmax(4rem,1fr))_1.5fr] gap-4 px-6 py-4">
                {Array.from({ length: 8 }).map((__, cellIndex) => (
                  <div
                    key={`${index}-${cellIndex}`}
                    className="h-4 w-full animate-pulse rounded bg-muted"
                  />
                ))}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface KitDetailErrorStateProps {
  kitId: string;
  error: unknown;
  overviewStatus: KitStatus;
  overviewSearch?: string;
  onRetry: () => void;
}

function KitDetailErrorState({
  kitId,
  error,
  overviewStatus,
  overviewSearch,
  onRetry,
}: KitDetailErrorStateProps) {
  const message = error instanceof Error ? error.message : 'Unable to load kit details.';
  const searchState = overviewSearch
    ? { status: overviewStatus, search: overviewSearch }
    : { status: overviewStatus };

  return (
    <Card data-testid="kits.detail.error">
      <CardHeader className="flex flex-row items-center gap-2">
        <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
        <CardTitle>Failed to load kit</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          We couldn&rsquo;t load kit &ldquo;{kitId}&rdquo;. Error: {message}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onRetry} data-testid="kits.detail.error.retry">
            Try again
          </Button>
          <Button asChild variant="ghost">
            <Link to="/kits" search={searchState}>
              Return to Kits
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function buildLinkReadyMetadata(detail: KitDetail | undefined) {
  if (!detail) {
    return undefined;
  }

  const shoppingStatusCounts: Record<string, number> = {
    concept: 0,
    ready: 0,
    done: 0,
  };

  for (const link of detail.shoppingListLinks) {
    shoppingStatusCounts[link.status] = (shoppingStatusCounts[link.status] ?? 0) + 1;
  }

  const pickListStatusCounts: Record<string, number> = {
    open: 0,
    completed: 0,
  };

  for (const pickList of detail.pickLists) {
    pickListStatusCounts[pickList.status] =
      (pickListStatusCounts[pickList.status] ?? 0) + 1;
  }

  return {
    kitId: detail.id,
    hasLinkedWork:
      detail.shoppingListLinks.length > 0 || detail.pickLists.length > 0,
    shoppingLists: {
      count: detail.shoppingListLinks.length,
      ids: detail.shoppingListLinks.map((link) => link.shoppingListId),
      statusCounts: shoppingStatusCounts,
    },
    pickLists: {
      count: detail.pickLists.length,
      ids: detail.pickLists.map((pickList) => pickList.id),
      statusCounts: pickListStatusCounts,
    },
  };
}

interface KitBOMSummaryProps {
  aggregates: KitContentAggregates;
}

function KitBOMSummary({ aggregates }: KitBOMSummaryProps) {
  return (
    <div className="flex flex-wrap gap-2" data-testid="kits.detail.table.summary">
      <SummaryBadge
        label="Total required"
        value={aggregates.totalRequired}
        className="bg-slate-100 text-slate-700"
        testId="kits.detail.table.summary.total"
      />
      <SummaryBadge
        label="Shortfall"
        value={aggregates.totalShortfall}
        className="bg-rose-100 text-rose-800"
        testId="kits.detail.table.summary.shortfall"
      />
    </div>
  );
}

interface SummaryBadgeProps {
  label: string;
  value: number;
  className?: string;
  testId: string;
}

function SummaryBadge({ label, value, className, testId }: SummaryBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn('text-xs', className)}
      data-testid={testId}
    >
      {label}: {SUMMARY_FORMATTER.format(value)}
    </Badge>
  );
}

import { useMemo } from 'react';
import { Link } from '@tanstack/react-router';
import { AlertTriangle } from 'lucide-react';

import { DetailScreenLayout } from '@/components/layout/detail-screen-layout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PickListLines } from '@/components/pick-lists/pick-list-lines';
import { usePickListDetail } from '@/hooks/use-pick-list-detail';
import { usePickListExecution } from '@/hooks/use-pick-list-execution';
import { usePickListAvailability } from '@/hooks/use-pick-list-availability';
import { useGetKitsByKitId } from '@/lib/api/generated/hooks';
import { useListLoadingInstrumentation } from '@/lib/test/query-instrumentation';
import { useUiStateInstrumentation } from '@/lib/test/ui-state';
import { cn } from '@/lib/utils';
import type { KitStatus } from '@/types/kits';
import type { PickListDetail as PickListDetailModel, PickListLineGroup } from '@/types/pick-lists';

const NUMBER_FORMATTER = new Intl.NumberFormat();
const STATUS_LABEL: Record<'open' | 'completed', string> = {
  open: 'Open',
  completed: 'Completed',
};

const STATUS_BADGE_CLASS: Record<'open' | 'completed', string> = {
  open: 'bg-amber-100 text-amber-800 border-amber-200',
  completed: 'bg-emerald-100 text-emerald-800 border-emerald-200',
};

interface PickListDetailProps {
  pickListId: string;
  kitOverviewStatus?: KitStatus;
  kitOverviewSearch?: string;
}

export function PickListDetail({
  pickListId,
  kitOverviewStatus,
  kitOverviewSearch,
}: PickListDetailProps) {
  const {
    pickListId: normalizedPickListId,
    isPickListIdValid,
    detail,
    lineGroups,
    uniquePartKeys,
    query,
    getDetailReadyMetadata,
    getDetailErrorMetadata,
    getDetailAbortedMetadata,
    getLinesReadyMetadata,
    getLinesErrorMetadata,
    getLinesAbortedMetadata,
  } = usePickListDetail(pickListId);

  const {
    isExecuting: isExecutionPending,
    pickLine,
    undoLine,
    pendingLineId,
    pendingAction,
  } = usePickListExecution({
    pickListId: normalizedPickListId,
    kitId: detail?.kitId,
  });

  const queryStatus = query.status;
  const queryFetchStatus = query.fetchStatus;

  const isPending = isPickListIdValid && queryStatus === 'pending';
  const hasError = isPickListIdValid && queryStatus === 'error';
  const error = hasError ? query.error : undefined;

  useListLoadingInstrumentation({
    scope: 'pickLists.detail',
    isLoading: isPickListIdValid ? queryStatus === 'pending' : false,
    isFetching: isPickListIdValid ? queryFetchStatus === 'fetching' : false,
    error,
    getReadyMetadata: getDetailReadyMetadata,
    getErrorMetadata: getDetailErrorMetadata,
    getAbortedMetadata: getDetailAbortedMetadata,
  });

  useListLoadingInstrumentation({
    scope: 'pickLists.detail.lines',
    isLoading: isPickListIdValid ? queryStatus === 'pending' : false,
    isFetching: isPickListIdValid ? queryFetchStatus === 'fetching' : false,
    error,
    getReadyMetadata: getLinesReadyMetadata,
    getErrorMetadata: getLinesErrorMetadata,
    getAbortedMetadata: getLinesAbortedMetadata,
  });

  const isUiLoading = isPickListIdValid && (queryStatus === 'pending' || queryFetchStatus === 'fetching');

  useUiStateInstrumentation('pickLists.detail.load', {
    isLoading: isUiLoading,
    error,
    getReadyMetadata: getDetailReadyMetadata,
    getErrorMetadata: getDetailErrorMetadata,
  });

  const availabilityEnabled = Boolean(detail && detail.lineCount > 0);
  const availability = usePickListAvailability(uniquePartKeys, {
    enabled: availabilityEnabled,
  });

  const availabilityError = availability.hasError ? availability.errorDetails : undefined;
  const availabilityIsLoading =
    availabilityEnabled && (availability.isLoading || (!availability.hasData && availability.isFetching));

  useUiStateInstrumentation('pickLists.detail.availability', {
    isLoading: availabilityEnabled ? availabilityIsLoading : false,
    error: availabilityError,
    getReadyMetadata: availability.getReadyMetadata,
    getErrorMetadata: availability.getErrorMetadata,
  });

  const shouldFetchKitStatus = detail !== undefined && !kitOverviewStatus;
  const kitStatusQuery = useGetKitsByKitId(
    shouldFetchKitStatus && detail
      ? {
          path: { kit_id: detail.kitId },
        }
      : undefined,
    {
      enabled: shouldFetchKitStatus && detail !== undefined,
    }
  );

  const resolvedKitStatus: KitStatus | undefined = kitOverviewStatus ?? kitStatusQuery.data?.status ?? undefined;
  const kitNavigationReady = detail !== undefined && resolvedKitStatus !== undefined;

  const kitNavigationSearch = useMemo(() => {
    if (!resolvedKitStatus) {
      return undefined;
    }
    return kitOverviewSearch
      ? { status: resolvedKitStatus, search: kitOverviewSearch }
      : { status: resolvedKitStatus };
  }, [resolvedKitStatus, kitOverviewSearch]);

  const breadcrumbs = useMemo(() => {
    const pickListLabel = detail ? `Pick List ${detail.id}` : 'Pick List';
    const stateLabel = isPending ? 'Loading…' : hasError ? 'Error' : pickListLabel;

    return (
      <div
        className="flex items-center gap-2 text-sm text-muted-foreground"
        data-testid="pick-lists.detail.breadcrumbs"
      >
        <span data-testid="pick-lists.detail.breadcrumbs.root">Pick Lists</span>
        {detail ? (
          <>
            <span>/</span>
            {kitNavigationReady && kitNavigationSearch ? (
              <Link
                to="/kits/$kitId"
                params={{ kitId: String(detail.kitId) }}
                search={kitNavigationSearch}
                className="hover:text-foreground"
                data-testid="pick-lists.detail.breadcrumbs.kit"
              >
                {detail.kitName}
              </Link>
            ) : (
              <span data-testid="pick-lists.detail.breadcrumbs.kit">{detail.kitName}</span>
            )}
          </>
        ) : null}
        <span>/</span>
        <span data-testid="pick-lists.detail.breadcrumbs.current">{stateLabel}</span>
      </div>
    );
  }, [detail, hasError, isPending, kitNavigationReady, kitNavigationSearch]);

  const title = detail ? (
    <span data-testid="pick-lists.detail.title">Pick List {detail.id}</span>
  ) : (
    <span data-testid="pick-lists.detail.title">Pick List</span>
  );

  const titleMetadata = detail ? (
    <Badge
      variant="outline"
      className={cn('border px-3 py-1 text-sm font-semibold capitalize', STATUS_BADGE_CLASS[detail.status])}
      data-testid="pick-lists.detail.status"
    >
      {STATUS_LABEL[detail.status]}
    </Badge>
  ) : null;

  const metadataRow = detail ? (
    <div className="flex flex-wrap items-center gap-2" data-testid="pick-lists.detail.metadata">
      <DetailBadge
        label="Requested units"
        value={NUMBER_FORMATTER.format(detail.requestedUnits)}
        testId="pick-lists.detail.badge.requested-units"
        className="bg-slate-100 text-slate-700"
      />
      <DetailBadge
        label="Total lines"
        value={NUMBER_FORMATTER.format(detail.lineCount)}
        testId="pick-lists.detail.badge.total-lines"
        className="bg-slate-100 text-slate-700"
      />
      <DetailBadge
        label="Open lines"
        value={NUMBER_FORMATTER.format(detail.openLineCount)}
        testId="pick-lists.detail.badge.open-lines"
        className="bg-amber-100 text-amber-800"
      />
      <DetailBadge
        label="Remaining quantity"
        value={NUMBER_FORMATTER.format(detail.remainingQuantity)}
        testId="pick-lists.detail.badge.remaining-quantity"
        className="bg-slate-100 text-slate-700"
      />
    </div>
  ) : null;

  const content = renderContent({
    isPickListIdValid,
    isPending,
    hasError,
    error,
    detail,
    lineGroups,
    onRetry: () => query.refetch(),
    availabilityEnabled,
    availability,
    availabilityIsLoading,
    onPickLine: pickLine,
    onUndoLine: undoLine,
    executionPending: isExecutionPending,
    executionPendingLineId: pendingLineId,
    executionPendingAction: pendingAction,
  });

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="pick-lists.detail">
      <DetailScreenLayout
        rootTestId="pick-lists.detail.layout"
        headerTestId="pick-lists.detail.header"
        contentTestId="pick-lists.detail.content"
        breadcrumbs={breadcrumbs}
        title={title}
        titleMetadata={titleMetadata}
        metadataRow={metadataRow}
      >
        {content}
      </DetailScreenLayout>
    </div>
  );
}

interface RenderContentOptions {
  isPickListIdValid: boolean;
  isPending: boolean;
  hasError: boolean;
  error: unknown;
  detail: PickListDetailModel | undefined;
  lineGroups: PickListLineGroup[];
  onRetry: () => void;
  availabilityEnabled: boolean;
  availability: ReturnType<typeof usePickListAvailability>;
  availabilityIsLoading: boolean;
  onPickLine: (lineId: number) => Promise<void>;
  onUndoLine: (lineId: number) => Promise<void>;
  executionPending: boolean;
  executionPendingLineId: number | null;
  executionPendingAction: 'pick' | 'undo' | null;
}

function renderContent(options: RenderContentOptions) {
  const {
    isPickListIdValid,
    isPending,
    hasError,
    error,
    detail,
    lineGroups,
    onRetry,
    availabilityEnabled,
    availability,
    availabilityIsLoading,
    onPickLine,
    onUndoLine,
    executionPending,
    executionPendingLineId,
    executionPendingAction,
  } = options;

  if (!isPickListIdValid) {
    return (
      <Card className="p-6" data-testid="pick-lists.detail.invalid">
        <div className="space-y-3 text-sm text-muted-foreground">
          <h2 className="text-lg font-semibold text-foreground">Invalid pick list identifier</h2>
          <p>Please provide a numeric pick list identifier in the URL.</p>
        </div>
      </Card>
    );
  }

  if (isPending) {
    return <PickListDetailLoadingState />;
  }

  if (hasError) {
    return (
      <Card className="space-y-4 p-6" data-testid="pick-lists.detail.error">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-1 h-5 w-5 text-destructive" aria-hidden="true" />
          <div className="space-y-2 text-sm text-muted-foreground">
            <h2 className="text-lg font-semibold text-foreground">Failed to load pick list</h2>
            <p>{error instanceof Error ? error.message : 'An unexpected error occurred while fetching the pick list.'}</p>
          </div>
        </div>
        <div>
          <Button onClick={onRetry} data-testid="pick-lists.detail.retry">
            Retry
          </Button>
        </div>
      </Card>
    );
  }

  if (!detail) {
    return (
      <Card className="p-6" data-testid="pick-lists.detail.not-found">
        <div className="space-y-3 text-sm text-muted-foreground">
          <h2 className="text-lg font-semibold text-foreground">Pick list not found</h2>
          <p>The pick list you are looking for could not be located. It may have been removed.</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6" data-testid="pick-lists.detail.loaded">
      <PickListLines
        groups={lineGroups}
        availability={availability.availabilityByPartKey}
        availabilityEnabled={availabilityEnabled}
        availabilityLoading={availabilityIsLoading}
        availabilityFetching={availability.isFetching}
        availabilityHasError={availability.hasError}
        availabilityHasData={availability.hasData}
        availabilityErrors={availability.errorDetails}
        onPickLine={onPickLine}
        onUndoLine={onUndoLine}
        executionPending={executionPending}
        executionPendingLineId={executionPendingLineId}
        executionPendingAction={executionPendingAction}
      />
    </div>
  );
}

function PickListDetailLoadingState() {
  return (
    <div className="space-y-4" data-testid="pick-lists.detail.loading">
      <div className="space-y-3 rounded-lg border border-border bg-card p-6">
        <div className="h-6 w-48 animate-pulse rounded bg-muted" />
        <div className="flex flex-wrap gap-2">
          <div className="h-6 w-32 animate-pulse rounded-full bg-muted" />
          <div className="h-6 w-32 animate-pulse rounded-full bg-muted" />
          <div className="h-6 w-32 animate-pulse rounded-full bg-muted" />
        </div>
      </div>
      <div className="space-y-3 rounded-lg border border-border bg-card p-6">
        <div className="h-5 w-56 animate-pulse rounded bg-muted" />
        <div className="h-4 w-full animate-pulse rounded bg-muted" />
        <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
        <div className="h-4 w-4/6 animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}

interface DetailBadgeProps {
  label: string;
  value: string;
  className?: string;
  testId: string;
}

function DetailBadge({ label, value, className, testId }: DetailBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn('text-xs', className)}
      data-testid={testId}
    >
      {label}: {value}
    </Badge>
  );
}

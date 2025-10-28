import { useMemo } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';

import { DetailScreenLayout } from '@/components/layout/detail-screen-layout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { KeyValueBadge, StatusBadge } from '@/components/ui';
import { PickListLines } from '@/components/pick-lists/pick-list-lines';
import { usePickListDetail, buildPickListDetailQueryKey } from '@/hooks/use-pick-list-detail';
import { usePickListExecution } from '@/hooks/use-pick-list-execution';
import { usePickListAvailability } from '@/hooks/use-pick-list-availability';
import { useGetKitsByKitId, useDeletePickListsByPickListId } from '@/lib/api/generated/hooks';
import { useListLoadingInstrumentation } from '@/lib/test/query-instrumentation';
import { useUiStateInstrumentation, beginUiState, endUiState } from '@/lib/test/ui-state';
import { useConfirm } from '@/hooks/use-confirm';
import type { KitStatus } from '@/types/kits';
import type { PickListDetail as PickListDetailModel, PickListLineGroup } from '@/types/pick-lists';

const NUMBER_FORMATTER = new Intl.NumberFormat();

// Map pick list status to badge props
function getPickListStatusBadgeProps(status: 'open' | 'completed'): { color: 'active' | 'success'; label: string } {
  switch (status) {
    case 'open':
      return { color: 'active', label: 'Open' };
    case 'completed':
      return { color: 'success', label: 'Completed' };
  }
}

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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { confirm, confirmProps } = useConfirm();

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

  const deletePickListMutation = useDeletePickListsByPickListId();

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

  const handleDeletePickList = async () => {
    if (!detail || !normalizedPickListId) {
      return;
    }

    const confirmed = await confirm({
      title: 'Delete Pick List',
      description: `Are you sure you want to delete pick list #${detail.id}? This action cannot be undone.`,
      confirmText: 'Delete',
      destructive: true,
    });

    if (!confirmed) {
      return;
    }

    // Emit loading event for test instrumentation
    beginUiState('pickLists.detail.delete');

    try {
      await deletePickListMutation.mutateAsync({
        path: { pick_list_id: normalizedPickListId },
      });

      // Navigate immediately to prevent component re-render on deleted pick list.
      // If we invalidated caches first, the detail query would refetch and return 404,
      // causing the "not found" UI to briefly flash before navigation completes.
      navigate({
        to: '/kits/$kitId',
        params: { kitId: String(detail.kitId) },
        search: kitNavigationSearch ?? { status: 'active' },
      });

      // Invalidate caches after navigation so the kit detail page shows updated state
      await queryClient.invalidateQueries({
        queryKey: buildPickListDetailQueryKey(normalizedPickListId),
      });
      await queryClient.invalidateQueries({
        queryKey: ['getKitsPickListsByKitId', { path: { kit_id: detail.kitId } }],
      });

      // Emit success event for test instrumentation
      endUiState('pickLists.detail.delete', {
        pickListId: normalizedPickListId,
        kitId: detail.kitId,
        status: 'deleted',
      });
    } catch (error) {
      // Emit error event for test instrumentation
      endUiState('pickLists.detail.delete', {
        pickListId: normalizedPickListId,
        kitId: detail.kitId,
        status: 'error',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      // Error toast is shown automatically by the mutation hook
      // No need to re-throw; error is already handled
    }
  };

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
    <StatusBadge
      {...getPickListStatusBadgeProps(detail.status)}
      size="large"
      testId="pick-lists.detail.status"
    />
  ) : null;

  const metadataRow = detail ? (
    <div className="flex flex-wrap items-center gap-2" data-testid="pick-lists.detail.metadata">
      <KeyValueBadge
        label="Requested units"
        value={NUMBER_FORMATTER.format(detail.requestedUnits)}
        color="neutral"
        testId="pick-lists.detail.badge.requested-units"
      />
      <KeyValueBadge
        label="Total lines"
        value={NUMBER_FORMATTER.format(detail.lineCount)}
        color="neutral"
        testId="pick-lists.detail.badge.total-lines"
      />
      <KeyValueBadge
        label="Open lines"
        value={NUMBER_FORMATTER.format(detail.openLineCount)}
        color="warning"
        testId="pick-lists.detail.badge.open-lines"
      />
      <KeyValueBadge
        label="Remaining quantity"
        value={NUMBER_FORMATTER.format(detail.remainingQuantity)}
        color="neutral"
        testId="pick-lists.detail.badge.remaining-quantity"
      />
    </div>
  ) : null;

  const actions = detail ? (
    <Button
      variant="outline"
      onClick={handleDeletePickList}
      disabled={deletePickListMutation.isPending}
      data-testid="pick-lists.detail.actions.delete"
    >
      Delete Pick List
    </Button>
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
        actions={actions}
      >
        {content}
      </DetailScreenLayout>
      <ConfirmDialog {...confirmProps} />
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
            Reload List
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

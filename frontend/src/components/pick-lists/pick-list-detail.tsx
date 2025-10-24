import { useMemo } from 'react';
import { Link } from '@tanstack/react-router';
import { AlertTriangle } from 'lucide-react';

import { DetailScreenLayout } from '@/components/layout/detail-screen-layout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { KitLinkChip } from '@/components/kits/kit-link-chip';
import { PickListLines } from '@/components/pick-lists/pick-list-lines';
import { usePickListDetail } from '@/hooks/use-pick-list-detail';
import { usePickListAvailability } from '@/hooks/use-pick-list-availability';
import { useListLoadingInstrumentation } from '@/lib/test/query-instrumentation';
import { useUiStateInstrumentation } from '@/lib/test/ui-state';
import { cn } from '@/lib/utils';
import type { KitStatus } from '@/types/kits';
import type { PickListDetail as PickListDetailModel, PickListLineGroup } from '@/types/pick-lists';

const NUMBER_FORMATTER = new Intl.NumberFormat();
const DATE_TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

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

  const breadcrumbs = useMemo(() => {
    return (
      <div
        className="flex items-center gap-2 text-sm text-muted-foreground"
        data-testid="pick-lists.detail.breadcrumbs"
      >
        <span data-testid="pick-lists.detail.breadcrumbs.root">Pick Lists</span>
        {detail ? (
          <>
            <span>/</span>
            <Link
              to="/kits/$kitId"
              params={{ kitId: String(detail.kitId) }}
              search={{
                status: kitOverviewStatus ?? 'active',
                ...(kitOverviewSearch ? { search: kitOverviewSearch } : {}),
              }}
              className="hover:text-foreground"
              data-testid="pick-lists.detail.breadcrumbs.kit"
            >
              {detail.kitName}
            </Link>
          </>
        ) : isPending ? (
          <>
            <span>/</span>
            <span data-testid="pick-lists.detail.breadcrumbs.state">Loading…</span>
          </>
        ) : hasError ? (
          <>
            <span>/</span>
            <span data-testid="pick-lists.detail.breadcrumbs.state">Error</span>
          </>
        ) : null}
      </div>
    );
  }, [detail, hasError, isPending, kitOverviewStatus, kitOverviewSearch]);

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

  const supplementary = detail ? (
    <div className="flex flex-wrap gap-2" data-testid="pick-lists.detail.kit-chip">
      <KitLinkChip
        kitId={detail.kitId}
        name={detail.kitName}
        status={kitOverviewStatus}
        returnStatus={kitOverviewStatus}
        returnSearch={kitOverviewSearch}
        testId="pick-lists.detail.kit-chip.link"
      />
    </div>
  ) : null;

  const metadataRow = detail ? (
    <div className="flex flex-wrap items-center gap-2" data-testid="pick-lists.detail.metadata">
      <MetadataPill
        label="Requested units"
        value={NUMBER_FORMATTER.format(detail.requestedUnits)}
        testId="pick-lists.detail.badge.requested-units"
      />
      <MetadataPill
        label="Total lines"
        value={NUMBER_FORMATTER.format(detail.lineCount)}
        testId="pick-lists.detail.badge.total-lines"
      />
      <MetadataPill
        label="Open lines"
        value={NUMBER_FORMATTER.format(detail.openLineCount)}
        testId="pick-lists.detail.badge.open-lines"
      />
      <MetadataPill
        label="Remaining quantity"
        value={NUMBER_FORMATTER.format(detail.remainingQuantity)}
        testId="pick-lists.detail.badge.remaining-quantity"
      />
      <MetadataPill
        label="Created"
        value={formatTimestamp(detail.createdAt)}
        testId="pick-lists.detail.badge.created-at"
      />
      <MetadataPill
        label="Updated"
        value={formatTimestamp(detail.updatedAt)}
        testId="pick-lists.detail.badge.updated-at"
      />
      {detail.completedAt ? (
        <MetadataPill
          label="Completed"
          value={formatTimestamp(detail.completedAt)}
          testId="pick-lists.detail.badge.completed-at"
        />
      ) : null}
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
        supplementary={supplementary}
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

interface MetadataPillProps {
  label: string;
  value: string;
  testId: string;
}

function MetadataPill({ label, value, testId }: MetadataPillProps) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border border-border bg-background/80 px-3 py-1 text-sm font-medium text-foreground shadow-sm"
      data-testid={testId}
    >
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span>{value}</span>
    </span>
  );
}

function formatTimestamp(timestamp: string | null): string {
  if (!timestamp) {
    return '—';
  }

  return DATE_TIME_FORMATTER.format(new Date(timestamp));
}

import { type ReactNode, useMemo } from 'react';
import { Link } from '@tanstack/react-router';
import { AlertTriangle } from 'lucide-react';
import { DetailScreenLayout } from '@/components/layout/detail-screen-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { createKitDetailHeaderSlots } from '@/components/kits/kit-detail-header';
import { KitBOMTable } from '@/components/kits/kit-bom-table';
import { useKitDetail } from '@/hooks/use-kit-detail';
import { useListLoadingInstrumentation } from '@/lib/test/query-instrumentation';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { KitContentAggregates } from '@/types/kits';
import type { KitStatus } from '@/types/kits';

interface KitDetailProps {
  kitId: string;
  overviewStatus: KitStatus;
  overviewSearch?: string;
}

const SUMMARY_FORMATTER = new Intl.NumberFormat();

export function KitDetail({ kitId, overviewStatus, overviewSearch }: KitDetailProps) {
  const {
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

  const isPending = query.status === 'pending';
  const isFetching = query.fetchStatus === 'fetching';
  const hasError = query.status === 'error';
  const error = query.error;

  useListLoadingInstrumentation({
    scope: 'kits.detail',
    isLoading: isPending,
    isFetching,
    error,
    getReadyMetadata: getDetailReadyMetadata,
    getErrorMetadata: getDetailErrorMetadata,
    getAbortedMetadata: getDetailAbortedMetadata,
  });

  useListLoadingInstrumentation({
    scope: 'kits.detail.contents',
    isLoading: isPending,
    isFetching,
    error,
    getReadyMetadata: getContentsReadyMetadata,
    getErrorMetadata: getContentsErrorMetadata,
    getAbortedMetadata: getContentsAbortedMetadata,
  });

  const headerSlots = useMemo(
    () =>
      createKitDetailHeaderSlots({
        kit: detail,
        isLoading: isPending,
        overviewStatus,
        overviewSearch,
      }),
    [detail, isPending, overviewSearch, overviewStatus]
  );

  let content: ReactNode;

  if (isPending) {
    content = <KitDetailLoadingState />;
  } else if (hasError) {
    content = (
      <KitDetailErrorState
        kitId={kitId}
        error={error}
        onRetry={() => query.refetch()}
      />
    );
  } else if (!detail) {
    content = (
      <Card className="p-6" data-testid="kits.detail.not-found">
        <div className="text-center">
          <h2 className="mb-2 text-lg font-semibold">Kit not found</h2>
          <p className="text-muted-foreground">
            The kit with ID &ldquo;{kitId}&rdquo; could not be found.
          </p>
        </div>
      </Card>
    );
  } else {
    content = (
      <div className="space-y-6" data-testid="kits.detail.body">
        <Card>
          <CardHeader className="flex flex-col gap-3 border-b border-border/70 px-6 py-4 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle data-testid="kits.detail.table.title">Bill of materials</CardTitle>
              <p className="text-sm text-muted-foreground">
                Availability reflects stock after honoring reservations from other kits.
              </p>
            </div>
            <KitBOMSummary aggregates={aggregates} />
          </CardHeader>
          <CardContent className="px-0 py-0">
            <KitBOMTable rows={contents} />
          </CardContent>
        </Card>
      </div>
    );
  }

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
  onRetry: () => void;
}

function KitDetailErrorState({ kitId, error, onRetry }: KitDetailErrorStateProps) {
  const message = error instanceof Error ? error.message : 'Unable to load kit details.';

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
            <Link to="/kits" search={{ status: 'active' }}>
              Return to Kits
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
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
        label="Available"
        value={aggregates.totalAvailable}
        className="bg-emerald-100 text-emerald-800"
        testId="kits.detail.table.summary.available"
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

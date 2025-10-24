import type { ReactNode } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { PartInlineSummary } from '@/components/parts/part-inline-summary';
import { getLineAvailabilityQuantity } from '@/hooks/use-pick-list-availability';
import { cn } from '@/lib/utils';
import { formatLocation } from '@/lib/utils/locations';
import type {
  PickListAvailabilityErrorDetail,
  PickListLineGroup,
  PickListPartLocationAvailability,
} from '@/types/pick-lists';

const NUMBER_FORMATTER = new Intl.NumberFormat();

const LINE_STATUS_LABEL: Record<'open' | 'completed', string> = {
  open: 'Open',
  completed: 'Completed',
};

const LINE_STATUS_BADGE_CLASS: Record<'open' | 'completed', string> = {
  open: 'bg-amber-100 text-amber-800 border-amber-200',
  completed: 'bg-emerald-100 text-emerald-800 border-emerald-200',
};

interface PickListLinesProps {
  groups: PickListLineGroup[];
  availability: Map<string, PickListPartLocationAvailability>;
  availabilityEnabled: boolean;
  availabilityLoading: boolean;
  availabilityFetching: boolean;
  availabilityHasError: boolean;
  availabilityHasData: boolean;
  availabilityErrors: PickListAvailabilityErrorDetail[];
}

export function PickListLines({
  groups,
  availability,
  availabilityEnabled,
  availabilityLoading,
  availabilityFetching,
  availabilityHasError,
  availabilityHasData,
  availabilityErrors,
}: PickListLinesProps) {
  if (groups.length === 0) {
    return (
      <div
        className="rounded-lg border border-dashed border-muted-foreground/50 bg-muted/20 px-6 py-10 text-center text-sm text-muted-foreground"
        data-testid="pick-lists.detail.lines.empty"
      >
        This pick list does not contain any lines yet.
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="pick-lists.detail.lines">
      {availabilityHasError ? (
        <div
          className="flex flex-col gap-2 rounded-md border border-destructive/60 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          data-testid="pick-lists.detail.availability.error"
        >
          <span className="font-semibold">Inventory availability is currently unavailable.</span>
          <ul className="list-disc space-y-1 pl-4">
            {availabilityErrors.map(error => (
              <li key={error.partKey}>
                Part {error.partKey}: {error.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {groups.map(group => (
        <section
          key={group.kitContentId}
          className="overflow-hidden rounded-lg border border-border bg-card shadow-sm"
          data-testid={`pick-lists.detail.group.${group.kitContentId}`}
        >
          <header className="border-b border-border bg-muted/30 px-5 py-4">
            <PartInlineSummary
              partKey={group.partKey}
              description={group.description}
              manufacturerCode={group.manufacturerCode}
              testId={`pick-lists.detail.group.${group.kitContentId}.summary`}
            />

            <div
              className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground"
              data-testid={`pick-lists.detail.group.${group.kitContentId}.metrics`}
            >
              <MetricPill
                label="Lines"
                value={`${NUMBER_FORMATTER.format(group.lineCount)} (${NUMBER_FORMATTER.format(group.openLineCount)} open)`}
                testId={`pick-lists.detail.group.${group.kitContentId}.metrics.lines`}
              />
              <MetricPill
                label="Quantity to pick"
                value={NUMBER_FORMATTER.format(group.totalQuantityToPick)}
                testId={`pick-lists.detail.group.${group.kitContentId}.metrics.total-quantity`}
              />
              <MetricPill
                label="Remaining"
                value={NUMBER_FORMATTER.format(group.openQuantityToPick)}
                testId={`pick-lists.detail.group.${group.kitContentId}.metrics.remaining`}
              />
            </div>
          </header>

          <div className="divide-y divide-border" data-testid={`pick-lists.detail.group.${group.kitContentId}.lines`}>
            {group.lines.map(line => (
              <LineRow
                key={line.id}
                lineId={line.id}
                partKey={group.partKey}
                availability={availability}
                availabilityEnabled={availabilityEnabled}
                availabilityLoading={availabilityLoading}
                availabilityFetching={availabilityFetching}
                availabilityHasError={availabilityHasError}
                availabilityHasData={availabilityHasData}
                status={line.status}
                quantityToPick={line.quantityToPick}
                pickedAt={line.pickedAt}
                locationBoxNo={line.location.boxNo}
                locationLocNo={line.location.locNo}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

interface LineRowProps {
  lineId: number;
  partKey: string;
  availability: Map<string, PickListPartLocationAvailability>;
  availabilityEnabled: boolean;
  availabilityLoading: boolean;
  availabilityFetching: boolean;
  availabilityHasError: boolean;
  availabilityHasData: boolean;
  status: 'open' | 'completed';
  quantityToPick: number;
  pickedAt: string | null;
  locationBoxNo: number;
  locationLocNo: number;
}

function LineRow(props: LineRowProps) {
  const {
    lineId,
    partKey,
    availability,
    availabilityEnabled,
    availabilityLoading,
    availabilityFetching,
    availabilityHasError,
    availabilityHasData,
    status,
    quantityToPick,
    pickedAt,
    locationBoxNo,
    locationLocNo,
  } = props;

  const locationLabel = formatLocation(locationBoxNo, locationLocNo);
  const statusLabel = LINE_STATUS_LABEL[status];
  const statusBadgeClass = LINE_STATUS_BADGE_CLASS[status];
  const inStockQuantity = availabilityEnabled
    ? getLineAvailabilityQuantity(availability, partKey, locationBoxNo, locationLocNo)
    : null;

  const availabilityContent = resolveAvailabilityContent({
    availabilityEnabled,
    availabilityHasError,
    availabilityLoading,
    availabilityFetching,
    availabilityHasData,
    inStockQuantity,
  });

  const shortfall = computeShortfall(quantityToPick, inStockQuantity, status);

  return (
    <div className="px-5 py-4" data-testid={`pick-lists.detail.line.${lineId}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Location</div>
          <div className="mt-1 font-semibold text-foreground" data-testid={`pick-lists.detail.line.${lineId}.location`}>
            {locationLabel}
          </div>
        </div>

        <Badge
          className={cn('border px-2 py-1 text-xs font-semibold uppercase tracking-wide', statusBadgeClass)}
          data-testid={`pick-lists.detail.line.${lineId}.status`}
        >
          {statusLabel}
        </Badge>
      </div>

      <div className="mt-4 grid gap-4 text-sm text-muted-foreground sm:grid-cols-3">
        <MetricBlock
          label="Quantity to pick"
          value={NUMBER_FORMATTER.format(quantityToPick)}
          testId={`pick-lists.detail.line.${lineId}.quantity`}
        />

        <MetricBlock
          label="Current in stock"
          value={availabilityContent}
          testId={`pick-lists.detail.line.${lineId}.availability`}
        />

        <MetricBlock
          label="Picked at"
          value={pickedAt ?? '—'}
          testId={`pick-lists.detail.line.${lineId}.picked-at`}
        />
      </div>

      {shortfall > 0 ? (
        <div
          className="mt-4 flex items-start gap-2 rounded-md border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          data-testid={`pick-lists.detail.line.${lineId}.shortfall`}
        >
          <AlertTriangle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
          <span>
            Shortfall of {NUMBER_FORMATTER.format(shortfall)} unit{shortfall === 1 ? '' : 's'} — current stock is&nbsp;
            {inStockQuantity !== null ? NUMBER_FORMATTER.format(inStockQuantity) : 'unavailable'}.
          </span>
        </div>
      ) : null}
    </div>
  );
}

interface AvailabilityContentOptions {
  availabilityEnabled: boolean;
  availabilityLoading: boolean;
  availabilityFetching: boolean;
  availabilityHasError: boolean;
  availabilityHasData: boolean;
  inStockQuantity: number | null;
}

function resolveAvailabilityContent(options: AvailabilityContentOptions): ReactNode {
  const {
    availabilityEnabled,
    availabilityLoading,
    availabilityFetching,
    availabilityHasError,
    availabilityHasData,
    inStockQuantity,
  } = options;

  if (!availabilityEnabled) {
    return '—';
  }

  if (typeof inStockQuantity === 'number') {
    return NUMBER_FORMATTER.format(inStockQuantity);
  }

  if (availabilityHasError) {
    return <span className="text-destructive">Unavailable</span>;
  }

  if (availabilityLoading && !availabilityHasData) {
    return <LoadingIndicator />;
  }

  if (availabilityFetching) {
    return <LoadingIndicator />;
  }

  return 'Not tracked';
}

function computeShortfall(
  quantityToPick: number,
  inStockQuantity: number | null,
  status: 'open' | 'completed',
): number {
  if (status !== 'open') {
    return 0;
  }

  if (inStockQuantity === null) {
    return 0;
  }

  return quantityToPick > inStockQuantity ? quantityToPick - inStockQuantity : 0;
}

interface MetricBlockProps {
  label: string;
  value: ReactNode;
  testId: string;
}

function MetricBlock({ label, value, testId }: MetricBlockProps) {
  return (
    <div className="flex flex-col gap-1" data-testid={testId}>
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

interface MetricPillProps {
  label: string;
  value: string;
  testId: string;
}

function MetricPill({ label, value, testId }: MetricPillProps) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border border-border bg-background/80 px-3 py-1 font-medium text-foreground shadow-sm"
      data-testid={testId}
    >
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-sm">{value}</span>
    </span>
  );
}

function LoadingIndicator() {
  return (
    <span className="inline-flex items-center gap-1 text-foreground">
      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      Loading…
    </span>
  );
}

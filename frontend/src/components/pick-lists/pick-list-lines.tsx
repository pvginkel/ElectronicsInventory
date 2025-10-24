import { type ReactNode } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getLineAvailabilityQuantity } from '@/hooks/use-pick-list-availability';
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

      {groups.map(group => {
        const groupId = group.kitContentId;
        return (
          <Card key={groupId} className="p-0" data-testid={`pick-lists.detail.group.${groupId}`}>
            <CardHeader className="flex flex-col gap-3 border-b border-border/70 px-4 py-3 md:flex-row md:items-center md:justify-between space-y-0">
              <div>
                <CardTitle data-testid={`pick-lists.detail.group.${groupId}.title`}>
                  {group.description}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Part key {group.partKey}
                  {group.manufacturerCode ? ` · MPN ${group.manufacturerCode}` : ''}
                </p>
              </div>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-5">
                <div
                  className="flex flex-wrap gap-2"
                  data-testid={`pick-lists.detail.group.${groupId}.metrics`}
                >
                  <GroupSummaryBadge
                    label="Lines"
                    value={`${NUMBER_FORMATTER.format(group.lineCount)} (${NUMBER_FORMATTER.format(group.openLineCount)} open)`}
                    className="bg-slate-100 text-slate-700"
                    testId={`pick-lists.detail.group.${groupId}.metrics.lines`}
                  />
                  <GroupSummaryBadge
                    label="Quantity to pick"
                    value={NUMBER_FORMATTER.format(group.totalQuantityToPick)}
                    className="bg-slate-100 text-slate-700"
                    testId={`pick-lists.detail.group.${groupId}.metrics.total-quantity`}
                  />
                  <GroupSummaryBadge
                    label="Remaining"
                    value={NUMBER_FORMATTER.format(group.openQuantityToPick)}
                    className="bg-amber-100 text-amber-800"
                    testId={`pick-lists.detail.group.${groupId}.metrics.remaining`}
                  />
                </div>
                <div
                  className="flex items-center gap-2"
                  data-testid={`pick-lists.detail.group.${groupId}.actions`}
                />
              </div>
            </CardHeader>
            <CardContent className="px-0 py-0">
              <div className="overflow-x-auto">
                <table
                  className="min-w-full divide-y divide-border/70"
                  data-testid={`pick-lists.detail.group.${groupId}.table`}
                >
                  <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Location</th>
                      <th className="px-4 py-3 text-left font-medium">Status</th>
                      <th className="px-4 py-3 text-right font-medium">Quantity to pick</th>
                      <th className="px-4 py-3 text-right font-medium">Current in stock</th>
                      <th className="px-4 py-3 text-left font-medium">Picked at</th>
                      <th className="px-4 py-3 text-left font-medium">Shortfall</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/70" data-testid={`pick-lists.detail.group.${groupId}.lines`}>
                    {group.lines.map(line => {
                      const lineId = line.id;
                      const locationLabel = formatLocation(line.location.boxNo, line.location.locNo);
                      const statusLabel = LINE_STATUS_LABEL[line.status];
                      const inStockQuantity = availabilityEnabled
                        ? getLineAvailabilityQuantity(
                            availability,
                            group.partKey,
                            line.location.boxNo,
                            line.location.locNo,
                          )
                        : null;
                      const availabilityContent = resolveAvailabilityContent({
                        availabilityEnabled,
                        availabilityHasError,
                        availabilityLoading,
                        availabilityFetching,
                        availabilityHasData,
                        inStockQuantity,
                      });
                      const shortfall = computeShortfall(line.quantityToPick, inStockQuantity, line.status);

                      return (
                        <tr key={lineId} data-testid={`pick-lists.detail.line.${lineId}`} className="bg-background">
                          <td className="px-4 py-3 text-sm font-medium text-foreground">
                            <span data-testid={`pick-lists.detail.line.${lineId}.location`}>
                              {locationLabel}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">
                            <span data-testid={`pick-lists.detail.line.${lineId}.status`}>
                              {statusLabel}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-right text-foreground">
                            <span data-testid={`pick-lists.detail.line.${lineId}.quantity`}>
                              {NUMBER_FORMATTER.format(line.quantityToPick)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-right text-foreground">
                            <span data-testid={`pick-lists.detail.line.${lineId}.availability`}>
                              {availabilityContent}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">
                            <span data-testid={`pick-lists.detail.line.${lineId}.picked-at`}>
                              {line.pickedAt ?? '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">
                            {shortfall > 0 ? (
                              <span
                                className="inline-flex items-center gap-2 rounded border border-amber-400 bg-amber-50 px-2 py-1 text-amber-900"
                                data-testid={`pick-lists.detail.line.${lineId}.shortfall`}
                              >
                                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                                Shortfall {NUMBER_FORMATTER.format(shortfall)}
                              </span>
                            ) : (
                              <span data-testid={`pick-lists.detail.line.${lineId}.shortfall`}>—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        );
      })}
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

interface GroupSummaryBadgeProps {
  label: string;
  value: string;
  className?: string;
  testId: string;
}

function GroupSummaryBadge({ label, value, className, testId }: GroupSummaryBadgeProps) {
  return (
    <Badge variant="outline" className={`text-xs ${className ?? ''}`} data-testid={testId}>
      {label}: {value}
    </Badge>
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

import { type ReactNode } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { KeyValueBadge, StatusBadge } from '@/components/ui';
import { PartInlineSummary } from '@/components/parts/part-inline-summary';
import { getLineAvailabilityQuantity } from '@/hooks/use-pick-list-availability';
import { formatLocation } from '@/lib/utils/locations';
import type {
  PickListAvailabilityErrorDetail,
  PickListLineGroup,
  PickListPartLocationAvailability,
} from '@/types/pick-lists';

const NUMBER_FORMATTER = new Intl.NumberFormat();

// Map pick list line status to badge props
function getLineStatusBadgeProps(status: 'open' | 'completed'): { color: 'active' | 'success'; label: string } {
  switch (status) {
    case 'open':
      return { color: 'active', label: 'Open' };
    case 'completed':
      return { color: 'success', label: 'Completed' };
  }
}

const COLUMN_WIDTHS = {
  location: 'w-[20%] min-w-[180px]',
  status: 'w-[12%] min-w-[110px]',
  quantity: 'w-[14%] min-w-[120px]',
  stock: 'w-[16%] min-w-[140px]',
  shortfall: 'w-[28%] min-w-[200px]',
  actions: 'w-[10%] min-w-[120px]',
} as const;

interface PickListLinesProps {
  groups: PickListLineGroup[];
  availability: Map<string, PickListPartLocationAvailability>;
  availabilityEnabled: boolean;
  availabilityLoading: boolean;
  availabilityFetching: boolean;
  availabilityHasError: boolean;
  availabilityHasData: boolean;
  availabilityErrors: PickListAvailabilityErrorDetail[];
  onPickLine: (lineId: number) => Promise<void> | void;
  onUndoLine: (lineId: number) => Promise<void> | void;
  executionPending: boolean;
  executionPendingLineId: number | null;
  executionPendingAction: 'pick' | 'undo' | null;
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
  onPickLine,
  onUndoLine,
  executionPending,
  executionPendingLineId,
  executionPendingAction,
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
              <div className="w-full md:max-w-2xl">
                <PartInlineSummary
                  partKey={group.partKey}
                  description={group.description}
                  manufacturerCode={group.manufacturerCode}
                  testId={`pick-lists.detail.group.${groupId}.summary`}
                  link={true}
                />
              </div>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-5">
                <div
                  className="flex flex-wrap gap-2"
                  data-testid={`pick-lists.detail.group.${groupId}.metrics`}
                >
                  <KeyValueBadge
                    label="Lines"
                    value={`${NUMBER_FORMATTER.format(group.lineCount)} (${NUMBER_FORMATTER.format(group.openLineCount)} open)`}
                    color="neutral"
                    testId={`pick-lists.detail.group.${groupId}.metrics.lines`}
                  />
                  <KeyValueBadge
                    label="Quantity to pick"
                    value={NUMBER_FORMATTER.format(group.totalQuantityToPick)}
                    color="neutral"
                    testId={`pick-lists.detail.group.${groupId}.metrics.total-quantity`}
                  />
                  <KeyValueBadge
                    label="Remaining"
                    value={NUMBER_FORMATTER.format(group.openQuantityToPick)}
                    color="warning"
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
                  className="min-w-full table-fixed divide-y divide-border/70"
                  data-testid={`pick-lists.detail.group.${groupId}.table`}
                >
                  <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className={`${COLUMN_WIDTHS.location} px-4 py-3 text-left font-medium`}>Location</th>
                      <th className={`${COLUMN_WIDTHS.status} px-4 py-3 text-left font-medium`}>Status</th>
                      <th className={`${COLUMN_WIDTHS.quantity} px-4 py-3 text-right font-medium`}>Quantity to pick</th>
                      <th className={`${COLUMN_WIDTHS.stock} px-4 py-3 text-right font-medium`}>Current in stock</th>
                      <th className={`${COLUMN_WIDTHS.shortfall} px-4 py-3 text-left font-medium`}>Shortfall</th>
                      <th className={`${COLUMN_WIDTHS.actions} px-4 py-3 text-right font-medium`}>Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/70" data-testid={`pick-lists.detail.group.${groupId}.lines`}>
                    {group.lines.map(line => {
                      const lineId = line.id;
                      const locationLabel = formatLocation(line.location.boxNo, line.location.locNo);
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
                      const isCompleted = line.status === 'completed';
                      const isPending = executionPendingLineId === lineId;
                      const isPickPending = isPending && executionPendingAction === 'pick';
                      const isUndoPending = isPending && executionPendingAction === 'undo';
                      const isLineExecuting = executionPending && isPending;
                      const disablePick = isCompleted || isLineExecuting;
                      const disableUndo = !isCompleted || isLineExecuting;

                      return (
                        <tr key={lineId} data-testid={`pick-lists.detail.line.${lineId}`}>
                          <td className={`${COLUMN_WIDTHS.location} px-4 py-3 text-sm font-medium text-foreground`}>
                            <span data-testid={`pick-lists.detail.line.${lineId}.location`}>
                              {locationLabel}
                            </span>
                          </td>
                          <td className={`${COLUMN_WIDTHS.status} px-4 py-3 text-sm text-muted-foreground`}>
                            <StatusBadge
                              {...getLineStatusBadgeProps(line.status)}
                              testId={`pick-lists.detail.line.${lineId}.status`}
                            />
                          </td>
                          <td className={`${COLUMN_WIDTHS.quantity} px-4 py-3 text-sm text-right text-foreground`}>
                            <span data-testid={`pick-lists.detail.line.${lineId}.quantity`}>
                              {NUMBER_FORMATTER.format(line.quantityToPick)}
                            </span>
                          </td>
                          <td className={`${COLUMN_WIDTHS.stock} px-4 py-3 text-sm text-right text-foreground`}>
                            <span data-testid={`pick-lists.detail.line.${lineId}.availability`}>
                              {availabilityContent}
                            </span>
                          </td>
                          <td className={`${COLUMN_WIDTHS.shortfall} px-4 py-3 text-sm text-muted-foreground`}>
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
                          <td className={`${COLUMN_WIDTHS.actions} px-4 py-3 text-sm text-right text-foreground`}>
                            <div
                              className="flex justify-end"
                              data-testid={`pick-lists.detail.line.${lineId}.actions`}
                            >
                              {isCompleted ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    void onUndoLine(lineId);
                                  }}
                                  disabled={disableUndo}
                                  data-testid={`pick-lists.detail.line.${lineId}.action.undo`}
                                >
                                  {isUndoPending ? (
                                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                                  ) : (
                                    'Undo'
                                  )}
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    void onPickLine(lineId);
                                  }}
                                  disabled={disablePick}
                                  data-testid={`pick-lists.detail.line.${lineId}.action.pick`}
                                >
                                  {isPickPending ? (
                                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                                  ) : (
                                    'Pick'
                                  )}
                                </Button>
                              )}
                            </div>
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
    const formatted = NUMBER_FORMATTER.format(inStockQuantity);
    const className = inStockQuantity > 0 ? 'text-emerald-600' : 'text-muted-foreground';
    return <span className={className}>{formatted}</span>;
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

  return <span className="text-muted-foreground">Not tracked</span>;
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

function LoadingIndicator() {
  return (
    <span className="inline-flex items-center gap-1 text-foreground">
      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      Loading…
    </span>
  );
}

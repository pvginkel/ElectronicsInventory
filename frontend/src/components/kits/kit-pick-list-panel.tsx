import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { StatusBadge } from '@/components/ui';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { emitTestEvent } from '@/lib/test/event-emitter';
import { buildPickListDetailSearch } from '@/types/pick-lists';
import type { KitDetail, KitPickListSummary, KitStatus } from '@/types/kits';
import type { UiStateTestEvent } from '@/types/test-events';
import { ClipboardList, ChevronDown, ChevronRight, CheckCircle2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buildKitPickListPanelMetadata } from '@/components/kits/kit-pick-list-panel-metadata';

const NUMBER_FORMATTER = new Intl.NumberFormat();
const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

interface KitPickListPanelProps {
  kit: KitDetail;
  overviewStatus: KitStatus;
  overviewSearch?: string;
  onCreatePickList: () => void;
}

function emitUiState(payload: Omit<UiStateTestEvent, 'timestamp'>) {
  emitTestEvent(payload);
}

function formatCompletedLabel(pickList: KitPickListSummary): string | null {
  const rawTimestamp = pickList.completedAt ?? pickList.updatedAt;
  const parsed = rawTimestamp ? Date.parse(rawTimestamp) : Number.NaN;
  if (Number.isNaN(parsed)) {
    return null;
  }
  return DATE_FORMATTER.format(new Date(parsed));
}

function buildPickListLinkParams(pickListId: number) {
  return {
    to: '/pick-lists/$pickListId' as const,
    params: { pickListId: String(pickListId) },
  };
}

export function KitPickListPanel({
  kit,
  overviewStatus,
  overviewSearch,
  onCreatePickList,
}: KitPickListPanelProps) {
  const openPickLists = useMemo(
    () => kit.pickLists.filter((item) => item.status === 'open'),
    [kit.pickLists],
  );
  const completedPickLists = useMemo(
    () => kit.pickLists.filter((item) => item.status === 'completed'),
    [kit.pickLists],
  );
  const [isCompletedExpanded, setCompletedExpanded] = useState(false);
  const panelMetadata = useMemo(
    () => buildKitPickListPanelMetadata(kit),
    [kit],
  );

  useEffect(() => {
    emitUiState({
      kind: 'ui_state',
      scope: 'kits.detail.pickLists.panel',
      phase: 'ready',
      metadata: panelMetadata,
    });
  }, [panelMetadata]);

  const handleToggleCompleted = useCallback(() => {
    if (completedPickLists.length === 0) {
      return;
    }
    const nextExpanded = !isCompletedExpanded;
    setCompletedExpanded(nextExpanded);
    emitUiState({
      kind: 'ui_state',
      scope: 'kits.detail.pickLists.toggle',
      phase: 'ready',
      metadata: {
        kitId: kit.id,
        completedCount: completedPickLists.length,
        expanded: nextExpanded,
      },
    });
  }, [completedPickLists.length, isCompletedExpanded, kit.id]);

  const handleNavigate = useCallback(
    (pickList: KitPickListSummary, origin: 'open' | 'completed') => {
      emitUiState({
        kind: 'ui_state',
        scope: 'kits.detail.pickLists.navigate',
        phase: 'ready',
        metadata: {
          kitId: kit.id,
          pickListId: pickList.id,
          status: pickList.status,
          origin,
        },
      });
    },
    [kit.id],
  );

  const searchState = useMemo(
    () =>
      buildPickListDetailSearch({
        kitId: kit.id,
        status: overviewStatus,
        search: overviewSearch,
      }),
    [kit.id, overviewStatus, overviewSearch],
  );

  const canCreatePickList = kit.status === 'active';
  const creationTitle = canCreatePickList ? undefined : 'Archived kits cannot create pick lists';

  return (
    <Card className="p-0" data-testid="kits.detail.pick-lists.panel">
      <CardHeader className={cn(
        "flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between space-y-0",
        { "border-b border-border/70 ": openPickLists.length > 0 }
      )}>
        <div>
          <CardTitle className="text-base">Pick lists</CardTitle>
          <p className="text-sm text-muted-foreground">
            Track open work and review completed picks without leaving the kit detail.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={canCreatePickList ? onCreatePickList : undefined}
          disabled={!canCreatePickList}
          title={creationTitle}
          aria-disabled={canCreatePickList ? undefined : 'true'}
          className="inline-flex items-center gap-2"
          data-testid="kits.detail.pick-lists.add"
        >
          <Plus className="h-4 w-4" />
          <span>Add Pick List</span>
        </Button>
      </CardHeader>
      {openPickLists.length > 0 || completedPickLists.length > 0 ? (
        <CardContent className="px-0 py-0">
          {openPickLists.length > 0 ? (
            <section className="mx-4 my-4 space-y-3" data-testid="kits.detail.pick-lists.open">
              {openPickLists.map((pickList) => (
                <Link
                  key={pickList.id}
                  className="group block rounded-lg border border-border bg-card px-4 py-3 shadow-sm transition hover:border-primary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  {...buildPickListLinkParams(pickList.id)}
                  search={searchState}
                  onClick={() => handleNavigate(pickList, 'open')}
                  data-testid={`kits.detail.pick-lists.open.item.${pickList.id}`}
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <ClipboardList className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        <span className="font-medium text-sm md:text-base">
                          Pick list #{pickList.id}
                        </span>
                        <StatusBadge
                          color="active"
                          label="Open"
                          testId=""
                        />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Requested units {NUMBER_FORMATTER.format(pickList.requestedUnits)}, open
                        lines {NUMBER_FORMATTER.format(pickList.openLineCount)}, remaining quantity{' '}
                        {NUMBER_FORMATTER.format(pickList.remainingQuantity)}
                      </p>
                    </div>
                    <span className="flex items-center gap-1 text-sm font-medium text-primary">
                      Continue picking
                      <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden="true" />
                    </span>
                  </div>
                </Link>
              ))}
            </section>
          ) : null}
          {completedPickLists.length > 0 ? (
            <section>
              <div
                role="button"
                tabIndex={0}
                onClick={handleToggleCompleted}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    handleToggleCompleted();
                  }
                }}
                className={cn(
                  "flex items-center justify-between border-t border-border px-4 py-3 text-sm font-medium text-muted-foreground bg-muted/60 text-muted-foreground",
                  { "border-b": isCompletedExpanded },
                  { "rounded-b-lg": !isCompletedExpanded }
                )}
                data-testid="kits.detail.pick-lists.completed.toggle"
                aria-expanded={isCompletedExpanded ? 'true' : 'false'}
              >
                <span className="flex items-center gap-2">
                  {isCompletedExpanded ? (
                    <ChevronDown className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  )}
                  Completed ({completedPickLists.length})
                </span>
              </div>
              {isCompletedExpanded ? (
                <div className="mx-4 my-4 space-y-3" data-testid="kits.detail.pick-lists.completed">
                  {completedPickLists.map((pickList) => {
                    const completedLabel = formatCompletedLabel(pickList);
                    return (
                      <Link
                        key={pickList.id}
                        className="flex flex-col gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-4 py-3 text-sm transition hover:border-primary/70 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        {...buildPickListLinkParams(pickList.id)}
                        search={searchState}
                        onClick={() => handleNavigate(pickList, 'completed')}
                        data-testid={`kits.detail.pick-lists.completed.item.${pickList.id}`}
                      >
                        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                          <span>Pick list #{pickList.id}</span>
                        </div>
                        <div className="text-muted-foreground">
                          Completed{' '}
                          {completedLabel ?? 'with the most recent activity recorded for this list'}.
                          Requested units {NUMBER_FORMATTER.format(pickList.requestedUnits)}.
                        </div>
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </section>
          ) : null}
        </CardContent>
      ) : null}
    </Card>
  );
}

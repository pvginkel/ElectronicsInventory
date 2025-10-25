import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { emitTestEvent } from '@/lib/test/event-emitter';
import { buildPickListDetailSearch } from '@/types/pick-lists';
import type { KitDetail, KitPickListSummary, KitStatus } from '@/types/kits';
import type { UiStateTestEvent } from '@/types/test-events';
import { ClipboardList, ChevronDown, ChevronRight, CheckCircle2, Plus } from 'lucide-react';

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

function getLatestUpdatedAt(pickLists: KitPickListSummary[]): string | null {
  let latest = Number.NEGATIVE_INFINITY;

  for (const pickList of pickLists) {
    const parsed = Date.parse(pickList.updatedAt);
    if (!Number.isNaN(parsed) && parsed > latest) {
      latest = parsed;
    }
  }

  return Number.isFinite(latest) && latest > 0 ? new Date(latest).toISOString() : null;
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
    () => ({
      kitId: kit.id,
      openCount: openPickLists.length,
      completedCount: completedPickLists.length,
      hasOpenWork: openPickLists.length > 0,
      latestUpdatedAt: getLatestUpdatedAt(kit.pickLists),
    }),
    [kit.id, kit.pickLists, openPickLists.length, completedPickLists.length],
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
      <CardHeader className="flex flex-col gap-3 border-b border-border/70 px-4 py-3 md:flex-row md:items-center md:justify-between space-y-0">
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
          <span>+ Add Pick List</span>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4 px-4 py-4">
        <section className="space-y-3" data-testid="kits.detail.pick-lists.open">
          {openPickLists.length > 0 ? (
            openPickLists.map((pickList) => (
              <div
                key={pickList.id}
                className="flex flex-col gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-sm transition hover:border-primary/70 md:flex-row md:items-center md:justify-between"
                data-testid={`kits.detail.pick-lists.open.item.${pickList.id}`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <ClipboardList className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <span className="font-medium text-sm md:text-base">
                      Pick list #{pickList.id}
                    </span>
                    <Badge variant="secondary" className="capitalize bg-amber-100 text-amber-800">
                      Open
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Requested units {NUMBER_FORMATTER.format(pickList.requestedUnits)}, open lines{' '}
                    {NUMBER_FORMATTER.format(pickList.openLineCount)}, remaining quantity{' '}
                    {NUMBER_FORMATTER.format(pickList.remainingQuantity)}
                  </p>
                </div>
                <Link
                  {...buildPickListLinkParams(pickList.id)}
                  search={searchState}
                  onClick={() => handleNavigate(pickList, 'open')}
                  className="inline-flex h-8 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  data-testid={`kits.detail.pick-lists.open.item.${pickList.id}.resume`}
                >
                  Continue picking
                </Link>
              </div>
            ))
          ) : (
            <div
              className="rounded-lg border border-dashed border-border/70 bg-muted/30 px-4 py-6 text-sm text-muted-foreground"
              data-testid="kits.detail.pick-lists.empty"
            >
              No pick lists yet. Use "+ Add Pick List" to start a picking run for this kit.
            </div>
          )}
        </section>
        {completedPickLists.length > 0 ? (
          <section className="space-y-3">
            <button
              type="button"
              onClick={handleToggleCompleted}
              className="flex w-full items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2 text-left text-sm font-medium transition hover:border-primary/70 hover:text-primary"
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
            </button>
            {isCompletedExpanded ? (
              <div className="space-y-3" data-testid="kits.detail.pick-lists.completed">
                {completedPickLists.map((pickList) => {
                  const completedLabel = formatCompletedLabel(pickList);
                  return (
                    <Link
                      key={pickList.id}
                      className="flex flex-col gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-4 py-3 text-sm transition hover:border-primary/70 hover:text-primary"
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
    </Card>
  );
}

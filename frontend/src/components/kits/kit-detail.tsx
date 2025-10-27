import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { AlertTriangle, Plus } from 'lucide-react';
import { DetailScreenLayout } from '@/components/layout/detail-screen-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { createKitDetailHeaderSlots } from '@/components/kits/kit-detail-header';
import { KitBOMTable } from '@/components/kits/kit-bom-table';
import { KitPickListPanel } from '@/components/kits/kit-pick-list-panel';
import { useKitDetail } from '@/hooks/use-kit-detail';
import type { UseKitDetailResult } from '@/hooks/use-kit-detail';
import { useKitContents } from '@/hooks/use-kit-contents';
import { useListLoadingInstrumentation } from '@/lib/test/query-instrumentation';
import { useUiStateInstrumentation } from '@/lib/test/ui-state';
import { KeyValueBadge } from '@/components/ui';
import { ConfirmDialog, type DialogContentProps } from '@/components/ui/dialog';
import { KitMetadataDialog } from '@/components/kits/kit-metadata-dialog';
import { KitShoppingListDialog } from '@/components/kits/kit-shopping-list-dialog';
import { KitPickListCreateDialog } from '@/components/kits/kit-pick-list-create-dialog';
import { useKitShoppingListUnlinkMutation } from '@/hooks/use-kit-shopping-list-links';
import { useToast } from '@/hooks/use-toast';
import { emitTestEvent } from '@/lib/test/event-emitter';
import { ApiError } from '@/lib/api/api-error';
import type { UiStateTestEvent } from '@/types/test-events';
import type {
  KitContentAggregates,
  KitContentRow,
  KitDetail,
  KitShoppingListLink,
  KitStatus,
} from '@/types/kits';

interface KitDetailProps {
  kitId: string;
  overviewStatus: KitStatus;
  overviewSearch?: string;
}

const SUMMARY_FORMATTER = new Intl.NumberFormat();
const SHOPPING_LIST_FLOW_SCOPE = 'kits.detail.shoppingListFlow';
type ShoppingListFlowPhase = Extract<UiStateTestEvent['phase'], 'open' | 'submit' | 'success' | 'error'>;

function emitUiState(payload: Omit<UiStateTestEvent, 'timestamp'>) {
  emitTestEvent(payload);
}

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
  const isFetching = isKitIdValid && queryFetchStatus === 'fetching';
  const isLinksLoading = isPending || isFetching;
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
    isLoading: isLinksLoading,
    error,
    getReadyMetadata: getLinksReadyMetadata,
    getErrorMetadata: getDetailErrorMetadata,
  });

  const [isMetadataDialogOpen, setMetadataDialogOpen] = useState(false);
  const [isShoppingListDialogOpen, setShoppingListDialogOpen] = useState(false);
  const [linkToUnlink, setLinkToUnlink] = useState<KitShoppingListLink | null>(null);
  const [unlinkingLinkId, setUnlinkingLinkId] = useState<number | null>(null);
  const unlinkMutation = useKitShoppingListUnlinkMutation();
  const { showSuccess, showWarning, showException } = useToast();
  const [isCreatePickListDialogOpen, setCreatePickListDialogOpen] = useState(false);

  const handleMetadataOpen = useCallback(() => {
    if (!detail || detail.status !== 'active') {
      return;
    }
    setMetadataDialogOpen(true);
  }, [detail]);

  const emitUnlinkFlowEvent = useCallback(
    (phase: ShoppingListFlowPhase, link: KitShoppingListLink, overrides?: Record<string, unknown>) => {
      if (!detail) {
        return;
      }
      emitUiState({
        kind: 'ui_state',
        scope: SHOPPING_LIST_FLOW_SCOPE,
        phase,
        metadata: {
          kitId: detail.id,
          action: 'unlink',
          targetListId: link.shoppingListId,
          requestedUnits: link.requestedUnits,
          honorReserved: link.honorReserved,
          noop: false,
          ...(overrides ?? {}),
        },
      });
    },
    [detail],
  );

  const handleShoppingListOpen = useCallback(() => {
    if (!detail || detail.status !== 'active' || detail.contents.length === 0) {
      return;
    }
    setShoppingListDialogOpen(true);
  }, [detail]);

  const handleUnlinkRequest = useCallback(
    (link: KitShoppingListLink) => {
      if (unlinkMutation.isPending || unlinkingLinkId !== null) {
        return;
      }
      setLinkToUnlink(link);
      emitUnlinkFlowEvent('open', link);
    },
    [emitUnlinkFlowEvent, unlinkMutation.isPending, unlinkingLinkId],
  );

  const handleCreatePickListOpen = useCallback(() => {
    if (!detail || detail.status !== 'active') {
      return;
    }
    setCreatePickListDialogOpen(true);
  }, [detail]);

  const canOrderStock = detail ? detail.status === 'active' && detail.contents.length > 0 : false;
  const canUnlinkShoppingList = detail ? detail.status === 'active' : false;

  const headerSlots = useMemo(
    () =>
      createKitDetailHeaderSlots({
        kit: detail,
        isLoading: isPending,
        overviewStatus,
        overviewSearch,
        onEditMetadata: handleMetadataOpen,
        onOrderStock: handleShoppingListOpen,
        canOrderStock,
        onUnlinkShoppingList: canUnlinkShoppingList ? handleUnlinkRequest : undefined,
        canUnlinkShoppingList,
        unlinkingLinkId,
      }),
    [
      canOrderStock,
      canUnlinkShoppingList,
      detail,
      handleMetadataOpen,
      handleShoppingListOpen,
      handleUnlinkRequest,
      isPending,
      overviewSearch,
      overviewStatus,
      unlinkingLinkId,
    ],
  );

  useEffect(() => {
    if (!detail || detail.status !== 'active') {
      setCreatePickListDialogOpen(false);
    }
  }, [detail]);

  const handleConfirmUnlink = useCallback(() => {
    if (!detail || !linkToUnlink) {
      return;
    }
    const link = linkToUnlink;
    emitUnlinkFlowEvent('submit', link);
    setUnlinkingLinkId(link.id);

    void unlinkMutation
      .mutateAsync({
        kitId: detail.id,
        linkId: link.id,
        shoppingListId: link.shoppingListId,
      })
      .then(() => {
        emitUnlinkFlowEvent('success', link);
        showSuccess(`Unlinked "${link.name}" from this kit.`);
        void query.refetch();
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 404) {
          emitUnlinkFlowEvent('success', link, { status: 404, noop: true });
          showWarning('That shopping list link was already removed. Refreshing kit detail.');
          void query.refetch();
          return;
        }

        const message = error instanceof Error ? error.message : 'Failed to unlink shopping list';
        emitUnlinkFlowEvent('error', link, {
          message,
          status: error instanceof ApiError ? error.status : undefined,
        });
        showException('Failed to unlink shopping list', error);
      })
      .finally(() => {
        setUnlinkingLinkId(null);
        setLinkToUnlink(null);
      });
  }, [detail, emitUnlinkFlowEvent, linkToUnlink, query, showException, showSuccess, showWarning, unlinkMutation]);

  const handleUnlinkDialogChange = useCallback((nextOpen: boolean) => {
    if (!nextOpen) {
      setLinkToUnlink(null);
    }
  }, []);

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
        overviewStatus={overviewStatus}
        overviewSearch={overviewSearch}
        onCreatePickList={handleCreatePickListOpen}
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
        <KitShoppingListDialog
          open={isShoppingListDialogOpen}
          onOpenChange={setShoppingListDialogOpen}
          kit={detail}
          contents={contents}
        />
      ) : null}
      {detail && linkToUnlink ? (
        <ConfirmDialog
          open={Boolean(linkToUnlink)}
          onOpenChange={handleUnlinkDialogChange}
          title="Unlink shopping list?"
          description={`Removing the link to "${linkToUnlink.name}" will not delete the shopping list or its lines.`}
          confirmText="Unlink list"
          destructive
          onConfirm={handleConfirmUnlink}
          contentProps={{ 'data-testid': 'kits.detail.shopping-list.unlink.dialog' } as DialogContentProps}
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
  overviewStatus: KitStatus;
  overviewSearch?: string;
  onCreatePickList: () => void;
}

// Renders the BOM card with inline editing controls once kit data is ready.
function KitDetailLoaded({
  detail,
  contents,
  aggregates,
  query,
  overviewStatus,
  overviewSearch,
  onCreatePickList,
}: KitDetailLoadedProps) {
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
      <KitPickListPanel
        kit={detail}
        overviewStatus={overviewStatus}
        overviewSearch={overviewSearch}
        onCreatePickList={onCreatePickList}
      />
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
          We couldn’t load kit “{kitId}”. Error: {message}
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

  return {
    kitId: detail.id,
    hasLinkedWork: detail.shoppingListLinks.length > 0,
    shoppingLists: {
      count: detail.shoppingListLinks.length,
      ids: detail.shoppingListLinks.map((link) => link.shoppingListId),
      statusCounts: shoppingStatusCounts,
    },
  };
}

interface KitBOMSummaryProps {
  aggregates: KitContentAggregates;
}

function KitBOMSummary({ aggregates }: KitBOMSummaryProps) {
  return (
    <div className="flex flex-wrap gap-2" data-testid="kits.detail.table.summary">
      <KeyValueBadge
        label="Total required"
        value={SUMMARY_FORMATTER.format(aggregates.totalRequired)}
        color="neutral"
        testId="kits.detail.table.summary.total"
      />
      <KeyValueBadge
        label="Shortfall"
        value={SUMMARY_FORMATTER.format(aggregates.totalShortfall)}
        color="danger"
        testId="kits.detail.table.summary.shortfall"
      />
    </div>
  );
}

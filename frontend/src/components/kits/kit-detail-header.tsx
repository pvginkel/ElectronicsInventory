/* eslint-disable react-refresh/only-export-components */
import { type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ShoppingListLinkChip } from '@/components/shopping-lists/shopping-list-link-chip';
import { PickListLinkChip } from '@/components/kits/pick-list-link-chip';
import type { KitDetail, KitPickListSummary, KitShoppingListLink, KitStatus } from '@/types/kits';

export interface KitDetailHeaderSlots {
  breadcrumbs: ReactNode;
  title: ReactNode;
  titleMetadata?: ReactNode;
  description?: ReactNode;
  metadataRow?: ReactNode;
  actions?: ReactNode;
}

export interface KitDetailHeaderOptions {
  kit?: KitDetail;
  isLoading: boolean;
  overviewStatus: KitStatus;
  overviewSearch?: string;
}

const STATUS_LABEL: Record<KitStatus, string> = {
  active: 'Active',
  archived: 'Archived',
};

const STATUS_BADGE_CLASSNAME: Record<KitStatus, string> = {
  active: 'bg-emerald-100 text-emerald-800',
  archived: 'bg-slate-100 text-slate-700',
};

const SHOPPING_STATUS_ORDER: Record<string, number> = {
  concept: 0,
  ready: 1,
  done: 2,
};

const PICK_LIST_STATUS_ORDER: Record<string, number> = {
  open: 0,
  completed: 1,
};

/**
 * Build the header slots for the kit detail layout.
 */
export function createKitDetailHeaderSlots(options: KitDetailHeaderOptions): KitDetailHeaderSlots {
  const { kit, isLoading, overviewStatus, overviewSearch } = options;

  if (isLoading) {
    return {
      breadcrumbs: (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link to="/kits" search={{ status: overviewStatus, ...(overviewSearch ? { search: overviewSearch } : {}) }} className="hover:text-foreground">
            Kits
          </Link>
          <span>/</span>
          <span>Loading…</span>
        </div>
      ),
      title: <div className="h-8 w-64 animate-pulse rounded bg-muted" />,
      description: (
        <div className="space-y-2">
          <div className="h-4 w-80 animate-pulse rounded bg-muted" />
          <div className="h-4 w-64 animate-pulse rounded bg-muted" />
        </div>
      ),
      metadataRow: (
        <div className="flex flex-wrap items-center gap-2">
          <div className="h-6 w-28 animate-pulse rounded bg-muted" />
          <div className="h-6 w-40 animate-pulse rounded-full bg-muted" />
          <div className="h-6 w-40 animate-pulse rounded-full bg-muted" />
        </div>
      ),
      actions: (
        <DisabledActionTooltip />
      ),
    };
  }

  if (!kit) {
    return {
      breadcrumbs: (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link to="/kits" search={{ status: overviewStatus, ...(overviewSearch ? { search: overviewSearch } : {}) }} className="hover:text-foreground">
            Kits
          </Link>
          <span>/</span>
          <span>Not found</span>
        </div>
      ),
      title: <span data-testid="kits.detail.header.name">Kit not found</span>,
      description: (
        <p className="text-sm text-muted-foreground">
          The requested kit could not be located.
        </p>
      ),
    };
  }

  const searchState = overviewSearch ? { search: overviewSearch, status: overviewStatus } : { status: overviewStatus };
  const statusLabel = STATUS_LABEL[kit.status];
  const statusBadgeClassName = STATUS_BADGE_CLASSNAME[kit.status];
  const sortedShoppingLinks = sortShoppingLinks(kit.shoppingListLinks);
  const sortedPickLists = sortPickLists(kit.pickLists);
  const hasLinkedWork = sortedShoppingLinks.length > 0 || sortedPickLists.length > 0;

  return {
    breadcrumbs: (
      <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="kits.detail.breadcrumbs">
        <Link to="/kits" search={searchState} className="hover:text-foreground">
          Kits
        </Link>
        <span>/</span>
        <span className="text-foreground" data-testid="kits.detail.breadcrumbs.current">
          {kit.name}
        </span>
      </div>
    ),
    title: (
      <span data-testid="kits.detail.header.name">
        {kit.name}
      </span>
    ),
    titleMetadata: (
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant="outline"
          className={cn('capitalize', statusBadgeClassName)}
          data-testid="kits.detail.header.status"
        >
          {statusLabel}
        </Badge>
        <Badge
          variant="outline"
          className="bg-slate-100 text-slate-700"
          title="Target quantity to maintain in stock"
          data-testid="kits.detail.badge.build-target"
        >
          Build target {kit.buildTarget}
        </Badge>
      </div>
    ),
    description: kit.description ? (
      <p className="max-w-2xl text-sm text-muted-foreground" data-testid="kits.detail.header.description">
        {kit.description}
      </p>
    ) : null,
    metadataRow: (
      <div className="flex flex-wrap items-center gap-2" data-testid="kits.detail.header.badges">
        {hasLinkedWork ? (
          <div className="flex flex-wrap gap-2" data-testid="kits.detail.links">
            {sortedShoppingLinks.map((link) => (
              <ShoppingListLinkChip
                key={link.id}
                listId={link.shoppingListId}
                name={link.name}
                status={link.status}
                testId={`kits.detail.links.shopping.${link.shoppingListId}`}
              />
            ))}
            {sortedPickLists.map((pickList) => (
              <PickListLinkChip
                key={pickList.id}
                pickListId={pickList.id}
                label={formatPickListLabel(pickList)}
                status={pickList.status}
                testId={`kits.detail.links.pick-lists.${pickList.id}`}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground" data-testid="kits.detail.links.empty">
            This kit is not linked to any shopping lists or pick lists yet.
          </p>
        )}
      </div>
    ),
    actions: <DisabledActionTooltip />,
  };
}

function sortShoppingLinks(links: KitShoppingListLink[]): KitShoppingListLink[] {
  return [...links].sort((a, b) => {
    const statusOrderA = SHOPPING_STATUS_ORDER[a.status] ?? Number.MAX_SAFE_INTEGER;
    const statusOrderB = SHOPPING_STATUS_ORDER[b.status] ?? Number.MAX_SAFE_INTEGER;
    if (statusOrderA !== statusOrderB) {
      return statusOrderA - statusOrderB;
    }
    return a.name.localeCompare(b.name);
  });
}

function sortPickLists(pickLists: KitPickListSummary[]): KitPickListSummary[] {
  return [...pickLists].sort((a, b) => {
    const statusOrderA = PICK_LIST_STATUS_ORDER[a.status] ?? Number.MAX_SAFE_INTEGER;
    const statusOrderB = PICK_LIST_STATUS_ORDER[b.status] ?? Number.MAX_SAFE_INTEGER;
    if (statusOrderA !== statusOrderB) {
      return statusOrderA - statusOrderB;
    }
    return a.id - b.id;
  });
}

function formatPickListLabel(pickList: KitPickListSummary): string {
  return `Pick list #${pickList.id}`;
}

function DisabledActionTooltip() {
  const tooltipId = 'kits-detail-edit-tooltip';

  return (
    <div
      className="group relative inline-flex cursor-not-allowed"
      tabIndex={0}
      aria-describedby={tooltipId}
      data-testid="kits.detail.actions.edit.wrapper"
    >
      <Button
        variant="outline"
        disabled
        data-testid="kits.detail.actions.edit"
        aria-disabled="true"
        className="pointer-events-none"
      >
        Edit kit
      </Button>
      <div
        id={tooltipId}
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 hidden w-64 -translate-x-1/2 rounded-md border border-border bg-background p-2 text-xs text-muted-foreground shadow-lg group-hover:block group-focus-visible:block"
        data-testid="kits.detail.actions.edit.tooltip"
      >
        Editing kits will be available after the metadata slice ships.
      </div>
    </div>
  );
}

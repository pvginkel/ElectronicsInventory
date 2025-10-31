/* eslint-disable react-refresh/only-export-components */
import { type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { StatusBadge, KeyValueBadge } from '@/components/ui';
import { ShoppingListLinkChip } from '@/components/shopping-lists/shopping-list-link-chip';
import { MoreVerticalIcon } from '@/components/icons/MoreVerticalIcon';
import type { KitDetail, KitShoppingListLink, KitStatus } from '@/types/kits';

export interface KitDetailHeaderSlots {
  breadcrumbs: ReactNode;
  title: ReactNode;
  titleMetadata?: ReactNode;
  description?: ReactNode;
  metadataRow?: ReactNode;
  actions?: ReactNode;
  linkChips?: ReactNode;
}

export interface KitDetailHeaderOptions {
  kit?: KitDetail;
  isLoading: boolean;
  overviewStatus: KitStatus;
  overviewSearch?: string;
  onEditMetadata?: () => void;
  onOrderStock?: () => void;
  canOrderStock?: boolean;
  onUnlinkShoppingList?: (link: KitShoppingListLink) => void;
  canUnlinkShoppingList?: boolean;
  unlinkingLinkId?: number | null;
  onArchive?: () => void;
  onUnarchive?: () => void;
  onDelete?: () => void;
  menuPending?: boolean;
}

// Map kit status to badge props
function getKitStatusBadgeProps(status: KitStatus): { color: 'active' | 'inactive'; label: string } {
  switch (status) {
    case 'active':
      return { color: 'active', label: 'Active' };
    case 'archived':
      return { color: 'inactive', label: 'Archived' };
  }
}

const SHOPPING_STATUS_ORDER: Record<string, number> = {
  concept: 0,
  ready: 1,
  done: 2,
};

/**
 * Build the header slots for the kit detail layout.
 */
export function createKitDetailHeaderSlots(options: KitDetailHeaderOptions): KitDetailHeaderSlots {
  const {
    kit,
    isLoading,
    overviewStatus,
    overviewSearch,
    onEditMetadata,
    onOrderStock,
    canOrderStock,
    onUnlinkShoppingList,
    canUnlinkShoppingList,
    unlinkingLinkId,
    onArchive,
    onUnarchive,
    onDelete,
    menuPending = false,
  } = options;

  if (isLoading) {
    return {
      breadcrumbs: (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link to="/kits" search={{ status: overviewStatus, ...(overviewSearch ? { search: overviewSearch } : {}) }} className="hover:text-foreground">
            Kits
          </Link>
          <span>/</span>
          <span>Loading...</span>
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
        <div className="flex flex-wrap gap-2" data-testid="kits.detail.actions.wrapper">
          <div data-testid="kits.detail.actions.order-stock.wrapper">
            <Button
              variant="default"
              disabled
              data-testid="kits.detail.actions.order-stock"
            >
              Order Stock
            </Button>
          </div>
          <div className="inline-flex" data-testid="kits.detail.actions.edit.wrapper">
            <Button
              variant="outline"
              disabled
              data-testid="kits.detail.actions.edit"
              aria-disabled="true"
            >
              Edit Kit
            </Button>
          </div>
        </div>
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
  const sortedShoppingLinks = sortShoppingLinks(kit.shoppingListLinks);
  const hasShoppingLists = sortedShoppingLinks.length > 0;
  const isArchived = kit.status === 'archived';
  const effectiveCanOrderStock =
    typeof canOrderStock === 'boolean'
      ? canOrderStock
      : kit.status === 'active' && kit.contents.length > 0;
  const hasKitContents = kit.contents.length > 0;
  const orderButtonDisabled = !effectiveCanOrderStock || !onOrderStock;
  let orderButtonTitle: string | undefined;
  if (kit.status !== 'active') {
    orderButtonTitle = 'Archived kits cannot order stock';
  } else if (!hasKitContents) {
    orderButtonTitle = 'Add parts to the kit before ordering stock';
  }
  if (!onOrderStock) {
    orderButtonTitle = orderButtonTitle ?? 'Order stock is not available for this kit';
  }
  const canUnlink =
    Boolean(onUnlinkShoppingList) && (canUnlinkShoppingList ?? !isArchived);

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
      <StatusBadge
        {...getKitStatusBadgeProps(kit.status)}
        size="large"
        testId="kits.detail.header.status"
      />
    ),
    description: kit.description ? (
      <p className="max-w-2xl text-sm text-muted-foreground" data-testid="kits.detail.header.description">
        {kit.description}
      </p>
    ) : null,
    metadataRow: (
      <div className="flex flex-wrap items-center gap-2" data-testid="kits.detail.header.badges">
        <KeyValueBadge
          label="Build target"
          value={kit.buildTarget}
          color="neutral"
          testId="kits.detail.badge.build-target"
        />
      </div>
    ),
    linkChips: hasShoppingLists ? (
      <div className="flex flex-wrap gap-2" data-testid="kits.detail.body.links">
        {sortedShoppingLinks.map((link) => {
          const unlinkBusy = unlinkingLinkId === link.id;
          const unlinkBlocked = unlinkingLinkId !== null && unlinkingLinkId !== link.id;
          const unlinkTooltip = unlinkBusy
            ? 'Unlink in progress'
            : unlinkBlocked
              ? 'Finish the in-progress unlink before removing another link'
              : 'Remove shopping list link';
          const unlinkProps = canUnlink
            ? {
                onUnlink: () => onUnlinkShoppingList?.(link),
                unlinkDisabled: unlinkBlocked || unlinkBusy,
                unlinkLoading: unlinkBusy,
                unlinkTestId: `kits.detail.links.shopping.unlink.${link.shoppingListId}`,
                unlinkTooltip,
                unlinkLabel: 'Unlink shopping list',
              }
            : {};

          return (
            <ShoppingListLinkChip
              key={link.id}
              listId={link.shoppingListId}
              name={link.name}
              status={link.status}
              testId={`kits.detail.links.shopping.${link.shoppingListId}`}
              {...unlinkProps}
            />
          );
        })}
      </div>
    ) : null,
    actions: (
      <div className="flex flex-wrap gap-2" data-testid="kits.detail.actions.wrapper">
        <div data-testid="kits.detail.actions.order-stock.wrapper">
          <Button
            variant="default"
            onClick={orderButtonDisabled ? undefined : onOrderStock}
            disabled={orderButtonDisabled}
            data-testid="kits.detail.actions.order-stock"
            title={orderButtonDisabled ? orderButtonTitle : undefined}
          >
            Order Stock
          </Button>
        </div>
        <div className="inline-flex" data-testid="kits.detail.actions.edit.wrapper">
          {isArchived ? (
            <ArchivedEditTooltip />
          ) : (
            <Button
              variant="outline"
              onClick={onEditMetadata}
              data-testid="kits.detail.actions.edit"
              disabled={!onEditMetadata}
            >
              Edit Kit
            </Button>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              data-testid="kits.detail.actions.menu"
              aria-label="More Actions"
              disabled={menuPending}
            >
              <MoreVerticalIcon className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {kit.status === 'active' && onArchive ? (
              <DropdownMenuItem
                onClick={onArchive}
                disabled={menuPending}
                data-testid="kits.detail.actions.archive"
              >
                Archive
              </DropdownMenuItem>
            ) : null}
            {kit.status === 'archived' && onUnarchive ? (
              <DropdownMenuItem
                onClick={onUnarchive}
                disabled={menuPending}
                data-testid="kits.detail.actions.unarchive"
              >
                Unarchive
              </DropdownMenuItem>
            ) : null}
            {onDelete ? (
              <DropdownMenuItem
                onClick={onDelete}
                disabled={menuPending}
                data-testid="kits.detail.actions.delete"
              >
                Delete Kit
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    ),
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

function ArchivedEditTooltip() {
  return (
    <Tooltip
      title="Archived kits are read-only. Unarchive the kit to edit metadata or BOM contents."
      testId="kits.detail.actions.edit"
    >
      <Button
        variant="outline"
        disabled
        data-testid="kits.detail.actions.edit"
      >
        Edit Kit
      </Button>
    </Tooltip>
  );
}

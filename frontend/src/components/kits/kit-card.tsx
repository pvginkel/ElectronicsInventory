import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { Card, CardDescription, CardFooter, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { MembershipIndicator } from '@/components/common/membership-indicator';
import type {
  KitSummary,
  KitShoppingListMembershipSummary,
  KitPickListMembershipSummary,
} from '@/types/kits';
import { QuantityBadge } from '../parts/quantity-badge';
import { ClipboardList, ShoppingCart } from 'lucide-react';

interface MembershipIndicatorState<TSummary> {
  summary: TSummary | undefined;
  status: 'pending' | 'error' | 'success';
  fetchStatus: 'idle' | 'fetching' | 'paused';
  error: unknown;
}

interface KitCardProps {
  kit: KitSummary;
  controls?: ReactNode;
  className?: string;
  shoppingIndicator: MembershipIndicatorState<KitShoppingListMembershipSummary>;
  pickIndicator: MembershipIndicatorState<KitPickListMembershipSummary>;
  onOpenDetail?: (kitId: number) => void;
}

export function KitCard({
  kit,
  controls,
  className,
  shoppingIndicator,
  pickIndicator,
  onOpenDetail,
}: KitCardProps) {
  const hasDescription = Boolean(kit.description && kit.description.trim().length > 0);

  const showShoppingIndicator = shouldShowIndicator(shoppingIndicator, kitHasShoppingMembership);
  const showPickIndicator = shouldShowIndicator(pickIndicator, kitHasOpenPickList);

  const handleNavigate = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.button !== 0) {
      return;
    }
    const target = event.target as HTMLElement;
    if (target.closest('a')) {
      return;
    }
    onOpenDetail?.(kit.id);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented) {
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpenDetail?.(kit.id);
    }
  };

  return (
    <Card
      className={cn('flex h-full flex-col gap-4', className)}
      data-testid={`kits.overview.card.${kit.id}`}
    >
      <div
        className="flex flex-1 flex-col gap-3 rounded-md cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid={`kits.overview.card.${kit.id}.link`}
        role="link"
        tabIndex={0}
        onClick={handleNavigate}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-xl font-semibold leading-tight">{kit.name}</CardTitle>
          <div className="flex flex-col items-end gap-2">
            <QuantityBadge quantity={kit.buildTarget} />
            <div
              className="flex items-center gap-2"
              data-testid={`kits.overview.card.${kit.id}.activity`}
            >
              {showShoppingIndicator ? (
                <MembershipIndicator<KitShoppingListMembershipSummary>
                  summary={shoppingIndicator.summary}
                  status={shoppingIndicator.status}
                  fetchStatus={shoppingIndicator.fetchStatus}
                  error={shoppingIndicator.error}
                  testId={`kits.overview.card.${kit.id}.shopping-indicator`}
                  icon={ShoppingCart}
                  ariaLabel={getKitShoppingIndicatorLabel}
                  hasMembership={kitHasShoppingMembership}
                  renderTooltip={renderKitShoppingTooltip}
                  errorMessage="Failed to load kit shopping list memberships."
                  tooltipClassName="w-72"
                />
              ) : null}
              {showPickIndicator ? (
                <MembershipIndicator<KitPickListMembershipSummary>
                  summary={pickIndicator.summary}
                  status={pickIndicator.status}
                  fetchStatus={pickIndicator.fetchStatus}
                  error={pickIndicator.error}
                  testId={`kits.overview.card.${kit.id}.pick-indicator`}
                  icon={ClipboardList}
                  ariaLabel={getKitPickIndicatorLabel}
                  hasMembership={kitHasOpenPickList}
                  renderTooltip={renderKitPickTooltip}
                  errorMessage="Failed to load kit pick list memberships."
                  tooltipClassName="w-72"
                  iconWrapperClassName="bg-amber-500/15 text-amber-600 group-hover:bg-amber-500/20"
                />
              ) : null}
            </div>
            {kit.status === 'archived' && (
              <Badge variant="outline" className="uppercase tracking-wide text-xs">
                Archived
              </Badge>
            )}
          </div>
        </div>

        {hasDescription ? (
          <CardDescription className="line-clamp-3 text-sm text-muted-foreground">
            {kit.description}
          </CardDescription>
        ) : null}
      </div>

      {controls && (
        <CardFooter className="mt-auto flex items-center justify-end gap-2 p-0">
          {controls}
        </CardFooter>
      )}
    </Card>
  );
}

function shouldShowIndicator<TSummary>(
  indicator: MembershipIndicatorState<TSummary>,
  predicate: (summary: TSummary) => boolean
): boolean {
  if (indicator.status === 'pending') {
    return true;
  }
  if (indicator.fetchStatus === 'fetching') {
    return true;
  }
  if (indicator.status === 'error') {
    return true;
  }
  if (!indicator.summary) {
    return false;
  }
  return predicate(indicator.summary);
}

function kitHasShoppingMembership(summary: KitShoppingListMembershipSummary): boolean {
  return summary.hasActiveMembership;
}

function kitHasOpenPickList(summary: KitPickListMembershipSummary): boolean {
  return summary.hasOpenMembership;
}

function getKitShoppingIndicatorLabel(summary: KitShoppingListMembershipSummary): string {
  const count = summary.activeCount;
  const noun = count === 1 ? 'shopping list' : 'shopping lists';
  return `Kit appears on ${count} ${noun}`;
}

function getKitPickIndicatorLabel(summary: KitPickListMembershipSummary): string {
  const count = summary.openCount;
  const noun = count === 1 ? 'open pick list' : 'open pick lists';
  return `Kit has ${count} ${noun}`;
}

function renderKitShoppingTooltip(summary: KitShoppingListMembershipSummary): ReactNode {
  if (summary.memberships.length === 0) {
    return <p className="text-sm text-muted-foreground">No active shopping lists.</p>;
  }

  return (
    <>
      <p className="mb-2 text-xs font-medium text-muted-foreground">Linked shopping lists</p>
      <ul className="space-y-2">
        {summary.memberships.map((membership) => {
          const detailItems: ReactNode[] = [];
          if (membership.requestedUnits > 0) {
            const unitNoun = membership.requestedUnits === 1 ? 'unit' : 'units';
            detailItems.push(
              <span key="units">{`${membership.requestedUnits} ${unitNoun}`}</span>
            );
          }
          if (membership.honorReserved) {
            detailItems.push(
              <span key="reserved" className="font-medium text-muted-foreground/80">
                Honors reservations
              </span>
            );
          }
          if (membership.isStale) {
            detailItems.push(
              <span key="stale" className="font-medium text-amber-600">
                Needs refresh
              </span>
            );
          }

          return (
            <li key={membership.id} className="space-y-1">
              <Link
                to="/shopping-lists/$listId"
                params={{ listId: String(membership.listId) }}
                search={{ sort: 'description', originSearch: undefined }}
                className="flex items-center justify-between gap-2 truncate text-sm hover:text-primary"
                onClick={(event) => event.stopPropagation()}
              >
                <span className="truncate">{membership.listName}</span>
                <Badge
                  variant={membership.status === 'ready' ? 'default' : 'secondary'}
                  className="shrink-0 capitalize"
                >
                  {membership.status}
                </Badge>
              </Link>
              {detailItems.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  {detailItems}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </>
  );
}

function renderKitPickTooltip(summary: KitPickListMembershipSummary): ReactNode {
  if (summary.memberships.length === 0) {
    return <p className="text-sm text-muted-foreground">No open pick lists.</p>;
  }

  return (
    <>
      <p className="mb-2 text-xs font-medium text-muted-foreground">Open pick lists</p>
      <ul className="space-y-2">
        {summary.memberships.map((membership) => {
          const detailItems: ReactNode[] = [];

          detailItems.push(
            <span key="lines">
              {membership.openLineCount}{' '}
              {membership.openLineCount === 1 ? 'open line' : 'open lines'}
            </span>
          );

          detailItems.push(
            <span key="remaining">
              {membership.remainingQuantity}{' '}
              {membership.remainingQuantity === 1 ? 'remaining item' : 'items remaining'}
            </span>
          );

          if (membership.requestedUnits > 0) {
            detailItems.push(
              <span key="units">
                {membership.requestedUnits} {membership.requestedUnits === 1 ? 'unit' : 'units'}
              </span>
            );
          }

          return (
            <li key={membership.id} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate font-medium">Pick list #{membership.id}</span>
                <Badge variant="secondary" className="shrink-0 capitalize">
                  {membership.status}
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                {detailItems}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

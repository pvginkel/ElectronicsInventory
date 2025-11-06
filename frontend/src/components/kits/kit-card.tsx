import type { ReactNode } from 'react';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import {
  QuantityBadge,
  StatusBadge,
  MembershipTooltipContent,
  type MembershipTooltipContentItem,
} from '@/components/ui';
import { MembershipIndicator } from '@/components/ui/membership-indicator';
import type {
  KitSummary,
  KitShoppingListMembershipSummary,
  KitPickListMembershipSummary,
} from '@/types/kits';
import { ClipboardList, ShoppingCart } from 'lucide-react';

interface MembershipIndicatorState<TSummary> {
  summary: TSummary | undefined;
  status: 'pending' | 'error' | 'success';
  fetchStatus: 'idle' | 'fetching' | 'paused';
  error: unknown;
}

interface KitCardProps {
  kit: KitSummary;
  shoppingIndicator: MembershipIndicatorState<KitShoppingListMembershipSummary>;
  pickIndicator: MembershipIndicatorState<KitPickListMembershipSummary>;
  onOpenDetail?: (kitId: number) => void;
}

export function KitCard({
  kit,
  shoppingIndicator,
  pickIndicator,
  onOpenDetail,
}: KitCardProps) {
  const hasDescription = Boolean(kit.description && kit.description.trim().length > 0);

  const showShoppingIndicator = shouldShowIndicator(shoppingIndicator, kitHasShoppingMembership);
  const showPickIndicator = shouldShowIndicator(pickIndicator, kitHasOpenPickList);

  const handleClick = onOpenDetail ? () => onOpenDetail(kit.id) : undefined;

  return (
    <Card
      variant={onOpenDetail ? 'grid-tile' : 'grid-tile-disabled'}
      onClick={handleClick}
      data-testid={`kits.overview.card.${kit.id}`}
    >
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-xl font-semibold leading-tight">{kit.name}</CardTitle>
          <div className="flex flex-col items-end gap-2">
            <QuantityBadge
              quantity={kit.buildTarget}
              testId={`kits.overview.card.${kit.id}.quantity`}
            />
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
                />
              ) : null}
            </div>
            {kit.status === 'archived' && (
              <StatusBadge
                color="inactive"
                label="Archived"
                testId={`kits.overview.card.${kit.id}.status`}
              />
            )}
          </div>
        </div>

        {hasDescription ? (
          <CardDescription className="line-clamp-3 text-sm text-muted-foreground">
            {kit.description}
          </CardDescription>
        ) : null}
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
  const items: MembershipTooltipContentItem[] = summary.memberships.map((membership) => {
    const metadata: ReactNode[] = [];

    if (membership.requestedUnits > 0) {
      const unitNoun = membership.requestedUnits === 1 ? 'unit' : 'units';
      metadata.push(<span key="units">{`${membership.requestedUnits} ${unitNoun}`}</span>);
    }

    if (membership.honorReserved) {
      metadata.push(
        <span key="reserved" className="font-medium text-muted-foreground/80">
          Honors reservations
        </span>
      );
    }

    return {
      id: membership.id,
      label: membership.listName,
      statusBadge: (
        <StatusBadge
          color={
            membership.status === 'ready'
              ? 'active'
              : membership.status === 'done'
                ? 'success'
                : 'inactive'
          }
          label={
            membership.status === 'concept'
              ? 'Concept'
              : membership.status === 'ready'
                ? 'Ready'
                : 'Completed'
          }
          size="default"
          testId=""
        />
      ),
      link: {
        to: '/shopping-lists/$listId',
        params: { listId: String(membership.listId) },
        search: { sort: 'description', originSearch: undefined },
      },
      metadata: metadata.length > 0 ? metadata : undefined,
    };
  });

  return (
    <MembershipTooltipContent
      heading="Linked shopping lists"
      items={items}
      emptyMessage="No active shopping lists."
    />
  );
}

function renderKitPickTooltip(summary: KitPickListMembershipSummary): ReactNode {
  const items: MembershipTooltipContentItem[] = summary.memberships.map((membership) => {
    const metadata: ReactNode[] = [];

    metadata.push(
      <span key="lines">
        {membership.openLineCount} {membership.openLineCount === 1 ? 'open line' : 'open lines'}
      </span>
    );

    metadata.push(
      <span key="remaining">
        {membership.remainingQuantity}{' '}
        {membership.remainingQuantity === 1 ? 'remaining item' : 'items remaining'}
      </span>
    );

    if (membership.requestedUnits > 0) {
      metadata.push(
        <span key="units">
          {membership.requestedUnits} {membership.requestedUnits === 1 ? 'unit' : 'units'}
        </span>
      );
    }

    return {
      id: membership.id,
      label: `Pick list #${membership.id}`,
      statusBadge: (
        <StatusBadge
          color="active"
          label={membership.status === 'open' ? 'Open' : 'Closed'}
          size="default"
          testId=""
        />
      ),
      metadata,
    };
  });

  return (
    <MembershipTooltipContent
      heading="Open pick lists"
      items={items}
      emptyMessage="No open pick lists."
    />
  );
}

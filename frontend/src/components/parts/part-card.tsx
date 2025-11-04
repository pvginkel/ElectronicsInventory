import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { CoverImageDisplay } from '@/components/documents/cover-image-display';
import { type PartWithTotalAndLocationsSchemaList_a9993e3_PartWithTotalAndLocationsSchema } from '@/lib/api/generated/hooks';
import { formatPartForDisplay } from '@/lib/utils/parts';
import {
  CodeBadge,
  InformationBadge,
  QuantityBadge,
  MembershipTooltipContent,
  type MembershipTooltipContentItem,
} from '@/components/ui';
import { LocationSummary } from './location-summary';
import { VendorInfo } from './vendor-info';
import { CircuitBoard, ShoppingCart } from 'lucide-react';
import type { ShoppingListMembershipSummary } from '@/types/shopping-lists';
import type { PartKitMembershipSummary } from '@/hooks/use-part-kit-memberships';
import { Badge } from '@/components/ui/badge';
import { MembershipIndicator } from '@/components/ui/membership-indicator';

interface PartListItemProps {
  part: PartWithTotalAndLocationsSchemaList_a9993e3_PartWithTotalAndLocationsSchema;
  typeMap: Map<number, string>;
  onClick?: () => void;
  shoppingIndicatorSummary?: ShoppingListMembershipSummary;
  shoppingIndicatorStatus: 'pending' | 'error' | 'success';
  shoppingIndicatorFetchStatus: 'idle' | 'fetching' | 'paused';
  shoppingIndicatorError: unknown;
  kitIndicatorSummary?: PartKitMembershipSummary;
  kitIndicatorStatus: 'pending' | 'error' | 'success';
  kitIndicatorFetchStatus: 'idle' | 'fetching' | 'paused';
  kitIndicatorError: unknown;
}

export function PartListItem({
  part,
  typeMap,
  onClick,
  shoppingIndicatorSummary,
  shoppingIndicatorStatus,
  shoppingIndicatorFetchStatus,
  shoppingIndicatorError,
  kitIndicatorSummary,
  kitIndicatorStatus,
  kitIndicatorFetchStatus,
  kitIndicatorError,
}: PartListItemProps) {
  const { displayId, displayDescription, displayManufacturerCode } = formatPartForDisplay(part);

  return (
    <Card
      variant={onClick ? 'grid-tile' : 'grid-tile-disabled'}
      onClick={onClick}
      data-testid="parts.list.card"
      data-part-key={part.key}
    >
      {/* Header Section */}
      <div className="flex items-start gap-3 mb-3">
        {/* Cover Image */}
        <div className="flex-shrink-0">
          <CoverImageDisplay
            partId={part.key}
            hasCoverAttachment={part.has_cover_attachment}
            size="medium"
            className="w-16 h-16 rounded-md shadow-sm"
            showPlaceholder={true}
          />
        </div>

        {/* Main Info */}
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-foreground mb-1 leading-tight">
            {displayDescription}
          </h3>
          {displayManufacturerCode && (
            <p className="text-sm text-muted-foreground mb-2">
              {displayManufacturerCode}
            </p>
          )}
        </div>

        {/* Quantity & Indicator */}
        <div className="flex flex-col items-end gap-2">
          <QuantityBadge
            quantity={part.total_quantity}
            testId={`parts.list.card.quantity-${part.key}`}
          />
          <MembershipIndicator<ShoppingListMembershipSummary>
            summary={shoppingIndicatorSummary}
            status={shoppingIndicatorStatus}
            fetchStatus={shoppingIndicatorFetchStatus}
            error={shoppingIndicatorError}
            testId="parts.list.card.shopping-list-indicator"
            icon={ShoppingCart}
            ariaLabel={getPartShoppingIndicatorLabel}
            hasMembership={partHasShoppingMembership}
            renderTooltip={renderPartShoppingTooltip}
            errorMessage="Failed to load shopping list data."
          />
          <MembershipIndicator<PartKitMembershipSummary>
            summary={kitIndicatorSummary}
            status={kitIndicatorStatus}
            fetchStatus={kitIndicatorFetchStatus}
            error={kitIndicatorError}
            testId="parts.list.card.kit-indicator"
            icon={CircuitBoard}
            ariaLabel={getPartKitIndicatorLabel}
            hasMembership={partHasKitMembership}
            renderTooltip={renderPartKitTooltip}
            errorMessage="Failed to load kit data."
          />
        </div>
      </div>

      {/* Part ID Section */}
      <div className="mb-3">
        <CodeBadge code={displayId} />
      </div>

      {/* Metadata Badges Row */}
      <div className="flex flex-wrap gap-2 mb-3">
        {part.type_id && typeMap.get(part.type_id) && (
          <InformationBadge icon="🏷️" testId={`parts.list.card.badge.type-${part.key}`}>
            {typeMap.get(part.type_id)!}
          </InformationBadge>
        )}
        {part.package && (
          <InformationBadge icon="📏" testId={`parts.list.card.badge.package-${part.key}`}>
            {part.package}
          </InformationBadge>
        )}
        {part.pin_pitch && (
          <InformationBadge icon="📏" testId={`parts.list.card.badge.pin-pitch-${part.key}`}>
            {part.pin_pitch}
          </InformationBadge>
        )}
        {(part.voltage_rating || part.input_voltage || part.output_voltage) && (
          <InformationBadge
            icon="⚡"
            testId={`parts.list.card.badge.voltage-${part.key}`}
          >
            {[
              part.voltage_rating,
              part.input_voltage ? `I: ${part.input_voltage}` : null,
              part.output_voltage ? `O: ${part.output_voltage}` : null
            ]
            .filter(Boolean)
            .join(' ∣ ')}
          </InformationBadge>
        )}
        {part.mounting_type && (
          <InformationBadge icon="📐" testId={`parts.list.card.badge.mounting-type-${part.key}`}>
            {part.mounting_type}
          </InformationBadge>
        )}
      </div>

      {/* Vendor and Location Section */}
      <div className="flex flex-wrap gap-2 text-sm">
        <VendorInfo
          seller={part.seller}
          sellerLink={part.seller_link}
        />

        <LocationSummary
          locations={part.locations || []}
          testId={`parts.list.card.location-summary-${part.key}`}
        />
      </div>
    </Card>
  );
}

function getPartShoppingIndicatorLabel(summary: ShoppingListMembershipSummary): string {
  const count = summary.activeCount;
  const noun = count === 1 ? 'list' : 'lists';
  return `Part appears on ${count} shopping ${noun}`;
}

function partHasShoppingMembership(summary: ShoppingListMembershipSummary): boolean {
  return summary.hasActiveMembership;
}

function renderPartShoppingTooltip(summary: ShoppingListMembershipSummary): ReactNode {
  const items: MembershipTooltipContentItem[] = summary.memberships.map((membership) => ({
    id: membership.listId,
    label: membership.listName,
    statusBadge: (
      <Badge
        variant={membership.listStatus === 'ready' ? 'default' : 'secondary'}
        className="shrink-0 capitalize"
      >
        {membership.listStatus}
      </Badge>
    ),
    link: {
      to: '/shopping-lists/$listId',
      params: { listId: String(membership.listId) },
      search: { sort: 'description', originSearch: undefined },
    },
  }));

  return (
    <MembershipTooltipContent
      heading="On shopping lists"
      items={items}
      emptyMessage="No active shopping lists."
    />
  );
}

function getPartKitIndicatorLabel(summary: PartKitMembershipSummary): string {
  const active = summary.activeCount;
  const archived = summary.archivedCount;
  if (active > 0 && archived > 0) {
    return `Part used in ${active} active kits and ${archived} archived kits`;
  }
  if (active > 0) {
    const noun = active === 1 ? 'kit' : 'kits';
    return `Part used in ${active} active ${noun}`;
  }
  if (archived > 0) {
    const noun = archived === 1 ? 'kit' : 'kits';
    return `Part used in ${archived} archived ${noun}`;
  }
  return 'Part not used in any kits';
}

function partHasKitMembership(summary: PartKitMembershipSummary): boolean {
  return summary.hasMembership;
}

function renderPartKitTooltip(summary: PartKitMembershipSummary): ReactNode {
  const items: MembershipTooltipContentItem[] = summary.kits.map((kit) => ({
    id: kit.kitId,
    label: kit.kitName,
    statusBadge: (
      <Badge
        variant={kit.status === 'active' ? 'default' : 'secondary'}
        className="shrink-0 capitalize"
      >
        {kit.status}
      </Badge>
    ),
    link: {
      to: '/kits/$kitId',
      params: { kitId: String(kit.kitId) },
      search: { status: kit.status },
    },
    metadata: [
      <span key="metadata">
        {kit.requiredPerUnit} per kit • reserved {kit.reservedQuantity}
      </span>,
    ],
  }));

  return (
    <MembershipTooltipContent
      heading="Used in kits"
      items={items}
      emptyMessage="Not used in any kits."
    />
  );
}

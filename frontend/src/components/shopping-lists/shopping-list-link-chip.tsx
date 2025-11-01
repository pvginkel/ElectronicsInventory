import { ShoppingCart } from 'lucide-react';

import { LinkChip } from '@/components/ui';
import type { ShoppingListStatus } from '@/types/shopping-lists';

const DEFAULT_SHOPPING_LIST_SEARCH = {
  sort: 'description',
  originSearch: undefined,
} as const;

// Guidepost: Map shopping list status to badge props
function getShoppingListBadgeProps(status: ShoppingListStatus): { label: string; color: 'inactive' | 'active' } {
  switch (status) {
    case 'concept':
      return { label: 'Concept', color: 'inactive' };
    case 'ready':
      return { label: 'Ready', color: 'active' };
    case 'done':
      return { label: 'Completed', color: 'inactive' };
  }
}

interface ShoppingListLinkChipProps {
  listId?: number;
  to?: string;
  params?: Record<string, string>;
  search?: Record<string, unknown>;
  name: string;
  status: ShoppingListStatus;
  testId?: string;
  iconTestId?: string;
  badgeTestId?: string;
  onUnlink?: () => void;
  unlinkDisabled?: boolean;
  unlinkLoading?: boolean;
  unlinkTestId?: string;
  unlinkTooltip?: string;
  unlinkLabel?: string;
}

/**
 * ShoppingListLinkChip — Domain-specific wrapper for shopping list navigation chips
 *
 * Maps ShoppingListStatus to LinkChip props and provides default ShoppingCart icon.
 * Supports both listId convenience prop and explicit to/params for flexibility.
 * Applies DEFAULT_SHOPPING_LIST_SEARCH when listId is used without explicit search.
 * Renders via the shared LinkChip component.
 */
export function ShoppingListLinkChip({
  listId,
  name,
  status,
  to,
  params,
  search,
  testId,
  iconTestId,
  badgeTestId,
  onUnlink,
  unlinkDisabled,
  unlinkLoading,
  unlinkTestId,
  unlinkTooltip,
  unlinkLabel = 'Unlink list',
}: ShoppingListLinkChipProps) {
  // Guidepost: Resolve routing props from either listId or explicit to/params
  const resolvedTo = to ?? '/shopping-lists/$listId';
  const resolvedParams = params ?? (typeof listId === 'number' ? { listId: String(listId) } : undefined);
  const resolvedSearch =
    search ?? (typeof listId === 'number' ? DEFAULT_SHOPPING_LIST_SEARCH : undefined);

  if (!resolvedParams) {
    throw new Error('ShoppingListLinkChip requires either a listId or explicit params');
  }

  const badgeProps = getShoppingListBadgeProps(status);
  const accessibilityLabel = `${name} (${badgeProps.label})`;

  return (
    <LinkChip
      to={resolvedTo}
      params={resolvedParams}
      search={resolvedSearch}
      label={name}
      icon={<ShoppingCart className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" />}
      statusBadgeColor={badgeProps.color}
      statusBadgeLabel={badgeProps.label}
      accessibilityLabel={accessibilityLabel}
      testId={testId}
      iconTestId={iconTestId}
      badgeTestId={badgeTestId}
      onUnlink={onUnlink}
      unlinkDisabled={unlinkDisabled}
      unlinkLoading={unlinkLoading}
      unlinkTestId={unlinkTestId}
      unlinkTooltip={unlinkTooltip}
      unlinkLabel={unlinkLabel}
    />
  );
}

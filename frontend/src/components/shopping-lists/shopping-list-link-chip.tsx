import type { MouseEvent, ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { ShoppingCart, Unlink } from 'lucide-react';

import { StatusBadge } from '@/components/ui';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ShoppingListStatus } from '@/types/shopping-lists';

const DEFAULT_SHOPPING_LIST_SEARCH = {
  sort: 'description',
  originSearch: undefined,
} as const;

// Map shopping list status to badge props
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
  className?: string;
  testId?: string;
  icon?: ReactNode;
  iconTestId?: string;
  badgeTestId?: string;
  onUnlink?: () => void;
  unlinkDisabled?: boolean;
  unlinkLoading?: boolean;
  unlinkTestId?: string;
  unlinkTooltip?: string;
  unlinkLabel?: string;
}

export function ShoppingListLinkChip({
  listId,
  name,
  status,
  to,
  params,
  search,
  className,
  testId,
  icon,
  iconTestId,
  badgeTestId,
  onUnlink,
  unlinkDisabled,
  unlinkLoading,
  unlinkTestId,
  unlinkTooltip,
  unlinkLabel = 'Unlink list',
}: ShoppingListLinkChipProps) {
  const resolvedTo = to ?? '/shopping-lists/$listId';
  const resolvedParams = params ?? (typeof listId === 'number' ? { listId: String(listId) } : undefined);
  const resolvedSearch =
    search ?? (typeof listId === 'number' ? DEFAULT_SHOPPING_LIST_SEARCH : undefined);

  if (!resolvedParams) {
    throw new Error('ShoppingListLinkChip requires either a listId or explicit params');
  }

  const badgeProps = getShoppingListBadgeProps(status);
  const accessibilityLabel = `${name} (${badgeProps.label})`;

  const handleUnlinkClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onUnlink?.();
  };

  const containerTestId = testId ? `${testId}.wrapper` : undefined;

  return (
    <div
      className={cn(
        'group inline-flex items-center gap-2 rounded-full border border-input bg-muted/40 px-2 py-1 text-sm transition hover:border-primary',
        className,
      )}
      data-testid={containerTestId}
      aria-label={accessibilityLabel}
      title={accessibilityLabel}
    >
      <Link
        to={resolvedTo as any}
        params={resolvedParams as any}
        search={resolvedSearch as any}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-full px-1 py-0.5 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        data-testid={testId}
        aria-label={accessibilityLabel}
        title={accessibilityLabel}
      >
        <span className="flex items-center gap-2 min-w-0">
          {icon ?? (
            <ShoppingCart
              className="h-4 w-4 flex-shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
              aria-hidden="true"
              data-testid={iconTestId}
            />
          )}
          <span className="truncate">{name}</span>
        </span>
        <StatusBadge
          color={badgeProps.color}
          label={badgeProps.label}
          size="default"
          testId={badgeTestId ?? ''}
        />
      </Link>
      {onUnlink ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            'ml-1 h-6 w-6 flex-shrink-0 rounded-full p-0 text-muted-foreground transition-all hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
            'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(pointer:coarse)]:opacity-100',
          )}
          onClick={handleUnlinkClick}
          disabled={unlinkDisabled}
          loading={unlinkLoading}
          data-testid={unlinkTestId}
          title={unlinkTooltip ?? unlinkLabel}
          aria-label={unlinkLabel}
        >
          <Unlink className="h-4 w-4" aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}

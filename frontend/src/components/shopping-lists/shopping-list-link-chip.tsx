import { Link } from '@tanstack/react-router';
import { ShoppingCart } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ShoppingListStatus } from '@/types/shopping-lists';

const DEFAULT_SHOPPING_LIST_SEARCH = {
  sort: 'description',
  originSearch: undefined,
} as const;

interface ShoppingListLinkChipProps {
  listId: number;
  name: string;
  status: ShoppingListStatus;
  className?: string;
  testId?: string;
  iconTestId?: string;
  badgeTestId?: string;
}

export function ShoppingListLinkChip({
  listId,
  name,
  status,
  className,
  testId,
  iconTestId,
  badgeTestId,
}: ShoppingListLinkChipProps) {
  const badgeVariant = status === 'ready' ? 'default' : 'secondary';
  const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
  const accessibilityLabel = `Shopping list ${name} (${statusLabel})`;

  return (
    <Link
      to="/shopping-lists/$listId"
      params={{ listId: String(listId) }}
      search={DEFAULT_SHOPPING_LIST_SEARCH}
      className={cn(
        'group inline-flex items-center gap-2 rounded-full border border-input bg-muted/40 px-3 py-1 text-sm transition hover:border-primary hover:text-primary',
        className,
      )}
      data-testid={testId}
      aria-label={accessibilityLabel}
      title={accessibilityLabel}
    >
      <ShoppingCart
        className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary"
        aria-hidden="true"
        data-testid={iconTestId}
      />
      <span>{name}</span>
      <Badge
        variant={badgeVariant}
        className="capitalize"
        data-testid={badgeTestId}
      >
        {statusLabel}
      </Badge>
    </Link>
  );
}

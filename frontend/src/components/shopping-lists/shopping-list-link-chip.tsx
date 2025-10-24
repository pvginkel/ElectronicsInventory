import type { ReactNode, MouseEvent } from 'react';
import { Link } from '@tanstack/react-router';
import { ShoppingCart, Unlink } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ShoppingListStatus } from '@/types/shopping-lists';

const DEFAULT_SHOPPING_LIST_SEARCH = {
  sort: 'description',
  originSearch: undefined,
} as const;

interface ShoppingListLinkChipProps {
  listId?: number;
  to?: string;
  params?: Record<string, string>;
  search?: Record<string, unknown>;
  name: string;
  status?: ShoppingListStatus;
  badgeLabel?: string;
  badgeVariant?: 'default' | 'secondary' | 'outline' | 'destructive';
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
  badgeLabel,
  badgeVariant,
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

  const resolvedBadgeLabel =
    badgeLabel ??
    (status ? `${status.charAt(0).toUpperCase()}${status.slice(1)}` : undefined);
  const resolvedBadgeVariant =
    badgeVariant ?? (status === 'ready' ? 'default' : 'secondary');
  const accessibilityLabel = resolvedBadgeLabel
    ? `${name} (${resolvedBadgeLabel})`
    : name;

  const handleUnlinkClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onUnlink?.();
  };

  return (
    <Link
      to={resolvedTo as any}
      params={resolvedParams as any}
      search={resolvedSearch as any}
      className={cn(
        'group inline-flex items-center gap-2 rounded-full border border-input bg-muted/40 px-3 py-1 text-sm transition hover:border-primary hover:text-primary',
        className,
      )}
      data-testid={testId}
      aria-label={accessibilityLabel}
      title={accessibilityLabel}
    >
      <span className="flex items-center gap-2">
        {icon ?? (
          <ShoppingCart
            className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary"
            aria-hidden="true"
            data-testid={iconTestId}
          />
        )}
        <span>{name}</span>
      </span>
      {resolvedBadgeLabel ? (
        <Badge
          variant={resolvedBadgeVariant}
          className="capitalize"
          data-testid={badgeTestId}
        >
          {resolvedBadgeLabel}
        </Badge>
      ) : null}
      {onUnlink ? (
        <SpanUnlinkWrapper
          loading={Boolean(unlinkLoading)}
          data-testid={unlinkTestId ? `${unlinkTestId}.wrapper` : undefined}
        >
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              'h-6 w-6 rounded-full p-0 text-muted-foreground transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
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
        </SpanUnlinkWrapper>
      ) : null}
    </Link>
  );
}

interface SpanUnlinkWrapperProps extends React.HTMLAttributes<HTMLSpanElement> {
  loading: boolean;
}

function SpanUnlinkWrapper({ loading, className, children, ...rest }: SpanUnlinkWrapperProps) {
  return (
    <span
      className={cn(
        'flex-shrink-0 overflow-hidden transition-all duration-150',
        loading
          ? 'max-w-[1.75rem] opacity-100'
          : 'max-w-0 opacity-0 group-hover:max-w-[1.75rem] group-hover:opacity-100 group-focus-visible:max-w-[1.75rem] group-focus-visible:opacity-100 focus-within:max-w-[1.75rem] focus-within:opacity-100',
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}

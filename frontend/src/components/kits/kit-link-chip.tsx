import type { MouseEvent, ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { CircuitBoard, Unlink } from 'lucide-react';

import { StatusBadge } from '@/components/ui';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { KitStatus } from '@/types/kits';

interface KitLinkChipProps {
  kitId: number;
  name: string;
  status: KitStatus;
  search?: Record<string, unknown>;
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

// Map kit status to badge props
function getKitStatusBadgeProps(status: KitStatus): { color: 'active' | 'inactive'; label: string } {
  switch (status) {
    case 'active':
      return { color: 'active', label: 'Active' };
    case 'archived':
      return { color: 'inactive', label: 'Archived' };
  }
}

export function KitLinkChip({
  kitId,
  name,
  status,
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
  unlinkLabel = 'Unlink kit',
}: KitLinkChipProps) {
  const statusBadgeProps = getKitStatusBadgeProps(status);
  const accessibilityLabel = `${name} (${statusBadgeProps.label})`;
  const resolvedSearch = search ?? { status };
  const wrapperTestId = testId ? `${testId}.wrapper` : undefined;

  const handleUnlinkClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onUnlink?.();
  };

  return (
    <div
      className={cn(
        'group relative inline-flex items-center gap-2 rounded-full border border-input bg-muted/40 px-2 py-1 text-sm transition-all hover:border-primary',
        onUnlink && 'hover:pr-9 focus-within:pr-9 [@media(pointer:coarse)]:pr-9',
        className,
      )}
      data-testid={wrapperTestId}
      aria-label={accessibilityLabel}
      title={accessibilityLabel}
    >
      <Link
        to="/kits/$kitId"
        params={{ kitId: String(kitId) }}
        search={resolvedSearch as any}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-full px-1 py-0.5 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        data-testid={testId}
        aria-label={accessibilityLabel}
        title={accessibilityLabel}
        onClick={(event) => event.stopPropagation()}
      >
        <span className="flex items-center gap-2 min-w-0">
          {icon ?? (
            <CircuitBoard
              className="h-4 w-4 flex-shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
              aria-hidden="true"
              data-testid={iconTestId}
            />
          )}
          <span className="truncate">{name}</span>
        </span>
        <StatusBadge
          {...statusBadgeProps}
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
            'absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full p-0 text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
            'opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100 [@media(pointer:coarse)]:opacity-100',
            '@media(prefers-reduced-motion:reduce):transition-none',
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

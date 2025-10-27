import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { Package } from 'lucide-react';

import { StatusBadge } from '@/components/ui';
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
}: KitLinkChipProps) {
  const statusBadgeProps = getKitStatusBadgeProps(status);
  const accessibilityLabel = `${name} (${statusBadgeProps.label})`;
  const resolvedSearch = search ?? { status };
  const wrapperTestId = testId ? `${testId}.wrapper` : undefined;

  return (
    <div
      className={cn(
        'group inline-flex items-center gap-2 rounded-full border border-input bg-muted/40 px-2 py-1 text-sm transition hover:border-primary',
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
            <Package
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
    </div>
  );
}

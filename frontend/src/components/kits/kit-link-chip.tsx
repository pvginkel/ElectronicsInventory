import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { Package } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
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

function formatStatusLabel(status: KitStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function resolveBadgeVariant(status: KitStatus): 'default' | 'secondary' | 'outline' {
  return status === 'archived' ? 'secondary' : 'default';
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
  const accessibilityLabel = `${name} (${formatStatusLabel(status)})`;
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
        <Badge
          variant={resolveBadgeVariant(status)}
          className="flex-shrink-0 capitalize"
          data-testid={badgeTestId}
        >
          {formatStatusLabel(status)}
        </Badge>
      </Link>
    </div>
  );
}

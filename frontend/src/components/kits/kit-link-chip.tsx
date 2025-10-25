import { Link } from '@tanstack/react-router';
import { Package } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { KitStatus } from '@/types/kits';

const STATUS_LABEL: Record<KitStatus, string> = {
  active: 'Active',
  archived: 'Archived',
};

interface KitLinkChipProps {
  kitId: number;
  name: string;
  status?: KitStatus;
  returnStatus?: KitStatus;
  returnSearch?: string;
  className?: string;
  testId?: string;
  iconTestId?: string;
  badgeTestId?: string;
}

export function KitLinkChip({
  kitId,
  name,
  status,
  returnStatus,
  returnSearch,
  className,
  testId,
  iconTestId,
  badgeTestId,
}: KitLinkChipProps) {
  const resolvedStatus: KitStatus | undefined = status ?? returnStatus;
  const searchState =
    resolvedStatus !== undefined
      ? {
          status: returnStatus ?? resolvedStatus,
          ...(returnSearch ? { search: returnSearch } : {}),
        }
      : undefined;

  const chipStatus = resolvedStatus ?? 'active';
  const statusLabel = STATUS_LABEL[chipStatus];
  const accessibilityLabel = resolvedStatus ? `Kit ${name} (${statusLabel})` : `Kit ${name}`;

  return (
    <Link
      to="/kits/$kitId"
      params={{ kitId: String(kitId) }}
      search={searchState ?? { status: 'active' }}
      className={cn(
        'group inline-flex items-center gap-2 rounded-full border border-input bg-muted/40 px-3 py-1 text-sm transition hover:border-primary hover:text-primary',
        className,
      )}
      data-testid={testId}
      aria-label={accessibilityLabel}
      title={accessibilityLabel}
    >
      <Package
        className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary"
        aria-hidden="true"
        data-testid={iconTestId}
      />
      <span>{name}</span>
      <Badge variant="secondary" className="capitalize" data-testid={badgeTestId}>
        {statusLabel}
      </Badge>
    </Link>
  );
}

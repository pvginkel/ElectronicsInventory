import { Link } from '@tanstack/react-router';
import { ClipboardList } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { buildPickListDetailSearch } from '@/types/pick-lists';
import type { KitStatus } from '@/types/kits';

interface PickListLinkChipProps {
  pickListId: number;
  label: string;
  status: 'open' | 'completed';
  kitId?: number;
  kitStatus?: KitStatus;
  kitSearch?: string;
  className?: string;
  testId?: string;
  iconTestId?: string;
  badgeTestId?: string;
}

export function PickListLinkChip({
  pickListId,
  label,
  status,
  kitId,
  kitStatus,
  kitSearch,
  className,
  testId,
  iconTestId,
  badgeTestId,
}: PickListLinkChipProps) {
  const badgeVariant = status === 'open' ? 'default' : 'secondary';
  const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
  const accessibilityLabel = `${label} (${statusLabel})`;
  const searchState = buildPickListDetailSearch({
    kitId,
    status: kitStatus,
    search: kitSearch,
  });

  return (
    <Link
      to="/pick-lists/$pickListId"
      params={{ pickListId: String(pickListId) }}
      search={searchState}
      className={cn(
        'group inline-flex items-center gap-2 rounded-full border border-input bg-muted/40 px-3 py-1 text-sm transition hover:border-primary hover:text-primary',
        className,
      )}
      data-testid={testId}
      aria-label={accessibilityLabel}
      title={accessibilityLabel}
    >
      <ClipboardList
        className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary"
        aria-hidden="true"
        data-testid={iconTestId}
      />
      <span>{label}</span>
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

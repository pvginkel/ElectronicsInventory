import { CircuitBoard } from 'lucide-react';

import { LinkChip } from '@/components/ui';
import type { KitStatus } from '@/types/kits';

interface KitLinkChipProps {
  kitId: number;
  name: string;
  status: KitStatus;
  search?: Record<string, unknown>;
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

// Guidepost: Map kit status to badge props
function getKitStatusBadgeProps(status: KitStatus): { color: 'active' | 'inactive'; label: string } {
  switch (status) {
    case 'active':
      return { color: 'active', label: 'Active' };
    case 'archived':
      return { color: 'inactive', label: 'Archived' };
  }
}

/**
 * KitLinkChip — Domain-specific wrapper for kit navigation chips
 *
 * Maps KitStatus to LinkChip props and provides default CircuitBoard icon.
 * Renders via the shared LinkChip component.
 */
export function KitLinkChip({
  kitId,
  name,
  status,
  search,
  testId,
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

  return (
    <LinkChip
      to="/kits/$kitId"
      params={{ kitId: String(kitId) }}
      search={resolvedSearch}
      label={name}
      icon={<CircuitBoard className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" />}
      statusBadgeColor={statusBadgeProps.color}
      statusBadgeLabel={statusBadgeProps.label}
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

import { Wrench, Info } from 'lucide-react';

import { StatusBadge } from '@/components/ui';
import { Tooltip } from '@/components/ui/tooltip';
import { AIPartDuplicateCard } from './ai-duplicate-card';
import { useDuplicatePartDetails } from '@/hooks/use-duplicate-part-details';
import { formatPartForDisplay } from '@/lib/utils/parts';
import { cn } from '@/lib/utils';
import type { DuplicatePartEntry } from '@/types/ai-parts';

interface AIPartLinkChipProps {
  duplicate: DuplicatePartEntry;
  testId: string;
}

/**
 * AIPartLinkChip — Domain-specific chip for duplicate parts in AI analysis
 *
 * Maps DuplicatePartEntry to chip UI and provides:
 * - Wrench icon
 * - Confidence badge (high/medium)
 * - Info icon with hover card showing full duplicate card
 * - Click opens part detail page in new tab (uses window.open, not LinkChip)
 *
 * Note: Uses custom button implementation instead of LinkChip because LinkChip's
 * TanStack Router Link doesn't support target="_blank" for new tab navigation.
 */
export function AIPartLinkChip({ duplicate, testId }: AIPartLinkChipProps) {
  // Fetch part details for display
  const { data: part, isLoading, isError } = useDuplicatePartDetails(duplicate.partKey);

  // Guidepost: Format part display data using shared utility
  const { displayDescription } = part
    ? formatPartForDisplay({
        key: part.key,
        description: part.description,
        manufacturer_code: part.manufacturer_code,
      })
    : { displayDescription: duplicate.partKey };

  // Guidepost: Map confidence to badge props
  const confidenceBadgeProps = getConfidenceBadgeProps(duplicate.confidence);

  // Guidepost: Compute accessibility label
  const accessibilityLabel = `${displayDescription} (${confidenceBadgeProps.label} confidence)`;

  // Guidepost: Loading state - show partKey as label
  const chipLabel = isLoading ? duplicate.partKey : displayDescription;

  // Guidepost: Info tooltip content - render full duplicate card
  const infoTooltipContent = (
    <div className="max-w-[180px]">
      <AIPartDuplicateCard
        duplicate={duplicate}
        part={part}
        isLoading={isLoading}
        isError={isError}
        onClick={undefined} // Disable click in tooltip context
      />
    </div>
  );

  // Guidepost: Handle chip click - open in new tab
  const handleClick = () => {
    window.open(`/parts/${duplicate.partKey}`, '_blank');
  };

  // Guidepost: Handle info icon click - prevent propagation
  const handleInfoClick = (event: React.MouseEvent) => {
    event.stopPropagation();
  };

  return (
    <div
      className={cn(
        'group inline-flex items-center gap-2 rounded-full border border-input bg-muted/40 px-2 py-1 text-sm transition-all hover:border-primary cursor-pointer',
      )}
      data-testid={testId}
      aria-label={accessibilityLabel}
      title={accessibilityLabel}
      onClick={handleClick}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-2 rounded-full px-1 py-0.5 transition-colors hover:text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary"
        aria-label={accessibilityLabel}
        title={accessibilityLabel}
      >
        <span className="flex items-center gap-2 min-w-0">
          <Wrench className="h-4 w-4 flex-shrink-0 text-muted-foreground transition-colors group-hover:text-primary" aria-hidden="true" />
          <span className="truncate">{chipLabel}</span>
        </span>
        <StatusBadge
          color={confidenceBadgeProps.color}
          label={confidenceBadgeProps.label}
          size="default"
          testId=""
        />
      </button>
      {/* Info icon renders outside button to prevent navigation on hover/click */}
      <Tooltip content={infoTooltipContent} placement="auto" testId={`${testId}.info`}>
        <span
          className="flex-shrink-0 text-muted-foreground hover:text-primary transition-colors cursor-help"
          onClick={handleInfoClick}
          data-testid={`${testId}.info`}
        >
          <Info className="h-4 w-4" />
        </span>
      </Tooltip>
    </div>
  );
}

// Guidepost: Map confidence level to badge props
function getConfidenceBadgeProps(confidence: 'high' | 'medium'): {
  color: 'active' | 'inactive';
  label: string;
} {
  switch (confidence) {
    case 'high':
      return { color: 'active', label: 'High' };
    case 'medium':
      return { color: 'inactive', label: 'Medium' };
  }
}

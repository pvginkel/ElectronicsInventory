import { Wrench, Info } from 'lucide-react';

import { LinkChip } from '@/components/ui/link-chip';
import { Tooltip } from '@/components/ui/tooltip';
import { AIPartDuplicateCard } from './ai-duplicate-card';
import { useDuplicatePartDetails } from '@/hooks/use-duplicate-part-details';
import { formatPartForDisplay } from '@/lib/utils/parts';
import type { DuplicatePartEntry } from '@/types/ai-parts';

interface AIPartLinkChipProps {
  duplicate: DuplicatePartEntry;
  testId: string;
}

/**
 * AIPartLinkChip — Domain-specific chip for duplicate parts in AI analysis
 *
 * Maps DuplicatePartEntry to LinkChip UI and provides:
 * - Wrench icon
 * - Confidence badge (high/medium)
 * - Info icon with reasoning tooltip
 * - Chip hover shows full duplicate card
 * - Click opens part detail page in new tab
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

  // Guidepost: Card tooltip content - render full duplicate card on chip hover
  const cardTooltipContent = (
    <div className="max-w-[180px]">
      <AIPartDuplicateCard
        duplicate={duplicate}
        part={part}
        isLoading={isLoading}
        isError={isError}
        onClick={undefined} // Disable click in tooltip context
        inTooltip={true} // Remove card border to avoid double-border with tooltip
      />
    </div>
  );

  // Guidepost: Reasoning tooltip content - show why part was matched
  const reasoningTooltipContent = (
    <div className="text-xs max-w-xs">{duplicate.reasoning}</div>
  );

  // Guidepost: Handle wrapper click - open in new tab
  const handleWrapperClick = () => {
    window.open(`/parts/${duplicate.partKey}`, '_blank');
  };

  return (
    <Tooltip content={cardTooltipContent} placement="bottom" testId={testId}>
      <div onClick={handleWrapperClick} className="cursor-pointer">
        <LinkChip
          to="/parts/$partKey"
          openInNewTab={true}
          params={{ partKey: duplicate.partKey }}
          label={chipLabel}
          icon={<Wrench className="h-4 w-4" />}
          statusBadgeColor={confidenceBadgeProps.color}
          statusBadgeLabel={confidenceBadgeProps.label}
          accessibilityLabel={accessibilityLabel}
          testId={testId}
          infoIcon={<Info className="h-4 w-4" />}
          infoTooltip={reasoningTooltipContent}
          infoIconTestId={`${testId}.info`}
        />
      </div>
    </Tooltip>
  );
}

// Guidepost: Map confidence level to badge props
function getConfidenceBadgeProps(confidence: 'high' | 'medium'): {
  color: 'success' | 'warning';
  label: string;
} {
  switch (confidence) {
    case 'high':
      return { color: 'success', label: 'High' };
    case 'medium':
      return { color: 'warning', label: 'Medium' };
  }
}

import { Tooltip } from '@/components/ui/tooltip';
import { Info } from 'lucide-react';
import { AIPartConfidenceBadge } from './ai-confidence-badge';
import { formatPartForDisplay } from '@/lib/utils/parts';
import type { DuplicatePartEntry } from '@/types/ai-parts';
import type { components } from '@/lib/api/generated/types';
import { cn } from '@/lib/utils';

type PartResponseSchema = components['schemas']['PartResponseSchema.1a46b79'];

interface AIPartDuplicateBarItemProps {
  duplicate: DuplicatePartEntry;
  part: PartResponseSchema | undefined;
  isLoading?: boolean;
  isError?: boolean;
  onClick?: () => void;
}

/**
 * Compact duplicate item for horizontal bar display.
 * Uses flat inline layout: [Part Key] "Description up to 40 chars..." [High ⓘ]
 */
export function AIPartDuplicateBarItem({
  duplicate,
  part,
  isLoading,
  isError,
  onClick,
}: AIPartDuplicateBarItemProps) {
  const { displayDescription } = part
    ? formatPartForDisplay({
        key: part.key,
        description: part.description,
        manufacturer_code: part.manufacturer_code,
      })
    : { displayDescription: duplicate.partKey };

  // Truncate description to 40 chars with ellipsis
  const truncatedDescription =
    displayDescription.length > 40
      ? `${displayDescription.substring(0, 40)}...`
      : displayDescription;

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else {
      // Default behavior: open part in new tab
      window.open(`/parts/${duplicate.partKey}`, '_blank');
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div
        className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-md animate-pulse min-w-[200px]"
        data-testid={`parts.ai.review.duplicate-bar.item.${duplicate.partKey}`}
      >
        <div className="h-4 bg-muted rounded w-12" />
        <div className="h-4 bg-muted rounded flex-1" />
        <div className="h-4 bg-muted rounded w-12" />
      </div>
    );
  }

  // Error or missing part fallback
  const displayKey = part?.key ?? duplicate.partKey;
  const displayText = isError || !part ? duplicate.partKey : truncatedDescription;

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-md transition-colors min-w-[200px]',
        'bg-muted/50 hover:bg-muted active:bg-muted',
        'border border-transparent hover:border-border',
        'text-left'
      )}
      data-testid={`parts.ai.review.duplicate-bar.item.${duplicate.partKey}`}
      data-part-key={displayKey}
    >
      {/* Part Key */}
      <span className="font-mono text-xs text-muted-foreground whitespace-nowrap">
        #{displayKey}
      </span>

      {/* Description (truncated with CSS ellipsis) */}
      <span
        className="text-sm flex-1 truncate"
        title={displayDescription}
      >
        {displayText}
      </span>

      {/* Confidence Badge */}
      <AIPartConfidenceBadge confidence={duplicate.confidence} className="flex-shrink-0" />

      {/* Info Icon with Reasoning Tooltip */}
      <Tooltip
        content={<div className="text-xs max-w-xs">{duplicate.reasoning}</div>}
        testId={`parts.ai.duplicate-reasoning.bar.${duplicate.partKey}`}
      >
        <div className="flex-shrink-0">
          <Info className="h-4 w-4 text-muted-foreground" />
        </div>
      </Tooltip>
    </button>
  );
}

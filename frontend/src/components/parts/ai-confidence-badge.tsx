import { cn } from '@/lib/utils';
import type { DuplicatePartEntry } from '@/types/ai-parts';

interface AIPartConfidenceBadgeProps {
  confidence: DuplicatePartEntry['confidence'];
  className?: string;
}

/**
 * Badge component displaying confidence level with distinct visual styling.
 * - High confidence: green badge
 * - Medium confidence: amber badge
 */
export function AIPartConfidenceBadge({ confidence, className }: AIPartConfidenceBadgeProps) {
  const isHigh = confidence === 'high';

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
        isHigh
          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
          : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
        className
      )}
      data-testid={`parts.ai.confidence.${confidence}`}
    >
      {confidence === 'high' ? 'High' : 'Medium'}
    </span>
  );
}

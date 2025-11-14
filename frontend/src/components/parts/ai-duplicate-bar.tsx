import { AIPartLinkChip } from './ai-part-link-chip';
import { useSortedDuplicates } from '@/hooks/use-sorted-duplicates';
import type { DuplicatePartEntry } from '@/types/ai-parts';

interface AIPartDuplicateBarProps {
  duplicateParts: DuplicatePartEntry[];
}

/**
 * Horizontal bar displaying duplicate part chips with wrapping.
 * Shown at the top of the review step when analysis includes both results and duplicates.
 *
 * Updated design:
 * - Blue panel background (bg-blue-50 dark:bg-blue-950/30)
 * - Larger header font (text-base)
 * - Horizontal chip layout with wrapping (no scrolling)
 * - Chips sorted by confidence (high > medium) then alphabetically
 * - Pointer cursor on chips
 */
export function AIPartDuplicateBar({ duplicateParts }: AIPartDuplicateBarProps) {
  // Guidepost: Fetch and sort duplicates by confidence and description
  // Must call hook before early return to satisfy rules of hooks
  const { sortedDuplicates } = useSortedDuplicates(duplicateParts);

  if (!duplicateParts || duplicateParts.length === 0) {
    return null;
  }

  return (
    <div
      className="mb-6 p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-border"
      data-testid="parts.ai.review.duplicate-bar"
    >
      <div className="flex flex-wrap items-center gap-3">
        {/* Header label on the left */}
        <h3 className="text-base font-semibold text-foreground">
          Potential Duplicates Found:
        </h3>

        {/* Chips on the right with wrapping */}
        <div className="flex flex-wrap gap-2">
          {sortedDuplicates.map((duplicate) => (
            <AIPartLinkChip
              key={duplicate.partKey}
              duplicate={duplicate}
              testId={`parts.ai.review.duplicate-bar.chip.${duplicate.partKey}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

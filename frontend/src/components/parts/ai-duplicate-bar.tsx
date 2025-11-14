import { AIPartDuplicateBarItem } from './ai-duplicate-bar-item';
import { useDuplicatePartDetails } from '@/hooks/use-duplicate-part-details';
import type { DuplicatePartEntry } from '@/types/ai-parts';

interface AIPartDuplicateBarProps {
  duplicateParts: DuplicatePartEntry[];
}

/**
 * Horizontal scrollable bar displaying compact duplicate items.
 * Shown at the top of the review step when analysis includes both results and duplicates.
 */
export function AIPartDuplicateBar({ duplicateParts }: AIPartDuplicateBarProps) {
  if (!duplicateParts || duplicateParts.length === 0) {
    return null;
  }

  return (
    <div
      className="mb-6 p-4 bg-muted/30 rounded-lg border border-border"
      data-testid="parts.ai.review.duplicate-bar"
    >
      <div className="mb-2">
        <h3 className="text-sm font-semibold text-foreground">
          Potential Duplicates Found
        </h3>
        <p className="text-xs text-muted-foreground">
          These parts may already exist in your inventory. Click any item to review.
        </p>
      </div>

      {/* Horizontal scrollable container */}
      <div className="overflow-x-auto -mx-2 px-2">
        <div className="flex gap-2 min-w-min">
          {duplicateParts.map((duplicate) => (
            <DuplicateBarItemWithData key={duplicate.partKey} duplicate={duplicate} />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Wrapper component that fetches part details and renders the bar item
 */
function DuplicateBarItemWithData({ duplicate }: { duplicate: DuplicatePartEntry }) {
  const { data: part, isLoading, isError } = useDuplicatePartDetails(duplicate.partKey);

  return (
    <AIPartDuplicateBarItem
      duplicate={duplicate}
      part={part}
      isLoading={isLoading}
      isError={isError}
    />
  );
}

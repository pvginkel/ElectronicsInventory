import { Button } from '@/components/ui/button';
import { AIPartDuplicateCard } from './ai-duplicate-card';
import { useSortedDuplicates } from '@/hooks/use-sorted-duplicates';
import { useDuplicatePartDetails } from '@/hooks/use-duplicate-part-details';
import type { DuplicatePartEntry } from '@/types/ai-parts';
import { cn } from '@/lib/utils';

interface AIPartDuplicatesOnlyStepProps {
  duplicateParts: DuplicatePartEntry[];
  onBack?: () => void;
  onCancel?: () => void;
}

/**
 * Calculate grid column classes based on duplicate count.
 * Layout preference: wider over taller (1x1 → 2x1 → 3x1 → 3x2 → 4x2 → 4x3 → 5x3 → 5x4)
 */
function getGridClasses(count: number): string {
  if (count <= 1) return 'grid-cols-1';
  if (count === 2) return 'grid-cols-2';
  if (count === 3) return 'grid-cols-3';
  if (count <= 6) return 'grid-cols-3'; // 4-6
  if (count <= 8) return 'grid-cols-4'; // 7-8
  if (count <= 12) return 'grid-cols-4'; // 9-12
  if (count <= 15) return 'grid-cols-5'; // 13-15
  if (count <= 20) return 'grid-cols-5'; // 16-20
  return 'grid-cols-5'; // 21+
}

/**
 * Duplicate-only step component shown when AI analysis returns only duplicate matches.
 * Displays grid of potential duplicate parts with cover images, confidence badges, and reasoning tooltips.
 *
 * Updated design:
 * - Cards sorted by confidence (high > medium) then alphabetically
 * - Cards have 180px max-width
 * - Container has padding to prevent hover animation clipping
 * - Cancel button added to footer
 */
export function AIPartDuplicatesOnlyStep({
  duplicateParts,
  onBack,
  onCancel,
}: AIPartDuplicatesOnlyStepProps) {
  // Guidepost: Fetch and sort duplicates by confidence and description
  const { sortedDuplicates } = useSortedDuplicates(duplicateParts);

  const gridClasses = getGridClasses(sortedDuplicates.length);

  return (
    <div className="flex flex-col h-full" data-testid="parts.ai.duplicates-only-step">
      {/* Header */}
      <div className="flex-shrink-0 text-center mb-6">
        <h2 className="text-2xl font-semibold mb-2">Potential Duplicates Found</h2>
        <p className="text-muted-foreground">
          These parts may already exist in your inventory. Click any card to review the details, or go
          back to create a new part.
        </p>
      </div>

      {/* Scrollable Grid with padding to prevent card hover clipping */}
      <div className="flex-1 overflow-y-auto pb-4 min-h-0">
        <div className={cn('grid gap-4 p-1', gridClasses)}>
          {sortedDuplicates.map((duplicate) => (
            <DuplicateCardWithData key={duplicate.partKey} duplicate={duplicate} />
          ))}
        </div>
      </div>

      {/* Actions - Sticky Footer */}
      <div className="flex-shrink-0 mt-8 pt-6 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex justify-between items-center">
          {onBack && (
            <Button
              variant="outline"
              onClick={onBack}
              data-testid="parts.ai.duplicates.back"
            >
              Go Back
            </Button>
          )}
          {onCancel && (
            <Button
              variant="outline"
              onClick={onCancel}
              data-testid="parts.ai.duplicates.cancel"
            >
              Cancel
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Wrapper component that fetches part details and renders the duplicate card
 */
function DuplicateCardWithData({ duplicate }: { duplicate: DuplicatePartEntry }) {
  const { data: part, isLoading, isError } = useDuplicatePartDetails(duplicate.partKey);

  return (
    <AIPartDuplicateCard
      duplicate={duplicate}
      part={part}
      isLoading={isLoading}
      isError={isError}
    />
  );
}

import { Button } from '@/components/ui/button';
import { AIPartDuplicateCard } from './ai-duplicate-card';
import { useSortedDuplicates } from '@/hooks/use-sorted-duplicates';
import { useDuplicatePartDetails } from '@/hooks/use-duplicate-part-details';
import type { DuplicatePartEntry } from '@/types/ai-parts';

interface AIPartDuplicatesOnlyStepProps {
  duplicateParts: DuplicatePartEntry[];
  onBack?: () => void;
  onCancel?: () => void;
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

  return (
    <div className="flex flex-col h-full space-y-6" data-testid="parts.ai.duplicates-only-step">
      {/* Header */}
      <div className="flex-shrink-0 text-center">
        <h2 className="text-2xl font-semibold mb-2">Potential Duplicates Found</h2>
        <p className="text-muted-foreground">
          These parts may already exist in your inventory. Click any card to review the details, or go
          back to create a new part.
        </p>
      </div>

      {/* Scrollable Grid with padding to prevent card hover clipping */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="grid gap-4 p-1 grid-cols-4">
          {sortedDuplicates.map((duplicate) => (
            <DuplicateCardWithData key={duplicate.partKey} duplicate={duplicate} />
          ))}
        </div>
      </div>

      {/* Actions - Sticky Footer */}
      <div className="flex-shrink-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
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

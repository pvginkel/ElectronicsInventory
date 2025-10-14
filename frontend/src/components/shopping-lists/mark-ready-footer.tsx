import { useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { useFormInstrumentation } from '@/hooks/use-form-instrumentation';
import type { ShoppingListDetail } from '@/types/shopping-lists';

interface MarkReadyFooterProps {
  list: ShoppingListDetail;
  onMarkReady: () => Promise<void>;
  isMarkingReady: boolean;
}

export function MarkReadyFooter({ list, onMarkReady, isMarkingReady }: MarkReadyFooterProps) {
  const isConcept = list.status === 'concept';
  // Guidepost: align with mark-done instrumentation so Playwright can key off consistent IDs.
  const formId = useMemo(() => 'ShoppingListStatus:markReady', []);

  const instrumentation = useFormInstrumentation({
    formId,
    isOpen: isConcept,
    snapshotFields: () => ({
      listId: list.id,
      status: list.status,
      lineCount: list.lines.length,
    }),
  });

  const handleMarkReady = useCallback(async () => {
    if (!isConcept) {
      return;
    }
    instrumentation.trackSubmit();
    try {
      await onMarkReady();
      instrumentation.trackSuccess();
    } catch (error) {
      instrumentation.trackError();
      throw error;
    }
  }, [instrumentation, isConcept, onMarkReady]);

  if (!isConcept) {
    return null;
  }

  const disabled = list.lines.length === 0 || isMarkingReady;

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card px-4 py-4 md:flex-row md:items-center md:justify-between" data-testid="shopping-lists.concept.mark-ready">
      <div className="text-sm text-muted-foreground space-y-1">
        <div>
          <span className="font-medium text-foreground">{list.lines.length}</span> line{list.lines.length === 1 ? '' : 's'} in Concept
        </div>
        <div>
          Ready view groups lines by seller so you can plan orders as soon as this Concept list is complete.
        </div>
      </div>
      <Button
        onClick={handleMarkReady}
        disabled={disabled}
        loading={isMarkingReady}
        data-testid="shopping-lists.concept.mark-ready.button"
      >
        Mark “Ready”
      </Button>
    </div>
  );
}

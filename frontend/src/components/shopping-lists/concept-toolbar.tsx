import { useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { useFormInstrumentation } from '@/hooks/use-form-instrumentation';

interface ConceptToolbarProps {
  lineCount: number;
  canMarkReady: boolean;
  isSubmitting: boolean;
  onMarkReady: () => Promise<void>;
}

export function ConceptToolbar({
  lineCount,
  canMarkReady,
  isSubmitting,
  onMarkReady,
}: ConceptToolbarProps) {
  const formId = useMemo(() => 'ShoppingListStatus:markReady', []);

  const instrumentation = useFormInstrumentation({
    formId,
    isOpen: true,
    snapshotFields: () => ({
      lineCount,
    }),
  });

  const handleMarkReady = useCallback(async () => {
    if (!canMarkReady || isSubmitting) {
      return;
    }

    instrumentation.trackSubmit({ lineCount });
    try {
      await onMarkReady();
      instrumentation.trackSuccess({ lineCount });
    } catch (error) {
      instrumentation.trackError({ lineCount });
      throw error;
    }
  }, [canMarkReady, instrumentation, isSubmitting, lineCount, onMarkReady]);

  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between" data-testid="shopping-lists.concept.toolbar">
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-foreground">Concept actions</h2>
        <p className="text-sm text-muted-foreground">
          Review your parts and mark the list Ready when every line is assigned.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          size="sm"
          loading={isSubmitting}
          disabled={!canMarkReady || isSubmitting}
          onClick={() => { void handleMarkReady(); }}
          data-testid="shopping-lists.concept.toolbar.mark-ready"
        >
          Mark Ready
        </Button>
      </div>
    </div>
  );
}

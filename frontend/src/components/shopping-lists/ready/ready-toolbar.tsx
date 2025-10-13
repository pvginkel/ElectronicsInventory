import { Button } from '@/components/ui/button';

interface ReadyToolbarProps {
  canReturnToConcept: boolean;
  onBackToConcept: () => Promise<void> | void;
  isUpdatingBackToConcept: boolean;
  canMarkDone: boolean;
  onMarkDone: () => Promise<void> | void;
  isMarkingDone: boolean;
}

export function ReadyToolbar({
  canReturnToConcept,
  onBackToConcept,
  isUpdatingBackToConcept,
  canMarkDone,
  onMarkDone,
  isMarkingDone,
}: ReadyToolbarProps) {
  const showHelperCopy = canReturnToConcept;
  const showMarkDone = canMarkDone;

  return (
    <div
      className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-3 backdrop-blur"
      data-testid="shopping-lists.ready.toolbar"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-foreground">Ready actions</h2>
          {showHelperCopy && (
            <p className="text-sm text-muted-foreground" data-testid="shopping-lists.ready.toolbar.copy">
              No lines are currently marked Ordered. You can return to Concept planning if adjustments are needed.
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {showMarkDone && (
            <Button
              variant="primary"
              size="sm"
              loading={isMarkingDone}
              disabled={isMarkingDone || isUpdatingBackToConcept}
              onClick={() => { void onMarkDone(); }}
              data-testid="shopping-lists.ready.toolbar.mark-done"
            >
              Mark Done
            </Button>
          )}
          {canReturnToConcept && (
            <Button
              variant="outline"
              size="sm"
              loading={isUpdatingBackToConcept}
              disabled={isUpdatingBackToConcept || isMarkingDone}
              onClick={() => { void onBackToConcept(); }}
              data-testid="shopping-lists.ready.toolbar.back-to-concept"
            >
              Back to Concept
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

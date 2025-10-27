import { Button } from '@/components/ui/button';

interface ReadyToolbarProps {
  canReturnToConcept: boolean;
  onBackToConcept: () => Promise<void> | void;
  isUpdatingBackToConcept: boolean;
  canMarkDone: boolean;
  onMarkDone: () => Promise<void> | void;
  isMarkingDone: boolean;
  isCompleted: boolean;
}

export function ReadyToolbar({
  canReturnToConcept,
  onBackToConcept,
  isUpdatingBackToConcept,
  canMarkDone,
  onMarkDone,
  isMarkingDone,
  isCompleted,
}: ReadyToolbarProps) {
  const showHelperCopy = canReturnToConcept && !isCompleted;
  const showMarkDone = canMarkDone && !isCompleted;

  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between" data-testid="shopping-lists.ready.toolbar">
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-foreground">Ready actions</h2>
        {isCompleted ? (
          <p className="text-sm text-muted-foreground" data-testid="shopping-lists.ready.toolbar.completed">
            This list is Completed and read-only. Archive history is available from the overview.
          </p>
        ) : showHelperCopy ? (
          <p className="text-sm text-muted-foreground" data-testid="shopping-lists.ready.toolbar.copy">
            No lines are currently marked Ordered. You can return to Concept planning if adjustments are needed.
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {showMarkDone && (
          <Button
            variant="primary"
            size="sm"
            loading={isMarkingDone}
            disabled={isMarkingDone || isUpdatingBackToConcept}
            onClick={() => { void onMarkDone(); }}
            title="Archive this Ready list once all lines are complete"
            data-testid="shopping-lists.ready.toolbar.mark-done"
          >
            Complete List
          </Button>
        )}
        {canReturnToConcept && !isCompleted ? (
          <Button
            variant="outline"
            size="sm"
            loading={isUpdatingBackToConcept}
            disabled={isUpdatingBackToConcept || isMarkingDone}
            onClick={() => { void onBackToConcept(); }}
            title="Return lines to Concept planning without marking the list done"
            data-testid="shopping-lists.ready.toolbar.back-to-concept"
          >
            Revert to Concept
          </Button>
        ) : null}
      </div>
    </div>
  );
}

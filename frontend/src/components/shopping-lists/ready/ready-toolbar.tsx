import { Button } from '@/components/ui/button';

interface ReadyToolbarProps {
  canReturnToConcept: boolean;
  onBackToConcept: () => Promise<void> | void;
  isUpdating: boolean;
}

export function ReadyToolbar({ canReturnToConcept, onBackToConcept, isUpdating }: ReadyToolbarProps) {
  if (!canReturnToConcept) {
    return null;
  }

  return (
    <div
      className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/95 px-4 py-3 backdrop-blur"
      data-testid="shopping-lists.ready.toolbar"
    >
      <div className="text-sm text-muted-foreground">
        No lines are currently marked Ordered. You can return to Concept planning if adjustments are needed.
      </div>
      <Button
        variant="outline"
        disabled={isUpdating}
        loading={isUpdating}
        onClick={() => { void onBackToConcept(); }}
        data-testid="shopping-lists.ready.toolbar.back-to-concept"
      >
        Back to Concept
      </Button>
    </div>
  );
}

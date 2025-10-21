import { createFileRoute } from '@tanstack/react-router';

// Route map generation will be extended in the dedicated pick-list workspace; cast maintains placeholder behavior.
export const Route = createFileRoute('/pick-lists/$pickListId' as any)({
  component: PickListPlaceholder,
});

function PickListPlaceholder() {
  return (
    <div className="p-6" data-testid="pick-lists.detail.placeholder">
      Pick list placeholder
    </div>
  );
}

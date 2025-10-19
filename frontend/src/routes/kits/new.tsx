import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/kits/new')({
  component: KitCreatePlaceholder,
});

function KitCreatePlaceholder() {
  return (
    <div className="flex flex-col gap-4 p-6" data-testid="kits.new.placeholder">
      <h1 className="text-3xl font-bold">Create Kit</h1>
      <p className="text-muted-foreground">
        The kit creation workspace is coming soon. In the meantime, continue planning from the overview.
      </p>
    </div>
  );
}

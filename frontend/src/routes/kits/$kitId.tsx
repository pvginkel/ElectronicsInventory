import { Outlet, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/kits/$kitId')({
  component: KitDetailLayout,
});

function KitDetailLayout() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Outlet />
    </div>
  );
}

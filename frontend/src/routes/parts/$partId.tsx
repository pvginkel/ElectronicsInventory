import { Outlet, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/parts/$partId')({
  component: PartDetailLayout,
})

function PartDetailLayout() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Outlet />
    </div>
  )
}

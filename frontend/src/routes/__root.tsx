import { createRootRoute, Link, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'

export const Route = createRootRoute({
  component: () => (
    <div className="p-2 flex gap-2">
      <nav className="flex gap-2">
        <Link to="/" className="[&.active]:font-bold">
          Home
        </Link>
        <Link to="/search" className="[&.active]:font-bold">
          Search
        </Link>
        <Link to="/parts" className="[&.active]:font-bold">
          Parts
        </Link>
        <Link to="/boxes" className="[&.active]:font-bold">
          Boxes
        </Link>
      </nav>
      <div className="flex-1">
        <Outlet />
      </div>
      <TanStackRouterDevtools />
    </div>
  ),
})
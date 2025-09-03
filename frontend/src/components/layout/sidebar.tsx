import { Link } from '@tanstack/react-router'

interface SidebarItem {
  to: string
  label: string
  icon: string
}

interface SidebarProps {
  isCollapsed?: boolean
  onToggle?: () => void
}

const navigationItems: SidebarItem[] = [
  { to: '/', label: 'Dashboard', icon: '📊' },
  { to: '/parts', label: 'Parts', icon: '🔧' },
  { to: '/boxes', label: 'Storage', icon: '📦' },
  { to: '/types', label: 'Types', icon: '🏷️' },
  { to: '/about', label: 'About', icon: 'ℹ️' }
]

export function Sidebar({ isCollapsed = false, onToggle }: SidebarProps) {
  return (
    <div className={`bg-card border-r border-border transition-all duration-300 h-full ${isCollapsed ? 'w-19' : 'w-64'}`}>
      <div className="flex h-full flex-col">
        {/* Logo/Header */}
        <div className="flex h-16 items-center border-b border-border px-4">
          {!isCollapsed && (
            <div className="flex items-center gap-2">
              <span className="text-3xl">⚡</span>
              <span className="font-semibold text-foreground">Electronics</span>
            </div>
          )}
          {onToggle && (
            <button
              onClick={onToggle}
              className={`${isCollapsed ? 'mx-auto' : 'ml-auto'} flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground`}
              title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <span className="text-xl">☰</span>
            </button>
          )}
        </div>
        
        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4">
          <ul className="space-y-2 px-3">
            {navigationItems.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className="flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground [&.active]:bg-accent [&.active]:text-accent-foreground [&.active]:font-medium"
                >
                  <span className="text-xl">{item.icon}</span>
                  {!isCollapsed && <span>{item.label}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  )
}
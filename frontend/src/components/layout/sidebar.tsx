import { Link } from '@tanstack/react-router'
import { Wrench, CircuitBoard, ShoppingCart, Archive, Tag, Store, Info, type LucideIcon } from 'lucide-react'

interface SidebarItem {
  to: string
  label: string
  icon: LucideIcon
  testId: string
}

interface SidebarProps {
  isCollapsed?: boolean
  onToggle?: () => void
  onNavigate?: () => void
  variant?: 'desktop' | 'mobile'
}

const navigationItems: SidebarItem[] = [
  { to: '/parts', label: 'Parts', icon: Wrench, testId: 'parts' },
  { to: '/kits', label: 'Kits', icon: CircuitBoard, testId: 'kits' },
  { to: '/shopping-lists', label: 'Shopping Lists', icon: ShoppingCart, testId: 'shopping-lists' },
  { to: '/boxes', label: 'Storage', icon: Archive, testId: 'boxes' },
  { to: '/types', label: 'Types', icon: Tag, testId: 'types' },
  { to: '/sellers', label: 'Sellers', icon: Store, testId: 'sellers' },
  { to: '/about', label: 'About', icon: Info, testId: 'about' }
]

export function Sidebar({
  isCollapsed = false,
  onToggle,
  onNavigate,
  variant = 'desktop'
}: SidebarProps) {
  const dataState = isCollapsed ? 'collapsed' : 'expanded'

  return (
    <div
      className={`bg-card border-r border-border transition-all duration-300 h-full ${isCollapsed ? 'w-20' : 'w-64'}`}
      data-testid="app-shell.sidebar"
      data-state={dataState}
      data-variant={variant}
    >
      <div className="flex h-full flex-col">
        {/* Logo/Header */}
        <div className="flex h-16 items-center border-b border-border px-3" data-testid="app-shell.sidebar.header">
          {!isCollapsed && (
            <div className="flex items-center gap-2 px-2">
              <img src="/favicon.png" alt="" className="h-7 w-7" aria-hidden="true" />
              <span className="font-semibold text-foreground">Electronics</span>
            </div>
          )}
          {onToggle && (
            <button
              onClick={onToggle}
              className={`${isCollapsed ? 'mx-auto' : 'ml-auto'} flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground`}
              title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              type="button"
              aria-pressed={!isCollapsed}
              data-testid="app-shell.sidebar.toggle"
            >
              <span className="text-xl">☰</span>
            </button>
          )}
        </div>
        
        {/* Navigation */}
        <nav
          className="flex-1 overflow-y-auto py-4"
          aria-label="Primary"
          data-testid="app-shell.sidebar.nav"
        >
          <ul className="space-y-2 px-3">
            {navigationItems.map((item) => (
              <li key={item.to} data-testid={`app-shell.sidebar.item.${item.testId}`}>
                <Link
                  to={item.to}
                  className="flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground [&.active]:bg-accent [&.active]:text-accent-foreground [&.active]:font-medium"
                  data-testid={`app-shell.sidebar.link.${item.testId}`}
                  data-nav-target={item.to}
                  title={item.label}
                  activeProps={{
                    className: 'active',
                    'data-active': 'true',
                    'aria-current': 'page',
                  }}
                  inactiveProps={{ 'data-active': 'false' }}
                  onClick={() => onNavigate?.()}
                >
                  <item.icon className="h-5 w-5" aria-hidden="true" />
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

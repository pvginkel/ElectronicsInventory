/**
 * Application-specific sidebar navigation items.
 * App-owned — the sidebar shell imports this array to render navigation links.
 */

import { Wrench, CircuitBoard, ShoppingCart, Archive, Tag, Store, Info } from 'lucide-react'
import type { SidebarItem } from './sidebar'

export const navigationItems: SidebarItem[] = [
  { to: '/parts', label: 'Parts', icon: Wrench, testId: 'parts' },
  { to: '/kits', label: 'Kits', icon: CircuitBoard, testId: 'kits' },
  { to: '/shopping-lists', label: 'Shopping Lists', icon: ShoppingCart, testId: 'shopping-lists' },
  { to: '/boxes', label: 'Storage', icon: Archive, testId: 'boxes' },
  { to: '/types', label: 'Types', icon: Tag, testId: 'types' },
  { to: '/sellers', label: 'Sellers', icon: Store, testId: 'sellers' },
  { to: '/about', label: 'About', icon: Info, testId: 'about' },
]

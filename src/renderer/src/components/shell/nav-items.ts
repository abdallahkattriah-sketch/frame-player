import { Home, Settings, type LucideIcon } from 'lucide-react'

// Only views that exist are listed; library views are added as they are built.
export type NavItemId = 'home' | 'settings'

export interface NavItem {
  id: NavItemId
  label: string
  icon: LucideIcon
}

export const primaryNavItems: readonly NavItem[] = [{ id: 'home', label: 'Home', icon: Home }]

export const secondaryNavItems: readonly NavItem[] = [
  { id: 'settings', label: 'Settings', icon: Settings },
]

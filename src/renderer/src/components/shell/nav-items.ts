import { Clock, Film, Home, Library, Settings, Tv, type LucideIcon } from 'lucide-react'

export type NavItemId = 'home' | 'movies' | 'shows' | 'all' | 'history' | 'settings'
/** A fixed page or one of the user's collections. */
export type ViewId = NavItemId | `collection-${number}`

export const collectionViewId = (id: number): ViewId => `collection-${id}`

export interface NavItem {
  id: NavItemId
  label: string
  icon: LucideIcon
}

export const primaryNavItems: readonly NavItem[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'movies', label: 'Movies', icon: Film },
  { id: 'shows', label: 'TV Shows', icon: Tv },
  { id: 'all', label: 'All Media', icon: Library },
  { id: 'history', label: 'History', icon: Clock },
]

export const secondaryNavItems: readonly NavItem[] = [
  { id: 'settings', label: 'Settings', icon: Settings },
]

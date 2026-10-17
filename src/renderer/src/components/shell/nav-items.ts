import { Clapperboard, Clock, Film, Home, Settings, Tv, type LucideIcon } from 'lucide-react'

export type NavItemId = 'home' | 'movies' | 'shows' | 'history' | 'player' | 'settings'

export interface NavItem {
  id: NavItemId
  label: string
  icon: LucideIcon
}

export const primaryNavItems: readonly NavItem[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'movies', label: 'Movies', icon: Film },
  { id: 'shows', label: 'TV Shows', icon: Tv },
  { id: 'history', label: 'History', icon: Clock },
  { id: 'player', label: 'Player', icon: Clapperboard },
]

export const secondaryNavItems: readonly NavItem[] = [
  { id: 'settings', label: 'Settings', icon: Settings },
]

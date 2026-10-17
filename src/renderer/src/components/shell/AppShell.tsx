import type { ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { Toolbar } from './Toolbar'
import type { NavItemId } from './nav-items'

interface AppShellProps {
  activeView: NavItemId
  onNavigate: (id: NavItemId) => void
  children: ReactNode
}

export function AppShell({ activeView, onNavigate, children }: AppShellProps) {
  return (
    <div className="flex h-full bg-bg text-text">
      <Sidebar activeView={activeView} onNavigate={onNavigate} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Toolbar />
        <main className="min-h-0 flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  )
}

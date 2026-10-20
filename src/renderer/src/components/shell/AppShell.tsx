import type { ReactNode } from 'react'
import { MiniPlayer } from './MiniPlayer'
import { Sidebar } from './Sidebar'
import { Toolbar } from './Toolbar'
import type { ViewId } from './nav-items'

interface AppShellProps {
  activeView: ViewId
  onNavigate: (id: ViewId) => void
  search: string
  onSearchChange: (value: string) => void
  /** Optional side panel (e.g. details) beside the main content. */
  aside?: ReactNode
  /** Buttons at the right end of the toolbar. */
  toolbarActions?: ReactNode
  children: ReactNode
}

export function AppShell({
  activeView,
  onNavigate,
  search,
  onSearchChange,
  aside,
  toolbarActions,
  children,
}: AppShellProps) {
  return (
    <div className="flex h-full bg-bg text-text">
      <Sidebar activeView={activeView} onNavigate={onNavigate} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Toolbar search={search} onSearchChange={onSearchChange} actions={toolbarActions} />
        <div className="flex min-h-0 flex-1">
          <main className="min-w-0 flex-1 overflow-auto p-6">{children}</main>
          {aside}
        </div>
        <MiniPlayer />
      </div>
    </div>
  )
}

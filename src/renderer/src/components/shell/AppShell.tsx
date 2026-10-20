import { useEffect, useRef, type ReactNode } from 'react'
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
  const playerArea = useRef<HTMLDivElement>(null)
  // The player is shown over this area (right of the sidebar, below the toolbar).
  useEffect(() => {
    const el = playerArea.current
    if (!el) return
    const report = () => {
      const r = el.getBoundingClientRect()
      if (r.width < 1 || r.height < 1) return
      void window.frame.player
        .setArea({ x: r.left, y: r.top, width: r.width, height: r.height })
        .catch(() => undefined)
    }
    report()
    const observer = new ResizeObserver(report)
    observer.observe(el)
    window.addEventListener('resize', report)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', report)
    }
  }, [])

  return (
    <div className="flex h-full bg-bg text-text">
      <Sidebar activeView={activeView} onNavigate={onNavigate} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Toolbar search={search} onSearchChange={onSearchChange} actions={toolbarActions} />
        <div ref={playerArea} className="flex min-h-0 flex-1">
          <main className="min-w-0 flex-1 overflow-auto p-6">{children}</main>
          {aside}
        </div>
        <MiniPlayer />
      </div>
    </div>
  )
}

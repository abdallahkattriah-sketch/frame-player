import { useState } from 'react'
import { AppShell } from '@renderer/components/shell/AppShell'
import type { NavItemId } from '@renderer/components/shell/nav-items'
import { HomeView } from '@renderer/features/home/HomeView'

export function App() {
  const [activeView, setActiveView] = useState<NavItemId>('home')

  return (
    <AppShell activeView={activeView} onNavigate={setActiveView}>
      <HomeView />
    </AppShell>
  )
}

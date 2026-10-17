import { useState } from 'react'
import { AppShell } from '@renderer/components/shell/AppShell'
import type { NavItemId } from '@renderer/components/shell/nav-items'
import { HomeView } from '@renderer/features/home/HomeView'
import { SettingsView } from '@renderer/features/settings/SettingsView'
import { AllMediaView, HistoryView, MoviesView } from '@renderer/features/library/views'
import { ShowsView } from '@renderer/features/library/ShowsView'
import { useDebounced } from '@renderer/features/library/use-library'

export function App() {
  const [activeView, setActiveView] = useState<NavItemId>('home')
  const [search, setSearch] = useState('')
  const query = useDebounced(search.trim(), 200)

  // Searching from a view without its own search shows results across the library.
  const searchable = activeView === 'movies' || activeView === 'shows' || activeView === 'all'
  const view = query && !searchable ? 'all' : activeView

  const content = (() => {
    switch (view) {
      case 'movies':
        return <MoviesView search={query} />
      case 'shows':
        return <ShowsView search={query} />
      case 'all':
        return <AllMediaView search={query} />
      case 'history':
        return <HistoryView />
      case 'settings':
        return <SettingsView />
      case 'home':
        return <HomeView onOpenSettings={() => setActiveView('settings')} />
    }
  })()

  return (
    <AppShell
      activeView={activeView}
      onNavigate={(id) => {
        setActiveView(id)
        if (id === 'home' || id === 'history' || id === 'settings') setSearch('')
      }}
      search={search}
      onSearchChange={setSearch}
    >
      {content}
    </AppShell>
  )
}

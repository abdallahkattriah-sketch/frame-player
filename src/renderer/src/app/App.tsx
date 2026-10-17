import { useCallback, useEffect, useMemo, useState } from 'react'
import type { LibraryItem } from '@shared/contracts/library'
import { AppShell } from '@renderer/components/shell/AppShell'
import { MainCommandPalette } from './MainCommandPalette'
import { useAppShortcuts } from './use-app-shortcuts'
import type { NavItemId } from '@renderer/components/shell/nav-items'
import { HomeView } from '@renderer/features/home/HomeView'
import { SettingsView } from '@renderer/features/settings/SettingsView'
import { AllMediaView, HistoryView, MoviesView } from '@renderer/features/library/views'
import { ShowsView } from '@renderer/features/library/ShowsView'
import { useDebounced } from '@renderer/features/library/use-library'
import { DetailsPanel } from '@renderer/features/metadata/DetailsPanel'
import { MatchDialog } from '@renderer/features/metadata/MatchDialog'
import { SubtitleSearchDialog } from '@renderer/features/subtitles/SubtitleSearchDialog'
import {
  MetadataActionsContext,
  type MatchRequest,
  type MetadataActions,
} from '@renderer/features/metadata/metadata-actions'

export function App() {
  const [activeView, setActiveView] = useState<NavItemId>('home')
  const [search, setSearch] = useState('')
  const [matchRequest, setMatchRequest] = useState<MatchRequest | null>(null)
  const [detailsItem, setDetailsItem] = useState<LibraryItem | null>(null)
  const [subtitleItem, setSubtitleItem] = useState<LibraryItem | null>(null)
  const [showPalette, setShowPalette] = useState(false)
  const query = useDebounced(search.trim(), 200)

  const navigate = useCallback((id: NavItemId) => {
    setActiveView(id)
    if (id === 'home' || id === 'history' || id === 'settings') setSearch('')
  }, [])
  const openPalette = useCallback(() => setShowPalette(true), [])
  const openSettings = useCallback(() => navigate('settings'), [navigate])
  useAppShortcuts({
    onCommandPalette: openPalette,
    onOpenSettings: openSettings,
    enabled: !showPalette,
  })
  // The player can ask for Settings (e.g. its open-settings shortcut).
  useEffect(() => window.frame.app.onNavigate((view) => navigate(view)), [navigate])

  const metadataActions = useMemo<MetadataActions>(
    () => ({
      openMatch: setMatchRequest,
      openDetails: setDetailsItem,
      openSubtitles: setSubtitleItem,
    }),
    [],
  )

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
    <MetadataActionsContext.Provider value={metadataActions}>
      <AppShell
        activeView={activeView}
        onNavigate={navigate}
        search={search}
        onSearchChange={setSearch}
        aside={
          detailsItem && (
            <DetailsPanel
              key={detailsItem.fileId ?? detailsItem.historyKey}
              item={detailsItem}
              onClose={() => setDetailsItem(null)}
            />
          )
        }
      >
        {content}
      </AppShell>
      {subtitleItem?.fileId != null && (
        <SubtitleSearchDialog
          key={subtitleItem.fileId}
          target={{ fileId: subtitleItem.fileId }}
          label={subtitleItem.fileName}
          isEpisode={subtitleItem.kind === 'episode'}
          onClose={() => setSubtitleItem(null)}
        />
      )}
      {showPalette && (
        <MainCommandPalette onNavigate={navigate} onClose={() => setShowPalette(false)} />
      )}
      {matchRequest && (
        <MatchDialog
          key={JSON.stringify(matchRequest.target)}
          request={matchRequest}
          onClose={() => setMatchRequest(null)}
        />
      )}
    </MetadataActionsContext.Provider>
  )
}

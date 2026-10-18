import { useCallback, useEffect, useMemo, useState } from 'react'
import type { LibraryItem } from '@shared/contracts/library'
import { AppShell } from '@renderer/components/shell/AppShell'
import { MainCommandPalette } from './MainCommandPalette'
import { useSettings } from './settings-context'
import { TmdbSearchResults } from '@renderer/features/metadata/TmdbSearchResults'
import { SetupWizard } from '@renderer/features/setup/SetupWizard'
import { useAppShortcuts } from './use-app-shortcuts'
import type { NavItemId, ViewId } from '@renderer/components/shell/nav-items'
import { CollectionView } from '@renderer/features/collections/CollectionView'
import { AddToCollectionDialog } from '@renderer/features/collections/AddToCollectionDialog'
import { useCollections } from '@renderer/features/collections/use-collections'
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
  const { settings } = useSettings()
  // Until the user navigates, the start page from Settings > General is shown.
  const [chosenView, setActiveView] = useState<ViewId | null>(null)
  const activeView: ViewId = chosenView ?? settings?.general.startView ?? 'home'
  const [setupRequested, setSetupRequested] = useState(false)
  const showSetup = setupRequested || settings?.general.setupComplete === false
  const [collectionItem, setCollectionItem] = useState<LibraryItem | null>(null)
  const { collections } = useCollections()
  const [search, setSearch] = useState('')
  const [matchRequest, setMatchRequest] = useState<MatchRequest | null>(null)
  const [detailsItem, setDetailsItem] = useState<LibraryItem | null>(null)
  const [subtitleItem, setSubtitleItem] = useState<LibraryItem | null>(null)
  const [showPalette, setShowPalette] = useState(false)
  const query = useDebounced(search.trim(), 200)

  const navigate = useCallback((id: ViewId) => {
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
      openAddToCollection: setCollectionItem,
    }),
    [],
  )

  // Searching from a view without its own search shows results across the library.
  const collectionIndex = activeView.startsWith('collection-')
    ? collections.findIndex((c) => `collection-${c.id}` === activeView)
    : -1
  const collection = collections[collectionIndex]
  const searchable =
    activeView === 'movies' || activeView === 'shows' || activeView === 'all' || !!collection
  // A deleted collection falls back to Home.
  const page: NavItemId | 'collection' = collection
    ? 'collection'
    : activeView.startsWith('collection-')
      ? 'home'
      : (activeView as NavItemId)
  const view = query && !searchable ? 'all' : page

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
        return <SettingsView onRunSetup={() => setSetupRequested(true)} />
      case 'home':
        return <HomeView onOpenSettings={() => setActiveView('settings')} />
      case 'collection':
        return collection ? (
          <CollectionView
            collection={collection}
            search={query}
            isFirst={collectionIndex === 0}
            isLast={collectionIndex === collections.length - 1}
            onDeleted={() => navigate('home')}
          />
        ) : null
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
        {query && view !== 'settings' ? (
          // Searching: titles on TMDB above the matches in the library.
          <div className="flex h-full flex-col gap-6">
            <TmdbSearchResults query={query} />
            <div className="min-h-0 flex-1">{content}</div>
          </div>
        ) : (
          content
        )}
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
      {showSetup && <SetupWizard onDone={() => setSetupRequested(false)} />}
      {collectionItem && (
        <AddToCollectionDialog item={collectionItem} onClose={() => setCollectionItem(null)} />
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

import { useState } from 'react'
import type { LibraryView } from '@shared/contracts/library'
import { segmentClass, segmentedClass } from '@renderer/components/ui/Dropdown'
import { LibraryBrowser } from './LibraryBrowser'
import {
  DiscoverPage,
  PageTabs,
  usePageTab,
  useBrowseState,
} from '@renderer/features/discover/Discover'

const libraryEmpty = 'No videos yet. Add library folders in Settings.'

export function MoviesView({ search }: { search: string }) {
  const browse = useBrowseState()
  const [tab, setTab] = usePageTab('movies')
  // Searching always shows the library's matches.
  const tabs =
    browse === 'ready' && !search ? (
      <PageTabs value={tab} onChange={setTab} libraryLabel="Your movies" />
    ) : null
  if (tabs && tab === 'discover') {
    return (
      <DiscoverPage
        title="Movies"
        tabs={tabs}
        hero="trending-movies"
        rows={[
          { list: 'trending-movies', title: 'Top 10 movies this week', topTen: true },
          { list: 'movies-now-playing', title: 'In cinemas now' },
          { list: 'movies-upcoming', title: 'Coming soon' },
          { list: 'movies-popular', title: 'Popular' },
          { list: 'movies-top-rated', title: 'Top rated of all time' },
        ]}
      />
    )
  }
  return (
    <LibraryBrowser
      headerExtra={tabs}
      viewId="movies"
      title="Movies"
      query={{ view: 'movies', search }}
      defaults={{ mode: 'grid', sort: 'title', direction: 'asc' }}
      sortOptions={['title', 'year', 'added', 'size', 'last-watched']}
      showFilters
      emptyState={libraryEmpty}
    />
  )
}

const allMediaFilters: { view: LibraryView; label: string }[] = [
  { view: 'all', label: 'All' },
  { view: 'favorites', label: 'Favorites' },
  { view: 'unmatched', label: 'Unmatched' },
  { view: 'missing', label: 'Missing files' },
]

export function AllMediaView({ search }: { search: string }) {
  const [view, setView] = useState<LibraryView>('all')
  return (
    <LibraryBrowser
      viewId="all-media"
      title={search ? `Results for “${search}”` : 'All media'}
      query={{ view, search }}
      defaults={{ mode: 'list', sort: 'title', direction: 'asc' }}
      sortOptions={['title', 'year', 'added', 'size', 'last-watched']}
      showFilters
      emptyState={
        view === 'favorites'
          ? 'No favorites yet. Use an item’s menu to add one.'
          : view === 'missing'
            ? 'No missing files.'
            : view === 'unmatched'
              ? 'Everything is identified.'
              : libraryEmpty
      }
      headerExtra={
        <div role="group" aria-label="Show" className={segmentedClass}>
          {allMediaFilters.map((f) => (
            <button
              key={f.view}
              type="button"
              aria-pressed={view === f.view}
              onClick={() => setView(f.view)}
              className={segmentClass(view === f.view)}
            >
              {f.label}
            </button>
          ))}
        </div>
      }
    />
  )
}

export function HistoryView() {
  return (
    <LibraryBrowser
      viewId="history"
      title="Recently watched"
      query={{ view: 'recently-watched', limit: 100 }}
      defaults={{ mode: 'list', sort: 'last-watched', direction: 'desc' }}
      sortOptions={['last-watched', 'title']}
      emptyState="Nothing watched yet."
    />
  )
}

import { useState, type ReactNode } from 'react'
import { ArrowDownWideNarrow, ArrowUpNarrowWide, LayoutGrid, List } from 'lucide-react'
import type { LibraryItem, LibraryQuery, SortKey } from '@shared/contracts/library'
import type { ViewPreference } from '@shared/settings/schema'
import { MediaCollection } from './MediaCollection'
import { itemRef } from './item-format'
import { useLibraryQuery, useResolutions, useViewPreference } from './use-library'

const sortLabels: Record<SortKey, string> = {
  title: 'Title',
  year: 'Year',
  added: 'Date added',
  size: 'File size',
  'last-watched': 'Last watched',
  episode: 'Episode order',
  manual: 'Your order',
}

export interface LibraryBrowserProps {
  /** Persisted preference key, e.g. "movies". */
  viewId: string
  title: string
  query: LibraryQuery
  defaults: ViewPreference
  sortOptions: SortKey[]
  showFilters?: boolean
  /** Builds the play queue: by default the clicked item and everything after it. */
  queueFor?: (items: LibraryItem[], index: number) => LibraryItem[]
  emptyState: ReactNode
  headerExtra?: ReactNode
}

type WatchedFilter = NonNullable<LibraryQuery['watched']>

export function playItems(items: LibraryItem[]) {
  if (items.length === 0) return
  void window.frame.library.play({ items: items.map(itemRef) }).catch(() => undefined)
}

export function LibraryBrowser({
  viewId,
  title,
  query,
  defaults,
  sortOptions,
  showFilters,
  queueFor = (items, index) => [items[index] as LibraryItem],
  emptyState,
  headerExtra,
}: LibraryBrowserProps) {
  const [pref, setPref] = useViewPreference(viewId, defaults)
  const [watched, setWatched] = useState<WatchedFilter | ''>('')
  const [resolution, setResolution] = useState('')
  const resolutions = useResolutions()

  const fullQuery: LibraryQuery = {
    ...query,
    sort: pref.sort,
    direction: pref.direction,
    ...(watched ? { watched } : {}),
    ...(resolution ? { resolution } : {}),
  }
  const { data: items, error } = useLibraryQuery(fullQuery)
  const filtered = Boolean(watched || resolution || query.search)

  return (
    <section className="flex h-full flex-col gap-4" aria-labelledby={`${viewId}-heading`}>
      <header className="flex flex-wrap items-center gap-3">
        <h1 id={`${viewId}-heading`} className="text-2xl font-semibold tracking-tight">
          {title}
        </h1>
        {items && (
          <span className="text-sm text-subtle" data-testid="item-count">
            {items.length.toLocaleString()} {items.length === 1 ? 'item' : 'items'}
          </span>
        )}
        {headerExtra}
        <div className="ml-auto flex flex-wrap items-center gap-2 text-sm">
          {showFilters && (
            <>
              <select
                aria-label="Watched status"
                value={watched}
                onChange={(e) => setWatched(e.currentTarget.value as WatchedFilter | '')}
                className="rounded-md border border-border bg-surface px-2 py-1.5"
              >
                <option value="">Any status</option>
                <option value="unwatched">Unwatched</option>
                <option value="in-progress">In progress</option>
                <option value="watched">Watched</option>
              </select>
              {resolutions.data && resolutions.data.length > 0 && (
                <select
                  aria-label="Resolution"
                  value={resolution}
                  onChange={(e) => setResolution(e.currentTarget.value)}
                  className="rounded-md border border-border bg-surface px-2 py-1.5"
                >
                  <option value="">Any resolution</option>
                  {resolutions.data.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              )}
            </>
          )}
          <select
            aria-label="Sort by"
            value={pref.sort}
            onChange={(e) => setPref({ sort: e.currentTarget.value as SortKey })}
            className="rounded-md border border-border bg-surface px-2 py-1.5"
          >
            {sortOptions.map((key) => (
              <option key={key} value={key}>
                {sortLabels[key]}
              </option>
            ))}
          </select>
          <button
            type="button"
            aria-label={pref.direction === 'asc' ? 'Sort ascending' : 'Sort descending'}
            title={pref.direction === 'asc' ? 'Ascending' : 'Descending'}
            onClick={() => setPref({ direction: pref.direction === 'asc' ? 'desc' : 'asc' })}
            className="rounded-md border border-border p-1.5 hover:bg-elevated"
          >
            {pref.direction === 'asc' ? (
              <ArrowUpNarrowWide size={16} />
            ) : (
              <ArrowDownWideNarrow size={16} />
            )}
          </button>
          <div role="group" aria-label="Layout" className="flex rounded-md border border-border">
            <button
              type="button"
              aria-label="Grid"
              aria-pressed={pref.mode === 'grid'}
              onClick={() => setPref({ mode: 'grid' })}
              className={`p-1.5 ${pref.mode === 'grid' ? 'bg-elevated text-accent' : 'hover:bg-elevated'}`}
            >
              <LayoutGrid size={16} />
            </button>
            <button
              type="button"
              aria-label="List"
              aria-pressed={pref.mode === 'list'}
              onClick={() => setPref({ mode: 'list' })}
              className={`p-1.5 ${pref.mode === 'list' ? 'bg-elevated text-accent' : 'hover:bg-elevated'}`}
            >
              <List size={16} />
            </button>
          </div>
        </div>
      </header>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {items === null ? (
        <div
          className="grid grid-cols-[repeat(auto-fill,minmax(var(--frame-poster-width),1fr))] gap-5"
          aria-label="Loading"
        >
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className="aspect-[2/3] animate-pulse rounded-md bg-surface" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-center text-sm text-muted">
          {filtered ? 'Nothing matches these filters.' : emptyState}
        </div>
      ) : (
        <MediaCollection
          items={items}
          mode={pref.mode}
          onPlay={(index) => playItems(queueFor(items, index))}
        />
      )}
    </section>
  )
}

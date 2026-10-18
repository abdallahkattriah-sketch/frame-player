import { useState, type ReactNode } from 'react'
import { ArrowDownWideNarrow, ArrowUpNarrowWide, LayoutGrid, List } from 'lucide-react'
import type { LibraryItem, LibraryQuery, SortKey } from '@shared/contracts/library'
import type { ViewPreference } from '@shared/settings/schema'
import { Dropdown, segmentClass, segmentedClass } from '@renderer/components/ui/Dropdown'
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

const watchedOptions = [
  { value: '', label: 'Any status' },
  { value: 'unwatched', label: 'Unwatched' },
  { value: 'in-progress', label: 'In progress' },
  { value: 'watched', label: 'Watched' },
]

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
              <Dropdown
                label="Watched status"
                groups={[
                  {
                    value: watched,
                    options: watchedOptions,
                    onChange: (v) => setWatched(v as WatchedFilter | ''),
                  },
                ]}
              />
              {resolutions.data && resolutions.data.length > 0 && (
                <Dropdown
                  label="Resolution"
                  groups={[
                    {
                      value: resolution,
                      options: [
                        { value: '', label: 'Any resolution' },
                        ...resolutions.data.map((r) => ({ value: r, label: r })),
                      ],
                      onChange: setResolution,
                    },
                  ]}
                />
              )}
            </>
          )}
          <Dropdown
            label="Sort"
            display={
              <>
                {pref.direction === 'asc' ? (
                  <ArrowUpNarrowWide size={14} className="text-subtle" aria-hidden />
                ) : (
                  <ArrowDownWideNarrow size={14} className="text-subtle" aria-hidden />
                )}
                {sortLabels[pref.sort]}
              </>
            }
            groups={[
              {
                label: 'Sort by',
                value: pref.sort,
                options: sortOptions.map((key) => ({ value: key, label: sortLabels[key] })),
                onChange: (v) => setPref({ sort: v as SortKey }),
              },
              {
                label: 'Order',
                value: pref.direction,
                options: [
                  {
                    value: 'asc',
                    label: 'Ascending',
                    icon: <ArrowUpNarrowWide size={14} aria-hidden />,
                  },
                  {
                    value: 'desc',
                    label: 'Descending',
                    icon: <ArrowDownWideNarrow size={14} aria-hidden />,
                  },
                ],
                onChange: (v) => setPref({ direction: v as 'asc' | 'desc' }),
              },
            ]}
          />
          <div role="group" aria-label="Layout" className={segmentedClass}>
            <button
              type="button"
              aria-label="Grid"
              aria-pressed={pref.mode === 'grid'}
              onClick={() => setPref({ mode: 'grid' })}
              className={segmentClass(pref.mode === 'grid')}
            >
              <LayoutGrid size={15} />
            </button>
            <button
              type="button"
              aria-label="List"
              aria-pressed={pref.mode === 'list'}
              onClick={() => setPref({ mode: 'list' })}
              className={segmentClass(pref.mode === 'list')}
            >
              <List size={15} />
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
        <div className="text-sm text-muted" data-testid="empty-state">
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

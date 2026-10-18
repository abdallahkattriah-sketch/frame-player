import { useEffect, useState, type ReactNode } from 'react'
import { Check, Info, Plus, Sparkles, Star } from 'lucide-react'
import type { TmdbListId, TmdbSearchResult } from '@shared/contracts/metadata'
import { Artwork } from '@renderer/components/ui/Artwork'
import { Carousel } from '@renderer/components/ui/Carousel'
import { segmentClass, segmentedClass } from '@renderer/components/ui/Dropdown'
import { useSettings } from '@renderer/app/settings-context'
import { AddToCollectionDialog } from '@renderer/features/collections/AddToCollectionDialog'
import { titleDragProps } from '@renderer/features/collections/collection-drag'
import {
  TmdbCard,
  TmdbDetailsDialog,
  resultLabel,
  titleInput,
} from '@renderer/features/metadata/TmdbSearchResults'

/** Whether TMDB lists can be shown, and why not when they cannot. */
export type BrowseState = 'ready' | 'needs-token' | 'off'

export function useBrowseState(): BrowseState | null {
  const { settings } = useSettings()
  const [tokenConfigured, setTokenConfigured] = useState<boolean | null>(null)
  useEffect(() => {
    window.frame.metadata
      .status()
      .then((s) => setTokenConfigured(s.tokenConfigured))
      .catch(() => setTokenConfigured(false))
    return window.frame.metadata.onStatus((s) => setTokenConfigured(s.tokenConfigured))
  }, [])
  if (!settings || tokenConfigured === null) return null
  if (!settings.metadata.browseTmdb || !settings.privacy.onlineMetadataEnabled) return 'off'
  return tokenConfigured ? 'ready' : 'needs-token'
}

type ListState = { id: TmdbListId; items: TmdbSearchResult[]; failed: boolean }

/** One TMDB list; refreshed when the library changes so "In library" stays right. */
function useTmdbList(id: TmdbListId): TmdbSearchResult[] | null | 'failed' {
  const [state, setState] = useState<ListState | null>(null)
  useEffect(() => {
    let active = true
    const load = () =>
      window.frame.metadata
        .browse(id)
        .then((items) => active && setState({ id, items, failed: false }))
        .catch(
          () => active && setState((s) => (s?.id === id ? s : { id, items: [], failed: true })),
        )
    void load()
    const off = window.frame.library.onChanged(() => void load())
    return () => {
      active = false
      off()
    }
  }, [id])
  if (state?.id !== id) return null
  return state.failed ? 'failed' : state.items
}

interface Actions {
  open: (r: TmdbSearchResult) => void
  add: (r: TmdbSearchResult) => void
}

const typeLabel = (r: TmdbSearchResult) => (r.mediaType === 'tv' ? 'TV show' : 'Movie')

/** A wide, rotating banner of the first titles of a list. */
function Hero({ list, actions }: { list: TmdbListId; actions: Actions }) {
  const items = useTmdbList(list)
  const { settings } = useSettings()
  const featured = Array.isArray(items) ? items.filter((r) => r.backdropPath).slice(0, 6) : []
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const rotate = settings?.appearance.animations !== 'off' && !paused && featured.length > 1

  useEffect(() => {
    if (!rotate) return
    const timer = window.setInterval(() => setIndex((i) => i + 1), 8000)
    return () => window.clearInterval(timer)
  }, [rotate])

  if (items === null)
    return <div className="aspect-[21/8] w-full animate-pulse rounded-xl bg-surface" />
  const r = featured.length > 0 ? featured[index % featured.length] : undefined
  if (!r) return null

  return (
    <section
      aria-label="Featured"
      aria-roledescription="carousel"
      data-testid="discover-hero"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="relative aspect-[21/8] max-h-[440px] min-h-[260px] w-full overflow-hidden rounded-xl border border-border bg-surface"
    >
      <Artwork
        key={`${r.mediaType}-${r.tmdbId}`}
        kind="backdrop"
        path={r.backdropPath}
        alt=""
        className="absolute inset-0 h-full w-full animate-[frame-fade_600ms_ease-out] object-cover"
        fallback={null}
      />
      <div className="absolute inset-0 bg-linear-to-r from-black/90 via-black/55 to-transparent" />
      <div className="absolute inset-0 bg-linear-to-t from-black/70 via-transparent to-transparent" />
      <div
        className="absolute bottom-0 left-0 flex max-w-xl flex-col gap-3 p-8 text-white"
        aria-live="polite"
      >
        <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-accent">
          <Sparkles size={13} aria-hidden /> Trending now
        </span>
        <h2 className="text-3xl font-bold leading-tight tracking-tight" dir="auto">
          {r.title}
        </h2>
        <p className="flex flex-wrap items-center gap-x-2 text-sm text-white/80">
          {r.voteAverage ? (
            <span className="flex items-center gap-1">
              <Star size={13} className="fill-accent text-accent" aria-hidden />
              {r.voteAverage.toFixed(1)}
            </span>
          ) : null}
          {[r.year, typeLabel(r)].filter(Boolean).join(' · ')}
          {r.inLibrary && (
            <span className="flex items-center gap-1 text-accent">
              <Check size={13} aria-hidden /> In your library
            </span>
          )}
        </p>
        {r.overview && (
          <p className="line-clamp-3 text-sm leading-relaxed text-white/85" dir="auto">
            {r.overview}
          </p>
        )}
        <div className="mt-1 flex gap-2">
          <button
            type="button"
            onClick={() => actions.open(r)}
            className="flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-bg hover:brightness-110"
          >
            <Info size={15} aria-hidden /> More info
          </button>
          <button
            type="button"
            onClick={() => actions.add(r)}
            {...titleDragProps(titleInput(r))}
            className="flex items-center gap-1.5 rounded-md bg-white/15 px-4 py-2 text-sm font-semibold text-white backdrop-blur hover:bg-white/25"
          >
            <Plus size={15} aria-hidden /> Add to collection
          </button>
        </div>
      </div>
      {featured.length > 1 && (
        <div
          className="absolute bottom-4 right-5 flex gap-1.5"
          role="group"
          aria-label="Featured titles"
        >
          {featured.map((f, i) => (
            <button
              key={`${f.mediaType}-${f.tmdbId}`}
              type="button"
              aria-label={`Show ${resultLabel(f)}`}
              aria-pressed={i === index % featured.length}
              onClick={() => setIndex(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === index % featured.length
                  ? 'w-6 bg-accent'
                  : 'w-1.5 bg-white/45 hover:bg-white/70'
              }`}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function RowHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {subtitle && <span className="text-xs text-subtle">{subtitle}</span>}
    </div>
  )
}

function RowSkeleton({ wide }: { wide?: boolean }) {
  return (
    <div className="flex gap-4 overflow-hidden" aria-label="Loading">
      {Array.from({ length: 8 }, (_, i) => (
        <div
          key={i}
          className={`aspect-[2/3] shrink-0 animate-pulse rounded-md bg-surface ${wide ? 'ml-12 w-[120px]' : 'w-[140px]'}`}
        />
      ))}
    </div>
  )
}

/** Big outlined numbers beside the top ten posters. */
function TopTenRow({
  title,
  subtitle,
  list,
  actions,
}: {
  title: string
  subtitle?: string
  list: TmdbListId
  actions: Actions
}) {
  const items = useTmdbList(list)
  if (items === 'failed' || (Array.isArray(items) && items.length === 0)) return null
  return (
    <section aria-label={title} className="flex flex-col gap-3" data-testid="top-ten">
      <RowHeading title={title} subtitle={subtitle} />
      {items === null ? (
        <RowSkeleton wide />
      ) : (
        <Carousel label={title} gap="gap-2">
          {items.slice(0, 10).map((r, i) => (
            <li key={`${r.mediaType}-${r.tmdbId}`} className="isolate flex shrink-0 items-start">
              {/* As tall as the poster (120px wide, 2:3), so the number sits on its bottom edge. */}
              <span
                aria-hidden
                className="relative z-0 -mr-3 flex h-[180px] select-none items-end text-[118px] font-black leading-[0.8] tracking-tighter text-bg [-webkit-text-stroke:2px_var(--frame-text-subtle)]"
              >
                {i + 1}
              </span>
              <ol className="contents">
                <TmdbCard
                  result={r}
                  onOpen={() => actions.open(r)}
                  onAdd={() => actions.add(r)}
                  className="z-10 w-[120px]"
                />
              </ol>
            </li>
          ))}
        </Carousel>
      )}
    </section>
  )
}

function ListRow({
  title,
  subtitle,
  list,
  actions,
}: {
  title: string
  subtitle?: string
  list: TmdbListId
  actions: Actions
}) {
  const items = useTmdbList(list)
  if (items === 'failed' || (Array.isArray(items) && items.length === 0)) return null
  return (
    <section aria-label={title} className="flex flex-col gap-3" data-testid="discover-row">
      <RowHeading title={title} subtitle={subtitle} />
      {items === null ? (
        <RowSkeleton />
      ) : (
        <Carousel label={title}>
          {items.map((r) => (
            <TmdbCard
              key={`${r.mediaType}-${r.tmdbId}`}
              result={r}
              onOpen={() => actions.open(r)}
              onAdd={() => actions.add(r)}
              className="w-[140px]"
            />
          ))}
        </Carousel>
      )}
    </section>
  )
}

export interface DiscoverRow {
  list: TmdbListId
  title: string
  subtitle?: string
  /** Shows the first ten with big rank numbers. */
  topTen?: boolean
}

/** A featured banner and rows of TMDB lists, with details and add-to-collection dialogs. */
export function DiscoverRows({ hero, rows }: { hero?: TmdbListId; rows: DiscoverRow[] }) {
  const [open, setOpen] = useState<TmdbSearchResult | null>(null)
  const [adding, setAdding] = useState<TmdbSearchResult | null>(null)
  const actions: Actions = { open: setOpen, add: setAdding }
  return (
    <>
      {hero && <Hero list={hero} actions={actions} />}
      {rows.map((row) =>
        row.topTen ? (
          <TopTenRow key={row.list} {...row} actions={actions} />
        ) : (
          <ListRow key={row.list} {...row} actions={actions} />
        ),
      )}
      {open && <TmdbDetailsDialog result={open} onClose={() => setOpen(null)} />}
      {adding && (
        <AddToCollectionDialog
          target={{ label: resultLabel(adding), title: titleInput(adding) }}
          onClose={() => setAdding(null)}
        />
      )}
    </>
  )
}

/** Shown where TMDB lists would be when no token is saved yet. */
export function DiscoverHint({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <div
      className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface px-5 py-4 text-sm"
      data-testid="discover-hint"
    >
      <Sparkles size={18} className="text-accent" aria-hidden />
      <span className="flex-1 text-muted">
        Add a TMDB token to see what&apos;s trending, the top 10, and new movies and shows here.
      </span>
      <button
        type="button"
        onClick={onOpenSettings}
        className="rounded-md border border-border px-3 py-1.5 hover:bg-elevated"
      >
        Set up TMDB
      </button>
    </div>
  )
}

export type PageTab = 'library' | 'discover'

/** The Library / Discover choice of a page, remembered on this computer. */
export function usePageTab(page: string): [PageTab, (tab: PageTab) => void] {
  const key = `frame.tab.${page}`
  const [tab, setTab] = useState<PageTab>(() => {
    try {
      return localStorage.getItem(key) === 'discover' ? 'discover' : 'library'
    } catch {
      return 'library'
    }
  })
  const choose = (next: PageTab) => {
    setTab(next)
    try {
      localStorage.setItem(key, next)
    } catch {
      // Not remembered; the choice still applies now.
    }
  }
  return [tab, choose]
}

export function PageTabs({
  value,
  onChange,
  libraryLabel,
}: {
  value: PageTab
  onChange: (tab: PageTab) => void
  libraryLabel: string
}) {
  const tabs: [PageTab, string][] = [
    ['library', libraryLabel],
    ['discover', 'Discover'],
  ]
  return (
    <div role="tablist" aria-label="Show" className={segmentedClass}>
      {tabs.map(([id, label]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={value === id}
          onClick={() => onChange(id)}
          className={segmentClass(value === id)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

/** A Movies or TV Shows page showing TMDB lists instead of the library. */
export function DiscoverPage({
  title,
  tabs,
  hero,
  rows,
}: {
  title: string
  tabs: ReactNode
  hero: TmdbListId
  rows: DiscoverRow[]
}) {
  return (
    <section className="flex flex-col gap-9" aria-labelledby="discover-heading">
      <header className="flex flex-wrap items-center gap-3">
        <h1 id="discover-heading" className="text-2xl font-semibold tracking-tight">
          {title}
        </h1>
        {tabs}
      </header>
      <DiscoverRows hero={hero} rows={rows} />
    </section>
  )
}

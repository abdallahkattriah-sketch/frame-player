import { useEffect, useState } from 'react'
import { Film, Plus, Star, Tv } from 'lucide-react'
import type { TmdbSearchResult } from '@shared/contracts/metadata'
import { Artwork } from '@renderer/components/ui/Artwork'
import { Carousel } from '@renderer/components/ui/Carousel'
import { useSettings } from '@renderer/app/settings-context'
import { AddToCollectionDialog } from '@renderer/features/collections/AddToCollectionDialog'
import { TmdbDetailsDialog } from './TmdbDetailsDialog'
import { resultLabel, titleInput } from './tmdb-title'

export { TmdbDetailsDialog, resultLabel, titleInput }
import { titleDragProps } from '@renderer/features/collections/collection-drag'

function errorText(e: unknown) {
  return e instanceof Error
    ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
    : String(e)
}

function PosterFallback({ mediaType }: { mediaType: TmdbSearchResult['mediaType'] }) {
  const Icon = mediaType === 'tv' ? Tv : Film
  return (
    <div className="flex h-full w-full items-center justify-center bg-elevated">
      <Icon size={22} className="text-subtle" aria-hidden />
    </div>
  )
}

/** A TMDB poster: opens details on click, adds to a collection from its hover button, drags. */
export function TmdbCard({
  result: r,
  onOpen,
  onAdd,
  className = 'w-[120px]',
}: {
  result: TmdbSearchResult
  onOpen: (origin: DOMRect) => void
  onAdd: () => void
  className?: string
}) {
  return (
    <li className={`group/card relative shrink-0 ${className}`}>
      <button
        type="button"
        onClick={(e) =>
          onOpen(
            (
              e.currentTarget.querySelector('[data-poster]') ?? e.currentTarget
            ).getBoundingClientRect(),
          )
        }
        {...titleDragProps(titleInput(r))}
        aria-label={`${r.title}${r.year ? ` (${r.year})` : ''}, ${
          r.mediaType === 'tv' ? 'TV show' : 'movie'
        } on TMDB`}
        className="group flex w-full flex-col gap-1.5 text-left"
      >
        <span
          data-poster
          className="frame-poster relative block aspect-[2/3] w-full overflow-hidden rounded-md border border-border"
        >
          <Artwork
            kind="poster"
            path={r.posterPath}
            alt=""
            className="h-full w-full object-cover"
            fallback={<PosterFallback mediaType={r.mediaType} />}
          />
          {r.inLibrary && (
            <span className="absolute left-1.5 top-1.5 rounded bg-bg/85 px-1.5 py-0.5 text-[10px] text-accent">
              In library
            </span>
          )}
          {r.voteAverage ? (
            <span className="absolute bottom-1.5 left-1.5 flex items-center gap-0.5 rounded bg-bg/85 px-1.5 py-0.5 text-[10px] font-medium text-text">
              <Star size={10} className="fill-accent text-accent" aria-hidden />
              {r.voteAverage.toFixed(1)}
            </span>
          ) : null}
        </span>
        <span className="truncate text-sm font-medium" dir="auto">
          {r.title}
        </span>
        <span className="text-xs text-muted">
          {[r.year, r.mediaType === 'tv' ? 'TV' : 'Movie'].filter(Boolean).join(' · ')}
        </span>
      </button>
      <button
        type="button"
        aria-label={`Add ${resultLabel(r)} to a collection`}
        title="Add to collection (or drag onto one in the sidebar)"
        onClick={onAdd}
        className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-bg/85 text-text opacity-0 shadow transition-opacity hover:bg-accent hover:text-bg focus-visible:opacity-100 group-hover/card:opacity-100"
      >
        <Plus size={15} />
      </button>
    </li>
  )
}

/**
 * "On TMDB" results for a library search: titles beyond the user's own files. Shown only
 * when the option is on, online lookups are allowed, and a TMDB token is saved.
 */
export function TmdbSearchResults({ query }: { query: string }) {
  const { settings } = useSettings()
  const [tokenConfigured, setTokenConfigured] = useState(false)
  useEffect(() => {
    window.frame.metadata
      .status()
      .then((s) => setTokenConfigured(s.tokenConfigured))
      .catch(() => undefined)
    return window.frame.metadata.onStatus((s) => setTokenConfigured(s.tokenConfigured))
  }, [])
  const enabled =
    tokenConfigured &&
    (settings?.metadata.searchTmdb ?? false) &&
    (settings?.privacy.onlineMetadataEnabled ?? false)
  const [state, setState] = useState<{
    query: string
    results: TmdbSearchResult[]
    error: string | null
  } | null>(null)
  const [open, setOpen] = useState<{ result: TmdbSearchResult; origin: DOMRect } | null>(null)
  const [adding, setAdding] = useState<TmdbSearchResult | null>(null)
  const trimmed = query.trim()

  useEffect(() => {
    if (!enabled || trimmed.length < 2) return
    let active = true
    window.frame.metadata
      .discover(trimmed)
      .then((results) => {
        if (active) setState({ query: trimmed, results, error: null })
      })
      .catch((e: unknown) => {
        if (active) setState({ query: trimmed, results: [], error: errorText(e) })
      })
    return () => {
      active = false
    }
  }, [enabled, trimmed])

  if (!enabled || trimmed.length < 2) return null
  const current = state?.query === trimmed ? state : null

  return (
    <section aria-label="On TMDB" data-testid="tmdb-results" className="flex flex-col gap-3">
      <div className="flex items-baseline gap-3">
        <h2 className="text-lg font-semibold">On TMDB</h2>
        <span className="text-xs text-subtle">
          Movies and shows matching “{trimmed}”, including ones you don’t have
        </span>
      </div>
      {!current && <p className="text-sm text-muted">Searching TMDB…</p>}
      {current?.error && (
        <p role="alert" className="text-sm text-danger">
          {current.error}
        </p>
      )}
      {current && !current.error && current.results.length === 0 && (
        <p className="text-sm text-muted">Nothing found on TMDB.</p>
      )}
      {current && current.results.length > 0 && (
        <Carousel label="TMDB results">
          {current.results.map((r) => (
            <TmdbCard
              key={`${r.mediaType}-${r.tmdbId}`}
              result={r}
              onOpen={(origin) => setOpen({ result: r, origin })}
              onAdd={() => setAdding(r)}
            />
          ))}
        </Carousel>
      )}
      {open && (
        <TmdbDetailsDialog
          result={open.result}
          origin={open.origin}
          onClose={() => setOpen(null)}
        />
      )}
      {adding && (
        <AddToCollectionDialog
          target={{ label: resultLabel(adding), title: titleInput(adding) }}
          onClose={() => setAdding(null)}
        />
      )}
    </section>
  )
}

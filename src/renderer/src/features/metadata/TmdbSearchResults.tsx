import { useEffect, useRef, useState } from 'react'
import { Check, ExternalLink, Film, Plus, Star, Tv, X } from 'lucide-react'
import { TMDB_IMAGE_PATH, type CollectionTitleInput } from '@shared/contracts/collections'
import type { MediaMetadata, TmdbSearchResult } from '@shared/contracts/metadata'
import { Artwork } from '@renderer/components/ui/Artwork'
import { Carousel } from '@renderer/components/ui/Carousel'
import { useSettings } from '@renderer/app/settings-context'
import { TmdbLogo } from '@renderer/features/settings/TmdbLogo'
import {
  AddToCollectionDialog,
  CollectionMembership,
} from '@renderer/features/collections/AddToCollectionDialog'
import { titleDragProps } from '@renderer/features/collections/collection-drag'

/** What a collection stores about a TMDB result (poster only in the shape the cache accepts). */
export function titleInput(r: TmdbSearchResult): CollectionTitleInput {
  return {
    mediaType: r.mediaType,
    tmdbId: r.tmdbId,
    title: r.title,
    year: r.year,
    posterPath: r.posterPath && TMDB_IMAGE_PATH.test(r.posterPath) ? r.posterPath : null,
  }
}

export const resultLabel = (r: TmdbSearchResult) => `${r.title}${r.year ? ` (${r.year})` : ''}`

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

/** Details of a TMDB title that may not be in the library. */
export function TmdbDetailsDialog({
  result,
  onClose,
}: {
  result: TmdbSearchResult
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const [adding, setAdding] = useState(false)
  const [details, setDetails] = useState<MediaMetadata | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
    window.frame.metadata
      .details(result.mediaType, result.tmdbId)
      .then(setDetails)
      .catch((e: unknown) => setError(errorText(e)))
  }, [result])

  const m = details
  const facts = [
    m?.year ?? result.year,
    result.mediaType === 'tv' ? 'TV show' : 'Movie',
    m?.runtimeMinutes ? `${m.runtimeMinutes} min` : null,
    m?.genres.slice(0, 3).join(', ') || null,
  ].filter(Boolean)

  return (
    <dialog
      ref={ref}
      aria-label={result.title}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      className="m-auto w-full max-w-2xl rounded-lg border border-border bg-surface p-0 text-sm text-text shadow-2xl backdrop:bg-black/60"
      data-testid="tmdb-details"
    >
      <div className="flex gap-5 p-5">
        <div className="aspect-[2/3] w-40 shrink-0 overflow-hidden rounded-md border border-border">
          <Artwork
            kind="poster"
            path={m?.posterPath ?? result.posterPath}
            alt=""
            className="h-full w-full object-cover"
            fallback={<PosterFallback mediaType={result.mediaType} />}
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex items-start gap-2">
            <h2 className="flex-1 text-xl font-semibold" dir="auto">
              {m?.title ?? result.title}
            </h2>
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="rounded-md p-1 text-muted hover:bg-elevated hover:text-text"
            >
              <X size={18} />
            </button>
          </div>
          <p className="text-muted">{facts.join(' · ')}</p>
          {m?.voteAverage ? (
            <p className="flex items-center gap-1 text-muted">
              <Star size={14} className="fill-accent text-accent" aria-hidden />
              {m.voteAverage.toFixed(1)} / 10
              {m.voteCount ? ` (${m.voteCount.toLocaleString()} votes)` : ''}
            </p>
          ) : null}
          {result.inLibrary && (
            <p className="flex items-center gap-1 text-accent">
              <Check size={14} aria-hidden /> In your library
            </p>
          )}
          <CollectionMembership target={{ mediaType: result.mediaType, tmdbId: result.tmdbId }} />
          <p className="leading-relaxed" dir="auto">
            {m?.overview ?? result.overview ?? (error ? '' : 'Loading…')}
          </p>
          {m && m.creators.length > 0 && (
            <p className="text-muted">
              {result.mediaType === 'tv' ? 'Created by ' : 'Directed by '}
              {m.creators.join(', ')}
            </p>
          )}
          {m && m.cast.length > 0 && (
            <p className="text-muted">
              With{' '}
              {m.cast
                .slice(0, 6)
                .map((c) => c.name)
                .join(', ')}
            </p>
          )}
          {error && (
            <p role="alert" className="text-danger">
              {error}
            </p>
          )}
          <div className="mt-auto flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() =>
                void window.frame.metadata
                  .openTmdbPage(result.mediaType, result.tmdbId)
                  .catch(() => undefined)
              }
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 hover:bg-elevated"
            >
              <ExternalLink size={14} aria-hidden /> View on TMDB
            </button>
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 hover:bg-elevated"
            >
              <Plus size={14} aria-hidden /> Add to collection…
            </button>
            <TmdbLogo className="ml-auto h-3" />
          </div>
        </div>
      </div>
      {adding && (
        <AddToCollectionDialog
          target={{ label: resultLabel(result), title: titleInput(result) }}
          onClose={() => setAdding(false)}
        />
      )}
    </dialog>
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
  onOpen: () => void
  onAdd: () => void
  className?: string
}) {
  return (
    <li className={`group/card relative shrink-0 ${className}`}>
      <button
        type="button"
        onClick={onOpen}
        {...titleDragProps(titleInput(r))}
        aria-label={`${r.title}${r.year ? ` (${r.year})` : ''}, ${
          r.mediaType === 'tv' ? 'TV show' : 'movie'
        } on TMDB`}
        className="group flex w-full flex-col gap-1.5 text-left transition-transform group-hover/card:-translate-y-0.5"
      >
        <span className="relative block aspect-[2/3] w-full overflow-hidden rounded-md border border-border group-hover:border-subtle">
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
  const [open, setOpen] = useState<TmdbSearchResult | null>(null)
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
              onOpen={() => setOpen(r)}
              onAdd={() => setAdding(r)}
            />
          ))}
        </Carousel>
      )}
      {open && <TmdbDetailsDialog result={open} onClose={() => setOpen(null)} />}
      {adding && (
        <AddToCollectionDialog
          target={{ label: resultLabel(adding), title: titleInput(adding) }}
          onClose={() => setAdding(null)}
        />
      )}
    </section>
  )
}

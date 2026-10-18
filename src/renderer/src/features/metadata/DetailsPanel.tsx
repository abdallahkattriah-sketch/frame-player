import { useEffect, useState } from 'react'
import { Play, Star, X } from 'lucide-react'
import type { LibraryItem } from '@shared/contracts/library'
import type { ItemMetadata } from '@shared/contracts/metadata'
import { Artwork } from '@renderer/components/ui/Artwork'
import { displayTitle, episodeCode, formatBytes } from '@renderer/features/library/item-format'
import { playItems } from '@renderer/features/library/LibraryBrowser'
import { CollectionMembership } from '@renderer/features/collections/AddToCollectionDialog'
import { matchRequestFor, useMetadataActions } from './metadata-actions'

const statusText: Record<ItemMetadata['status'], string> = {
  matched: 'Identified',
  candidates: 'Needs confirmation — several possible matches',
  'no-match': 'Not found on TMDB',
  rejected: 'Marked as not on TMDB',
  error: 'Identification failed',
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <>
      <dt className="text-subtle">{label}</dt>
      <dd dir="auto">{value}</dd>
    </>
  )
}

/** Collapsible side panel with what is known about an item, locally and from TMDB. */
export function DetailsPanel({ item, onClose }: { item: LibraryItem; onClose: () => void }) {
  const [data, setData] = useState<ItemMetadata | null>(null)
  const [error, setError] = useState<string | null>(null)
  const actions = useMetadataActions()
  const match = matchRequestFor(item)

  useEffect(() => {
    if (item.fileId === null) return
    let active = true
    const load = () =>
      window.frame.metadata
        .item({ fileId: item.fileId as number })
        .then((d) => active && setData(d))
        .catch((e: unknown) => active && setError(e instanceof Error ? e.message : String(e)))
    void load()
    const unsubscribe = window.frame.library.onChanged(() => void load())
    return () => {
      active = false
      unsubscribe()
    }
  }, [item.fileId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const md = data?.metadata
  const ep = data?.episode
  const rating =
    md?.voteAverage !== null && md?.voteAverage !== undefined && md.voteCount
      ? `${md.voteAverage.toFixed(1)} / 10 (${md.voteCount.toLocaleString()} votes on TMDB)`
      : null

  return (
    <aside
      aria-label="Details"
      data-testid="details-panel"
      className="frame-panel flex w-96 shrink-0 flex-col overflow-y-auto border-l border-border bg-surface"
    >
      <div className="relative aspect-video w-full shrink-0 bg-elevated">
        <Artwork
          kind={ep?.stillPath ? 'still' : 'backdrop'}
          path={ep?.stillPath ?? md?.backdropPath ?? null}
          alt=""
          className="h-full w-full object-cover"
          fallback={null}
        />
        <button
          type="button"
          aria-label="Close details"
          onClick={onClose}
          className="absolute right-2 top-2 rounded-md bg-bg/70 p-1.5 hover:bg-bg"
        >
          <X size={16} />
        </button>
      </div>
      <div className="flex flex-col gap-4 p-5">
        <div>
          <h2 className="text-lg font-semibold leading-tight" dir="auto">
            {md?.title ?? displayTitle(item)}
          </h2>
          {ep && (
            <div className="mt-1 text-sm text-muted" dir="auto">
              {episodeCode(item)} · {ep.name}
            </div>
          )}
          <div className="mt-1 text-sm text-muted">
            {[md?.year, md?.runtimeMinutes && `${md.runtimeMinutes} min`, md?.genres.join(', ')]
              .filter(Boolean)
              .join(' · ')}
          </div>
          {item.fileId !== null && (
            <div className="mt-2">
              <CollectionMembership target={{ fileId: item.fileId }} />
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => playItems([item])}
            className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-bg hover:brightness-110"
          >
            <Play size={14} aria-hidden /> Play
          </button>
          {match && (
            <button
              type="button"
              onClick={() => actions.openMatch(match)}
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-elevated"
            >
              {data?.status === 'matched' ? 'Change match…' : 'Identify…'}
            </button>
          )}
        </div>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        {data && data.status !== 'matched' && (
          <p className="rounded-md bg-elevated px-3 py-2 text-sm text-muted">
            {statusText[data.status]}
            {data.error ? `: ${data.error}` : ''}
          </p>
        )}
        {data?.status === 'matched' && !md && (
          <p className="rounded-md bg-elevated px-3 py-2 text-sm text-muted">
            Identified, but details are not cached right now. They will be fetched again when online
            lookups are available.
          </p>
        )}

        {(ep?.overview ?? md?.overview) && (
          <p className="text-sm leading-relaxed text-text/90" dir="auto">
            {ep?.overview ?? md?.overview}
          </p>
        )}
        {rating && (
          <div className="flex items-center gap-1.5 text-sm text-muted">
            <Star size={14} className="text-accent" aria-hidden /> {rating}
          </div>
        )}

        {md && md.cast.length > 0 && (
          <section aria-label="Cast">
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-subtle">Cast</h3>
            <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
              {md.cast.slice(0, 10).map((c) => (
                <li key={`${c.name}-${c.character ?? ''}`} className="min-w-0">
                  <div className="truncate" dir="auto">
                    {c.name}
                  </div>
                  {c.character && (
                    <div className="truncate text-xs text-subtle" dir="auto">
                      {c.character}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1.5 text-sm">
          <Row
            label={md?.mediaType === 'tv' ? 'Created by' : 'Directed by'}
            value={md?.creators.join(', ')}
          />
          <Row label="Production" value={md?.production.join(', ')} />
          <Row
            label="Original title"
            value={md?.originalTitle !== md?.title ? md?.originalTitle : null}
          />
          <Row label="Language" value={md?.originalLanguage?.toUpperCase()} />
          <Row label="Air date" value={ep?.airDate} />
          <Row label="IMDb ID" value={md?.imdbId} />
          <Row label="TMDB ID" value={md ? String(md.tmdbId) : null} />
          <Row label="File" value={item.path} />
          <Row label="Size" value={item.sizeBytes !== null ? formatBytes(item.sizeBytes) : null} />
          <Row label="Resolution" value={item.resolution} />
        </dl>
        {md && (
          <p className="text-xs text-subtle">
            Details from TMDB, retrieved {new Date(md.fetchedAt).toLocaleDateString()}
            {data?.source === 'user' ? ' · match confirmed by you' : ''}.
          </p>
        )}
      </div>
    </aside>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { CircleCheck, CircleDashed, Film, Tv, X } from 'lucide-react'
import type { Collection, CollectionTitle } from '@shared/contracts/collections'
import type { TmdbSearchResult } from '@shared/contracts/metadata'
import { Artwork } from '@renderer/components/ui/Artwork'
import { TmdbDetailsDialog } from '@renderer/features/metadata/TmdbSearchResults'

/** Saved TMDB titles of a collection, reloaded whenever collections or the library change. */
export function useCollectionTitles(collectionId: number): CollectionTitle[] | null {
  const [state, setState] = useState<{ id: number; titles: CollectionTitle[] } | null>(null)
  const load = useCallback(() => {
    window.frame.collections
      .titles(collectionId)
      .then((titles) => setState({ id: collectionId, titles }))
      .catch(() => undefined)
  }, [collectionId])
  useEffect(() => {
    load()
    return window.frame.library.onChanged(load)
  }, [load])
  return state?.id === collectionId ? state.titles : null
}

function asResult(t: CollectionTitle): TmdbSearchResult {
  return { ...t, overview: null, backdropPath: null, voteAverage: null }
}

function TitleCard({
  title,
  collection,
  onOpen,
}: {
  title: CollectionTitle
  collection: Collection
  onOpen: (origin: DOMRect) => void
}) {
  const Icon = title.mediaType === 'tv' ? Tv : Film
  const label = `${title.title}${title.year ? ` (${title.year})` : ''}`
  return (
    <li className="group relative flex flex-col gap-2" data-testid="collection-title">
      <button
        type="button"
        onClick={(e) =>
          onOpen(
            (
              e.currentTarget.querySelector('[data-poster]') ?? e.currentTarget
            ).getBoundingClientRect(),
          )
        }
        aria-label={`${label}, ${title.inLibrary ? 'in your library' : 'not in your library'}`}
        className="flex flex-col gap-2 rounded-lg text-left outline-offset-4"
      >
        <span
          data-poster
          className="frame-poster relative block aspect-[2/3] w-full overflow-hidden rounded-md border border-border shadow-sm"
        >
          <Artwork
            kind="poster"
            path={title.posterPath}
            alt=""
            className="h-full w-full object-cover"
            fallback={
              <span className="flex h-full w-full items-center justify-center bg-elevated">
                <Icon size={22} className="text-subtle" aria-hidden />
              </span>
            }
          />
          {/* Not owned: a quiet corner mark; the hover overlay spells it out. */}
          {!title.inLibrary && (
            <span className="absolute left-2 top-2 rounded-full bg-bg/80 p-0.5 text-muted transition-opacity group-hover:opacity-0">
              <CircleDashed size={14} aria-hidden />
            </span>
          )}
          <span
            data-testid="ownership"
            className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-linear-to-t from-black/90 via-black/70 to-transparent px-2.5 pb-2.5 pt-8 text-xs font-medium opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
          >
            {title.inLibrary ? (
              <>
                <CircleCheck size={14} className="text-accent" aria-hidden />
                <span className="text-white">In your library</span>
              </>
            ) : (
              <>
                <CircleDashed size={14} className="text-white/70" aria-hidden />
                <span className="text-white/85">Not in your library</span>
              </>
            )}
          </span>
        </span>
        <span className="min-w-0 px-0.5">
          <span className="block truncate text-sm font-medium" dir="auto">
            {title.title}
          </span>
          <span className="block truncate text-xs text-muted">
            {[title.year, title.mediaType === 'tv' ? 'TV' : 'Movie'].filter(Boolean).join(' · ')}
          </span>
        </span>
      </button>
      <button
        type="button"
        aria-label={`Remove ${label} from ${collection.name}`}
        title={`Remove from ${collection.name}`}
        onClick={() =>
          void window.frame.collections
            .removeTitle(collection.id, title.mediaType, title.tmdbId)
            .catch(() => undefined)
        }
        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-bg/85 text-text opacity-0 shadow transition-opacity hover:bg-danger hover:text-bg focus-visible:opacity-100 group-hover:opacity-100"
      >
        <X size={14} />
      </button>
    </li>
  )
}

/** Movies and shows saved from TMDB, shown as posters with ownership on hover. */
export function CollectionTitles({
  collection,
  titles,
}: {
  collection: Collection
  titles: CollectionTitle[]
}) {
  const [open, setOpen] = useState<{ title: CollectionTitle; origin: DOMRect } | null>(null)
  if (titles.length === 0) return null
  return (
    <>
      <ul
        aria-label={`Titles in ${collection.name}`}
        className="grid grid-cols-[repeat(auto-fill,minmax(var(--frame-poster-width),1fr))] gap-5"
      >
        {titles.map((t) => (
          <TitleCard
            key={`${t.mediaType}-${t.tmdbId}`}
            title={t}
            collection={collection}
            onOpen={(origin) => setOpen({ title: t, origin })}
          />
        ))}
      </ul>
      {open && (
        <TmdbDetailsDialog
          result={asResult(open.title)}
          origin={open.origin}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  )
}

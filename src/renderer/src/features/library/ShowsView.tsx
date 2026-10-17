import { useState } from 'react'
import { ArrowLeft, Play, Tv } from 'lucide-react'
import type { LibraryShow } from '@shared/contracts/library'
import { LibraryBrowser, playItems } from './LibraryBrowser'
import { episodeCode } from './item-format'
import { useLibraryQuery, useShows } from './use-library'

function ShowCard({ show, onOpen }: { show: LibraryShow; onOpen: () => void }) {
  const seasons =
    show.seasons.length > 0
      ? `${show.seasons.length} ${show.seasons.length === 1 ? 'season' : 'seasons'}`
      : null
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open ${show.title}`}
      data-testid="show-card"
      className="group flex flex-col gap-2 text-left"
    >
      <div className="flex aspect-[2/3] w-full flex-col justify-between rounded-md border border-border bg-elevated p-3 transition-transform group-hover:-translate-y-0.5 group-hover:border-subtle">
        <Tv size={20} className="text-subtle" aria-hidden />
        <div className="line-clamp-4 text-sm font-medium text-muted" dir="auto">
          {show.title}
        </div>
      </div>
      <div className="min-w-0 px-0.5">
        <div className="truncate text-sm font-medium" dir="auto">
          {show.title}
        </div>
        <div className="truncate text-xs text-muted">
          {[
            seasons,
            `${show.episodeCount} episodes`,
            show.watchedCount > 0 && `${show.watchedCount} watched`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </div>
      </div>
    </button>
  )
}

function ShowDetail({ show, onBack }: { show: LibraryShow; onBack: () => void }) {
  const { data: episodes } = useLibraryQuery({
    view: 'episodes',
    showKey: show.key,
    sort: 'episode',
  })
  const nextUp = episodes?.find((e) => !e.progress?.completed) ?? episodes?.[0]

  return (
    <LibraryBrowser
      viewId="show-episodes"
      title={show.title}
      query={{ view: 'episodes', showKey: show.key }}
      defaults={{ mode: 'list', sort: 'episode', direction: 'asc' }}
      sortOptions={['episode', 'title', 'added']}
      // Playing an episode queues the rest of the show after it.
      queueFor={(items, index) => items.slice(index)}
      emptyState="No episodes found."
      headerExtra={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-sm hover:bg-elevated"
          >
            <ArrowLeft size={14} aria-hidden /> All shows
          </button>
          {episodes && nextUp && (
            <button
              type="button"
              onClick={() => {
                const start = episodes.indexOf(nextUp)
                playItems(episodes.slice(start))
              }}
              className="flex items-center gap-1 rounded-md bg-accent px-3 py-1 text-sm font-medium text-bg hover:brightness-110"
            >
              <Play size={14} aria-hidden />
              {nextUp.progress && !nextUp.progress.completed ? 'Resume' : 'Play'}{' '}
              {episodeCode(nextUp) ?? ''}
            </button>
          )}
        </div>
      }
    />
  )
}

export function ShowsView({ search }: { search: string }) {
  const { data: shows, error } = useShows(search)
  const [openKey, setOpenKey] = useState<string | null>(null)
  const open = shows?.find((s) => s.key === openKey)

  if (open) return <ShowDetail show={open} onBack={() => setOpenKey(null)} />

  return (
    <section className="flex h-full flex-col gap-4" aria-labelledby="shows-heading">
      <header className="flex items-center gap-3">
        <h1 id="shows-heading" className="text-2xl font-semibold tracking-tight">
          TV shows
        </h1>
        {shows && (
          <span className="text-sm text-subtle">{shows.length.toLocaleString()} shows</span>
        )}
      </header>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {shows && shows.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted">
          {search ? 'No shows match your search.' : 'No TV episodes found in your library yet.'}
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[repeat(auto-fill,minmax(150px,1fr))] content-start gap-5 overflow-y-auto pr-1">
          {(shows ?? []).map((show) => (
            <ShowCard key={show.key} show={show} onOpen={() => setOpenKey(show.key)} />
          ))}
        </div>
      )}
    </section>
  )
}

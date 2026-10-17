import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Film, Search, Tv } from 'lucide-react'
import type { MatchCandidate, MetadataMediaType } from '@shared/contracts/metadata'
import { Artwork } from '@renderer/components/ui/Artwork'
import type { MatchRequest } from './metadata-actions'

interface MatchDialogProps {
  /** Mount one dialog per request (keyed), so its state starts from the request. */
  request: MatchRequest
  onClose: () => void
}

function errorText(e: unknown) {
  return e instanceof Error
    ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
    : String(e)
}

/**
 * Lets the user pick the right TMDB entry, search manually, or reject all suggestions.
 * Candidates show only what TMDB returned; confidence is Frame's own estimate.
 */
export function MatchDialog({ request, onClose }: MatchDialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const [query, setQuery] = useState(request.query)
  const [year, setYear] = useState(request.year ? String(request.year) : '')
  const [mediaType, setMediaType] = useState<MetadataMediaType>(request.mediaType)
  const [results, setResults] = useState<MatchCandidate[] | null>(null)
  const [selected, setSelected] = useState<MatchCandidate | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
    let active = true
    window.frame.metadata
      .candidates(request.target)
      .then((r) => active && setResults(r))
      .catch((e: unknown) => active && setError(errorText(e)))
      .finally(() => active && setBusy(false))
    return () => {
      active = false
    }
  }, [request])

  const search = (e?: FormEvent) => {
    e?.preventDefault()
    if (!query.trim()) return
    const y = Number(year)
    setBusy(true)
    setError(null)
    setSelected(null)
    window.frame.metadata
      .search({
        query: query.trim(),
        mediaType,
        ...(year && Number.isInteger(y) ? { year: y } : {}),
      })
      .then(setResults)
      .catch((err: unknown) => setError(errorText(err)))
      .finally(() => setBusy(false))
  }

  const confirm = () => {
    if (!selected) return
    setBusy(true)
    window.frame.metadata
      .apply(request.target, selected.tmdbId, selected.mediaType)
      .then(onClose)
      .catch((e: unknown) => setError(errorText(e)))
      .finally(() => setBusy(false))
  }

  const rejectAll = () => {
    window.frame.metadata
      .reject(request.target)
      .then(onClose)
      .catch((e: unknown) => setError(errorText(e)))
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby="match-dialog-title"
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      className="m-auto flex max-h-[85vh] w-full max-w-3xl flex-col rounded-lg border border-border bg-surface p-0 text-text shadow-2xl backdrop:bg-black/60 [&:not([open])]:hidden"
    >
      <header className="border-b border-border px-5 py-4">
        <h2 id="match-dialog-title" className="text-base font-semibold">
          Identify
        </h2>
        <p className="mt-0.5 truncate text-sm text-muted" dir="auto">
          {request.label}
        </p>
        <form onSubmit={search} className="mt-3 flex flex-wrap gap-2">
          <div
            role="group"
            aria-label="Type"
            className="flex rounded-md border border-border text-sm"
          >
            {(['movie', 'tv'] as const).map((type) => (
              <button
                key={type}
                type="button"
                aria-pressed={mediaType === type}
                onClick={() => setMediaType(type)}
                className={`flex items-center gap-1 px-2.5 py-1.5 ${mediaType === type ? 'bg-elevated text-accent' : 'text-muted'}`}
              >
                {type === 'movie' ? <Film size={14} aria-hidden /> : <Tv size={14} aria-hidden />}
                {type === 'movie' ? 'Movie' : 'TV show'}
              </button>
            ))}
          </div>
          <input
            aria-label="Title"
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            dir="auto"
            className="min-w-48 flex-1 rounded-md border border-border bg-bg px-3 py-1.5 text-sm focus:border-accent focus:outline-none"
          />
          <input
            aria-label="Year"
            value={year}
            inputMode="numeric"
            placeholder="Year"
            onChange={(e) => setYear(e.currentTarget.value.replace(/\D/g, '').slice(0, 4))}
            className="w-20 rounded-md border border-border bg-bg px-3 py-1.5 text-sm focus:border-accent focus:outline-none"
          />
          <button
            type="submit"
            className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-elevated"
          >
            <Search size={14} aria-hidden /> Search
          </button>
        </form>
      </header>

      <div className="min-h-48 flex-1 overflow-y-auto p-3" aria-busy={busy}>
        {error && (
          <p role="alert" className="p-2 text-sm text-danger">
            {error}
          </p>
        )}
        {busy && !results && <p className="p-2 text-sm text-muted">Searching TMDB…</p>}
        {results && results.length === 0 && !error && (
          <p className="p-2 text-sm text-muted">No results. Try another title, year, or type.</p>
        )}
        <ul role="listbox" aria-label="Results" className="flex flex-col gap-1">
          {results?.map((c) => {
            const isSelected = selected?.tmdbId === c.tmdbId && selected.mediaType === c.mediaType
            return (
              <li key={`${c.mediaType}-${c.tmdbId}`}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => setSelected(c)}
                  className={`flex w-full gap-3 rounded-md border p-2 text-left ${
                    isSelected
                      ? 'border-accent bg-elevated'
                      : 'border-transparent hover:bg-elevated'
                  }`}
                >
                  <div className="h-24 w-16 shrink-0 overflow-hidden rounded bg-elevated">
                    <Artwork
                      kind="poster"
                      path={c.posterPath}
                      alt=""
                      className="h-full w-full object-cover"
                      fallback={null}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="truncate font-medium" dir="auto">
                        {c.title}
                      </span>
                      {c.year && <span className="text-sm text-muted">{c.year}</span>}
                      <span className="ml-auto shrink-0 rounded bg-bg px-1.5 py-0.5 text-[11px] text-muted">
                        {c.mediaType === 'movie' ? 'Movie' : 'TV'}
                      </span>
                    </div>
                    {c.originalTitle && (
                      <div className="truncate text-xs text-subtle" dir="auto">
                        Original title: {c.originalTitle}
                      </div>
                    )}
                    <p className="mt-1 line-clamp-2 text-xs text-muted" dir="auto">
                      {c.overview ?? 'No overview on TMDB.'}
                    </p>
                    <div className="mt-1 text-[11px] text-subtle">
                      Match confidence {Math.round(c.confidence * 100)}% (estimated by Frame)
                    </div>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      <footer className="flex items-center gap-2 border-t border-border px-5 py-3">
        <button
          type="button"
          onClick={rejectAll}
          className="rounded-md px-3 py-1.5 text-sm text-muted hover:bg-elevated hover:text-text"
        >
          None of these are right
        </button>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-elevated"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!selected || busy}
            onClick={confirm}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-bg hover:brightness-110 disabled:opacity-40"
          >
            Use this match
          </button>
        </div>
      </footer>
    </dialog>
  )
}

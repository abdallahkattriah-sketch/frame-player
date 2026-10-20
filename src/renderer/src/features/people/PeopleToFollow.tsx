import { useCallback, useEffect, useState } from 'react'
import { RotateCcw, X } from 'lucide-react'
import type { PeopleRecommendations } from '@shared/contracts/people'
import { Carousel } from '@renderer/components/ui/Carousel'
import { FollowButton, PersonPhoto } from './FollowButton'
import { departmentLabel } from './filmography'
import { usePeopleActions } from './people-actions'

/** Suggested people with the reason for each, Follow, and Not interested. */
export function PeopleToFollow() {
  const { openPerson } = usePeopleActions()
  const [data, setData] = useState<PeopleRecommendations | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(
    () =>
      void window.frame.people
        .recommendations()
        .then((r) => {
          setData(r)
          setError(null)
        })
        .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e))),
    [],
  )
  useEffect(() => {
    load()
    // Following or dismissing someone takes them out of the list.
    return window.frame.people.onChanged(load)
  }, [load])

  return (
    <section
      aria-label="People to follow"
      className="flex flex-col gap-3"
      data-testid="people-to-follow"
    >
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="text-lg font-semibold tracking-tight">People to follow</h2>
        <span className="text-xs text-subtle">
          From your library and the people you follow, then popular on TMDB
        </span>
        <button
          type="button"
          onClick={() => void window.frame.people.clearDismissed().catch(() => undefined)}
          className="ml-auto flex items-center gap-1 text-xs text-subtle hover:text-text"
          title="Show people you marked Not interested again"
        >
          <RotateCcw size={12} aria-hidden /> Reset “Not interested”
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {data === null && !error ? (
        <div className="flex gap-3 overflow-hidden" aria-label="Loading">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-44 w-48 shrink-0 animate-pulse rounded-xl bg-surface" />
          ))}
        </div>
      ) : data && data.people.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-5 text-sm text-subtle">
          No suggestions right now.
          {data.popularUnavailable
            ? ` TMDB's popular people are unavailable: ${data.popularUnavailable}`
            : ''}
        </p>
      ) : (
        data && (
          <Carousel label="People to follow" gap="gap-3">
            {data.people.map((p) => (
              <li key={p.personId} className="w-48 shrink-0">
                <div className="group relative flex h-full flex-col items-center gap-2 rounded-xl border border-border bg-surface px-3 pt-4 pb-3 text-center transition hover:-translate-y-0.5 hover:border-accent/60 hover:shadow-lg">
                  <button
                    type="button"
                    aria-label={`Not interested in ${p.name}`}
                    title="Not interested"
                    onClick={() =>
                      void window.frame.people.dismiss(p.personId).catch(() => undefined)
                    }
                    className="absolute top-1.5 right-1.5 rounded-full p-1 text-subtle opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100 hover:bg-elevated hover:text-text"
                  >
                    <X size={13} aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => openPerson(p.personId)}
                    className="flex min-w-0 flex-col items-center gap-2"
                  >
                    <PersonPhoto
                      path={p.profilePath}
                      name=""
                      className="size-20 transition group-hover:scale-105"
                    />
                    <span
                      className="max-w-full truncate font-medium group-hover:text-accent"
                      dir="auto"
                    >
                      {p.name}
                    </span>
                  </button>
                  <span className="-mt-1.5 text-[11px] text-muted">
                    {p.department ? departmentLabel(p.department) : ''}
                  </span>
                  {p.knownFor.length > 0 && (
                    <span className="line-clamp-2 text-[11px] text-subtle" dir="auto">
                      {p.knownFor.join(', ')}
                    </span>
                  )}
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] ${
                      p.source === 'local' ? 'bg-accent/15 text-accent' : 'bg-elevated text-muted'
                    }`}
                  >
                    {p.reason}
                  </span>
                  <div className="mt-auto pt-1">
                    <FollowButton
                      person={{
                        personId: p.personId,
                        name: p.name,
                        profilePath: p.profilePath,
                        department: p.department,
                      }}
                      following={false}
                    />
                  </div>
                </div>
              </li>
            ))}
          </Carousel>
        )
      )}
    </section>
  )
}

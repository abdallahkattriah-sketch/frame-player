import { useEffect, useMemo, useRef, useState } from 'react'
import { Film, RefreshCw, Tv, User, X } from 'lucide-react'
import type { PersonDetails } from '@shared/contracts/people'
import { Artwork } from '@renderer/components/ui/Artwork'
import { segmentClass, segmentedClass } from '@renderer/components/ui/Dropdown'
import { useSettings } from '@renderer/app/settings-context'
import { TmdbLogo } from '@renderer/features/settings/TmdbLogo'
import { FollowButton } from './FollowButton'
import {
  departmentLabel,
  groupFilmography,
  upcomingAndRecent,
  type FilmographyEntry,
} from './filmography'
import { usePeopleActions } from './people-actions'
import { useFollowedIds } from './use-people'

const EASE_OUT = 'cubic-bezier(0.2, 0.9, 0.25, 1)'

function errorText(e: unknown) {
  return e instanceof Error
    ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
    : String(e)
}

/** "12 Mar 2027" for a TMDB YYYY-MM-DD date, read as a calendar day (no time zone shift). */
export function formatDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  if (!y || !m || !d) return date
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { dateStyle: 'medium' })
}

/** Profile of an actor, director, or other person, with their filmography from TMDB. */
export function PersonDialog({ personId, onClose }: { personId: number; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const { settings } = useSettings()
  const motion = settings?.appearance.animations ?? 'full'
  const followed = useFollowedIds()
  const [person, setPerson] = useState<PersonDetails | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog || dialog.open) return
    dialog.showModal()
    if (motion === 'off') return
    dialog.animate(
      [
        { opacity: 0, transform: 'translateY(12px) scale(0.97)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: motion === 'reduced' ? 160 : 420, easing: EASE_OUT },
    )
    // Animated once when opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let active = true
    window.frame.people
      .details(personId)
      .then((p) => {
        if (!active) return
        setPerson(p)
        setError(null)
      })
      .catch((e: unknown) => active && setError(errorText(e)))
    return () => {
      active = false
    }
  }, [personId, attempt])

  return (
    <dialog
      ref={ref}
      aria-label={person?.name ?? 'Person'}
      data-anim="custom"
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target !== e.currentTarget) return
        const r = e.currentTarget.getBoundingClientRect()
        const inside =
          e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
        if (!inside) onClose()
      }}
      className="m-auto w-[min(960px,94vw)] overflow-hidden rounded-2xl border border-border bg-surface p-0 text-sm text-text shadow-2xl backdrop:bg-black/70"
      data-testid="person-details"
    >
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-2 text-xs text-muted">
        <User size={14} aria-hidden />
        <span className="min-w-0 flex-1 truncate">
          {person?.department ? departmentLabel(person.department) : 'Person'}
        </span>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="rounded-full p-1.5 text-muted transition hover:rotate-90 hover:bg-elevated hover:text-text"
        >
          <X size={17} />
        </button>
      </div>
      <div className="max-h-[calc(90vh-2.75rem)] overflow-y-auto px-7 py-6">
        {person ? (
          <PersonBody person={person} following={followed.has(person.personId)} />
        ) : error ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <p role="alert" className="max-w-md text-danger">
              {error}
            </p>
            <button
              type="button"
              onClick={() => setAttempt((n) => n + 1)}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 transition hover:bg-elevated"
            >
              <RefreshCw size={14} aria-hidden /> Try again
            </button>
          </div>
        ) : (
          <PersonSkeleton />
        )}
      </div>
    </dialog>
  )
}

function PersonSkeleton() {
  return (
    <div className="flex animate-pulse gap-6" aria-label="Loading" role="status">
      <div className="aspect-[2/3] w-36 shrink-0 rounded-lg bg-elevated" />
      <div className="flex flex-1 flex-col gap-3 pt-2">
        <div className="h-7 w-1/2 rounded bg-elevated" />
        <div className="h-4 w-1/3 rounded bg-elevated" />
        <div className="h-4 w-full rounded bg-elevated" />
        <div className="h-4 w-5/6 rounded bg-elevated" />
      </div>
    </div>
  )
}

function PersonBody({ person, following }: { person: PersonDetails; following: boolean }) {
  const [bioOpen, setBioOpen] = useState(false)
  const groups = useMemo(() => groupFilmography(person.credits), [person.credits])
  const { upcoming, recent } = useMemo(() => upcomingAndRecent(person.credits), [person.credits])
  const [tab, setTab] = useState<string | null>(null)
  const active = groups.find((g) => g.department === tab) ?? groups[0]
  const facts = [
    person.birthday && `Born ${formatDay(person.birthday)}`,
    person.placeOfBirth,
    person.deathday && `Died ${formatDay(person.deathday)}`,
  ].filter(Boolean)

  return (
    <div className="frame-stagger flex flex-col gap-6">
      <div className="flex gap-6">
        <div className="aspect-[2/3] w-36 shrink-0 overflow-hidden rounded-lg border border-border shadow-xl">
          <Artwork
            kind="profile"
            path={person.profilePath}
            alt=""
            className="h-full w-full object-cover"
            fallback={
              <div className="flex h-full w-full items-center justify-center bg-elevated">
                <User size={28} className="text-subtle" aria-hidden />
              </div>
            }
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <h2 className="text-2xl font-bold tracking-tight" dir="auto">
            {person.name}
          </h2>
          {facts.length > 0 && <p className="text-muted">{facts.join(' · ')}</p>}
          {person.biography ? (
            <div>
              <p
                className={`max-w-prose leading-relaxed whitespace-pre-line ${bioOpen ? '' : 'line-clamp-4'}`}
                dir="auto"
              >
                {person.biography}
              </p>
              {person.biography.length > 320 && (
                <button
                  type="button"
                  onClick={() => setBioOpen((o) => !o)}
                  className="mt-1 text-xs text-accent hover:underline"
                >
                  {bioOpen ? 'Show less' : 'Read more'}
                </button>
              )}
            </div>
          ) : (
            <p className="text-subtle">TMDB has no biography for this person.</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <FollowButton
              person={{
                personId: person.personId,
                name: person.name,
                profilePath: person.profilePath,
                department: person.department,
              }}
              following={following}
            />
            <TmdbLogo className="ml-auto h-3" />
          </div>
        </div>
      </div>

      {upcoming.length > 0 && <CreditRow title="Upcoming" entries={upcoming} dated />}
      {recent.length > 0 && <CreditRow title="Recently released" entries={recent} dated />}

      <section className="flex flex-col gap-3" aria-label="Filmography">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-base font-semibold">Filmography</h3>
          {groups.length > 1 && (
            <div className={segmentedClass} role="tablist">
              {groups.map((g) => (
                <button
                  key={g.department}
                  type="button"
                  role="tab"
                  aria-selected={g === active}
                  onClick={() => setTab(g.department)}
                  className={segmentClass(g === active)}
                >
                  {g.label}
                  <span className="ml-1.5 text-xs text-subtle">{g.entries.length}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {active ? (
          <CreditGrid entries={active.entries} />
        ) : (
          <p className="text-subtle">TMDB lists no movies or shows for this person.</p>
        )}
      </section>
    </div>
  )
}

function CreditRow({
  title,
  entries,
  dated,
}: {
  title: string
  entries: FilmographyEntry[]
  dated?: boolean
}) {
  return (
    <section className="flex flex-col gap-2" aria-label={title}>
      <h3 className="text-base font-semibold">{title}</h3>
      <ul className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
        {entries.map((e) => (
          <li key={`${e.mediaType}:${e.tmdbId}`} className="w-32 shrink-0">
            <CreditTile entry={e} dated={dated} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function CreditGrid({ entries }: { entries: FilmographyEntry[] }) {
  // Long careers: show a page at a time instead of hundreds of posters at once.
  const [shown, setShown] = useState(30)
  return (
    <>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-3">
        {entries.slice(0, shown).map((e) => (
          <li key={`${e.mediaType}:${e.tmdbId}`}>
            <CreditTile entry={e} />
          </li>
        ))}
      </ul>
      {entries.length > shown && (
        <button
          type="button"
          onClick={() => setShown((n) => n + 60)}
          className="self-center rounded-md border border-border px-3 py-1.5 transition hover:bg-elevated"
        >
          Show more ({entries.length - shown})
        </button>
      )}
    </>
  )
}

function CreditTile({ entry, dated }: { entry: FilmographyEntry; dated?: boolean }) {
  const { openTitle } = usePeopleActions()
  const Icon = entry.mediaType === 'tv' ? Tv : Film
  const when = entry.releaseDate
    ? dated
      ? formatDay(entry.releaseDate)
      : String(entry.year)
    : 'No date yet'
  return (
    <button
      type="button"
      onClick={() =>
        openTitle({
          tmdbId: entry.tmdbId,
          mediaType: entry.mediaType,
          title: entry.title,
          year: entry.year,
          overview: null,
          posterPath: entry.posterPath,
          backdropPath: null,
          voteAverage: null,
          inLibrary: false,
        })
      }
      className="group flex w-full flex-col gap-1.5 text-left"
    >
      <span className="block aspect-[2/3] w-full overflow-hidden rounded-md border border-border bg-elevated transition group-hover:-translate-y-0.5 group-hover:border-accent group-hover:shadow-lg">
        <Artwork
          kind="poster"
          path={entry.posterPath}
          alt=""
          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          fallback={
            <span className="flex h-full w-full items-center justify-center">
              <Icon size={20} className="text-subtle" aria-hidden />
            </span>
          }
        />
      </span>
      <span className="line-clamp-2 text-xs font-medium group-hover:text-accent" dir="auto">
        {entry.title}
      </span>
      <span className="truncate text-[11px] text-muted">
        {when}
        {entry.mediaType === 'tv' ? ' · TV' : ''}
        {entry.roles.length > 0 ? ` · ${entry.roles.join(', ')}` : ''}
      </span>
    </button>
  )
}

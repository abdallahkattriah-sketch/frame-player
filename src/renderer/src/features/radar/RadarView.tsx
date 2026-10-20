import { useCallback, useEffect, useMemo, useState } from 'react'
import { Clapperboard, Film, MonitorPlay, Radar, RefreshCw, TriangleAlert } from 'lucide-react'
import {
  radarSections,
  type RadarEntry,
  type RadarFilter,
  type RadarResult,
} from '@shared/contracts/radar'
import { Artwork } from '@renderer/components/ui/Artwork'
import { Carousel } from '@renderer/components/ui/Carousel'
import { Dropdown } from '@renderer/components/ui/Dropdown'
import { DiscoverHint, DiscoverRows, useBrowseState } from '@renderer/features/discover/Discover'
import { formatDay } from '@renderer/features/people/filmography'
import { usePeopleActions } from '@renderer/features/people/people-actions'
import { useFollowedPeople } from '@renderer/features/people/use-people'
import { PeopleToFollow } from '@renderer/features/people/PeopleToFollow'

function errorText(e: unknown) {
  return e instanceof Error
    ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
    : String(e)
}

const RANGES = [
  { value: '30', label: 'Next / last 30 days' },
  { value: '90', label: 'Next / last 90 days' },
  { value: '365', label: 'Next / last year' },
]
type Kind = 'all' | 'theatrical' | 'digital'

function useRadar() {
  const [result, setResult] = useState<RadarResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const run = useCallback(
    (refresh: boolean) =>
      window.frame.radar
        .get(refresh)
        .then((r) => {
          setResult(r)
          setError(null)
        })
        .catch((e: unknown) => setError(errorText(e)))
        .finally(() => setLoading(false)),
    [],
  )
  const load = useCallback(
    (refresh: boolean) => {
      setLoading(true)
      void run(refresh)
    },
    [run],
  )
  useEffect(() => {
    void run(false)
    // Following or unfollowing someone changes what Radar tracks.
    return window.frame.people.onChanged(() => load(false))
  }, [run, load])
  return { result, loading, error, refresh: () => load(true) }
}

/** Releases from people the user follows, and what is popular, in one place. */
export function RadarView({ onOpenSettings }: { onOpenSettings: () => void }) {
  const browse = useBrowseState()
  const { result, loading, error, refresh } = useRadar()
  const { people: followed } = useFollowedPeople('')
  const [range, setRange] = useState('30')
  const [kind, setKind] = useState<Kind>('all')
  const [person, setPerson] = useState('')
  const filter: RadarFilter = {
    aheadDays: Number(range),
    recentDays: Number(range),
    personId: person ? Number(person) : null,
  }
  const sections = useMemo(
    () => radarSections(result?.movies ?? [], new Date(), filter),
    // The filter is rebuilt each render from these values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [result, range, person],
  )
  const followsNobody = result?.followedCount === 0
  const days = Number(range)
  const windowText = days >= 365 ? 'the next year' : `the next ${days} days`
  const recentText = days >= 365 ? 'the last year' : `the last ${days} days`

  return (
    <div className="flex flex-col gap-8 pb-8" data-testid="radar">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Radar size={22} className="text-accent" aria-hidden /> Radar
        </h1>
        {result?.updatedAt && (
          <span className="text-sm text-subtle" data-testid="radar-updated">
            Updated{' '}
            {new Date(result.updatedAt).toLocaleString(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          </span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2 text-sm">
          {!followsNobody && (
            <>
              <Dropdown
                label="Release type"
                groups={[
                  {
                    value: kind,
                    options: [
                      { value: 'all', label: 'All releases' },
                      { value: 'theatrical', label: 'Theatrical' },
                      { value: 'digital', label: 'Digital' },
                    ],
                    onChange: (v) => setKind(v as Kind),
                  },
                ]}
              />
              {followed && followed.length > 1 && (
                <Dropdown
                  label="Person"
                  groups={[
                    {
                      value: person,
                      options: [
                        { value: '', label: 'Everyone you follow' },
                        ...followed.map((p) => ({ value: String(p.personId), label: p.name })),
                      ],
                      onChange: setPerson,
                    },
                  ]}
                />
              )}
              <Dropdown
                label="Time range"
                groups={[{ value: range, options: RANGES, onChange: setRange }]}
              />
            </>
          )}
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            aria-label="Refresh Radar"
            title="Ask TMDB again"
            className="flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-muted transition hover:text-text disabled:opacity-60"
          >
            <RefreshCw size={14} aria-hidden className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </header>

      {browse === 'needs-token' && <DiscoverHint onOpenSettings={onOpenSettings} />}

      {(error || result?.error) && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-muted"
        >
          <TriangleAlert size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden />
          <span>
            {error ?? result?.error}
            {result?.stale && result.updatedAt && ' Showing the last saved results.'}
            {result &&
              result.failedPeople > 0 &&
              !result.stale &&
              ` ${result.failedPeople} of ${result.followedCount} people could not be loaded.`}
          </span>
        </p>
      )}

      {followsNobody ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-10 text-center text-muted">
          <Radar size={36} className="text-subtle" aria-hidden />
          <p className="text-base text-text">Follow actors and directors to fill your Radar.</p>
          <p className="max-w-md">
            Open any movie below and use the round button next to someone in its cast &amp; crew.
            Their upcoming and new releases will appear here.
          </p>
        </div>
      ) : (
        <>
          {kind !== 'digital' && (
            <RadarRow
              title="Coming soon"
              subtitle={`In cinemas within ${windowText} · Egypt dates when TMDB has them`}
              icon={<Clapperboard size={16} aria-hidden />}
              entries={sections.comingSoon}
              loading={loading && !result}
              empty={`No theatrical releases from people you follow in ${windowText}.`}
            />
          )}
          {kind !== 'digital' && (
            <RadarRow
              title="Newly released"
              subtitle={`In cinemas in ${recentText}`}
              icon={<Film size={16} aria-hidden />}
              entries={sections.newlyReleased}
              loading={loading && !result}
              empty={`Nothing from people you follow came out in cinemas in ${recentText}.`}
            />
          )}
          {kind !== 'theatrical' && (
            <RadarRow
              title="Digital release"
              subtitle="Only titles with a digital date on TMDB · not a specific streaming service"
              icon={<MonitorPlay size={16} aria-hidden />}
              entries={sections.digital}
              digital
              loading={loading && !result}
              empty={`TMDB lists no digital releases for people you follow in ${recentText} or ${windowText}.`}
            />
          )}
        </>
      )}

      {browse === 'ready' && (
        <DiscoverRows
          rows={[
            {
              list: 'trending-movies',
              title: 'Popular now',
              subtitle: 'Trending on TMDB this week · not based on who you follow',
            },
          ]}
        />
      )}

      <PeopleToFollow />
    </div>
  )
}

function RadarRow({
  title,
  subtitle,
  icon,
  entries,
  digital,
  loading,
  empty,
}: {
  title: string
  subtitle: string
  icon: React.ReactNode
  entries: RadarEntry[]
  digital?: boolean
  loading: boolean
  empty: string
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-3" data-testid="radar-row">
      <div className="flex items-baseline gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <span className="text-accent">{icon}</span>
          {title}
        </h2>
        <span className="text-xs text-subtle">{subtitle}</span>
      </div>
      {loading ? (
        <div className="flex gap-4 overflow-hidden" aria-label="Loading">
          {Array.from({ length: 7 }, (_, i) => (
            <div
              key={i}
              className="aspect-[2/3] w-[140px] shrink-0 animate-pulse rounded-md bg-surface"
            />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-5 text-sm text-subtle">
          {empty}
        </p>
      ) : (
        <Carousel label={title}>
          {entries.map((e) => (
            <RadarCard key={e.movie.tmdbId} entry={e} digital={digital} />
          ))}
        </Carousel>
      )}
    </section>
  )
}

/** "Tomorrow", "In 12 days", "Today", "3 days ago". */
export function relativeDays(days: number): string {
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days === -1) return 'Yesterday'
  return days > 0 ? `In ${days} days` : `${-days} days ago`
}

function RadarCard({ entry, digital }: { entry: RadarEntry; digital?: boolean }) {
  const { openTitle } = usePeopleActions()
  const { movie, date, status, days } = entry
  const names = movie.people.map((p) => p.name)
  const chip =
    status === 'unconfirmed'
      ? 'Date not confirmed'
      : days === null
        ? null
        : digital
          ? days > 0
            ? `Digital ${relativeDays(days).toLowerCase()}`
            : 'Out on digital'
          : relativeDays(days)
  const allDates = movie.releases
    .map((r) => `${r.country === 'EG' ? 'Egypt' : r.country} ${r.kind}: ${formatDay(r.date)}`)
    .join('\n')
  return (
    <li className="w-[140px] shrink-0">
      <button
        type="button"
        onClick={() =>
          openTitle({
            tmdbId: movie.tmdbId,
            mediaType: 'movie',
            title: movie.title,
            year: movie.primaryDate ? Number(movie.primaryDate.slice(0, 4)) : null,
            overview: null,
            posterPath: movie.posterPath,
            backdropPath: null,
            voteAverage: null,
            inLibrary: false,
          })
        }
        aria-label={`${movie.title}, with ${names.join(', ')}`}
        className="group flex w-full flex-col gap-1.5 text-left"
      >
        <span className="relative block aspect-[2/3] w-full overflow-hidden rounded-md border border-border bg-elevated transition group-hover:-translate-y-1 group-hover:border-accent group-hover:shadow-xl">
          <Artwork
            kind="poster"
            path={movie.posterPath}
            alt=""
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            fallback={
              <span className="flex h-full w-full items-center justify-center">
                <Film size={22} className="text-subtle" aria-hidden />
              </span>
            }
          />
          {chip && (
            <span
              className={`absolute top-1.5 left-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold backdrop-blur ${
                status === 'upcoming'
                  ? 'bg-accent/90 text-bg'
                  : status === 'released'
                    ? 'bg-black/65 text-white'
                    : 'bg-black/65 text-white/80'
              }`}
            >
              {chip}
            </span>
          )}
        </span>
        <span className="line-clamp-2 text-sm font-medium group-hover:text-accent" dir="auto">
          {movie.title}
        </span>
        <span className="text-xs text-muted" title={allDates || undefined} data-testid="radar-date">
          {movie.releasesUnavailable ? (
            'Release dates unavailable'
          ) : !date ? (
            'No release date yet'
          ) : date.egypt ? (
            <>
              <span className="text-text">{formatDay(date.date)}</span> · Egypt
            </>
          ) : (
            <>
              No Egypt date · {date.country} {formatDay(date.date)}
            </>
          )}
        </span>
        <span className="truncate text-[11px] text-subtle" title={names.join(', ')}>
          With {names[0]}
          {names.length > 1 ? ` +${names.length - 1}` : ''}
        </span>
      </button>
    </li>
  )
}

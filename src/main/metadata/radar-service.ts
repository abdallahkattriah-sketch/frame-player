import type { FollowedPerson, PersonDetails } from '@shared/contracts/people'
import {
  RADAR_COUNTRY,
  RADAR_FALLBACK_COUNTRY,
  TMDB_RELEASE_TYPES,
  localDay,
  pickDate,
  type CountryRelease,
  type RadarMovie,
  type RadarResult,
} from '@shared/contracts/radar'
import type { TmdbReleaseDates } from './tmdb/tmdb-schemas'

const DAY_MS = 86_400_000
/** A result this recent is shown without asking TMDB again (unless refreshed by hand). */
const RESULT_FRESH_MS = DAY_MS / 4
const PERSON_MAX_AGE_MS = DAY_MS
const RELEASES_MAX_AGE_MS = DAY_MS
/** Titles whose primary date is in this window are checked for country release dates. */
const PAST_WINDOW_DAYS = 240
const FUTURE_WINDOW_DAYS = 730
/** At most this many titles are checked per refresh, nearest dates first. */
const MAX_CANDIDATES = 150
const CONCURRENCY = 4
const RESULT_KEY = 'radar:v1'

interface CacheStore {
  getCached: (key: string, notBefore: string) => unknown
  putCached: (key: string, body: unknown, now: string) => void
}

export interface RadarServiceOptions {
  personDetails: (personId: number, maxAgeMs: number) => Promise<PersonDetails>
  releaseDates: (movieId: number) => Promise<TmdbReleaseDates>
  listFollowed: () => FollowedPerson[]
  cache: CacheStore
  /** Online lookups allowed and a TMDB token saved; a reason when not. */
  offlineReason: () => string | null
  now?: () => Date
  warn?: (message: string) => void
}

interface StoredResult extends RadarResult {
  /** Which follows the result was computed for. */
  followKey: string
}

async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>) {
  const results: R[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await fn(items[index] as T)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Egyptian and fallback-country theatrical and digital dates from a TMDB response. */
export function countryReleases(body: TmdbReleaseDates): CountryRelease[] {
  const out: CountryRelease[] = []
  for (const country of body.results) {
    if (country.iso_3166_1 !== RADAR_COUNTRY && country.iso_3166_1 !== RADAR_FALLBACK_COUNTRY)
      continue
    for (const r of country.release_dates) {
      const kind = TMDB_RELEASE_TYPES[r.type]
      const date = r.release_date.slice(0, 10)
      if (kind && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
        out.push({ country: country.iso_3166_1, kind, date })
      }
    }
  }
  return out
}

/**
 * Release tracking for followed people: their movies near today, with theatrical and digital
 * dates for Egypt (or the fallback country, labeled). Runs only when asked (opening Radar,
 * refreshing, or at startup); nothing runs while Frame is closed.
 */
export class RadarService {
  private inflight: Promise<RadarResult> | null = null

  constructor(private readonly options: RadarServiceOptions) {}

  /** The current result: saved if recent and for the same follows, otherwise refreshed. */
  get(refresh = false): Promise<RadarResult> {
    const followed = this.options.listFollowed()
    const followKey = followed
      .map((p) => p.personId)
      .sort((a, b) => a - b)
      .join(',')
    if (followed.length === 0) {
      return Promise.resolve({
        movies: [],
        updatedAt: null,
        followedCount: 0,
        failedPeople: 0,
        stale: false,
        error: null,
      })
    }
    const saved = this.saved()
    const now = this.now()
    if (
      !refresh &&
      saved &&
      saved.followKey === followKey &&
      saved.updatedAt &&
      now.getTime() - Date.parse(saved.updatedAt) < RESULT_FRESH_MS
    ) {
      return Promise.resolve(this.publicResult(saved, false, null))
    }
    const offline = this.options.offlineReason()
    if (offline) return Promise.resolve(this.fallback(saved, followed.length, offline))
    // Concurrent callers share one refresh.
    this.inflight ??= this.compute(followed, followKey, saved).finally(() => {
      this.inflight = null
    })
    return this.inflight
  }

  private async compute(
    followed: FollowedPerson[],
    followKey: string,
    saved: StoredResult | null,
  ): Promise<RadarResult> {
    const now = this.now()
    const today = localDay(now)
    const from = localDay(new Date(now.getTime() - PAST_WINDOW_DAYS * DAY_MS))
    const to = localDay(new Date(now.getTime() + FUTURE_WINDOW_DAYS * DAY_MS))

    let failedPeople = 0
    let lastError: string | null = null
    const details = await mapLimit(followed, CONCURRENCY, async (person) => {
      try {
        return await this.options.personDetails(person.personId, PERSON_MAX_AGE_MS)
      } catch (error) {
        failedPeople++
        lastError = message(error)
        this.options.warn?.(`radar: person ${person.personId}: ${lastError}`)
        return null
      }
    })
    if (failedPeople === followed.length) {
      return this.fallback(saved, followed.length, lastError ?? 'TMDB could not be reached.')
    }

    // One entry per movie, with every followed person on it.
    const byMovie = new Map<number, RadarMovie>()
    for (const person of details) {
      if (!person) continue
      for (const c of person.credits) {
        if (c.mediaType !== 'movie' || !c.releaseDate) continue
        if (c.releaseDate < from || c.releaseDate > to) continue
        let movie = byMovie.get(c.tmdbId)
        if (!movie) {
          movie = {
            tmdbId: c.tmdbId,
            title: c.title,
            posterPath: c.posterPath,
            primaryDate: c.releaseDate,
            people: [],
            theatrical: null,
            digital: null,
            releases: [],
            releasesUnavailable: false,
          }
          byMovie.set(c.tmdbId, movie)
        }
        const match = movie.people.find((p) => p.personId === person.personId)
        if (!match)
          movie.people.push({ personId: person.personId, name: person.name, role: c.role })
        else if (c.role && match.role !== c.role && !match.role?.includes(c.role)) {
          match.role = match.role ? `${match.role}, ${c.role}` : c.role
        }
      }
    }

    const distance = (m: RadarMovie) =>
      Math.abs(Date.parse(m.primaryDate as string) - Date.parse(today))
    const candidates = [...byMovie.values()].sort((a, b) => distance(a) - distance(b))
    const movies = candidates.slice(0, MAX_CANDIDATES)
    await mapLimit(movies, CONCURRENCY, async (movie) => {
      try {
        movie.releases = await this.releasesOf(movie.tmdbId)
        movie.theatrical = pickDate(movie.releases, 'theatrical')
        movie.digital = pickDate(movie.releases, 'digital')
      } catch (error) {
        movie.releasesUnavailable = true
        this.options.warn?.(`radar: release dates of movie ${movie.tmdbId}: ${message(error)}`)
      }
    })

    const result: StoredResult = {
      movies,
      updatedAt: now.toISOString(),
      followedCount: followed.length,
      failedPeople,
      stale: false,
      error: failedPeople > 0 ? lastError : null,
      followKey,
    }
    this.options.cache.putCached(RESULT_KEY, result, now.toISOString())
    return this.publicResult(result, false, result.error)
  }

  private async releasesOf(movieId: number): Promise<CountryRelease[]> {
    const key = `release-dates:${movieId}`
    const notBefore = new Date(this.now().getTime() - RELEASES_MAX_AGE_MS).toISOString()
    const cached = this.options.cache.getCached(key, notBefore)
    if (Array.isArray(cached)) return cached as CountryRelease[]
    const releases = countryReleases(await this.options.releaseDates(movieId))
    this.options.cache.putCached(key, releases, this.now().toISOString())
    return releases
  }

  /** The last saved result marked stale, or an empty one, with the reason. */
  private fallback(saved: StoredResult | null, followedCount: number, error: string): RadarResult {
    if (saved) return { ...this.publicResult(saved, true, error), followedCount }
    return { movies: [], updatedAt: null, followedCount, failedPeople: 0, stale: true, error }
  }

  private publicResult(saved: StoredResult, stale: boolean, error: string | null): RadarResult {
    const { followKey: _followKey, ...result } = saved
    return { ...result, stale, error }
  }

  private saved(): StoredResult | null {
    const body = this.options.cache.getCached(RESULT_KEY, '1970-01-01T00:00:00.000Z')
    return body && typeof body === 'object' && Array.isArray((body as StoredResult).movies)
      ? (body as StoredResult)
      : null
  }

  private now() {
    return this.options.now?.() ?? new Date()
  }
}

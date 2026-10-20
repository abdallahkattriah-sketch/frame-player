import { z } from 'zod'

/** Egypt: the territory Radar reports release dates for. */
export const RADAR_COUNTRY = 'EG'
/** Used, and labeled as such, when TMDB has no Egyptian date. */
export const RADAR_FALLBACK_COUNTRY = 'US'

export type ReleaseKind = 'theatrical' | 'digital'

/** TMDB release types: 2 limited and 3 wide theatrical, 4 digital. */
export const TMDB_RELEASE_TYPES: Record<number, ReleaseKind> = {
  2: 'theatrical',
  3: 'theatrical',
  4: 'digital',
}

/** One dated release of a title in one country, as TMDB lists it. */
export interface CountryRelease {
  /** ISO 3166-1 code, e.g. "EG". */
  country: string
  kind: ReleaseKind
  /** YYYY-MM-DD. */
  date: string
}

/** The date Radar shows for one kind of release, and where it comes from. */
export interface RadarDate {
  date: string
  country: string
  /** True only for a date TMDB lists for Egypt. */
  egypt: boolean
}

export interface RadarPersonMatch {
  personId: number
  name: string
  /** Character or job on this title. */
  role: string | null
}

export interface RadarMovie {
  tmdbId: number
  title: string
  posterPath: string | null
  /** TMDB primary release date (any country). */
  primaryDate: string | null
  /** Every followed person on this title. */
  people: RadarPersonMatch[]
  theatrical: RadarDate | null
  digital: RadarDate | null
  /** Egyptian and fallback-country dates, for showing all of them on request. */
  releases: CountryRelease[]
  /** TMDB release dates could not be loaded for this title. */
  releasesUnavailable: boolean
}

export interface RadarResult {
  movies: RadarMovie[]
  /** When this result was computed. */
  updatedAt: string | null
  followedCount: number
  /** Followed people whose filmography could not be loaded this time. */
  failedPeople: number
  /** The last saved result is shown because refreshing failed (e.g. offline). */
  stale: boolean
  error: string | null
}

/**
 * Picks the date to show for a kind of release: Egypt's earliest date, otherwise the fallback
 * country's (labeled with that country). Another country's date is never presented as Egyptian.
 */
export function pickDate(releases: readonly CountryRelease[], kind: ReleaseKind): RadarDate | null {
  for (const country of [RADAR_COUNTRY, RADAR_FALLBACK_COUNTRY]) {
    const dates = releases
      .filter((r) => r.kind === kind && r.country === country)
      .map((r) => r.date)
      .sort()
    if (dates[0]) return { date: dates[0], country, egypt: country === RADAR_COUNTRY }
  }
  return null
}

export type RadarStatus = 'upcoming' | 'released' | 'unconfirmed'

export interface RadarEntry {
  movie: RadarMovie
  /** The date this section is about; null when TMDB has none for it. */
  date: RadarDate | null
  status: RadarStatus
  /** Days from today to `date` (negative: in the past). */
  days: number | null
}

export interface RadarSections {
  comingSoon: RadarEntry[]
  newlyReleased: RadarEntry[]
  digital: RadarEntry[]
}

export interface RadarFilter {
  /** Coming Soon and upcoming digital releases within this many days. */
  aheadDays: number
  /** Newly Released and recent digital releases within this many days. */
  recentDays: number
  /** Only titles with this followed person. */
  personId?: number | null
}

export const RADAR_DEFAULT_FILTER: RadarFilter = { aheadDays: 30, recentDays: 30 }

/** YYYY-MM-DD in local time. */
export function localDay(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

/**
 * Splits Radar titles into its sections. Each title appears at most once per section.
 * - Coming Soon: a theatrical date ahead; titles with no theatrical date anywhere but a future
 *   TMDB primary date are listed as unconfirmed, without a date.
 * - Newly Released: a theatrical date within the last `recentDays`.
 * - Digital: only titles with a TMDB digital release date (never derived from theatrical).
 */
export function radarSections(
  movies: readonly RadarMovie[],
  now: Date,
  filter: RadarFilter = RADAR_DEFAULT_FILTER,
): RadarSections {
  const today = localDay(now)
  const sections: RadarSections = { comingSoon: [], newlyReleased: [], digital: [] }
  const seen = new Set<number>()
  for (const movie of movies) {
    if (seen.has(movie.tmdbId)) continue
    seen.add(movie.tmdbId)
    if (filter.personId && !movie.people.some((p) => p.personId === filter.personId)) continue

    const t = movie.theatrical
    const tDays = t ? daysBetween(today, t.date) : null
    if (t && tDays !== null) {
      if (tDays > 0 && tDays <= filter.aheadDays) {
        sections.comingSoon.push({ movie, date: t, status: 'upcoming', days: tDays })
      } else if (tDays <= 0 && -tDays <= filter.recentDays) {
        sections.newlyReleased.push({ movie, date: t, status: 'released', days: tDays })
      }
    } else if (movie.primaryDate && movie.primaryDate > today) {
      const ahead = daysBetween(today, movie.primaryDate)
      if (ahead <= filter.aheadDays) {
        sections.comingSoon.push({ movie, date: null, status: 'unconfirmed', days: null })
      }
    }

    const d = movie.digital
    if (d) {
      const dDays = daysBetween(today, d.date)
      if (dDays > 0 ? dDays <= filter.aheadDays : -dDays <= filter.recentDays) {
        sections.digital.push({
          movie,
          date: d,
          status: dDays > 0 ? 'upcoming' : 'released',
          days: dDays,
        })
      }
    }
  }
  const soonest = (a: RadarEntry, b: RadarEntry) =>
    (a.days ?? Number.MAX_SAFE_INTEGER) - (b.days ?? Number.MAX_SAFE_INTEGER)
  sections.comingSoon.sort(soonest)
  sections.newlyReleased.sort((a, b) => (b.days ?? 0) - (a.days ?? 0))
  // Upcoming digital releases first (soonest), then the most recent ones.
  sections.digital.sort((a, b) => {
    const au = (a.days ?? 0) > 0
    const bu = (b.days ?? 0) > 0
    if (au !== bu) return au ? -1 : 1
    return au ? soonest(a, b) : (b.days ?? 0) - (a.days ?? 0)
  })
  return sections
}

export const radarRefreshSchema = z.boolean()

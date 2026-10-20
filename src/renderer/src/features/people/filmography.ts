import type { PersonCredit } from '@shared/contracts/people'

/** A title in a filmography group; several jobs on one title are merged. */
export interface FilmographyEntry extends Omit<PersonCredit, 'role'> {
  roles: string[]
}

export interface FilmographyGroup {
  /** "cast" or a TMDB crew department. */
  department: string
  label: string
  entries: FilmographyEntry[]
}

const ORDER = ['cast', 'Directing', 'Writing', 'Production', 'Creator']

export function departmentLabel(department: string): string {
  return department === 'cast' ? 'Acting' : department
}

/** YYYY-MM-DD of `now` in local time. */
export function today(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** Newest first; titles without a date (announced, in development) come first. */
function byDateDesc(a: { releaseDate: string | null }, b: { releaseDate: string | null }) {
  if (!a.releaseDate || !b.releaseDate) return a.releaseDate ? 1 : b.releaseDate ? -1 : 0
  return b.releaseDate.localeCompare(a.releaseDate)
}

function merge(credits: readonly PersonCredit[]): FilmographyEntry[] {
  const byTitle = new Map<string, FilmographyEntry>()
  for (const { role, ...credit } of credits) {
    const key = `${credit.mediaType}:${credit.tmdbId}`
    const entry = byTitle.get(key)
    if (!entry) byTitle.set(key, { ...credit, roles: role ? [role] : [] })
    else if (role && !entry.roles.includes(role)) entry.roles.push(role)
  }
  return [...byTitle.values()]
}

/** Credits grouped by department (acting first), each title once per group. */
export function groupFilmography(credits: readonly PersonCredit[]): FilmographyGroup[] {
  const departments = new Map<string, PersonCredit[]>()
  for (const c of credits)
    departments.set(c.department, [...(departments.get(c.department) ?? []), c])
  const rank = (d: string) => (ORDER.includes(d) ? ORDER.indexOf(d) : ORDER.length)
  return [...departments.entries()]
    .sort(([a, ca], [b, cb]) => rank(a) - rank(b) || cb.length - ca.length)
    .map(([department, list]) => ({
      department,
      label: departmentLabel(department),
      entries: merge(list).sort(byDateDesc),
    }))
}

/**
 * Upcoming titles (dated after today, soonest first) and recent ones (released within
 * `recentDays`, newest first). Dates are TMDB's primary dates, not country-specific ones.
 * Undated titles are left out: TMDB has no release information for them.
 */
export function upcomingAndRecent(
  credits: readonly PersonCredit[],
  now = new Date(),
  recentDays = 365,
): { upcoming: FilmographyEntry[]; recent: FilmographyEntry[] } {
  const day = today(now)
  const since = today(new Date(now.getTime() - recentDays * 86_400_000))
  const all = merge(credits)
  return {
    upcoming: all
      .filter((c) => c.releaseDate && c.releaseDate > day)
      .sort((a, b) => (a.releaseDate as string).localeCompare(b.releaseDate as string)),
    recent: all
      .filter((c) => c.releaseDate && c.releaseDate <= day && c.releaseDate >= since)
      .sort(byDateDesc),
  }
}

/** TMDB department for someone followed from a crew job. */
export function departmentForJob(job: string): string {
  if (job === 'Director') return 'Directing'
  if (['Screenplay', 'Writer', 'Story', 'Novel'].includes(job)) return 'Writing'
  if (job === 'Producer') return 'Production'
  if (job === 'Director of Photography') return 'Camera'
  if (job === 'Original Music Composer') return 'Sound'
  if (job === 'Creator') return 'Creator'
  return 'Crew'
}

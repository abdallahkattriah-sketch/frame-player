import type { CastMember, CrewMember } from '@shared/contracts/metadata'
import type { FollowedPerson, PersonRecommendation } from '@shared/contracts/people'
import type { TmdbPopularPerson } from './tmdb/tmdb-schemas'

export interface TitlePeople {
  /** "movie:603". */
  key: string
  title: string
  cast: CastMember[]
  crew: CrewMember[]
}

export interface RecommendInput {
  /** Every movie and show with stored details (library matches and titles opened). */
  titles: readonly TitlePeople[]
  /** Keys of titles matched to something in the library. */
  libraryKeys: ReadonlySet<string>
  followed: readonly FollowedPerson[]
  dismissed: ReadonlySet<number>
  popular: readonly TmdbPopularPerson[]
  limit?: number
}

/** Only top-billed actors count; minor roles say little about taste. */
const TOP_CAST = 6
const MAX_LOCAL = 12

interface Candidate {
  personId: number
  name: string
  profilePath: string | null
  department: string
  library: Set<string>
  workedWith: Set<string>
  titles: string[]
}

const jobDepartment = (job: string) =>
  job === 'Director'
    ? 'Directing'
    : job === 'Producer'
      ? 'Production'
      : job === 'Creator'
        ? 'Creator'
        : 'Writing'

/**
 * A simple, explainable ranking: people who appear in the user's library or worked with someone
 * they follow (counted locally), then TMDB's popular people. Followed and dismissed people are
 * never suggested.
 */
export function recommendPeople(input: RecommendInput): PersonRecommendation[] {
  const limit = input.limit ?? 20
  const followedIds = new Set(input.followed.map((p) => p.personId))
  const followedNames = new Map(input.followed.map((p) => [p.personId, p.name]))
  const excluded = (id: number) => followedIds.has(id) || input.dismissed.has(id)
  const candidates = new Map<number, Candidate>()

  for (const t of input.titles) {
    const people = [
      ...t.crew.map((c) => ({ ...c, department: jobDepartment(c.job) })),
      ...t.cast
        .slice(0, TOP_CAST)
        .flatMap((c) => (c.personId ? [{ ...c, personId: c.personId, department: 'Acting' }] : [])),
    ]
    const followedHere = people
      .filter((p) => followedIds.has(p.personId))
      .map((p) => followedNames.get(p.personId) as string)
    const inLibrary = input.libraryKeys.has(t.key)
    if (!inLibrary && followedHere.length === 0) continue
    for (const p of people) {
      if (excluded(p.personId)) continue
      let c = candidates.get(p.personId)
      if (!c) {
        c = {
          personId: p.personId,
          name: p.name,
          profilePath: p.profilePath,
          department: p.department,
          library: new Set(),
          workedWith: new Set(),
          titles: [],
        }
        candidates.set(p.personId, c)
      }
      if (inLibrary) c.library.add(t.key)
      for (const name of followedHere) c.workedWith.add(name)
      if (!c.titles.includes(t.title)) c.titles.push(t.title)
    }
  }

  const score = (c: Candidate) => c.library.size * 2 + c.workedWith.size * 3
  const local: PersonRecommendation[] = [...candidates.values()]
    // One library title alone is too weak a signal.
    .filter((c) => c.workedWith.size > 0 || c.library.size >= 2)
    .sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name))
    .slice(0, MAX_LOCAL)
    .map((c) => {
      const reasons: string[] = []
      if (c.workedWith.size > 0)
        reasons.push(`Worked with ${[...c.workedWith].slice(0, 2).join(' and ')}`)
      if (c.library.size > 0) {
        reasons.push(
          `In ${c.library.size} ${c.library.size === 1 ? 'title' : 'titles'} in your library`,
        )
      }
      return {
        personId: c.personId,
        name: c.name,
        profilePath: c.profilePath,
        department: c.department,
        knownFor: c.titles.slice(0, 3),
        reason: reasons.join(' · '),
        source: 'local' as const,
      }
    })

  const out = [...local]
  const chosen = new Set(out.map((p) => p.personId))
  for (const p of input.popular) {
    if (out.length >= limit) break
    if (p.adult || excluded(p.id) || chosen.has(p.id)) continue
    chosen.add(p.id)
    out.push({
      personId: p.id,
      name: p.name,
      profilePath: p.profile_path ?? null,
      department: p.known_for_department ?? null,
      knownFor: (p.known_for ?? [])
        .map((k) => k.title ?? k.name)
        .filter((t): t is string => !!t)
        .slice(0, 3),
      reason: 'Popular on TMDB',
      source: 'popular',
    })
  }
  return out.slice(0, limit)
}

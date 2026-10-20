import { describe, expect, it, vi } from 'vitest'
import type { FollowedPerson, PersonCredit, PersonDetails } from '@shared/contracts/people'
import { RadarService, countryReleases } from '../../../src/main/metadata/radar-service'
import type { TmdbReleaseDates } from '../../../src/main/metadata/tmdb/tmdb-schemas'

// All TMDB data here is mocked; no network request is made.

const NOW = new Date('2026-10-20T10:00:00Z')

function credit(tmdbId: number, releaseDate: string | null, role = 'Director'): PersonCredit {
  return {
    mediaType: 'movie',
    tmdbId,
    title: `Movie ${tmdbId}`,
    releaseDate,
    year: null,
    posterPath: null,
    department: 'Directing',
    role,
    voteCount: null,
    popularity: null,
  }
}

function person(personId: number, credits: PersonCredit[]): PersonDetails {
  return {
    personId,
    name: `Person ${personId}`,
    biography: null,
    birthday: null,
    deathday: null,
    placeOfBirth: null,
    profilePath: null,
    department: 'Directing',
    credits,
    fetchedAt: NOW.toISOString(),
  }
}

const followed = (id: number): FollowedPerson => ({
  personId: id,
  name: `Person ${id}`,
  profilePath: null,
  department: null,
  followedAt: NOW.toISOString(),
})

function dates(...entries: [string, number, string][]): TmdbReleaseDates {
  const byCountry = new Map<string, { type: number; release_date: string }[]>()
  for (const [country, type, date] of entries) {
    byCountry.set(country, [
      ...(byCountry.get(country) ?? []),
      { type, release_date: `${date}T00:00:00.000Z` },
    ])
  }
  return {
    results: [...byCountry].map(([iso_3166_1, release_dates]) => ({ iso_3166_1, release_dates })),
  }
}

function setup(opts: {
  people: Record<number, PersonDetails | Error>
  releases?: Record<number, TmdbReleaseDates | Error>
  follows?: number[]
  offline?: string | null
}) {
  const store = new Map<string, { body: unknown; at: string }>()
  let follows = opts.follows ?? Object.keys(opts.people).map(Number)
  let offline = opts.offline ?? null
  let now = NOW
  const personDetails = vi.fn(async (id: number) => {
    const p = opts.people[id]
    if (!p || p instanceof Error) throw p ?? new Error('not found')
    return p
  })
  const releaseDates = vi.fn(async (id: number) => {
    const r = opts.releases?.[id] ?? { results: [] }
    if (r instanceof Error) throw r
    return r
  })
  const service = new RadarService({
    personDetails,
    releaseDates,
    listFollowed: () => follows.map(followed),
    cache: {
      getCached: (key, notBefore) => {
        const hit = store.get(key)
        return hit && hit.at >= notBefore ? structuredClone(hit.body) : undefined
      },
      putCached: (key, body, at) => store.set(key, { body: structuredClone(body), at }),
    },
    offlineReason: () => offline,
    now: () => now,
  })
  return {
    service,
    personDetails,
    releaseDates,
    setFollows: (ids: number[]) => (follows = ids),
    setOffline: (reason: string | null) => (offline = reason),
    advance: (ms: number) => (now = new Date(now.getTime() + ms)),
  }
}

describe('countryReleases', () => {
  it('keeps Egyptian and US theatrical and digital dates only', () => {
    expect(
      countryReleases(
        dates(
          ['EG', 3, '2026-11-05'],
          ['US', 4, '2027-01-10'],
          ['FR', 3, '2026-10-01'],
          ['EG', 5, '2027-02-01'],
          ['EG', 1, '2026-09-01'],
        ),
      ),
    ).toEqual([
      { country: 'EG', kind: 'theatrical', date: '2026-11-05' },
      { country: 'US', kind: 'digital', date: '2027-01-10' },
    ])
  })
})

describe('RadarService', () => {
  it('needs no network when nobody is followed', async () => {
    const { service, personDetails } = setup({ people: {}, follows: [] })
    expect(await service.get()).toMatchObject({ movies: [], followedCount: 0 })
    expect(personDetails).not.toHaveBeenCalled()
  })

  it('merges a movie shared by several followed people and classifies its dates', async () => {
    const { service } = setup({
      people: {
        1: person(1, [credit(10, '2026-11-01'), credit(11, '1999-01-01'), credit(12, null)]),
        2: person(2, [credit(10, '2026-11-01', 'Lead')]),
      },
      releases: {
        10: dates(['US', 3, '2026-10-30'], ['EG', 3, '2026-11-05'], ['US', 4, '2027-01-15']),
      },
    })
    const result = await service.get()
    // Old and undated titles are not checked.
    expect(result.movies.map((m) => m.tmdbId)).toEqual([10])
    expect(result.movies[0]).toMatchObject({
      people: [
        { personId: 1, role: 'Director' },
        { personId: 2, role: 'Lead' },
      ],
      theatrical: { date: '2026-11-05', country: 'EG', egypt: true },
      digital: { date: '2027-01-15', country: 'US', egypt: false },
    })
  })

  it('reuses a recent result, and recomputes when follows change or on refresh', async () => {
    const t = setup({
      people: { 1: person(1, [credit(10, '2026-11-01')]), 2: person(2, []) },
      follows: [1],
    })
    await t.service.get()
    await t.service.get()
    expect(t.personDetails).toHaveBeenCalledTimes(1)
    t.setFollows([1, 2])
    await t.service.get()
    expect(t.personDetails).toHaveBeenCalledTimes(3)
    await t.service.get(true)
    expect(t.personDetails).toHaveBeenCalledTimes(5)
  })

  it('shares one refresh between concurrent callers', async () => {
    const t = setup({ people: { 1: person(1, [credit(10, '2026-11-01')]) } })
    const [a, b] = await Promise.all([t.service.get(true), t.service.get(true)])
    expect(a).toBe(b)
    expect(t.personDetails).toHaveBeenCalledTimes(1)
  })

  it('marks titles whose release dates fail instead of guessing dates', async () => {
    const t = setup({
      people: { 1: person(1, [credit(10, '2026-11-01')]) },
      releases: { 10: new Error('boom') },
    })
    expect((await t.service.get()).movies[0]).toMatchObject({
      releasesUnavailable: true,
      theatrical: null,
      digital: null,
    })
  })

  it('reports people that failed but keeps the others', async () => {
    const t = setup({
      people: { 1: person(1, [credit(10, '2026-11-01')]), 2: new Error('timeout') },
    })
    expect(await t.service.get()).toMatchObject({ failedPeople: 1, error: 'timeout', stale: false })
  })

  it('falls back to the last saved result when offline or when TMDB fails', async () => {
    const t = setup({ people: { 1: person(1, [credit(10, '2026-11-01')]) } })
    const first = await t.service.get()
    t.setOffline('Online metadata lookups are turned off.')
    const offline = await t.service.get(true)
    expect(offline).toMatchObject({
      stale: true,
      updatedAt: first.updatedAt,
      error: 'Online metadata lookups are turned off.',
    })
    expect(offline.movies).toHaveLength(1)

    t.setOffline(null)
    t.advance(86_400_000)
    const failing = setup({ people: { 1: new Error('network down') } })
    expect(await failing.service.get()).toMatchObject({
      movies: [],
      stale: true,
      error: 'network down',
    })
  })
})

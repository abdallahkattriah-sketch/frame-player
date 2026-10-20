import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { followPersonInputSchema } from '@shared/contracts/people'
import { openDatabase } from '../../../src/main/database/connection'
import { migrate } from '../../../src/main/database/migrator'
import { migrations } from '../../../src/main/database/migrations'
import { PeopleRepository } from '../../../src/main/database/repositories/people-repository'
import { MetadataRepository } from '../../../src/main/database/repositories/metadata-repository'
import { fromMovie, fromPerson, fromTv } from '../../../src/main/metadata/metadata-service'
import { useTempDirs } from './temp-dir'

const tempDir = useTempDirs()

const nolan = {
  personId: 525,
  name: 'Christopher Nolan',
  profilePath: null,
  department: 'Directing',
}
const zendaya = { personId: 505710, name: 'Zendaya', profilePath: '/z.jpg', department: 'Acting' }

function setup(path = ':memory:') {
  const db = openDatabase(path)
  migrate(db, migrations)
  let t = Date.parse('2026-10-20T10:00:00Z')
  return { db, people: new PeopleRepository(db, () => new Date((t += 1000))) }
}

describe('people repository', () => {
  it('follows and unfollows by TMDB person id', () => {
    const { people } = setup()
    people.follow(nolan)
    expect(people.isFollowing(525)).toBe(true)
    expect(people.list()).toMatchObject([{ personId: 525, name: 'Christopher Nolan' }])
    expect(people.unfollow(525)).toBe(true)
    expect(people.unfollow(525)).toBe(false)
    expect(people.list()).toEqual([])
  })

  it('never stores a person twice; following again refreshes name and keeps the date', () => {
    const { people } = setup()
    people.follow(zendaya)
    const first = people.list()[0]
    people.follow({ ...zendaya, profilePath: '/new.jpg' })
    expect(people.list()).toHaveLength(1)
    expect(people.list()[0]).toMatchObject({
      profilePath: '/new.jpg',
      followedAt: first?.followedAt,
    })
  })

  it('identifies people by id, not name', () => {
    const { people } = setup()
    people.follow({ ...nolan, personId: 1 })
    people.follow({ ...nolan, personId: 2 })
    expect([...people.followedIds()].sort()).toEqual([1, 2])
  })

  it('lists newest first and searches names, treating % and _ literally', () => {
    const { people } = setup()
    people.follow(nolan)
    people.follow(zendaya)
    expect(people.list().map((p) => p.personId)).toEqual([505710, 525])
    expect(people.list('nol').map((p) => p.personId)).toEqual([525])
    expect(people.list('%')).toEqual([])
  })

  it('keeps follows after the database is closed and reopened', () => {
    const path = join(tempDir(), 'frame.db')
    const first = setup(path)
    first.people.follow(nolan)
    first.db.close()
    const second = setup(path)
    expect(second.people.list()).toMatchObject([{ personId: 525 }])
    second.db.close()
  })

  it('records dismissals once, clears them on follow or reset', () => {
    const { people } = setup()
    people.dismiss(7)
    people.dismiss(7)
    people.dismiss(8)
    expect([...people.dismissedIds()].sort()).toEqual([7, 8])
    people.follow({ ...nolan, personId: 7 })
    expect([...people.dismissedIds()]).toEqual([8])
    expect(people.clearDismissed()).toBe(1)
    expect(people.dismissedIds().size).toBe(0)
  })

  it('validates follow input from the renderer', () => {
    expect(followPersonInputSchema.parse(nolan)).toEqual(nolan)
    expect(() => followPersonInputSchema.parse({ ...nolan, personId: 0 })).toThrow()
    expect(() => followPersonInputSchema.parse({ ...nolan, name: ' ' })).toThrow()
    expect(() => followPersonInputSchema.parse({ ...nolan, profilePath: '../x.jpg' })).toThrow()
    expect(() => followPersonInputSchema.parse({ ...nolan, extra: 1 })).toThrow()
  })
})

describe('metadata people', () => {
  const movie = {
    id: 27205,
    title: 'Inception',
    credits: {
      cast: [{ id: 6193, name: 'Leonardo DiCaprio', character: 'Cobb', order: 0 }],
      crew: [
        { id: 525, name: 'Christopher Nolan', job: 'Director', department: 'Directing' },
        { id: 525, name: 'Christopher Nolan', job: 'Director', department: 'Directing' },
        { id: 525, name: 'Christopher Nolan', job: 'Screenplay', department: 'Writing' },
        { id: 99, name: 'Grip', job: 'Key Grip', department: 'Crew' },
      ],
    },
  }

  it('keeps person ids for cast and key crew, without duplicates', () => {
    const m = fromMovie(movie, '2026-10-20T00:00:00Z')
    expect(m.cast[0]).toMatchObject({ personId: 6193, name: 'Leonardo DiCaprio' })
    expect(m.crew.map((c) => `${c.personId}:${c.job}`)).toEqual(['525:Director', '525:Screenplay'])
    expect(m.creators).toEqual(['Christopher Nolan', 'Christopher Nolan'])
  })

  it('lists show creators as crew', () => {
    const tv = fromTv(
      { id: 1, name: 'Show', created_by: [{ id: 66633, name: 'Vince Gilligan' }] },
      '2026-10-20T00:00:00Z',
    )
    expect(tv.crew).toEqual([
      { personId: 66633, name: 'Vince Gilligan', job: 'Creator', profilePath: null },
    ])
  })

  it('stores crew and reads pre-v8 cast entries with a null person id', () => {
    const { db } = setup()
    const repo = new MetadataRepository(db)
    repo.saveMetadata(fromMovie(movie, '2026-10-20T00:00:00Z'))
    expect(repo.getMetadata('movie', 27205)?.crew).toHaveLength(2)
    db.prepare(
      `UPDATE metadata_items SET cast_json = '[{"name":"Old","character":null,"profilePath":null}]'`,
    ).run()
    expect(repo.getMetadata('movie', 27205)?.cast[0]?.personId).toBeNull()
  })

  it('maps a person, tolerating missing details and leaving out adult titles', () => {
    const p = fromPerson(
      {
        id: 525,
        name: 'Christopher Nolan',
        biography: '  ',
        combined_credits: {
          cast: [{ id: 1, media_type: 'movie', title: 'Cameo', character: '' }],
          crew: [
            {
              id: 2,
              media_type: 'movie',
              title: 'Oppenheimer',
              release_date: '2023-07-19',
              job: 'Director',
              department: 'Directing',
            },
            {
              id: 3,
              media_type: 'tv',
              name: 'Series',
              first_air_date: '',
              job: 'Producer',
              department: 'Production',
            },
            {
              id: 4,
              media_type: 'movie',
              title: 'Hidden',
              adult: true,
              job: 'Director',
              department: 'Directing',
            },
            {
              id: 5,
              media_type: 'person',
              name: 'Not a title',
              job: 'Director',
              department: 'Directing',
            },
          ],
        },
      },
      '2026-10-20T00:00:00Z',
    )
    expect(p).toMatchObject({
      biography: null,
      birthday: null,
      profilePath: null,
      department: null,
    })
    expect(p.credits).toEqual([
      expect.objectContaining({ tmdbId: 1, department: 'cast', role: null, releaseDate: null }),
      expect.objectContaining({ tmdbId: 2, department: 'Directing', role: 'Director', year: 2023 }),
      expect.objectContaining({ tmdbId: 3, mediaType: 'tv', releaseDate: null, year: null }),
    ])
  })
})

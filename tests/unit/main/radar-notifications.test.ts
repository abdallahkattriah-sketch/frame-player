import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { notableReleases, type RadarMovie } from '@shared/contracts/radar'
import { openDatabase } from '../../../src/main/database/connection'
import { migrate } from '../../../src/main/database/migrator'
import { migrations } from '../../../src/main/database/migrations'
import { RadarRepository } from '../../../src/main/database/repositories/radar-repository'
import {
  recommendPeople,
  type TitlePeople,
} from '../../../src/main/metadata/people-recommendations'
import { useTempDirs } from './temp-dir'

const tempDir = useTempDirs()
const NOW = new Date(2026, 9, 20, 12)

function movie(over: Partial<RadarMovie> & { tmdbId: number }): RadarMovie {
  return {
    title: `Movie ${over.tmdbId}`,
    posterPath: null,
    primaryDate: null,
    people: [{ personId: 1, name: 'Ann', role: null }],
    theatrical: null,
    digital: null,
    releases: [],
    releasesUnavailable: false,
    ...over,
  }
}

function open(path = ':memory:') {
  const db = openDatabase(path)
  migrate(db, migrations)
  let t = NOW.getTime()
  return { db, repo: new RadarRepository(db, () => new Date((t += 1000))) }
}

describe('notableReleases', () => {
  it('picks dated releases near today, theatrical and digital separately', () => {
    const items = notableReleases(
      [
        movie({ tmdbId: 1, theatrical: { date: '2026-11-01', country: 'EG', egypt: true } }),
        movie({
          tmdbId: 2,
          theatrical: { date: '2026-10-15', country: 'US', egypt: false },
          digital: { date: '2026-12-01', country: 'US', egypt: false },
        }),
        movie({ tmdbId: 3, theatrical: { date: '2027-06-01', country: 'EG', egypt: true } }),
        movie({ tmdbId: 4, theatrical: { date: '2026-08-01', country: 'EG', egypt: true } }),
        movie({ tmdbId: 5, primaryDate: '2026-11-01' }),
      ],
      NOW,
    )
    expect(items.map((i) => `${i.tmdbMovieId}:${i.kind}:${i.country}`)).toEqual([
      '1:theatrical:EG',
      '2:theatrical:US',
      '2:digital:US',
    ])
    expect(items[0]?.people).toEqual(['Ann'])
  })
})

describe('RadarRepository', () => {
  const input = {
    tmdbMovieId: 10,
    kind: 'theatrical' as const,
    title: 'Dune 3',
    posterPath: null,
    date: '2026-11-01',
    country: 'EG',
    people: ['Ann'],
  }

  it('announces each release once, even after a restart', () => {
    const path = join(tempDir(), 'frame.db')
    const first = open(path)
    expect(first.repo.record([input, { ...input, kind: 'digital' }])).toBe(2)
    expect(first.repo.record([input])).toBe(0)
    first.db.close()
    const second = open(path)
    expect(second.repo.record([input, { ...input, title: 'Renamed' }])).toBe(0)
    expect(second.repo.list()).toHaveLength(2)
    expect(second.repo.unreadCount()).toBe(2)
    second.db.close()
  })

  it('marks read, marks all read, and dismisses without announcing again', () => {
    const { repo } = open()
    repo.record([input, { ...input, tmdbMovieId: 11 }])
    expect(repo.markRead(10, 'theatrical')).toBe(true)
    expect(repo.markRead(10, 'theatrical')).toBe(false)
    expect(repo.unreadCount()).toBe(1)
    expect(repo.list().find((n) => n.tmdbMovieId === 10)?.read).toBe(true)
    expect(repo.dismiss(11, 'theatrical')).toBe(true)
    expect(repo.list().map((n) => n.tmdbMovieId)).toEqual([10])
    expect(repo.unreadCount()).toBe(0)
    expect(repo.record([{ ...input, tmdbMovieId: 11 }])).toBe(0)
    repo.record([{ ...input, tmdbMovieId: 12 }])
    expect(repo.markAllRead()).toBe(1)
  })
})

describe('recommendPeople', () => {
  const title = (key: string, people: [number, string, string][]): TitlePeople => ({
    key,
    title: `Title ${key}`,
    crew: people
      .filter(([, , job]) => job !== 'Acting')
      .map(([personId, name, job]) => ({ personId, name, job, profilePath: null })),
    cast: people
      .filter(([, , job]) => job === 'Acting')
      .map(([personId, name]) => ({ personId, name, character: null, profilePath: null })),
  })
  const followed = [
    { personId: 1, name: 'Followed One', profilePath: null, department: null, followedAt: '' },
  ]
  const titles = [
    title('movie:1', [
      [1, 'Followed One', 'Director'],
      [2, 'Co Star', 'Acting'],
    ]),
    title('movie:2', [
      [3, 'Library Regular', 'Acting'],
      [4, 'Once Only', 'Acting'],
    ]),
    title('movie:3', [[3, 'Library Regular', 'Acting']]),
    title('movie:4', [[5, 'Unrelated', 'Acting']]),
  ]
  const popular = [
    { id: 1, name: 'Followed One' },
    { id: 9, name: 'Star', known_for: [{ title: 'Hit' }] },
    { id: 8, name: 'Adult', adult: true },
    { id: 7, name: 'Dismissed' },
  ]

  it('explains local suggestions and fills up with TMDB popular people', () => {
    const people = recommendPeople({
      titles,
      libraryKeys: new Set(['movie:2', 'movie:3']),
      followed,
      dismissed: new Set([7]),
      popular,
    })
    expect(people.map((p) => [p.personId, p.source, p.reason])).toEqual([
      // Two library titles (score 4) outrank one shared title with a followed person (3).
      [3, 'local', 'In 2 titles in your library'],
      [2, 'local', 'Worked with Followed One'],
      [9, 'popular', 'Popular on TMDB'],
    ])
    expect(people[2]?.knownFor).toEqual(['Hit'])
  })

  it('never suggests followed or dismissed people', () => {
    const ids = recommendPeople({
      titles,
      libraryKeys: new Set(['movie:2', 'movie:3']),
      followed,
      dismissed: new Set([2, 3, 7, 9]),
      popular,
    }).map((p) => p.personId)
    expect(ids).toEqual([])
  })
})

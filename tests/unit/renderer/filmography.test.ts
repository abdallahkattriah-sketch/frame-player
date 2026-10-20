import { describe, expect, it } from 'vitest'
import type { PersonCredit } from '@shared/contracts/people'
import {
  departmentForJob,
  groupFilmography,
  upcomingAndRecent,
} from '../../../src/renderer/src/features/people/filmography'

function credit(over: Partial<PersonCredit>): PersonCredit {
  return {
    mediaType: 'movie',
    tmdbId: 1,
    title: 'Title',
    releaseDate: null,
    year: null,
    posterPath: null,
    department: 'cast',
    role: null,
    voteCount: null,
    popularity: null,
    ...over,
  }
}

describe('filmography', () => {
  it('groups by department with acting first and merges jobs on the same title', () => {
    const groups = groupFilmography([
      credit({ tmdbId: 1, department: 'Writing', role: 'Screenplay' }),
      credit({ tmdbId: 2, department: 'Directing', role: 'Director', releaseDate: '2020-01-01' }),
      credit({ tmdbId: 3, department: 'Directing', role: 'Director', releaseDate: '2023-07-19' }),
      credit({ tmdbId: 1, department: 'Writing', role: 'Story' }),
      credit({ tmdbId: 4, department: 'cast', role: 'Himself' }),
    ])
    expect(groups.map((g) => g.label)).toEqual(['Acting', 'Directing', 'Writing'])
    expect(groups[1]?.entries.map((e) => e.tmdbId)).toEqual([3, 2])
    expect(groups[2]?.entries).toEqual([
      expect.objectContaining({ tmdbId: 1, roles: ['Screenplay', 'Story'] }),
    ])
  })

  it('keeps a movie and a show with the same TMDB id apart', () => {
    const [group] = groupFilmography([
      credit({ tmdbId: 9 }),
      credit({ tmdbId: 9, mediaType: 'tv' }),
    ])
    expect(group?.entries).toHaveLength(2)
  })

  it('splits upcoming and recent titles by date and leaves undated ones out', () => {
    const now = new Date(2026, 9, 20)
    const { upcoming, recent } = upcomingAndRecent(
      [
        credit({ tmdbId: 1, releaseDate: '2027-03-01' }),
        credit({ tmdbId: 2, releaseDate: '2026-11-05' }),
        credit({ tmdbId: 3, releaseDate: '2026-10-20' }),
        credit({ tmdbId: 4, releaseDate: '2026-01-01' }),
        credit({ tmdbId: 5, releaseDate: '2024-01-01' }),
        credit({ tmdbId: 6 }),
      ],
      now,
    )
    expect(upcoming.map((e) => e.tmdbId)).toEqual([2, 1])
    expect(recent.map((e) => e.tmdbId)).toEqual([3, 4])
  })

  it('maps crew jobs to departments', () => {
    expect(departmentForJob('Director')).toBe('Directing')
    expect(departmentForJob('Screenplay')).toBe('Writing')
    expect(departmentForJob('Key Grip')).toBe('Crew')
  })
})

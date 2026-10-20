import { describe, expect, it } from 'vitest'
import { pickDate, radarSections, type RadarMovie } from '@shared/contracts/radar'

const NOW = new Date(2026, 9, 20, 12) // 20 Oct 2026, local time

function movie(over: Partial<RadarMovie> & { tmdbId: number }): RadarMovie {
  return {
    title: `Movie ${over.tmdbId}`,
    posterPath: null,
    primaryDate: null,
    people: [{ personId: 1, name: 'A', role: null }],
    theatrical: null,
    digital: null,
    releases: [],
    releasesUnavailable: false,
    ...over,
  }
}

const eg = (date: string) => ({ date, country: 'EG', egypt: true })
const us = (date: string) => ({ date, country: 'US', egypt: false })

describe('pickDate', () => {
  const releases = [
    { country: 'US', kind: 'theatrical' as const, date: '2026-11-01' },
    { country: 'EG', kind: 'theatrical' as const, date: '2026-11-12' },
    { country: 'EG', kind: 'theatrical' as const, date: '2026-11-05' },
    { country: 'US', kind: 'digital' as const, date: '2027-01-10' },
  ]

  it('prefers the earliest Egyptian date for the kind', () => {
    expect(pickDate(releases, 'theatrical')).toEqual(eg('2026-11-05'))
  })

  it('falls back to the US date, never labeled as Egyptian', () => {
    expect(pickDate(releases, 'digital')).toEqual(us('2027-01-10'))
  })

  it('does not derive a digital date from a theatrical one', () => {
    expect(pickDate(releases.slice(0, 3), 'digital')).toBeNull()
    expect(pickDate([], 'theatrical')).toBeNull()
  })
})

describe('radarSections', () => {
  it('puts upcoming theatrical dates in Coming Soon and recent ones in Newly Released', () => {
    const s = radarSections(
      [
        movie({ tmdbId: 1, theatrical: eg('2026-11-10') }),
        movie({ tmdbId: 2, theatrical: eg('2026-10-25') }),
        movie({ tmdbId: 3, theatrical: eg('2026-10-20') }),
        movie({ tmdbId: 4, theatrical: us('2026-10-01') }),
        movie({ tmdbId: 5, theatrical: eg('2026-06-01') }),
        movie({ tmdbId: 6, theatrical: eg('2027-06-01') }),
      ],
      NOW,
    )
    expect(s.comingSoon.map((e) => [e.movie.tmdbId, e.days])).toEqual([
      [2, 5],
      [1, 21],
    ])
    expect(s.newlyReleased.map((e) => [e.movie.tmdbId, e.days])).toEqual([
      [3, 0],
      [4, -19],
    ])
    expect(s.newlyReleased[1]?.date?.egypt).toBe(false)
  })

  it('lists titles without any theatrical date as unconfirmed, without inventing one', () => {
    const s = radarSections(
      [movie({ tmdbId: 1, primaryDate: '2026-11-01' }), movie({ tmdbId: 2 })],
      NOW,
    )
    expect(s.comingSoon).toEqual([
      expect.objectContaining({ status: 'unconfirmed', date: null, days: null }),
    ])
    expect(s.newlyReleased).toEqual([])
  })

  it('only shows digital releases with a digital date, upcoming first', () => {
    const s = radarSections(
      [
        movie({ tmdbId: 1, theatrical: eg('2026-10-01') }),
        movie({ tmdbId: 2, digital: us('2026-10-10') }),
        movie({ tmdbId: 3, digital: eg('2026-11-02') }),
        movie({ tmdbId: 4, digital: eg('2026-10-22') }),
      ],
      NOW,
    )
    expect(s.digital.map((e) => [e.movie.tmdbId, e.status])).toEqual([
      [4, 'upcoming'],
      [3, 'upcoming'],
      [2, 'released'],
    ])
  })

  it('shows a movie once per section and filters by followed person', () => {
    const shared = movie({
      tmdbId: 7,
      theatrical: eg('2026-11-01'),
      people: [
        { personId: 1, name: 'A', role: 'Director' },
        { personId: 2, name: 'B', role: 'Lead' },
      ],
    })
    const s = radarSections([shared, { ...shared }], NOW)
    expect(s.comingSoon).toHaveLength(1)
    expect(s.comingSoon[0]?.movie.people).toHaveLength(2)
    expect(
      radarSections([shared], NOW, { aheadDays: 30, recentDays: 30, personId: 2 }).comingSoon,
    ).toHaveLength(1)
    expect(
      radarSections([shared], NOW, { aheadDays: 30, recentDays: 30, personId: 3 }).comingSoon,
    ).toHaveLength(0)
  })

  it('widens the window on request', () => {
    const far = [movie({ tmdbId: 1, theatrical: eg('2027-03-01') })]
    expect(radarSections(far, NOW).comingSoon).toHaveLength(0)
    expect(radarSections(far, NOW, { aheadDays: 365, recentDays: 365 }).comingSoon).toHaveLength(1)
  })
})

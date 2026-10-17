import { describe, expect, it } from 'vitest'
import {
  normalizeTitle,
  rankCandidates,
  titleSimilarity,
  type RawCandidate,
} from '../../../src/main/metadata/matching'

const movie = (
  tmdbId: number,
  title: string,
  date: string | null,
  extra: Partial<RawCandidate> = {},
): RawCandidate => ({
  tmdbId,
  mediaType: 'movie',
  title,
  originalTitle: null,
  date,
  overview: null,
  posterPath: null,
  popularity: null,
  voteCount: null,
  ...extra,
})

describe('normalizeTitle and titleSimilarity', () => {
  it('ignores case, accents, punctuation, articles, and "&"', () => {
    expect(normalizeTitle('Amélie')).toBe('amelie')
    expect(normalizeTitle('The Lord of the Rings: The Two Towers')).toBe('lord of rings two towers')
    expect(titleSimilarity('Fast & Furious', 'Fast and Furious')).toBe(1)
    expect(titleSimilarity('Spider-Man', 'Spider Man')).toBe(1)
  })

  it('keeps Arabic and Japanese titles comparable', () => {
    expect(titleSimilarity('الرسالة', 'الرسالة')).toBe(1)
    expect(titleSimilarity('千と千尋の神隠し', '千と千尋の神隠し')).toBe(1)
    expect(titleSimilarity('الرسالة', 'Spirited Away')).toBe(0)
  })

  it('scores near-misses between 0 and 1', () => {
    const s = titleSimilarity('The Matrix Reloaded', 'The Matrix')
    expect(s).toBeGreaterThan(0.5)
    expect(s).toBeLessThan(1)
  })
})

describe('rankCandidates', () => {
  it('auto-matches an exact title and year that is clearly ahead', () => {
    const result = rankCandidates({ title: 'The Matrix', year: 1999, mediaType: 'movie' }, [
      movie(604, 'The Matrix Reloaded', '2003-05-15'),
      movie(603, 'The Matrix', '1999-03-30'),
      movie(624860, 'The Matrix Resurrections', '2021-12-16'),
    ])
    expect(result.autoMatch?.tmdbId).toBe(603)
    expect(result.candidates[0]?.tmdbId).toBe(603)
  })

  it('uses the year to separate remakes, and does not auto-match without one', () => {
    const remakes = [movie(1, 'Dune', '1984-12-14'), movie(2, 'Dune', '2021-09-15')]
    expect(
      rankCandidates({ title: 'Dune', year: 2021, mediaType: 'movie' }, remakes).autoMatch?.tmdbId,
    ).toBe(2)
    const noYear = rankCandidates({ title: 'Dune', year: null, mediaType: 'movie' }, remakes)
    expect(noYear.autoMatch).toBeNull()
    expect(noYear.candidates).toHaveLength(2)
  })

  it('accepts a one-year difference but not a distant year', () => {
    expect(
      rankCandidates({ title: 'Parasite', year: 2020, mediaType: 'movie' }, [
        movie(496243, 'Parasite', '2019-05-30'),
      ]).autoMatch?.tmdbId,
    ).toBe(496243)
    expect(
      rankCandidates({ title: 'Parasite', year: 1982, mediaType: 'movie' }, [
        movie(496243, 'Parasite', '2019-05-30'),
      ]).autoMatch,
    ).toBeNull()
  })

  it('matches on the original title when the file uses it', () => {
    const result = rankCandidates({ title: '千と千尋の神隠し', year: 2001, mediaType: 'movie' }, [
      movie(129, 'Spirited Away', '2001-07-20', { originalTitle: '千と千尋の神隠し' }),
    ])
    expect(result.autoMatch?.tmdbId).toBe(129)
    expect(result.candidates[0]?.originalTitle).toBe('千と千尋の神隠し')
  })

  it('never auto-matches weak or ambiguous results', () => {
    expect(
      rankCandidates({ title: 'Home Video 2', year: null, mediaType: 'movie' }, [
        movie(9, 'Home Alone', '1990-11-16'),
      ]).autoMatch,
    ).toBeNull()
    expect(
      rankCandidates({ title: 'Anything', year: 2000, mediaType: 'movie' }, []).autoMatch,
    ).toBeNull()
  })

  it('penalizes the wrong media type', () => {
    const result = rankCandidates({ title: 'Fargo', year: 2014, mediaType: 'tv' }, [
      movie(275, 'Fargo', '1996-03-08'),
      { ...movie(60622, 'Fargo', '2014-04-15'), mediaType: 'tv' },
    ])
    expect(result.autoMatch).toMatchObject({ tmdbId: 60622, mediaType: 'tv' })
  })
})

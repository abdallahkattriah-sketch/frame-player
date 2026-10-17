import { describe, expect, it } from 'vitest'
import { HttpClient } from '../../src/main/network/http-client'
import { TmdbClient } from '../../src/main/metadata/tmdb/tmdb-client'
import { rankCandidates } from '../../src/main/metadata/matching'

/**
 * Real requests to api.themoviedb.org. Runs only when FRAME_TEST_TMDB_TOKEN is set in the
 * environment (never commit a token). Verifies that the live API still matches the shapes
 * Frame validates against.
 *   PowerShell:  $env:FRAME_TEST_TMDB_TOKEN = '<token>'; npx vitest run tests/integration
 */
const token = process.env['FRAME_TEST_TMDB_TOKEN']

describe.skipIf(!token)('TMDB live API', () => {
  const tmdb = new TmdbClient({
    http: new HttpClient({ timeoutMs: 20_000 }),
    getToken: () => token,
    getLanguage: () => 'en-US',
  })

  it('accepts the token and returns image configuration', async () => {
    const config = await tmdb.configuration()
    expect(config.images.secure_base_url).toMatch(/^https:\/\//)
    expect(config.images.poster_sizes).toContain('w342')
  })

  it('finds and auto-matches The Matrix (1999), with details and credits', async () => {
    const results = await tmdb.searchMovies('The Matrix', 1999)
    const ranked = rankCandidates(
      { title: 'The Matrix', year: 1999, mediaType: 'movie' },
      results.map((r) => ({
        tmdbId: r.id,
        mediaType: 'movie',
        title: r.title,
        originalTitle: r.original_title ?? null,
        date: r.release_date ?? null,
        overview: r.overview ?? null,
        posterPath: r.poster_path ?? null,
        popularity: r.popularity ?? null,
        voteCount: r.vote_count ?? null,
      })),
    )
    expect(ranked.autoMatch?.tmdbId).toBe(603)

    const details = await tmdb.movieDetails(603)
    expect(details.title).toBe('The Matrix')
    expect(details.external_ids?.imdb_id ?? details.imdb_id).toBe('tt0133093')
    expect(details.credits?.cast?.length).toBeGreaterThan(0)
  })

  it('finds a TV show and its season episodes', async () => {
    const results = await tmdb.searchTv('Breaking Bad', 2008)
    expect(results.some((r) => r.id === 1396)).toBe(true)
    const show = await tmdb.tvDetails(1396)
    expect(show.external_ids?.tvdb_id).toBeTypeOf('number')
    const season = await tmdb.seasonDetails(1396, 1)
    expect(season.episodes[0]?.episode_number).toBe(1)
  })
})

import { existsSync, utimesSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { ParsedMediaName } from '@shared/contracts/library'
import { openDatabase } from '../../../src/main/database/connection'
import { migrate } from '../../../src/main/database/migrator'
import { migrations } from '../../../src/main/database/migrations'
import {
  LibraryRepository,
  type ScannedFile,
} from '../../../src/main/database/repositories/library-repository'
import { MetadataRepository } from '../../../src/main/database/repositories/metadata-repository'
import { LibraryQueryRepository } from '../../../src/main/database/repositories/library-query-repository'
import { HttpClient } from '../../../src/main/network/http-client'
import { isV3ApiKey, TmdbClient } from '../../../src/main/metadata/tmdb/tmdb-client'
import { MetadataService } from '../../../src/main/metadata/metadata-service'
import { ArtworkCache } from '../../../src/main/metadata/artwork-cache'
import { pathKey } from '../../../src/main/library/path-key'
import { useTempDirs } from './temp-dir'

const tempDir = useTempDirs()

// ── Canned TMDB responses (shapes from developer.themoviedb.org) ─────────────

const routes: Record<string, unknown> = {
  '/3/configuration': {
    images: {
      secure_base_url: 'https://image.tmdb.org/t/p/',
      poster_sizes: ['w342'],
      backdrop_sizes: ['w1280'],
      still_sizes: ['w300'],
      profile_sizes: ['w185'],
    },
    change_keys: [],
  },
  '/3/search/movie?query=The Matrix&year=1999': {
    page: 1,
    total_results: 2,
    results: [
      {
        id: 603,
        title: 'The Matrix',
        original_title: 'The Matrix',
        release_date: '1999-03-30',
        poster_path: '/matrix.jpg',
        overview: 'Neo.',
        vote_count: 25000,
      },
      {
        id: 604,
        title: 'The Matrix Reloaded',
        release_date: '2003-05-15',
        poster_path: null,
        overview: '',
      },
    ],
  },
  '/3/search/movie?query=Dune': {
    page: 1,
    total_results: 2,
    results: [
      { id: 841, title: 'Dune', release_date: '1984-12-14' },
      { id: 438631, title: 'Dune', release_date: '2021-09-15' },
    ],
  },
  '/3/search/movie?query=Unknown Home Video': { page: 1, total_results: 0, results: [] },
  '/3/movie/603?append_to_response=credits,external_ids': {
    id: 603,
    imdb_id: 'tt0133093',
    title: 'The Matrix',
    original_title: 'The Matrix',
    overview: 'A hacker learns the truth.',
    release_date: '1999-03-30',
    runtime: 136,
    genres: [
      { id: 28, name: 'Action' },
      { id: 878, name: 'Science Fiction' },
    ],
    poster_path: '/matrix.jpg',
    backdrop_path: '/matrix-bg.jpg',
    vote_average: 8.2,
    vote_count: 25000,
    original_language: 'en',
    production_companies: [{ id: 1, name: 'Warner Bros.' }],
    credits: {
      cast: [
        { name: 'Laurence Fishburne', character: 'Morpheus', order: 1, profile_path: null },
        { name: 'Keanu Reeves', character: 'Neo', order: 0, profile_path: '/keanu.jpg' },
      ],
      crew: [
        { name: 'Lana Wachowski', job: 'Director' },
        { name: 'Someone', job: 'Editor' },
      ],
    },
    external_ids: { imdb_id: 'tt0133093' },
  },
  '/3/movie/438631?append_to_response=credits,external_ids': {
    id: 438631,
    title: 'Dune',
    release_date: '2021-09-15',
    genres: [],
  },
  '/3/search/tv?query=Breaking Bad&first_air_date_year=2008': {
    page: 1,
    total_results: 1,
    results: [
      {
        id: 1396,
        name: 'Breaking Bad',
        original_name: 'Breaking Bad',
        first_air_date: '2008-01-20',
        poster_path: '/bb.jpg',
      },
    ],
  },
  '/3/tv/1396?append_to_response=credits,external_ids': {
    id: 1396,
    name: 'Breaking Bad',
    first_air_date: '2008-01-20',
    episode_run_time: [47],
    genres: [{ name: 'Drama' }],
    created_by: [{ name: 'Vince Gilligan' }],
    networks: [{ name: 'AMC' }],
    poster_path: '/bb.jpg',
    external_ids: { imdb_id: 'tt0903747', tvdb_id: 81189 },
  },
  '/3/tv/1396/season/1': {
    season_number: 1,
    episodes: [
      {
        episode_number: 1,
        season_number: 1,
        name: 'Pilot',
        air_date: '2008-01-20',
        still_path: '/s1e1.jpg',
        runtime: 58,
      },
      { episode_number: 2, season_number: 1, name: "Cat's in the Bag...", runtime: 48 },
    ],
  },
}

function fakeTmdb(overrides: Record<string, () => Response> = {}) {
  const calls: { url: URL; headers: Record<string, string> }[] = []
  const fetchMock = vi.fn(async (input: URL, init?: RequestInit) => {
    const url = new URL(input)
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> })
    const params = [...url.searchParams].filter(
      ([k]) => !['language', 'include_adult', 'api_key'].includes(k),
    )
    const key =
      url.pathname + (params.length ? `?${params.map(([k, v]) => `${k}=${v}`).join('&')}` : '')
    const override = overrides[key] ?? overrides['*']
    if (override) return override()
    if (url.hostname === 'image.tmdb.org') {
      return new Response(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), {
        headers: { 'content-type': 'image/jpeg' },
      })
    }
    const body = routes[key]
    if (!body) return new Response(JSON.stringify({ status_message: 'not found' }), { status: 404 })
    return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
  })
  return { fetchMock, calls }
}

const blank: ParsedMediaName = {
  kind: 'unknown',
  title: null,
  year: null,
  season: null,
  episode: null,
  episodeEnd: null,
  episodeTitle: null,
  resolution: null,
  videoCodec: null,
  edition: null,
  releaseGroup: null,
}
function file(rel: string, parsed: Partial<ParsedMediaName>): ScannedFile {
  const path = `C:\\Media\\${rel}`
  return {
    ...blank,
    ...parsed,
    path,
    pathKey: pathKey(path),
    relativePath: rel,
    fileName: rel,
    sizeBytes: 1,
    mtimeMs: 1,
  }
}

function setup(
  options: { token?: string; enabled?: boolean; overrides?: Record<string, () => Response> } = {},
) {
  const db = openDatabase(':memory:')
  migrate(db, migrations)
  const library = new LibraryRepository(db)
  const folder = library.insertFolder('C:\\Media', pathKey('C:\\Media'))
  library.upsertFiles(folder, 1, [
    file('The.Matrix.1999.mkv', { kind: 'movie', title: 'The Matrix', year: 1999 }),
    file('Dune.mkv', { kind: 'movie', title: 'Dune' }),
    file('Unknown Home Video.mkv', { kind: 'movie', title: 'Unknown Home Video' }),
    file('Breaking Bad (2008)\\Season 1\\S01E01.mkv', {
      kind: 'episode',
      title: 'Breaking Bad',
      year: 2008,
      season: 1,
      episode: 1,
    }),
    file('Breaking Bad (2008)\\Season 1\\S01E02.mkv', {
      kind: 'episode',
      title: 'Breaking Bad',
      year: 2008,
      season: 1,
      episode: 2,
    }),
  ])
  const repo = new MetadataRepository(db)
  const { fetchMock, calls } = fakeTmdb(options.overrides)
  const http = new HttpClient({
    fetch: fetchMock as unknown as typeof fetch,
    sleep: async () => undefined,
    maxRetries: 1,
  })
  const tmdb = new TmdbClient({
    http,
    getToken: () => ('token' in options ? options.token : 'eyJ.test-read-access-token'),
    getLanguage: () => 'en-US',
  })
  const onChanged = vi.fn()
  const fileIds = db
    .prepare(
      'SELECT id, path_key AS pathKey, parsed_kind AS kind, lower(parsed_title) AS showKey, parsed_season AS season, parsed_episode AS episode, file_name AS name FROM media_files',
    )
    .all() as {
    id: number
    pathKey: string
    kind: string
    showKey: string | null
    season: number | null
    episode: number | null
    name: string
  }[]
  const service = new MetadataService({
    repository: repo,
    tmdb,
    isEnabled: () => options.enabled ?? true,
    getLanguage: () => 'en-US',
    resolveFile: (id) => fileIds.find((f) => f.id === id),
    onChanged,
    onStatus: () => undefined,
  })
  const idOf = (name: string) => fileIds.find((f) => f.name === name)?.id as number
  return { db, repo, service, calls, fetchMock, http, onChanged, idOf }
}

describe('TmdbClient authentication', () => {
  it('sends a Read Access Token as a bearer header and a v3 key as api_key', async () => {
    const bearer = setup()
    await bearer.service.testToken()
    expect(bearer.calls[0]?.headers['Authorization']).toBe('Bearer eyJ.test-read-access-token')
    expect(bearer.calls[0]?.url.searchParams.has('api_key')).toBe(false)

    const v3 = setup({ token: '0123456789abcdef0123456789abcdef' })
    await v3.service.testToken()
    expect(v3.calls[0]?.url.searchParams.get('api_key')).toBe('0123456789abcdef0123456789abcdef')
    expect(v3.calls[0]?.headers['Authorization']).toBeUndefined()
    expect(isV3ApiKey('0123456789abcdef0123456789abcdef')).toBe(true)
  })

  it('reports a rejected token clearly', async () => {
    const { service } = setup({ overrides: { '*': () => new Response('{}', { status: 401 }) } })
    expect(await service.testToken()).toEqual({
      ok: false,
      message: 'TMDB rejected the token. Check it in Settings.',
    })
  })
})

describe('MetadataService identification', () => {
  it('auto-matches clear results, keeps ambiguous ones as candidates, and stores details', async () => {
    const { service, repo, idOf } = setup()
    await service.identifyPending()

    const matrix = service.itemMetadata({ fileId: idOf('The.Matrix.1999.mkv') })
    expect(matrix).toMatchObject({ status: 'matched', source: 'auto' })
    expect(matrix.metadata).toMatchObject({
      tmdbId: 603,
      title: 'The Matrix',
      year: 1999,
      runtimeMinutes: 136,
      genres: ['Action', 'Science Fiction'],
      imdbId: 'tt0133093',
      creators: ['Lana Wachowski'],
      production: ['Warner Bros.'],
    })
    expect(matrix.metadata?.cast.map((c) => c.name)).toEqual(['Keanu Reeves', 'Laurence Fishburne'])

    // Two films called Dune and no year: the user must choose.
    const dune = service.itemMetadata({ fileId: idOf('Dune.mkv') })
    expect(dune.status).toBe('candidates')
    expect(repo.getMatch('file', pathKey('C:\\Media\\Dune.mkv'))?.candidates).toHaveLength(2)

    expect(service.itemMetadata({ fileId: idOf('Unknown Home Video.mkv') }).status).toBe('no-match')
  })

  it('searches TMDB beyond the library, most popular first, marking library titles', async () => {
    const json = (body: unknown) => () =>
      new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
    const { service } = setup({
      overrides: {
        '/3/search/movie?query=matrix': json({
          page: 1,
          total_results: 2,
          results: [
            { id: 604, title: 'The Matrix Reloaded', release_date: '2003-05-15', popularity: 40 },
            { id: 603, title: 'The Matrix', release_date: '1999-03-30', popularity: 90 },
          ],
        }),
        '/3/search/tv?query=matrix': json({
          page: 1,
          total_results: 1,
          results: [{ id: 9, name: 'Matrix', first_air_date: '1993-03-01', popularity: 5 }],
        }),
      },
    })
    await service.identifyPending()
    const results = await service.discover('matrix')
    expect(results.map((r) => [r.mediaType, r.tmdbId, r.year, r.inLibrary])).toEqual([
      ['movie', 603, 1999, true],
      ['movie', 604, 2003, false],
      ['tv', 9, 1993, false],
    ])
  })

  it('browses trending lists: skips people and adult titles, caches, marks library titles', async () => {
    const json = (body: unknown) => () =>
      new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
    const { service, calls } = setup({
      overrides: {
        '/3/trending/all/day': json({
          page: 1,
          total_results: 4,
          results: [
            {
              id: 603,
              media_type: 'movie',
              title: 'The Matrix',
              release_date: '1999-03-30',
              backdrop_path: '/m.jpg',
              vote_average: 8.2,
              vote_count: 100,
            },
            { id: 1, media_type: 'person', name: 'Keanu Reeves' },
            { id: 2, media_type: 'movie', title: 'Adult', adult: true },
            { id: 1396, media_type: 'tv', name: 'Breaking Bad', first_air_date: '2008-01-20' },
          ],
        }),
        '/3/tv/top_rated': json({
          page: 1,
          total_results: 1,
          results: [{ id: 1396, name: 'Breaking Bad', vote_average: 8.9, vote_count: 0 }],
        }),
      },
    })
    await service.identifyPending()
    const today = await service.browse('trending-today')
    expect(today.map((r) => [r.mediaType, r.tmdbId, r.year, r.inLibrary])).toEqual([
      ['movie', 603, 1999, true],
      ['tv', 1396, 2008, true],
    ])
    expect(today[0]).toMatchObject({ backdropPath: '/m.jpg', voteAverage: 8.2 })
    const before = calls.length
    await service.browse('trending-today')
    expect(calls.length).toBe(before)
    // Lists of one kind carry no media_type; unrated titles have no rating.
    expect(await service.browse('shows-top-rated')).toMatchObject([
      { mediaType: 'tv', tmdbId: 1396, voteAverage: null },
    ])
    await expect(setup({ enabled: false }).service.browse('trending-today')).rejects.toThrow(
      /turned off/,
    )
  })

  it('fetches details for any TMDB title once and then serves them from the cache', async () => {
    const { service, calls } = setup()
    const details = await service.details('movie', 603)
    expect(details).toMatchObject({ title: 'The Matrix', runtimeMinutes: 136 })
    const before = calls.length
    await service.details('movie', 603)
    expect(calls.length).toBe(before)
    await expect(setup({ enabled: false }).service.details('movie', 603)).rejects.toThrow(
      /turned off/,
    )
  })

  it('matches a show once and attaches episode details to each local episode', async () => {
    const { service, calls, idOf } = setup()
    await service.identifyPending()
    const e2 = service.itemMetadata({ fileId: idOf('Breaking Bad (2008)\\Season 1\\S01E02.mkv') })
    expect(e2.metadata).toMatchObject({
      tmdbId: 1396,
      mediaType: 'tv',
      tvdbId: 81189,
      creators: ['Vince Gilligan'],
    })
    expect(e2.episode).toMatchObject({ season: 1, episode: 2, name: "Cat's in the Bag..." })
    expect(calls.filter((c) => c.url.pathname === '/3/search/tv')).toHaveLength(1)
  })

  it('does not search again for identified items and caches searches', async () => {
    const { service, calls } = setup()
    await service.identifyPending()
    const count = calls.length
    await service.identifyPending()
    expect(calls.length).toBe(count)
  })

  it('applies a user choice and remembers a rejection', async () => {
    const { service, idOf, onChanged } = setup()
    await service.identifyPending()
    const dune = { fileId: idOf('Dune.mkv') }
    const candidates = await service.candidatesFor(dune)
    expect(candidates.map((c) => c.year).sort()).toEqual([1984, 2021])

    await service.applyMatch(dune, 438631, 'movie')
    expect(service.itemMetadata(dune)).toMatchObject({
      status: 'matched',
      source: 'user',
      metadata: { year: 2021 },
    })
    expect(onChanged).toHaveBeenCalled()

    service.reject({ fileId: idOf('The.Matrix.1999.mkv') })
    expect(service.itemMetadata({ fileId: idOf('The.Matrix.1999.mkv') }).status).toBe('rejected')
    await service.identifyPending()
    expect(service.itemMetadata({ fileId: idOf('The.Matrix.1999.mkv') }).status).toBe('rejected')
  })

  it('stops on network failure without marking items, and retries next time', async () => {
    const failing = setup({
      overrides: {
        '*': () => {
          throw new TypeError('offline')
        },
      },
    })
    await failing.service.identifyPending()
    expect(failing.service.status().lastError).toMatch(/Could not reach api.themoviedb.org/)
    expect(failing.repo.pendingTargets().length).toBe(4) // 3 movies + 1 show still pending
  })

  it('does nothing when lookups are disabled or no token is set', async () => {
    const disabled = setup({ enabled: false })
    await disabled.service.identifyPending()
    expect(disabled.fetchMock).not.toHaveBeenCalled()
    await expect(disabled.service.search({ query: 'x', mediaType: 'movie' })).rejects.toThrow(
      /turned off/,
    )

    const noToken = setup({ token: undefined })
    await noToken.service.identifyPending()
    expect(noToken.fetchMock).not.toHaveBeenCalled()
    expect(await noToken.service.testToken()).toEqual({ ok: false, message: 'No token saved yet.' })
  })

  it('purges cached TMDB data older than six months but keeps match identities', async () => {
    let now = new Date('2026-01-01T00:00:00Z')
    const { repo, service, idOf, db } = setup()
    await service.identifyPending()
    // Pretend the data was fetched long ago and the app is now offline.
    db.prepare("UPDATE metadata_items SET fetched_at = '2025-01-01T00:00:00Z'").run()
    const offline = new MetadataService({
      ...(service as unknown as { options: ConstructorParameters<typeof MetadataService>[0] })
        .options,
      isEnabled: () => false,
      now: () => now,
    })
    await offline.maintainCache()
    const matrix = offline.itemMetadata({ fileId: idOf('The.Matrix.1999.mkv') })
    expect(matrix.status).toBe('matched')
    expect(matrix.metadata).toBeNull()
    expect(repo.getMatch('file', pathKey('C:\\Media\\The.Matrix.1999.mkv'))?.tmdbId).toBe(603)
    now = new Date()
  })
})

describe('library queries with metadata', () => {
  it('show TMDB titles and posters, an Unmatched view, and search by TMDB names', async () => {
    const { db, service } = setup()
    await service.identifyPending()
    const query = new LibraryQueryRepository(db)

    const movies = query.query({ view: 'movies' })
    expect(movies.find((m) => m.fileName === 'The.Matrix.1999.mkv')).toMatchObject({
      matchStatus: 'matched',
      metadataTitle: 'The Matrix',
      metadataYear: 1999,
      posterPath: '/matrix.jpg',
    })
    expect(
      query
        .query({ view: 'unmatched' })
        .map((i) => i.fileName)
        .sort(),
    ).toEqual(['Dune.mkv', 'Unknown Home Video.mkv'])
    expect(query.query({ view: 'all', search: 'Cat' }).map((i) => i.episodeName)).toEqual([
      "Cat's in the Bag...",
    ])
    expect(query.listShows()[0]).toMatchObject({ matchStatus: 'matched', posterPath: '/bb.jpg' })
  })
})

describe('ArtworkCache', () => {
  it('downloads once, serves from disk afterwards, and rejects unsafe paths and types', async () => {
    const dir = tempDir()
    const { fetchMock, http } = setup()
    let online = true
    const cache = new ArtworkCache({ dir, http, canDownload: () => online })

    const first = await cache.get('poster', '/matrix.jpg')
    expect(first?.contentType).toBe('image/jpeg')
    expect(existsSync(join(dir, 'w342', 'matrix.jpg'))).toBe(true)
    const before = fetchMock.mock.calls.length
    await Promise.all([cache.get('poster', '/matrix.jpg'), cache.get('poster', '/matrix.jpg')])
    expect(fetchMock.mock.calls.length).toBe(before)

    online = false
    expect(await cache.get('poster', '/matrix.jpg')).not.toBeNull() // cached copy still served
    expect(await cache.get('poster', '/not-cached.jpg')).toBeNull()

    expect(await cache.get('poster', '/../../secret.jpg')).toBeNull()
    expect(await cache.get('poster', '/logo.svg')).toBeNull()
  })

  it('refuses non-image responses and purges files past the caching limit', async () => {
    const dir = tempDir()
    const { http } = setup({
      overrides: {
        '*': () =>
          new Response('<html>blocked</html>', { headers: { 'content-type': 'text/html' } }),
      },
    })
    const cache = new ArtworkCache({ dir, http, canDownload: () => true })
    expect(await cache.get('poster', '/x.jpg')).toBeNull()
    expect(existsSync(join(dir, 'w342', 'x.jpg'))).toBe(false)

    mkdirSync(join(dir, 'w342'), { recursive: true })
    const old = join(dir, 'w342', 'old.jpg')
    writeFileSync(old, 'x')
    const longAgo = new Date(Date.now() - 200 * 86_400_000)
    utimesSync(old, longAgo, longAgo)
    writeFileSync(join(dir, 'w342', 'new.jpg'), 'x')
    expect(await cache.purgeExpired()).toBe(1)
    expect(existsSync(old)).toBe(false)
    expect(existsSync(join(dir, 'w342', 'new.jpg'))).toBe(true)
  })
})

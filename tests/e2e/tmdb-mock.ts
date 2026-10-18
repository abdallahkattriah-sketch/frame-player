import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

export const GOOD_TOKEN = 'eyJ.e2e-good-token'

// 1×1 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

/** Responses shaped like TMDB v3 (developer.themoviedb.org), keyed by path + sorted query. */
const routes: Record<string, unknown> = {
  '/3/configuration': {
    images: {
      secure_base_url: 'https://image.tmdb.org/t/p/',
      poster_sizes: ['w342'],
      backdrop_sizes: ['w1280'],
      still_sizes: ['w300'],
      profile_sizes: ['w185'],
    },
  },
  '/3/search/movie?query=The Matrix&year=1999': {
    page: 1,
    total_results: 1,
    results: [
      {
        id: 603,
        title: 'The Matrix',
        release_date: '1999-03-30',
        poster_path: '/matrix.png',
        overview: 'Neo.',
      },
    ],
  },
  '/3/search/movie?query=Dune': {
    page: 1,
    total_results: 2,
    results: [
      { id: 841, title: 'Dune', release_date: '1984-12-14', poster_path: null, overview: 'Lynch.' },
      {
        id: 438631,
        title: 'Dune',
        release_date: '2021-09-15',
        poster_path: '/dune.png',
        overview: 'Villeneuve.',
      },
    ],
  },
  '/3/search/tv?query=Dune': {
    page: 1,
    total_results: 1,
    results: [
      {
        id: 90228,
        name: 'Dune: Prophecy',
        first_air_date: '2024-11-17',
        poster_path: null,
        overview: 'The Sisterhood.',
        popularity: 50,
      },
    ],
  },
  '/3/movie/603?append_to_response=credits,external_ids': {
    id: 603,
    title: 'The Matrix',
    release_date: '1999-03-30',
    runtime: 136,
    overview: 'A hacker learns the truth about his reality.',
    genres: [{ name: 'Action' }, { name: 'Science Fiction' }],
    poster_path: '/matrix.png',
    backdrop_path: '/matrix-bg.png',
    vote_average: 8.2,
    vote_count: 25000,
    credits: {
      cast: [{ name: 'Keanu Reeves', character: 'Neo', order: 0 }],
      crew: [{ name: 'Lana Wachowski', job: 'Director' }],
    },
    external_ids: { imdb_id: 'tt0133093' },
  },
  '/3/movie/438631?append_to_response=credits,external_ids': {
    id: 438631,
    title: 'Dune',
    release_date: '2021-09-15',
    poster_path: '/dune.png',
    genres: [{ name: 'Science Fiction' }],
  },
  '/3/search/tv?first_air_date_year=2008&query=Breaking Bad': {
    page: 1,
    total_results: 1,
    results: [
      { id: 1396, name: 'Breaking Bad', first_air_date: '2008-01-20', poster_path: '/bb.png' },
    ],
  },
  '/3/tv/1396?append_to_response=credits,external_ids': {
    id: 1396,
    name: 'Breaking Bad',
    first_air_date: '2008-01-20',
    poster_path: '/bb.png',
    created_by: [{ name: 'Vince Gilligan' }],
  },
  '/3/tv/1396/season/1': {
    episodes: [{ episode_number: 1, season_number: 1, name: 'Pilot', overview: 'Walter White.' }],
  },
}

export interface TmdbMock {
  apiBase: string
  imageBase: string
  requests: string[]
  close: () => Promise<void>
}

export async function startTmdbMock(): Promise<TmdbMock> {
  const requests: string[] = []
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    requests.push(url.pathname)
    if (url.pathname.startsWith('/t/p/')) {
      res.writeHead(200, { 'content-type': 'image/png' })
      res.end(PNG)
      return
    }
    if (req.headers.authorization !== `Bearer ${GOOD_TOKEN}`) {
      res.writeHead(401, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ status_code: 7, status_message: 'Invalid API key' }))
      return
    }
    const params = [...url.searchParams]
      .filter(([k]) => k !== 'language' && k !== 'include_adult')
      .sort(([a], [b]) => a.localeCompare(b))
    const key =
      url.pathname + (params.length ? `?${params.map(([k, v]) => `${k}=${v}`).join('&')}` : '')
    const body = routes[key]
    res.writeHead(body ? 200 : 404, { 'content-type': 'application/json' })
    res.end(JSON.stringify(body ?? { status_code: 34, status_message: 'Not found' }))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    apiBase: `http://127.0.0.1:${port}/3`,
    imageBase: `http://127.0.0.1:${port}/t/p/`,
    requests,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  }
}

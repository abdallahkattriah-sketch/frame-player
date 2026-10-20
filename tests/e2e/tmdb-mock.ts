import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

export const GOOD_TOKEN = 'eyJ.e2e-good-token'

// 1×1 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

/** Responses shaped like TMDB v3 (developer.themoviedb.org), keyed by path + sorted query. */
/** YYYY-MM-DD, `offset` days from today (local time). */
function day(offset: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

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
      cast: [{ id: 6384, name: 'Keanu Reeves', character: 'Neo', order: 0 }],
      crew: [{ id: 9340, name: 'Lana Wachowski', job: 'Director', department: 'Directing' }],
    },
    external_ids: { imdb_id: 'tt0133093' },
  },
  '/3/person/6384?append_to_response=combined_credits': {
    id: 6384,
    name: 'Keanu Reeves',
    biography: 'Canadian actor.',
    birthday: '1964-09-02',
    known_for_department: 'Acting',
    profile_path: '/keanu.png',
    combined_credits: {
      cast: [
        {
          id: 603,
          media_type: 'movie',
          title: 'The Matrix',
          release_date: '1999-03-30',
          character: 'Neo',
        },
        {
          id: 7001,
          media_type: 'movie',
          title: 'Far Future',
          release_date: '2099-01-01',
          character: 'Lead',
        },
        {
          id: 7002,
          media_type: 'movie',
          title: 'Soon Movie',
          release_date: day(10),
          character: 'Hero',
        },
        {
          id: 7003,
          media_type: 'movie',
          title: 'Fresh Movie',
          release_date: day(-5),
          character: 'Pilot',
        },
      ],
      crew: [],
    },
  },
  // Radar: Egypt lists a cinema date for one title; the other has only US dates.
  '/3/movie/7002/release_dates': {
    results: [
      { iso_3166_1: 'EG', release_dates: [{ type: 3, release_date: `${day(10)}T00:00:00.000Z` }] },
    ],
  },
  '/3/movie/7003/release_dates': {
    results: [
      {
        iso_3166_1: 'US',
        release_dates: [
          { type: 3, release_date: `${day(-5)}T00:00:00.000Z` },
          { type: 4, release_date: `${day(20)}T00:00:00.000Z` },
        ],
      },
    ],
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

/** Trending and top lists: a few titles each, with posters and backdrops. */
const movie = (id: number, title: string, year: number) => ({
  id,
  title,
  release_date: `${year}-05-01`,
  poster_path: `/p${id}.png`,
  backdrop_path: `/b${id}.png`,
  overview: `${title} overview.`,
  vote_average: 7.5,
  vote_count: 1000,
})
const show = (id: number, name: string, year: number) => ({
  id,
  name,
  first_air_date: `${year}-01-01`,
  poster_path: `/p${id}.png`,
  backdrop_path: `/b${id}.png`,
  overview: `${name} overview.`,
  vote_average: 8.1,
  vote_count: 500,
})
const listPage = (results: unknown[]) => ({ page: 1, total_results: results.length, results })
const movies = [
  movie(603, 'The Matrix', 1999),
  movie(7001, 'Arrival Day', 2026),
  movie(7002, 'Quiet Harbor', 2026),
]
const shows = [show(1396, 'Breaking Bad', 2008), show(8001, 'Night Shift', 2026)]
const tagged = [
  ...movies.map((m) => ({ ...m, media_type: 'movie' })),
  { id: 31, media_type: 'person', name: 'Somebody' },
  ...shows.map((t) => ({ ...t, media_type: 'tv' })),
]
Object.assign(routes, {
  '/3/trending/all/day': listPage(tagged),
  '/3/trending/all/week': listPage(tagged),
  '/3/trending/movie/week': listPage(movies),
  '/3/trending/tv/week': listPage(shows),
  '/3/movie/now_playing': listPage(movies.slice(1)),
  '/3/movie/upcoming': listPage(movies.slice(1)),
  '/3/movie/popular': listPage(movies),
  '/3/movie/top_rated': listPage(movies),
  '/3/tv/airing_today': listPage(shows),
  '/3/tv/on_the_air': listPage(shows),
  '/3/tv/popular': listPage(shows),
  '/3/tv/top_rated': listPage(shows),
})

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

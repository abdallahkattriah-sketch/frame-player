import type { z } from 'zod'
import type { MetadataMediaType, TmdbListId } from '@shared/contracts/metadata'
import { HttpError, type HttpClient } from '../../network/http-client'
import {
  configurationSchema,
  listSchema,
  movieDetailsSchema,
  movieSearchSchema,
  seasonDetailsSchema,
  tvDetailsSchema,
  tvSearchSchema,
  type TmdbConfiguration,
  type TmdbListItem,
  type TmdbMovieDetails,
  type TmdbMovieResult,
  type TmdbSeasonDetails,
  type TmdbTvDetails,
  type TmdbTvResult,
} from './tmdb-schemas'

export const TMDB_API_BASE = 'https://api.themoviedb.org/3'

/** Endpoint per list, and the media type of its items when the endpoint does not say. */
export const TMDB_LISTS: Record<TmdbListId, { path: string; mediaType: MetadataMediaType | null }> =
  {
    'trending-today': { path: '/trending/all/day', mediaType: null },
    'trending-week': { path: '/trending/all/week', mediaType: null },
    'trending-movies': { path: '/trending/movie/week', mediaType: 'movie' },
    'trending-shows': { path: '/trending/tv/week', mediaType: 'tv' },
    'movies-now-playing': { path: '/movie/now_playing', mediaType: 'movie' },
    'movies-upcoming': { path: '/movie/upcoming', mediaType: 'movie' },
    'movies-popular': { path: '/movie/popular', mediaType: 'movie' },
    'movies-top-rated': { path: '/movie/top_rated', mediaType: 'movie' },
    'shows-airing-today': { path: '/tv/airing_today', mediaType: 'tv' },
    'shows-on-the-air': { path: '/tv/on_the_air', mediaType: 'tv' },
    'shows-popular': { path: '/tv/popular', mediaType: 'tv' },
    'shows-top-rated': { path: '/tv/top_rated', mediaType: 'tv' },
  }

export class TmdbNotConfiguredError extends Error {
  constructor() {
    super('Add a TMDB API Read Access Token in Settings to look up movie and show details.')
    this.name = 'TmdbNotConfiguredError'
  }
}

export interface TmdbClientOptions {
  http: HttpClient
  /** Read on every request so a changed token takes effect immediately. */
  getToken: () => string | undefined
  /** e.g. "en-US". */
  getLanguage: () => string
  /** Test seam: a local mock server in development builds only. */
  apiBase?: string
}

/** A v3 API key is 32 hex characters; anything else is treated as a v4 Read Access Token. */
export function isV3ApiKey(token: string): boolean {
  return /^[a-f0-9]{32}$/i.test(token)
}

/**
 * Thin client for the TMDB v3 endpoints Frame uses. TMDB only identifies local files and
 * supplies descriptive metadata and artwork; it is never a source of video.
 */
export class TmdbClient {
  constructor(private readonly options: TmdbClientOptions) {}

  get configured(): boolean {
    return Boolean(this.options.getToken())
  }

  configuration(signal?: AbortSignal): Promise<TmdbConfiguration> {
    return this.get('/configuration', {}, configurationSchema, signal, false)
  }

  async searchMovies(
    query: string,
    year: number | undefined,
    signal?: AbortSignal,
  ): Promise<TmdbMovieResult[]> {
    const params: Record<string, string> = { query, include_adult: 'false' }
    if (year !== undefined) params['year'] = String(year)
    return (await this.get('/search/movie', params, movieSearchSchema, signal)).results
  }

  async searchTv(
    query: string,
    firstAirYear: number | undefined,
    signal?: AbortSignal,
  ): Promise<TmdbTvResult[]> {
    const params: Record<string, string> = { query, include_adult: 'false' }
    if (firstAirYear !== undefined) params['first_air_date_year'] = String(firstAirYear)
    return (await this.get('/search/tv', params, tvSearchSchema, signal)).results
  }

  /** First page (20 items) of a trending or curated list. */
  async list(id: TmdbListId, signal?: AbortSignal): Promise<TmdbListItem[]> {
    return (await this.get(TMDB_LISTS[id].path, {}, listSchema, signal)).results
  }

  movieDetails(id: number, signal?: AbortSignal): Promise<TmdbMovieDetails> {
    return this.get(
      `/movie/${id}`,
      { append_to_response: 'credits,external_ids' },
      movieDetailsSchema,
      signal,
    )
  }

  tvDetails(id: number, signal?: AbortSignal): Promise<TmdbTvDetails> {
    return this.get(
      `/tv/${id}`,
      { append_to_response: 'credits,external_ids' },
      tvDetailsSchema,
      signal,
    )
  }

  seasonDetails(id: number, season: number, signal?: AbortSignal): Promise<TmdbSeasonDetails> {
    return this.get(`/tv/${id}/season/${season}`, {}, seasonDetailsSchema, signal)
  }

  private async get<S extends z.ZodType>(
    path: string,
    params: Record<string, string>,
    schema: S,
    signal: AbortSignal | undefined,
    localized = true,
  ): Promise<z.infer<S>> {
    const token = this.options.getToken()
    if (!token) throw new TmdbNotConfiguredError()
    const url = new URL((this.options.apiBase ?? TMDB_API_BASE) + path)
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    if (localized) url.searchParams.set('language', this.options.getLanguage())

    // Both credential types give the same access (developer.themoviedb.org/docs/authentication-application).
    const headers: Record<string, string> = {}
    if (isV3ApiKey(token)) url.searchParams.set('api_key', token)
    else headers['Authorization'] = `Bearer ${token}`

    try {
      return await this.options.http.getJson(url, schema, { headers, signal })
    } catch (error) {
      if (error instanceof HttpError && error.kind === 'unauthorized') {
        throw new HttpError(
          'unauthorized',
          'TMDB rejected the token. Check it in Settings.',
          error.status,
        )
      }
      throw error
    }
  }
}

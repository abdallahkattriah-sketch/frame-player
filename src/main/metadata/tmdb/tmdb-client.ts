import type { z } from 'zod'
import { HttpError, type HttpClient } from '../../network/http-client'
import {
  configurationSchema,
  movieDetailsSchema,
  movieSearchSchema,
  seasonDetailsSchema,
  tvDetailsSchema,
  tvSearchSchema,
  type TmdbConfiguration,
  type TmdbMovieDetails,
  type TmdbMovieResult,
  type TmdbSeasonDetails,
  type TmdbTvDetails,
  type TmdbTvResult,
} from './tmdb-schemas'

export const TMDB_API_BASE = 'https://api.themoviedb.org/3'

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

import { z } from 'zod'
import { languageLabel, normalizeLanguage } from '@shared/constants/languages'
import type { ProviderCapabilities } from '@shared/contracts/subtitles'
import { HttpError, type HttpClient } from '../../network/http-client'
import { SUBTITLE_EXTENSIONS } from '../subtitle-content'
import { isZip, readZip } from '../zip-reader'
import {
  ProviderNotConfiguredError,
  type DownloadedSubtitle,
  type ProviderCheck,
  type RawSubtitleResult,
  type SubtitleProvider,
  type SubtitleSearchContext,
} from '../provider'

// SubSource API v1, verified against subsource.net/api-docs (2026-10-17). The docs give
// parameters and example responses; the language list is not published, so languages are
// sent as lowercase English names (as in the docs' examples) and checked on the way back.
const DEFAULT_ORIGIN = 'https://api.subsource.net'
const MAX_ARCHIVE_BYTES = 20 * 1024 * 1024

const movieSchema = z.object({
  movieId: z.number(),
  title: z.string().nullish(),
  type: z.string().nullish(),
  releaseYear: z.number().nullish(),
  imdbId: z.string().nullish(),
  tmdbId: z.union([z.string(), z.number()]).nullish(),
  season: z.number().nullish(),
})
const movieSearchSchema = z.object({ success: z.boolean(), data: z.array(movieSchema) })

const subtitleSchema = z.object({
  subtitleId: z.number(),
  language: z.string().nullish(),
  releaseInfo: z.array(z.string()).nullish(),
  hearingImpaired: z.boolean().nullish(),
  foreignParts: z.boolean().nullish(),
  framerate: z.string().nullish(),
  downloads: z.number().nullish(),
  rating: z.object({ good: z.number(), bad: z.number(), total: z.number() }).nullish(),
  createdAt: z.string().nullish(),
})
const subtitlesSchema = z.object({ success: z.boolean(), data: z.array(subtitleSchema) })

export interface SubSourceOptions {
  http: HttpClient
  getApiKey: () => string | undefined
  /** Test seam (development builds only). */
  baseOrigin?: string
}

/** "english", "brazilian portuguese" … from a Frame language code. */
export function subsourceLanguageName(code: string): string {
  return languageLabel(code)
    .toLowerCase()
    .replace(/\s*\((simplified|traditional)\)/, '')
}

function episodeFromRelease(releases: readonly string[]): {
  season: number | null
  episode: number | null
} {
  for (const r of releases) {
    const m = /s(\d{1,2})[ ._-]?e(\d{1,4})/i.exec(r) ?? /\b(\d{1,2})x(\d{2,4})\b/.exec(r)
    if (m?.[1] && m[2]) return { season: Number(m[1]), episode: Number(m[2]) }
  }
  return { season: null, episode: null }
}

export class SubSourceProvider implements SubtitleProvider {
  readonly id = 'subsource' as const
  readonly name = 'SubSource'

  constructor(private readonly options: SubSourceOptions) {}

  getCapabilities(): ProviderCapabilities {
    return {
      byImdbId: true,
      byTmdbId: false,
      byFileHash: false,
      episodeFilter: false,
      hearingImpairedFilter: true,
      downloadQuota: false,
    }
  }

  isConfigured(): boolean {
    return Boolean(this.options.getApiKey())
  }

  async validateConfiguration(signal?: AbortSignal): Promise<ProviderCheck> {
    try {
      await this.get('/movies/search', { searchType: 'text', q: 'test' }, movieSearchSchema, signal)
      return { ok: true, message: 'API key accepted.' }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) }
    }
  }

  describeSearch(c: SubtitleSearchContext): string {
    const lookup = c.imdbId
      ? `imdb=${c.imdbId}`
      : `title="${c.title ?? c.fileName}"${c.year ? `, year=${c.year}` : ''}`
    return `SubSource: ${lookup}${c.season !== null ? `, season=${c.season}` : ''}, languages=${c.languages.map(subsourceLanguageName).join('/')}`
  }

  async searchSubtitles(
    c: SubtitleSearchContext,
    signal?: AbortSignal,
  ): Promise<RawSubtitleResult[]> {
    const movie = await this.findTitle(c, signal)
    if (!movie) return []

    const results: RawSubtitleResult[] = []
    for (const code of c.languages) {
      const params: Record<string, string> = {
        movieId: String(movie.movieId),
        language: subsourceLanguageName(code),
        limit: '100',
      }
      if (c.hearingImpaired === 'exclude') params['hearingImpaired'] = 'false'
      if (c.hearingImpaired === 'only') params['hearingImpaired'] = 'true'
      const response = await this.get('/subtitles', params, subtitlesSchema, signal)
      for (const s of response.data) {
        // Keep only results in the requested language, whatever label the API used.
        const language = normalizeLanguage(s.language) ?? null
        if (language && language !== code && language.split('-')[0] !== code.split('-')[0]) continue
        const releases = s.releaseInfo ?? []
        const { season, episode } = episodeFromRelease(releases)
        const rating =
          s.rating && s.rating.total > 0 ? `${s.rating.good} good, ${s.rating.bad} bad` : null
        const fps = s.framerate ? Number(s.framerate) : NaN
        results.push({
          provider: 'subsource',
          id: String(s.subtitleId),
          language: language ?? code,
          releaseName: releases.length > 0 ? releases.join(' | ') : null,
          fileName: null,
          format: null,
          downloads: s.downloads ?? null,
          ratingLabel: rating,
          hearingImpaired: s.hearingImpaired ?? null,
          forced: s.foreignParts ?? null,
          fps: Number.isFinite(fps) && fps > 0 ? fps : null,
          hashMatch: null,
          machineTranslated: null,
          aiTranslated: null,
          trustedUploader: null,
          uploadedAt: s.createdAt ?? null,
          season: season ?? movie.season ?? null,
          episode,
          matchedImdbId: movie.imdbId ?? null,
          matchedTmdbId: movie.tmdbId ? Number(movie.tmdbId) || null : null,
        })
      }
    }
    return results
  }

  async downloadSubtitle(resultId: string, signal?: AbortSignal): Promise<DownloadedSubtitle> {
    if (!/^\d+$/.test(resultId)) throw new Error('Invalid subtitle id.')
    const apiKey = this.options.getApiKey()
    if (!apiKey) throw new ProviderNotConfiguredError(this.name, 'an API key')
    const url = new URL(
      `${this.options.baseOrigin ?? DEFAULT_ORIGIN}/api/v1/subtitles/${resultId}/download`,
    )
    const { bytes } = await this.options.http.getBytes(url, {
      maxBytes: MAX_ARCHIVE_BYTES,
      signal,
      headers: { 'X-API-Key': apiKey },
    })
    if (isZip(bytes)) {
      const files = readZip(bytes, (name) =>
        (SUBTITLE_EXTENSIONS as readonly string[]).includes(
          name.split('.').pop()?.toLowerCase() ?? '',
        ),
      )
      if (files.length === 0) throw new Error('The SubSource archive contains no subtitle files.')
      return { files }
    }
    return { files: [{ name: `${resultId}.srt`, bytes }] }
  }

  async dispose(): Promise<void> {}

  /** Finds SubSource's entry for this title: by IMDb id when known, otherwise by text. */
  private async findTitle(c: SubtitleSearchContext, signal?: AbortSignal) {
    const type = c.kind === 'episode' ? 'series' : c.kind === 'movie' ? 'movie' : 'all'
    const params: Record<string, string> = c.imdbId
      ? { searchType: 'imdb', imdb: c.imdbId }
      : { searchType: 'text', q: c.title ?? c.fileName, type }
    if (!c.imdbId && c.year && c.kind === 'movie') params['year'] = String(c.year)
    if (c.kind === 'episode' && c.season !== null) params['season'] = String(c.season)
    const { data } = await this.get('/movies/search', params, movieSearchSchema, signal)
    const candidates = data.filter((m) =>
      c.kind === 'episode' ? m.season === c.season || m.season == null : true,
    )
    return candidates[0] ?? null
  }

  private async get<S extends z.ZodType>(
    path: string,
    params: Record<string, string>,
    schema: S,
    signal?: AbortSignal,
  ): Promise<z.infer<S>> {
    const apiKey = this.options.getApiKey()
    if (!apiKey) throw new ProviderNotConfiguredError(this.name, 'an API key')
    const url = new URL(`${this.options.baseOrigin ?? DEFAULT_ORIGIN}/api/v1${path}`)
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    try {
      return await this.options.http.getJson(url, schema, {
        headers: { 'X-API-Key': apiKey },
        signal,
      })
    } catch (error) {
      if (error instanceof HttpError && error.status === 403) {
        throw new HttpError(
          'unauthorized',
          'SubSource denied access for this API key (your plan may not include this).',
          403,
        )
      }
      if (error instanceof HttpError && error.kind === 'unauthorized') {
        throw new HttpError(
          'unauthorized',
          'SubSource rejected the API key. Check it in Settings.',
          error.status,
        )
      }
      throw error
    }
  }
}

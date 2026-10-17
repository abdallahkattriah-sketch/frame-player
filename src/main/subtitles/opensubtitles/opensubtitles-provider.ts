import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { ProviderCapabilities } from '@shared/contracts/subtitles'
import { HttpError, type HttpClient, type RequestOptions } from '../../network/http-client'
import { MAX_SUBTITLE_BYTES } from '../subtitle-content'
import {
  ProviderNotConfiguredError,
  type DownloadedSubtitle,
  type ProviderCheck,
  type RawSubtitleResult,
  type SubtitleProvider,
  type SubtitleSearchContext,
} from '../provider'

// OpenSubtitles REST API v1, verified against the official OpenAPI spec
// (opensubtitles.stoplight.io, 2026-10-17). The legacy XML-RPC API is not used.
const DEFAULT_HOST = 'api.opensubtitles.com'

const loginSchema = z.object({
  token: z.string().min(1),
  base_url: z.string().min(1),
  user: z.object({ allowed_downloads: z.number(), vip: z.boolean().optional() }).passthrough(),
})

const subtitleItemSchema = z.object({
  id: z.string(),
  attributes: z.object({
    language: z.string().nullish(),
    download_count: z.number().nullish(),
    hearing_impaired: z.boolean().nullish(),
    foreign_parts_only: z.boolean().nullish(),
    fps: z.number().nullish(),
    ratings: z.number().nullish(),
    votes: z.number().nullish(),
    from_trusted: z.boolean().nullish(),
    ai_translated: z.boolean().nullish(),
    machine_translated: z.boolean().nullish(),
    upload_date: z.string().nullish(),
    release: z.string().nullish(),
    moviehash_match: z.boolean().nullish(),
    feature_details: z
      .object({
        imdb_id: z.number().nullish(),
        tmdb_id: z.number().nullish(),
        parent_imdb_id: z.number().nullish(),
        parent_tmdb_id: z.number().nullish(),
        season_number: z.number().nullish(),
        episode_number: z.number().nullish(),
      })
      .nullish(),
    files: z.array(z.object({ file_id: z.number(), file_name: z.string().nullish() })),
  }),
})

const searchSchema = z.object({ data: z.array(subtitleItemSchema) })

const downloadSchema = z.object({
  link: z.string().url(),
  file_name: z.string().nullish(),
  remaining: z.number().nullish(),
  reset_time_utc: z.string().nullish(),
})

const formatsSchema = z.object({ data: z.object({ output_formats: z.array(z.string()) }) })

export interface OpenSubtitlesOptions {
  http: HttpClient
  getApiKey: () => string | undefined
  getUsername: () => string | undefined
  getPassword: () => string | undefined
  /** Sent as the User-Agent, e.g. "Frame v0.1.0" (required by OpenSubtitles). */
  userAgent: string
  /** Test seam (development builds only), e.g. "http://127.0.0.1:1234". */
  baseOrigin?: string
  now?: () => number
}

function stripImdb(id: string | null): string | null {
  const m = id ? /^tt0*(\d+)$/.exec(id) : null
  return m?.[1] ?? null
}

export class OpenSubtitlesProvider implements SubtitleProvider {
  readonly id = 'opensubtitles' as const
  readonly name = 'OpenSubtitles'
  private token: string | null = null
  private host = DEFAULT_HOST
  private login: Promise<string | null> | null = null
  /** Credentials that were rejected; never retried until they change. */
  private rejectedCredentials: string | null = null
  private lastLoginAt = Number.NEGATIVE_INFINITY

  constructor(private readonly options: OpenSubtitlesOptions) {}

  getCapabilities(): ProviderCapabilities {
    return {
      byImdbId: true,
      byTmdbId: true,
      byFileHash: true,
      episodeFilter: true,
      hearingImpairedFilter: true,
      downloadQuota: true,
    }
  }

  isConfigured(): boolean {
    return Boolean(this.options.getApiKey())
  }

  async validateConfiguration(signal?: AbortSignal): Promise<ProviderCheck> {
    try {
      if (this.hasAccount()) {
        const token = await this.ensureLogin(signal, true)
        if (!token)
          return { ok: false, message: 'OpenSubtitles rejected the username or password.' }
        return { ok: true, message: 'Signed in to OpenSubtitles.', quota: this.quota }
      }
      await this.request('/infos/formats', formatsSchema, { signal })
      return {
        ok: true,
        message:
          'API key accepted. Without an account, OpenSubtitles allows only a few downloads per day.',
      }
    } catch (error) {
      return { ok: false, message: this.describe(error) }
    }
  }

  describeSearch(c: SubtitleSearchContext): string {
    return `OpenSubtitles: ${this.searchParams(c)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ')}`
  }

  async searchSubtitles(
    c: SubtitleSearchContext,
    signal?: AbortSignal,
  ): Promise<RawSubtitleResult[]> {
    const params = this.searchParams(c)
    const response = await this.request(`/subtitles?${new URLSearchParams(params)}`, searchSchema, {
      signal,
    })
    return response.data.flatMap((item): RawSubtitleResult[] => {
      const a = item.attributes
      const file = a.files[0]
      if (!file) return []
      const fd = a.feature_details
      const votes = a.votes ?? 0
      return [
        {
          provider: 'opensubtitles',
          id: String(file.file_id),
          language: a.language ?? null,
          releaseName: a.release ?? null,
          fileName: file.file_name ?? null,
          format: null,
          downloads: a.download_count ?? null,
          ratingLabel:
            votes > 0 && a.ratings !== null && a.ratings !== undefined
              ? `${a.ratings.toFixed(1)}/10 from ${votes} ${votes === 1 ? 'vote' : 'votes'}`
              : null,
          hearingImpaired: a.hearing_impaired ?? null,
          forced: a.foreign_parts_only ?? null,
          fps: a.fps ? a.fps : null,
          hashMatch: c.movieHash ? (a.moviehash_match ?? false) : null,
          machineTranslated: a.machine_translated ?? null,
          aiTranslated: a.ai_translated ?? null,
          trustedUploader: a.from_trusted ?? null,
          uploadedAt: a.upload_date ?? null,
          season: fd?.season_number ?? null,
          episode: fd?.episode_number ?? null,
          matchedImdbId:
            (fd?.parent_imdb_id ?? fd?.imdb_id) ? `tt${fd?.parent_imdb_id ?? fd?.imdb_id}` : null,
          matchedTmdbId: fd?.parent_tmdb_id ?? fd?.tmdb_id ?? null,
        },
      ]
    })
  }

  async downloadSubtitle(resultId: string, signal?: AbortSignal): Promise<DownloadedSubtitle> {
    const fileId = Number(resultId)
    if (!Number.isInteger(fileId) || fileId <= 0) throw new Error('Invalid subtitle id.')
    const token = this.hasAccount() ? await this.ensureLogin(signal) : null
    let link
    try {
      link = await this.request('/download', downloadSchema, {
        method: 'POST',
        json: { file_id: fileId },
        signal,
        auth: token,
      })
    } catch (error) {
      if (error instanceof HttpError && (error.status === 406 || error.status === 403)) {
        throw new Error(
          'OpenSubtitles refused the download. You may have reached your download limit; sign in with an account in Settings for more downloads.',
          { cause: error },
        )
      }
      throw error
    }
    this.quota = { remaining: link.remaining ?? 0, resetsAt: link.reset_time_utc ?? null }
    // The temporary link is used once and never stored. It needs no credentials.
    const { bytes } = await this.options.http.getBytes(new URL(link.link), {
      maxBytes: MAX_SUBTITLE_BYTES,
      signal,
    })
    return { files: [{ name: link.file_name ?? `${fileId}.srt`, bytes }], quota: this.quota }
  }

  quota: { remaining: number; resetsAt: string | null } | null = null

  async dispose(): Promise<void> {
    if (!this.token) return
    // Requested by the API's best practices: free the session when done.
    await this.request('/logout', z.unknown(), { method: 'DELETE', auth: this.token }).catch(
      () => undefined,
    )
    this.token = null
  }

  // ── internals ─────────────────────────────────────────────────────────────

  /** Parameters sorted, lowercase, without defaults (avoids redirects, per the API docs). */
  private searchParams(c: SubtitleSearchContext): [string, string][] {
    const p: Record<string, string> = {}
    p['languages'] = [...new Set(c.languages.map((l) => l.toLowerCase()))].sort().join(',')
    if (c.movieHash) p['moviehash'] = c.movieHash
    if (c.hearingImpaired !== 'include') p['hearing_impaired'] = c.hearingImpaired
    const imdb = stripImdb(c.imdbId)
    if (c.kind === 'episode') {
      p['type'] = 'episode'
      if (c.tmdbId) p['parent_tmdb_id'] = String(c.tmdbId)
      else if (imdb) p['parent_imdb_id'] = imdb
      else if (c.title) p['query'] = c.title.toLowerCase()
      if (c.season !== null) p['season_number'] = String(c.season)
      if (c.episode !== null) p['episode_number'] = String(c.episode)
    } else {
      if (c.kind === 'movie') p['type'] = 'movie'
      if (c.tmdbId) p['tmdb_id'] = String(c.tmdbId)
      else if (imdb) p['imdb_id'] = imdb
      else {
        p['query'] = (c.title ?? c.fileName).toLowerCase()
        if (c.year) p['year'] = String(c.year)
      }
    }
    return Object.entries(p).sort(([a], [b]) => a.localeCompare(b))
  }

  private hasAccount(): boolean {
    return Boolean(this.options.getUsername() && this.options.getPassword())
  }

  private credentialFingerprint(): string {
    return createHash('sha256')
      .update(`${this.options.getUsername() ?? ''}\u0000${this.options.getPassword() ?? ''}`)
      .digest('hex')
  }

  /** Logs in once per session; rejected credentials are never retried (API requirement). */
  private ensureLogin(signal?: AbortSignal, force = false): Promise<string | null> {
    const fingerprint = this.credentialFingerprint()
    if (this.rejectedCredentials === fingerprint) return Promise.resolve(null)
    if (this.token && !force) return Promise.resolve(this.token)
    if (this.login) return this.login
    this.login = (async () => {
      // Login is limited to 1 request per second.
      const now = this.options.now?.() ?? Date.now()
      const wait = 1000 - (now - this.lastLoginAt)
      if (wait > 0) await new Promise((r) => setTimeout(r, wait))
      this.lastLoginAt = this.options.now?.() ?? Date.now()
      try {
        const result = await this.request('/login', loginSchema, {
          method: 'POST',
          json: { username: this.options.getUsername(), password: this.options.getPassword() },
          signal,
          host: DEFAULT_HOST,
        })
        this.token = result.token
        // Further requests must use the returned host (e.g. the VIP server).
        if (/^[a-z0-9.-]+\.opensubtitles\.com$/i.test(result.base_url)) this.host = result.base_url
        this.quota = { remaining: result.user.allowed_downloads, resetsAt: null }
        return this.token
      } catch (error) {
        if (error instanceof HttpError && error.kind === 'unauthorized') {
          this.rejectedCredentials = fingerprint
          this.token = null
          return null
        }
        throw error
      } finally {
        this.login = null
      }
    })()
    return this.login
  }

  private async request<S extends z.ZodType>(
    path: string,
    schema: S,
    options: Omit<RequestOptions, 'headers'> & { auth?: string | null; host?: string },
  ): Promise<z.infer<S>> {
    const apiKey = this.options.getApiKey()
    if (!apiKey) throw new ProviderNotConfiguredError(this.name, 'an API key')
    const origin = this.options.baseOrigin ?? `https://${options.host ?? this.host}`
    const headers: Record<string, string> = {
      'Api-Key': apiKey,
      'User-Agent': this.options.userAgent,
    }
    if (options.auth) headers['Authorization'] = `Bearer ${options.auth}`
    try {
      return await this.options.http.getJson(new URL(`${origin}/api/v1${path}`), schema, {
        ...options,
        headers,
      })
    } catch (error) {
      if (error instanceof HttpError && error.kind === 'unauthorized' && path !== '/login') {
        throw new HttpError(
          'unauthorized',
          'OpenSubtitles rejected the API key. Check it in Settings.',
          error.status,
        )
      }
      throw error
    }
  }

  private describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
  }
}

import { mkdir, rename, stat, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import type {
  ProviderStatus,
  SubtitleDownload,
  SubtitleDownloadResult,
  SubtitleProviderId,
  SubtitleSearch,
  SubtitleSearchResponse,
  SubtitleTarget,
} from '@shared/contracts/subtitles'
import { HttpError } from '../network/http-client'
import { computeMovieHash } from './movie-hash'
import type { SubtitleProvider, SubtitleSearchContext } from './provider'
import { rankResults } from './subtitle-ranking'
import { decodeSubtitle, fallbackEncodingFor } from './subtitle-content'

export interface ResolvedTarget {
  videoPath: string
  title: string | null
  year: number | null
  kind: 'movie' | 'episode' | 'unknown'
  season: number | null
  episode: number | null
  tmdbId: number | null
  imdbId: string | null
}

export interface SubtitleServiceOptions {
  providers: readonly SubtitleProvider[]
  /** Online subtitle access allowed (privacy setting). */
  isOnline: () => boolean
  isProviderEnabled: (id: SubtitleProviderId) => boolean
  /** User agreed to send file hashes to providers that use them. */
  allowFileHash: () => boolean
  /** Directory to save a downloaded subtitle for `videoPath`. */
  saveDirFor: (videoPath: string) => string
  resolveTarget: (target: SubtitleTarget) => ResolvedTarget | undefined
  /** Loads the file into the player if `videoPath` is what is playing; returns whether it did. */
  addToPlayer: (
    videoPath: string,
    subtitlePath: string,
    language: string | null,
  ) => Promise<boolean>
  onStatus?: (statuses: ProviderStatus[]) => void
}

function message(error: unknown): string {
  if (error instanceof HttpError && error.kind === 'cancelled') return 'Cancelled.'
  return error instanceof Error ? error.message : String(error)
}

/** Characters Windows does not allow in file names. */
function safeFileBase(name: string): string {
  // Control characters are deliberately matched: they are invalid in Windows file names.
  // eslint-disable-next-line no-control-regex
  return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/, '') || 'subtitle'
}

export class SubtitleService {
  private readonly checks = new Map<SubtitleProviderId, { ok: boolean; message: string }>()
  private search: AbortController | null = null
  private download: AbortController | null = null

  constructor(private readonly options: SubtitleServiceOptions) {}

  statuses(): ProviderStatus[] {
    return this.options.providers.map((p) => {
      const check = this.checks.get(p.id)
      const quota = 'quota' in p ? ((p as { quota: ProviderStatus['quota'] }).quota ?? null) : null
      return {
        id: p.id,
        name: p.name,
        enabled: this.options.isProviderEnabled(p.id),
        configured: p.isConfigured(),
        ok: check?.ok ?? null,
        message: check?.message ?? null,
        quota,
        capabilities: p.getCapabilities(),
      }
    })
  }

  async validate(id: SubtitleProviderId): Promise<ProviderStatus[]> {
    const provider = this.provider(id)
    if (!this.options.isOnline()) {
      this.checks.set(id, {
        ok: false,
        message: 'Online subtitle search is turned off in Settings.',
      })
    } else if (!provider.isConfigured()) {
      this.checks.set(id, { ok: false, message: 'Not set up yet.' })
    } else {
      const result = await provider.validateConfiguration()
      this.checks.set(id, { ok: result.ok, message: result.message })
    }
    this.emit()
    return this.statuses()
  }

  /** Searches every requested provider independently; one failing never hides the others. */
  async searchSubtitles(request: SubtitleSearch): Promise<SubtitleSearchResponse> {
    if (!this.options.isOnline()) {
      return {
        results: [],
        errors: request.providers.map((provider) => ({
          provider,
          message: 'Online subtitle search is turned off in Settings › Privacy.',
        })),
        sent: [],
      }
    }
    const target = this.options.resolveTarget(request.target)
    if (!target) throw new Error('That video is no longer available.')

    this.search?.abort()
    const controller = new AbortController()
    this.search = controller

    const providers = request.providers.map((id) => this.provider(id))
    const usesHash = providers.some(
      (p) => p.getCapabilities().byFileHash && this.options.isProviderEnabled(p.id),
    )
    const movieHash =
      usesHash && this.options.allowFileHash()
        ? await computeMovieHash(target.videoPath).catch(() => null)
        : null

    const context: SubtitleSearchContext = {
      fileName: basename(target.videoPath),
      title: request.query || target.title,
      year: request.query ? null : target.year,
      kind: target.kind,
      season: request.season ?? target.season,
      episode: request.episode ?? target.episode,
      // A manual query replaces ID-based lookup, since the user is correcting it.
      tmdbId: request.query ? null : target.tmdbId,
      imdbId: request.query ? null : target.imdbId,
      movieHash,
      languages: request.languages,
      hearingImpaired: request.hearingImpaired,
    }

    const response: SubtitleSearchResponse = { results: [], errors: [], sent: [] }
    const settled = await Promise.allSettled(
      providers.map(async (provider) => {
        if (!this.options.isProviderEnabled(provider.id))
          throw new Error(`${provider.name} is turned off in Settings.`)
        if (!provider.isConfigured())
          throw new Error(
            `${provider.name} is not set up yet. Add its API key in Settings › Subtitles.`,
          )
        response.sent.push({ provider: provider.id, summary: provider.describeSearch(context) })
        return provider.searchSubtitles(context, controller.signal)
      }),
    )
    settled.forEach((outcome, i) => {
      const provider = providers[i] as SubtitleProvider
      if (outcome.status === 'fulfilled') {
        response.results.push(...rankResults(context, outcome.value))
        this.checks.set(provider.id, { ok: true, message: 'Last search succeeded.' })
      } else {
        const text = message(outcome.reason)
        response.errors.push({ provider: provider.id, message: text })
        this.checks.set(provider.id, { ok: false, message: text })
      }
    })
    response.results.sort((a, b) => b.confidence - a.confidence)
    if (this.search === controller) this.search = null
    this.emit()
    return response
  }

  /**
   * Downloads, validates, converts to UTF-8, and saves a subtitle next to the video (or in the
   * subtitle folder). Never overwrites an existing file unless the user confirmed it.
   */
  async downloadSubtitle(request: SubtitleDownload): Promise<SubtitleDownloadResult> {
    if (!this.options.isOnline())
      throw new Error('Online subtitle search is turned off in Settings › Privacy.')
    const target = this.options.resolveTarget(request.target)
    if (!target) throw new Error('That video is no longer available.')
    const provider = this.provider(request.provider)
    if (!this.options.isProviderEnabled(provider.id))
      throw new Error(`${provider.name} is turned off in Settings.`)

    this.download?.abort()
    const controller = new AbortController()
    this.download = controller
    try {
      const downloaded = await provider.downloadSubtitle(request.resultId, controller.signal)
      if (controller.signal.aborted) return { status: 'cancelled' }

      const decoded = this.pickAndDecode(downloaded.files, target, request.language)
      const videoBase = safeFileBase(basename(target.videoPath, extname(target.videoPath)))
      const suffix = [
        request.language,
        request.hearingImpaired ? 'sdh' : null,
        request.forced ? 'forced' : null,
      ]
        .filter(Boolean)
        .join('.')
      const dir = this.options.saveDirFor(target.videoPath)
      const path = join(dir, `${videoBase}${suffix ? `.${suffix}` : ''}.${decoded.format}`)

      const exists = await stat(path).then(
        () => true,
        () => false,
      )
      if (exists && !request.overwrite) return { status: 'exists', path }

      try {
        await mkdir(dir, { recursive: true })
        const tmp = `${path}.${process.pid}.part`
        await writeFile(tmp, decoded.text, 'utf8')
        await rename(tmp, path)
      } catch (error) {
        throw new Error(
          `Could not save the subtitle in ${dir} (${message(error)}). Choose a subtitle folder in Settings › Subtitles if this folder is read-only.`,
          { cause: error },
        )
      }
      const loadedIntoPlayer = await this.options.addToPlayer(
        target.videoPath,
        path,
        request.language,
      )
      if (downloaded.quota) this.emit()
      return {
        status: 'saved',
        path,
        loadedIntoPlayer,
        format: decoded.format,
        sourceEncoding: decoded.sourceEncoding,
      }
    } catch (error) {
      if (controller.signal.aborted) return { status: 'cancelled' }
      throw error
    } finally {
      if (this.download === controller) this.download = null
    }
  }

  cancelDownload(): void {
    this.download?.abort()
  }

  async dispose(): Promise<void> {
    this.search?.abort()
    this.download?.abort()
    await Promise.all(this.options.providers.map((p) => p.dispose().catch(() => undefined)))
  }

  /** From an archive, prefer the file for this episode; every candidate must validate. */
  private pickAndDecode(
    files: readonly { name: string; bytes: Buffer }[],
    target: ResolvedTarget,
    language: string | null,
  ) {
    const code =
      target.season !== null && target.episode !== null
        ? new RegExp(`s0*${target.season}[ ._-]?e0*${target.episode}(?!\\d)`, 'i')
        : null
    const ordered = code
      ? [...files].sort((a, b) => Number(code.test(b.name)) - Number(code.test(a.name)))
      : files
    let lastError: unknown = new Error('The download contained no subtitle.')
    for (const file of ordered) {
      try {
        return decodeSubtitle(file.bytes, fallbackEncodingFor(language))
      } catch (error) {
        lastError = error
      }
    }
    throw lastError
  }

  private provider(id: SubtitleProviderId): SubtitleProvider {
    const provider = this.options.providers.find((p) => p.id === id)
    if (!provider) throw new Error(`Unknown subtitle provider: ${id}`)
    return provider
  }

  private emit() {
    this.options.onStatus?.(this.statuses())
  }
}

import type {
  EpisodeMetadata,
  ItemMetadata,
  MatchCandidate,
  MatchTarget,
  MediaMetadata,
  MetadataMediaType,
  MetadataSearch,
  MetadataStatus,
  TokenTestResult,
} from '@shared/contracts/metadata'
import type {
  MetadataRepository,
  PendingTarget,
  TargetType,
} from '../database/repositories/metadata-repository'
import { HttpError } from '../network/http-client'
import { rankCandidates, yearOf, type RawCandidate } from './matching'
import { TmdbNotConfiguredError, type TmdbClient } from './tmdb/tmdb-client'
import type { TmdbMovieDetails, TmdbTvDetails } from './tmdb/tmdb-schemas'

const DAY_MS = 86_400_000
/** TMDB terms: do not cache TMDB content for longer than 6 months. */
export const MAX_CACHE_AGE_MS = 180 * DAY_MS
/** Refresh well before the hard limit. */
const REFRESH_AGE_MS = 30 * DAY_MS
const SEARCH_CACHE_MS = 7 * DAY_MS
const CONCURRENCY = 4

export interface MetadataServiceOptions {
  repository: MetadataRepository
  tmdb: TmdbClient
  /** Online lookups allowed (privacy setting) — checked before every network call. */
  isEnabled: () => boolean
  getLanguage: () => string
  /** Resolves a library file id to its path key and parsed episode numbers. */
  resolveFile: (fileId: number) =>
    | {
        pathKey: string
        kind: string
        showKey: string | null
        season: number | null
        episode: number | null
      }
    | undefined
  onChanged: () => void
  onStatus: (status: MetadataStatus) => void
  now?: () => Date
  warn?: (message: string) => void
}

/** Errors that make further requests in this run pointless. */
function isFatal(error: unknown): boolean {
  return (
    error instanceof TmdbNotConfiguredError ||
    (error instanceof HttpError &&
      (error.kind === 'unauthorized' || error.kind === 'network' || error.kind === 'cancelled'))
  )
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export class MetadataService {
  private run: { controller: AbortController; done: Promise<void> } | null = null
  private progress = { pending: 0, done: 0 }
  private lastError: string | null = null

  constructor(private readonly options: MetadataServiceOptions) {}

  status(): MetadataStatus {
    return {
      enabled: this.options.isEnabled(),
      tokenConfigured: this.options.tmdb.configured,
      lastError: this.lastError,
      identifying: this.run !== null,
      pending: this.progress.pending,
      done: this.progress.done,
    }
  }

  /** Verifies the stored token with a lightweight authenticated request. */
  async testToken(): Promise<TokenTestResult> {
    if (!this.options.tmdb.configured) return { ok: false, message: 'No token saved yet.' }
    try {
      await this.options.tmdb.configuration()
      this.lastError = null
      this.emitStatus()
      return { ok: true, message: 'Connected to TMDB.' }
    } catch (error) {
      this.lastError = message(error)
      this.emitStatus()
      return { ok: false, message: this.lastError }
    }
  }

  /** Identifies everything not yet identified. Joins a run already in progress. */
  identifyPending(): Promise<void> {
    if (this.run) return this.run.done
    if (!this.options.isEnabled() || !this.options.tmdb.configured) return Promise.resolve()
    const controller = new AbortController()
    const done = this.runIdentification(controller.signal).finally(() => {
      this.run = null
      this.emitStatus()
      this.options.onChanged()
    })
    this.run = { controller, done }
    return done
  }

  async dispose(): Promise<void> {
    this.run?.controller.abort()
    await this.run?.done.catch(() => undefined)
  }

  /** Manual search for the match dialog, ranked against the query itself. */
  async search(q: MetadataSearch): Promise<MatchCandidate[]> {
    this.assertOnline()
    const raw = await this.searchRaw(q.mediaType, q.query, q.year)
    return rankCandidates({ title: q.query, year: q.year ?? null, mediaType: q.mediaType }, raw, 20)
      .candidates
  }

  /** Candidates stored for a target, searching now if there are none. */
  async candidatesFor(target: MatchTarget): Promise<MatchCandidate[]> {
    const { type, key } = this.resolveTarget(target)
    const stored = this.options.repository.getMatch(type, key)
    if (stored && stored.candidates.length > 0) return stored.candidates
    const evidence = this.options.repository.targetEvidence(type, key)
    if (!evidence) return []
    this.assertOnline()
    const raw = await this.searchRaw(evidence.mediaType, evidence.title, evidence.year ?? undefined)
    return rankCandidates(evidence, raw).candidates
  }

  /** The user confirmed a TMDB entry for a file or show. */
  async applyMatch(
    target: MatchTarget,
    tmdbId: number,
    mediaType: MetadataMediaType,
  ): Promise<void> {
    this.assertOnline()
    const { type, key } = this.resolveTarget(target)
    await this.fetchAndStore(
      mediaType,
      tmdbId,
      type === 'show' ? this.options.repository.localSeasons(key) : [],
    )
    const previous = this.options.repository.getMatch(type, key)
    this.options.repository.saveMatch(
      {
        targetType: type,
        targetKey: key,
        status: 'matched',
        source: 'user',
        confidence: null,
        tmdbMediaType: mediaType,
        tmdbId,
        candidates: previous?.candidates ?? [],
        error: null,
      },
      this.nowIso(),
    )
    this.options.onChanged()
  }

  /** None of the suggestions is right: never auto-match this target again. */
  reject(target: MatchTarget): void {
    const { type, key } = this.resolveTarget(target)
    const previous = this.options.repository.getMatch(type, key)
    this.options.repository.saveMatch(
      {
        targetType: type,
        targetKey: key,
        status: 'rejected',
        source: 'user',
        confidence: null,
        tmdbMediaType: null,
        tmdbId: null,
        candidates: previous?.candidates ?? [],
        error: null,
      },
      this.nowIso(),
    )
    this.options.onChanged()
  }

  /** Forgets the match so the next run identifies the target from scratch. */
  async reidentify(target: MatchTarget): Promise<void> {
    const { type, key } = this.resolveTarget(target)
    this.options.repository.deleteMatch(type, key)
    this.options.onChanged()
    await this.identifyPending()
  }

  /** Metadata for a library file (movie, or show + episode). */
  itemMetadata(target: MatchTarget): ItemMetadata {
    const { type, key, season, episode } = this.resolveTarget(target)
    const match = this.options.repository.getMatch(type, key)
    if (!match)
      return {
        status: 'candidates',
        source: null,
        confidence: null,
        metadata: null,
        episode: null,
        error: null,
      }
    const metadata =
      match.status === 'matched' && match.tmdbId !== null && match.tmdbMediaType !== null
        ? (this.options.repository.getMetadata(match.tmdbMediaType, match.tmdbId) ?? null)
        : null
    const ep =
      metadata && type === 'show' && season !== null && episode !== null
        ? (this.options.repository.getEpisode(metadata.tmdbId, season, episode) ?? null)
        : null
    return {
      status: match.status,
      source: match.source,
      confidence: match.confidence,
      metadata,
      episode: ep,
      error: match.error,
    }
  }

  /**
   * Enforces the 6-month cache limit: refreshes entries older than 30 days when online,
   * and purges anything past the limit that could not be refreshed. Matches are kept.
   */
  async maintainCache(): Promise<void> {
    const now = this.options.now?.() ?? new Date()
    if (this.options.isEnabled() && this.options.tmdb.configured) {
      const stale = this.options.repository.staleMetadata(
        new Date(now.getTime() - REFRESH_AGE_MS).toISOString(),
      )
      for (const item of stale) {
        try {
          await this.fetchAndStore(item.mediaType, item.tmdbId, [])
        } catch (error) {
          this.options.warn?.(
            `metadata: refresh of ${item.mediaType} ${item.tmdbId} failed: ${message(error)}`,
          )
          if (isFatal(error)) break
        }
      }
    }
    this.options.repository.purgeBefore(new Date(now.getTime() - MAX_CACHE_AGE_MS).toISOString())
  }

  // ── internals ─────────────────────────────────────────────────────────────

  private async runIdentification(signal: AbortSignal) {
    this.options.repository.clearErrors()
    const queue = this.options.repository.pendingTargets()
    this.progress = { pending: queue.length, done: 0 }
    this.lastError = null
    this.emitStatus()

    let stop = false
    const worker = async () => {
      while (!stop && !signal.aborted) {
        const target = queue.shift()
        if (!target) return
        try {
          await this.identify(target, signal)
        } catch (error) {
          if (isFatal(error)) {
            stop = true
            if (!signal.aborted) this.lastError = message(error)
          } else {
            this.saveError(target, message(error))
          }
        }
        this.progress.done++
        this.emitStatus()
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  }

  private async identify(target: PendingTarget, signal: AbortSignal) {
    const raw = await this.searchRaw(
      target.mediaType,
      target.title,
      target.year ?? undefined,
      signal,
    )
    const { candidates, autoMatch } = rankCandidates(target, raw)
    if (autoMatch) {
      await this.fetchAndStore(autoMatch.mediaType, autoMatch.tmdbId, target.seasons, signal)
    }
    this.options.repository.saveMatch(
      {
        targetType: target.targetType,
        targetKey: target.targetKey,
        status: autoMatch ? 'matched' : candidates.length > 0 ? 'candidates' : 'no-match',
        source: autoMatch ? 'auto' : null,
        confidence: autoMatch?.confidence ?? candidates[0]?.confidence ?? null,
        tmdbMediaType: autoMatch?.mediaType ?? null,
        tmdbId: autoMatch?.tmdbId ?? null,
        candidates,
        error: null,
      },
      this.nowIso(),
    )
  }

  private saveError(target: PendingTarget, error: string) {
    this.options.repository.saveMatch(
      {
        targetType: target.targetType,
        targetKey: target.targetKey,
        status: 'error',
        source: null,
        confidence: null,
        tmdbMediaType: null,
        tmdbId: null,
        candidates: [],
        error,
      },
      this.nowIso(),
    )
  }

  private async searchRaw(
    mediaType: MetadataMediaType,
    query: string,
    year: number | undefined,
    signal?: AbortSignal,
  ): Promise<RawCandidate[]> {
    const key = `search:${mediaType}:${this.options.getLanguage()}:${year ?? ''}:${query.toLowerCase()}`
    const notBefore = new Date(
      (this.options.now?.() ?? new Date()).getTime() - SEARCH_CACHE_MS,
    ).toISOString()
    const cached = this.options.repository.getCached(key, notBefore)
    if (Array.isArray(cached)) return cached as RawCandidate[]

    let results: RawCandidate[]
    if (mediaType === 'movie') {
      results = (await this.options.tmdb.searchMovies(query, year, signal)).map((r) => ({
        tmdbId: r.id,
        mediaType: 'movie',
        title: r.title,
        originalTitle: r.original_title ?? null,
        date: r.release_date ?? null,
        overview: r.overview ?? null,
        posterPath: r.poster_path ?? null,
        popularity: r.popularity ?? null,
        voteCount: r.vote_count ?? null,
      }))
      // A wrong year in the file name should not hide the right film.
      if (results.length === 0 && year !== undefined)
        return this.searchRaw(mediaType, query, undefined, signal)
    } else {
      results = (await this.options.tmdb.searchTv(query, year, signal)).map((r) => ({
        tmdbId: r.id,
        mediaType: 'tv',
        title: r.name,
        originalTitle: r.original_name ?? null,
        date: r.first_air_date ?? null,
        overview: r.overview ?? null,
        posterPath: r.poster_path ?? null,
        popularity: r.popularity ?? null,
        voteCount: r.vote_count ?? null,
      }))
      if (results.length === 0 && year !== undefined)
        return this.searchRaw(mediaType, query, undefined, signal)
    }
    this.options.repository.putCached(key, results, this.nowIso())
    return results
  }

  private async fetchAndStore(
    mediaType: MetadataMediaType,
    tmdbId: number,
    seasons: readonly number[],
    signal?: AbortSignal,
  ) {
    const fetchedAt = this.nowIso()
    if (mediaType === 'movie') {
      this.options.repository.saveMetadata(
        fromMovie(await this.options.tmdb.movieDetails(tmdbId, signal), fetchedAt),
      )
      return
    }
    this.options.repository.saveMetadata(
      fromTv(await this.options.tmdb.tvDetails(tmdbId, signal), fetchedAt),
    )
    for (const season of seasons) {
      try {
        const details = await this.options.tmdb.seasonDetails(tmdbId, season, signal)
        const episodes: EpisodeMetadata[] = details.episodes.map((e) => ({
          season: e.season_number,
          episode: e.episode_number,
          name: e.name ?? null,
          overview: e.overview || null,
          airDate: e.air_date ?? null,
          stillPath: e.still_path ?? null,
          runtimeMinutes: e.runtime ?? null,
        }))
        this.options.repository.saveEpisodes(tmdbId, episodes, fetchedAt)
      } catch (error) {
        // A season TMDB does not know (e.g. local specials numbering) is not fatal.
        if (isFatal(error)) throw error
        if (!(error instanceof HttpError && error.kind === 'not-found')) {
          this.options.warn?.(`metadata: season ${season} of tv ${tmdbId}: ${message(error)}`)
        }
      }
    }
  }

  private resolveTarget(target: MatchTarget): {
    type: TargetType
    key: string
    season: number | null
    episode: number | null
  } {
    if ('showKey' in target)
      return { type: 'show', key: target.showKey, season: null, episode: null }
    const file = this.options.resolveFile(target.fileId)
    if (!file) throw new Error('That item is no longer in the library.')
    if (file.kind === 'episode' && file.showKey) {
      return { type: 'show', key: file.showKey, season: file.season, episode: file.episode }
    }
    return { type: 'file', key: file.pathKey, season: null, episode: null }
  }

  private assertOnline() {
    if (!this.options.isEnabled()) {
      throw new Error('Online metadata lookups are turned off in Settings › Privacy.')
    }
    if (!this.options.tmdb.configured) throw new TmdbNotConfiguredError()
  }

  private emitStatus() {
    this.options.onStatus(this.status())
  }

  private nowIso() {
    return (this.options.now?.() ?? new Date()).toISOString()
  }
}

function names(list: { name: string }[] | null | undefined, max = 10): string[] {
  return (list ?? []).slice(0, max).map((x) => x.name)
}

function cast(details: TmdbMovieDetails | TmdbTvDetails) {
  return (details.credits?.cast ?? [])
    .slice()
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
    .slice(0, 12)
    .map((c) => ({
      name: c.name,
      character: c.character ?? null,
      profilePath: c.profile_path ?? null,
    }))
}

export function fromMovie(d: TmdbMovieDetails, fetchedAt: string): MediaMetadata {
  return {
    tmdbId: d.id,
    mediaType: 'movie',
    title: d.title,
    originalTitle: d.original_title ?? null,
    overview: d.overview || null,
    releaseDate: d.release_date || null,
    year: yearOf(d.release_date ?? null),
    runtimeMinutes: d.runtime || null,
    genres: names(d.genres),
    posterPath: d.poster_path ?? null,
    backdropPath: d.backdrop_path ?? null,
    voteAverage: d.vote_count ? (d.vote_average ?? null) : null,
    voteCount: d.vote_count ?? null,
    originalLanguage: d.original_language ?? null,
    imdbId: d.imdb_id ?? d.external_ids?.imdb_id ?? null,
    tvdbId: null,
    cast: cast(d),
    creators: (d.credits?.crew ?? []).filter((c) => c.job === 'Director').map((c) => c.name),
    production: names(d.production_companies, 5),
    fetchedAt,
  }
}

export function fromTv(d: TmdbTvDetails, fetchedAt: string): MediaMetadata {
  return {
    tmdbId: d.id,
    mediaType: 'tv',
    title: d.name,
    originalTitle: d.original_name ?? null,
    overview: d.overview || null,
    releaseDate: d.first_air_date || null,
    year: yearOf(d.first_air_date ?? null),
    runtimeMinutes: d.episode_run_time?.[0] ?? null,
    genres: names(d.genres),
    posterPath: d.poster_path ?? null,
    backdropPath: d.backdrop_path ?? null,
    voteAverage: d.vote_count ? (d.vote_average ?? null) : null,
    voteCount: d.vote_count ?? null,
    originalLanguage: d.original_language ?? null,
    imdbId: d.external_ids?.imdb_id ?? null,
    tvdbId: d.external_ids?.tvdb_id ?? null,
    cast: cast(d),
    creators: names(d.created_by),
    production: names(d.networks, 5),
    fetchedAt,
  }
}

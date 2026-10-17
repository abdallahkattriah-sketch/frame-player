import type {
  ProviderCapabilities,
  SubtitleProviderId,
  SubtitleResult,
} from '@shared/contracts/subtitles'

/** Everything Frame knows about the video, for providers to use as they support. */
export interface SubtitleSearchContext {
  fileName: string
  /** Title from TMDB when matched, otherwise from the file name. */
  title: string | null
  year: number | null
  kind: 'movie' | 'episode' | 'unknown'
  season: number | null
  episode: number | null
  /** TMDB id of the movie, or of the show for episodes. */
  tmdbId: number | null
  imdbId: string | null
  /** Only present when the user allowed hash lookups. */
  movieHash: string | null
  languages: readonly string[]
  hearingImpaired: 'include' | 'exclude' | 'only'
}

/** Provider result before Frame ranks it. */
export type RawSubtitleResult = Omit<SubtitleResult, 'confidence' | 'reasons' | 'languageLabel'> & {
  /** Season/episode the provider says the subtitle is for, if it says. */
  season: number | null
  episode: number | null
  /** Provider's own id for the title (to detect wrong-title results), if known. */
  matchedImdbId: string | null
  matchedTmdbId: number | null
}

export interface DownloadedSubtitle {
  /** Candidate files (a provider may deliver an archive with several). */
  files: { name: string; bytes: Buffer }[]
  quota?: { remaining: number; resetsAt: string | null }
}

export interface ProviderCheck {
  ok: boolean
  message: string
  quota?: { remaining: number; resetsAt: string | null } | null
}

/**
 * A subtitle source. Each adapter owns its authentication, request format, limits, and
 * error messages; the rest of Frame only sees this interface.
 */
export interface SubtitleProvider {
  readonly id: SubtitleProviderId
  readonly name: string
  getCapabilities(): ProviderCapabilities
  /** Credentials present (not necessarily valid). */
  isConfigured(): boolean
  validateConfiguration(signal?: AbortSignal): Promise<ProviderCheck>
  searchSubtitles(
    context: SubtitleSearchContext,
    signal?: AbortSignal,
  ): Promise<RawSubtitleResult[]>
  /** Human-readable summary of what a search would send, for transparency. */
  describeSearch(context: SubtitleSearchContext): string
  downloadSubtitle(resultId: string, signal?: AbortSignal): Promise<DownloadedSubtitle>
  dispose(): Promise<void>
}

export class ProviderNotConfiguredError extends Error {
  constructor(provider: string, what: string) {
    super(`${provider} is not set up yet: add ${what} in Settings › Subtitles.`)
    this.name = 'ProviderNotConfiguredError'
  }
}

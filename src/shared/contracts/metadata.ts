import { z } from 'zod'

export type MetadataMediaType = 'movie' | 'tv'

/** A TMDB search result offered as a possible match. */
export interface MatchCandidate {
  tmdbId: number
  mediaType: MetadataMediaType
  title: string
  originalTitle: string | null
  year: number | null
  overview: string | null
  posterPath: string | null
  /** 0–1, computed by Frame from the evidence; not a TMDB value. */
  confidence: number
}

export type MatchStatus = 'matched' | 'candidates' | 'no-match' | 'rejected' | 'error'

export interface CastMember {
  name: string
  character: string | null
  profilePath: string | null
}

/** Stored metadata for a movie or TV show. Fields TMDB did not provide are null. */
export interface MediaMetadata {
  tmdbId: number
  mediaType: MetadataMediaType
  title: string
  originalTitle: string | null
  overview: string | null
  releaseDate: string | null
  year: number | null
  runtimeMinutes: number | null
  genres: string[]
  posterPath: string | null
  backdropPath: string | null
  voteAverage: number | null
  voteCount: number | null
  originalLanguage: string | null
  imdbId: string | null
  tvdbId: number | null
  cast: CastMember[]
  /** Directors (movies) or creators (TV). */
  creators: string[]
  production: string[]
  fetchedAt: string
}

export interface EpisodeMetadata {
  season: number
  episode: number
  name: string | null
  overview: string | null
  airDate: string | null
  stillPath: string | null
  runtimeMinutes: number | null
}

/** What a library item is matched to; `episode` is set for matched TV episodes. */
export interface ItemMetadata {
  status: MatchStatus
  source: 'auto' | 'user' | null
  confidence: number | null
  metadata: MediaMetadata | null
  episode: EpisodeMetadata | null
  error: string | null
}

export const matchTargetSchema = z.union([
  z.object({ fileId: z.number().int().positive() }).strict(),
  /** A TV show, by the show key from LibraryShow. */
  z.object({ showKey: z.string().min(1).max(500) }).strict(),
])
export type MatchTarget = z.infer<typeof matchTargetSchema>

export const metadataSearchSchema = z
  .object({
    query: z.string().trim().min(1).max(200),
    mediaType: z.enum(['movie', 'tv']),
    year: z.number().int().min(1870).max(2100).optional(),
  })
  .strict()
export type MetadataSearch = z.infer<typeof metadataSearchSchema>

export interface MetadataStatus {
  enabled: boolean
  tokenConfigured: boolean
  /** Last connection test or identification error, if any. */
  lastError: string | null
  identifying: boolean
  pending: number
  done: number
}

export interface TokenTestResult {
  ok: boolean
  message: string
}

export const artworkKinds = ['poster', 'backdrop', 'still', 'profile'] as const
export type ArtworkKind = (typeof artworkKinds)[number]

/** URL the renderer uses to show cached TMDB artwork (served by the main process). */
export function artworkUrl(kind: ArtworkKind, path: string | null): string | null {
  if (!path || !/^\/[A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp|svg)$/.test(path)) return null
  return `frame-art://${kind}${path}`
}

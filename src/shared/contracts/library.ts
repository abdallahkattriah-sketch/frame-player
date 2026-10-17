import { z } from 'zod'
import type { MatchStatus } from './metadata'

export type MediaKind = 'movie' | 'episode' | 'unknown'

/** What could be read from a file's name and folders. Every field is optional evidence. */
export interface ParsedMediaName {
  kind: MediaKind
  title: string | null
  year: number | null
  /** null when the file uses absolute numbering (common for anime). 0 = specials. */
  season: number | null
  episode: number | null
  /** Last episode of a multi-episode file (S01E01E02 → 2). */
  episodeEnd: number | null
  episodeTitle: string | null
  resolution: string | null
  videoCodec: string | null
  edition: string | null
  releaseGroup: string | null
}

export type ScanStatus = 'never' | 'scanning' | 'complete' | 'failed' | 'unavailable' | 'cancelled'

export interface LibraryFolder {
  id: number
  path: string
  available: boolean
  followSymlinks: boolean
  autoRescan: boolean
  exclusions: string[]
  lastScanAt: string | null
  lastScanStatus: ScanStatus
  lastScanError: string | null
  fileCount: number
  missingCount: number
}

export interface ScanProgress {
  folderId: number
  status: ScanStatus
  /** Directory entries examined so far. */
  examined: number
  /** Video files found so far. */
  found: number
  error: string | null
}

export const folderOptionsSchema = z
  .object({
    followSymlinks: z.boolean(),
    autoRescan: z.boolean(),
    /** Folder-relative subfolders to skip, e.g. "Extras" or "TV/Old". */
    exclusions: z.array(z.string().trim().min(1).max(1024)).max(200),
  })
  .partial()
  .strict()

export type FolderOptions = z.infer<typeof folderOptionsSchema>

export interface AddFolderResult {
  folder?: LibraryFolder
  error?: string
}

// ── Library browsing ─────────────────────────────────────────────────────────

export const libraryViews = [
  'all',
  'movies',
  'episodes',
  'recently-added',
  'continue-watching',
  'recently-watched',
  'favorites',
  'missing',
  'unmatched',
] as const
export type LibraryView = (typeof libraryViews)[number]

export const sortKeys = ['title', 'year', 'added', 'size', 'last-watched', 'episode'] as const
export type SortKey = (typeof sortKeys)[number]

export const libraryQuerySchema = z
  .object({
    view: z.enum(libraryViews),
    search: z.string().trim().max(200).optional(),
    sort: z.enum(sortKeys).optional(),
    direction: z.enum(['asc', 'desc']).optional(),
    /** Episodes of one show: the show key from LibraryShow. */
    showKey: z.string().max(500).optional(),
    kind: z.enum(['movie', 'episode', 'unknown']).optional(),
    resolution: z.string().max(10).optional(),
    watched: z.enum(['watched', 'unwatched', 'in-progress']).optional(),
    limit: z.number().int().min(1).max(50_000).optional(),
  })
  .strict()

export type LibraryQuery = z.infer<typeof libraryQuerySchema>

export interface WatchProgress {
  /** Seconds. */
  position: number
  duration: number | null
  completed: boolean
  lastWatchedAt: string
}

/**
 * A playable item. Library files have a `fileId`; items only known from playback history
 * (opened outside the library) have just a `historyKey`.
 */
export interface LibraryItem {
  fileId: number | null
  historyKey: string | null
  path: string
  fileName: string
  kind: MediaKind
  title: string | null
  year: number | null
  season: number | null
  episode: number | null
  episodeEnd: number | null
  episodeTitle: string | null
  resolution: string | null
  sizeBytes: number | null
  addedAt: string | null
  missing: boolean
  favorite: boolean
  progress: WatchProgress | null
  /** TMDB identification state; null until identification has run. */
  matchStatus: MatchStatus | null
  /** From TMDB when matched (and cached); otherwise null. */
  metadataTitle: string | null
  metadataYear: number | null
  posterPath: string | null
  /** TMDB episode name and still, for matched episodes. */
  episodeName: string | null
  stillPath: string | null
}

export interface LibraryShow {
  /** Case-folded title; identifies the show in queries. */
  key: string
  title: string
  year: number | null
  episodeCount: number
  seasons: number[]
  /** Some episodes use absolute numbering without a season. */
  hasUnseasonedEpisodes: boolean
  watchedCount: number
  lastAddedAt: string
  matchStatus: MatchStatus | null
  metadataTitle: string | null
  posterPath: string | null
}

/** Identifies an item for actions; the main process resolves it to a path itself. */
export const itemRefSchema = z.union([
  z.object({ fileId: z.number().int().positive() }).strict(),
  z.object({ historyKey: z.string().min(1).max(32_767) }).strict(),
])
export type ItemRef = z.infer<typeof itemRefSchema>

export const playRequestSchema = z
  .object({
    items: z.array(itemRefSchema).min(1).max(5000),
    startIndex: z.number().int().min(0).optional(),
  })
  .strict()
export type PlayRequest = z.infer<typeof playRequestSchema>

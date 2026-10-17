import { z } from 'zod'

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

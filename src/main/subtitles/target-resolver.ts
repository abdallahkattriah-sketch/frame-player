import { basename, dirname } from 'node:path'
import type { SubtitleTarget } from '@shared/contracts/subtitles'
import type { LibraryQueryRepository } from '../database/repositories/library-query-repository'
import type { MetadataService } from '../metadata/metadata-service'
import { parseMediaName } from '../library/filename-parser'
import { pathKey } from '../library/path-key'
import type { ResolvedTarget } from './subtitle-service'

export interface TargetResolverDeps {
  library: LibraryQueryRepository
  metadata: MetadataService
  /** Path of the file loaded in the player, if any. */
  currentPath: () => string | null
}

/**
 * Turns a subtitle target into a video path plus the best identification Frame has: TMDB
 * (title, ids) when matched, otherwise what the file and folder names say.
 */
export function createTargetResolver(deps: TargetResolverDeps) {
  return (target: SubtitleTarget): ResolvedTarget | undefined => {
    let fileId: number | undefined
    let videoPath: string | null
    if ('fileId' in target) {
      fileId = target.fileId
      videoPath = deps.library.getFileDetails(target.fileId)?.path ?? null
    } else {
      videoPath = deps.currentPath()
      if (videoPath) fileId = deps.library.findFileIdByPathKey(pathKey(videoPath))
    }
    if (!videoPath) return undefined

    const details = fileId !== undefined ? deps.library.getFileDetails(fileId) : undefined
    const parsed = details
      ? {
          title: details.title,
          year: details.year,
          kind: details.kind,
          season: details.season,
          episode: details.episode,
        }
      : (() => {
          const p = parseMediaName(basename(videoPath), [basename(dirname(videoPath))])
          return {
            title: p.title,
            year: p.year,
            kind: p.kind,
            season: p.season,
            episode: p.episode,
          }
        })()

    let tmdbId: number | null = null
    let imdbId: string | null = null
    let title = parsed.title
    let year = parsed.year
    if (fileId !== undefined) {
      try {
        const item = deps.metadata.itemMetadata({ fileId })
        if (item.status === 'matched' && item.metadata) {
          tmdbId = item.metadata.tmdbId
          imdbId = item.metadata.imdbId
          title = item.metadata.title
          year = item.metadata.year ?? year
        }
      } catch {
        // Unidentified files fall back to the parsed name.
      }
    }
    const kind = parsed.kind === 'episode' || parsed.kind === 'movie' ? parsed.kind : 'unknown'
    return {
      videoPath,
      title,
      year,
      kind,
      season: parsed.season,
      episode: parsed.episode,
      tmdbId,
      imdbId,
    }
  }
}

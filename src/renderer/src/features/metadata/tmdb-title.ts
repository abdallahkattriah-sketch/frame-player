import { TMDB_IMAGE_PATH, type CollectionTitleInput } from '@shared/contracts/collections'
import type { TmdbSearchResult } from '@shared/contracts/metadata'

/** What a collection stores about a TMDB result (poster only in the shape the cache accepts). */
export function titleInput(r: TmdbSearchResult): CollectionTitleInput {
  return {
    mediaType: r.mediaType,
    tmdbId: r.tmdbId,
    title: r.title,
    year: r.year,
    posterPath: r.posterPath && TMDB_IMAGE_PATH.test(r.posterPath) ? r.posterPath : null,
  }
}

export const resultLabel = (r: TmdbSearchResult) => `${r.title}${r.year ? ` (${r.year})` : ''}`

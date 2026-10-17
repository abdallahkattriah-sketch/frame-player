import { createContext, useContext } from 'react'
import type { LibraryItem } from '@shared/contracts/library'
import type { MatchTarget, MetadataMediaType } from '@shared/contracts/metadata'

export interface MatchRequest {
  target: MatchTarget
  /** Shown in the dialog title, e.g. the file or show name. */
  label: string
  query: string
  year: number | null
  mediaType: MetadataMediaType
}

export interface MetadataActions {
  openMatch: (request: MatchRequest) => void
  openDetails: (item: LibraryItem) => void
  openSubtitles: (item: LibraryItem) => void
}

export const MetadataActionsContext = createContext<MetadataActions>({
  openMatch: () => undefined,
  openDetails: () => undefined,
  openSubtitles: () => undefined,
})

export function useMetadataActions(): MetadataActions {
  return useContext(MetadataActionsContext)
}

/** Builds the match request for a library item (episodes match their show). */
export function matchRequestFor(item: LibraryItem): MatchRequest | null {
  if (item.fileId === null) return null
  return {
    target: { fileId: item.fileId },
    label: item.kind === 'episode' ? (item.title ?? item.fileName) : item.fileName,
    query: item.title ?? item.fileName.replace(/\.[^.]+$/, ''),
    year: item.year,
    mediaType: item.kind === 'episode' ? 'tv' : 'movie',
  }
}

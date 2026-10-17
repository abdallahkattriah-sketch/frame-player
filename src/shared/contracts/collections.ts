import { z } from 'zod'

export const collectionKinds = ['collection', 'playlist'] as const
export type CollectionKind = (typeof collectionKinds)[number]

/** A user-made group of library files. Files themselves are never touched. */
export interface Collection {
  id: number
  name: string
  /** Playlists are meant to be played in order; collections are browsed as a grid. */
  kind: CollectionKind
  itemCount: number
}

export const collectionIdSchema = z.number().int().positive()
export const collectionNameSchema = z
  .string()
  .trim()
  .min(1, 'Enter a name')
  .max(100, 'Use at most 100 characters')
  .regex(/^[^\p{Cc}]+$/u, 'Names cannot contain control characters')
export const collectionFileIdsSchema = z.array(z.number().int().positive()).min(1).max(5000)

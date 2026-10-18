import { z } from 'zod'
import type { MetadataMediaType } from './metadata'

export const collectionKinds = ['collection', 'playlist'] as const
export type CollectionKind = (typeof collectionKinds)[number]

/** A user-made group of library files and TMDB titles. Files themselves are never touched. */
export interface Collection {
  id: number
  name: string
  /** Playlists are meant to be played in order; collections are browsed as a grid. */
  kind: CollectionKind
  /** Library files plus saved TMDB titles. */
  itemCount: number
}

/** A TMDB movie or show saved to a collection; it may or may not be in the library. */
export interface CollectionTitle {
  mediaType: MetadataMediaType
  tmdbId: number
  title: string
  year: number | null
  posterPath: string | null
  addedAt: string
  /** Something in the library is matched to this title. */
  inLibrary: boolean
}

export type CollectionTitleInput = Pick<
  CollectionTitle,
  'mediaType' | 'tmdbId' | 'title' | 'year' | 'posterPath'
>

/** What can be put in a collection: a library file or a TMDB title. */
export type CollectionTarget = { fileId: number } | { mediaType: MetadataMediaType; tmdbId: number }

export const collectionIdSchema = z.number().int().positive()
export const collectionNameSchema = z
  .string()
  .trim()
  .min(1, 'Enter a name')
  .max(100, 'Use at most 100 characters')
  .regex(/^[^\p{Cc}]+$/u, 'Names cannot contain control characters')
export const collectionFileIdsSchema = z.array(z.number().int().positive()).min(1).max(5000)

/** A TMDB image path, in the same shape the artwork cache accepts. */
export const TMDB_IMAGE_PATH = /^\/[A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp)$/

export const collectionTitleInputSchema = z
  .object({
    mediaType: z.enum(['movie', 'tv']),
    tmdbId: z.number().int().positive(),
    title: z.string().trim().min(1).max(500),
    year: z.number().int().min(1800).max(3000).nullable(),
    // Same shape the artwork cache accepts.
    posterPath: z.string().regex(TMDB_IMAGE_PATH).nullable(),
  })
  .strict()

export const collectionTargetSchema = z.union([
  z.object({ fileId: z.number().int().positive() }).strict(),
  z.object({ mediaType: z.enum(['movie', 'tv']), tmdbId: z.number().int().positive() }).strict(),
])

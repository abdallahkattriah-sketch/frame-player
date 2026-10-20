import { z } from 'zod'
import type { MetadataMediaType } from './metadata'
import { TMDB_IMAGE_PATH } from './collections'

/** A person the user follows. Kept locally so the list works offline. */
export interface FollowedPerson {
  personId: number
  name: string
  profilePath: string | null
  /** TMDB "known for" department, e.g. "Acting", "Directing". */
  department: string | null
  followedAt: string
}

export type FollowPersonInput = Omit<FollowedPerson, 'followedAt'>

/** One movie or show in a person's filmography, as cast or crew. */
export interface PersonCredit {
  mediaType: MetadataMediaType
  tmdbId: number
  title: string
  /** Movie release or first air date (TMDB primary date, not country-specific). */
  releaseDate: string | null
  year: number | null
  posterPath: string | null
  /** "cast" for acting roles; otherwise the crew department, e.g. "Directing". */
  department: string
  /** Character for cast, job for crew. */
  role: string | null
  voteCount: number | null
  popularity: number | null
}

export interface PersonDetails {
  personId: number
  name: string
  biography: string | null
  birthday: string | null
  deathday: string | null
  placeOfBirth: string | null
  profilePath: string | null
  department: string | null
  credits: PersonCredit[]
  fetchedAt: string
}

export const personIdSchema = z.number().int().positive()

export const followPersonInputSchema = z
  .object({
    personId: personIdSchema,
    name: z.string().trim().min(1).max(500),
    profilePath: z.string().regex(TMDB_IMAGE_PATH).nullable(),
    department: z.string().trim().min(1).max(100).nullable(),
  })
  .strict()

export const peopleSearchSchema = z.string().max(200)

/** A suggested person. `source` says whether the reason was worked out locally or is TMDB's. */
export interface PersonRecommendation {
  personId: number
  name: string
  profilePath: string | null
  department: string | null
  /** A few titles they are known for. */
  knownFor: string[]
  /** e.g. "Worked with Denis Villeneuve", "In 3 titles in your library", "Popular on TMDB". */
  reason: string
  source: 'local' | 'popular'
}

export interface PeopleRecommendations {
  people: PersonRecommendation[]
  /** Why TMDB's popular people are missing (offline, no token), if they are. */
  popularUnavailable: string | null
}

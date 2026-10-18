import { z } from 'zod'

// Response shapes from developer.themoviedb.org (verified 2026-10-17). Fields are lenient:
// TMDB omits or nulls many of them, and unknown fields are ignored.

const str = z.string().nullish()
const num = z.number().nullish()

export const configurationSchema = z.object({
  images: z.object({
    secure_base_url: z.string().url(),
    poster_sizes: z.array(z.string()),
    backdrop_sizes: z.array(z.string()),
    still_sizes: z.array(z.string()),
    profile_sizes: z.array(z.string()),
  }),
})
export type TmdbConfiguration = z.infer<typeof configurationSchema>

export const movieResultSchema = z.object({
  id: z.number().int(),
  title: z.string(),
  original_title: str,
  release_date: str,
  poster_path: str,
  overview: str,
  original_language: str,
  popularity: num,
  vote_count: num,
})

export const tvResultSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  original_name: str,
  first_air_date: str,
  poster_path: str,
  overview: str,
  original_language: str,
  popularity: num,
  vote_count: num,
})

const page = <T extends z.ZodType>(item: T) =>
  z.object({ page: z.number(), results: z.array(item), total_results: z.number() })

/** Items of TMDB list and trending endpoints; trending "all" mixes movies, shows, and people. */
export const listItemSchema = z.object({
  id: z.number().int(),
  media_type: str,
  title: str,
  name: str,
  release_date: str,
  first_air_date: str,
  poster_path: str,
  backdrop_path: str,
  overview: str,
  popularity: num,
  vote_average: num,
  vote_count: num,
  adult: z.boolean().nullish(),
})
export const listSchema = page(listItemSchema)
export type TmdbListItem = z.infer<typeof listItemSchema>

export const movieSearchSchema = page(movieResultSchema)
export const tvSearchSchema = page(tvResultSchema)
export type TmdbMovieResult = z.infer<typeof movieResultSchema>
export type TmdbTvResult = z.infer<typeof tvResultSchema>

const genres = z.array(z.object({ name: z.string() })).nullish()
const companies = z.array(z.object({ name: z.string() })).nullish()
const credits = z
  .object({
    cast: z
      .array(z.object({ name: z.string(), character: str, profile_path: str, order: num }))
      .nullish(),
    crew: z.array(z.object({ name: z.string(), job: str })).nullish(),
  })
  .nullish()

export const movieDetailsSchema = z.object({
  id: z.number().int(),
  imdb_id: str,
  title: z.string(),
  original_title: str,
  overview: str,
  release_date: str,
  runtime: num,
  genres,
  poster_path: str,
  backdrop_path: str,
  vote_average: num,
  vote_count: num,
  original_language: str,
  production_companies: companies,
  credits,
  external_ids: z.object({ imdb_id: str }).nullish(),
})
export type TmdbMovieDetails = z.infer<typeof movieDetailsSchema>

export const tvDetailsSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  original_name: str,
  overview: str,
  first_air_date: str,
  episode_run_time: z.array(z.number()).nullish(),
  genres,
  poster_path: str,
  backdrop_path: str,
  vote_average: num,
  vote_count: num,
  original_language: str,
  created_by: z.array(z.object({ name: z.string() })).nullish(),
  networks: companies,
  credits,
  external_ids: z.object({ imdb_id: str, tvdb_id: num }).nullish(),
})
export type TmdbTvDetails = z.infer<typeof tvDetailsSchema>

export const seasonDetailsSchema = z.object({
  season_number: num,
  episodes: z.array(
    z.object({
      episode_number: z.number().int(),
      season_number: z.number().int(),
      name: str,
      overview: str,
      air_date: str,
      still_path: str,
      runtime: num,
    }),
  ),
})
export type TmdbSeasonDetails = z.infer<typeof seasonDetailsSchema>

/** /movie/{id}/videos and /tv/{id}/videos. */
export const videosSchema = z.object({
  results: z.array(
    z.object({
      key: z.string(),
      site: str,
      type: str,
      official: z.boolean().nullish(),
      name: str,
      published_at: str,
    }),
  ),
})
export type TmdbVideo = z.infer<typeof videosSchema>['results'][number]

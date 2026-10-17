import { z } from 'zod'

export const subtitleProviderIds = ['opensubtitles', 'subsource'] as const
export type SubtitleProviderId = (typeof subtitleProviderIds)[number]

export interface ProviderCapabilities {
  byImdbId: boolean
  byTmdbId: boolean
  byFileHash: boolean
  /** Can filter results to a specific season and episode. */
  episodeFilter: boolean
  hearingImpairedFilter: boolean
  /** Downloads count against a per-user or per-key quota. */
  downloadQuota: boolean
}

export interface ProviderStatus {
  id: SubtitleProviderId
  name: string
  enabled: boolean
  configured: boolean
  /** Result of the last connection check or request, if any. */
  ok: boolean | null
  message: string | null
  quota: { remaining: number; resetsAt: string | null } | null
  capabilities: ProviderCapabilities
}

/**
 * One search result. Only fields the provider actually returned are set; nothing is
 * estimated except `confidence`, which is Frame's own ranking score.
 */
export interface SubtitleResult {
  provider: SubtitleProviderId
  /** Provider-specific identifier used for download. */
  id: string
  language: string | null
  languageLabel: string
  releaseName: string | null
  fileName: string | null
  format: string | null
  downloads: number | null
  /** Provider rating as reported, with its scale described in `ratingLabel`. */
  ratingLabel: string | null
  hearingImpaired: boolean | null
  forced: boolean | null
  fps: number | null
  /** True only when the provider confirmed a file-hash match. */
  hashMatch: boolean | null
  machineTranslated: boolean | null
  aiTranslated: boolean | null
  trustedUploader: boolean | null
  uploadedAt: string | null
  confidence: number
  /** Short human-readable reasons behind the confidence. */
  reasons: string[]
}

export const subtitleTargetSchema = z.union([
  z.object({ fileId: z.number().int().positive() }).strict(),
  /** The file currently loaded in the player. */
  z.object({ current: z.literal(true) }).strict(),
])
export type SubtitleTarget = z.infer<typeof subtitleTargetSchema>

export const subtitleSearchSchema = z
  .object({
    target: subtitleTargetSchema,
    languages: z
      .array(z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/))
      .min(1)
      .max(5),
    /** Free-text override; defaults to the parsed or matched title. */
    query: z.string().trim().max(200).optional(),
    season: z.number().int().min(0).max(1000).optional(),
    episode: z.number().int().min(0).max(10000).optional(),
    hearingImpaired: z.enum(['include', 'exclude', 'only']),
    providers: z.array(z.enum(subtitleProviderIds)).min(1).max(2),
  })
  .strict()
export type SubtitleSearch = z.infer<typeof subtitleSearchSchema>

export interface SubtitleSearchResponse {
  results: SubtitleResult[]
  /** Per-provider failures; other providers' results are still returned. */
  errors: { provider: SubtitleProviderId; message: string }[]
  /** What was sent, so the user can see exactly what left the computer. */
  sent: { provider: SubtitleProviderId; summary: string }[]
}

export const subtitleDownloadSchema = z
  .object({
    target: subtitleTargetSchema,
    provider: z.enum(subtitleProviderIds),
    resultId: z.string().min(1).max(200),
    language: z
      .string()
      .regex(/^[a-z]{2}(?:-[A-Z]{2})?$/)
      .nullable(),
    hearingImpaired: z.boolean().nullable(),
    forced: z.boolean().nullable(),
    /** Replace an existing file with the same name (only after the user agreed). */
    overwrite: z.boolean(),
  })
  .strict()
export type SubtitleDownload = z.infer<typeof subtitleDownloadSchema>

export type SubtitleDownloadResult =
  | {
      status: 'saved'
      path: string
      loadedIntoPlayer: boolean
      format: string
      sourceEncoding: string
    }
  | { status: 'exists'; path: string }
  | { status: 'cancelled' }

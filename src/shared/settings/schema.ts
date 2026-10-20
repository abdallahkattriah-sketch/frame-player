import { z } from 'zod'
import { defaultVideoExtensions } from '../constants/media'
import { sortKeys } from '../contracts/library'
import {
  defaultSubtitleAppearance,
  subtitleAppearanceBaseSchema,
  subtitleAppearanceSchema,
} from './subtitle-style'
import { appearanceSettingsSchema, defaultAppearance } from './theme'
import { shortcutOverridesSchema } from './shortcuts'

export const shortcutSettingsSchema = z.object({
  /** Differences from the default shortcuts. */
  bindings: shortcutOverridesSchema,
})

export const playbackSettingsSchema = z.object({
  resumePlayback: z.boolean(),
  seekStepSeconds: z.number().int().min(1).max(300),
  /** Percentage of runtime after which an item counts as watched. */
  completionThresholdPercent: z.number().int().min(50).max(100),
  defaultVolume: z.number().int().min(0).max(100),
  /** mpv --hwdec: auto-safe uses hardware decoding when known to be reliable. */
  hardwareDecoding: z.enum(['auto-safe', 'auto', 'no']),
  /** Generate preview images when hovering the timeline. */
  timelinePreviews: z.boolean(),
})

export const generalSettingsSchema = z.object({
  /** False until the first-run setup is finished or skipped. */
  setupComplete: z.boolean(),
  /** Page shown when Frame opens. */
  startView: z.enum(['home', 'movies', 'shows', 'all']),
})

export const privacySettingsSchema = z.object({
  onlineMetadataEnabled: z.boolean(),
  onlineSubtitlesEnabled: z.boolean(),
})

export const librarySettingsSchema = z.object({
  /** Lowercase file extensions without the dot. */
  videoExtensions: z
    .array(z.string().regex(/^[a-z0-9]{1,8}$/, 'Use letters and digits only, without a dot'))
    .min(1)
    .max(64),
})

export const viewPreferenceSchema = z.object({
  mode: z.enum(['grid', 'list']),
  sort: z.enum(sortKeys),
  direction: z.enum(['asc', 'desc']),
})
export type ViewPreference = z.infer<typeof viewPreferenceSchema>

export const uiSettingsSchema = z.object({
  /** Per-view layout and sort, keyed by view id (e.g. "movies"). */
  viewPreferences: z
    .record(z.string().regex(/^[a-z-]{1,40}$/), viewPreferenceSchema)
    .refine((prefs) => Object.keys(prefs).length <= 50, 'Too many view preferences'),
})

export const metadataSettingsSchema = z.object({
  /** TMDB language for titles and overviews, e.g. "en-US" or "ar-SA". */
  language: z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/, 'Use a code like en-US'),
  /** Identify new files automatically after scans. */
  autoIdentify: z.boolean(),
  /** Library searches also show matching movies and shows from TMDB. */
  searchTmdb: z.boolean(),
  /** Home, Movies, and TV Shows show trending and top lists from TMDB. */
  browseTmdb: z.boolean(),
  /** Details windows start the trailer (muted) by themselves. */
  autoplayTrailers: z.boolean(),
  /** Radar announces new releases of followed people (checked at startup and in Radar). */
  radarNotifications: z.boolean(),
})

const languageCode = z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/)

export const audioSettingsSchema = z.object({
  /** Preferred audio track languages, in order (mpv's choice among a file's tracks). */
  preferredLanguages: z.array(languageCode).max(5),
  /** Evens out loud and quiet passages (mpv dynaudnorm filter). */
  normalizeLoudness: z.boolean(),
})

export const subtitleSettingsSchema = z.object({
  /** In order of preference; the first available is selected automatically. */
  preferredLanguages: z.array(languageCode).min(1).max(5),
  hearingImpaired: z.enum(['include', 'exclude', 'only']),
  /** Load subtitle files found next to the video. */
  autoLoadLocal: z.boolean(),
  /** Send a fingerprint of the video file to providers that match by hash. */
  allowFileHash: z.boolean(),
  saveLocation: z.enum(['next-to-video', 'folder']),
  /** Set only through the folder picker (not through settings updates). */
  folder: z.string().max(32_767).nullable(),
  providers: z.object({ opensubtitles: z.boolean(), subsource: z.boolean() }),
})

export const appSettingsSchema = z.object({
  general: generalSettingsSchema,
  playback: playbackSettingsSchema,
  audio: audioSettingsSchema,
  library: librarySettingsSchema,
  metadata: metadataSettingsSchema,
  subtitles: subtitleSettingsSchema,
  subtitleStyle: subtitleAppearanceSchema,
  ui: uiSettingsSchema,
  appearance: appearanceSettingsSchema,
  shortcuts: shortcutSettingsSchema,
  privacy: privacySettingsSchema,
})

export type AppSettings = z.infer<typeof appSettingsSchema>
export type SettingsSection = keyof AppSettings

export const settingsSections = Object.keys(appSettingsSchema.shape) as SettingsSection[]

export const defaultSettings: AppSettings = {
  general: { setupComplete: false, startView: 'home' },
  playback: {
    resumePlayback: true,
    seekStepSeconds: 10,
    completionThresholdPercent: 90,
    defaultVolume: 80,
    hardwareDecoding: 'auto-safe',
    timelinePreviews: true,
  },
  audio: { preferredLanguages: [], normalizeLoudness: false },
  library: { videoExtensions: [...defaultVideoExtensions] },
  metadata: {
    language: 'en-US',
    autoIdentify: true,
    searchTmdb: true,
    browseTmdb: true,
    autoplayTrailers: true,
    radarNotifications: true,
  },
  subtitles: {
    preferredLanguages: ['en'],
    hearingImpaired: 'include',
    autoLoadLocal: true,
    allowFileHash: false,
    saveLocation: 'next-to-video',
    folder: null,
    providers: { opensubtitles: true, subsource: true },
  },
  subtitleStyle: defaultSubtitleAppearance,
  ui: { viewPreferences: {} },
  appearance: defaultAppearance,
  shortcuts: { bindings: {} },
  privacy: { onlineMetadataEnabled: true, onlineSubtitlesEnabled: true },
}

/** A partial update: any section, any subset of its fields. Unknown keys are rejected. */
export const settingsPatchSchema = z
  .object({
    general: generalSettingsSchema.partial().strict().optional(),
    playback: playbackSettingsSchema.partial().strict().optional(),
    audio: audioSettingsSchema.partial().strict().optional(),
    library: librarySettingsSchema.partial().strict().optional(),
    ui: uiSettingsSchema.partial().strict().optional(),
    metadata: metadataSettingsSchema.partial().strict().optional(),
    // The folder is chosen with a native picker in the main process, never sent from the UI.
    subtitles: subtitleSettingsSchema.omit({ folder: true }).partial().strict().optional(),
    subtitleStyle: subtitleAppearanceBaseSchema.partial().strict().optional(),
    appearance: appearanceSettingsSchema.partial().strict().optional(),
    shortcuts: shortcutSettingsSchema.partial().strict().optional(),
    privacy: privacySettingsSchema.partial().strict().optional(),
  })
  .strict()

export type SettingsPatch = z.infer<typeof settingsPatchSchema>

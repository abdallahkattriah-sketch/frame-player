import { z } from 'zod'
import { defaultVideoExtensions } from '../constants/media'

export const playbackSettingsSchema = z.object({
  resumePlayback: z.boolean(),
  seekStepSeconds: z.number().int().min(1).max(300),
  /** Percentage of runtime after which an item counts as watched. */
  completionThresholdPercent: z.number().int().min(50).max(100),
  defaultVolume: z.number().int().min(0).max(100),
  /** mpv --hwdec: auto-safe uses hardware decoding when known to be reliable. */
  hardwareDecoding: z.enum(['auto-safe', 'auto', 'no']),
})

export const appearanceSettingsSchema = z.object({
  themeId: z.string().min(1).max(64),
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

export const appSettingsSchema = z.object({
  playback: playbackSettingsSchema,
  library: librarySettingsSchema,
  appearance: appearanceSettingsSchema,
  privacy: privacySettingsSchema,
})

export type AppSettings = z.infer<typeof appSettingsSchema>
export type SettingsSection = keyof AppSettings

export const settingsSections = Object.keys(appSettingsSchema.shape) as SettingsSection[]

export const defaultSettings: AppSettings = {
  playback: {
    resumePlayback: true,
    seekStepSeconds: 10,
    completionThresholdPercent: 90,
    defaultVolume: 80,
    hardwareDecoding: 'auto-safe',
  },
  library: { videoExtensions: [...defaultVideoExtensions] },
  appearance: { themeId: 'midnight-cinema' },
  privacy: { onlineMetadataEnabled: true, onlineSubtitlesEnabled: true },
}

/** A partial update: any section, any subset of its fields. Unknown keys are rejected. */
export const settingsPatchSchema = z
  .object({
    playback: playbackSettingsSchema.partial().strict().optional(),
    library: librarySettingsSchema.partial().strict().optional(),
    appearance: appearanceSettingsSchema.partial().strict().optional(),
    privacy: privacySettingsSchema.partial().strict().optional(),
  })
  .strict()

export type SettingsPatch = z.infer<typeof settingsPatchSchema>

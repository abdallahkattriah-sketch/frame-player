import { z } from 'zod'

export const playbackSettingsSchema = z.object({
  resumePlayback: z.boolean(),
  seekStepSeconds: z.number().int().min(1).max(300),
  /** Percentage of runtime after which an item counts as watched. */
  completionThresholdPercent: z.number().int().min(50).max(100),
  defaultVolume: z.number().int().min(0).max(100),
})

export const appearanceSettingsSchema = z.object({
  themeId: z.string().min(1).max(64),
})

export const privacySettingsSchema = z.object({
  onlineMetadataEnabled: z.boolean(),
  onlineSubtitlesEnabled: z.boolean(),
})

export const appSettingsSchema = z.object({
  playback: playbackSettingsSchema,
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
  },
  appearance: { themeId: 'midnight-cinema' },
  privacy: { onlineMetadataEnabled: true, onlineSubtitlesEnabled: true },
}

/** A partial update: any section, any subset of its fields. Unknown keys are rejected. */
export const settingsPatchSchema = z
  .object({
    playback: playbackSettingsSchema.partial().strict().optional(),
    appearance: appearanceSettingsSchema.partial().strict().optional(),
    privacy: privacySettingsSchema.partial().strict().optional(),
  })
  .strict()

export type SettingsPatch = z.infer<typeof settingsPatchSchema>

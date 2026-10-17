import { z } from 'zod'

const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Use a color like #FFFFFF')
const percent = z.number().int().min(0).max(100)

/**
 * Subtitle appearance. Each field maps to an mpv option (see subtitle-style-properties.ts in
 * the main process); nothing here touches subtitle files.
 */
export const subtitleStyleSchema = z.object({
  /** A font installed on the system; mpv falls back to another font if it is missing. */
  font: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[^\p{Cc}]+$/u, 'Font names cannot contain control characters'),
  /** In mpv's units: the size for a 720-pixel-high window, scaled with the window. */
  fontSize: z.number().min(10).max(120),
  /** Multiplies the size, including for styled (ASS) subtitles unless they are kept as-is. */
  scale: z.number().min(0.5).max(3),
  bold: z.boolean(),
  italic: z.boolean(),
  textColor: hexColor,
  outlineColor: hexColor,
  outlineSize: z.number().min(0).max(10),
  /** Used when there is no background box (mpv shares one color for shadow and box). */
  shadowOffset: z.number().min(0).max(10),
  shadowColor: hexColor,
  shadowOpacity: percent,
  background: z.enum(['none', 'box']),
  backgroundColor: hexColor,
  backgroundOpacity: percent,
  /** Vertical position: 100 is the bottom of the video, 0 the top. */
  position: z.number().int().min(0).max(150),
  /** Distance from the bottom edge, in the same units as the font size. */
  marginY: z.number().int().min(0).max(200),
  /**
   * Styled (ASS) subtitles carry their own fonts and positions: keep them, scale them only,
   * or replace their style with this one.
   */
  styledSubtitles: z.enum(['keep', 'scale', 'override']),
})

export type SubtitleStyle = z.infer<typeof subtitleStyleSchema>

export const subtitleProfileSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  name: z.string().trim().min(1).max(60),
  style: subtitleStyleSchema,
})

export type SubtitleProfile = z.infer<typeof subtitleProfileSchema>

export const subtitleAppearanceBaseSchema = z.object({
  activeProfileId: z.string().regex(/^[a-z0-9-]{1,40}$/),
  profiles: z.array(subtitleProfileSchema).min(1).max(30),
})

export const subtitleAppearanceSchema = subtitleAppearanceBaseSchema
  .refine((a) => new Set(a.profiles.map((p) => p.id)).size === a.profiles.length, {
    message: 'Profile ids must be unique',
  })
  .refine((a) => a.profiles.some((p) => p.id === a.activeProfileId), {
    message: 'The active profile must exist',
  })

export type SubtitleAppearance = z.infer<typeof subtitleAppearanceSchema>

/** mpv's own defaults, with a font that covers Arabic and Latin scripts on Windows. */
export const standardSubtitleStyle: SubtitleStyle = {
  font: 'Segoe UI',
  fontSize: 38,
  scale: 1,
  bold: false,
  italic: false,
  textColor: '#FFFFFF',
  outlineColor: '#000000',
  outlineSize: 1.6,
  shadowOffset: 0,
  shadowColor: '#000000',
  shadowOpacity: 70,
  background: 'none',
  backgroundColor: '#000000',
  backgroundOpacity: 60,
  position: 100,
  marginY: 34,
  styledSubtitles: 'scale',
}

export const builtInSubtitleProfiles: SubtitleProfile[] = [
  { id: 'standard', name: 'Standard', style: standardSubtitleStyle },
  {
    id: 'arabic-movies',
    name: 'Arabic movies',
    style: { ...standardSubtitleStyle, fontSize: 44, bold: true, outlineSize: 2, shadowOffset: 1 },
  },
  {
    id: 'english-movies',
    name: 'English movies',
    style: { ...standardSubtitleStyle, fontSize: 40, shadowOffset: 1 },
  },
  {
    id: 'anime',
    name: 'Anime',
    style: { ...standardSubtitleStyle, fontSize: 40, outlineSize: 2.5, styledSubtitles: 'keep' },
  },
  {
    id: 'high-contrast',
    name: 'High contrast',
    style: {
      ...standardSubtitleStyle,
      fontSize: 44,
      bold: true,
      textColor: '#FFFF00',
      background: 'box',
      backgroundOpacity: 85,
    },
  },
  {
    id: 'minimal',
    name: 'Minimal',
    style: { ...standardSubtitleStyle, fontSize: 32, outlineSize: 0.8, textColor: '#F0EEE9' },
  },
]

export const defaultSubtitleAppearance: SubtitleAppearance = {
  activeProfileId: 'standard',
  profiles: builtInSubtitleProfiles,
}

export function activeSubtitleStyle(appearance: SubtitleAppearance): SubtitleStyle {
  return (
    appearance.profiles.find((p) => p.id === appearance.activeProfileId)?.style ??
    standardSubtitleStyle
  )
}

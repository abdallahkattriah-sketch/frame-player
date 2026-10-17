import { z } from 'zod'

const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Use a 6-digit hex color like #1B1E25')

/** Semantic color tokens. Every UI color is derived from these. */
export const themeColorKeys = [
  'bg',
  'surface',
  'elevated',
  'raised',
  'text',
  'textMuted',
  'textSubtle',
  'border',
  'accent',
  'danger',
] as const
export type ThemeColorKey = (typeof themeColorKeys)[number]

export const themeColorLabels: Record<ThemeColorKey, string> = {
  bg: 'Background',
  surface: 'Surface (sidebar, cards)',
  elevated: 'Elevated (hover, menus)',
  raised: 'Raised (pressed, selected)',
  text: 'Text',
  textMuted: 'Secondary text',
  textSubtle: 'Hint text',
  border: 'Borders',
  accent: 'Accent',
  danger: 'Danger',
}

export const themeColorsSchema = z
  .object(
    Object.fromEntries(themeColorKeys.map((k) => [k, hex])) as Record<ThemeColorKey, typeof hex>,
  )
  .strict()
export type ThemeColors = z.infer<typeof themeColorsSchema>

const themeId = z.string().regex(/^[a-z0-9-]{1,40}$/)
const themeName = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .regex(/^[^\p{Cc}]+$/u)

export const themeSchema = z
  .object({ id: themeId, name: themeName, colors: themeColorsSchema })
  .strict()
export type Theme = z.infer<typeof themeSchema>

/**
 * Theme files are data only: a name and hex colors. Anything else (CSS, scripts, URLs, extra
 * keys) is rejected.
 */
export const themeFileSchema = z
  .object({
    format: z.literal('frame-theme'),
    version: z.literal(1),
    name: themeName,
    colors: themeColorsSchema,
  })
  .strict()
export type ThemeFile = z.infer<typeof themeFileSchema>

export const MAX_THEME_FILE_BYTES = 64 * 1024

export const builtInThemes: Theme[] = [
  {
    id: 'midnight-cinema',
    name: 'Midnight Cinema',
    colors: {
      bg: '#14161B',
      surface: '#1B1E25',
      elevated: '#242832',
      raised: '#303541',
      text: '#F0EEE9',
      textMuted: '#A9ADB7',
      textSubtle: '#777E8B',
      border: '#363B46',
      accent: '#E5A15B',
      danger: '#E36D68',
    },
  },
  {
    id: 'oled-black',
    name: 'OLED Black',
    colors: {
      bg: '#000000',
      surface: '#0B0B0D',
      elevated: '#17171B',
      raised: '#24242A',
      text: '#F2F2F2',
      textMuted: '#A6A6AD',
      textSubtle: '#7A7A82',
      border: '#2A2A30',
      accent: '#E5A15B',
      danger: '#F07470',
    },
  },
  {
    id: 'slate-blue',
    name: 'Slate Blue',
    colors: {
      bg: '#161B24',
      surface: '#1C2330',
      elevated: '#263042',
      raised: '#313D54',
      text: '#E8ECF3',
      textMuted: '#A5B0C2',
      textSubtle: '#7A869A',
      border: '#334057',
      accent: '#7FB2F0',
      danger: '#EE7A74',
    },
  },
  {
    id: 'daylight',
    name: 'Daylight',
    colors: {
      bg: '#F6F5F2',
      surface: '#FFFFFF',
      elevated: '#ECEAE5',
      raised: '#E0DDD6',
      text: '#1D1F24',
      textMuted: '#4F545E',
      textSubtle: '#6B707A',
      border: '#D5D2CA',
      accent: '#A85A12',
      danger: '#B3261E',
    },
  },
  {
    id: 'high-contrast',
    name: 'High Contrast',
    colors: {
      bg: '#000000',
      surface: '#000000',
      elevated: '#1A1A1A',
      raised: '#333333',
      text: '#FFFFFF',
      textMuted: '#E6E6E6',
      textSubtle: '#C8C8C8',
      border: '#FFFFFF',
      accent: '#FFD400',
      danger: '#FF6B6B',
    },
  },
]

export const DEFAULT_THEME_ID = 'midnight-cinema'

export const appearanceSettingsSchema = z.object({
  themeId,
  /** Themes the user created or imported (built-in themes are not stored). */
  customThemes: z.array(themeSchema).max(30),
  /** Replaces the theme's accent color when set. */
  accentOverride: hex.nullable(),
  fontFamily: z.enum(['segoe-variable', 'segoe', 'tahoma', 'arial']),
  /** Scales all text and spacing (browser zoom-like). */
  fontScale: z.number().min(0.85).max(1.3),
  density: z.enum(['compact', 'comfortable', 'spacious']),
  sidebarWidth: z.number().int().min(180).max(320),
  posterSize: z.enum(['small', 'medium', 'large']),
  animations: z.enum(['full', 'reduced', 'off']),
  /** Player controls hide while playing, or stay visible. */
  playerControls: z.enum(['auto-hide', 'always']),
})
export type AppearanceSettings = z.infer<typeof appearanceSettingsSchema>

export const defaultAppearance: AppearanceSettings = {
  themeId: DEFAULT_THEME_ID,
  customThemes: [],
  accentOverride: null,
  fontFamily: 'segoe-variable',
  fontScale: 1,
  density: 'comfortable',
  sidebarWidth: 220,
  posterSize: 'medium',
  animations: 'full',
  playerControls: 'auto-hide',
}

export function findTheme(appearance: Pick<AppearanceSettings, 'themeId' | 'customThemes'>): Theme {
  const all = [...builtInThemes, ...appearance.customThemes]
  return all.find((t) => t.id === appearance.themeId) ?? (builtInThemes[0] as Theme)
}

/** WCAG relative luminance of a #RRGGBB color. */
export function luminance(color: string): number {
  const n = Number.parseInt(color.slice(1), 16)
  const channel = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return (
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  )
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

export interface ContrastWarning {
  pair: string
  ratio: number
  minimum: number
}

/**
 * Color pairs the UI actually uses, checked against WCAG AA (4.5:1 for text, 3:1 for large
 * text and controls).
 */
export function contrastWarnings(colors: ThemeColors): ContrastWarning[] {
  const checks: [string, string, string, number][] = [
    ['Text on background', colors.text, colors.bg, 4.5],
    ['Text on surface', colors.text, colors.surface, 4.5],
    ['Secondary text on background', colors.textMuted, colors.bg, 4.5],
    ['Secondary text on surface', colors.textMuted, colors.surface, 4.5],
    ['Hint text on background', colors.textSubtle, colors.bg, 3],
    ['Accent on background', colors.accent, colors.bg, 3],
    ['Background-colored text on accent buttons', colors.bg, colors.accent, 4.5],
    ['Danger on background', colors.danger, colors.bg, 3],
  ]
  return checks
    .map(([pair, fg, bg, minimum]) => ({ pair, ratio: contrastRatio(fg, bg), minimum }))
    .filter((c) => c.ratio < c.minimum)
}

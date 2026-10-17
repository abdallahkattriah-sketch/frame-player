import {
  findTheme,
  luminance,
  type AppearanceSettings,
  type ThemeColorKey,
} from '@shared/settings/theme'

const cssVariable: Record<ThemeColorKey, string> = {
  bg: '--frame-bg',
  surface: '--frame-surface',
  elevated: '--frame-elevated',
  raised: '--frame-raised',
  text: '--frame-text',
  textMuted: '--frame-text-muted',
  textSubtle: '--frame-text-subtle',
  border: '--frame-border',
  accent: '--frame-accent',
  danger: '--frame-danger',
}

const fontStacks: Record<AppearanceSettings['fontFamily'], string> = {
  'segoe-variable': "'Segoe UI Variable', 'Segoe UI', system-ui, sans-serif",
  segoe: "'Segoe UI', system-ui, sans-serif",
  tahoma: 'Tahoma, Geneva, sans-serif',
  arial: 'Arial, Helvetica, sans-serif',
}

/** Tailwind derives every padding, margin, and gap from --spacing. */
const spacing: Record<AppearanceSettings['density'], string> = {
  compact: '0.21rem',
  comfortable: '0.25rem',
  spacious: '0.3rem',
}

export const posterWidths: Record<AppearanceSettings['posterSize'], number> = {
  small: 120,
  medium: 150,
  large: 195,
}

/** Writes the appearance settings as CSS variables on the document. */
export function applyAppearance(
  appearance: AppearanceSettings,
  root: HTMLElement = document.documentElement,
): void {
  const theme = findTheme(appearance)
  const colors = { ...theme.colors, accent: appearance.accentOverride ?? theme.colors.accent }
  for (const key of Object.keys(cssVariable) as ThemeColorKey[]) {
    root.style.setProperty(cssVariable[key], colors[key])
  }
  root.style.setProperty('color-scheme', luminance(colors.bg) > 0.4 ? 'light' : 'dark')
  root.style.setProperty('--frame-font-sans', fontStacks[appearance.fontFamily])
  root.style.setProperty('--spacing', spacing[appearance.density])
  root.style.setProperty('--frame-sidebar-width', `${appearance.sidebarWidth}px`)
  root.style.setProperty('--frame-poster-width', `${posterWidths[appearance.posterSize]}px`)
  root.style.fontSize = `${Math.round(appearance.fontScale * 100)}%`
  root.dataset['motion'] = appearance.animations
  root.dataset['theme'] = theme.id
}

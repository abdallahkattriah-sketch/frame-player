import { describe, expect, it } from 'vitest'
import {
  assignBinding,
  bindingFromEvent,
  bindingIndex,
  effectiveShortcuts,
  findConflict,
  formatBinding,
  listConflicts,
  removeBinding,
  resetBinding,
  shortcutActions,
  shortcutOverridesSchema,
} from '@shared/settings/shortcuts'
import {
  builtInThemes,
  contrastRatio,
  contrastWarnings,
  defaultAppearance,
  findTheme,
} from '@shared/settings/theme'
import { appSettingsSchema, defaultSettings } from '@shared/settings/schema'
import {
  parseShortcutFile,
  parseThemeFile,
  shortcutsToFile,
  themeToFile,
} from '../../../src/main/application/settings-files'

const press = (
  key: string,
  mods: Partial<Record<'ctrlKey' | 'altKey' | 'shiftKey', boolean>> = {},
) => bindingFromEvent({ key, ctrlKey: false, altKey: false, shiftKey: false, ...mods })

describe('shortcut bindings', () => {
  it('normalizes key presses', () => {
    expect(press(' ')).toBe('Space')
    expect(press('k')).toBe('K')
    expect(press('X', { shiftKey: true })).toBe('Shift+X')
    expect(press('k', { ctrlKey: true, shiftKey: true })).toBe('Ctrl+Shift+K')
    expect(press(',', { ctrlKey: true })).toBe('Ctrl+,')
    expect(press('ArrowLeft', { shiftKey: true })).toBe('Shift+ArrowLeft')
    for (const ignored of ['Shift', 'Control', 'Escape', 'Dead', 'MediaPlayPause']) {
      expect(press(ignored)).toBeNull()
    }
    expect(
      bindingFromEvent({ key: 'k', ctrlKey: false, altKey: false, shiftKey: false, metaKey: true }),
    ).toBeNull()
  })

  it('formats bindings for display', () => {
    expect(formatBinding('Ctrl+Shift+P')).toBe('Ctrl + Shift + P')
    expect(formatBinding('Shift+ArrowRight')).toBe('Shift + →')
    expect(formatBinding('Ctrl++')).toBe('Ctrl + +')
    expect(formatBinding('+')).toBe('+')
  })

  it('ships defaults without conflicts', () => {
    const map = effectiveShortcuts({})
    expect(listConflicts(map)).toEqual([])
    expect(shortcutOverridesSchema.safeParse({}).success).toBe(true)
    for (const action of shortcutActions) {
      for (const binding of action.defaults) {
        expect(shortcutOverridesSchema.safeParse({ [action.id]: [binding] }).success, binding).toBe(
          true,
        )
      }
    }
  })

  it('detects conflicts and moves a binding when the user confirms', () => {
    const map = effectiveShortcuts({})
    expect(findConflict(map, 'M', 'screenshot')).toBe('mute')
    let overrides = assignBinding({}, 'screenshot', 'M')
    const next = effectiveShortcuts(overrides)
    expect(next.screenshot).toEqual(['S', 'M'])
    expect(next.mute).toEqual([])
    expect(listConflicts(next)).toEqual([])
    // Only differences from the defaults are stored.
    expect(Object.keys(overrides).sort()).toEqual(['mute', 'screenshot'])
    overrides = removeBinding(overrides, 'screenshot', 'S')
    expect(effectiveShortcuts(overrides).screenshot).toEqual(['M'])
    // Resetting screenshot takes S back and leaves M with screenshot's old owner... none.
    overrides = resetBinding(overrides, 'mute')
    const reset = effectiveShortcuts(overrides)
    expect(reset.mute).toEqual(['M'])
    expect(reset.screenshot).toEqual([])
    expect(listConflicts(reset)).toEqual([])
  })

  it('looks up bindings per window', () => {
    const map = effectiveShortcuts({})
    const player = bindingIndex(map, 'player')
    expect(player.get('Space')).toBe('play-pause')
    expect(player.get('Ctrl+K')).toBe('command-palette')
    const app = bindingIndex(map, 'app')
    expect(app.get('Space')).toBeUndefined()
    expect(app.get('Ctrl+,')).toBe('open-settings')
  })

  it('validates shortcut files', () => {
    const overrides = assignBinding({}, 'mute', 'Ctrl+M')
    const round = parseShortcutFile(shortcutsToFile(overrides))
    expect(round).toEqual({ ok: true, value: overrides })
    for (const bad of [
      'not json',
      '{"format":"frame-shortcuts","version":1,"bindings":{"rm-rf":["X"]}}',
      '{"format":"frame-shortcuts","version":1,"bindings":{"mute":["Ctrl+Meta+Ü+X"]}}',
      '{"format":"frame-shortcuts","version":2,"bindings":{}}',
      '{"format":"frame-shortcuts","version":1,"bindings":{},"script":"alert(1)"}',
    ]) {
      expect(parseShortcutFile(bad).ok, bad).toBe(false)
    }
  })
})

describe('themes', () => {
  it('ships Midnight Cinema as the default and readable built-in themes', () => {
    expect(findTheme(defaultAppearance).colors).toMatchObject({
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
    })
    for (const theme of builtInThemes) {
      expect(contrastWarnings(theme.colors), theme.name).toEqual([])
    }
    expect(findTheme({ themeId: 'deleted', customThemes: [] }).id).toBe('midnight-cinema')
  })

  it('computes WCAG contrast and warns about unreadable colors', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0)
    const [midnight] = builtInThemes
    if (!midnight) throw new Error('no themes')
    const warnings = contrastWarnings({ ...midnight.colors, textMuted: '#2A2D33' })
    expect(warnings.map((w) => w.pair)).toContain('Secondary text on background')
  })

  it('accepts only data in theme files', () => {
    const [midnight] = builtInThemes
    if (!midnight) throw new Error('no themes')
    const file = themeToFile(midnight)
    expect(parseThemeFile(file)).toMatchObject({ ok: true, value: { name: 'Midnight Cinema' } })
    expect(parseThemeFile(`\uFEFF${file}`).ok).toBe(true)
    const base = JSON.parse(file) as Record<string, unknown>
    const colors = base['colors'] as Record<string, string>
    for (const bad of [
      { ...base, colors: { ...colors, bg: 'url(javascript:alert(1))' } },
      { ...base, colors: { ...colors, bg: '#12345' } },
      { ...base, colors: { ...colors, extra: '#FFFFFF' } },
      { ...base, css: 'body{display:none}' },
      { ...base, name: '' },
      { ...base, format: 'other' },
    ]) {
      expect(parseThemeFile(JSON.stringify(bad)).ok, JSON.stringify(bad).slice(0, 80)).toBe(false)
    }
  })

  it('keeps the default settings valid', () => {
    expect(appSettingsSchema.safeParse(defaultSettings).success).toBe(true)
  })
})

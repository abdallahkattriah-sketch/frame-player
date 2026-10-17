import { describe, expect, it } from 'vitest'
import { initialPlayerState } from '@shared/contracts/player'
import { keyToAction, type KeymapContext } from '@renderer/features/player/player-keymap'
import { formatDelay, languageName, trackLabel } from '@renderer/features/player/track-label'

const key = (
  k: string,
  mods: Partial<{ shiftKey: boolean; ctrlKey: boolean; altKey: boolean }> = {},
) => ({
  key: k,
  shiftKey: false,
  ctrlKey: false,
  altKey: false,
  ...mods,
})

const ctx = (overrides: Partial<KeymapContext> = {}): KeymapContext => ({
  state: initialPlayerState,
  seekStepSeconds: 7,
  panelOpen: false,
  ...overrides,
})

describe('keyToAction', () => {
  it('uses the configured seek step, and a long seek with Shift', () => {
    expect(keyToAction(key('ArrowRight'), ctx())).toEqual({
      type: 'seek',
      mode: 'relative',
      seconds: 7,
    })
    expect(keyToAction(key('ArrowLeft', { shiftKey: true }), ctx())).toEqual({
      type: 'seek',
      mode: 'relative',
      seconds: -60,
    })
  })

  it('clamps volume and speed and rounds floating-point steps', () => {
    const loud = ctx({ state: { ...initialPlayerState, volume: 128 } })
    expect(keyToAction(key('ArrowUp'), loud)).toEqual({ type: 'set-volume', volume: 130 })
    const fast = ctx({ state: { ...initialPlayerState, speed: 1.2 } })
    expect(keyToAction(key(']'), fast)).toEqual({ type: 'set-speed', speed: 1.3 })
    const max = ctx({ state: { ...initialPlayerState, speed: 4 } })
    expect(keyToAction(key(']'), max)).toEqual({ type: 'set-speed', speed: 4 })
  })

  it('adjusts subtitle and audio delays in 100 ms steps', () => {
    const c = ctx({ state: { ...initialPlayerState, subtitleDelay: 0.2, audioDelay: -0.1 } })
    expect(keyToAction(key('x'), c)).toEqual({ type: 'set-subtitle-delay', seconds: 0.3 })
    expect(keyToAction(key('z'), c)).toEqual({ type: 'set-subtitle-delay', seconds: 0.1 })
    expect(keyToAction(key('X', { shiftKey: true }), c)).toEqual({
      type: 'set-audio-delay',
      seconds: 0,
    })
  })

  it('closes panels before leaving fullscreen on Escape', () => {
    const fs = { ...initialPlayerState, fullscreen: true }
    expect(keyToAction(key('Escape'), ctx({ state: fs, panelOpen: true }))).toEqual({
      type: 'close-panels',
    })
    expect(keyToAction(key('Escape'), ctx({ state: fs }))).toEqual({ type: 'toggle-fullscreen' })
    expect(keyToAction(key('Escape'), ctx())).toBeNull()
  })

  it('jumps between chapters and handles bookmark keys in the overlay', () => {
    expect(keyToAction(key('PageDown'), ctx())).toEqual({ type: 'chapter', direction: 'next' })
    expect(keyToAction(key('PageUp'), ctx())).toEqual({ type: 'chapter', direction: 'previous' })
    expect(keyToAction(key('b'), ctx())).toEqual({ type: 'add-bookmark' })
    expect(keyToAction(key('B', { shiftKey: true }), ctx())).toEqual({ type: 'toggle-bookmarks' })
  })

  it('ignores keys with Ctrl or Alt and unknown keys', () => {
    expect(keyToAction(key('k', { ctrlKey: true }), ctx())).toBeNull()
    expect(keyToAction(key('q'), ctx())).toBeNull()
  })
})

describe('track labels', () => {
  it('names languages and only reports flags mpv provides', () => {
    expect(languageName('ar')).toBe('Arabic')
    expect(languageName('zz-unknown')).toBe('ZZ-UNKNOWN')
    expect(
      trackLabel({
        id: 3,
        type: 'sub',
        title: null,
        lang: 'en',
        codec: 'subrip',
        selected: false,
        external: true,
        isDefault: false,
        forced: true,
      }),
    ).toBe('English (forced, external)')
    expect(
      trackLabel({
        id: 2,
        type: 'audio',
        title: null,
        lang: null,
        codec: null,
        selected: false,
        external: false,
        isDefault: false,
        forced: false,
      }),
    ).toBe('Track 2')
  })

  it('formats delays in milliseconds', () => {
    expect(formatDelay(0.1)).toBe('+100 ms')
    expect(formatDelay(-0.25)).toBe('-250 ms')
    expect(formatDelay(0)).toBe('0 ms')
  })
})

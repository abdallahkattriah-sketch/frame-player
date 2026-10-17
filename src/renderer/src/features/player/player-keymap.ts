import {
  MAX_SPEED,
  MIN_SPEED,
  type PlayerCommand,
  type PlayerState,
} from '@shared/contracts/player'
import {
  bindingFromEvent,
  bindingIndex,
  effectiveShortcuts,
  type KeyEventLike,
  type ShortcutActionId,
} from '@shared/settings/shortcuts'

/** UI-only actions handled in the overlay itself. */
export type OverlayAction =
  | { type: 'screenshot' }
  | { type: 'toggle-info' }
  | { type: 'toggle-playlist' }
  | { type: 'toggle-bookmarks' }
  | { type: 'add-bookmark' }
  | { type: 'toggle-subtitle-style' }
  | { type: 'open-audio-menu' }
  | { type: 'subtitle-search' }
  | { type: 'toggle-compact' }
  | { type: 'command-palette' }
  | { type: 'open-settings' }
  | { type: 'close-panels' }

export type PlayerAction = PlayerCommand | OverlayAction

export type KeyInput = KeyEventLike

export interface KeymapContext {
  state: Pick<
    PlayerState,
    'volume' | 'speed' | 'fullscreen' | 'subtitlesVisible' | 'subtitleDelay' | 'audioDelay'
  >
  seekStepSeconds: number
  panelOpen: boolean
  /** binding → action for the player window; defaults when omitted. */
  bindings?: ReadonlyMap<string, ShortcutActionId>
}

const SPEED_STEP = 0.1
const VOLUME_STEP = 5
const DELAY_STEP = 0.1
const LONG_SEEK_SECONDS = 60

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
const round = (v: number) => Math.round(v * 1000) / 1000

const defaultBindings = bindingIndex(effectiveShortcuts({}), 'player')

/** What a shortcut action does right now (some depend on the current state). */
export function actionFor(
  id: ShortcutActionId,
  ctx: Pick<KeymapContext, 'state' | 'seekStepSeconds'>,
): PlayerAction {
  const { state } = ctx
  switch (id) {
    case 'play-pause':
      return { type: 'toggle-pause' }
    case 'stop':
      return { type: 'stop' }
    case 'seek-forward':
      return { type: 'seek', mode: 'relative', seconds: ctx.seekStepSeconds }
    case 'seek-backward':
      return { type: 'seek', mode: 'relative', seconds: -ctx.seekStepSeconds }
    case 'seek-forward-long':
      return { type: 'seek', mode: 'relative', seconds: LONG_SEEK_SECONDS }
    case 'seek-backward-long':
      return { type: 'seek', mode: 'relative', seconds: -LONG_SEEK_SECONDS }
    case 'frame-forward':
      return { type: 'frame-step', direction: 'forward' }
    case 'frame-backward':
      return { type: 'frame-step', direction: 'backward' }
    case 'speed-up':
      return {
        type: 'set-speed',
        speed: round(clamp(state.speed + SPEED_STEP, MIN_SPEED, MAX_SPEED)),
      }
    case 'speed-down':
      return {
        type: 'set-speed',
        speed: round(clamp(state.speed - SPEED_STEP, MIN_SPEED, MAX_SPEED)),
      }
    case 'speed-reset':
      return { type: 'set-speed', speed: 1 }
    case 'next':
      return { type: 'playlist-next' }
    case 'previous':
      return { type: 'playlist-previous' }
    case 'next-chapter':
      return { type: 'chapter', direction: 'next' }
    case 'previous-chapter':
      return { type: 'chapter', direction: 'previous' }
    case 'fullscreen':
      return { type: 'toggle-fullscreen' }
    case 'screenshot':
      return { type: 'screenshot' }
    case 'volume-up':
      return { type: 'set-volume', volume: clamp(state.volume + VOLUME_STEP, 0, 130) }
    case 'volume-down':
      return { type: 'set-volume', volume: clamp(state.volume - VOLUME_STEP, 0, 130) }
    case 'mute':
      return { type: 'toggle-mute' }
    case 'audio-delay-up':
      return { type: 'set-audio-delay', seconds: round(state.audioDelay + DELAY_STEP) }
    case 'audio-delay-down':
      return { type: 'set-audio-delay', seconds: round(state.audioDelay - DELAY_STEP) }
    case 'subtitle-delay-up':
      return { type: 'set-subtitle-delay', seconds: round(state.subtitleDelay + DELAY_STEP) }
    case 'subtitle-delay-down':
      return { type: 'set-subtitle-delay', seconds: round(state.subtitleDelay - DELAY_STEP) }
    case 'toggle-subtitles':
      return { type: 'set-subtitles-visible', visible: !state.subtitlesVisible }
    case 'audio-menu':
      return { type: 'open-audio-menu' }
    case 'subtitle-search':
      return { type: 'subtitle-search' }
    case 'subtitle-style':
      return { type: 'toggle-subtitle-style' }
    case 'add-bookmark':
      return { type: 'add-bookmark' }
    case 'bookmarks':
      return { type: 'toggle-bookmarks' }
    case 'playlist':
      return { type: 'toggle-playlist' }
    case 'info':
      return { type: 'toggle-info' }
    case 'compact-controls':
      return { type: 'toggle-compact' }
    case 'command-palette':
      return { type: 'command-palette' }
    case 'open-settings':
      return { type: 'open-settings' }
  }
}

/** Maps a key press to an action using the user's shortcuts. Null for unbound keys. */
export function keyToAction(input: KeyInput, ctx: KeymapContext): PlayerAction | null {
  // Escape is fixed: it closes panels first, then leaves fullscreen.
  if (input.key === 'Escape' && !input.ctrlKey && !input.altKey && !input.shiftKey) {
    if (ctx.panelOpen) return { type: 'close-panels' }
    return ctx.state.fullscreen ? { type: 'toggle-fullscreen' } : null
  }
  const binding = bindingFromEvent(input)
  if (!binding) return null
  const id = (ctx.bindings ?? defaultBindings).get(binding)
  return id ? actionFor(id, ctx) : null
}

const overlayActionTypes = new Set<string>([
  'screenshot',
  'toggle-info',
  'toggle-playlist',
  'toggle-bookmarks',
  'add-bookmark',
  'toggle-subtitle-style',
  'open-audio-menu',
  'subtitle-search',
  'toggle-compact',
  'command-palette',
  'open-settings',
  'close-panels',
])

export function isOverlayAction(action: PlayerAction): action is OverlayAction {
  return overlayActionTypes.has(action.type)
}

/** Editing shortcuts that text fields need (copy, paste, undo, select all, ...). */
const textEditingBindings = new Set([
  'Ctrl+A',
  'Ctrl+C',
  'Ctrl+V',
  'Ctrl+X',
  'Ctrl+Z',
  'Ctrl+Y',
  'Ctrl+Shift+Z',
  'Ctrl+ArrowLeft',
  'Ctrl+ArrowRight',
  'Ctrl+Backspace',
  'Ctrl+Delete',
])

/**
 * While typing in a field, only Ctrl/Alt shortcuts that are not text-editing keys are
 * handled; everything else belongs to the field.
 */
export function shouldHandleWhileTyping(input: KeyInput): boolean {
  if (!input.ctrlKey && !input.altKey) return false
  const binding = bindingFromEvent(input)
  return binding !== null && !textEditingBindings.has(binding)
}

export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  return Boolean(
    el?.closest?.(
      'input:not([type=range]):not([type=checkbox]):not([type=color]), textarea, select, [contenteditable=true]',
    ),
  )
}

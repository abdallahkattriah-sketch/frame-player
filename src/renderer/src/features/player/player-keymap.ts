import {
  MAX_SPEED,
  MIN_SPEED,
  type PlayerCommand,
  type PlayerState,
} from '@shared/contracts/player'

/** UI-only actions handled in the overlay itself. */
export type OverlayAction =
  | { type: 'screenshot' }
  | { type: 'toggle-info' }
  | { type: 'toggle-playlist' }
  | { type: 'toggle-bookmarks' }
  | { type: 'add-bookmark' }
  | { type: 'close-panels' }

export type PlayerAction = PlayerCommand | OverlayAction

export interface KeyInput {
  key: string
  shiftKey: boolean
  ctrlKey: boolean
  altKey: boolean
}

export interface KeymapContext {
  state: Pick<
    PlayerState,
    'volume' | 'speed' | 'fullscreen' | 'subtitlesVisible' | 'subtitleDelay' | 'audioDelay'
  >
  seekStepSeconds: number
  panelOpen: boolean
}

const SPEED_STEP = 0.1
const VOLUME_STEP = 5
const DELAY_STEP = 0.1
const LONG_SEEK_SECONDS = 60

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
const round = (v: number) => Math.round(v * 1000) / 1000

/**
 * Default player shortcuts. Returns null for keys Frame does not handle.
 * (User-editable shortcuts arrive with the shortcut editor.)
 */
export function keyToAction(input: KeyInput, ctx: KeymapContext): PlayerAction | null {
  if (input.ctrlKey || input.altKey) return null
  const { state } = ctx
  const step = input.shiftKey ? LONG_SEEK_SECONDS : ctx.seekStepSeconds

  switch (input.key) {
    case ' ':
    case 'k':
      return { type: 'toggle-pause' }
    case 'ArrowRight':
      return { type: 'seek', mode: 'relative', seconds: step }
    case 'ArrowLeft':
      return { type: 'seek', mode: 'relative', seconds: -step }
    case 'ArrowUp':
      return { type: 'set-volume', volume: clamp(state.volume + VOLUME_STEP, 0, 130) }
    case 'ArrowDown':
      return { type: 'set-volume', volume: clamp(state.volume - VOLUME_STEP, 0, 130) }
    case 'm':
      return { type: 'toggle-mute' }
    case 'f':
      return { type: 'toggle-fullscreen' }
    case 'Escape':
      if (ctx.panelOpen) return { type: 'close-panels' }
      return state.fullscreen ? { type: 'toggle-fullscreen' } : null
    case '.':
      return { type: 'frame-step', direction: 'forward' }
    case ',':
      return { type: 'frame-step', direction: 'backward' }
    case ']':
      return {
        type: 'set-speed',
        speed: round(clamp(state.speed + SPEED_STEP, MIN_SPEED, MAX_SPEED)),
      }
    case '[':
      return {
        type: 'set-speed',
        speed: round(clamp(state.speed - SPEED_STEP, MIN_SPEED, MAX_SPEED)),
      }
    case 'Backspace':
      return { type: 'set-speed', speed: 1 }
    case 'n':
    case 'N':
      return { type: input.shiftKey ? 'playlist-previous' : 'playlist-next' }
    case 'v':
      return { type: 'set-subtitles-visible', visible: !state.subtitlesVisible }
    case 'x':
      return { type: 'set-subtitle-delay', seconds: round(state.subtitleDelay + DELAY_STEP) }
    case 'z':
      return { type: 'set-subtitle-delay', seconds: round(state.subtitleDelay - DELAY_STEP) }
    case 'X':
      return { type: 'set-audio-delay', seconds: round(state.audioDelay + DELAY_STEP) }
    case 'Z':
      return { type: 'set-audio-delay', seconds: round(state.audioDelay - DELAY_STEP) }
    case 's':
      return { type: 'screenshot' }
    case 'i':
      return { type: 'toggle-info' }
    case 'p':
      return { type: 'toggle-playlist' }
    case 'PageDown':
      return { type: 'chapter', direction: 'next' }
    case 'PageUp':
      return { type: 'chapter', direction: 'previous' }
    case 'b':
      return { type: 'add-bookmark' }
    case 'B':
      return { type: 'toggle-bookmarks' }
    default:
      return null
  }
}

export function isOverlayAction(action: PlayerAction): action is OverlayAction {
  return (
    action.type === 'screenshot' ||
    action.type === 'toggle-info' ||
    action.type === 'toggle-playlist' ||
    action.type === 'toggle-bookmarks' ||
    action.type === 'add-bookmark' ||
    action.type === 'close-panels'
  )
}

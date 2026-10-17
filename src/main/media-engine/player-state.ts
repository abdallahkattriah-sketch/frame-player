import type { PlayerCommand, PlayerState } from '@shared/contracts/player'
import type { MpvCommand } from './mpv-ipc-client'

/** mpv properties observed to build PlayerState. */
export const observedProperties = [
  'path',
  'media-title',
  'time-pos',
  'duration',
  'pause',
  'volume',
  'mute',
  'eof-reached',
  'idle-active',
  'vo-configured',
] as const

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)

/** Applies one mpv property change to the state. Unknown properties leave it unchanged. */
export function applyProperty(state: PlayerState, name: string, data: unknown): PlayerState {
  switch (name) {
    case 'path':
      return { ...state, path: str(data) }
    case 'media-title':
      return { ...state, title: str(data) }
    case 'time-pos':
      return { ...state, position: num(data) }
    case 'duration':
      return { ...state, duration: num(data) }
    case 'pause':
      return { ...state, paused: data === true }
    case 'volume':
      return { ...state, volume: num(data) ?? state.volume }
    case 'mute':
      return { ...state, muted: data === true }
    case 'eof-reached':
      return { ...state, eofReached: data === true }
    case 'vo-configured':
      return { ...state, videoActive: data === true }
    case 'idle-active':
      return data === true
        ? { ...state, status: state.status === 'error' ? 'error' : 'idle' }
        : { ...state, status: state.status === 'idle' ? 'loading' : state.status }
    default:
      return state
  }
}

/** Maps a validated renderer command to an mpv command. Fullscreen is handled by the window. */
export function toMpvCommand(command: PlayerCommand): MpvCommand | null {
  switch (command.type) {
    case 'toggle-pause':
      return ['cycle', 'pause']
    case 'set-pause':
      return ['set_property', 'pause', command.paused]
    case 'seek':
      return ['seek', command.seconds, command.mode === 'absolute' ? 'absolute+exact' : 'relative']
    case 'set-volume':
      return ['set_property', 'volume', command.volume]
    case 'toggle-mute':
      return ['cycle', 'mute']
    case 'stop':
      return ['stop']
    case 'toggle-fullscreen':
      return null
  }
}

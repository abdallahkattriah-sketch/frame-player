import type {
  AspectRatio,
  PlayerCommand,
  PlayerState,
  PlayerTrack,
  PlaylistItem,
  RepeatMode,
  VideoScaling,
} from '@shared/contracts/player'
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
  'speed',
  'eof-reached',
  'idle-active',
  'vo-configured',
  'track-list',
  'sub-visibility',
  'audio-delay',
  'sub-delay',
  'loop-file',
  'loop-playlist',
  'playlist',
  'playlist-pos',
  'video-aspect-override',
  'panscan',
  'keepaspect',
  'video-params',
  'video-codec',
  'audio-codec-name',
  'container-fps',
  'hwdec-current',
] as const

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** mpv reports loop options as false/"no", "inf", true, or a remaining count. */
export function isLooping(value: unknown): boolean {
  if (value === true || value === 'inf' || value === 'force') return true
  return typeof value === 'number' && value > 0
}

export function parseTracks(value: unknown): PlayerTrack[] {
  if (!Array.isArray(value)) return []
  const tracks: PlayerTrack[] = []
  for (const t of value) {
    if (!isRecord(t)) continue
    const id = num(t['id'])
    const type = t['type']
    if (id === null || (type !== 'video' && type !== 'audio' && type !== 'sub')) continue
    tracks.push({
      id,
      type,
      title: str(t['title']),
      lang: str(t['lang']),
      codec: str(t['codec']),
      selected: t['selected'] === true,
      external: t['external'] === true,
      isDefault: t['default'] === true,
      forced: t['forced'] === true,
    })
  }
  return tracks
}

export function parsePlaylist(value: unknown): PlaylistItem[] {
  if (!Array.isArray(value)) return []
  const items: PlaylistItem[] = []
  for (const entry of value) {
    if (!isRecord(entry)) continue
    const path = str(entry['filename'])
    if (!path) continue
    items.push({
      path,
      title: str(entry['title']),
      current: entry['current'] === true || entry['playing'] === true,
    })
  }
  return items
}

const aspectValues: Record<Exclude<AspectRatio, 'auto'>, number> = {
  '16:9': 16 / 9,
  '4:3': 4 / 3,
  '21:9': 21 / 9,
  '2.35:1': 2.35,
  '1.85:1': 1.85,
  '1:1': 1,
}

/** mpv reports video-aspect-override as -1/"no" (auto), a ratio number, or a ratio string. */
export function parseAspect(value: unknown): AspectRatio {
  if (typeof value === 'string' && value in aspectValues) return value as AspectRatio
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(n) || n <= 0) return 'auto'
  for (const [name, ratio] of Object.entries(aspectValues)) {
    if (Math.abs(ratio - n) < 0.01) return name as AspectRatio
  }
  return 'auto'
}

/**
 * Repeat and scaling each depend on two mpv properties, so the raw values are kept here
 * and the derived fields recomputed whenever either changes.
 */
export class PlayerStateTracker {
  private loopFile = false
  private loopPlaylist = false
  private keepAspect = true
  private panscan = 0

  apply(state: PlayerState, name: string, data: unknown): PlayerState {
    switch (name) {
      case 'loop-file':
        this.loopFile = isLooping(data)
        return { ...state, repeat: this.repeat() }
      case 'loop-playlist':
        this.loopPlaylist = isLooping(data)
        return { ...state, repeat: this.repeat() }
      case 'keepaspect':
        this.keepAspect = data !== false
        return { ...state, scaling: this.scaling() }
      case 'panscan':
        this.panscan = num(data) ?? 0
        return { ...state, scaling: this.scaling() }
      default:
        return applyProperty(state, name, data)
    }
  }

  private repeat(): RepeatMode {
    if (this.loopFile) return 'one'
    return this.loopPlaylist ? 'all' : 'off'
  }

  private scaling(): VideoScaling {
    if (!this.keepAspect) return 'stretch'
    return this.panscan >= 0.99 ? 'fill' : 'fit'
  }
}

/**
 * Applies one mpv property change to the state. Unknown properties leave it unchanged.
 * Properties that combine with others (loop/scaling) go through PlayerStateTracker.
 */
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
    case 'speed':
      return { ...state, speed: num(data) ?? state.speed }
    case 'eof-reached':
      return { ...state, eofReached: data === true }
    case 'vo-configured':
      return { ...state, videoActive: data === true }
    case 'idle-active':
      return data === true
        ? { ...state, status: state.status === 'error' ? 'error' : 'idle' }
        : { ...state, status: state.status === 'idle' ? 'loading' : state.status }
    case 'track-list':
      return { ...state, tracks: parseTracks(data) }
    case 'sub-visibility':
      return { ...state, subtitlesVisible: data !== false }
    case 'audio-delay':
      return { ...state, audioDelay: num(data) ?? 0 }
    case 'sub-delay':
      return { ...state, subtitleDelay: num(data) ?? 0 }
    case 'playlist':
      return { ...state, playlist: parsePlaylist(data) }
    case 'playlist-pos': {
      const pos = num(data)
      return { ...state, playlistPosition: pos !== null && pos >= 0 ? pos : null }
    }
    case 'video-aspect-override':
      return { ...state, aspectRatio: parseAspect(data) }
    case 'video-params': {
      const params = isRecord(data) ? data : {}
      return {
        ...state,
        videoInfo: { ...state.videoInfo, width: num(params['w']), height: num(params['h']) },
      }
    }
    case 'video-codec':
      return { ...state, videoInfo: { ...state.videoInfo, videoCodec: str(data) } }
    case 'audio-codec-name':
      return { ...state, videoInfo: { ...state.videoInfo, audioCodec: str(data) } }
    case 'container-fps':
      return { ...state, videoInfo: { ...state.videoInfo, fps: num(data) } }
    case 'hwdec-current': {
      const hwdec = str(data)
      return { ...state, videoInfo: { ...state.videoInfo, hwdec: hwdec === 'no' ? null : hwdec } }
    }
    default:
      return state
  }
}

/**
 * Maps a validated renderer command to mpv commands. Returns [] for commands handled
 * elsewhere (fullscreen is a window operation).
 */
export function toMpvCommands(command: PlayerCommand): MpvCommand[] {
  switch (command.type) {
    case 'toggle-pause':
      return [['cycle', 'pause']]
    case 'set-pause':
      return [['set_property', 'pause', command.paused]]
    case 'seek':
      return [
        ['seek', command.seconds, command.mode === 'absolute' ? 'absolute+exact' : 'relative'],
      ]
    case 'set-volume':
      return [['set_property', 'volume', command.volume]]
    case 'toggle-mute':
      return [['cycle', 'mute']]
    case 'stop':
      return [['stop']]
    case 'toggle-fullscreen':
    case 'show-player':
      return []
    case 'set-speed':
      return [['set_property', 'speed', command.speed]]
    case 'frame-step':
      return [[command.direction === 'forward' ? 'frame-step' : 'frame-back-step']]
    case 'set-audio-track':
      return [['set_property', 'aid', command.id === 'none' ? 'no' : command.id]]
    case 'set-subtitle-track':
      return [['set_property', 'sid', command.id === 'none' ? 'no' : command.id]]
    case 'set-subtitles-visible':
      return [['set_property', 'sub-visibility', command.visible]]
    case 'set-audio-delay':
      return [['set_property', 'audio-delay', command.seconds]]
    case 'set-subtitle-delay':
      return [['set_property', 'sub-delay', command.seconds]]
    case 'set-aspect-ratio':
      return [
        [
          'set_property',
          'video-aspect-override',
          command.aspect === 'auto' ? '-1' : command.aspect,
        ],
      ]
    case 'set-scaling':
      return [
        ['set_property', 'keepaspect', command.scaling !== 'stretch'],
        ['set_property', 'panscan', command.scaling === 'fill' ? 1 : 0],
      ]
    case 'set-repeat':
      return [
        ['set_property', 'loop-file', command.repeat === 'one' ? 'inf' : 'no'],
        ['set_property', 'loop-playlist', command.repeat === 'all' ? 'inf' : 'no'],
      ]
    case 'set-shuffle':
      return [[command.shuffle ? 'playlist-shuffle' : 'playlist-unshuffle']]
    case 'playlist-next':
      return [['playlist-next', 'weak']]
    case 'playlist-previous':
      return [['playlist-prev', 'weak']]
    case 'playlist-play':
      return [['playlist-play-index', command.index]]
    case 'playlist-remove':
      return [['playlist-remove', command.index]]
  }
}

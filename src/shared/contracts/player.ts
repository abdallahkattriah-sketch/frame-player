import { z } from 'zod'

export interface PlayerTrack {
  id: number
  type: 'video' | 'audio' | 'sub'
  title: string | null
  lang: string | null
  codec: string | null
  selected: boolean
  external: boolean
  isDefault: boolean
  forced: boolean
}

export interface PlaylistItem {
  path: string
  title: string | null
  current: boolean
}

export interface Chapter {
  title: string | null
  /** Seconds from the start. */
  time: number
}

export type RepeatMode = 'off' | 'one' | 'all'
export type VideoScaling = 'fit' | 'fill' | 'stretch'

export const aspectRatioOptions = [
  'auto',
  '16:9',
  '4:3',
  '21:9',
  '2.35:1',
  '1.85:1',
  '1:1',
] as const
export type AspectRatio = (typeof aspectRatioOptions)[number]

export interface VideoInfo {
  width: number | null
  height: number | null
  videoCodec: string | null
  audioCodec: string | null
  fps: number | null
  hwdec: string | null
}

/** Playback state as reported by mpv. The renderer only displays it; it never simulates it. */
export interface PlayerState {
  status: 'starting' | 'idle' | 'loading' | 'ready' | 'error' | 'closed'
  path: string | null
  title: string | null
  /** Seconds. */
  position: number | null
  duration: number | null
  paused: boolean
  volume: number
  muted: boolean
  speed: number
  eofReached: boolean
  /** True once mpv has configured a video output for the current file. */
  videoActive: boolean
  fullscreen: boolean
  /**
   * Inside the main window: 'shown' over its content, or 'hidden' (tucked into the Now Playing
   * bar while the user browses). Null when the player has its own window or is closed.
   */
  embedded: 'shown' | 'hidden' | null
  tracks: PlayerTrack[]
  subtitlesVisible: boolean
  /** Seconds; positive delays the stream. */
  audioDelay: number
  subtitleDelay: number
  repeat: RepeatMode
  shuffle: boolean
  playlist: PlaylistItem[]
  playlistPosition: number | null
  aspectRatio: AspectRatio
  scaling: VideoScaling
  videoInfo: VideoInfo
  /** From the file's chapter markers, in time order; empty when it has none. */
  chapters: Chapter[]
  /** Index into chapters, or null before the first one. */
  chapter: number | null
  error: string | null
}

export const initialPlayerState: PlayerState = {
  status: 'starting',
  path: null,
  title: null,
  position: null,
  duration: null,
  paused: true,
  volume: 100,
  muted: false,
  speed: 1,
  eofReached: false,
  videoActive: false,
  fullscreen: false,
  embedded: null,
  tracks: [],
  subtitlesVisible: true,
  audioDelay: 0,
  subtitleDelay: 0,
  repeat: 'off',
  shuffle: false,
  playlist: [],
  playlistPosition: null,
  aspectRatio: 'auto',
  scaling: 'fit',
  videoInfo: {
    width: null,
    height: null,
    videoCodec: null,
    audioCodec: null,
    fps: null,
    hwdec: null,
  },
  chapters: [],
  chapter: null,
  error: null,
}

export const MIN_SPEED = 0.1
export const MAX_SPEED = 4
const delaySeconds = z.number().finite().min(-600).max(600)
const trackId = z.union([z.number().int().positive(), z.literal('none')])

/**
 * High-level commands the renderer may send. Raw mpv commands are never accepted from the
 * renderer: mpv can run programs and write files, so each command is mapped in the main process.
 */
export const playerCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('toggle-pause') }),
  z.object({ type: z.literal('set-pause'), paused: z.boolean() }),
  z.object({
    type: z.literal('seek'),
    mode: z.enum(['absolute', 'relative']),
    seconds: z.number().finite().min(-86_400).max(86_400),
  }),
  z.object({ type: z.literal('set-volume'), volume: z.number().finite().min(0).max(130) }),
  z.object({ type: z.literal('toggle-mute') }),
  z.object({ type: z.literal('stop') }),
  z.object({ type: z.literal('toggle-fullscreen') }),
  /** Brings the player window to the front. */
  z.object({ type: z.literal('show-player') }),
  /** Ends playback and closes the player, returning to the main window. */
  z.object({ type: z.literal('close-player') }),
  /** Inside the main window: hides the player while playback goes on (Now Playing bar). */
  z.object({ type: z.literal('hide-player') }),
  z.object({
    type: z.literal('set-speed'),
    speed: z.number().finite().min(MIN_SPEED).max(MAX_SPEED),
  }),
  z.object({ type: z.literal('frame-step'), direction: z.enum(['forward', 'backward']) }),
  z.object({ type: z.literal('set-audio-track'), id: trackId }),
  z.object({ type: z.literal('set-subtitle-track'), id: trackId }),
  z.object({ type: z.literal('set-subtitles-visible'), visible: z.boolean() }),
  z.object({ type: z.literal('set-audio-delay'), seconds: delaySeconds }),
  z.object({ type: z.literal('set-subtitle-delay'), seconds: delaySeconds }),
  z.object({ type: z.literal('set-aspect-ratio'), aspect: z.enum(aspectRatioOptions) }),
  z.object({ type: z.literal('set-scaling'), scaling: z.enum(['fit', 'fill', 'stretch']) }),
  z.object({ type: z.literal('set-repeat'), repeat: z.enum(['off', 'one', 'all']) }),
  z.object({ type: z.literal('set-shuffle'), shuffle: z.boolean() }),
  z.object({ type: z.literal('playlist-next') }),
  z.object({ type: z.literal('playlist-previous') }),
  z.object({ type: z.literal('playlist-play'), index: z.number().int().min(0) }),
  z.object({ type: z.literal('playlist-remove'), index: z.number().int().min(0) }),
  z.object({ type: z.literal('chapter'), direction: z.enum(['next', 'previous']) }),
])

export type PlayerCommand = z.infer<typeof playerCommandSchema>

/** Result of opening media: how many files were queued, or why nothing was. */
export interface OpenMediaResult {
  queued: number
  /** Present when nothing could be opened. */
  error?: string
}

export interface ScreenshotResult {
  path: string
}

/** Where the main window shows the player, in CSS pixels of its page. */
export const playerAreaSchema = z
  .object({
    x: z.number().finite().min(0).max(20_000),
    y: z.number().finite().min(0).max(20_000),
    width: z.number().finite().min(1).max(20_000),
    height: z.number().finite().min(1).max(20_000),
  })
  .strict()
export type PlayerArea = z.infer<typeof playerAreaSchema>

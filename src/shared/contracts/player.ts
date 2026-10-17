import { z } from 'zod'

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
  eofReached: boolean
  /** True once mpv has configured a video output for the current file. */
  videoActive: boolean
  fullscreen: boolean
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
  eofReached: false,
  videoActive: false,
  fullscreen: false,
  error: null,
}

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
])

export type PlayerCommand = z.infer<typeof playerCommandSchema>

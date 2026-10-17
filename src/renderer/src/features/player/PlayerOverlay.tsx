import { useEffect } from 'react'
import { Maximize, Minimize, Pause, Play, Volume2, VolumeX } from 'lucide-react'
import type { PlayerCommand } from '@shared/contracts/player'
import { formatTime } from './format-time'
import { useIdle } from './use-idle'
import { usePlayerState } from './use-player-state'

const SEEK_STEP_SECONDS = 10
const VOLUME_STEP = 5

function send(command: PlayerCommand) {
  void window.frame.player.command(command).catch(() => undefined)
}

export function PlayerOverlay() {
  const state = usePlayerState()
  const idle = useIdle(2500)
  const controlsHidden = idle && !state.paused && state.status === 'ready'

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement && e.target.type !== 'range') return
      const actions: Record<string, PlayerCommand | undefined> = {
        ' ': { type: 'toggle-pause' },
        k: { type: 'toggle-pause' },
        ArrowRight: { type: 'seek', mode: 'relative', seconds: SEEK_STEP_SECONDS },
        ArrowLeft: { type: 'seek', mode: 'relative', seconds: -SEEK_STEP_SECONDS },
        ArrowUp: { type: 'set-volume', volume: Math.min(130, state.volume + VOLUME_STEP) },
        ArrowDown: { type: 'set-volume', volume: Math.max(0, state.volume - VOLUME_STEP) },
        m: { type: 'toggle-mute' },
        f: { type: 'toggle-fullscreen' },
        Escape: state.fullscreen ? { type: 'toggle-fullscreen' } : undefined,
      }
      const action = actions[e.key]
      if (!action) return
      e.preventDefault()
      send(action)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state.volume, state.fullscreen])

  const duration = state.duration ?? 0
  const position = state.position ?? 0

  return (
    <div
      className={`relative h-full w-full select-none ${controlsHidden ? 'cursor-none' : ''}`}
      onDoubleClick={() => send({ type: 'toggle-fullscreen' })}
      data-testid="player-overlay"
      data-status={state.status}
    >
      {(state.status === 'loading' || state.status === 'starting') && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">
          Loading…
        </div>
      )}
      {state.status === 'error' && state.error && (
        <div className="absolute inset-0 flex items-center justify-center p-8">
          <div
            role="alert"
            className="max-w-md rounded-lg border border-danger/40 bg-surface/95 px-5 py-4 text-sm"
          >
            {state.error}
          </div>
        </div>
      )}

      <div
        className={`absolute inset-x-0 bottom-0 px-4 pb-3 pt-2 transition-opacity duration-300 ${
          controlsHidden ? 'pointer-events-none opacity-0' : 'opacity-100'
        }`}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <div className="rounded-lg border border-border/60 bg-bg/85 px-4 py-2.5 shadow-lg">
          <div className="mb-1 truncate text-xs text-muted" data-testid="player-title">
            {state.title ?? ''}
          </div>
          <input
            type="range"
            aria-label="Seek"
            min={0}
            max={duration || 0}
            step={0.1}
            value={Math.min(position, duration || 0)}
            disabled={!state.duration}
            onChange={(e) =>
              send({ type: 'seek', mode: 'absolute', seconds: Number(e.currentTarget.value) })
            }
            className="w-full accent-[var(--frame-accent)]"
          />
          <div className="mt-1 flex items-center gap-3">
            <button
              type="button"
              aria-label={state.paused ? 'Play' : 'Pause'}
              onClick={() => send({ type: 'toggle-pause' })}
              className="rounded-md p-1.5 text-text hover:bg-elevated"
            >
              {state.paused ? <Play size={18} /> : <Pause size={18} />}
            </button>
            <span className="text-xs tabular-nums text-muted" data-testid="player-time">
              {formatTime(state.position)} / {formatTime(state.duration)}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                aria-label={state.muted ? 'Unmute' : 'Mute'}
                onClick={() => send({ type: 'toggle-mute' })}
                className="rounded-md p-1.5 text-text hover:bg-elevated"
              >
                {state.muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
              <input
                type="range"
                aria-label="Volume"
                min={0}
                max={130}
                value={state.volume}
                onChange={(e) =>
                  send({ type: 'set-volume', volume: Number(e.currentTarget.value) })
                }
                className="w-24 accent-[var(--frame-accent)]"
              />
              <button
                type="button"
                aria-label={state.fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                onClick={() => send({ type: 'toggle-fullscreen' })}
                className="rounded-md p-1.5 text-text hover:bg-elevated"
              >
                {state.fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

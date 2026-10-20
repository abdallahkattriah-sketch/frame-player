import { Maximize2, Pause, Play, SkipForward } from 'lucide-react'
import { formatTime } from '@renderer/features/player/format-time'
import { sendCommand } from '@renderer/features/player/send-command'
import { usePlayerState } from '@renderer/features/player/use-player-state'

/** Compact now-playing bar in the main window while the player is open. */
export function MiniPlayer() {
  const state = usePlayerState()
  // Inside the main window the player itself is showing; the bar is for when it is tucked away.
  if (!state.path || state.status === 'closed' || state.embedded === 'shown') return null
  const fraction = state.duration ? Math.min(1, (state.position ?? 0) / state.duration) : 0

  return (
    <div
      role="region"
      aria-label="Now playing"
      data-testid="mini-player"
      className="relative flex h-14 shrink-0 items-center gap-3 border-t border-border bg-surface px-4"
    >
      <div className="absolute inset-x-0 top-0 h-0.5 bg-border">
        <div className="h-full bg-accent" style={{ width: `${fraction * 100}%` }} />
      </div>
      <button
        type="button"
        aria-label={state.paused ? 'Play' : 'Pause'}
        onClick={() => sendCommand({ type: 'toggle-pause' })}
        className="rounded-md p-1.5 hover:bg-elevated"
      >
        {state.paused ? <Play size={18} /> : <Pause size={18} />}
      </button>
      {state.playlist.length > 1 && (
        <button
          type="button"
          aria-label="Next"
          onClick={() => sendCommand({ type: 'playlist-next' })}
          className="rounded-md p-1.5 hover:bg-elevated"
        >
          <SkipForward size={18} />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm" dir="auto">
          {state.title}
        </div>
        <div className="text-xs tabular-nums text-muted">
          {formatTime(state.position)} / {formatTime(state.duration)}
        </div>
      </div>
      <button
        type="button"
        onClick={() => sendCommand({ type: 'show-player' })}
        className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-elevated"
      >
        <Maximize2 size={14} aria-hidden /> Show player
      </button>
    </div>
  )
}

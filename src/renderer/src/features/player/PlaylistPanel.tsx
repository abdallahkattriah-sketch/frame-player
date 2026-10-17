import { Repeat, Repeat1, Shuffle, X } from 'lucide-react'
import type { PlayerState, RepeatMode } from '@shared/contracts/player'
import { sendCommand } from './send-command'

const nextRepeat: Record<RepeatMode, RepeatMode> = { off: 'all', all: 'one', one: 'off' }
const repeatLabels: Record<RepeatMode, string> = {
  off: 'Repeat: off',
  all: 'Repeat: all',
  one: 'Repeat: current video',
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

export function PlaylistPanel({ state, onClose }: { state: PlayerState; onClose: () => void }) {
  const RepeatIcon = state.repeat === 'one' ? Repeat1 : Repeat
  return (
    <aside
      aria-label="Playlist"
      className="absolute bottom-28 right-4 top-4 flex w-80 flex-col rounded-lg border border-border bg-surface/95 shadow-xl"
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <header className="flex items-center gap-1 border-b border-border px-3 py-2">
        <h2 className="flex-1 text-sm font-medium">
          Playlist <span className="text-subtle">({state.playlist.length})</span>
        </h2>
        <button
          type="button"
          aria-label={state.shuffle ? 'Shuffle: on' : 'Shuffle: off'}
          aria-pressed={state.shuffle}
          title={state.shuffle ? 'Shuffle: on' : 'Shuffle: off'}
          onClick={() => sendCommand({ type: 'set-shuffle', shuffle: !state.shuffle })}
          className={`rounded-md p-1.5 hover:bg-elevated ${state.shuffle ? 'text-accent' : 'text-muted'}`}
        >
          <Shuffle size={16} />
        </button>
        <button
          type="button"
          aria-label={repeatLabels[state.repeat]}
          title={repeatLabels[state.repeat]}
          onClick={() => sendCommand({ type: 'set-repeat', repeat: nextRepeat[state.repeat] })}
          className={`rounded-md p-1.5 hover:bg-elevated ${
            state.repeat === 'off' ? 'text-muted' : 'text-accent'
          }`}
        >
          <RepeatIcon size={16} />
        </button>
        <button
          type="button"
          aria-label="Close playlist"
          onClick={onClose}
          className="rounded-md p-1.5 text-muted hover:bg-elevated hover:text-text"
        >
          <X size={16} />
        </button>
      </header>
      <ol className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {state.playlist.map((item, index) => (
          <li key={`${index}-${item.path}`} className="group flex items-center gap-1">
            <button
              type="button"
              onClick={() => sendCommand({ type: 'playlist-play', index })}
              aria-current={item.current ? 'true' : undefined}
              title={item.path}
              className={`min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-elevated ${
                item.current ? 'text-accent' : 'text-text'
              }`}
            >
              <span className="mr-2 tabular-nums text-subtle">{index + 1}</span>
              {item.title ?? fileName(item.path)}
            </button>
            <button
              type="button"
              aria-label={`Remove ${fileName(item.path)} from playlist`}
              onClick={() => sendCommand({ type: 'playlist-remove', index })}
              className="rounded-md p-1 text-subtle opacity-0 hover:bg-elevated hover:text-text focus:opacity-100 group-hover:opacity-100"
            >
              <X size={14} />
            </button>
          </li>
        ))}
      </ol>
    </aside>
  )
}

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Bookmark as BookmarkIcon,
  Camera,
  Info,
  ListVideo,
  Maximize,
  Minimize,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { defaultSettings } from '@shared/settings/schema'
import { SubtitleSearchDialog } from '@renderer/features/subtitles/SubtitleSearchDialog'
import { formatTime } from './format-time'
import { InfoPanel } from './InfoPanel'
import { AudioSubtitleMenu, SpeedMenu, VideoMenu } from './menus'
import { isOverlayAction, keyToAction, type OverlayAction } from './player-keymap'
import { PlaylistPanel } from './PlaylistPanel'
import { BookmarksPanel } from './BookmarksPanel'
import { chapterAt, Timeline } from './Timeline'
import { useBookmarks } from './use-bookmarks'
import { SubtitleStylePanel } from './SubtitleStylePanel'
import { sendCommand } from './send-command'
import { useFileDrop } from './use-file-drop'
import { useIdle } from './use-idle'
import { usePlayerState } from './use-player-state'

const TOAST_MS = 3000

function IconButton({
  label,
  onClick,
  children,
  pressed,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
  pressed?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={`rounded-md p-1.5 hover:bg-elevated ${pressed ? 'bg-elevated text-accent' : 'text-text'}`}
    >
      {children}
    </button>
  )
}

export function PlayerOverlay() {
  const state = usePlayerState()
  const idle = useIdle(2500)
  const [showInfo, setShowInfo] = useState(false)
  const [showPlaylist, setShowPlaylist] = useState(false)
  const [showBookmarks, setShowBookmarks] = useState(false)
  const [showStyle, setShowStyle] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [showSubtitleSearch, setShowSubtitleSearch] = useState(false)
  const [seekStep, setSeekStep] = useState(defaultSettings.playback.seekStepSeconds)
  const toastTimer = useRef<number | undefined>(undefined)

  const bookmarks = useBookmarks(state.path)
  const panelOpen = showInfo || showPlaylist || showBookmarks || showStyle
  const controlsHidden = idle && !state.paused && state.status === 'ready' && !panelOpen

  const notify = useCallback((message: string) => {
    setToast(message)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), TOAST_MS)
  }, [])

  const addBookmark = useCallback(() => {
    bookmarks
      .add()
      .then((added) => {
        if (added) notify(`Bookmark added at ${formatTime(added.position)}`)
      })
      .catch(() => notify('Could not add the bookmark.'))
  }, [bookmarks, notify])

  useEffect(() => {
    window.frame.settings
      .get()
      .then((s) => setSeekStep(s.playback.seekStepSeconds))
      .catch(() => undefined)
    return () => window.clearTimeout(toastTimer.current)
  }, [])

  const runOverlayAction = useCallback(
    (action: OverlayAction) => {
      switch (action.type) {
        case 'screenshot':
          window.frame.player
            .screenshot()
            .then((r) => notify(`Screenshot saved: ${r.path}`))
            .catch((e: unknown) =>
              notify(`Screenshot failed: ${e instanceof Error ? e.message : String(e)}`),
            )
          return
        case 'toggle-info':
          setShowInfo((v) => !v)
          return
        case 'toggle-playlist':
          setShowBookmarks(false)
          setShowStyle(false)
          setShowPlaylist((v) => !v)
          return
        case 'toggle-bookmarks':
          setShowPlaylist(false)
          setShowStyle(false)
          setShowBookmarks((v) => !v)
          return
        case 'add-bookmark':
          addBookmark()
          return
        case 'close-panels':
          setShowInfo(false)
          setShowPlaylist(false)
          setShowBookmarks(false)
          setShowStyle(false)
          return
      }
    },
    [notify, addBookmark],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't steal keys from buttons (Space/Enter) or text fields.
      const target = e.target as HTMLElement | null
      if (target?.closest('input:not([type=range]), textarea, [contenteditable=true]')) return
      if (target?.closest('button') && (e.key === ' ' || e.key === 'Enter')) return
      const action = keyToAction(e, { state, seekStepSeconds: seekStep, panelOpen })
      if (!action) return
      e.preventDefault()
      if (isOverlayAction(action)) runOverlayAction(action)
      else sendCommand(action)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state, seekStep, panelOpen, runOverlayAction])

  const drop = useFileDrop((result) => {
    if (result.error) notify(result.error)
  })

  const currentChapter = chapterAt(state.chapters, state.position ?? 0)
  const hasPlaylist = state.playlist.length > 1

  return (
    <div
      className={`relative h-full w-full select-none ${controlsHidden ? 'cursor-none' : ''}`}
      onDoubleClick={() => sendCommand({ type: 'toggle-fullscreen' })}
      data-testid="player-overlay"
      data-status={state.status}
      {...drop.handlers}
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
      {drop.dragging && (
        <div className="pointer-events-none absolute inset-3 flex items-center justify-center rounded-xl border-2 border-dashed border-accent bg-bg/60 text-sm">
          Drop to play
        </div>
      )}

      {showInfo && <InfoPanel state={state} />}
      {showPlaylist && <PlaylistPanel state={state} onClose={() => setShowPlaylist(false)} />}
      {showBookmarks && (
        <BookmarksPanel
          bookmarks={bookmarks.bookmarks}
          onAdd={addBookmark}
          onEdit={bookmarks.edit}
          onRemove={(id) => void bookmarks.remove(id).catch(() => undefined)}
          onClose={() => setShowBookmarks(false)}
        />
      )}
      {showStyle && <SubtitleStylePanel onClose={() => setShowStyle(false)} />}
      {showSubtitleSearch && state.path && (
        <SubtitleSearchDialog
          target={{ current: true }}
          label={state.title ?? state.path}
          isEpisode={/s\d{1,2}[ ._-]?e\d{1,4}|\b\d{1,2}x\d{2,4}\b/i.test(state.path)}
          onClose={() => setShowSubtitleSearch(false)}
        />
      )}

      {toast && (
        <div
          role="status"
          className="absolute left-1/2 top-4 max-w-[80%] -translate-x-1/2 truncate rounded-md border border-border bg-surface/95 px-3 py-2 text-xs shadow-lg"
        >
          {toast}
        </div>
      )}

      <div
        className={`absolute inset-x-0 bottom-0 px-4 pb-3 pt-2 transition-opacity duration-300 ${
          controlsHidden ? 'pointer-events-none opacity-0' : 'opacity-100'
        }`}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <div className="rounded-lg border border-border/60 bg-bg/85 px-4 py-2.5 shadow-lg">
          <div className="mb-1 flex items-center gap-2 text-xs text-muted">
            <span className="min-w-0 flex-1 truncate" data-testid="player-title">
              {state.title ?? ''}
            </span>
            {currentChapter?.title && (
              <span className="max-w-[40%] truncate" data-testid="player-chapter">
                {currentChapter.title}
              </span>
            )}
            {state.speed !== 1 && <span className="text-accent">{state.speed}×</span>}
          </div>
          <Timeline
            duration={state.duration}
            position={state.position}
            chapters={state.chapters}
            bookmarks={bookmarks.bookmarks}
            onSeek={(seconds) => sendCommand({ type: 'seek', mode: 'absolute', seconds })}
          />
          <div className="mt-1 flex items-center gap-1">
            {hasPlaylist && (
              <IconButton
                label="Previous"
                onClick={() => sendCommand({ type: 'playlist-previous' })}
              >
                <SkipBack size={18} />
              </IconButton>
            )}
            <IconButton
              label={state.paused ? 'Play' : 'Pause'}
              onClick={() => sendCommand({ type: 'toggle-pause' })}
            >
              {state.paused ? <Play size={18} /> : <Pause size={18} />}
            </IconButton>
            {hasPlaylist && (
              <IconButton label="Next" onClick={() => sendCommand({ type: 'playlist-next' })}>
                <SkipForward size={18} />
              </IconButton>
            )}
            <span className="ml-2 text-xs tabular-nums text-muted" data-testid="player-time">
              {formatTime(state.position)} / {formatTime(state.duration)}
            </span>
            <div className="ml-auto flex items-center gap-1">
              <IconButton
                label={state.muted ? 'Unmute' : 'Mute'}
                onClick={() => sendCommand({ type: 'toggle-mute' })}
              >
                {state.muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </IconButton>
              <input
                type="range"
                aria-label="Volume"
                min={0}
                max={130}
                value={state.volume}
                onChange={(e) =>
                  sendCommand({ type: 'set-volume', volume: Number(e.currentTarget.value) })
                }
                className="mr-1 w-24 accent-[var(--frame-accent)]"
              />
              <AudioSubtitleMenu
                state={state}
                onSearchOnline={() => setShowSubtitleSearch(true)}
                onOpenStyle={() => {
                  setShowPlaylist(false)
                  setShowBookmarks(false)
                  setShowStyle(true)
                }}
                onLoadFile={() => {
                  window.frame.subtitles
                    .loadFile()
                    .then((r) => {
                      if (r.error) notify(r.error)
                      else if (r.loaded) notify('Subtitle loaded.')
                    })
                    .catch(() => undefined)
                }}
              />
              <SpeedMenu speed={state.speed} />
              <VideoMenu state={state} />
              <IconButton
                label="Screenshot"
                onClick={() => runOverlayAction({ type: 'screenshot' })}
              >
                <Camera size={18} />
              </IconButton>
              <IconButton
                label="Bookmarks"
                pressed={showBookmarks}
                onClick={() => runOverlayAction({ type: 'toggle-bookmarks' })}
              >
                <BookmarkIcon size={18} />
              </IconButton>
              <IconButton
                label="Playlist"
                pressed={showPlaylist}
                onClick={() => runOverlayAction({ type: 'toggle-playlist' })}
              >
                <ListVideo size={18} />
              </IconButton>
              <IconButton
                label="Playback information"
                pressed={showInfo}
                onClick={() => setShowInfo((v) => !v)}
              >
                <Info size={18} />
              </IconButton>
              <IconButton
                label={state.fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                onClick={() => sendCommand({ type: 'toggle-fullscreen' })}
              >
                {state.fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
              </IconButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

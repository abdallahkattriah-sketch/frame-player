import type { PlayerState } from '@shared/contracts/player'
import type { HistoryRepository } from '../database/repositories/history-repository'
import { MIN_RESUME_SECONDS } from '../database/repositories/library-query-repository'
import { pathKey } from '../library/path-key'

export interface ResumeInfo {
  position: number
  audioTrackId: number | null
  subtitleTrackId: number | null
}

export interface HistoryServiceOptions {
  repository: HistoryRepository
  settings: () => { resumePlayback: boolean; completionThresholdPercent: number }
  /** Called after history changes in a way views should reflect. */
  onChanged: () => void
  now?: () => Date
  saveIntervalMs?: number
}

/** Do not resume when this close to the end. */
const END_MARGIN_SECONDS = 10

/**
 * Records playback progress from mpv-derived player state. Writes are throttled during
 * playback and forced on pause, file change, and session end, so a crash loses at most
 * one interval.
 */
export class HistoryService {
  private lastSaveAt = 0
  private countedPath: string | null = null
  private lastState: PlayerState | null = null

  constructor(private readonly options: HistoryServiceOptions) {}

  /** Feed every player state change here. */
  onPlayerState(next: PlayerState): void {
    const prev = this.lastState
    this.lastState = next

    if (prev?.path && prev.path !== next.path) {
      this.save(prev, { final: true })
    }
    if (!next.path || next.status !== 'ready') return

    const now = this.now().getTime()
    const paused = next.paused && !(prev?.paused ?? true) && prev?.path === next.path
    const finished = next.eofReached && !prev?.eofReached
    if (paused || finished || now - this.lastSaveAt >= (this.options.saveIntervalMs ?? 10_000)) {
      this.save(next, { final: finished })
    }
  }

  /** Call when the player closes or the app quits, with the last known state. */
  onSessionEnded(last: PlayerState): void {
    if (last.path) this.save(last, { final: true })
    this.lastState = null
    this.countedPath = null
  }

  /** Where to resume `path`, or null when it should start from the beginning. */
  resumeFor(path: string): ResumeInfo | null {
    if (!this.options.settings().resumePlayback) return null
    const entry = this.options.repository.get(pathKey(path))
    if (!entry || entry.completed || entry.positionSeconds < MIN_RESUME_SECONDS) return null
    if (
      entry.durationSeconds !== null &&
      entry.durationSeconds - entry.positionSeconds < END_MARGIN_SECONDS
    ) {
      return null
    }
    return {
      position: entry.positionSeconds,
      audioTrackId: entry.audioTrackId,
      subtitleTrackId: entry.subtitleTrackId,
    }
  }

  private save(state: PlayerState, { final }: { final: boolean }) {
    const path = state.path
    if (!path) return
    const position = state.position ?? 0
    const duration = state.duration
    const key = pathKey(path)
    const existing = this.options.repository.get(key)

    // Opening a file and closing it within seconds is not worth remembering.
    const threshold = this.options.settings().completionThresholdPercent / 100
    const completed =
      state.eofReached || (duration !== null && duration > 0 && position / duration >= threshold)
    if (!existing && !completed && position < MIN_RESUME_SECONDS) return

    const firstSaveThisPlay = this.countedPath !== path
    if (firstSaveThisPlay) this.countedPath = path

    const audio = state.tracks.filter((t) => t.type === 'audio')
    const subs = state.tracks.filter((t) => t.type === 'sub')
    const selectedId = (tracks: typeof audio) =>
      tracks.length === 0 ? null : (tracks.find((t) => t.selected)?.id ?? 0)

    this.options.repository.upsert({
      pathKey: key,
      path,
      positionSeconds: completed ? 0 : Math.max(0, position),
      durationSeconds: duration,
      // Rewatching a completed item makes it in-progress again until it is finished.
      completed,
      playCount: (existing?.playCount ?? 0) + (firstSaveThisPlay ? 1 : 0),
      lastWatchedAt: this.now().toISOString(),
      audioTrackId: selectedId(audio),
      subtitleTrackId: selectedId(subs),
      speed: state.speed,
    })
    this.lastSaveAt = this.now().getTime()
    if (final || firstSaveThisPlay || completed !== existing?.completed) this.options.onChanged()
  }

  private now(): Date {
    return this.options.now?.() ?? new Date()
  }
}

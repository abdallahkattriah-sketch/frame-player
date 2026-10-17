import type { Database } from '../connection'

export interface HistoryEntry {
  pathKey: string
  path: string
  positionSeconds: number
  durationSeconds: number | null
  completed: boolean
  playCount: number
  lastWatchedAt: string
  audioTrackId: number | null
  subtitleTrackId: number | null
  speed: number | null
}

interface HistoryRow extends Omit<HistoryEntry, 'completed'> {
  completed: number
}

const columns = `path_key AS pathKey, path, position_seconds AS positionSeconds,
  duration_seconds AS durationSeconds, completed, play_count AS playCount,
  last_watched_at AS lastWatchedAt, audio_track_id AS audioTrackId,
  subtitle_track_id AS subtitleTrackId, speed`

export class HistoryRepository {
  constructor(private readonly db: Database) {}

  get(pathKey: string): HistoryEntry | undefined {
    const row = this.db
      .prepare(`SELECT ${columns} FROM playback_history WHERE path_key = ?`)
      .get(pathKey) as HistoryRow | undefined
    return row ? { ...row, completed: row.completed === 1 } : undefined
  }

  upsert(entry: HistoryEntry): void {
    this.db
      .prepare(
        `INSERT INTO playback_history (path_key, path, position_seconds, duration_seconds, completed,
           play_count, last_watched_at, audio_track_id, subtitle_track_id, speed)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(path_key) DO UPDATE SET
           path = excluded.path,
           position_seconds = excluded.position_seconds,
           duration_seconds = excluded.duration_seconds,
           completed = excluded.completed,
           play_count = excluded.play_count,
           last_watched_at = excluded.last_watched_at,
           audio_track_id = excluded.audio_track_id,
           subtitle_track_id = excluded.subtitle_track_id,
           speed = excluded.speed`,
      )
      .run(
        entry.pathKey,
        entry.path,
        entry.positionSeconds,
        entry.durationSeconds,
        entry.completed ? 1 : 0,
        entry.playCount,
        entry.lastWatchedAt,
        entry.audioTrackId,
        entry.subtitleTrackId,
        entry.speed,
      )
  }

  /** Marks watched (completed) or unwatched (position reset), creating the row if needed. */
  setWatched(pathKey: string, path: string, watched: boolean, now: string): void {
    this.db
      .prepare(
        `INSERT INTO playback_history (path_key, path, position_seconds, completed, last_watched_at)
         VALUES (?, ?, 0, ?, ?)
         ON CONFLICT(path_key) DO UPDATE SET completed = excluded.completed, position_seconds = 0`,
      )
      .run(pathKey, path, watched ? 1 : 0, now)
  }

  delete(pathKey: string): void {
    this.db.prepare('DELETE FROM playback_history WHERE path_key = ?').run(pathKey)
  }
}

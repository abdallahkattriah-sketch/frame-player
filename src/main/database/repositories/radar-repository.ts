import type {
  RadarNotification,
  RadarNotificationInput,
  ReleaseKind,
} from '@shared/contracts/radar'
import { transaction, type Database } from '../connection'

/** Releases announced to the user: each title and release kind at most once, ever. */
export class RadarRepository {
  constructor(
    private readonly db: Database,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Records releases not announced before. Returns how many are new. */
  record(items: readonly RadarNotificationInput[]): number {
    return transaction(this.db, () => {
      const insert = this.db.prepare(
        `INSERT OR IGNORE INTO radar_seen (tmdb_movie_id, release_kind, first_seen_at, title,
           poster_path, release_date, country, people_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      const at = this.now().toISOString()
      let added = 0
      for (const n of items) {
        added += Number(
          insert.run(
            n.tmdbMovieId,
            n.kind,
            at,
            n.title,
            n.posterPath,
            n.date,
            n.country,
            JSON.stringify(n.people),
          ).changes,
        )
      }
      return added
    })
  }

  /** Notifications not dismissed, newest first. */
  list(limit = 50): RadarNotification[] {
    const rows = this.db
      .prepare(
        `SELECT tmdb_movie_id AS tmdbMovieId, release_kind AS kind, title, poster_path AS posterPath,
                release_date AS date, country, people_json AS people, first_seen_at AS firstSeenAt,
                read_at AS readAt
         FROM radar_seen
         WHERE dismissed_at IS NULL AND title IS NOT NULL AND release_date IS NOT NULL
         ORDER BY first_seen_at DESC, release_date
         LIMIT ?`,
      )
      .all(limit) as (Omit<RadarNotification, 'people' | 'read'> & {
      people: string
      readAt: string | null
    })[]
    return rows.map(({ readAt, people, ...r }) => ({
      ...r,
      people: parsePeople(people),
      read: readAt !== null,
    }))
  }

  unreadCount(): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS n FROM radar_seen
         WHERE read_at IS NULL AND dismissed_at IS NULL AND title IS NOT NULL`,
      )
      .get() as { n: number }
    return row.n
  }

  markRead(movieId: number, kind: ReleaseKind): boolean {
    return (
      this.db
        .prepare(
          `UPDATE radar_seen SET read_at = ? WHERE tmdb_movie_id = ? AND release_kind = ?
             AND read_at IS NULL`,
        )
        .run(this.now().toISOString(), movieId, kind).changes > 0
    )
  }

  markAllRead(): number {
    return Number(
      this.db
        .prepare('UPDATE radar_seen SET read_at = ? WHERE read_at IS NULL')
        .run(this.now().toISOString()).changes,
    )
  }

  /** Hides a notification; the release is still remembered, so it is not announced again. */
  dismiss(movieId: number, kind: ReleaseKind): boolean {
    const at = this.now().toISOString()
    return (
      this.db
        .prepare(
          `UPDATE radar_seen SET dismissed_at = ?, read_at = COALESCE(read_at, ?)
           WHERE tmdb_movie_id = ? AND release_kind = ? AND dismissed_at IS NULL`,
        )
        .run(at, at, movieId, kind).changes > 0
    )
  }
}

function parsePeople(text: string): string[] {
  try {
    const value: unknown = JSON.parse(text)
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

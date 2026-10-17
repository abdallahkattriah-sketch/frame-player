import type {
  LibraryItem,
  LibraryQuery,
  LibraryShow,
  MediaKind,
  SortKey,
} from '@shared/contracts/library'
import type { MatchStatus } from '@shared/contracts/metadata'
import type { Database } from '../connection'

type SqlValue = string | number | null

interface ItemRow {
  fileId: number | null
  historyKey: string | null
  path: string
  fileName: string | null
  kind: MediaKind | null
  title: string | null
  year: number | null
  season: number | null
  episode: number | null
  episodeEnd: number | null
  episodeTitle: string | null
  resolution: string | null
  sizeBytes: number | null
  addedAt: string | null
  missing: number | null
  favorite: number | null
  position: number | null
  duration: number | null
  completed: number | null
  lastWatchedAt: string | null
  matchStatus: MatchStatus | null
  metadataTitle: string | null
  metadataYear: number | null
  posterPath: string | null
  episodeName: string | null
  stillPath: string | null
}

/**
 * Movies match per file, episodes per show (case-folded title). Metadata rows may have been
 * purged by the 6-month cache rule, in which case the md/me columns are simply NULL.
 */
const metadataJoins = `
  LEFT JOIN media_matches mf ON m.parsed_kind <> 'episode' AND mf.target_type = 'file'
    AND mf.target_key = m.path_key
  LEFT JOIN media_matches ms ON m.parsed_kind = 'episode' AND ms.target_type = 'show'
    AND ms.target_key = lower(m.parsed_title)
  LEFT JOIN metadata_items md ON COALESCE(mf.status, ms.status) = 'matched'
    AND md.media_type = COALESCE(mf.tmdb_media_type, ms.tmdb_media_type)
    AND md.tmdb_id = COALESCE(mf.tmdb_id, ms.tmdb_id)
  LEFT JOIN metadata_episodes me ON md.media_type = 'tv' AND me.tmdb_id = md.tmdb_id
    AND me.season = m.parsed_season AND me.episode = m.parsed_episode`

const DEFAULT_LIMIT = 50_000
const SHELF_LIMIT = 100
/** Positions below this are not worth resuming. */
export const MIN_RESUME_SECONDS = 5

const itemColumns = `
  m.id AS fileId, h.path_key AS historyKey, COALESCE(m.path, h.path) AS path,
  m.file_name AS fileName, m.parsed_kind AS kind, m.parsed_title AS title, m.parsed_year AS year,
  m.parsed_season AS season, m.parsed_episode AS episode, m.parsed_episode_end AS episodeEnd,
  m.parsed_episode_title AS episodeTitle, m.parsed_resolution AS resolution,
  m.size_bytes AS sizeBytes, m.added_at AS addedAt, m.missing, m.favorite,
  h.position_seconds AS position, h.duration_seconds AS duration, h.completed,
  h.last_watched_at AS lastWatchedAt,
  COALESCE(mf.status, ms.status) AS matchStatus, md.title AS metadataTitle, md.year AS metadataYear,
  md.poster_path AS posterPath, me.name AS episodeName, me.still_path AS stillPath`

const titleExpr = 'COALESCE(md.title, m.parsed_title, m.file_name, h.path)'
const yearExpr = 'COALESCE(md.year, m.parsed_year)'

const orderBy: Record<SortKey, (dir: 'ASC' | 'DESC') => string> = {
  title: (d) =>
    `${titleExpr} COLLATE NOCASE ${d}, m.parsed_season ${d}, m.parsed_episode ${d}, m.file_name COLLATE NOCASE`,
  year: (d) => `${yearExpr} IS NULL, ${yearExpr} ${d}, ${titleExpr} COLLATE NOCASE`,
  added: (d) => `m.added_at ${d}, ${titleExpr} COLLATE NOCASE`,
  size: (d) => `m.size_bytes ${d}`,
  'last-watched': (d) => `h.last_watched_at IS NULL, h.last_watched_at ${d}`,
  episode: (d) =>
    `m.parsed_season IS NULL, m.parsed_season ${d}, m.parsed_episode ${d}, m.file_name COLLATE NOCASE ${d}`,
}

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`)
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

export class LibraryQueryRepository {
  constructor(private readonly db: Database) {}

  query(q: LibraryQuery): LibraryItem[] {
    const where: string[] = []
    const params: SqlValue[] = []
    let from = 'media_files m LEFT JOIN playback_history h ON h.path_key = m.path_key'
    let sort: SortKey = q.sort ?? 'title'
    let direction: 'ASC' | 'DESC' = q.direction === 'desc' ? 'DESC' : 'ASC'
    let limit = q.limit ?? DEFAULT_LIMIT
    let includeMissing = false

    switch (q.view) {
      case 'all':
        break
      case 'movies':
        where.push("m.parsed_kind = 'movie'")
        break
      case 'episodes':
        where.push("m.parsed_kind = 'episode'")
        if (!q.sort) sort = 'episode'
        break
      case 'favorites':
        where.push('m.favorite = 1')
        break
      case 'missing':
        includeMissing = true
        where.push('m.missing = 1')
        break
      case 'unmatched':
        // Not identified yet, ambiguous, not found, rejected, or failed.
        where.push(`COALESCE(mf.status, ms.status, '') <> 'matched'`)
        break
      case 'recently-added':
        if (!q.sort) {
          sort = 'added'
          direction = 'DESC'
        }
        limit = Math.min(limit, SHELF_LIMIT)
        break
      case 'continue-watching':
      case 'recently-watched':
        // History-driven: includes files played from outside the library.
        from = 'playback_history h LEFT JOIN media_files m ON m.path_key = h.path_key'
        includeMissing = true
        if (q.view === 'continue-watching') {
          where.push('h.completed = 0', `h.position_seconds >= ${MIN_RESUME_SECONDS}`)
        }
        if (!q.sort) {
          sort = 'last-watched'
          direction = 'DESC'
        }
        limit = Math.min(limit, SHELF_LIMIT)
        break
    }

    if (!includeMissing) where.push('m.missing = 0')
    if (q.showKey !== undefined) {
      where.push("m.parsed_kind = 'episode'", 'lower(m.parsed_title) = ?')
      params.push(q.showKey)
    }
    if (q.kind) {
      where.push('m.parsed_kind = ?')
      params.push(q.kind)
    }
    if (q.resolution) {
      where.push('m.parsed_resolution = ?')
      params.push(q.resolution)
    }
    if (q.watched === 'watched') where.push('h.completed = 1')
    if (q.watched === 'unwatched')
      where.push('(h.path_key IS NULL OR (h.completed = 0 AND h.position_seconds < ?))')
    if (q.watched === 'unwatched') params.push(MIN_RESUME_SECONDS)
    if (q.watched === 'in-progress') {
      where.push('h.completed = 0 AND h.position_seconds >= ?')
      params.push(MIN_RESUME_SECONDS)
    }
    if (q.search) {
      const like = `%${escapeLike(q.search)}%`
      where.push(
        `(m.parsed_title LIKE ? ESCAPE '\\' OR m.file_name LIKE ? ESCAPE '\\'
          OR m.parsed_episode_title LIKE ? ESCAPE '\\' OR COALESCE(m.relative_path, h.path) LIKE ? ESCAPE '\\'
          OR md.title LIKE ? ESCAPE '\\' OR md.original_title LIKE ? ESCAPE '\\'
          OR me.name LIKE ? ESCAPE '\\')`,
      )
      params.push(like, like, like, like, like, like, like)
    }

    const sql = `SELECT ${itemColumns} FROM ${from} ${metadataJoins}
      ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY ${orderBy[sort](direction)}
      LIMIT ?`
    params.push(limit)
    const rows = this.db.prepare(sql).all(...params) as unknown as ItemRow[]
    return rows.map(toItem)
  }

  listShows(search?: string): LibraryShow[] {
    const params: SqlValue[] = []
    let filter = ''
    if (search) {
      const like = `%${escapeLike(search)}%`
      filter = `AND (m.parsed_title LIKE ? ESCAPE '\\' OR m.parsed_episode_title LIKE ? ESCAPE '\\'
        OR md.title LIKE ? ESCAPE '\\' OR md.original_title LIKE ? ESCAPE '\\')`
      params.push(like, like, like, like)
    }
    const rows = this.db
      .prepare(
        `SELECT lower(m.parsed_title) AS key,
                MIN(m.parsed_title) AS title,
                COALESCE(MAX(md.year), MIN(m.parsed_year)) AS year,
                COUNT(*) AS episodeCount,
                group_concat(DISTINCT m.parsed_season) AS seasons,
                SUM(m.parsed_season IS NULL) AS unseasoned,
                SUM(COALESCE(h.completed, 0)) AS watchedCount,
                MAX(m.added_at) AS lastAddedAt,
                MAX(ms.status) AS matchStatus,
                MAX(md.title) AS metadataTitle,
                MAX(md.poster_path) AS posterPath
         FROM media_files m
         LEFT JOIN playback_history h ON h.path_key = m.path_key
         LEFT JOIN media_matches ms ON ms.target_type = 'show' AND ms.target_key = lower(m.parsed_title)
         LEFT JOIN metadata_items md ON ms.status = 'matched' AND md.media_type = ms.tmdb_media_type
           AND md.tmdb_id = ms.tmdb_id
         WHERE m.parsed_kind = 'episode' AND m.parsed_title IS NOT NULL AND m.missing = 0 ${filter}
         GROUP BY lower(m.parsed_title)
         ORDER BY COALESCE(MAX(md.title), MIN(m.parsed_title)) COLLATE NOCASE`,
      )
      .all(...params) as unknown as {
      key: string
      title: string
      year: number | null
      episodeCount: number
      seasons: string | null
      unseasoned: number
      watchedCount: number
      lastAddedAt: string
      matchStatus: MatchStatus | null
      metadataTitle: string | null
      posterPath: string | null
    }[]
    return rows.map((r) => ({
      key: r.key,
      title: r.title,
      year: r.year,
      episodeCount: r.episodeCount,
      seasons: (r.seasons ?? '')
        .split(',')
        .filter(Boolean)
        .map(Number)
        .sort((a, b) => a - b),
      hasUnseasonedEpisodes: r.unseasoned > 0,
      watchedCount: r.watchedCount,
      lastAddedAt: r.lastAddedAt,
      matchStatus: r.matchStatus,
      metadataTitle: r.metadataTitle,
      posterPath: r.posterPath,
    }))
  }

  listResolutions(): string[] {
    return (
      this.db
        .prepare(
          `SELECT DISTINCT parsed_resolution AS r FROM media_files
           WHERE parsed_resolution IS NOT NULL AND missing = 0 ORDER BY CAST(parsed_resolution AS INTEGER) DESC`,
        )
        .all() as { r: string }[]
    ).map((row) => row.r)
  }

  getFile(id: number): { path: string; pathKey: string } | undefined {
    return this.db
      .prepare('SELECT path, path_key AS pathKey FROM media_files WHERE id = ?')
      .get(id) as { path: string; pathKey: string } | undefined
  }

  getHistoryPath(historyKey: string): string | undefined {
    const row = this.db
      .prepare('SELECT path FROM playback_history WHERE path_key = ?')
      .get(historyKey) as { path: string } | undefined
    return row?.path
  }

  setFavorite(id: number, favorite: boolean): boolean {
    return (
      Number(
        this.db
          .prepare('UPDATE media_files SET favorite = ? WHERE id = ?')
          .run(favorite ? 1 : 0, id).changes,
      ) > 0
    )
  }
}

function toItem(r: ItemRow): LibraryItem {
  return {
    fileId: r.fileId,
    historyKey: r.historyKey,
    path: r.path,
    fileName: r.fileName ?? fileName(r.path),
    kind: r.kind ?? 'unknown',
    title: r.title,
    year: r.year,
    season: r.season,
    episode: r.episode,
    episodeEnd: r.episodeEnd,
    episodeTitle: r.episodeTitle,
    resolution: r.resolution,
    sizeBytes: r.sizeBytes,
    addedAt: r.addedAt,
    missing: r.missing === 1,
    favorite: r.favorite === 1,
    progress:
      r.lastWatchedAt !== null
        ? {
            position: r.position ?? 0,
            duration: r.duration,
            completed: r.completed === 1,
            lastWatchedAt: r.lastWatchedAt,
          }
        : null,
    matchStatus: r.matchStatus,
    metadataTitle: r.metadataTitle,
    metadataYear: r.metadataYear,
    posterPath: r.posterPath,
    episodeName: r.episodeName,
    stillPath: r.stillPath,
  }
}

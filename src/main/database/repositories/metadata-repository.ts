import type {
  CastMember,
  EpisodeMetadata,
  MatchCandidate,
  MatchStatus,
  MediaMetadata,
  MetadataMediaType,
} from '@shared/contracts/metadata'
import { transaction, type Database } from '../connection'

export type TargetType = 'file' | 'show'

export interface MatchRow {
  targetType: TargetType
  targetKey: string
  status: MatchStatus
  source: 'auto' | 'user' | null
  confidence: number | null
  tmdbMediaType: MetadataMediaType | null
  tmdbId: number | null
  candidates: MatchCandidate[]
  error: string | null
  updatedAt: string
}

/** A file or show that has not been identified yet. */
export interface PendingTarget {
  targetType: TargetType
  targetKey: string
  title: string
  year: number | null
  mediaType: MetadataMediaType
  /** Seasons present locally (shows only). */
  seasons: number[]
}

function parseJson<T>(json: string | null, fallback: T): T {
  if (!json) return fallback
  try {
    return JSON.parse(json) as T
  } catch {
    return fallback
  }
}

export class MetadataRepository {
  constructor(private readonly db: Database) {}

  // ── Matches ──────────────────────────────────────────────────────────────

  getMatch(targetType: TargetType, targetKey: string): MatchRow | undefined {
    const row = this.db
      .prepare(
        `SELECT target_type AS targetType, target_key AS targetKey, status, source, confidence,
                tmdb_media_type AS tmdbMediaType, tmdb_id AS tmdbId, candidates_json AS candidates,
                error, updated_at AS updatedAt
         FROM media_matches WHERE target_type = ? AND target_key = ?`,
      )
      .get(targetType, targetKey) as
      (Omit<MatchRow, 'candidates'> & { candidates: string }) | undefined
    return row ? { ...row, candidates: parseJson(row.candidates, []) } : undefined
  }

  saveMatch(row: Omit<MatchRow, 'updatedAt'>, now: string): void {
    this.db
      .prepare(
        `INSERT INTO media_matches (target_type, target_key, status, source, confidence,
           tmdb_media_type, tmdb_id, candidates_json, error, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(target_type, target_key) DO UPDATE SET
           status = excluded.status, source = excluded.source, confidence = excluded.confidence,
           tmdb_media_type = excluded.tmdb_media_type, tmdb_id = excluded.tmdb_id,
           candidates_json = excluded.candidates_json, error = excluded.error,
           updated_at = excluded.updated_at`,
      )
      .run(
        row.targetType,
        row.targetKey,
        row.status,
        row.source,
        row.confidence,
        row.tmdbMediaType,
        row.tmdbId,
        JSON.stringify(row.candidates),
        row.error,
        now,
      )
  }

  deleteMatch(targetType: TargetType, targetKey: string): void {
    this.db
      .prepare('DELETE FROM media_matches WHERE target_type = ? AND target_key = ?')
      .run(targetType, targetKey)
  }

  /** Errors are retried on the next identification run. */
  clearErrors(): void {
    this.db.prepare("DELETE FROM media_matches WHERE status = 'error'").run()
  }

  /** Movies/unknown files and shows present in the library with no match row yet. */
  pendingTargets(): PendingTarget[] {
    const files = this.db
      .prepare(
        `SELECT m.path_key AS targetKey, m.parsed_title AS title, m.parsed_year AS year
         FROM media_files m
         LEFT JOIN media_matches mm ON mm.target_type = 'file' AND mm.target_key = m.path_key
         WHERE m.missing = 0 AND m.parsed_kind <> 'episode' AND m.parsed_title IS NOT NULL
           AND mm.target_key IS NULL`,
      )
      .all() as { targetKey: string; title: string; year: number | null }[]
    const shows = this.db
      .prepare(
        `SELECT lower(m.parsed_title) AS targetKey, MIN(m.parsed_title) AS title,
                MIN(m.parsed_year) AS year,
                group_concat(DISTINCT m.parsed_season) AS seasons
         FROM media_files m
         LEFT JOIN media_matches mm ON mm.target_type = 'show' AND mm.target_key = lower(m.parsed_title)
         WHERE m.missing = 0 AND m.parsed_kind = 'episode' AND m.parsed_title IS NOT NULL
           AND mm.target_key IS NULL
         GROUP BY lower(m.parsed_title)`,
      )
      .all() as { targetKey: string; title: string; year: number | null; seasons: string | null }[]
    return [
      ...files.map((f) => ({
        ...f,
        targetType: 'file' as const,
        mediaType: 'movie' as const,
        seasons: [],
      })),
      ...shows.map((s) => ({
        targetType: 'show' as const,
        targetKey: s.targetKey,
        title: s.title,
        year: s.year,
        mediaType: 'tv' as const,
        seasons: this.parseSeasons(s.seasons),
      })),
    ]
  }

  /** Seasons present locally for a show key. */
  localSeasons(showKey: string): number[] {
    const row = this.db
      .prepare(
        `SELECT group_concat(DISTINCT parsed_season) AS seasons FROM media_files
         WHERE parsed_kind = 'episode' AND lower(parsed_title) = ? AND missing = 0`,
      )
      .get(showKey) as { seasons: string | null } | undefined
    return this.parseSeasons(row?.seasons ?? null)
  }

  /** Evidence for a single target (used when the user asks to re-identify it). */
  targetEvidence(targetType: TargetType, targetKey: string): PendingTarget | undefined {
    if (targetType === 'file') {
      const row = this.db
        .prepare(
          `SELECT parsed_title AS title, parsed_year AS year, file_name AS fileName
           FROM media_files WHERE path_key = ?`,
        )
        .get(targetKey) as
        { title: string | null; year: number | null; fileName: string } | undefined
      if (!row) return undefined
      return {
        targetType,
        targetKey,
        title: row.title ?? row.fileName,
        year: row.year,
        mediaType: 'movie',
        seasons: [],
      }
    }
    const row = this.db
      .prepare(
        `SELECT MIN(parsed_title) AS title, MIN(parsed_year) AS year FROM media_files
         WHERE parsed_kind = 'episode' AND lower(parsed_title) = ?`,
      )
      .get(targetKey) as { title: string | null; year: number | null } | undefined
    if (!row?.title) return undefined
    return {
      targetType,
      targetKey,
      title: row.title,
      year: row.year,
      mediaType: 'tv',
      seasons: this.localSeasons(targetKey),
    }
  }

  // ── Metadata ─────────────────────────────────────────────────────────────

  saveMetadata(m: MediaMetadata): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO metadata_items (media_type, tmdb_id, title, original_title, overview,
           release_date, year, runtime_minutes, poster_path, backdrop_path, vote_average, vote_count,
           original_language, imdb_id, tvdb_id, genres_json, cast_json, creators_json,
           production_json, fetched_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        m.mediaType,
        m.tmdbId,
        m.title,
        m.originalTitle,
        m.overview,
        m.releaseDate,
        m.year,
        m.runtimeMinutes,
        m.posterPath,
        m.backdropPath,
        m.voteAverage,
        m.voteCount,
        m.originalLanguage,
        m.imdbId,
        m.tvdbId,
        JSON.stringify(m.genres),
        JSON.stringify(m.cast),
        JSON.stringify(m.creators),
        JSON.stringify(m.production),
        m.fetchedAt,
      )
  }

  /** "movie:603", "tv:1396", … for every TMDB entry something local is matched to. */
  matchedTmdbKeys(): Set<string> {
    const rows = this.db
      .prepare(
        `SELECT DISTINCT tmdb_media_type AS mediaType, tmdb_id AS tmdbId FROM media_matches
         WHERE status = 'matched'`,
      )
      .all() as { mediaType: string; tmdbId: number }[]
    return new Set(rows.map((r) => `${r.mediaType}:${r.tmdbId}`))
  }

  getMetadata(mediaType: MetadataMediaType, tmdbId: number): MediaMetadata | undefined {
    const r = this.db
      .prepare(
        `SELECT media_type AS mediaType, tmdb_id AS tmdbId, title, original_title AS originalTitle,
                overview, release_date AS releaseDate, year, runtime_minutes AS runtimeMinutes,
                poster_path AS posterPath, backdrop_path AS backdropPath, vote_average AS voteAverage,
                vote_count AS voteCount, original_language AS originalLanguage, imdb_id AS imdbId,
                tvdb_id AS tvdbId, genres_json AS genres, cast_json AS "cast",
                creators_json AS creators, production_json AS production, fetched_at AS fetchedAt
         FROM metadata_items WHERE media_type = ? AND tmdb_id = ?`,
      )
      .get(mediaType, tmdbId) as
      | (Omit<MediaMetadata, 'genres' | 'cast' | 'creators' | 'production'> & {
          genres: string
          cast: string
          creators: string
          production: string
        })
      | undefined
    if (!r) return undefined
    return {
      ...r,
      genres: parseJson<string[]>(r.genres, []),
      cast: parseJson<CastMember[]>(r.cast, []),
      creators: parseJson<string[]>(r.creators, []),
      production: parseJson<string[]>(r.production, []),
    }
  }

  saveEpisodes(tmdbId: number, episodes: readonly EpisodeMetadata[], fetchedAt: string): void {
    const insert = this.db.prepare(
      `INSERT OR REPLACE INTO metadata_episodes (tmdb_id, season, episode, name, overview, air_date,
         still_path, runtime_minutes, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    transaction(this.db, () => {
      for (const e of episodes) {
        insert.run(
          tmdbId,
          e.season,
          e.episode,
          e.name,
          e.overview,
          e.airDate,
          e.stillPath,
          e.runtimeMinutes,
          fetchedAt,
        )
      }
    })
  }

  getEpisode(tmdbId: number, season: number, episode: number): EpisodeMetadata | undefined {
    return this.db
      .prepare(
        `SELECT season, episode, name, overview, air_date AS airDate, still_path AS stillPath,
                runtime_minutes AS runtimeMinutes
         FROM metadata_episodes WHERE tmdb_id = ? AND season = ? AND episode = ?`,
      )
      .get(tmdbId, season, episode) as EpisodeMetadata | undefined
  }

  hasSeason(tmdbId: number, season: number): boolean {
    return (
      this.db
        .prepare('SELECT 1 FROM metadata_episodes WHERE tmdb_id = ? AND season = ? LIMIT 1')
        .get(tmdbId, season) !== undefined
    )
  }

  /** Matched TMDB entries whose cached data is older than `before`. */
  staleMetadata(before: string): { mediaType: MetadataMediaType; tmdbId: number }[] {
    return this.db
      .prepare(
        `SELECT media_type AS mediaType, tmdb_id AS tmdbId FROM metadata_items WHERE fetched_at < ?`,
      )
      .all(before) as { mediaType: MetadataMediaType; tmdbId: number }[]
  }

  /** Removes cached TMDB data older than `before`. Match identities are kept. */
  purgeBefore(before: string): void {
    transaction(this.db, () => {
      this.db.prepare('DELETE FROM metadata_items WHERE fetched_at < ?').run(before)
      this.db.prepare('DELETE FROM metadata_episodes WHERE fetched_at < ?').run(before)
      this.db.prepare('DELETE FROM http_cache WHERE fetched_at < ?').run(before)
    })
  }

  // ── Response cache ───────────────────────────────────────────────────────

  getCached(key: string, notBefore: string): unknown {
    const row = this.db
      .prepare('SELECT body_json AS body FROM http_cache WHERE cache_key = ? AND fetched_at >= ?')
      .get(key, notBefore) as { body: string } | undefined
    return row ? parseJson<unknown>(row.body, undefined) : undefined
  }

  putCached(key: string, body: unknown, now: string): void {
    this.db
      .prepare(
        'INSERT OR REPLACE INTO http_cache (cache_key, body_json, fetched_at) VALUES (?, ?, ?)',
      )
      .run(key, JSON.stringify(body), now)
  }

  private parseSeasons(text: string | null): number[] {
    return (text ?? '')
      .split(',')
      .filter(Boolean)
      .map(Number)
      .filter(Number.isInteger)
      .sort((a, b) => a - b)
  }
}

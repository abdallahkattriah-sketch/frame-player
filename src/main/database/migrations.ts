export interface Migration {
  version: number
  name: string
  sql: string
}

/** Append-only. Never edit a migration that has shipped; add a new one instead. */
export const migrations: readonly Migration[] = [
  {
    version: 1,
    name: 'settings-and-provider-config',
    sql: `
      CREATE TABLE app_settings (
        section    TEXT PRIMARY KEY NOT NULL,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ) STRICT;

      -- Non-secret provider configuration only. Secrets live in the credential store.
      CREATE TABLE provider_config (
        provider_id   TEXT PRIMARY KEY NOT NULL,
        enabled       INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
        metadata_json TEXT NOT NULL DEFAULT '{}',
        updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ) STRICT;
    `,
  },
  {
    version: 2,
    name: 'library-folders-and-files',
    sql: `
      CREATE TABLE library_folders (
        id               INTEGER PRIMARY KEY,
        path             TEXT NOT NULL,
        -- Case-folded, normalized path used for uniqueness and nesting checks on Windows.
        path_key         TEXT NOT NULL UNIQUE,
        available        INTEGER NOT NULL DEFAULT 1 CHECK (available IN (0, 1)),
        follow_symlinks  INTEGER NOT NULL DEFAULT 0 CHECK (follow_symlinks IN (0, 1)),
        auto_rescan      INTEGER NOT NULL DEFAULT 0 CHECK (auto_rescan IN (0, 1)),
        added_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        last_scan_at     TEXT,
        last_scan_status TEXT NOT NULL DEFAULT 'never'
          CHECK (last_scan_status IN ('never', 'scanning', 'complete', 'failed', 'unavailable', 'cancelled')),
        last_scan_error  TEXT
      ) STRICT;

      CREATE TABLE library_folder_exclusions (
        folder_id     INTEGER NOT NULL REFERENCES library_folders(id) ON DELETE CASCADE,
        relative_path TEXT NOT NULL,
        PRIMARY KEY (folder_id, relative_path)
      ) STRICT;

      -- A local file. Its identity never depends on remote metadata.
      CREATE TABLE media_files (
        id             INTEGER PRIMARY KEY,
        folder_id      INTEGER NOT NULL REFERENCES library_folders(id) ON DELETE CASCADE,
        path           TEXT NOT NULL,
        path_key       TEXT NOT NULL UNIQUE,
        relative_path  TEXT NOT NULL,
        file_name      TEXT NOT NULL,
        size_bytes     INTEGER NOT NULL CHECK (size_bytes >= 0),
        mtime_ms       INTEGER NOT NULL,
        added_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        last_seen_scan INTEGER NOT NULL,
        missing        INTEGER NOT NULL DEFAULT 0 CHECK (missing IN (0, 1)),
        missing_since  TEXT,
        -- Evidence parsed from the file name; may all be NULL.
        parsed_kind          TEXT NOT NULL CHECK (parsed_kind IN ('movie', 'episode', 'unknown')),
        parsed_title         TEXT,
        parsed_year          INTEGER,
        parsed_season        INTEGER,
        parsed_episode       INTEGER,
        parsed_episode_end   INTEGER,
        parsed_episode_title TEXT,
        parsed_resolution    TEXT,
        parsed_video_codec   TEXT,
        parsed_edition       TEXT,
        parsed_release_group TEXT
      ) STRICT;

      CREATE INDEX media_files_folder ON media_files (folder_id, missing);
      CREATE INDEX media_files_added ON media_files (added_at);
      CREATE INDEX media_files_title ON media_files (parsed_title COLLATE NOCASE);
      CREATE INDEX media_files_show ON media_files (parsed_kind, parsed_title, parsed_season, parsed_episode);
    `,
  },
  {
    version: 3,
    name: 'favorites-and-playback-history',
    sql: `
      ALTER TABLE media_files ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0 CHECK (favorite IN (0, 1));
      CREATE INDEX media_files_favorite ON media_files (favorite) WHERE favorite = 1;

      -- Keyed by normalized path (not media_files.id) so history survives removing and
      -- re-adding a folder, and covers files played from outside the library.
      CREATE TABLE playback_history (
        path_key          TEXT PRIMARY KEY NOT NULL,
        path              TEXT NOT NULL,
        position_seconds  REAL NOT NULL DEFAULT 0 CHECK (position_seconds >= 0),
        duration_seconds  REAL CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
        completed         INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
        play_count        INTEGER NOT NULL DEFAULT 0 CHECK (play_count >= 0),
        last_watched_at   TEXT NOT NULL,
        -- mpv track ids; 0 means the track type was switched off. NULL = unknown.
        audio_track_id    INTEGER,
        subtitle_track_id INTEGER,
        speed             REAL
      ) STRICT;
      CREATE INDEX playback_history_recent ON playback_history (last_watched_at);
    `,
  },
  {
    version: 4,
    name: 'tmdb-metadata',
    sql: `
      -- Descriptive TMDB data. TMDB's terms limit caching to 6 months, so rows are
      -- refreshed or purged by fetched_at; match identity lives in media_matches.
      CREATE TABLE metadata_items (
        media_type        TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
        tmdb_id           INTEGER NOT NULL,
        title             TEXT NOT NULL,
        original_title    TEXT,
        overview          TEXT,
        release_date      TEXT,
        year              INTEGER,
        runtime_minutes   INTEGER,
        poster_path       TEXT,
        backdrop_path     TEXT,
        vote_average      REAL,
        vote_count        INTEGER,
        original_language TEXT,
        imdb_id           TEXT,
        tvdb_id           INTEGER,
        genres_json       TEXT NOT NULL DEFAULT '[]',
        cast_json         TEXT NOT NULL DEFAULT '[]',
        creators_json     TEXT NOT NULL DEFAULT '[]',
        production_json   TEXT NOT NULL DEFAULT '[]',
        fetched_at        TEXT NOT NULL,
        PRIMARY KEY (media_type, tmdb_id)
      ) STRICT;

      CREATE TABLE metadata_episodes (
        tmdb_id         INTEGER NOT NULL,
        season          INTEGER NOT NULL,
        episode         INTEGER NOT NULL,
        name            TEXT,
        overview        TEXT,
        air_date        TEXT,
        still_path      TEXT,
        runtime_minutes INTEGER,
        fetched_at      TEXT NOT NULL,
        PRIMARY KEY (tmdb_id, season, episode)
      ) STRICT;

      -- Which TMDB entry a local file (movies) or show (episodes, by case-folded title) is.
      CREATE TABLE media_matches (
        target_type     TEXT NOT NULL CHECK (target_type IN ('file', 'show')),
        target_key      TEXT NOT NULL,
        status          TEXT NOT NULL CHECK (status IN ('matched', 'candidates', 'no-match', 'rejected', 'error')),
        source          TEXT CHECK (source IN ('auto', 'user')),
        confidence      REAL,
        tmdb_media_type TEXT CHECK (tmdb_media_type IN ('movie', 'tv')),
        tmdb_id         INTEGER,
        candidates_json TEXT NOT NULL DEFAULT '[]',
        error           TEXT,
        updated_at      TEXT NOT NULL,
        PRIMARY KEY (target_type, target_key),
        CHECK (status <> 'matched' OR (tmdb_id IS NOT NULL AND tmdb_media_type IS NOT NULL))
      ) STRICT;
      CREATE INDEX media_matches_tmdb ON media_matches (tmdb_media_type, tmdb_id);

      -- Cached search responses (also bounded by the 6-month rule; much shorter in practice).
      CREATE TABLE http_cache (
        cache_key  TEXT PRIMARY KEY NOT NULL,
        body_json  TEXT NOT NULL,
        fetched_at TEXT NOT NULL
      ) STRICT;
    `,
  },
  {
    version: 5,
    name: 'bookmarks',
    sql: `
      -- Scene bookmarks, keyed like playback history so they survive rescans and metadata changes.
      CREATE TABLE bookmarks (
        id               INTEGER PRIMARY KEY,
        path_key         TEXT NOT NULL,
        path             TEXT NOT NULL,
        position_seconds REAL NOT NULL CHECK (position_seconds >= 0),
        title            TEXT,
        note             TEXT,
        created_at       TEXT NOT NULL
      ) STRICT;
      CREATE INDEX bookmarks_path ON bookmarks (path_key, position_seconds);
    `,
  },
]

export const latestSchemaVersion = migrations.reduce((max, m) => Math.max(max, m.version), 0)

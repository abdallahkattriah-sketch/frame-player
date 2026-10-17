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
]

export const latestSchemaVersion = migrations.reduce((max, m) => Math.max(max, m.version), 0)

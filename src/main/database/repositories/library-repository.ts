import type { LibraryFolder, ParsedMediaName, ScanStatus } from '@shared/contracts/library'
import { transaction, type Database } from '../connection'

interface FolderRow {
  id: number
  path: string
  pathKey: string
  available: number
  followSymlinks: number
  autoRescan: number
  lastScanAt: string | null
  lastScanStatus: ScanStatus
  lastScanError: string | null
  fileCount: number
  missingCount: number
}

export interface ScannedFile extends ParsedMediaName {
  path: string
  pathKey: string
  relativePath: string
  fileName: string
  sizeBytes: number
  mtimeMs: number
}

export class LibraryRepository {
  constructor(private readonly db: Database) {}

  listFolders(): LibraryFolder[] {
    const rows = this.db
      .prepare(
        `SELECT f.id, f.path, f.path_key AS pathKey, f.available, f.follow_symlinks AS followSymlinks,
                f.auto_rescan AS autoRescan, f.last_scan_at AS lastScanAt,
                f.last_scan_status AS lastScanStatus, f.last_scan_error AS lastScanError,
                (SELECT COUNT(*) FROM media_files m WHERE m.folder_id = f.id AND m.missing = 0) AS fileCount,
                (SELECT COUNT(*) FROM media_files m WHERE m.folder_id = f.id AND m.missing = 1) AS missingCount
         FROM library_folders f ORDER BY f.path COLLATE NOCASE`,
      )
      .all() as unknown as FolderRow[]
    const exclusions = this.db
      .prepare(
        'SELECT folder_id AS folderId, relative_path AS relativePath FROM library_folder_exclusions',
      )
      .all() as unknown as { folderId: number; relativePath: string }[]
    return rows.map((r) => ({
      id: r.id,
      path: r.path,
      available: r.available === 1,
      followSymlinks: r.followSymlinks === 1,
      autoRescan: r.autoRescan === 1,
      exclusions: exclusions.filter((e) => e.folderId === r.id).map((e) => e.relativePath),
      lastScanAt: r.lastScanAt,
      lastScanStatus: r.lastScanStatus,
      lastScanError: r.lastScanError,
      fileCount: r.fileCount,
      missingCount: r.missingCount,
    }))
  }

  getFolder(id: number): LibraryFolder | undefined {
    return this.listFolders().find((f) => f.id === id)
  }

  folderKeys(): { id: number; pathKey: string }[] {
    return this.db
      .prepare('SELECT id, path_key AS pathKey FROM library_folders')
      .all() as unknown as { id: number; pathKey: string }[]
  }

  insertFolder(path: string, pathKey: string): number {
    const result = this.db
      .prepare('INSERT INTO library_folders (path, path_key) VALUES (?, ?)')
      .run(path, pathKey)
    return Number(result.lastInsertRowid)
  }

  /** Removes the folder and its file records. Files on disk are never touched. */
  deleteFolder(id: number): void {
    this.db.prepare('DELETE FROM library_folders WHERE id = ?').run(id)
  }

  updateFolderOptions(
    id: number,
    options: { followSymlinks?: boolean; autoRescan?: boolean; exclusions?: string[] },
  ): void {
    transaction(this.db, () => {
      if (options.followSymlinks !== undefined) {
        this.db
          .prepare('UPDATE library_folders SET follow_symlinks = ? WHERE id = ?')
          .run(options.followSymlinks ? 1 : 0, id)
      }
      if (options.autoRescan !== undefined) {
        this.db
          .prepare('UPDATE library_folders SET auto_rescan = ? WHERE id = ?')
          .run(options.autoRescan ? 1 : 0, id)
      }
      if (options.exclusions !== undefined) {
        this.db.prepare('DELETE FROM library_folder_exclusions WHERE folder_id = ?').run(id)
        const insert = this.db.prepare(
          'INSERT OR IGNORE INTO library_folder_exclusions (folder_id, relative_path) VALUES (?, ?)',
        )
        for (const e of options.exclusions) insert.run(id, e)
      }
    })
  }

  setScanState(
    id: number,
    state: { status: ScanStatus; error?: string | null; available?: boolean; finished?: boolean },
  ): void {
    this.db
      .prepare(
        `UPDATE library_folders SET
           last_scan_status = ?,
           last_scan_error = ?,
           available = COALESCE(?, available),
           last_scan_at = CASE WHEN ? THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now') ELSE last_scan_at END
         WHERE id = ?`,
      )
      .run(
        state.status,
        state.error ?? null,
        state.available === undefined ? null : state.available ? 1 : 0,
        state.finished ? 1 : 0,
        id,
      )
  }

  /**
   * Inserts new files and refreshes changed ones in one transaction. A file whose size and
   * modification time are unchanged keeps its row (and therefore its id and history).
   */
  upsertFiles(folderId: number, scanId: number, files: readonly ScannedFile[]): void {
    const statement = this.db.prepare(
      `INSERT INTO media_files (
         folder_id, path, path_key, relative_path, file_name, size_bytes, mtime_ms, last_seen_scan,
         parsed_kind, parsed_title, parsed_year, parsed_season, parsed_episode, parsed_episode_end,
         parsed_episode_title, parsed_resolution, parsed_video_codec, parsed_edition, parsed_release_group)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(path_key) DO UPDATE SET
         folder_id = excluded.folder_id,
         path = excluded.path,
         relative_path = excluded.relative_path,
         file_name = excluded.file_name,
         last_seen_scan = excluded.last_seen_scan,
         missing = 0,
         missing_since = NULL,
         updated_at = CASE
           WHEN media_files.size_bytes <> excluded.size_bytes OR media_files.mtime_ms <> excluded.mtime_ms
           THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now') ELSE media_files.updated_at END,
         size_bytes = excluded.size_bytes,
         mtime_ms = excluded.mtime_ms,
         parsed_kind = excluded.parsed_kind,
         parsed_title = excluded.parsed_title,
         parsed_year = excluded.parsed_year,
         parsed_season = excluded.parsed_season,
         parsed_episode = excluded.parsed_episode,
         parsed_episode_end = excluded.parsed_episode_end,
         parsed_episode_title = excluded.parsed_episode_title,
         parsed_resolution = excluded.parsed_resolution,
         parsed_video_codec = excluded.parsed_video_codec,
         parsed_edition = excluded.parsed_edition,
         parsed_release_group = excluded.parsed_release_group`,
    )
    transaction(this.db, () => {
      for (const f of files) {
        statement.run(
          folderId,
          f.path,
          f.pathKey,
          f.relativePath,
          f.fileName,
          f.sizeBytes,
          f.mtimeMs,
          scanId,
          f.kind,
          f.title,
          f.year,
          f.season,
          f.episode,
          f.episodeEnd,
          f.episodeTitle,
          f.resolution,
          f.videoCodec,
          f.edition,
          f.releaseGroup,
        )
      }
    })
  }

  /** After a completed scan: files not seen are marked missing (rows are kept). */
  markUnseenMissing(folderId: number, scanId: number): number {
    const result = this.db
      .prepare(
        `UPDATE media_files
         SET missing = 1, missing_since = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE folder_id = ? AND last_seen_scan <> ? AND missing = 0`,
      )
      .run(folderId, scanId)
    return Number(result.changes)
  }

  countFiles(folderId: number): { present: number; missing: number } {
    const row = this.db
      .prepare(
        `SELECT SUM(missing = 0) AS present, SUM(missing = 1) AS missing
         FROM media_files WHERE folder_id = ?`,
      )
      .get(folderId) as { present: number | null; missing: number | null }
    return { present: row.present ?? 0, missing: row.missing ?? 0 }
  }
}

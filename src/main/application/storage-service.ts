import { readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { StorageInfo } from '@shared/contracts/ipc'
import type { Database } from '../database/connection'
import { backupDatabase, getSchemaVersion } from '../database/migrator'
import type { AppPaths } from './app-paths'

/** Total size of the files under `path` (0 if it does not exist). */
export async function directorySize(path: string): Promise<number> {
  let entries
  try {
    entries = await readdir(path, { withFileTypes: true })
  } catch {
    return 0
  }
  let total = 0
  for (const entry of entries) {
    const full = join(path, entry.name)
    if (entry.isDirectory()) total += await directorySize(full)
    else if (entry.isFile())
      total += await stat(full)
        .then((s) => s.size)
        .catch(() => 0)
  }
  return total
}

async function fileSize(path: string): Promise<number> {
  return stat(path)
    .then((s) => s.size)
    .catch(() => 0)
}

export interface StorageServiceOptions {
  paths: AppPaths
  db: Database
  /** Removes timeline previews (bookmark thumbnails are kept). */
  clearPreviews: () => void
}

/** Sizes of Frame's local data and the cache-clearing and backup actions in Settings. */
export class StorageService {
  constructor(private readonly options: StorageServiceOptions) {}

  get dataDir(): string {
    return this.options.paths.userData
  }

  async info(): Promise<StorageInfo> {
    const { paths } = this.options
    const database =
      (await fileSize(paths.database)) +
      (await fileSize(`${paths.database}-wal`)) +
      (await fileSize(`${paths.database}-shm`))
    return {
      dataDir: paths.userData,
      databaseBytes: database,
      artworkBytes: await directorySize(paths.artwork),
      thumbnailBytes: await directorySize(paths.thumbnails),
      backupBytes: await directorySize(paths.backups),
    }
  }

  /**
   * Removes cached files only: artwork downloads again when needed, previews are regenerated.
   * (Bookmark thumbnails are not a cache and stay.)
   * Library data, history, bookmarks and settings are untouched.
   */
  async clearCache(kind: 'artwork' | 'thumbnails'): Promise<void> {
    if (kind === 'thumbnails') this.options.clearPreviews()
    else await rm(this.options.paths.artwork, { recursive: true, force: true })
  }

  /** Writes a consistent copy of the database to the backups folder; returns its path. */
  backupNow(): string {
    const { db, paths } = this.options
    return backupDatabase(db, paths.backups, getSchemaVersion(db))
  }
}

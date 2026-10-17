import { mkdirSync } from 'node:fs'
import { safeStorage } from 'electron'
import type { StartupStatus } from '@shared/contracts/ipc'
import type { ScanProgress } from '@shared/contracts/library'
import type { Database } from '../database/connection'
import { migrations } from '../database/migrations'
import { openAppDatabase } from '../database/open-app-database'
import { LibraryRepository } from '../database/repositories/library-repository'
import { SettingsRepository } from '../database/repositories/settings-repository'
import { LibraryService } from '../library/library-service'
import { CredentialStore } from '../security/credential-store'
import { SettingsService } from './settings-service'
import type { AppPaths } from './app-paths'

export interface AppServices {
  db: Database
  settings: SettingsService
  credentials: CredentialStore
  library: LibraryService
  startupStatus: StartupStatus
}

export interface BootstrapEvents {
  onScanProgress: (progress: ScanProgress) => void
}

export function bootstrapServices(paths: AppPaths, events: BootstrapEvents): AppServices {
  mkdirSync(paths.userData, { recursive: true })

  const { db, recoveredFrom } = openAppDatabase({
    dbPath: paths.database,
    backupDir: paths.backups,
    migrations,
  })
  if (recoveredFrom) {
    console.warn(
      `database: unreadable database moved to ${recoveredFrom.backupPath} (${recoveredFrom.reason})`,
    )
  }

  const settings = new SettingsService(new SettingsRepository(db))
  const library = new LibraryService({
    repository: new LibraryRepository(db),
    videoExtensions: () => settings.get().library.videoExtensions,
    onProgress: events.onScanProgress,
    warn: (message) => console.warn(message),
  })

  return {
    db,
    settings,
    credentials: new CredentialStore(paths.credentials, safeStorage),
    library,
    startupStatus: recoveredFrom
      ? { databaseRecovery: { backupPath: recoveredFrom.backupPath } }
      : {},
  }
}

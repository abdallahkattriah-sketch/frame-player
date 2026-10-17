import { mkdirSync } from 'node:fs'
import { safeStorage } from 'electron'
import type { StartupStatus } from '@shared/contracts/ipc'
import type { ScanProgress } from '@shared/contracts/library'
import type { MetadataStatus } from '@shared/contracts/metadata'
import type { Database } from '../database/connection'
import { migrations } from '../database/migrations'
import { openAppDatabase } from '../database/open-app-database'
import { LibraryRepository } from '../database/repositories/library-repository'
import { SettingsRepository } from '../database/repositories/settings-repository'
import { HistoryRepository } from '../database/repositories/history-repository'
import { LibraryQueryRepository } from '../database/repositories/library-query-repository'
import { MetadataRepository } from '../database/repositories/metadata-repository'
import { HistoryService } from './history-service'
import { LibraryService } from '../library/library-service'
import { CredentialStore } from '../security/credential-store'
import { HttpClient } from '../network/http-client'
import { TmdbClient } from '../metadata/tmdb/tmdb-client'
import { MetadataService } from '../metadata/metadata-service'
import { ArtworkCache } from '../metadata/artwork-cache'
import { SettingsService } from './settings-service'
import type { AppPaths } from './app-paths'

export interface AppServices {
  db: Database
  settings: SettingsService
  credentials: CredentialStore
  library: LibraryService
  libraryQuery: LibraryQueryRepository
  historyRepository: HistoryRepository
  history: HistoryService
  metadata: MetadataService
  tmdb: TmdbClient
  artwork: ArtworkCache
  startupStatus: StartupStatus
}

export interface BootstrapEvents {
  onScanProgress: (progress: ScanProgress) => void
  /** Library contents or watch state changed; views should refresh. */
  onLibraryChanged: () => void
  onMetadataStatus: (status: MetadataStatus) => void
}

/** Development/test-only endpoints (e.g. a local mock TMDB). Ignored in packaged builds. */
export interface DevOverrides {
  tmdbApiBase?: string
  tmdbImageBase?: string
}

export function bootstrapServices(
  paths: AppPaths,
  events: BootstrapEvents,
  overrides: DevOverrides = {},
): AppServices {
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
  const credentials = new CredentialStore(paths.credentials, safeStorage)
  const library = new LibraryService({
    repository: new LibraryRepository(db),
    videoExtensions: () => settings.get().library.videoExtensions,
    onProgress: events.onScanProgress,
    warn: (message) => console.warn(message),
  })

  const historyRepository = new HistoryRepository(db)
  const history = new HistoryService({
    repository: historyRepository,
    settings: () => settings.get().playback,
    onChanged: events.onLibraryChanged,
  })

  const libraryQuery = new LibraryQueryRepository(db)
  const http = new HttpClient()
  const onlineMetadata = () => settings.get().privacy.onlineMetadataEnabled
  const tmdb = new TmdbClient({
    http,
    getToken: () => {
      try {
        return credentials.get('tmdb.accessToken')
      } catch {
        return undefined // OS encryption unavailable: behave as not configured
      }
    },
    getLanguage: () => settings.get().metadata.language,
    apiBase: overrides.tmdbApiBase,
  })
  const metadata = new MetadataService({
    repository: new MetadataRepository(db),
    tmdb,
    isEnabled: onlineMetadata,
    getLanguage: () => settings.get().metadata.language,
    resolveFile: (id) => libraryQuery.getFileForMatch(id),
    onChanged: events.onLibraryChanged,
    onStatus: events.onMetadataStatus,
    warn: (message) => console.warn(message),
  })
  let imageBase = overrides.tmdbImageBase
  const artwork = new ArtworkCache({
    dir: paths.artwork,
    http,
    canDownload: onlineMetadata,
    getBaseUrl: () => imageBase,
  })
  // Prefer the image base URL TMDB reports, as its documentation describes.
  if (!overrides.tmdbImageBase && onlineMetadata() && tmdb.configured) {
    tmdb
      .configuration()
      .then((config) => {
        imageBase = config.images.secure_base_url
      })
      .catch(() => undefined)
  }

  return {
    db,
    settings,
    credentials,
    library,
    libraryQuery,
    historyRepository,
    history,
    metadata,
    tmdb,
    artwork,
    startupStatus: recoveredFrom
      ? { databaseRecovery: { backupPath: recoveredFrom.backupPath } }
      : {},
  }
}

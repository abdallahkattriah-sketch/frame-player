import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { app, safeStorage } from 'electron'
import type { CredentialId } from '@shared/contracts/credentials'
import type { ProviderStatus } from '@shared/contracts/subtitles'
import { SubtitleService } from '../subtitles/subtitle-service'
import { OpenSubtitlesProvider } from '../subtitles/opensubtitles/opensubtitles-provider'
import { SubSourceProvider } from '../subtitles/subsource/subsource-provider'
import { createTargetResolver } from '../subtitles/target-resolver'
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
import { StorageService } from './storage-service'
import { CollectionRepository } from '../database/repositories/collection-repository'
import { PeopleRepository } from '../database/repositories/people-repository'
import { RadarService } from '../metadata/radar-service'
import { BookmarkService } from './bookmark-service'
import { BookmarkRepository } from '../database/repositories/bookmark-repository'
import { mpvFrameExtractor, ThumbnailService } from '../media-engine/thumbnail-service'
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
  subtitles: SubtitleService
  thumbnails: ThumbnailService
  bookmarks: BookmarkService
  collections: CollectionRepository
  people: PeopleRepository
  radar: RadarService
  storage: StorageService
  startupStatus: StartupStatus
}

export interface BootstrapEvents {
  onScanProgress: (progress: ScanProgress) => void
  /** Library contents or watch state changed; views should refresh. */
  onLibraryChanged: () => void
  onMetadataStatus: (status: MetadataStatus) => void
  onSubtitleStatus?: (statuses: ProviderStatus[]) => void
  onBookmarksChanged?: () => void
}

/** Development/test-only endpoints (e.g. local mock servers). Ignored in packaged builds. */
export interface DevOverrides {
  tmdbApiBase?: string
  tmdbImageBase?: string
  openSubtitlesOrigin?: string
  subSourceOrigin?: string
}

/** The player is created after services; these calls are resolved late. */
export interface PlayerBridge {
  currentPath: () => string | null
  /** The mpv executable (also run headless for thumbnails). */
  mpvPath: () => string
  addSubtitle: (
    videoPath: string,
    subtitlePath: string,
    language: string | null,
  ) => Promise<boolean>
}

export function bootstrapServices(
  paths: AppPaths,
  events: BootstrapEvents,
  overrides: DevOverrides = {},
  player: PlayerBridge = {
    currentPath: () => null,
    mpvPath: () => 'mpv',
    addSubtitle: async () => false,
  },
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
  const metadataRepository = new MetadataRepository(db)
  const metadata = new MetadataService({
    repository: metadataRepository,
    tmdb,
    isEnabled: onlineMetadata,
    getLanguage: () => settings.get().metadata.language,
    resolveFile: (id) => libraryQuery.getFileForMatch(id),
    onChanged: events.onLibraryChanged,
    onStatus: events.onMetadataStatus,
    warn: (message) => console.warn(message),
  })
  const people = new PeopleRepository(db)
  const radar = new RadarService({
    personDetails: (id, maxAgeMs) => metadata.personDetails(id, maxAgeMs),
    releaseDates: (id) => tmdb.releaseDates(id),
    listFollowed: () => people.list(),
    cache: metadataRepository,
    offlineReason: () =>
      !onlineMetadata()
        ? 'Online metadata lookups are turned off in Settings › Privacy.'
        : !tmdb.configured
          ? 'Add a TMDB token in Settings to see releases.'
          : null,
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

  const secret = (id: CredentialId) => () => {
    try {
      return credentials.get(id)
    } catch {
      return undefined
    }
  }
  const subtitleSettings = () => settings.get().subtitles
  const subtitles = new SubtitleService({
    providers: [
      new OpenSubtitlesProvider({
        http,
        getApiKey: secret('opensubtitles.apiKey'),
        getUsername: secret('opensubtitles.username'),
        getPassword: secret('opensubtitles.password'),
        userAgent: `Frame v${app.getVersion()}`,
        baseOrigin: overrides.openSubtitlesOrigin,
      }),
      new SubSourceProvider({
        http,
        getApiKey: secret('subsource.apiKey'),
        baseOrigin: overrides.subSourceOrigin,
      }),
    ],
    isOnline: () => settings.get().privacy.onlineSubtitlesEnabled,
    isProviderEnabled: (id) => subtitleSettings().providers[id],
    allowFileHash: () => subtitleSettings().allowFileHash,
    saveDirFor: (videoPath) => {
      const s = subtitleSettings()
      return s.saveLocation === 'folder' && s.folder ? s.folder : dirname(videoPath)
    },
    resolveTarget: createTargetResolver({
      library: libraryQuery,
      metadata,
      currentPath: player.currentPath,
    }),
    addToPlayer: player.addSubtitle,
    onStatus: events.onSubtitleStatus,
  })

  const thumbnails = new ThumbnailService({
    dir: paths.thumbnails,
    extract: mpvFrameExtractor(player.mpvPath),
  })
  const bookmarks = new BookmarkService({
    repository: new BookmarkRepository(db),
    thumbnails,
    onChanged: () => events.onBookmarksChanged?.(),
  })

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
    subtitles,
    thumbnails,
    bookmarks,
    collections: new CollectionRepository(db),
    people,
    radar,
    storage: new StorageService({ paths, db, clearPreviews: () => thumbnails.clearPreviews() }),
    startupStatus: recoveredFrom
      ? { databaseRecovery: { backupPath: recoveredFrom.backupPath } }
      : {},
  }
}

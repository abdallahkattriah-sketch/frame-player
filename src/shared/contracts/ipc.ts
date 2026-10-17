import { z } from 'zod'
import type { AppSettings, SettingsPatch } from '../settings/schema'
import type { CredentialId, CredentialStoreStatus } from './credentials'
import type { OpenMediaResult, PlayerCommand, PlayerState, ScreenshotResult } from './player'
import type {
  AddFolderResult,
  FolderOptions,
  ItemRef,
  LibraryFolder,
  LibraryItem,
  LibraryQuery,
  LibraryShow,
  PlayRequest,
  ScanProgress,
} from './library'
import type {
  ItemMetadata,
  MatchCandidate,
  MatchTarget,
  MetadataMediaType,
  MetadataSearch,
  MetadataStatus,
  TokenTestResult,
} from './metadata'
import type {
  ProviderStatus,
  SubtitleDownload,
  SubtitleDownloadResult,
  SubtitleProviderId,
  SubtitleSearch,
  SubtitleSearchResponse,
} from './subtitles'

export { IpcChannel, type IpcChannelName } from './channels'

export const appInfoSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  platform: z.string().min(1),
  electronVersion: z.string().min(1),
})

export type AppInfo = z.infer<typeof appInfoSchema>

export interface StartupStatus {
  /** Present when the database was unreadable and Frame started with a fresh one. */
  databaseRecovery?: { backupPath: string }
}

/** API exposed to the renderer as `window.frame`. */
export interface FrameApi {
  app: {
    getInfo: () => Promise<AppInfo>
    getStartupStatus: () => Promise<StartupStatus>
  }
  settings: {
    get: () => Promise<AppSettings>
    update: (patch: SettingsPatch) => Promise<AppSettings>
  }
  credentials: {
    status: () => Promise<CredentialStoreStatus>
    set: (id: CredentialId, secret: string) => Promise<CredentialStoreStatus>
    delete: (id: CredentialId) => Promise<CredentialStoreStatus>
  }
  player: {
    /** Native pickers run in the main process; the chosen files replace the playlist. */
    openFilesDialog: () => Promise<OpenMediaResult>
    openFolderDialog: () => Promise<OpenMediaResult>
    /** Plays files dropped onto a window (folders expand to the videos inside). */
    openDroppedFiles: (files: readonly File[]) => Promise<OpenMediaResult>
    getState: () => Promise<PlayerState>
    command: (command: PlayerCommand) => Promise<void>
    screenshot: () => Promise<ScreenshotResult>
    /** Subscribes to state pushed from mpv; returns an unsubscribe function. */
    onState: (listener: (state: PlayerState) => void) => () => void
  }
  library: {
    listFolders: () => Promise<LibraryFolder[]>
    /** Native folder picker in the main process; the chosen folder is added and scanned. */
    addFolderDialog: () => Promise<AddFolderResult | null>
    /** Forgets the folder and its records. Files on disk are never deleted. */
    removeFolder: (id: number) => Promise<void>
    updateFolder: (id: number, options: FolderOptions) => Promise<LibraryFolder | null>
    /** Rescans one folder, or all folders when `id` is omitted. */
    rescan: (id?: number) => Promise<void>
    onScanProgress: (listener: (progress: ScanProgress) => void) => () => void
    query: (query: LibraryQuery) => Promise<LibraryItem[]>
    listShows: (search?: string) => Promise<LibraryShow[]>
    listResolutions: () => Promise<string[]>
    /** Plays items in order, starting at `startIndex`. Paths are resolved in the main process. */
    play: (request: PlayRequest) => Promise<OpenMediaResult>
    setFavorite: (fileId: number, favorite: boolean) => Promise<void>
    showInFolder: (fileId: number) => Promise<void>
    /** Fires when library contents or watch state change. */
    onChanged: (listener: () => void) => () => void
  }
  history: {
    setWatched: (item: ItemRef, watched: boolean) => Promise<void>
    remove: (item: ItemRef) => Promise<void>
  }
  metadata: {
    status: () => Promise<MetadataStatus>
    /** Checks the saved TMDB token against TMDB. */
    testToken: () => Promise<TokenTestResult>
    identifyNow: () => Promise<void>
    search: (search: MetadataSearch) => Promise<MatchCandidate[]>
    candidates: (target: MatchTarget) => Promise<MatchCandidate[]>
    apply: (target: MatchTarget, tmdbId: number, mediaType: MetadataMediaType) => Promise<void>
    /** "None of these": the target will not be matched automatically again. */
    reject: (target: MatchTarget) => Promise<void>
    reidentify: (target: MatchTarget) => Promise<void>
    item: (target: MatchTarget) => Promise<ItemMetadata>
    onStatus: (listener: (status: MetadataStatus) => void) => () => void
  }
  subtitles: {
    providers: () => Promise<ProviderStatus[]>
    validateProvider: (id: SubtitleProviderId) => Promise<ProviderStatus[]>
    search: (search: SubtitleSearch) => Promise<SubtitleSearchResponse>
    download: (download: SubtitleDownload) => Promise<SubtitleDownloadResult>
    cancelDownload: () => Promise<void>
    /** Native file picker; adds the chosen subtitle file to the current video. */
    loadFile: () => Promise<{ loaded: boolean; error?: string }>
    /** Native folder picker for where downloads are saved; null if cancelled. */
    chooseFolder: () => Promise<string | null>
    onProviders: (listener: (statuses: ProviderStatus[]) => void) => () => void
  }
}

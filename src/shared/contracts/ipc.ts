import { z } from 'zod'
import type { AppSettings, SettingsPatch } from '../settings/schema'
import type { Theme } from '../settings/theme'
import type { CredentialId, CredentialStoreStatus } from './credentials'
import type { Bookmark, BookmarkEdit } from './bookmarks'
import type {
  Collection,
  CollectionKind,
  CollectionTarget,
  CollectionTitle,
  CollectionTitleInput,
} from './collections'
import type { FollowedPerson, FollowPersonInput, PersonDetails } from './people'
import type { RadarResult } from './radar'
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
  MediaMetadata,
  TmdbListId,
  Trailer,
  TmdbSearchResult,
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

/** Sizes in bytes of Frame's local data. */
export interface StorageInfo {
  dataDir: string
  databaseBytes: number
  artworkBytes: number
  thumbnailBytes: number
  backupBytes: number
}

export interface StartupStatus {
  /** Present when the database was unreadable and Frame started with a fresh one. */
  databaseRecovery?: { backupPath: string }
}

/** API exposed to the renderer as `window.frame`. */
export interface FrameApi {
  app: {
    getInfo: () => Promise<AppInfo>
    getStartupStatus: () => Promise<StartupStatus>
    /** Brings the main window forward on its Settings view (e.g. from the player). */
    showSettings: () => Promise<void>
    /** The main window was asked to show a view. */
    onNavigate: (listener: (view: 'settings') => void) => () => void
  }
  settings: {
    get: () => Promise<AppSettings>
    update: (patch: SettingsPatch) => Promise<AppSettings>
    /** Restores defaults; library data, history and credentials are kept. */
    reset: () => Promise<AppSettings>
    /** Fires in every window after settings change (e.g. theme edits apply everywhere). */
    onChanged: (listener: (settings: AppSettings) => void) => () => void
  }
  shortcuts: {
    /** Native save dialog; false if cancelled. */
    exportFile: () => Promise<boolean>
    /** Native open dialog; the file is validated before anything changes. */
    importFile: () => Promise<{ imported: boolean; error?: string }>
  }
  themes: {
    exportFile: (themeId: string) => Promise<boolean>
    /** Adds the imported theme to the custom themes and switches to it. */
    importFile: () => Promise<{ theme?: Theme; error?: string }>
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
    /**
     * Timeline preview image URL for a position in the playing video, generated on demand.
     * Null when unavailable, turned off, or superseded by a newer request.
     */
    previewAt: (seconds: number) => Promise<string | null>
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
  storage: {
    info: () => Promise<StorageInfo>
    clearCache: (kind: 'artwork' | 'thumbnails') => Promise<void>
    /** Returns the backup file's path. */
    backupNow: () => Promise<string>
    openDataFolder: () => Promise<void>
  }
  collections: {
    list: () => Promise<Collection[]>
    create: (name: string, kind: CollectionKind, fileIds?: number[]) => Promise<Collection>
    rename: (id: number, name: string) => Promise<void>
    /** Deletes the collection only; files and library entries are kept. */
    delete: (id: number) => Promise<void>
    move: (id: number, direction: 'up' | 'down') => Promise<void>
    addItems: (id: number, fileIds: number[]) => Promise<number>
    removeItem: (id: number, fileId: number) => Promise<void>
    moveItem: (id: number, fileId: number, toIndex: number) => Promise<void>
    /** Saves a TMDB movie or show, whether or not it is in the library. */
    addTitle: (id: number, title: CollectionTitleInput) => Promise<void>
    removeTitle: (id: number, mediaType: 'movie' | 'tv', tmdbId: number) => Promise<void>
    titles: (id: number) => Promise<CollectionTitle[]>
    /** Ids of the collections that hold a file or title. */
    containing: (target: CollectionTarget) => Promise<number[]>
  }
  history: {
    /** Forgets all playback progress. */
    clearAll: () => Promise<void>
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
    /**
     * TMDB movies and shows matching a search, beyond the library. Empty when the option or
     * online lookups are off or no token is saved.
     */
    discover: (query: string) => Promise<TmdbSearchResult[]>
    /** A trending or top list; empty when browsing TMDB is off or not set up. */
    browse: (list: TmdbListId) => Promise<TmdbSearchResult[]>
    /** A YouTube trailer for a title, or null when TMDB lists none or lookups are off. */
    trailer: (mediaType: 'movie' | 'tv', tmdbId: number) => Promise<Trailer | null>
    details: (mediaType: MetadataMediaType, tmdbId: number) => Promise<MediaMetadata>
    /** Opens the title's page on themoviedb.org in the default browser. */
    openTmdbPage: (mediaType: MetadataMediaType, tmdbId: number) => Promise<void>
    onStatus: (listener: (status: MetadataStatus) => void) => () => void
  }
  /** Actors, directors, and other people the user follows, by TMDB person id. */
  people: {
    /** Followed people, newest first; `search` matches part of the name. Works offline. */
    list: (search?: string) => Promise<FollowedPerson[]>
    followedIds: () => Promise<number[]>
    /** Following again only refreshes the stored name and photo. */
    follow: (person: FollowPersonInput) => Promise<void>
    unfollow: (personId: number) => Promise<void>
    /** "Not interested" for a recommendation. */
    dismiss: (personId: number) => Promise<void>
    /** Shows dismissed recommendations again; returns how many were cleared. */
    clearDismissed: () => Promise<number>
    /** Profile and filmography from TMDB (cached for a week). */
    details: (personId: number) => Promise<PersonDetails>
    /** Fires when the followed list or dismissals change. */
    onChanged: (listener: () => void) => () => void
  }
  radar: {
    /**
     * Movies of followed people near today, with Egyptian (or labeled fallback) theatrical and
     * digital dates. Served from the last result when recent; `refresh` asks TMDB again.
     */
    get: (refresh?: boolean) => Promise<RadarResult>
  }
  /** Scene bookmarks of the video that is playing. */
  bookmarks: {
    list: () => Promise<Bookmark[]>
    /** Bookmarks the current position; null if nothing is playing. */
    add: () => Promise<Bookmark | null>
    edit: (id: number, edit: BookmarkEdit) => Promise<void>
    remove: (id: number) => Promise<void>
    /** Fires when bookmarks change outside a request (e.g. a thumbnail became ready). */
    onChanged: (listener: () => void) => () => void
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

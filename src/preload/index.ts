import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import { IpcChannel } from '@shared/contracts/channels'
import type { FrameApi } from '@shared/contracts/ipc'
import type { PlayerState } from '@shared/contracts/player'
import type { AppSettings } from '@shared/settings/schema'
import type { ScanProgress } from '@shared/contracts/library'
import type { MetadataStatus } from '@shared/contracts/metadata'
import type { ProviderStatus } from '@shared/contracts/subtitles'

const api: FrameApi = {
  app: {
    getInfo: () => ipcRenderer.invoke(IpcChannel.AppGetInfo),
    getStartupStatus: () => ipcRenderer.invoke(IpcChannel.AppGetStartupStatus),
    showSettings: () => ipcRenderer.invoke(IpcChannel.AppShowSettings),
    onNavigate: (listener) => subscribe<'settings'>(IpcChannel.AppNavigate, listener),
  },
  settings: {
    get: () => ipcRenderer.invoke(IpcChannel.SettingsGet),
    update: (patch) => ipcRenderer.invoke(IpcChannel.SettingsUpdate, patch),
    reset: () => ipcRenderer.invoke(IpcChannel.SettingsReset),
    onChanged: (listener) => subscribe<AppSettings>(IpcChannel.SettingsChanged, listener),
  },
  shortcuts: {
    exportFile: () => ipcRenderer.invoke(IpcChannel.ShortcutsExport),
    importFile: () => ipcRenderer.invoke(IpcChannel.ShortcutsImport),
  },
  themes: {
    exportFile: (themeId) => ipcRenderer.invoke(IpcChannel.ThemeExport, themeId),
    importFile: () => ipcRenderer.invoke(IpcChannel.ThemeImport),
  },
  credentials: {
    status: () => ipcRenderer.invoke(IpcChannel.CredentialsStatus),
    set: (id, secret) => ipcRenderer.invoke(IpcChannel.CredentialsSet, id, secret),
    delete: (id) => ipcRenderer.invoke(IpcChannel.CredentialsDelete, id),
  },
  player: {
    openFilesDialog: () => ipcRenderer.invoke(IpcChannel.PlayerOpenFilesDialog),
    openFolderDialog: () => ipcRenderer.invoke(IpcChannel.PlayerOpenFolderDialog),
    openDroppedFiles: (files) => {
      // Real paths of dropped files are only available here, not in page code.
      const paths = Array.from(files, (file) => webUtils.getPathForFile(file)).filter(Boolean)
      return paths.length > 0
        ? ipcRenderer.invoke(IpcChannel.PlayerOpenPaths, paths)
        : Promise.resolve({ queued: 0, error: 'Only files from your computer can be opened.' })
    },
    getState: () => ipcRenderer.invoke(IpcChannel.PlayerGetState),
    command: (command) => ipcRenderer.invoke(IpcChannel.PlayerCommand, command),
    screenshot: () => ipcRenderer.invoke(IpcChannel.PlayerScreenshot),
    previewAt: (seconds) => ipcRenderer.invoke(IpcChannel.PlayerPreview, seconds),
    onState: (listener) => subscribe<PlayerState>(IpcChannel.PlayerStateChanged, listener),
  },
  library: {
    listFolders: () => ipcRenderer.invoke(IpcChannel.LibraryListFolders),
    addFolderDialog: () => ipcRenderer.invoke(IpcChannel.LibraryAddFolderDialog),
    removeFolder: (id) => ipcRenderer.invoke(IpcChannel.LibraryRemoveFolder, id),
    updateFolder: (id, options) => ipcRenderer.invoke(IpcChannel.LibraryUpdateFolder, id, options),
    rescan: (id) =>
      id === undefined
        ? ipcRenderer.invoke(IpcChannel.LibraryRescan)
        : ipcRenderer.invoke(IpcChannel.LibraryRescan, id),
    onScanProgress: (listener) => subscribe<ScanProgress>(IpcChannel.LibraryScanProgress, listener),
    query: (query) => ipcRenderer.invoke(IpcChannel.LibraryQuery, query),
    listShows: (search) =>
      search === undefined
        ? ipcRenderer.invoke(IpcChannel.LibraryListShows)
        : ipcRenderer.invoke(IpcChannel.LibraryListShows, search),
    listResolutions: () => ipcRenderer.invoke(IpcChannel.LibraryListResolutions),
    play: (request) => ipcRenderer.invoke(IpcChannel.LibraryPlay, request),
    setFavorite: (fileId, favorite) =>
      ipcRenderer.invoke(IpcChannel.LibrarySetFavorite, fileId, favorite),
    showInFolder: (fileId) => ipcRenderer.invoke(IpcChannel.LibraryShowInFolder, fileId),
    onChanged: (listener) => subscribe<null>(IpcChannel.LibraryChanged, () => listener()),
  },
  storage: {
    info: () => ipcRenderer.invoke(IpcChannel.StorageInfo),
    clearCache: (kind) => ipcRenderer.invoke(IpcChannel.StorageClearCache, kind),
    backupNow: () => ipcRenderer.invoke(IpcChannel.StorageBackupNow),
    openDataFolder: () => ipcRenderer.invoke(IpcChannel.StorageOpenDataFolder),
  },
  collections: {
    list: () => ipcRenderer.invoke(IpcChannel.CollectionsList),
    create: (name, kind, fileIds) =>
      fileIds === undefined
        ? ipcRenderer.invoke(IpcChannel.CollectionsCreate, name, kind)
        : ipcRenderer.invoke(IpcChannel.CollectionsCreate, name, kind, fileIds),
    rename: (id, name) => ipcRenderer.invoke(IpcChannel.CollectionsRename, id, name),
    delete: (id) => ipcRenderer.invoke(IpcChannel.CollectionsDelete, id),
    move: (id, direction) => ipcRenderer.invoke(IpcChannel.CollectionsMove, id, direction),
    addItems: (id, fileIds) => ipcRenderer.invoke(IpcChannel.CollectionsAddItems, id, fileIds),
    removeItem: (id, fileId) => ipcRenderer.invoke(IpcChannel.CollectionsRemoveItem, id, fileId),
    moveItem: (id, fileId, toIndex) =>
      ipcRenderer.invoke(IpcChannel.CollectionsMoveItem, id, fileId, toIndex),
    addTitle: (id, title) => ipcRenderer.invoke(IpcChannel.CollectionsAddTitle, id, title),
    removeTitle: (id, mediaType, tmdbId) =>
      ipcRenderer.invoke(IpcChannel.CollectionsRemoveTitle, id, mediaType, tmdbId),
    titles: (id) => ipcRenderer.invoke(IpcChannel.CollectionsTitles, id),
    containing: (target) => ipcRenderer.invoke(IpcChannel.CollectionsContaining, target),
  },
  history: {
    clearAll: () => ipcRenderer.invoke(IpcChannel.HistoryClearAll),
    setWatched: (item, watched) => ipcRenderer.invoke(IpcChannel.HistorySetWatched, item, watched),
    remove: (item) => ipcRenderer.invoke(IpcChannel.HistoryRemove, item),
  },
  metadata: {
    status: () => ipcRenderer.invoke(IpcChannel.MetadataStatus),
    testToken: () => ipcRenderer.invoke(IpcChannel.MetadataTestToken),
    identifyNow: () => ipcRenderer.invoke(IpcChannel.MetadataIdentifyNow),
    search: (search) => ipcRenderer.invoke(IpcChannel.MetadataSearch, search),
    candidates: (target) => ipcRenderer.invoke(IpcChannel.MetadataCandidates, target),
    apply: (target, tmdbId, mediaType) =>
      ipcRenderer.invoke(IpcChannel.MetadataApply, target, tmdbId, mediaType),
    reject: (target) => ipcRenderer.invoke(IpcChannel.MetadataReject, target),
    reidentify: (target) => ipcRenderer.invoke(IpcChannel.MetadataReidentify, target),
    item: (target) => ipcRenderer.invoke(IpcChannel.MetadataItem, target),
    discover: (query) => ipcRenderer.invoke(IpcChannel.MetadataDiscover, query),
    browse: (list) => ipcRenderer.invoke(IpcChannel.MetadataBrowse, list),
    trailer: (mediaType, tmdbId) =>
      ipcRenderer.invoke(IpcChannel.MetadataTrailer, mediaType, tmdbId),
    details: (mediaType, tmdbId) =>
      ipcRenderer.invoke(IpcChannel.MetadataDetails, mediaType, tmdbId),
    openTmdbPage: (mediaType, tmdbId) =>
      ipcRenderer.invoke(IpcChannel.MetadataOpenTmdbPage, mediaType, tmdbId),
    onStatus: (listener) => subscribe<MetadataStatus>(IpcChannel.MetadataStatusChanged, listener),
  },
  people: {
    list: (search) =>
      search === undefined
        ? ipcRenderer.invoke(IpcChannel.PeopleList)
        : ipcRenderer.invoke(IpcChannel.PeopleList, search),
    followedIds: () => ipcRenderer.invoke(IpcChannel.PeopleFollowedIds),
    follow: (person) => ipcRenderer.invoke(IpcChannel.PeopleFollow, person),
    unfollow: (personId) => ipcRenderer.invoke(IpcChannel.PeopleUnfollow, personId),
    dismiss: (personId) => ipcRenderer.invoke(IpcChannel.PeopleDismiss, personId),
    clearDismissed: () => ipcRenderer.invoke(IpcChannel.PeopleClearDismissed),
    details: (personId) => ipcRenderer.invoke(IpcChannel.PeopleDetails, personId),
    onChanged: (listener) => subscribe<null>(IpcChannel.PeopleChanged, () => listener()),
  },
  radar: {
    get: (refresh) =>
      refresh === undefined
        ? ipcRenderer.invoke(IpcChannel.RadarGet)
        : ipcRenderer.invoke(IpcChannel.RadarGet, refresh),
  },
  bookmarks: {
    list: () => ipcRenderer.invoke(IpcChannel.BookmarksList),
    add: () => ipcRenderer.invoke(IpcChannel.BookmarksAdd),
    edit: (id, edit) => ipcRenderer.invoke(IpcChannel.BookmarksEdit, id, edit),
    remove: (id) => ipcRenderer.invoke(IpcChannel.BookmarksRemove, id),
    onChanged: (listener) => subscribe<null>(IpcChannel.BookmarksChanged, () => listener()),
  },
  subtitles: {
    providers: () => ipcRenderer.invoke(IpcChannel.SubtitleProviders),
    validateProvider: (id) => ipcRenderer.invoke(IpcChannel.SubtitleValidateProvider, id),
    search: (search) => ipcRenderer.invoke(IpcChannel.SubtitleSearch, search),
    download: (download) => ipcRenderer.invoke(IpcChannel.SubtitleDownload, download),
    cancelDownload: () => ipcRenderer.invoke(IpcChannel.SubtitleCancelDownload),
    loadFile: () => ipcRenderer.invoke(IpcChannel.SubtitleLoadFile),
    chooseFolder: () => ipcRenderer.invoke(IpcChannel.SubtitleChooseFolder),
    onProviders: (listener) =>
      subscribe<ProviderStatus[]>(IpcChannel.SubtitleProvidersChanged, listener),
  },
}

/** Subscribes to a main → renderer push without exposing the IpcRendererEvent to page code. */
function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const wrapped = (_event: IpcRendererEvent, payload: T) => listener(payload)
  ipcRenderer.on(channel, wrapped)
  return () => {
    ipcRenderer.removeListener(channel, wrapped)
  }
}

contextBridge.exposeInMainWorld('frame', api)

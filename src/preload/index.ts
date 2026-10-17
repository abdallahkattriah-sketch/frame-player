import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import { IpcChannel } from '@shared/contracts/channels'
import type { FrameApi } from '@shared/contracts/ipc'
import type { PlayerState } from '@shared/contracts/player'
import type { ScanProgress } from '@shared/contracts/library'
import type { MetadataStatus } from '@shared/contracts/metadata'
import type { ProviderStatus } from '@shared/contracts/subtitles'

const api: FrameApi = {
  app: {
    getInfo: () => ipcRenderer.invoke(IpcChannel.AppGetInfo),
    getStartupStatus: () => ipcRenderer.invoke(IpcChannel.AppGetStartupStatus),
  },
  settings: {
    get: () => ipcRenderer.invoke(IpcChannel.SettingsGet),
    update: (patch) => ipcRenderer.invoke(IpcChannel.SettingsUpdate, patch),
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
  history: {
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
    onStatus: (listener) => subscribe<MetadataStatus>(IpcChannel.MetadataStatusChanged, listener),
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

import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import { IpcChannel } from '@shared/contracts/channels'
import type { FrameApi } from '@shared/contracts/ipc'
import type { PlayerState } from '@shared/contracts/player'
import type { ScanProgress } from '@shared/contracts/library'

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

import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import { IpcChannel } from '@shared/contracts/channels'
import type { FrameApi } from '@shared/contracts/ipc'
import type { PlayerState } from '@shared/contracts/player'

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
    onState: (listener) => {
      // Never hand the IpcRendererEvent (and its sender) to page code.
      const wrapped = (_event: IpcRendererEvent, state: PlayerState) => listener(state)
      ipcRenderer.on(IpcChannel.PlayerStateChanged, wrapped)
      return () => {
        ipcRenderer.removeListener(IpcChannel.PlayerStateChanged, wrapped)
      }
    },
  },
}

contextBridge.exposeInMainWorld('frame', api)

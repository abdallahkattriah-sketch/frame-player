import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
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
    openFileDialog: () => ipcRenderer.invoke(IpcChannel.PlayerOpenFileDialog),
    getState: () => ipcRenderer.invoke(IpcChannel.PlayerGetState),
    command: (command) => ipcRenderer.invoke(IpcChannel.PlayerCommand, command),
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

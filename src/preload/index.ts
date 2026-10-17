import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannel } from '@shared/contracts/channels'
import type { FrameApi } from '@shared/contracts/ipc'

const api: FrameApi = {
  app: {
    getInfo: () => ipcRenderer.invoke(IpcChannel.AppGetInfo),
  },
}

contextBridge.exposeInMainWorld('frame', api)

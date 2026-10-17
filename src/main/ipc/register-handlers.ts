import { app, ipcMain } from 'electron'
import { IpcChannel, appInfoSchema, type AppInfo } from '@shared/contracts/ipc'

export function getAppInfo(): AppInfo {
  return appInfoSchema.parse({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
    electronVersion: process.versions.electron,
  })
}

export function registerIpcHandlers(): void {
  ipcMain.handle(IpcChannel.AppGetInfo, () => getAppInfo())
}

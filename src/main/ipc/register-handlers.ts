import { app, BrowserWindow, dialog } from 'electron'
import { z } from 'zod'
import { IpcChannel, appInfoSchema, type AppInfo, type StartupStatus } from '@shared/contracts/ipc'
import { credentialIdSchema, credentialSecretSchema } from '@shared/contracts/credentials'
import { playerCommandSchema } from '@shared/contracts/player'
import { defaultVideoExtensions } from '@shared/constants/media'
import { settingsPatchSchema } from '@shared/settings/schema'
import type { SettingsService } from '../application/settings-service'
import type { PlayerController } from '../application/player-controller'
import type { CredentialStore } from '../security/credential-store'
import { handle } from './handle'

export interface IpcDependencies {
  settings: SettingsService
  credentials: CredentialStore
  startupStatus: StartupStatus
  player: PlayerController
}

async function pickAndPlay(player: PlayerController): Promise<void> {
  const parent = BrowserWindow.getFocusedWindow()
  const options: Electron.OpenDialogOptions = {
    title: 'Open video',
    properties: ['openFile'],
    filters: [
      { name: 'Videos', extensions: [...defaultVideoExtensions] },
      { name: 'All files', extensions: ['*'] },
    ],
  }
  const result = parent
    ? await dialog.showOpenDialog(parent, options)
    : await dialog.showOpenDialog(options)
  const path = result.filePaths[0]
  if (!result.canceled && path) await player.open(path)
}

export function getAppInfo(): AppInfo {
  return appInfoSchema.parse({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
    electronVersion: process.versions.electron,
  })
}

const noArgs = z.tuple([])

export function registerIpcHandlers(deps: IpcDependencies): void {
  handle(IpcChannel.AppGetInfo, noArgs, () => getAppInfo())
  handle(IpcChannel.AppGetStartupStatus, noArgs, () => deps.startupStatus)

  handle(IpcChannel.SettingsGet, noArgs, () => deps.settings.get())
  handle(IpcChannel.SettingsUpdate, z.tuple([settingsPatchSchema]), ([patch]) =>
    deps.settings.update(patch),
  )

  handle(IpcChannel.CredentialsStatus, noArgs, () => deps.credentials.status())
  handle(
    IpcChannel.CredentialsSet,
    z.tuple([credentialIdSchema, credentialSecretSchema]),
    ([id, secret]) => {
      deps.credentials.set(id, secret)
      return deps.credentials.status()
    },
  )
  handle(IpcChannel.CredentialsDelete, z.tuple([credentialIdSchema]), ([id]) => {
    deps.credentials.delete(id)
    return deps.credentials.status()
  })

  handle(IpcChannel.PlayerOpenFileDialog, noArgs, () => pickAndPlay(deps.player))
  handle(IpcChannel.PlayerGetState, noArgs, () => deps.player.getState())
  handle(IpcChannel.PlayerCommand, z.tuple([playerCommandSchema]), ([command]) =>
    deps.player.command(command),
  )
}

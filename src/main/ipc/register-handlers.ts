import { app, BrowserWindow, dialog } from 'electron'
import { z } from 'zod'
import { IpcChannel, appInfoSchema, type AppInfo, type StartupStatus } from '@shared/contracts/ipc'
import { credentialIdSchema, credentialSecretSchema } from '@shared/contracts/credentials'
import { playerCommandSchema, type OpenMediaResult } from '@shared/contracts/player'
import { defaultVideoExtensions } from '@shared/constants/media'
import { settingsPatchSchema } from '@shared/settings/schema'
import type { SettingsService } from '../application/settings-service'
import type { PlayerController } from '../application/player-controller'
import type { CredentialStore } from '../security/credential-store'
import type { LibraryService } from '../library/library-service'
import { folderOptionsSchema } from '@shared/contracts/library'
import { handle } from './handle'

export interface IpcDependencies {
  settings: SettingsService
  credentials: CredentialStore
  startupStatus: StartupStatus
  player: PlayerController
  library: LibraryService
}

const folderId = z.number().int().positive()

async function pickAndPlay(
  player: PlayerController,
  kind: 'files' | 'folder',
): Promise<OpenMediaResult> {
  const parent = BrowserWindow.getFocusedWindow()
  const options: Electron.OpenDialogOptions =
    kind === 'files'
      ? {
          title: 'Open videos',
          properties: ['openFile', 'multiSelections'],
          filters: [
            { name: 'Videos', extensions: [...defaultVideoExtensions] },
            { name: 'All files', extensions: ['*'] },
          ],
        }
      : { title: 'Open folder', properties: ['openDirectory'] }
  const result = parent
    ? await dialog.showOpenDialog(parent, options)
    : await dialog.showOpenDialog(options)
  if (result.canceled || result.filePaths.length === 0) return { queued: 0 }
  return player.openPaths(result.filePaths)
}

/** Windows paths are at most 32,767 characters; a drop of more than 1,000 items is refused. */
const droppedPathsSchema = z.array(z.string().min(1).max(32_767)).min(1).max(1000)

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

  handle(IpcChannel.PlayerOpenFilesDialog, noArgs, () => pickAndPlay(deps.player, 'files'))
  handle(IpcChannel.PlayerOpenFolderDialog, noArgs, () => pickAndPlay(deps.player, 'folder'))
  // Dropped paths come from the renderer: openPaths only ever plays existing video files.
  handle(IpcChannel.PlayerOpenPaths, z.tuple([droppedPathsSchema]), ([paths]) =>
    deps.player.openPaths(paths),
  )
  handle(IpcChannel.PlayerGetState, noArgs, () => deps.player.getState())
  handle(IpcChannel.PlayerCommand, z.tuple([playerCommandSchema]), ([command]) =>
    deps.player.command(command),
  )
  handle(IpcChannel.PlayerScreenshot, noArgs, () => deps.player.screenshot())

  handle(IpcChannel.LibraryListFolders, noArgs, () => deps.library.listFolders())
  handle(IpcChannel.LibraryAddFolderDialog, noArgs, async () => {
    const parent = BrowserWindow.getFocusedWindow()
    const options: Electron.OpenDialogOptions = {
      title: 'Add library folder',
      properties: ['openDirectory'],
    }
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options)
    const path = result.filePaths[0]
    return result.canceled || !path ? null : deps.library.addFolder(path)
  })
  handle(IpcChannel.LibraryRemoveFolder, z.tuple([folderId]), ([id]) =>
    deps.library.removeFolder(id),
  )
  handle(
    IpcChannel.LibraryUpdateFolder,
    z.tuple([folderId, folderOptionsSchema]),
    ([id, opts]) => deps.library.updateFolder(id, opts) ?? null,
  )
  handle(IpcChannel.LibraryRescan, z.union([z.tuple([]), z.tuple([folderId])]), async (args) => {
    // Scans run in the background; progress arrives through LibraryScanProgress.
    if (args.length === 0) void deps.library.scanAll()
    else void deps.library.scan(args[0])
  })
}

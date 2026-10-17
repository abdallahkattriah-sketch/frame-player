import { app, BrowserWindow, dialog, shell } from 'electron'
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
import {
  folderOptionsSchema,
  itemRefSchema,
  libraryQuerySchema,
  playRequestSchema,
  type ItemRef,
} from '@shared/contracts/library'
import type { LibraryQueryRepository } from '../database/repositories/library-query-repository'
import type { HistoryRepository } from '../database/repositories/history-repository'
import type { MetadataService } from '../metadata/metadata-service'
import { matchTargetSchema, metadataSearchSchema } from '@shared/contracts/metadata'
import {
  subtitleDownloadSchema,
  subtitleProviderIds,
  subtitleSearchSchema,
} from '@shared/contracts/subtitles'
import type { SubtitleService } from '../subtitles/subtitle-service'
import { SUBTITLE_EXTENSIONS } from '../subtitles/subtitle-content'
import { parseSubtitleName } from '../subtitles/local-discovery'
import { basename, dirname, extname } from 'node:path'
import { handle } from './handle'
import type { BookmarkService } from '../application/bookmark-service'
import type { ThumbnailService } from '../media-engine/thumbnail-service'
import { bookmarkEditSchema, bookmarkIdSchema } from '@shared/contracts/bookmarks'

export interface IpcDependencies {
  settings: SettingsService
  credentials: CredentialStore
  startupStatus: StartupStatus
  player: PlayerController
  library: LibraryService
  libraryQuery: LibraryQueryRepository
  historyRepository: HistoryRepository
  metadata: MetadataService
  subtitles: SubtitleService
  thumbnails: ThumbnailService
  bookmarks: BookmarkService
  onLibraryChanged: () => void
}

const folderId = z.number().int().positive()
const fileId = z.number().int().positive()
const searchText = z.string().trim().max(200)

/** Resolves a renderer reference to a known path: a library file or an existing history entry. */
function resolveItem(
  deps: IpcDependencies,
  ref: ItemRef,
): { path: string; pathKey: string } | undefined {
  if ('fileId' in ref) return deps.libraryQuery.getFile(ref.fileId)
  const path = deps.libraryQuery.getHistoryPath(ref.historyKey)
  return path ? { path, pathKey: ref.historyKey } : undefined
}

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
  handle(IpcChannel.SettingsUpdate, z.tuple([settingsPatchSchema]), ([patch]) => {
    const updated = deps.settings.update(patch)
    // Subtitle style edits show on the playing video right away.
    if (patch.subtitleStyle) void deps.player.applySubtitleStyle()
    return updated
  })

  handle(IpcChannel.CredentialsStatus, noArgs, () => deps.credentials.status())
  handle(
    IpcChannel.CredentialsSet,
    z.tuple([credentialIdSchema, credentialSecretSchema]),
    ([id, secret]) => {
      deps.credentials.set(id, secret)
      // A new TMDB token: identify whatever is still unidentified.
      if (id === 'tmdb.accessToken') void deps.metadata.identifyPending()
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
  // Always the video that is playing; the renderer only chooses the position.
  handle(IpcChannel.PlayerPreview, z.tuple([z.number().finite().min(0)]), async ([seconds]) => {
    const { path, duration } = deps.player.getState()
    if (!path || !duration || !deps.settings.get().playback.timelinePreviews) return null
    const name = await deps.thumbnails.preview(path, duration, seconds)
    return name ? `frame-art://thumb/${name}` : null
  })

  handle(IpcChannel.BookmarksList, noArgs, () => {
    const path = deps.player.getState().path
    return path ? deps.bookmarks.list(path) : []
  })
  handle(IpcChannel.BookmarksAdd, noArgs, async () => {
    const { path, position } = deps.player.getState()
    return path ? deps.bookmarks.add(path, position ?? 0) : null
  })
  handle(
    IpcChannel.BookmarksEdit,
    z.tuple([bookmarkIdSchema, bookmarkEditSchema]),
    ([id, edit]) => {
      deps.bookmarks.edit(id, edit)
    },
  )
  handle(IpcChannel.BookmarksRemove, z.tuple([bookmarkIdSchema]), ([id]) => {
    deps.bookmarks.remove(id)
  })

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

  handle(IpcChannel.LibraryQuery, z.tuple([libraryQuerySchema]), ([query]) =>
    deps.libraryQuery.query(query),
  )
  handle(IpcChannel.LibraryListShows, z.union([z.tuple([]), z.tuple([searchText])]), (args) =>
    deps.libraryQuery.listShows(args[0] || undefined),
  )
  handle(IpcChannel.LibraryListResolutions, noArgs, () => deps.libraryQuery.listResolutions())
  handle(IpcChannel.LibraryPlay, z.tuple([playRequestSchema]), async ([request]) => {
    // Paths come from the database, never from the renderer.
    const paths = request.items
      .map((ref) => resolveItem(deps, ref)?.path)
      .filter((p): p is string => p !== undefined)
    const start = Math.min(request.startIndex ?? 0, Math.max(0, paths.length - 1))
    return deps.player.openPaths([...paths.slice(start), ...paths.slice(0, start)])
  })
  handle(IpcChannel.LibrarySetFavorite, z.tuple([fileId, z.boolean()]), ([id, favorite]) => {
    if (deps.libraryQuery.setFavorite(id, favorite)) deps.onLibraryChanged()
  })
  handle(IpcChannel.LibraryShowInFolder, z.tuple([fileId]), ([id]) => {
    const file = deps.libraryQuery.getFile(id)
    if (file) shell.showItemInFolder(file.path)
  })
  handle(IpcChannel.HistorySetWatched, z.tuple([itemRefSchema, z.boolean()]), ([ref, watched]) => {
    const item = resolveItem(deps, ref)
    if (!item) return
    deps.historyRepository.setWatched(item.pathKey, item.path, watched, new Date().toISOString())
    deps.onLibraryChanged()
  })
  handle(IpcChannel.MetadataStatus, noArgs, () => deps.metadata.status())
  handle(IpcChannel.MetadataTestToken, noArgs, () => deps.metadata.testToken())
  handle(IpcChannel.MetadataIdentifyNow, noArgs, () => {
    void deps.metadata.identifyPending()
  })
  handle(IpcChannel.MetadataSearch, z.tuple([metadataSearchSchema]), ([search]) =>
    deps.metadata.search(search),
  )
  handle(IpcChannel.MetadataCandidates, z.tuple([matchTargetSchema]), ([target]) =>
    deps.metadata.candidatesFor(target),
  )
  handle(
    IpcChannel.MetadataApply,
    z.tuple([matchTargetSchema, z.number().int().positive(), z.enum(['movie', 'tv'])]),
    ([target, tmdbId, mediaType]) => deps.metadata.applyMatch(target, tmdbId, mediaType),
  )
  handle(IpcChannel.MetadataReject, z.tuple([matchTargetSchema]), ([target]) =>
    deps.metadata.reject(target),
  )
  handle(IpcChannel.MetadataReidentify, z.tuple([matchTargetSchema]), ([target]) =>
    deps.metadata.reidentify(target),
  )
  handle(IpcChannel.MetadataItem, z.tuple([matchTargetSchema]), ([target]) =>
    deps.metadata.itemMetadata(target),
  )

  handle(IpcChannel.SubtitleProviders, noArgs, () => deps.subtitles.statuses())
  handle(IpcChannel.SubtitleValidateProvider, z.tuple([z.enum(subtitleProviderIds)]), ([id]) =>
    deps.subtitles.validate(id),
  )
  handle(IpcChannel.SubtitleSearch, z.tuple([subtitleSearchSchema]), ([search]) =>
    deps.subtitles.searchSubtitles(search),
  )
  handle(IpcChannel.SubtitleDownload, z.tuple([subtitleDownloadSchema]), ([download]) =>
    deps.subtitles.downloadSubtitle(download),
  )
  handle(IpcChannel.SubtitleCancelDownload, noArgs, () => deps.subtitles.cancelDownload())
  handle(IpcChannel.SubtitleLoadFile, noArgs, async () => {
    const video = deps.player.getState().path
    if (!video) return { loaded: false, error: 'Nothing is playing.' }
    const parent = BrowserWindow.getFocusedWindow()
    const options: Electron.OpenDialogOptions = {
      title: 'Load subtitle file',
      defaultPath: dirname(video),
      properties: ['openFile'],
      filters: [{ name: 'Subtitles', extensions: [...SUBTITLE_EXTENSIONS] }],
    }
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options)
    const path = result.filePaths[0]
    if (result.canceled || !path) return { loaded: false }
    const language =
      parseSubtitleName(basename(video, extname(video)), basename(path))?.language ?? null
    return { loaded: await deps.player.addSubtitle(video, path, language) }
  })
  handle(IpcChannel.SubtitleChooseFolder, noArgs, async () => {
    const parent = BrowserWindow.getFocusedWindow()
    const options: Electron.OpenDialogOptions = {
      title: 'Folder for downloaded subtitles',
      properties: ['openDirectory', 'createDirectory'],
    }
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options)
    const folder = result.filePaths[0]
    if (result.canceled || !folder) return null
    deps.settings.update({ subtitles: { folder, saveLocation: 'folder' } })
    return folder
  })

  handle(IpcChannel.HistoryRemove, z.tuple([itemRefSchema]), ([ref]) => {
    const item = resolveItem(deps, ref)
    if (!item) return
    deps.historyRepository.delete(item.pathKey)
    deps.onLibraryChanged()
  })
}

import { app, BrowserWindow, dialog, shell } from 'electron'
import { z } from 'zod'
import { IpcChannel, appInfoSchema, type AppInfo, type StartupStatus } from '@shared/contracts/ipc'
import { credentialIdSchema, credentialSecretSchema } from '@shared/contracts/credentials'
import {
  playerAreaSchema,
  playerCommandSchema,
  type OpenMediaResult,
} from '@shared/contracts/player'
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
import {
  matchTargetSchema,
  metadataSearchSchema,
  tmdbRefSchema,
  tmdbListIds,
  tmdbSearchQuerySchema,
} from '@shared/contracts/metadata'
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
import { builtInThemes } from '@shared/settings/theme'
import {
  parseShortcutFile,
  parseThemeFile,
  readSmallTextFile,
  shortcutsToFile,
  themeToFile,
  writeTextFile,
} from '../application/settings-files'
import type { AppSettings } from '@shared/settings/schema'
import type { CollectionRepository } from '../database/repositories/collection-repository'
import type { StorageService } from '../application/storage-service'
import {
  collectionFileIdsSchema,
  collectionIdSchema,
  collectionKinds,
  collectionNameSchema,
  collectionTargetSchema,
  collectionTitleInputSchema,
} from '@shared/contracts/collections'
import type { BookmarkService } from '../application/bookmark-service'
import type { ThumbnailService } from '../media-engine/thumbnail-service'
import { bookmarkEditSchema, bookmarkIdSchema } from '@shared/contracts/bookmarks'
import type { PeopleRepository } from '../database/repositories/people-repository'
import type { RadarService } from '../metadata/radar-service'
import { radarNotificationRefSchema, radarRefreshSchema } from '@shared/contracts/radar'
import type { RadarRepository } from '../database/repositories/radar-repository'
import type { PeopleRecommendations } from '@shared/contracts/people'
import {
  followPersonInputSchema,
  peopleSearchSchema,
  personIdSchema,
} from '@shared/contracts/people'

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
  collections: CollectionRepository
  people: PeopleRepository
  radar: RadarService
  radarNotifications: RadarRepository
  peopleSuggestions: { get: () => Promise<PeopleRecommendations> }
  storage: StorageService
  /** Main data folder (opened from Settings > Storage). */
  openPath: (path: string) => Promise<string>
  /** Opens an https URL in the default browser. */
  openExternal: (url: string) => Promise<void>
  onLibraryChanged: () => void
  onPeopleChanged: () => void
  onRadarNotificationsChanged: () => void
  onSettingsChanged: (settings: AppSettings) => void
  showMainView: (view: 'settings') => void
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

const jsonFilters = (name: string) => [{ name, extensions: ['json'] }]

async function pickFileToOpen(title: string, filterName: string): Promise<string | null> {
  const parent = BrowserWindow.getFocusedWindow()
  const options: Electron.OpenDialogOptions = {
    title,
    properties: ['openFile'],
    filters: jsonFilters(filterName),
  }
  const result = parent
    ? await dialog.showOpenDialog(parent, options)
    : await dialog.showOpenDialog(options)
  return result.canceled ? null : (result.filePaths[0] ?? null)
}

async function pickFileToSave(
  title: string,
  defaultName: string,
  filterName: string,
): Promise<string | null> {
  const parent = BrowserWindow.getFocusedWindow()
  const options: Electron.SaveDialogOptions = {
    title,
    defaultPath: defaultName,
    filters: jsonFilters(filterName),
  }
  const result = parent
    ? await dialog.showSaveDialog(parent, options)
    : await dialog.showSaveDialog(options)
  return result.canceled ? null : (result.filePath ?? null)
}

/** File names from theme names: letters, digits, spaces and dashes only. */
const safeFileName = (name: string) => name.replace(/[^\p{L}\p{N} -]+/gu, '').trim() || 'theme'

export function registerIpcHandlers(deps: IpcDependencies): void {
  handle(IpcChannel.AppGetInfo, noArgs, () => getAppInfo())
  handle(IpcChannel.AppGetStartupStatus, noArgs, () => deps.startupStatus)
  handle(IpcChannel.AppShowSettings, noArgs, () => deps.showMainView('settings'))

  handle(IpcChannel.SettingsGet, noArgs, () => deps.settings.get())
  handle(IpcChannel.SettingsUpdate, z.tuple([settingsPatchSchema]), ([patch]) => {
    const updated = deps.settings.update(patch)
    deps.onSettingsChanged(updated)
    // Subtitle style edits show on the playing video right away.
    if (patch.subtitleStyle || patch.audio) void deps.player.applyLiveSettings()
    return updated
  })

  handle(IpcChannel.SettingsReset, noArgs, () => {
    const settings = deps.settings.reset()
    deps.onSettingsChanged(settings)
    void deps.player.applyLiveSettings()
    return settings
  })

  handle(IpcChannel.StorageInfo, noArgs, () => deps.storage.info())
  handle(IpcChannel.StorageClearCache, z.tuple([z.enum(['artwork', 'thumbnails'])]), ([kind]) =>
    deps.storage.clearCache(kind),
  )
  handle(IpcChannel.StorageBackupNow, noArgs, () => deps.storage.backupNow())
  handle(IpcChannel.StorageOpenDataFolder, noArgs, async () => {
    // A fixed folder Frame owns; nothing from the renderer is opened.
    await deps.openPath(deps.storage.dataDir)
  })
  handle(IpcChannel.HistoryClearAll, noArgs, () => {
    deps.historyRepository.deleteAll()
    deps.onLibraryChanged()
  })

  const collectionChanged = <T>(result: T): T => {
    deps.onLibraryChanged()
    return result
  }
  handle(IpcChannel.CollectionsList, noArgs, () => deps.collections.list())
  handle(
    IpcChannel.CollectionsCreate,
    z.union([
      z.tuple([collectionNameSchema, z.enum(collectionKinds)]),
      z.tuple([collectionNameSchema, z.enum(collectionKinds), collectionFileIdsSchema]),
    ]),
    ([name, kind, fileIds]) => {
      const created = deps.collections.create(name, kind)
      const added = fileIds ? deps.collections.addFiles(created.id, fileIds) : 0
      return collectionChanged({ ...created, itemCount: added })
    },
  )
  handle(
    IpcChannel.CollectionsRename,
    z.tuple([collectionIdSchema, collectionNameSchema]),
    ([id, name]) => {
      collectionChanged(deps.collections.rename(id, name))
    },
  )
  handle(IpcChannel.CollectionsDelete, z.tuple([collectionIdSchema]), ([id]) => {
    collectionChanged(deps.collections.delete(id))
  })
  handle(
    IpcChannel.CollectionsMove,
    z.tuple([collectionIdSchema, z.enum(['up', 'down'])]),
    ([id, direction]) => {
      collectionChanged(deps.collections.move(id, direction))
    },
  )
  handle(
    IpcChannel.CollectionsAddItems,
    z.tuple([collectionIdSchema, collectionFileIdsSchema]),
    ([id, fileIds]) => collectionChanged(deps.collections.addFiles(id, fileIds)),
  )
  handle(
    IpcChannel.CollectionsRemoveItem,
    z.tuple([collectionIdSchema, z.number().int().positive()]),
    ([id, fileId]) => {
      collectionChanged(deps.collections.removeFile(id, fileId))
    },
  )
  handle(
    IpcChannel.CollectionsMoveItem,
    z.tuple([collectionIdSchema, z.number().int().positive(), z.number().int().min(0)]),
    ([id, fileId, toIndex]) => {
      collectionChanged(deps.collections.moveFile(id, fileId, toIndex))
    },
  )
  handle(
    IpcChannel.CollectionsAddTitle,
    z.tuple([collectionIdSchema, collectionTitleInputSchema]),
    ([id, title]) => {
      if (!deps.collections.addTitle(id, title))
        throw new Error('That collection no longer exists.')
      collectionChanged(true)
    },
  )
  handle(
    IpcChannel.CollectionsRemoveTitle,
    z.tuple([collectionIdSchema, z.enum(['movie', 'tv']), z.number().int().positive()]),
    ([id, mediaType, tmdbId]) => {
      collectionChanged(deps.collections.removeTitle(id, mediaType, tmdbId))
    },
  )
  handle(IpcChannel.CollectionsTitles, z.tuple([collectionIdSchema]), ([id]) =>
    deps.collections.titles(id),
  )
  handle(IpcChannel.CollectionsContaining, z.tuple([collectionTargetSchema]), ([target]) =>
    deps.collections.containing(target),
  )

  handle(IpcChannel.ShortcutsExport, noArgs, async () => {
    const path = await pickFileToSave('Export shortcuts', 'frame-shortcuts.json', 'Frame shortcuts')
    if (!path) return false
    await writeTextFile(path, shortcutsToFile(deps.settings.get().shortcuts.bindings))
    return true
  })
  handle(IpcChannel.ShortcutsImport, noArgs, async () => {
    const path = await pickFileToOpen('Import shortcuts', 'Frame shortcuts')
    if (!path) return { imported: false }
    const text = await readSmallTextFile(path)
    if (!text.ok) return { imported: false, error: text.error }
    const parsed = parseShortcutFile(text.value)
    if (!parsed.ok) return { imported: false, error: parsed.error }
    deps.onSettingsChanged(deps.settings.update({ shortcuts: { bindings: parsed.value } }))
    return { imported: true }
  })
  handle(IpcChannel.ThemeExport, z.tuple([z.string().max(64)]), async ([themeId]) => {
    const { customThemes } = deps.settings.get().appearance
    const theme = [...builtInThemes, ...customThemes].find((t) => t.id === themeId)
    if (!theme) return false
    const path = await pickFileToSave(
      'Export theme',
      `${safeFileName(theme.name)}.frame-theme.json`,
      'Frame theme',
    )
    if (!path) return false
    await writeTextFile(path, themeToFile(theme))
    return true
  })
  handle(IpcChannel.ThemeImport, noArgs, async () => {
    const path = await pickFileToOpen('Import theme', 'Frame theme')
    if (!path) return {}
    const text = await readSmallTextFile(path)
    if (!text.ok) return { error: text.error }
    const parsed = parseThemeFile(text.value)
    if (!parsed.ok) return { error: parsed.error }
    const { customThemes } = deps.settings.get().appearance
    if (customThemes.length >= 30) return { error: 'Delete a custom theme first (30 at most).' }
    const theme = {
      id: `custom-${Date.now().toString(36)}`,
      name: parsed.value.name,
      colors: parsed.value.colors,
    }
    deps.onSettingsChanged(
      deps.settings.update({
        appearance: { customThemes: [...customThemes, theme], themeId: theme.id },
      }),
    )
    return { theme }
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
  handle(IpcChannel.PlayerSetArea, z.tuple([playerAreaSchema]), ([area]) =>
    deps.player.setArea(area),
  )
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
  handle(IpcChannel.MetadataDiscover, z.tuple([tmdbSearchQuerySchema]), async ([query]) => {
    const { metadata, privacy } = deps.settings.get()
    if (
      !metadata.searchTmdb ||
      !privacy.onlineMetadataEnabled ||
      !deps.metadata.status().tokenConfigured
    )
      return []
    return deps.metadata.discover(query)
  })
  handle(IpcChannel.MetadataBrowse, z.tuple([z.enum(tmdbListIds)]), async ([list]) => {
    const { metadata, privacy } = deps.settings.get()
    if (
      !metadata.browseTmdb ||
      !privacy.onlineMetadataEnabled ||
      !deps.metadata.status().tokenConfigured
    )
      return []
    return deps.metadata.browse(list)
  })
  handle(IpcChannel.MetadataTrailer, tmdbRefSchema, async ([mediaType, tmdbId]) => {
    if (!deps.settings.get().privacy.onlineMetadataEnabled) return null
    if (!deps.metadata.status().tokenConfigured) return null
    return deps.metadata.trailer(mediaType, tmdbId)
  })
  handle(IpcChannel.MetadataDetails, tmdbRefSchema, ([mediaType, tmdbId]) =>
    deps.metadata.details(mediaType, tmdbId),
  )
  // The URL is built here from a validated type and number; nothing else can be opened.
  const peopleChanged = () => deps.onPeopleChanged()
  handle(IpcChannel.PeopleList, z.union([noArgs, z.tuple([peopleSearchSchema])]), ([search]) =>
    deps.people.list(search),
  )
  handle(IpcChannel.PeopleFollowedIds, noArgs, () => [...deps.people.followedIds()])
  handle(IpcChannel.PeopleFollow, z.tuple([followPersonInputSchema]), ([person]) => {
    deps.people.follow(person)
    peopleChanged()
  })
  handle(IpcChannel.PeopleUnfollow, z.tuple([personIdSchema]), ([id]) => {
    if (deps.people.unfollow(id)) peopleChanged()
  })
  handle(IpcChannel.PeopleDismiss, z.tuple([personIdSchema]), ([id]) => {
    deps.people.dismiss(id)
    peopleChanged()
  })
  handle(IpcChannel.PeopleClearDismissed, noArgs, () => {
    const cleared = deps.people.clearDismissed()
    peopleChanged()
    return cleared
  })
  handle(IpcChannel.PeopleDetails, z.tuple([personIdSchema]), ([id]) =>
    deps.metadata.personDetails(id),
  )
  handle(IpcChannel.RadarGet, z.union([noArgs, z.tuple([radarRefreshSchema])]), ([refresh]) =>
    deps.radar.get(refresh ?? false),
  )
  handle(IpcChannel.PeopleRecommendations, noArgs, () => deps.peopleSuggestions.get())
  handle(IpcChannel.RadarNotifications, noArgs, () => ({
    items: deps.radarNotifications.list(),
    unread: deps.radarNotifications.unreadCount(),
  }))
  handle(IpcChannel.RadarMarkRead, radarNotificationRefSchema, ([movieId, kind]) => {
    if (deps.radarNotifications.markRead(movieId, kind)) deps.onRadarNotificationsChanged()
  })
  handle(IpcChannel.RadarMarkAllRead, noArgs, () => {
    if (deps.radarNotifications.markAllRead() > 0) deps.onRadarNotificationsChanged()
  })
  handle(IpcChannel.RadarDismiss, radarNotificationRefSchema, ([movieId, kind]) => {
    if (deps.radarNotifications.dismiss(movieId, kind)) deps.onRadarNotificationsChanged()
  })
  handle(IpcChannel.MetadataOpenTmdbPage, tmdbRefSchema, ([mediaType, tmdbId]) =>
    deps.openExternal(`https://www.themoviedb.org/${mediaType}/${tmdbId}`),
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
    deps.onSettingsChanged(deps.settings.update({ subtitles: { folder, saveLocation: 'folder' } }))
    return folder
  })

  handle(IpcChannel.HistoryRemove, z.tuple([itemRefSchema]), ([ref]) => {
    const item = resolveItem(deps, ref)
    if (!item) return
    deps.historyRepository.delete(item.pathKey)
    deps.onLibraryChanged()
  })
}

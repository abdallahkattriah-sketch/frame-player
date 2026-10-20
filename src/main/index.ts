import { app, BrowserWindow, dialog, session, shell } from 'electron'
import { join } from 'node:path'
import {
  hardenSession,
  identifyToYouTube,
  hardenWebContents,
  isAllowedAppUrl,
  secureWebPreferences,
} from './security/web-security'
import { registerIpcHandlers } from './ipc/register-handlers'
import { setIpcSenderPolicy } from './ipc/handle'
import { configureUserDataDir, devOverrides, resolveAppPaths } from './application/app-paths'
import { handleArtworkProtocol, registerArtworkScheme } from './metadata/artwork-protocol'
import { chooseLocalSubtitle, discoverLocalSubtitles } from './subtitles/local-discovery'
import { bootstrapServices, type AppServices } from './application/bootstrap'
import { PlayerController } from './application/player-controller'
import { resolveMpvPath } from './media-engine/mpv-locator'
import { raiseVideoWindow } from './media-engine/video-window-order'
import { extractMediaPaths } from './filesystem/launch-args'
import { subtitleStyleProperties } from './media-engine/subtitle-style-properties'
import { LOUDNESS_FILTER } from './media-engine/audio-filter'
import { activeSubtitleStyle, defaultSubtitleAppearance } from '@shared/settings/subtitle-style'
import { IpcChannel } from '@shared/contracts/channels'
import { findTheme, defaultAppearance, type AppearanceSettings } from '@shared/settings/theme'

const devServerUrl = app.isPackaged ? undefined : process.env['ELECTRON_RENDERER_URL']
const preloadPath = join(__dirname, '../preload/index.js')
const rendererHtml = join(__dirname, '../renderer/index.html')

let services: AppServices | undefined
let radarStartupTimer: NodeJS.Timeout | undefined
/** Leaves startup work (scans, identification) a head start. */
const RADAR_STARTUP_DELAY_MS = 20_000
let player: PlayerController | undefined
let mainWindow: BrowserWindow | undefined

const mpvPath = () =>
  resolveMpvPath({
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    // Built main lives in <root>/out/main; app.getAppPath() depends on how Electron was launched.
    appPath: join(__dirname, '../..'),
  })

function loadRoute(win: BrowserWindow, route: string): Promise<void> {
  return devServerUrl
    ? win.loadURL(`${devServerUrl}#${route}`)
    : win.loadFile(rendererHtml, { hash: route })
}

/** Toolbar height in the renderer (--frame-toolbar-height); the window buttons sit inside it. */
const TITLE_BAR_HEIGHT = 52

/** Colours the Windows caption buttons to blend into the app background. */
function titleBarOverlay(appearance: AppearanceSettings) {
  const { colors } = findTheme(appearance)
  return { color: colors.bg, symbolColor: colors.textMuted, height: TITLE_BAR_HEIGHT }
}

function createMainWindow(): BrowserWindow {
  const appearance = services?.settings.get().appearance ?? defaultAppearance
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 520,
    show: false,
    title: 'Frame',
    backgroundColor: findTheme(appearance).colors.bg,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: titleBarOverlay(appearance),
    webPreferences: secureWebPreferences(preloadPath),
  })

  hardenWebContents(win.webContents, devServerUrl)
  win.once('ready-to-show', () => win.show())
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = undefined
  })
  mainWindow = win
  void loadRoute(win, '/')
  return win
}

function openFromArgv(argv: readonly string[], cwd: string) {
  const paths = extractMediaPaths(argv.slice(1), cwd)
  if (paths.length > 0) void player?.openPaths(paths)
}

// Must run before the single-instance lock, which is keyed on the userData directory.
configureUserDataDir()
// Custom schemes must be registered before the app is ready.
registerArtworkScheme()

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv, cwd) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
    openFromArgv(argv, cwd)
  })

  void app.whenReady().then(() => {
    hardenSession(session.defaultSession)
    // Same ID as appId in electron-builder.yml.
    identifyToYouTube(session.defaultSession, 'local.frame.player')

    const paths = resolveAppPaths()
    try {
      services = bootstrapServices(
        paths,
        {
          onScanProgress: (progress) => {
            broadcast(IpcChannel.LibraryScanProgress, progress)
            if (progress.status === 'scanning') return
            notifyLibraryChanged()
            // New files get identified after each completed scan, if enabled.
            if (progress.status === 'complete' && services?.settings.get().metadata.autoIdentify) {
              void services.metadata.identifyPending()
            }
          },
          onLibraryChanged: () => notifyLibraryChanged(),
          onMetadataStatus: (status) => broadcast(IpcChannel.MetadataStatusChanged, status),
          onSubtitleStatus: (statuses) => broadcast(IpcChannel.SubtitleProvidersChanged, statuses),
          onBookmarksChanged: () => broadcast(IpcChannel.BookmarksChanged, null),
          onRadarNotificationsChanged: () => broadcast(IpcChannel.RadarNotificationsChanged, null),
        },
        devOverrides(),
        {
          currentPath: () => player?.getState().path ?? null,
          mpvPath,
          addSubtitle: (video, sub, language) =>
            player?.addSubtitle(video, sub, language) ?? Promise.resolve(false),
        },
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      dialog.showErrorBox('Frame could not start', message)
      app.exit(1)
      return
    }

    player = new PlayerController({
      resolveMpvPath: mpvPath,
      preloadPath,
      loadOverlay: (win) => loadRoute(win, '/player'),
      devServerUrl,
      raiseVideoWindow,
      getEngineSettings: () => {
        const playback = services?.settings.get().playback
        return {
          hwdec: playback?.hardwareDecoding ?? 'auto-safe',
          volume: playback?.defaultVolume ?? 100,
        }
      },
      screenshotDir: () => paths.screenshots,
      publishState: (state) => broadcast(IpcChannel.PlayerStateChanged, state),
      onStateChange: (state) => services?.history.onPlayerState(state),
      onSessionEnded: (last) => services?.history.onSessionEnded(last),
      resumeFor: (path) => services?.history.resumeFor(path) ?? null,
      subtitleLanguages: () =>
        services?.settings.get().subtitles.preferredLanguages.join(',') ?? '',
      audio: () => {
        const audio = services?.settings.get().audio
        return {
          languages: audio?.preferredLanguages.join(',') ?? '',
          filter: audio?.normalizeLoudness ? LOUDNESS_FILTER : '',
        }
      },
      subtitleStyle: () =>
        subtitleStyleProperties(
          activeSubtitleStyle(services?.settings.get().subtitleStyle ?? defaultSubtitleAppearance),
        ),
      subtitlesFor: async (path) => {
        const prefs = services?.settings.get().subtitles
        if (!prefs?.autoLoadLocal) return []
        const found = await discoverLocalSubtitles(path)
        const chosen = chooseLocalSubtitle(found, prefs)
        return found.map((s) => ({ path: s.path, language: s.language, select: s === chosen }))
      },
    })

    // Development and tests may skip first-run setup (ignored in packaged builds).
    if (devOverrides().skipSetup && !services.settings.get().general.setupComplete) {
      services.settings.update({ general: { setupComplete: true } })
    }

    // Only Frame's own pages (bundled files, or the dev server in development) may call IPC.
    setIpcSenderPolicy((url) => isAllowedAppUrl(url, devServerUrl))
    registerIpcHandlers({
      ...services,
      player,
      onLibraryChanged: notifyLibraryChanged,
      onPeopleChanged: () => broadcast(IpcChannel.PeopleChanged, null),
      onRadarNotificationsChanged: () => broadcast(IpcChannel.RadarNotificationsChanged, null),
      onSettingsChanged: (settings) => {
        broadcast(IpcChannel.SettingsChanged, settings)
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.setTitleBarOverlay(titleBarOverlay(settings.appearance))
          mainWindow.setBackgroundColor(findTheme(settings.appearance).colors.bg)
        }
      },
      openPath: (path) => shell.openPath(path),
      openExternal: (url) => shell.openExternal(url),
      showMainView: (view) => {
        const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : createMainWindow()
        if (win.isMinimized()) win.restore()
        win.show()
        win.focus()
        const send = () => win.webContents.send(IpcChannel.AppNavigate, view)
        if (win.webContents.isLoading()) win.webContents.once('did-finish-load', send)
        else send()
      },
    })
    createMainWindow()
    openFromArgv(process.argv, process.cwd())

    handleArtworkProtocol(services.artwork, services.thumbnails)
    services.thumbnails.prune()
    // TMDB terms: cached content may not be kept longer than 6 months.
    const startedServices = services
    void startedServices.artwork.purgeExpired()
    void startedServices.metadata
      .maintainCache()
      .catch((e: unknown) => console.warn(`metadata: cache maintenance failed: ${String(e)}`))
      .then(() => {
        if (startedServices.settings.get().metadata.autoIdentify) {
          void startedServices.metadata.identifyPending()
        }
      })

    // Folders with automatic rescanning are refreshed on startup and then watched.
    for (const folder of services.library.listFolders()) {
      if (folder.autoRescan) void services.library.scan(folder.id)
    }
    services.library.startWatchers()

    // Radar looks for new releases of followed people once, shortly after startup (and again
    // when Radar is opened). Nothing runs while Frame is closed.
    radarStartupTimer = setTimeout(() => {
      if (startedServices.settings.get().metadata.radarNotifications) {
        void startedServices.radar
          .get()
          .catch((e: unknown) => console.warn(`radar: startup check failed: ${String(e)}`))
      }
    }, RADAR_STARTUP_DELAY_MS)

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  // Background scans write to the database; stop them before it closes.
  let backgroundWorkStopped = false
  app.on('before-quit', (event) => {
    if (backgroundWorkStopped || !services) return
    event.preventDefault()
    services.thumbnails.cancelAll()
    const stop = Promise.all([
      services.library.dispose(),
      services.metadata.dispose(),
      services.subtitles.dispose(),
    ])
    const timeout = new Promise((r) => setTimeout(r, 3000))
    void Promise.race([stop, timeout]).finally(() => {
      backgroundWorkStopped = true
      app.quit()
    })
  })

  app.on('will-quit', () => {
    clearTimeout(radarStartupTimer)
    player?.disposeNow()
    services?.db.close()
    services = undefined
  })
}

/** Coalesces bursts of changes into one refresh signal for renderer views. */
let libraryChangedTimer: NodeJS.Timeout | undefined
function notifyLibraryChanged() {
  clearTimeout(libraryChangedTimer)
  libraryChangedTimer = setTimeout(() => broadcast(IpcChannel.LibraryChanged, null), 150)
}

function broadcast(channel: string, payload: unknown) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

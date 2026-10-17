import { app, BrowserWindow, dialog, session } from 'electron'
import { join } from 'node:path'
import { hardenSession, hardenWebContents, secureWebPreferences } from './security/web-security'
import { registerIpcHandlers } from './ipc/register-handlers'
import { configureUserDataDir, resolveAppPaths } from './application/app-paths'
import { bootstrapServices, type AppServices } from './application/bootstrap'
import { PlayerController } from './application/player-controller'
import { resolveMpvPath } from './media-engine/mpv-locator'
import { raiseVideoWindow } from './media-engine/video-window-order'
import { extractMediaPaths } from './filesystem/launch-args'
import { IpcChannel } from '@shared/contracts/channels'

const devServerUrl = app.isPackaged ? undefined : process.env['ELECTRON_RENDERER_URL']
const preloadPath = join(__dirname, '../preload/index.js')
const rendererHtml = join(__dirname, '../renderer/index.html')

let services: AppServices | undefined
let player: PlayerController | undefined

function loadRoute(win: BrowserWindow, route: string): Promise<void> {
  return devServerUrl
    ? win.loadURL(`${devServerUrl}#${route}`)
    : win.loadFile(rendererHtml, { hash: route })
}

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 520,
    show: false,
    title: 'Frame',
    backgroundColor: '#14161B',
    autoHideMenuBar: true,
    webPreferences: secureWebPreferences(preloadPath),
  })

  hardenWebContents(win.webContents, devServerUrl)
  win.once('ready-to-show', () => win.show())
  void loadRoute(win, '/')
  return win
}

function openFromArgv(argv: readonly string[], cwd: string) {
  const paths = extractMediaPaths(argv.slice(1), cwd)
  if (paths.length > 0) void player?.openPaths(paths)
}

// Must run before the single-instance lock, which is keyed on the userData directory.
configureUserDataDir()

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

    const paths = resolveAppPaths()
    try {
      services = bootstrapServices(paths, {
        onScanProgress: (progress) => {
          broadcast(IpcChannel.LibraryScanProgress, progress)
          if (progress.status !== 'scanning') notifyLibraryChanged()
        },
        onLibraryChanged: () => notifyLibraryChanged(),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      dialog.showErrorBox('Frame could not start', message)
      app.exit(1)
      return
    }

    player = new PlayerController({
      resolveMpvPath: () =>
        resolveMpvPath({
          isPackaged: app.isPackaged,
          resourcesPath: process.resourcesPath,
          // Built main lives in <root>/out/main; app.getAppPath() depends on how Electron was launched.
          appPath: join(__dirname, '../..'),
        }),
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
    })

    registerIpcHandlers({ ...services, player, onLibraryChanged: notifyLibraryChanged })
    createMainWindow()
    openFromArgv(process.argv, process.cwd())

    // Folders with automatic rescanning are refreshed on startup and then watched.
    for (const folder of services.library.listFolders()) {
      if (folder.autoRescan) void services.library.scan(folder.id)
    }
    services.library.startWatchers()

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
    const stop = services.library.dispose()
    const timeout = new Promise((r) => setTimeout(r, 3000))
    void Promise.race([stop, timeout]).finally(() => {
      backgroundWorkStopped = true
      app.quit()
    })
  })

  app.on('will-quit', () => {
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

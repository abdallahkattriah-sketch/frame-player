import { BaseWindow, BrowserWindow } from 'electron'
import { mkdirSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { IpcChannel } from '@shared/contracts/channels'
import {
  initialPlayerState,
  type OpenMediaResult,
  type PlayerCommand,
  type PlayerState,
  type ScreenshotResult,
} from '@shared/contracts/player'
import { MpvProcess } from '../media-engine/mpv-process'
import { observedProperties, PlayerStateTracker, toMpvCommands } from '../media-engine/player-state'
import type { MpvEvent } from '../media-engine/mpv-ipc-client'
import { resolveMediaPaths } from '../filesystem/media-files'
import { hardenWebContents, secureWebPreferences } from '../security/web-security'

export interface PlayerControllerOptions {
  resolveMpvPath: () => string
  preloadPath: string
  /** Loads the renderer's player overlay route into a window. */
  loadOverlay: (win: BrowserWindow) => Promise<void>
  devServerUrl: string | undefined
  /** Raises mpv's video child window above Electron's compositor window; false if not found. */
  raiseVideoWindow: (hostHwnd: number) => boolean
  /** Read each time the engine starts. */
  getEngineSettings: () => { hwdec: string; volume: number }
  /** Directory screenshots are written to. */
  screenshotDir: () => string
}

const STATE_FLUSH_MS = 100
const RAISE_RETRY_MS = 100
const RAISE_MAX_ATTEMPTS = 30

/**
 * Owns the player window pair and the mpv process:
 * - a host window whose native handle mpv renders video into (--wid). It is a BaseWindow with
 *   no web contents: a BrowserWindow's Chromium compositor child window would cover mpv's.
 * - a transparent overlay window (owned by the host) rendering the React controls
 */
export class PlayerController {
  private host: BaseWindow | null = null
  private overlay: BrowserWindow | null = null
  private mpv: MpvProcess | null = null
  private starting: Promise<MpvProcess> | null = null
  private state: PlayerState = initialPlayerState
  private flushTimer: NodeJS.Timeout | null = null
  private raiseTimer: NodeJS.Timeout | null = null

  constructor(private readonly options: PlayerControllerOptions) {}

  getState(): PlayerState {
    return this.state
  }

  /**
   * Replaces the playlist with the given files and folders (folders expand to the videos
   * directly inside them) and starts playing the first one.
   */
  async openPaths(paths: readonly string[]): Promise<OpenMediaResult> {
    const files = resolveMediaPaths(paths)
    const [first, ...rest] = files
    if (!first) return { queued: 0, error: 'No supported video files were found.' }

    this.ensureWindows()
    try {
      const mpv = await this.ensureEngine()
      this.update({
        ...this.state,
        status: 'loading',
        error: null,
        path: first,
        title: basename(first),
        position: null,
        duration: null,
        eofReached: false,
        shuffle: false,
      })
      // Paths travel as JSON strings over IPC: no quoting or shell involved.
      await mpv.client.command('loadfile', first, 'replace')
      for (const file of rest) await mpv.client.command('loadfile', file, 'append')
      await mpv.client.setProperty('pause', false)
      return { queued: files.length }
    } catch (error) {
      this.update({ ...this.state, status: 'error', error: describe(error) })
      return { queued: 0, error: describe(error) }
    }
  }

  async command(command: PlayerCommand): Promise<void> {
    if (command.type === 'toggle-fullscreen') {
      this.host?.setFullScreen(!this.host.isFullScreen())
      return
    }
    if (!this.mpv?.running) return
    for (const mpvCommand of toMpvCommands(command)) await this.mpv.client.command(...mpvCommand)
    // mpv has no observable shuffle property; the playlist order change is observed instead.
    if (command.type === 'set-shuffle') this.update({ ...this.state, shuffle: command.shuffle })
  }

  /** Saves the current frame (with subtitles) as PNG in the screenshot directory. */
  async screenshot(): Promise<ScreenshotResult> {
    if (!this.mpv?.running || !this.state.videoActive || !this.state.path) {
      throw new Error('Nothing is playing.')
    }
    const dir = this.options.screenshotDir()
    mkdirSync(dir, { recursive: true })
    const name = basename(this.state.path, extname(this.state.path)).replace(/[<>:"/\\|?*]/g, '_')
    const seconds = Math.floor(this.state.position ?? 0)
    const stamp = new Date().toISOString().replaceAll(':', '-').replace(/\..+$/, '')
    const path = join(dir, `${name} ${seconds}s ${stamp}.png`)
    await this.mpv.client.command('screenshot-to-file', path, 'subtitles')
    return { path }
  }

  /** Synchronous: safe to call from app 'will-quit'. */
  disposeNow(): void {
    this.mpv?.killNow()
    this.mpv = null
  }

  private ensureWindows(): void {
    if (this.host && !this.host.isDestroyed()) {
      if (this.host.isMinimized()) this.host.restore()
      this.host.focus()
      return
    }

    const host = new BaseWindow({
      width: 1280,
      height: 720,
      minWidth: 480,
      minHeight: 270,
      title: 'Frame Player',
      backgroundColor: '#000000',
      autoHideMenuBar: true,
      show: false,
    })
    const overlay = new BrowserWindow({
      parent: host,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      hasShadow: false,
      show: false,
      webPreferences: secureWebPreferences(this.options.preloadPath),
    })
    hardenWebContents(overlay.webContents, this.options.devServerUrl)

    const syncBounds = () => {
      if (!host.isDestroyed() && !overlay.isDestroyed()) overlay.setBounds(host.getContentBounds())
    }
    host.on('move', syncBounds)
    host.on('resize', () => {
      syncBounds()
      this.keepVideoOnTop()
    })
    host.on('restore', () => this.keepVideoOnTop())
    host.on('enter-full-screen', () => {
      syncBounds()
      this.keepVideoOnTop()
      this.update({ ...this.state, fullscreen: true })
    })
    host.on('leave-full-screen', () => {
      syncBounds()
      this.keepVideoOnTop()
      this.update({ ...this.state, fullscreen: false })
    })
    host.on('closed', () => {
      if (this.raiseTimer) clearTimeout(this.raiseTimer)
      this.raiseTimer = null
      if (!overlay.isDestroyed()) overlay.destroy()
      void this.mpv?.dispose()
      this.mpv = null
      this.host = null
      this.overlay = null
      this.state = initialPlayerState
    })
    overlay.on('closed', () => {
      if (!host.isDestroyed()) host.close()
    })

    this.host = host
    this.overlay = overlay

    host.show()
    syncBounds()
    void this.options.loadOverlay(overlay).then(() => {
      if (overlay.isDestroyed()) return
      syncBounds()
      overlay.show()
      this.flush()
    })
  }

  private async ensureEngine(): Promise<MpvProcess> {
    if (this.mpv?.running) return this.mpv
    if (this.starting) return this.starting
    const host = this.host
    if (!host) throw new Error('Player window is not open')

    this.starting = (async () => {
      const windowId = host.getNativeWindowHandle().readBigUInt64LE(0).toString()
      const mpv = await MpvProcess.start({
        mpvPath: this.options.resolveMpvPath(),
        windowId,
        ...this.options.getEngineSettings(),
      })
      mpv.on('exit', ({ code, expected }) => {
        if (this.mpv === mpv) this.mpv = null
        if (!expected) {
          this.update({
            ...this.state,
            status: 'error',
            error: `The playback engine stopped unexpectedly (exit code ${code ?? 'unknown'}).`,
          })
        }
      })
      mpv.on('log', (line) => console.warn(`mpv: ${line}`))
      const tracker = new PlayerStateTracker()
      mpv.client.on('property-change', ({ name, data }) => {
        this.update(tracker.apply(this.state, name, data))
        if (name === 'vo-configured' && data === true) this.keepVideoOnTop()
      })
      mpv.client.on('event', (event) => this.onMpvEvent(event))
      for (const name of observedProperties) await mpv.client.observeProperty(name)
      this.mpv = mpv
      this.update({ ...this.state, status: 'idle' })
      this.keepVideoOnTop()
      return mpv
    })()

    try {
      return await this.starting
    } finally {
      this.starting = null
    }
  }

  /** Raises mpv's window now, retrying briefly while mpv is still creating it. */
  private keepVideoOnTop(attempt = 0) {
    if (this.raiseTimer) clearTimeout(this.raiseTimer)
    this.raiseTimer = null
    const host = this.host
    if (!host || host.isDestroyed()) return
    const hwnd = Number(host.getNativeWindowHandle().readBigUInt64LE(0))
    let raised: boolean
    try {
      raised = this.options.raiseVideoWindow(hwnd)
    } catch (error) {
      console.warn(`player: could not reorder video window: ${describe(error)}`)
      return
    }
    if (!raised && attempt < RAISE_MAX_ATTEMPTS) {
      this.raiseTimer = setTimeout(() => this.keepVideoOnTop(attempt + 1), RAISE_RETRY_MS)
    }
  }

  private onMpvEvent(event: MpvEvent) {
    if (event.event === 'file-loaded') {
      this.update({ ...this.state, status: 'ready', error: null })
    } else if (event.event === 'end-file' && event['reason'] === 'error') {
      const detail = typeof event['file_error'] === 'string' ? event['file_error'] : 'unknown error'
      this.update({
        ...this.state,
        status: 'error',
        error: `Could not play this file (${detail}).`,
      })
    }
  }

  private update(next: PlayerState) {
    this.state = next
    if (!this.flushTimer) this.flushTimer = setTimeout(() => this.flush(), STATE_FLUSH_MS)
  }

  private flush() {
    if (this.flushTimer) clearTimeout(this.flushTimer)
    this.flushTimer = null
    if (this.overlay && !this.overlay.isDestroyed()) {
      this.overlay.webContents.send(IpcChannel.PlayerStateChanged, this.state)
    }
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

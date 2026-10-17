import { BaseWindow, BrowserWindow } from 'electron'
import { mkdirSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import {
  initialPlayerState,
  type OpenMediaResult,
  type PlayerCommand,
  type PlayerState,
  type ScreenshotResult,
} from '@shared/contracts/player'
import { MpvProcess } from '../media-engine/mpv-process'
import {
  observedProperties,
  parseTracks,
  PlayerStateTracker,
  toMpvCommands,
} from '../media-engine/player-state'
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
  /** Pushes state to renderer windows (throttled by the controller). */
  publishState: (state: PlayerState) => void
  /** Every state change, unthrottled (used for history). */
  onStateChange?: (state: PlayerState) => void
  /** The player window closed or the app is quitting; `last` is the final state. */
  onSessionEnded?: (last: PlayerState) => void
  /** Where to resume a file that just loaded, if anywhere. */
  resumeFor?: (path: string) => {
    position: number
    audioTrackId: number | null
    subtitleTrackId: number | null
  } | null
  /** External subtitle files to add for a file that just loaded, and which one to show. */
  subtitlesFor?: (
    path: string,
  ) => Promise<{ path: string; language: string | null; select: boolean }[]>
  /** Preferred subtitle languages for mpv's choice among embedded tracks (e.g. "ar,en"). */
  subtitleLanguages?: () => string
  /** mpv properties for the active subtitle style profile. */
  subtitleStyle?: () => [string, string | number | boolean][]
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
      const slang = this.options.subtitleLanguages?.()
      if (slang) await mpv.client.setProperty('slang', slang)
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
    if (command.type === 'show-player') {
      if (this.host && !this.host.isDestroyed()) {
        if (this.host.isMinimized()) this.host.restore()
        this.host.focus()
      }
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

  /**
   * Adds a subtitle file to the player and shows it, if `videoPath` is what is playing.
   * Returns false (and does nothing) otherwise.
   */
  async addSubtitle(
    videoPath: string,
    subtitlePath: string,
    language: string | null,
  ): Promise<boolean> {
    const mpv = this.mpv
    const current = this.state.path
    if (!mpv?.running || !current || current.toLowerCase() !== videoPath.toLowerCase()) return false
    await mpv.client.command(
      'sub-add',
      subtitlePath,
      'select',
      basename(subtitlePath),
      language ?? '',
    )
    return true
  }

  /** Applies the current subtitle style to the running player (no-op when none is running). */
  async applySubtitleStyle(): Promise<void> {
    const mpv = this.mpv
    if (!mpv?.running || !this.options.subtitleStyle) return
    for (const [name, value] of this.options.subtitleStyle()) {
      try {
        await mpv.client.setProperty(name, value)
      } catch (error) {
        console.warn(`player: could not set ${name}: ${describe(error)}`)
      }
    }
  }

  /** Synchronous: safe to call from app 'will-quit'. Records the final state first. */
  disposeNow(): void {
    if (this.state.path) this.options.onSessionEnded?.(this.state)
    this.state = initialPlayerState
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
      if (this.state.path) this.options.onSessionEnded?.(this.state)
      if (!overlay.isDestroyed()) overlay.destroy()
      void this.mpv?.dispose()
      this.mpv = null
      this.host = null
      this.overlay = null
      this.state = { ...initialPlayerState, status: 'closed' }
      this.flush()
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
      await this.applySubtitleStyle()
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
      void this.prepareLoadedFile()
    } else if (event.event === 'end-file' && event['reason'] === 'error') {
      const detail = typeof event['file_error'] === 'string' ? event['file_error'] : 'unknown error'
      this.update({
        ...this.state,
        status: 'error',
        error: `Could not play this file (${detail}).`,
      })
    }
  }

  /**
   * For a file that just loaded: add its subtitle files, then restore the remembered position
   * and track choices (which take precedence over the automatic subtitle choice).
   */
  private async prepareLoadedFile() {
    const mpv = this.mpv
    if (!mpv) return
    let path: unknown
    try {
      // Ask mpv directly: the 'path' property change may not have arrived yet.
      path = await mpv.client.getProperty('path')
    } catch {
      return
    }
    if (typeof path !== 'string') return

    if (this.options.subtitlesFor) {
      try {
        for (const sub of await this.options.subtitlesFor(path)) {
          await mpv.client.command(
            'sub-add',
            sub.path,
            sub.select ? 'select' : 'auto',
            basename(sub.path),
            sub.language ?? '',
          )
        }
      } catch (error) {
        console.warn(`player: could not add subtitle files: ${describe(error)}`)
      }
    }
    await this.resumeFile(mpv, path)
  }

  /** Restores position and track choices remembered for the file that just loaded. */
  private async resumeFile(mpv: MpvProcess, path: string) {
    if (!this.options.resumeFor) return
    try {
      const resume = this.options.resumeFor(path)
      if (!resume) return
      await mpv.client.command('seek', resume.position, 'absolute+exact')
      const tracks = parseTracks(await mpv.client.getProperty('track-list'))
      const ids = new Set(tracks.map((t) => `${t.type}:${t.id}`))
      const restoreTrack = async (
        property: 'aid' | 'sid',
        type: 'audio' | 'sub',
        id: number | null,
      ) => {
        if (id === null) return
        if (id === 0) await mpv.client.setProperty(property, 'no')
        else if (ids.has(`${type}:${id}`)) await mpv.client.setProperty(property, id)
      }
      await restoreTrack('aid', 'audio', resume.audioTrackId)
      await restoreTrack('sid', 'sub', resume.subtitleTrackId)
    } catch (error) {
      console.warn(`player: could not resume: ${describe(error)}`)
    }
  }

  private update(next: PlayerState) {
    this.state = next
    this.options.onStateChange?.(next)
    if (!this.flushTimer) this.flushTimer = setTimeout(() => this.flush(), STATE_FLUSH_MS)
  }

  private flush() {
    if (this.flushTimer) clearTimeout(this.flushTimer)
    this.flushTimer = null
    this.options.publishState(this.state)
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

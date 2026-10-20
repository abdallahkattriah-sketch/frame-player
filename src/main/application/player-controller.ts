import { BaseWindow, BrowserWindow } from 'electron'
import { mkdirSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import {
  initialPlayerState,
  type OpenMediaResult,
  type PlayerArea,
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
  /**
   * The main window. When it has reported its player area, the player is shown inside it: an
   * owned, frameless window kept over that area. Without it, the player opens its own window.
   */
  getOwner?: () => BrowserWindow | null
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
  /** Preferred audio languages (e.g. "ar,en") and the audio filter chain ("" for none). */
  audio?: () => { languages: string; filter: string }
}

const STATE_FLUSH_MS = 100
const RAISE_RETRY_MS = 100
const RAISE_MAX_ATTEMPTS = 30
const AREA_WAIT_MS = 5000

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
  private area: PlayerArea | null = null
  /** The main window the open player is shown inside, if any. */
  private owner: BrowserWindow | null = null
  private syncBounds: (() => void) | null = null
  private areaWaiters: (() => void)[] = []

  constructor(private readonly options: PlayerControllerOptions) {}

  /** Records where the main window shows the player and moves an open player there. */
  setArea(area: PlayerArea): void {
    this.area = area
    this.syncBounds?.()
    for (const resolve of this.areaWaiters.splice(0)) resolve()
  }

  /**
   * Files opened at startup arrive before the main window's page has reported its player area:
   * wait briefly for it so the player still opens inside the main window.
   */
  private waitForArea(): Promise<void> {
    const owner = this.options.getOwner?.()
    if (this.area || !owner || owner.isDestroyed()) return Promise.resolve()
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.areaWaiters = this.areaWaiters.filter((w) => w !== done)
        resolve()
      }, AREA_WAIT_MS)
      const done = () => {
        clearTimeout(timer)
        resolve()
      }
      this.areaWaiters.push(done)
    })
  }

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

    await this.waitForArea()
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
    const owner = this.owner && !this.owner.isDestroyed() ? this.owner : null
    if (command.type === 'toggle-fullscreen') {
      // Inside the main window, the main window goes fullscreen and the player fills it.
      if (owner) owner.setFullScreen(!owner.isFullScreen())
      else this.host?.setFullScreen(!this.host.isFullScreen())
      return
    }
    if (command.type === 'show-player') {
      const front = owner ?? this.host
      if (front && !front.isDestroyed()) {
        if (front.isMinimized()) front.restore()
        front.focus()
        if (owner && this.overlay && !this.overlay.isDestroyed()) this.overlay.focus()
      }
      return
    }
    if (command.type === 'close-player') {
      if (this.host && !this.host.isDestroyed()) this.host.close()
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

  /**
   * Applies settings that take effect while playing (subtitle style, audio preferences) to the
   * running player. No-op when none is running.
   */
  async applyLiveSettings(): Promise<void> {
    const mpv = this.mpv
    if (!mpv?.running) return
    const audio = this.options.audio?.()
    const properties: [string, string | number | boolean][] = [
      ...(this.options.subtitleStyle?.() ?? []),
    ]
    if (audio) properties.push(['alang', audio.languages], ['af', audio.filter])
    for (const [name, value] of properties) {
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
      const front = this.owner && !this.owner.isDestroyed() ? this.owner : this.host
      if (front.isMinimized()) front.restore()
      front.focus()
      if (this.owner && this.overlay && !this.overlay.isDestroyed()) this.overlay.focus()
      return
    }

    const candidate = this.options.getOwner?.() ?? null
    const owner = candidate && !candidate.isDestroyed() && this.area ? candidate : null
    const host = owner
      ? new BaseWindow({
          parent: owner,
          frame: false,
          resizable: false,
          movable: false,
          minimizable: false,
          maximizable: false,
          fullscreenable: false,
          skipTaskbar: true,
          hasShadow: false,
          title: 'Frame Player',
          backgroundColor: '#000000',
          show: false,
        })
      : new BaseWindow({
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
      if (host.isDestroyed() || overlay.isDestroyed()) return
      if (owner && !owner.isDestroyed()) {
        const target = this.embeddedBounds(owner)
        const now = host.getBounds()
        // Only when different: setting bounds raises 'resize', which calls this again.
        if (
          now.x !== target.x ||
          now.y !== target.y ||
          now.width !== target.width ||
          now.height !== target.height
        ) {
          host.setBounds(target)
        }
      }
      overlay.setBounds(host.getContentBounds())
    }
    const enterFullScreen = () => {
      syncBounds()
      this.keepVideoOnTop()
      this.update({ ...this.state, fullscreen: true })
    }
    const leaveFullScreen = () => {
      syncBounds()
      this.keepVideoOnTop()
      this.update({ ...this.state, fullscreen: false })
    }
    const follow = () => {
      syncBounds()
      this.keepVideoOnTop()
    }
    // The window whose moves, resizes, and fullscreen changes the player follows.
    const frame = owner ?? host
    const listeners: [string, () => void][] = [
      ['move', syncBounds],
      ['resize', follow],
      ['restore', follow],
      ['maximize', follow],
      ['unmaximize', follow],
      ['enter-full-screen', enterFullScreen],
      ['leave-full-screen', leaveFullScreen],
    ]
    for (const [event, listener] of listeners) frame.on(event as 'move', listener)
    // Windows shows owned windows again after their owner is restored, at their own size;
    // put the player back over its area then.
    const hostListeners: [string, () => void][] = owner
      ? [
          ['show', follow],
          ['restore', follow],
          ['move', syncBounds],
          ['resize', syncBounds],
        ]
      : []
    for (const [event, listener] of hostListeners) host.on(event as 'move', listener)

    host.on('closed', () => {
      if (this.raiseTimer) clearTimeout(this.raiseTimer)
      this.raiseTimer = null
      for (const [event, listener] of listeners) {
        if (!frame.isDestroyed()) frame.removeListener(event as 'move', listener)
      }
      if (this.state.path) this.options.onSessionEnded?.(this.state)
      if (!overlay.isDestroyed()) overlay.destroy()
      void this.mpv?.dispose()
      this.mpv = null
      this.host = null
      this.overlay = null
      this.owner = null
      this.syncBounds = null
      this.state = { ...initialPlayerState, status: 'closed' }
      this.flush()
      // Back to the main window, as it was before playing.
      if (owner && !owner.isDestroyed()) {
        if (owner.isFullScreen()) owner.setFullScreen(false)
        owner.focus()
      }
    })
    overlay.on('closed', () => {
      if (!host.isDestroyed()) host.close()
    })

    this.host = host
    this.overlay = overlay
    this.owner = owner
    this.syncBounds = syncBounds

    syncBounds()
    host.show()
    syncBounds()
    void this.options.loadOverlay(overlay).then(() => {
      if (overlay.isDestroyed()) return
      syncBounds()
      overlay.show()
      // Keyboard shortcuts go to the player's controls.
      if (owner) overlay.focus()
      this.flush()
    })
  }

  /** Screen bounds of the player area of the main window (all of it when fullscreen). */
  private embeddedBounds(owner: BrowserWindow) {
    const content = owner.getContentBounds()
    const area = this.area
    if (owner.isFullScreen() || !area) return content
    const zoom = owner.webContents.getZoomFactor()
    const x = Math.round(area.x * zoom)
    const y = Math.round(area.y * zoom)
    return {
      x: content.x + x,
      y: content.y + y,
      width: Math.max(1, Math.min(Math.round(area.width * zoom), content.width - x)),
      height: Math.max(1, Math.min(Math.round(area.height * zoom), content.height - y)),
    }
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
      await this.applyLiveSettings()
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

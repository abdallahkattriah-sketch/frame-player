import { BaseWindow, BrowserWindow } from 'electron'
import { existsSync } from 'node:fs'
import { basename } from 'node:path'
import { IpcChannel } from '@shared/contracts/channels'
import { initialPlayerState, type PlayerCommand, type PlayerState } from '@shared/contracts/player'
import { MpvProcess } from '../media-engine/mpv-process'
import { applyProperty, observedProperties, toMpvCommand } from '../media-engine/player-state'
import type { MpvEvent } from '../media-engine/mpv-ipc-client'
import { hardenWebContents, secureWebPreferences } from '../security/web-security'

export interface PlayerControllerOptions {
  resolveMpvPath: () => string
  preloadPath: string
  /** Loads the renderer's player overlay route into a window. */
  loadOverlay: (win: BrowserWindow) => Promise<void>
  devServerUrl: string | undefined
  /** Raises mpv's video child window above Electron's compositor window; false if not found. */
  raiseVideoWindow: (hostHwnd: number) => boolean
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

  async open(path: string): Promise<void> {
    this.ensureWindows()
    if (!existsSync(path)) {
      this.update({ ...this.state, status: 'error', error: `File not found: ${path}` })
      return
    }
    try {
      const mpv = await this.ensureEngine()
      this.update({
        ...this.state,
        status: 'loading',
        error: null,
        path,
        title: basename(path),
        position: null,
        duration: null,
        eofReached: false,
      })
      // The path travels as a JSON string over IPC: no quoting or shell involved.
      await mpv.client.command('loadfile', path, 'replace')
      await mpv.client.setProperty('pause', false)
    } catch (error) {
      this.update({ ...this.state, status: 'error', error: describe(error) })
    }
  }

  async command(command: PlayerCommand): Promise<void> {
    if (command.type === 'toggle-fullscreen') {
      this.host?.setFullScreen(!this.host.isFullScreen())
      return
    }
    const mpvCommand = toMpvCommand(command)
    if (!mpvCommand || !this.mpv?.running) return
    await this.mpv.client.command(...mpvCommand)
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
      const mpv = await MpvProcess.start({ mpvPath: this.options.resolveMpvPath(), windowId })
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
      mpv.client.on('property-change', ({ name, data }) => {
        this.update(applyProperty(this.state, name, data))
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

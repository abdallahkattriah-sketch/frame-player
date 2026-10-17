import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { MpvIpcClient } from './mpv-ipc-client'

export interface MpvProcessOptions {
  mpvPath: string
  /** Native window handle (HWND) mpv renders into. */
  windowId: string
  hwdec?: string
}

interface MpvProcessEvents {
  exit: [{ code: number | null; signal: NodeJS.Signals | null; expected: boolean }]
  log: [string]
}

export function createPipePath(): string {
  return `\\\\.\\pipe\\frame-mpv-${process.pid}-${randomUUID()}`
}

/** Arguments are passed as an array to spawn (no shell), so nothing is ever shell-interpreted. */
export function buildMpvArgs(options: MpvProcessOptions, pipePath: string): string[] {
  return [
    '--no-config', // ignore any user mpv.conf/scripts: Frame controls behavior
    '--idle=yes',
    '--force-window=yes',
    '--keep-open=yes',
    `--wid=${options.windowId}`,
    `--input-ipc-server=${pipePath}`,
    '--osc=no',
    '--osd-level=0',
    '--input-default-bindings=no',
    '--input-vo-keyboard=no',
    '--input-cursor=no',
    '--cursor-autohide=no',
    `--hwdec=${options.hwdec ?? 'auto-safe'}`,
    '--terminal=no',
    '--msg-level=all=warn',
    '--load-scripts=no',
    '--ytdl=no', // local playback only
  ]
}

/** One mpv instance with its own IPC pipe. */
export class MpvProcess extends EventEmitter<MpvProcessEvents> {
  private disposing = false

  private constructor(
    private readonly child: ChildProcess,
    readonly client: MpvIpcClient,
    readonly pipePath: string,
  ) {
    super()
    child.on('exit', (code, signal) => {
      client.close()
      this.emit('exit', { code, signal, expected: this.disposing })
    })
  }

  static async start(options: MpvProcessOptions): Promise<MpvProcess> {
    const pipePath = createPipePath()
    const child = spawn(options.mpvPath, buildMpvArgs(options, pipePath), {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    })

    const earlyExit = new Promise<never>((_, reject) => {
      child.once('error', (error) => reject(error))
      child.once('exit', (code) => reject(new Error(`mpv exited during startup (code ${code})`)))
    })

    let client: MpvIpcClient
    try {
      client = await Promise.race([MpvIpcClient.connect(pipePath), earlyExit])
    } catch (error) {
      child.kill()
      throw error
    }

    const proc = new MpvProcess(child, client, pipePath)
    child.stderr?.setEncoding('utf8')
    child.stderr?.on('data', (chunk: string) => proc.emit('log', chunk.trim()))
    return proc
  }

  get pid(): number | undefined {
    return this.child.pid
  }

  get running(): boolean {
    return this.child.exitCode === null && this.child.signalCode === null
  }

  /** Asks mpv to quit, then kills it if it has not exited within `graceMs`. */
  async dispose(graceMs = 1500): Promise<void> {
    if (!this.running) return
    this.disposing = true
    const exited = new Promise<void>((resolve) => this.child.once('exit', () => resolve()))
    this.client.command('quit').catch(() => undefined)
    const timer = setTimeout(() => this.child.kill(), graceMs)
    await exited
    clearTimeout(timer)
  }

  /** Synchronous last resort during app shutdown. */
  killNow(): void {
    this.disposing = true
    if (this.running) this.child.kill()
  }
}

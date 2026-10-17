import { connect, type Socket } from 'node:net'
import { EventEmitter } from 'node:events'

export type MpvCommand = readonly (string | number | boolean)[]

export interface MpvEvent {
  event: string
  [key: string]: unknown
}

export interface MpvPropertyChange {
  name: string
  data: unknown
}

export class MpvCommandError extends Error {
  constructor(
    readonly command: MpvCommand,
    readonly mpvError: string,
  ) {
    super(`mpv command "${String(command[0])}" failed: ${mpvError}`)
    this.name = 'MpvCommandError'
  }
}

interface Pending {
  command: MpvCommand
  resolve: (data: unknown) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

interface MpvIpcClientEvents {
  event: [MpvEvent]
  'property-change': [MpvPropertyChange]
  close: []
}

/** JSON IPC client for mpv's --input-ipc-server (a named pipe on Windows). */
export class MpvIpcClient extends EventEmitter<MpvIpcClientEvents> {
  private buffer = ''
  private nextRequestId = 1
  private nextObserveId = 1
  private readonly pending = new Map<number, Pending>()
  private closed = false

  private constructor(
    private readonly socket: Socket,
    private readonly commandTimeoutMs: number,
  ) {
    super()
    socket.setEncoding('utf8')
    socket.on('data', (chunk: string) => this.onData(chunk))
    socket.on('close', () => this.onClose())
    socket.on('error', () => this.onClose())
  }

  /** Connects, retrying until mpv has created the pipe or `timeoutMs` elapses. */
  static async connect(
    pipePath: string,
    { timeoutMs = 5000, retryDelayMs = 50, commandTimeoutMs = 5000 } = {},
  ): Promise<MpvIpcClient> {
    const deadline = Date.now() + timeoutMs
    let lastError: unknown
    while (Date.now() < deadline) {
      try {
        const socket = await new Promise<Socket>((resolve, reject) => {
          const s = connect(pipePath)
          s.once('connect', () => {
            s.off('error', reject)
            resolve(s)
          })
          s.once('error', reject)
        })
        return new MpvIpcClient(socket, commandTimeoutMs)
      } catch (error) {
        lastError = error
        await new Promise((r) => setTimeout(r, retryDelayMs))
      }
    }
    throw new Error(
      `Could not connect to mpv IPC at ${pipePath}: ${lastError instanceof Error ? lastError.message : 'timeout'}`,
    )
  }

  get isClosed(): boolean {
    return this.closed
  }

  command(...command: MpvCommand): Promise<unknown> {
    if (this.closed) return Promise.reject(new Error('mpv IPC connection is closed'))
    const requestId = this.nextRequestId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId)
        reject(new Error(`mpv command "${String(command[0])}" timed out`))
      }, this.commandTimeoutMs)
      this.pending.set(requestId, { command, resolve, reject, timer })
      this.socket.write(`${JSON.stringify({ command, request_id: requestId })}\n`)
    })
  }

  getProperty(name: string): Promise<unknown> {
    return this.command('get_property', name)
  }

  setProperty(name: string, value: string | number | boolean): Promise<unknown> {
    return this.command('set_property', name, value)
  }

  async observeProperty(name: string): Promise<void> {
    await this.command('observe_property', this.nextObserveId++, name)
  }

  close(): void {
    this.socket.destroy()
    this.onClose()
  }

  private onData(chunk: string) {
    this.buffer += chunk
    let newline: number
    while ((newline = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, newline).trim()
      this.buffer = this.buffer.slice(newline + 1)
      if (line) this.onMessage(line)
    }
  }

  private onMessage(line: string) {
    let message: Record<string, unknown>
    try {
      message = JSON.parse(line) as Record<string, unknown>
    } catch {
      return // mpv only sends JSON; ignore anything malformed rather than crash.
    }

    if (typeof message['request_id'] === 'number' && 'error' in message) {
      const pending = this.pending.get(message['request_id'])
      if (!pending) return
      this.pending.delete(message['request_id'])
      clearTimeout(pending.timer)
      if (message['error'] === 'success') pending.resolve(message['data'])
      else pending.reject(new MpvCommandError(pending.command, String(message['error'])))
      return
    }

    if (typeof message['event'] === 'string') {
      if (message['event'] === 'property-change' && typeof message['name'] === 'string') {
        this.emit('property-change', { name: message['name'], data: message['data'] })
      }
      this.emit('event', message as MpvEvent)
    }
  }

  private onClose() {
    if (this.closed) return
    this.closed = true
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(new Error('mpv IPC connection closed'))
    }
    this.pending.clear()
    this.emit('close')
  }
}

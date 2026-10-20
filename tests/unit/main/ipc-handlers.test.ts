import { beforeAll, describe, expect, it, vi } from 'vitest'
import { IpcChannel } from '@shared/contracts/channels'

type Listener = (event: { senderFrame?: { url: string } | null }, ...args: unknown[]) => unknown
const registry = new Map<string, Listener>()

vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, listener: Listener) => registry.set(channel, listener) },
  app: { getName: () => 'Frame', getVersion: () => '0.0.0' },
  BrowserWindow: { getFocusedWindow: () => null },
  dialog: {},
  shell: {},
}))

/** Main → renderer pushes: not invokable. */
const pushChannels = new Set<string>([
  IpcChannel.PlayerStateChanged,
  IpcChannel.LibraryScanProgress,
  IpcChannel.LibraryChanged,
  IpcChannel.MetadataStatusChanged,
  IpcChannel.SubtitleProvidersChanged,
  IpcChannel.BookmarksChanged,
  IpcChannel.PeopleChanged,
  IpcChannel.RadarNotificationsChanged,
  IpcChannel.SettingsChanged,
  IpcChannel.AppNavigate,
])

/** Stand-in for every service: records any call, so the test can prove none happened. */
const calls: string[] = []
function spy(path: string): unknown {
  return new Proxy(() => undefined, {
    get: (_target, key) => (key === 'then' ? undefined : spy(`${path}.${String(key)}`)),
    apply: () => {
      calls.push(path)
      return spy(`${path}()`)
    },
  })
}

const trusted = {
  senderFrame: {
    url: 'file:///C:/Program%20Files/Frame/resources/app.asar/out/renderer/index.html',
  },
}

beforeAll(async () => {
  const { setIpcSenderPolicy } = await import('../../../src/main/ipc/handle')
  const { registerIpcHandlers } = await import('../../../src/main/ipc/register-handlers')
  setIpcSenderPolicy((url) => url.startsWith('file://'))
  registerIpcHandlers(spy('deps') as Parameters<typeof registerIpcHandlers>[0])
  calls.length = 0
})

async function outcome(run: () => unknown): Promise<string> {
  try {
    await run()
    return 'ok'
  } catch (error) {
    return (error as Error).name
  }
}

describe('IPC handlers', () => {
  it('handles every renderer channel and nothing else', () => {
    const invokable = Object.values(IpcChannel).filter((c) => !pushChannels.has(c))
    expect([...registry.keys()].sort()).toEqual([...invokable].sort())
  })

  it('rejects malformed arguments on every channel before any service runs', async () => {
    const junk: unknown[][] = [
      ['x'.repeat(100_000), { __proto__: { admin: true } }, 1, 2, 3, 4, 5],
      [{ type: 'run', args: ['calc.exe'] }, null, null, null, null, null, null, null],
    ]
    for (const [channel, listener] of registry) {
      for (const args of junk) {
        expect(await outcome(() => listener(trusted, ...args)), channel).toBe(
          'InvalidIpcArgumentsError',
        )
      }
    }
    expect(calls).toEqual([])
  })

  it('refuses requests from pages that are not Frame’s', async () => {
    for (const sender of [
      { senderFrame: { url: 'https://evil.example/' } },
      { senderFrame: null },
      {},
    ]) {
      for (const [channel, listener] of registry) {
        expect(await outcome(() => listener(sender)), channel).toBe('UntrustedIpcSenderError')
      }
    }
    expect(calls).toEqual([])
  })
})

import { createServer, type Server, type Socket } from 'node:net'
import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { MpvCommandError, MpvIpcClient } from '../../../src/main/media-engine/mpv-ipc-client'

/** A fake mpv: answers commands per `respond` and lets tests push raw lines. */
async function fakeMpv(
  respond: (command: unknown[], socket: Socket) => object | null,
): Promise<{ server: Server; pipe: string; sockets: Socket[]; received: unknown[][] }> {
  const pipe = `\\\\.\\pipe\\frame-test-${randomUUID()}`
  const sockets: Socket[] = []
  const received: unknown[][] = []
  const server = createServer((socket) => {
    sockets.push(socket)
    let buffer = ''
    socket.setEncoding('utf8')
    socket.on('data', (chunk: string) => {
      buffer += chunk
      let i: number
      while ((i = buffer.indexOf('\n')) >= 0) {
        const msg = JSON.parse(buffer.slice(0, i)) as { command: unknown[]; request_id: number }
        buffer = buffer.slice(i + 1)
        received.push(msg.command)
        const reply = respond(msg.command, socket)
        if (reply) socket.write(`${JSON.stringify({ ...reply, request_id: msg.request_id })}\n`)
      }
    })
  })
  await new Promise<void>((resolve) => server.listen(pipe, resolve))
  return { server, pipe, sockets, received }
}

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const c of cleanups.splice(0)) c()
})

async function setup(respond: Parameters<typeof fakeMpv>[0]) {
  const fake = await fakeMpv(respond)
  const client = await MpvIpcClient.connect(fake.pipe, { commandTimeoutMs: 500 })
  cleanups.push(() => {
    client.close()
    fake.server.close()
  })
  return { ...fake, client }
}

describe('MpvIpcClient', () => {
  it('sends commands and resolves with data, including Unicode paths', async () => {
    const { client, received } = await setup((cmd) =>
      cmd[0] === 'get_property' ? { error: 'success', data: 42.5 } : { error: 'success' },
    )
    const path = 'C:\\Movies\\أفلام test\\فيلم تجريبي 映画 "quoted".mkv'
    await client.command('loadfile', path, 'replace')
    expect(await client.getProperty('time-pos')).toBe(42.5)
    expect(received[0]).toEqual(['loadfile', path, 'replace'])
  })

  it('rejects with MpvCommandError when mpv reports an error', async () => {
    const { client } = await setup(() => ({ error: 'property not found' }))
    await expect(client.getProperty('nope')).rejects.toBeInstanceOf(MpvCommandError)
  })

  it('matches out-of-order responses to their requests', async () => {
    const held: { socket: Socket; id: number }[] = []
    const fake = await fakeMpv(() => null)
    fake.server.removeAllListeners('connection')
    fake.server.on('connection', (socket: Socket) => {
      socket.setEncoding('utf8')
      socket.on('data', (chunk: string) => {
        for (const line of chunk.split('\n').filter(Boolean)) {
          held.push({ socket, id: (JSON.parse(line) as { request_id: number }).request_id })
        }
        if (held.length === 2) {
          for (const h of [...held].reverse()) {
            h.socket.write(
              `${JSON.stringify({ request_id: h.id, error: 'success', data: h.id })}\n`,
            )
          }
        }
      })
    })
    const client = await MpvIpcClient.connect(fake.pipe)
    cleanups.push(() => {
      client.close()
      fake.server.close()
    })
    const [a, b] = await Promise.all([client.command('a'), client.command('b')])
    expect([a, b]).toEqual([1, 2])
  })

  it('emits property changes and events, ignoring malformed lines', async () => {
    const { client, sockets } = await setup(() => ({ error: 'success' }))
    await client.observeProperty('pause')
    const changes: unknown[] = []
    const events: string[] = []
    client.on('property-change', (c) => changes.push(c))
    client.on('event', (e) => events.push(e.event))

    const socket = sockets[0] as Socket
    socket.write('not json\n')
    socket.write('{"event":"property-change","id":1,"name":"pause","data":true}\n{"event":"file-')
    socket.write('loaded"}\n')
    await new Promise((r) => setTimeout(r, 50))

    expect(changes).toEqual([{ name: 'pause', data: true }])
    expect(events).toEqual(['property-change', 'file-loaded'])
  })

  it('times out unanswered commands and rejects pending ones on close', async () => {
    const { client } = await setup(() => null)
    await expect(client.command('slow')).rejects.toThrow('timed out')

    const pending = client.command('never')
    client.close()
    await expect(pending).rejects.toThrow('closed')
    await expect(client.command('after')).rejects.toThrow('closed')
  })

  it('fails to connect when no pipe appears', async () => {
    await expect(
      MpvIpcClient.connect(`\\\\.\\pipe\\frame-missing-${randomUUID()}`, { timeoutMs: 200 }),
    ).rejects.toThrow('Could not connect')
  })
})

// Smoke test for a packaged build: launches Frame.exe (no dev server, no test hooks) with a
// video, finds the mpv it started, and checks over mpv's own IPC pipe that the video plays.
// App data goes to a temporary folder (portable mode), never to %APPDATA%\Frame.
// Usage: node scripts/build/smoke-test.mjs [path\to\Frame.exe]
import { execFileSync, spawn } from 'node:child_process'
import { copyFileSync, existsSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import net from 'node:net'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const exe = resolve(process.argv[2] ?? join(root, 'release', 'win-unpacked', 'Frame.exe'))
// 12 seconds long, in a folder with Arabic in its name.
const clip = join(root, 'tests', 'fixtures', 'media', 'أفلام test', 'Test Pattern (2024).mkv')
const realData = join(process.env.APPDATA ?? '', 'Frame', 'frame.db')

/** Ends Frame and everything it started (the portable launcher runs the app as a child). */
function killTree(pid) {
  try {
    execFileSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' })
  } catch {
    // already gone
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const fail = (message) => {
  console.error(`smoke-test: FAILED — ${message}`)
  process.exitCode = 1
}

function processes(name) {
  const script = `Get-CimInstance Win32_Process -Filter "Name='${name}'" | ForEach-Object { "$($_.ProcessId)|$($_.ExecutablePath)|$($_.CommandLine)" }`
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
  })
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [pid, path, ...rest] = line.split('|')
      return { pid: Number(pid), path: path ?? '', commandLine: rest.join('|') }
    })
}

function mpvRequest(pipe, command) {
  return new Promise((resolveReply, reject) => {
    const socket = net.connect(pipe, () => socket.write(`${JSON.stringify({ command })}\n`))
    let buffer = ''
    socket.on('data', (chunk) => {
      buffer += chunk
      for (const line of buffer.split('\n')) {
        if (!line.trim()) continue
        const message = JSON.parse(line)
        if ('error' in message) {
          socket.end()
          return message.error === 'success'
            ? resolveReply(message.data)
            : reject(new Error(message.error))
        }
      }
    })
    socket.on('error', reject)
    setTimeout(() => reject(new Error('mpv did not answer')), 5000)
  })
}

if (!existsSync(exe)) throw new Error(`Not built: ${exe} (run npm run pack)`)
if (!existsSync(clip)) throw new Error('Test media missing (run npm run setup:test-media)')

const dataDir = mkdtempSync(join(tmpdir(), 'frame smoke '))
const realBefore = existsSync(realData) ? statSync(realData).mtimeMs : null
// The portable exe unpacks itself to a temporary folder and keeps data beside itself, so a
// copy is run from the temporary data folder.
const portable = /portable/i.test(basename(exe))
const launched = portable ? join(dataDir, basename(exe)) : exe
if (portable) copyFileSync(exe, launched)
const devMpv = join(root, 'resources', 'mpv', 'mpv.exe').toLowerCase()
const isBundledMpv = (path) =>
  portable
    ? path.toLowerCase().endsWith('\\resources\\mpv\\mpv.exe') && path.toLowerCase() !== devMpv
    : path.toLowerCase().startsWith(join(dirname(exe), 'resources').toLowerCase())

console.log(`smoke-test: launching ${launched}`)
const env = { ...process.env, PORTABLE_EXECUTABLE_DIR: dataDir }
// Development-only switches must have no effect on a packaged build.
env.FRAME_USER_DATA_DIR = join(dataDir, 'should-not-be-used')
env.ELECTRON_RENDERER_URL = 'http://127.0.0.1:9/'
const frame = spawn(launched, [clip], { env, stdio: ['ignore', 'ignore', 'pipe'] })
let log = ''
frame.stderr.on('data', (chunk) => (log += chunk))

try {
  let mpv
  for (let i = 0; i < 60 && !mpv; i++) {
    await sleep(500)
    mpv = processes('mpv.exe').find((p) => isBundledMpv(p.path))
  }
  if (!mpv) throw new Error('Frame did not start its bundled mpv')
  console.log(`smoke-test: bundled mpv running (${mpv.path})`)

  const pipe = /--input-ipc-server=(\S+)/.exec(mpv.commandLine)?.[1]
  if (!pipe) throw new Error('mpv pipe not found')
  let path = null
  for (let i = 0; i < 20 && !path; i++) {
    await sleep(500)
    path = await mpvRequest(pipe, ['get_property', 'path']).catch(() => null)
  }
  if (path !== clip) throw new Error(`mpv is not playing the test clip (path: ${path})`)
  const t1 = await mpvRequest(pipe, ['get_property', 'time-pos'])
  await sleep(1500)
  const t2 = await mpvRequest(pipe, ['get_property', 'time-pos'])
  if (!(typeof t1 === 'number' && typeof t2 === 'number' && t2 > t1)) {
    throw new Error(`playback is not advancing (${t1} -> ${t2})`)
  }
  console.log(
    `smoke-test: playing the clip from a Unicode folder, ${t1.toFixed(2)}s -> ${t2.toFixed(2)}s`,
  )

  if (!existsSync(join(dataDir, 'Frame Data', 'frame.db'))) {
    throw new Error('the database was not created in the portable data folder')
  }
  if (existsSync(join(dataDir, 'should-not-be-used'))) {
    throw new Error('FRAME_USER_DATA_DIR was honoured by a packaged build')
  }
  const realAfter = existsSync(realData) ? statSync(realData).mtimeMs : null
  if (realAfter !== realBefore) throw new Error('%APPDATA%\\Frame was modified')
  console.log('smoke-test: data stayed in the portable folder; %APPDATA%\\Frame untouched')

  // Both windows must have loaded from the app package (a dev-server URL would fail here).
  if (/could not load/.test(log)) throw new Error(`a window failed to load:\n${log}`)
  console.log('smoke-test: windows loaded from the package (no dev server)')

  killTree(frame.pid)
  for (let i = 0; i < 20; i++) {
    await sleep(500)
    if (!processes('mpv.exe').some((p) => p.pid === mpv.pid)) break
  }
  if (processes('mpv.exe').some((p) => p.pid === mpv.pid)) throw new Error('mpv kept running')
  console.log('smoke-test: mpv ended with Frame')
  console.log('smoke-test: PASSED')
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
} finally {
  killTree(frame.pid)
  await sleep(1000)
  rmSync(dataDir, { recursive: true, force: true })
}

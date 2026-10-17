import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { launchApp } from './launch-app'

const clip = join(
  resolve(__dirname, '../..'),
  'tests',
  'fixtures',
  'media',
  'أفلام test',
  'Test Pattern (2024).mkv',
)
test.skip(!existsSync(clip), 'Requires `npm run setup:mpv` and `npm run setup:test-media`')
test.skip(process.platform !== 'win32', 'Windows process checks')

let userDataDir: string

test.beforeEach(() => {
  userDataDir = mkdtempSync(join(tmpdir(), 'frame e2e '))
})

test.afterEach(() => {
  rmSync(userDataDir, { recursive: true, force: true })
})

/** mpv processes started by the Frame main process `pid` (their pipe name contains it). */
function mpvProcessesOf(pid: number): number[] {
  const script = `Get-CimInstance Win32_Process -Filter "Name='mpv.exe'" | Where-Object { $_.CommandLine -like '*frame-mpv-${pid}-*' } | ForEach-Object { $_.ProcessId }`
  const out = execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    {
      encoding: 'utf8',
    },
  )
  return out.split(/\s+/).filter(Boolean).map(Number)
}

async function overlayPage(app: ElectronApplication): Promise<Page> {
  const existing = app.windows().find((w) => w.url().endsWith('#/player'))
  return existing ?? app.waitForEvent('window', { predicate: (w) => w.url().endsWith('#/player') })
}

const status = (p: Page) => p.evaluate(() => window.frame.player.getState().then((s) => s.status))

test('mpv does not outlive Frame when Frame is killed', async () => {
  const app = await launchApp(userDataDir, [clip])
  const pid = await app.evaluate(() => process.pid)
  try {
    const player = await overlayPage(app)
    await expect.poll(() => status(player), { timeout: 15_000 }).toBe('ready')
    const mpv = mpvProcessesOf(pid)
    expect(mpv).toHaveLength(1)

    // A crash: the main process ends without any cleanup code running.
    process.kill(pid, 'SIGKILL')
    await expect.poll(() => mpvProcessesOf(pid), { timeout: 10_000 }).toEqual([])
  } finally {
    await app.close().catch(() => undefined)
  }
})

test('an mpv crash during playback is reported, and the next video plays', async () => {
  const app = await launchApp(userDataDir, [clip])
  try {
    const player = await overlayPage(app)
    await expect.poll(() => status(player), { timeout: 15_000 }).toBe('ready')
    const pid = await app.evaluate(() => process.pid)
    const [mpv] = mpvProcessesOf(pid)
    if (!mpv) throw new Error('mpv not found')
    process.kill(mpv)

    await expect(player.getByRole('alert')).toContainText('playback engine stopped unexpectedly')

    // Opening media again starts a fresh engine.
    const page = await app.firstWindow()
    await app.evaluate(({ dialog }, chosen) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [chosen] })) as never
    }, clip)
    await page.getByRole('button', { name: 'Open videos…' }).click()
    await expect.poll(() => status(player), { timeout: 15_000 }).toBe('ready')
    expect(mpvProcessesOf(pid)).toHaveLength(1)
  } finally {
    await app.close()
  }
})

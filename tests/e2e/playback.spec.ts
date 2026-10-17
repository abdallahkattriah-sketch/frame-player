import { expect, test, type Page } from '@playwright/test'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import koffi from 'koffi'
import { launchApp } from './launch-app'

const root = resolve(__dirname, '../..')
const mpvPath = join(root, 'resources', 'mpv', 'mpv.exe')
const mediaDir = join(root, 'tests', 'fixtures', 'media', 'أفلام test')
const unicodeClip = join(mediaDir, 'فيلم تجريبي 映画.mkv')

test.skip(
  !existsSync(mpvPath) || !existsSync(unicodeClip),
  'Requires `npm run setup:mpv` and `npm run setup:test-media`',
)

let userDataDir: string
test.beforeEach(() => {
  userDataDir = mkdtempSync(join(tmpdir(), 'frame e2e '))
})
test.afterEach(() => {
  rmSync(userDataDir, { recursive: true, force: true })
})

function powershell(command: string): string {
  return spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', command], {
    encoding: 'utf8',
  }).stdout.trim()
}

/** PIDs of mpv processes started from this repository's bundled binary. */
function frameMpvPids(): number[] {
  const out = powershell(
    `Get-Process mpv -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq '${mpvPath.replaceAll("'", "''")}' } | ForEach-Object { $_.Id }`,
  )
  return out ? out.split(/\s+/).map(Number) : []
}

function topChildIsMpv(hostHwnd: number): boolean {
  const user32 = koffi.load('user32.dll')
  const getWindow = user32.func('intptr_t __stdcall GetWindow(intptr_t hWnd, uint32_t uCmd)')
  const findWindowEx = user32.func(
    'intptr_t __stdcall FindWindowExW(intptr_t, intptr_t, const char16_t *, const char16_t *)',
  )
  const GW_CHILD = 5
  const mpvChild = findWindowEx(hostHwnd, 0, 'mpv', null) as number
  return mpvChild !== 0 && getWindow(hostHwnd, GW_CHILD) === mpvChild
}

async function overlayPage(app: Awaited<ReturnType<typeof launchApp>>): Promise<Page> {
  const existing = app.windows().find((w) => w.url().endsWith('#/player'))
  if (existing) return existing
  return app.waitForEvent('window', { predicate: (w) => w.url().endsWith('#/player') })
}

test('plays a local file with a Unicode path and cleans up mpv on exit', async () => {
  const app = await launchApp(userDataDir, [unicodeClip])
  let pids: number[] = []
  try {
    const overlay = await overlayPage(app)
    const playerUi = overlay.getByTestId('player-overlay')
    await expect(playerUi).toHaveAttribute('data-status', 'ready', { timeout: 15_000 })

    const state = await overlay.evaluate(() => window.frame.player.getState())
    expect(state.path).toBe(unicodeClip)
    expect(state.videoActive).toBe(true)
    expect(state.duration).toBeGreaterThan(5)

    // Position comes from mpv and must advance on its own.
    const t0 = state.position ?? 0
    await expect
      .poll(async () => (await overlay.evaluate(() => window.frame.player.getState())).position, {
        timeout: 5_000,
      })
      .toBeGreaterThan(t0 + 0.5)

    // Pause through the UI and confirm mpv reports it.
    await overlay.getByRole('button', { name: 'Pause' }).click()
    await expect
      .poll(async () => (await overlay.evaluate(() => window.frame.player.getState())).paused)
      .toBe(true)

    // Absolute seek.
    await overlay.evaluate(() =>
      window.frame.player.command({ type: 'seek', mode: 'absolute', seconds: 3 }),
    )
    await expect
      .poll(async () => (await overlay.evaluate(() => window.frame.player.getState())).position)
      .toBeCloseTo(3, 0)

    // mpv's video window must be the topmost child of the host, above Chromium's
    // compositor window; otherwise the video is hidden behind it.
    const hostHwnd = await app.evaluate(({ BaseWindow }) => {
      const host = BaseWindow.getAllWindows().find((w) => w.getTitle() === 'Frame Player')
      return host ? Number(host.getNativeWindowHandle().readBigUInt64LE(0)) : 0
    })
    expect(hostHwnd).toBeGreaterThan(0)
    expect(topChildIsMpv(hostHwnd)).toBe(true)

    pids = frameMpvPids()
    expect(pids.length).toBe(1)
  } finally {
    await app.close()
  }

  await expect.poll(() => frameMpvPids().filter((p) => pids.includes(p)).length).toBe(0)
})

test('shows a useful error for a file mpv cannot play', async () => {
  const bogus = join(userDataDir, 'not really a video.mkv')
  writeFileSync(bogus, 'this is text, not matroska')

  const app = await launchApp(userDataDir, [bogus])
  try {
    const overlay = await overlayPage(app)
    await expect(overlay.getByTestId('player-overlay')).toHaveAttribute('data-status', 'error', {
      timeout: 15_000,
    })
    await expect(overlay.getByRole('alert')).toContainText('Could not play this file')
  } finally {
    await app.close()
  }
})

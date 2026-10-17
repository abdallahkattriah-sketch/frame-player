import { expect, test, type Page } from '@playwright/test'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import type { PlayerCommand, PlayerState } from '../../src/shared/contracts/player'
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

const patternClip = join(mediaDir, 'Test Pattern (2024).mkv')

/** Polls the mpv-derived state until `predicate` holds. */
async function waitForState(
  overlay: Page,
  predicate: (s: PlayerState) => boolean,
  message: string,
): Promise<PlayerState> {
  let last: PlayerState | undefined
  await expect
    .poll(
      async () => {
        last = await overlay.evaluate(() => window.frame.player.getState())
        return predicate(last)
      },
      { message, timeout: 10_000 },
    )
    .toBe(true)
  return last as PlayerState
}

const command = (overlay: Page, cmd: PlayerCommand) =>
  overlay.evaluate((c) => window.frame.player.command(c), cmd)

test('player controls drive mpv: tracks, speed, delays, video options, playlist, screenshot', async () => {
  const app = await launchApp(userDataDir, [patternClip, unicodeClip])
  try {
    const overlay = await overlayPage(app)
    await expect(overlay.getByTestId('player-overlay')).toHaveAttribute('data-status', 'ready', {
      timeout: 15_000,
    })

    // Playlist from two command-line files.
    let state = await waitForState(overlay, (s) => s.playlist.length === 2, 'playlist of 2')
    expect(state.playlist[0]?.current).toBe(true)

    // External Arabic and English subtitles next to the clip are discovered by mpv.
    state = await waitForState(
      overlay,
      (s) => s.tracks.filter((t) => t.type === 'sub').length === 2,
      'two subtitle tracks',
    )
    const english = state.tracks.find((t) => t.type === 'sub' && t.lang === 'en')
    expect(english).toBeDefined()
    await command(overlay, { type: 'set-subtitle-track', id: english?.id ?? -1 })
    await waitForState(
      overlay,
      (s) => s.tracks.some((t) => t.type === 'sub' && t.lang === 'en' && t.selected),
      'English subtitles selected',
    )
    await command(overlay, { type: 'set-subtitle-track', id: 'none' })
    await waitForState(
      overlay,
      (s) => !s.tracks.some((t) => t.type === 'sub' && t.selected),
      'subtitles off',
    )

    await command(overlay, { type: 'set-speed', speed: 1.5 })
    await command(overlay, { type: 'set-subtitle-delay', seconds: 0.3 })
    await command(overlay, { type: 'set-audio-delay', seconds: -0.2 })
    await command(overlay, { type: 'set-aspect-ratio', aspect: '4:3' })
    await command(overlay, { type: 'set-scaling', scaling: 'fill' })
    await command(overlay, { type: 'set-repeat', repeat: 'all' })
    state = await waitForState(
      overlay,
      (s) =>
        s.speed === 1.5 &&
        Math.abs(s.subtitleDelay - 0.3) < 1e-6 &&
        Math.abs(s.audioDelay + 0.2) < 1e-6 &&
        s.aspectRatio === '4:3' &&
        s.scaling === 'fill' &&
        s.repeat === 'all',
      'speed, delays, aspect, scaling, repeat applied',
    )
    await command(overlay, { type: 'set-repeat', repeat: 'one' })
    await waitForState(overlay, (s) => s.repeat === 'one', 'repeat one')

    // Frame stepping while paused moves forward by roughly one frame.
    await command(overlay, { type: 'set-pause', paused: true })
    const before = (await waitForState(overlay, (s) => s.paused, 'paused')).position ?? 0
    await command(overlay, { type: 'frame-step', direction: 'forward' })
    await waitForState(
      overlay,
      (s) => (s.position ?? 0) > before && (s.position ?? 0) - before < 0.5,
      'one frame forward',
    )

    // Info panel reports what mpv measured.
    await overlay.keyboard.press('i')
    await expect(overlay.getByTestId('info-panel')).toContainText('1280 × 720')

    // Screenshot is a real PNG written to the (redirected) screenshot folder.
    const shot = await overlay.evaluate(() => window.frame.player.screenshot())
    expect(shot.path.startsWith(join(userDataDir, 'screenshots'))).toBe(true)
    await expect.poll(() => existsSync(shot.path)).toBe(true)
    expect(readFileSync(shot.path).subarray(1, 4).toString('ascii')).toBe('PNG')

    // Next / previous.
    await command(overlay, { type: 'playlist-next' })
    await waitForState(overlay, (s) => s.path === unicodeClip, 'second file playing')
    await command(overlay, { type: 'playlist-previous' })
    await waitForState(overlay, (s) => s.path === patternClip, 'back to first file')

    // Fullscreen is a window operation reported back through state.
    await command(overlay, { type: 'toggle-fullscreen' })
    await waitForState(overlay, (s) => s.fullscreen, 'fullscreen on')
    await command(overlay, { type: 'toggle-fullscreen' })
    await waitForState(overlay, (s) => !s.fullscreen, 'fullscreen off')
  } finally {
    await app.close()
  }
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

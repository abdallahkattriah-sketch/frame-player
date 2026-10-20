import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { PlayerState } from '../../src/shared/contracts/player'
import { launchApp } from './launch-app'

// Proof of concept: the player is shown inside the main window, over the area right of the
// sidebar, and follows that window. Uses the generated test media and the bundled mpv.

const root = resolve(__dirname, '../..')
const mpvPath = join(root, 'resources', 'mpv', 'mpv.exe')
const clip = join(root, 'tests', 'fixtures', 'media', 'أفلام test', 'Test Pattern (2024).mkv')

test.skip(
  !existsSync(mpvPath) || !existsSync(clip),
  'Requires `npm run setup:mpv` and `npm run setup:test-media`',
)

let userDataDir: string
test.beforeEach(() => {
  userDataDir = mkdtempSync(join(tmpdir(), 'frame e2e '))
})
test.afterEach(() => {
  rmSync(userDataDir, { recursive: true, force: true })
})

function frameMpvPids(): number[] {
  const out = spawnSync(
    'powershell',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Get-Process mpv -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq '${mpvPath.replaceAll("'", "''")}' } | ForEach-Object { $_.Id }`,
    ],
    { encoding: 'utf8' },
  ).stdout.trim()
  return out ? out.split(/\s+/).map(Number) : []
}

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** Bounds of the main window's content and of the player host, or null when it is closed. */
function geometry(app: ElectronApplication) {
  return app.evaluate(({ BaseWindow, BrowserWindow }) => {
    const main = BrowserWindow.getAllWindows().find(
      (w) => !w.webContents.getURL().endsWith('#/player'),
    )
    const host = BaseWindow.getAllWindows().find(
      (w) => w.getTitle() === 'Frame Player' && !w.isDestroyed(),
    )
    return {
      main: main?.getContentBounds() ?? null,
      host: host ? host.getBounds() : null,
      hostVisible: host ? host.isVisible() : false,
      ownedByMain: !!host && host.getParentWindow() === main,
      topLevelWindows: BaseWindow.getAllWindows().filter((w) => !w.getParentWindow()).length,
    }
  })
}

const inside = (inner: Rect, outer: Rect) =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width &&
  inner.y + inner.height <= outer.y + outer.height

async function overlayPage(app: ElectronApplication): Promise<Page> {
  const existing = app.windows().find((w) => w.url().endsWith('#/player'))
  if (existing) return existing
  return app.waitForEvent('window', { predicate: (w) => w.url().endsWith('#/player') })
}

const state = (overlay: Page): Promise<PlayerState> =>
  overlay.evaluate(() => window.frame.player.getState())

/** Opens a file the way Windows "Open with" does when Frame is already running. */
function openWith(app: ElectronApplication, path: string) {
  return app.evaluate(({ app: electronApp }, file) => {
    electronApp.emit('second-instance', {}, ['Frame.exe', file], process.cwd())
  }, path)
}

test('plays inside the main window, follows it, and closes back to the same view', async () => {
  // Opened at startup, before the page reported where the player goes.
  const app = await launchApp(userDataDir, [clip])
  let pids: number[] = []
  try {
    const page = await app.firstWindow()
    let overlay = await overlayPage(app)
    await expect(overlay.getByTestId('player-overlay')).toHaveAttribute('data-status', 'ready', {
      timeout: 15_000,
    })

    // One top-level window: the player is owned by the main window and lies inside it,
    // right of the sidebar and below the toolbar.
    let g = await geometry(app)
    expect(g.topLevelWindows).toBe(1)
    expect(g.ownedByMain).toBe(true)
    const { host, main } = g
    if (!host || !main) throw new Error('Player or main window missing')
    expect(inside(host, main)).toBe(true)
    expect(host.x).toBeGreaterThan(main.x + 150)
    expect(host.y).toBeGreaterThan(main.y + 20)

    // Playback, pause, and subtitles work as before.
    await expect.poll(async () => (await state(overlay)).position ?? 0).toBeGreaterThan(0.3)
    await overlay.getByRole('button', { name: 'Pause' }).click()
    await expect.poll(async () => (await state(overlay)).paused).toBe(true)
    expect((await state(overlay)).tracks.filter((t) => t.type === 'sub').length).toBeGreaterThan(0)

    // It follows the main window when moved and resized.
    await app.evaluate(({ BrowserWindow }) => {
      const main = BrowserWindow.getAllWindows().find(
        (w) => !w.webContents.getURL().endsWith('#/player'),
      )
      main?.setBounds({ x: 40, y: 40, width: 1100, height: 700 })
    })
    await expect
      .poll(async () => {
        const now = await geometry(app)
        return !!now.host && !!now.main && inside(now.host, now.main) && now.main.width < 1110
      })
      .toBe(true)
    g = await geometry(app)
    const before = g.host
    expect(before).not.toBeNull()

    // Minimized with the main window, and back when restored.
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()
        .find((w) => !w.webContents.getURL().endsWith('#/player'))
        ?.minimize()
    })
    await expect.poll(async () => (await geometry(app)).hostVisible).toBe(false)
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()
        .find((w) => !w.webContents.getURL().endsWith('#/player'))
        ?.restore()
    })
    await expect.poll(async () => (await geometry(app)).hostVisible).toBe(true)
    await expect.poll(async () => (await geometry(app)).host).toEqual(before)

    // Fullscreen fills the whole main window; leaving it returns to the area.
    await overlay.getByRole('button', { name: 'Fullscreen' }).click()
    await expect.poll(async () => (await state(overlay)).fullscreen).toBe(true)
    await expect
      .poll(async () => {
        const now = await geometry(app)
        return JSON.stringify(now.host) === JSON.stringify(now.main)
      })
      .toBe(true)
    // Escape leaves fullscreen (once the controls know they are fullscreen).
    await expect(overlay.getByRole('button', { name: 'Exit fullscreen' })).toBeVisible()
    await overlay.keyboard.press('Escape')
    await expect.poll(async () => (await state(overlay)).fullscreen).toBe(false)
    await expect.poll(async () => (await geometry(app)).host).toEqual(before)

    // Clicking the picture toggles pause; Escape outside fullscreen closes nothing.
    await overlay.mouse.move(400, 200)
    const surface = overlay.getByTestId('player-overlay')
    const box = await surface.boundingBox()
    if (!box) throw new Error('No player surface')
    await overlay.mouse.click(box.x + box.width / 2, box.y + box.height / 3)
    await expect.poll(async () => (await state(overlay)).paused).toBe(false)
    await overlay.mouse.click(box.x + box.width / 2, box.y + box.height / 3)
    await expect.poll(async () => (await state(overlay)).paused).toBe(true)
    await overlay.keyboard.press('Escape')
    await overlay.keyboard.press('Space')
    await expect.poll(async () => (await state(overlay)).paused).toBe(false)
    expect((await geometry(app)).host).not.toBeNull()

    // Using the main window tucks the player into the Now Playing bar; playback goes on.
    await expect(page.getByTestId('mini-player')).toHaveCount(0)
    await page.getByRole('button', { name: 'Radar' }).click({ force: true })
    await expect.poll(async () => (await geometry(app)).hostVisible).toBe(false)
    await expect(page.getByTestId('mini-player')).toBeVisible()
    expect((await state(overlay)).embedded).toBe('hidden')
    expect((await state(overlay)).paused).toBe(false)
    // A tucked-away player stays hidden when the window is minimized and restored.
    await app.evaluate(({ BrowserWindow }) => {
      const main = BrowserWindow.getAllWindows().find(
        (w) => !w.webContents.getURL().endsWith('#/player'),
      )
      main?.minimize()
      main?.restore()
    })
    await new Promise((r) => setTimeout(r, 500))
    expect((await geometry(app)).hostVisible).toBe(false)
    await page.getByRole('button', { name: 'Show player' }).click()
    await expect.poll(async () => (await geometry(app)).hostVisible).toBe(true)
    await expect.poll(async () => (await geometry(app)).host).toEqual(before)
    await expect(page.getByTestId('mini-player')).toHaveCount(0)
    await page.getByRole('button', { name: 'Home' }).click({ force: true })
    await page.getByRole('button', { name: 'Show player' }).click()
    await expect.poll(async () => (await geometry(app)).hostVisible).toBe(true)

    pids = frameMpvPids()
    expect(pids.length).toBe(1)

    // The close button ends playback, saves progress, and leaves the main window as it was.
    await overlay.getByTestId('player-close').click()
    await expect.poll(async () => (await geometry(app)).host).toBeNull()
    await expect.poll(() => frameMpvPids().filter((p) => pids.includes(p)).length).toBe(0)
    await expect(page.getByRole('button', { name: 'Home' })).toHaveAttribute('aria-current', 'page')

    // Opened again while running, from another view: closing returns to that view.
    await page.getByRole('button', { name: 'People' }).click()
    await expect(page.getByRole('heading', { name: 'Following' })).toBeVisible()
    await openWith(app, clip)
    overlay = await overlayPage(app)
    await expect(overlay.getByTestId('player-overlay')).toHaveAttribute('data-status', 'ready', {
      timeout: 15_000,
    })
    // Resumes where the last session stopped (progress was saved on close).
    expect((await geometry(app)).ownedByMain).toBe(true)
    await overlay.getByTestId('player-close').click()
    await expect.poll(async () => (await geometry(app)).host).toBeNull()
    await expect(page.getByRole('heading', { name: 'Following' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'People' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  } finally {
    await app.close()
  }
  await expect.poll(() => frameMpvPids().filter((p) => pids.includes(p)).length).toBe(0)
})

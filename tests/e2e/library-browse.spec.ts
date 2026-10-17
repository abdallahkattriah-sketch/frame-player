import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { PlayerState } from '../../src/shared/contracts/player'
import { launchApp } from './launch-app'

const fixtures = join(resolve(__dirname, '../..'), 'tests', 'fixtures', 'media', 'أفلام test')
const clip12s = join(fixtures, 'Test Pattern (2024).mkv')
const clip6s = join(fixtures, 'فيلم تجريبي 映画.mkv')

test.skip(
  !existsSync(clip12s) || !existsSync(clip6s),
  'Requires `npm run setup:mpv` and `npm run setup:test-media`',
)

let userDataDir: string
let mediaRoot: string

test.beforeEach(() => {
  userDataDir = mkdtempSync(join(tmpdir(), 'frame e2e '))
  mediaRoot = mkdtempSync(join(tmpdir(), 'frame library '))
  const place = (src: string, rel: string) => {
    const dest = join(mediaRoot, rel)
    mkdirSync(join(dest, '..'), { recursive: true })
    copyFileSync(src, dest)
  }
  place(clip12s, 'Movies/Test Pattern (2024).mkv')
  place(clip6s, 'TV/Demo Show/Season 1/Demo.Show.S01E01.mkv')
  place(clip6s, 'TV/Demo Show/Season 1/Demo.Show.S01E02.The.Second.mkv')
})

test.afterEach(() => {
  rmSync(userDataDir, { recursive: true, force: true })
  rmSync(mediaRoot, { recursive: true, force: true })
})

async function addLibraryFolder(app: ElectronApplication, page: Page) {
  await app.evaluate(({ dialog }, chosen) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [chosen] })) as never
  }, mediaRoot)
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'Add folder' }).click()
  await expect(page.getByTestId('library-folder-status')).toHaveText('3 videos')
}

async function overlay(app: ElectronApplication): Promise<Page> {
  const existing = app.windows().find((w) => w.url().endsWith('#/player'))
  return existing ?? app.waitForEvent('window', { predicate: (w) => w.url().endsWith('#/player') })
}

const playerState = (p: Page) => p.evaluate(() => window.frame.player.getState())

async function waitPlayer(p: Page, predicate: (s: PlayerState) => boolean, message: string) {
  await expect
    .poll(async () => predicate(await playerState(p)), { message, timeout: 15_000 })
    .toBe(true)
}

async function closePlayer(app: ElectronApplication) {
  await app.evaluate(({ BaseWindow }) => {
    BaseWindow.getAllWindows()
      .find((w) => w.getTitle() === 'Frame Player')
      ?.close()
  })
}

test('browse, play, remember progress, resume after restart, and manage items', async () => {
  let app = await launchApp(userDataDir)
  try {
    const page = await app.firstWindow()
    await addLibraryFolder(app, page)

    // Movies and shows are organized from file and folder names.
    await page.getByRole('button', { name: 'Movies' }).click()
    await expect(page.getByTestId('item-count')).toHaveText('1 item')
    await page.getByRole('button', { name: 'TV Shows' }).click()
    await expect(page.getByTestId('show-card')).toHaveCount(1)
    await page.getByRole('button', { name: 'Open Demo Show' }).click()
    await expect(page.getByTestId('item-count')).toHaveText('2 items')
    await expect(page.getByText('S01E02 · The Second')).toBeVisible()

    // Search jumps to library-wide results.
    await page.getByRole('button', { name: 'Home' }).click()
    await page.getByRole('searchbox', { name: 'Search library' }).fill('second')
    await expect(page.getByRole('heading', { name: 'Results for “second”' })).toBeVisible()
    await expect(page.getByTestId('item-count')).toHaveText('1 item')
    await page.getByRole('button', { name: 'Clear search' }).click()

    // Play the movie from the library; the main window shows a mini-player.
    await page.getByRole('button', { name: 'Movies' }).click()
    await page.getByRole('button', { name: 'Play Test Pattern' }).click()
    const player = await overlay(app)
    await waitPlayer(player, (s) => s.status === 'ready', 'movie playing')
    await expect(page.getByTestId('mini-player')).toContainText('Test Pattern (2024).mkv')

    // An exact seek while paused: playing fast and pausing later could overshoot past the
    // "watched" threshold of this 12-second clip, which removes it from Continue Watching.
    await player.evaluate(async () => {
      await window.frame.player.command({ type: 'set-pause', paused: true })
      await window.frame.player.command({ type: 'seek', mode: 'absolute', seconds: 7 })
    })
    await waitPlayer(
      player,
      (s) => s.paused && Math.abs((s.position ?? 0) - 7) < 0.5,
      'paused at 7 s',
    )
    const saved = (await playerState(player)).position ?? 0

    await closePlayer(app)
    await expect(page.getByTestId('mini-player')).toHaveCount(0)

    await page.getByRole('button', { name: 'Home' }).click()
    await expect(page.getByTestId('shelf-continue').getByTestId('media-card')).toHaveCount(1)

    app = await restart(app)
    const page2 = await app.firstWindow()
    const shelf = page2.getByTestId('shelf-continue')
    await expect(shelf.getByRole('progressbar', { name: 'Watched' })).toBeVisible()

    // Resume from the Continue Watching shelf.
    await shelf.getByRole('button', { name: 'Play Test Pattern' }).click()
    const player2 = await overlay(app)
    await waitPlayer(
      player2,
      (s) => s.status === 'ready' && (s.position ?? 0) >= saved - 1,
      `resumed near ${saved.toFixed(1)} s`,
    )
    await closePlayer(app)

    // Favorite, then mark as watched from the item menu.
    await page2.getByRole('button', { name: 'All Media' }).click()
    const actions = (title: string) =>
      page2.getByRole('button', { name: `More actions for ${title}` })
    await actions('Test Pattern').click()
    await page2.getByRole('menuitem', { name: 'Add to favorites' }).click()
    await page2.getByRole('button', { name: 'Favorites' }).click()
    await expect(page2.getByTestId('item-count')).toHaveText('1 item')

    await actions('Test Pattern').click()
    await page2.getByRole('menuitem', { name: 'Mark as watched' }).click()
    await page2.getByRole('button', { name: 'Home' }).click()
    await expect(page2.getByTestId('shelf-continue')).toHaveCount(0)
    await expect(page2.getByTestId('shelf-watched')).toBeVisible()
  } finally {
    await app.close()
  }
})

async function restart(app: ElectronApplication): Promise<ElectronApplication> {
  await app.close()
  return launchApp(userDataDir)
}

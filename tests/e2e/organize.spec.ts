import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchApp } from './launch-app'

let userDataDir: string
let mediaRoot: string

test.beforeEach(() => {
  userDataDir = mkdtempSync(join(tmpdir(), 'frame e2e '))
  mediaRoot = mkdtempSync(join(tmpdir(), 'frame organize مكتبة '))
  for (const name of ['Alpha.2001.mkv', 'Bravo.2002.mkv', 'Charlie.2003.mkv']) {
    mkdirSync(join(mediaRoot, 'Movies'), { recursive: true })
    writeFileSync(join(mediaRoot, 'Movies', name), 'not a real video')
  }
})

test.afterEach(() => {
  rmSync(userDataDir, { recursive: true, force: true })
  rmSync(mediaRoot, { recursive: true, force: true })
})

async function pickFolder(app: ElectronApplication, folder: string) {
  await app.evaluate(({ dialog }, chosen) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [chosen] })) as never
  }, folder)
}

const cssVar = (page: Page, name: string) =>
  page.evaluate(
    (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim().toUpperCase(),
    name,
  )

test('first-run setup: every step optional, remembered, and available again', async () => {
  let app = await launchApp(userDataDir, [], { FRAME_SKIP_SETUP: '' })
  try {
    let page = await app.firstWindow()
    const wizard = page.getByRole('dialog', { name: 'Set up Frame' })
    await expect(wizard).toBeVisible()
    await wizard.getByRole('button', { name: 'Start' }).click()

    // Library
    await pickFolder(app, mediaRoot)
    await wizard.getByRole('button', { name: 'Add folder…' }).click()
    await expect(wizard.getByTestId('setup-folders')).toContainText('frame organize')
    await wizard.getByRole('button', { name: 'Next' }).click()
    // TMDB: skipped
    await expect(wizard.getByRole('heading', { name: /TMDB/ })).toBeVisible()
    await wizard.getByRole('button', { name: 'Next' }).click()
    // Subtitles: add French
    await wizard.getByLabel('Add subtitle language').selectOption('fr')
    await expect(wizard).toContainText('French')
    await wizard.getByRole('button', { name: 'Next' }).click()
    // Theme
    await wizard.getByRole('button', { name: 'Daylight' }).click()
    await expect.poll(() => cssVar(page, '--frame-bg')).toBe('#F6F5F2')
    await wizard.getByRole('button', { name: 'Finish' }).click()
    await expect(wizard).toHaveCount(0)

    const saved = await page.evaluate(() => window.frame.settings.get())
    expect(saved.general.setupComplete).toBe(true)
    expect(saved.subtitles.preferredLanguages).toEqual(['en', 'fr'])
    await page.getByRole('button', { name: 'Movies' }).click()
    await expect(page.getByTestId('item-count')).toHaveText('3 items')
    await app.close()

    // Not shown again, but available from Settings.
    app = await launchApp(userDataDir, [], { FRAME_SKIP_SETUP: '' })
    page = await app.firstWindow()
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Set up Frame' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Run first-time setup again' }).click()
    await page
      .getByRole('dialog', { name: 'Set up Frame' })
      .getByRole('button', { name: 'Skip setup' })
      .click()
    await expect(page.getByRole('dialog', { name: 'Set up Frame' })).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('collections and playlists: create, add, reorder, rename, delete without touching files', async () => {
  const app = await launchApp(userDataDir)
  try {
    const page = await app.firstWindow()
    await pickFolder(app, mediaRoot)
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await page.getByRole('button', { name: 'Add folder' }).click()
    await expect(page.getByTestId('library-folder-status')).toHaveText('3 videos')

    // A name is required; then a playlist is created and opened.
    await page.getByRole('button', { name: 'New collection' }).click()
    const create = page.getByRole('dialog', { name: 'New collection' })
    await create.getByRole('button', { name: 'Create' }).click()
    await expect(create.getByRole('alert')).toHaveText('Enter a name')
    await create.getByLabel('Name').fill('Weekend')
    await create.getByLabel('Playlist (plays in order)').check()
    await create.getByRole('button', { name: 'Create' }).click()
    await expect(page.getByRole('heading', { name: 'Weekend' })).toBeVisible()

    // Add two movies from the library.
    await page.getByRole('button', { name: 'Movies', exact: true }).click()

    // Right-clicking a poster opens the full menu at the pointer, not clipped by the poster.
    const card = page.getByRole('button', { name: 'Play Bravo' })
    // (The list may re-render while the scan finishes; click() waits for a stable card.)
    await card.click({ button: 'right', position: { x: 60, y: 40 } })
    const items = page.getByRole('menu', { name: 'Actions for Bravo' }).getByRole('menuitem')
    await expect(items.first()).toBeVisible()
    const box = await card.boundingBox()
    if (!box) throw new Error('no card')
    const last = items.last()
    const lastBox = await last.boundingBox()
    if (!lastBox) throw new Error('no menu item')
    expect(lastBox.y + lastBox.height).toBeGreaterThan(box.y + box.height * 0.6) // extends past the poster area
    expect(
      await last.evaluate((el) => {
        const r = el.getBoundingClientRect()
        return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2))
      }),
    ).toBe(true)
    await page.keyboard.press('Escape')
    await expect(items).toHaveCount(0)
    for (const title of ['Charlie', 'Alpha']) {
      await page.getByRole('button', { name: `More actions for ${title}` }).click()
      await page.getByRole('menuitem', { name: 'Add to collection…' }).click()
      await page
        .getByRole('dialog', { name: 'Add to collection' })
        .getByRole('button', { name: /Weekend/ })
        .click()
      await expect(page.getByRole('dialog', { name: 'Add to collection' })).toHaveCount(0)
    }
    const nav = page.getByRole('list', { name: 'Collections' })
    await expect(nav).toContainText('Weekend2')

    // Playlist order is the order they were added; it can be changed.
    await nav.getByRole('button', { name: /Weekend/ }).click()
    const rows = page.getByTestId('media-row')
    await expect(rows).toHaveCount(2)
    await expect(rows.nth(0)).toContainText('Charlie')
    await page.getByRole('button', { name: 'More actions for Alpha' }).click()
    await page.getByRole('menuitem', { name: 'Move up' }).click()
    await expect(rows.nth(0)).toContainText('Alpha')
    await expect(rows.nth(1)).toContainText('Charlie')

    await page.getByRole('button', { name: 'Rename' }).click()
    const rename = page.getByRole('dialog', { name: 'Rename playlist' })
    await rename.getByLabel('Name').fill('Weekend picks')
    await rename.getByRole('button', { name: 'Rename' }).click()
    await expect(page.getByRole('heading', { name: 'Weekend picks' })).toBeVisible()

    await page.getByRole('button', { name: 'More actions for Charlie' }).click()
    await page.getByRole('menuitem', { name: 'Remove from Weekend picks' }).click()
    await expect(rows).toHaveCount(1)

    await page.getByRole('button', { name: 'Delete' }).click()
    const confirm = page.getByRole('dialog', { name: 'Delete “Weekend picks”?' })
    await expect(confirm).toContainText('The videos stay in your library')
    await confirm.getByRole('button', { name: 'Delete' }).click()
    await expect(nav).not.toContainText('Weekend')
    await page.getByRole('button', { name: 'Movies', exact: true }).click()
    await expect(page.getByTestId('item-count')).toHaveText('3 items')
    expect(existsSync(join(mediaRoot, 'Movies', 'Charlie.2003.mkv'))).toBe(true)
  } finally {
    await app.close()
  }
})

test('settings: storage, privacy, audio, and reset with confirmation', async () => {
  const app = await launchApp(userDataDir)
  try {
    const page = await app.firstWindow()
    await page.getByRole('button', { name: 'Settings', exact: true }).click()

    // Section index scrolls to sections.
    await page
      .getByRole('navigation', { name: 'Settings sections' })
      .getByRole('button', { name: 'Privacy' })
      .click()
    await expect(page.getByRole('heading', { name: 'Privacy' })).toBeInViewport()

    // Storage: sizes, backup, cache clearing behind a confirmation.
    await expect(page.getByTestId('storage-info')).toContainText('Library database')
    await page.getByRole('button', { name: 'Back up database now' }).click()
    await expect(page.getByTestId('storage-message')).toContainText('Backup saved')
    await page.getByRole('button', { name: 'Clear timeline previews…' }).click()
    const clear = page.getByRole('dialog', { name: 'Clear timeline previews?' })
    await clear.getByRole('button', { name: 'Clear' }).click()
    await expect(page.getByTestId('storage-message')).toHaveText('Cleared.')

    // Privacy toggles stay in sync with the Subtitles section.
    await page.getByLabel('Search for subtitles online').uncheck()
    await expect(
      page.getByLabel('Search subtitles online (contacts the providers below)'),
    ).not.toBeChecked()

    // Audio preferences.
    await page.getByLabel('Add preferred audio language').selectOption('ar')
    await page.getByLabel('Even out loudness (quiet dialogue louder, loud scenes softer)').check()
    await page.getByRole('button', { name: 'Use theme OLED Black' }).click()
    await expect
      .poll(() => page.evaluate(() => window.frame.settings.get().then((s) => s.audio)))
      .toEqual({ preferredLanguages: ['ar'], normalizeLoudness: true })

    // Reset asks first, then restores defaults (and does not reopen setup).
    await page.getByRole('button', { name: 'Reset all settings…' }).click()
    const reset = page.getByRole('dialog', { name: 'Reset all settings?' })
    await expect(reset).toContainText('saved API keys are kept')
    await reset.getByRole('button', { name: 'Reset settings' }).click()
    await expect.poll(() => cssVar(page, '--frame-bg')).toBe('#14161B')
    const after = await page.evaluate(() => window.frame.settings.get())
    expect(after.audio).toEqual({ preferredLanguages: [], normalizeLoudness: false })
    expect(after.privacy.onlineSubtitlesEnabled).toBe(true)
    expect(after.general.setupComplete).toBe(true)
    await expect(page.getByLabel('Search for subtitles online')).toBeChecked()
    await expect(page.getByRole('dialog', { name: 'Set up Frame' })).toHaveCount(0)
  } finally {
    await app.close()
  }
})

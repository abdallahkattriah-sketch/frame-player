import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

let userDataDir: string
let filesDir: string

test.beforeEach(() => {
  userDataDir = mkdtempSync(join(tmpdir(), 'frame e2e '))
  filesDir = mkdtempSync(join(tmpdir(), 'frame files ملفات '))
})

test.afterEach(() => {
  rmSync(userDataDir, { recursive: true, force: true })
  rmSync(filesDir, { recursive: true, force: true })
})

const cssVar = (page: Page, name: string) =>
  page.evaluate(
    (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim().toUpperCase(),
    name,
  )

async function stubDialogs(app: ElectronApplication, openPath: string, savePath: string) {
  await app.evaluate(
    ({ dialog }, paths) => {
      dialog.showOpenDialog = (async () => ({
        canceled: false,
        filePaths: [paths.open],
      })) as never
      dialog.showSaveDialog = (async () => ({ canceled: false, filePath: paths.save })) as never
    },
    { open: openPath, save: savePath },
  )
}

test('Theme Studio: switch, customize with validation, export and import safely', async () => {
  const app = await launchApp(userDataDir)
  try {
    const page = await app.firstWindow()
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    expect(await cssVar(page, '--frame-bg')).toBe('#14161B') // Midnight Cinema by default

    await page.getByRole('button', { name: 'Use theme Daylight' }).click()
    await expect.poll(() => cssVar(page, '--frame-bg')).toBe('#F6F5F2')

    await page.getByRole('button', { name: 'Customize a copy' }).click()
    const bgHex = page.getByLabel('Background hex')
    await bgHex.fill('#12')
    await expect(bgHex).toHaveAttribute('aria-invalid', 'true')
    await expect.poll(() => cssVar(page, '--frame-bg')).toBe('#F6F5F2') // invalid: not applied
    await bgHex.fill('#203040')
    await expect.poll(() => cssVar(page, '--frame-bg')).toBe('#203040')
    // Dark background with Daylight's dark text: contrast warnings appear.
    await expect(page.getByRole('alert').filter({ hasText: 'hard to read' })).toContainText(
      'Text on background',
    )

    // Export writes a data-only theme file.
    const exported = join(filesDir, 'exported.json')
    await stubDialogs(app, exported, exported)
    await page.getByRole('button', { name: 'Export theme…' }).click()
    await expect(page.getByTestId('theme-message')).toContainText('Exported')
    const file = JSON.parse(readFileSync(exported, 'utf8')) as Record<string, unknown>
    expect(file).toMatchObject({ format: 'frame-theme', version: 1, colors: { bg: '#203040' } })

    // A theme file with anything but colors is rejected, and nothing changes.
    const unsafe = join(filesDir, 'unsafe.json')
    writeFileSync(unsafe, JSON.stringify({ ...file, css: 'body { display: none }' }))
    await stubDialogs(app, unsafe, exported)
    await page.getByRole('button', { name: 'Import theme…' }).click()
    await expect(page.getByTestId('theme-message')).toContainText('Not a valid Frame theme')

    const good = join(filesDir, 'good.json')
    writeFileSync(
      good,
      JSON.stringify({
        ...file,
        name: 'Imported Teal',
        colors: { ...(file['colors'] as object), accent: '#2BB3A3' },
      }),
    )
    await stubDialogs(app, good, exported)
    await page.getByRole('button', { name: 'Import theme…' }).click()
    await expect(page.getByTestId('theme-message')).toContainText('Imported “Imported Teal”')
    await expect.poll(() => cssVar(page, '--frame-accent')).toBe('#2BB3A3')
    await expect(page.getByRole('button', { name: 'Use theme Imported Teal' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  } finally {
    await app.close()
  }
})

test('shortcuts: edit with conflict detection, palettes in both windows, theme everywhere', async () => {
  test.skip(!existsSync(clip), 'Requires `npm run setup:mpv` and `npm run setup:test-media`')
  const video = join(filesDir, 'clip.mkv')
  copyFileSync(clip, video)
  let app = await launchApp(userDataDir)
  try {
    const page = await app.firstWindow()
    await page.getByRole('button', { name: 'Settings', exact: true }).click()

    // Give Mute the S key: it belongs to Screenshot, so Frame asks first.
    await page.getByRole('button', { name: 'Add shortcut for Mute' }).click()
    await page.keyboard.press('s')
    const mute = page.getByTestId('shortcut-mute')
    await expect(
      page.getByRole('alert').filter({ hasText: 'already used by Screenshot' }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Replace' }).click()
    await expect(mute).toContainText('S')
    await expect(page.getByTestId('shortcut-screenshot')).not.toContainText(/\bS\b/)
    await page.getByRole('button', { name: 'Use theme Slate Blue' }).click()
    await expect.poll(() => cssVar(page, '--frame-bg')).toBe('#161B24')

    // Export, reset, and import the shortcuts back.
    const shortcuts = join(filesDir, 'shortcuts.json')
    await stubDialogs(app, shortcuts, shortcuts)
    await page.getByRole('button', { name: 'Export…', exact: true }).click()
    await expect(page.getByTestId('shortcut-message')).toHaveText('Shortcuts exported.')
    await page.getByRole('button', { name: 'Reset all' }).click()
    await expect(page.getByTestId('shortcut-screenshot')).toContainText('S')
    await page.getByRole('button', { name: 'Import…', exact: true }).click()
    await expect(page.getByTestId('shortcut-message')).toHaveText('Shortcuts imported.')
    await expect(mute).toContainText('S')

    // Main-window palette: Ctrl+K, search, Enter.
    await page.keyboard.press('Control+k')
    const palette = page.getByRole('dialog', { name: 'Command palette' })
    await palette.getByRole('combobox').fill('tv shows')
    await palette.getByRole('combobox').press('Enter')
    await expect(palette).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'TV Shows' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    // Typing in a text field is never taken over by shortcuts.
    await page.getByRole('searchbox', { name: 'Search library' }).fill('k s m')
    await expect(page.getByRole('dialog', { name: 'Command palette' })).toHaveCount(0)
    await app.close()

    // After a restart: the player uses the edited shortcut and the chosen theme.
    app = await launchApp(userDataDir, [video])
    const player =
      app.windows().find((w) => w.url().endsWith('#/player')) ??
      (await app.waitForEvent('window', { predicate: (w) => w.url().endsWith('#/player') }))
    await expect
      .poll(() => player.evaluate(() => window.frame.player.getState().then((s) => s.status)), {
        timeout: 15_000,
      })
      .toBe('ready')
    expect(await cssVar(player, '--frame-bg')).toBe('#161B24')
    await player.locator('body').click({ position: { x: 20, y: 20 } })
    await player.keyboard.press('s')
    await expect
      .poll(() => player.evaluate(() => window.frame.player.getState().then((s) => s.muted)))
      .toBe(true)

    // Player palette runs player actions.
    await player.keyboard.press('Control+k')
    const playerPalette = player.getByRole('dialog', { name: 'Command palette' })
    await playerPalette.getByRole('combobox').fill('bookmarks')
    await playerPalette.getByRole('combobox').press('Enter')
    await expect(player.getByRole('complementary', { name: 'Bookmarks' })).toBeVisible()

    // Ctrl+, in the player opens Settings in the main window.
    await player.keyboard.press('Control+,')
    const main = await app.firstWindow()
    await expect(main.getByRole('button', { name: 'Settings', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    )
  } finally {
    await app.close()
  }
})

import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { PlayerState } from '../../src/shared/contracts/player'
import { launchApp } from './launch-app'
import { OS_KEY, SS_KEY, startSubtitleMock, type SubtitleMock } from './subtitle-mock'

// Mocked providers on a local server; no real OpenSubtitles or SubSource request is made.

const clip = join(
  resolve(__dirname, '../..'),
  'tests',
  'fixtures',
  'media',
  'أفلام test',
  'Test Pattern (2024).mkv',
)
test.skip(!existsSync(clip), 'Requires `npm run setup:mpv` and `npm run setup:test-media`')

let userDataDir: string
let videoDir: string
let video: string
let mock: SubtitleMock

test.beforeEach(async () => {
  userDataDir = mkdtempSync(join(tmpdir(), 'frame e2e '))
  videoDir = mkdtempSync(join(tmpdir(), 'frame subs ترجمة '))
  video = join(videoDir, 'Test.Pattern.2024.720p.mkv')
  copyFileSync(clip, video)
  // A local English subtitle that should be picked up automatically.
  writeFileSync(
    join(videoDir, 'Test.Pattern.2024.720p.en.srt'),
    '1\n00:00:00,500 --> 00:00:05,000\nLocal English\n',
  )
  mock = await startSubtitleMock()
})

test.afterEach(async () => {
  await mock.close()
  rmSync(userDataDir, { recursive: true, force: true })
  rmSync(videoDir, { recursive: true, force: true })
})

async function overlayPage(app: ElectronApplication): Promise<Page> {
  const existing = app.windows().find((w) => w.url().endsWith('#/player'))
  return existing ?? app.waitForEvent('window', { predicate: (w) => w.url().endsWith('#/player') })
}

async function waitState(p: Page, predicate: (s: PlayerState) => boolean, message: string) {
  await expect
    .poll(async () => predicate(await p.evaluate(() => window.frame.player.getState())), {
      message,
      timeout: 15_000,
    })
    .toBe(true)
}

test('local discovery, provider setup, search with one failing provider, safe download into the player', async () => {
  const app = await launchApp(userDataDir, [], {
    FRAME_OPENSUBTITLES_ORIGIN: mock.origin,
    FRAME_SUBSOURCE_ORIGIN: `${mock.origin}/ss`,
  })
  try {
    const page = await app.firstWindow()
    await page.getByRole('button', { name: 'Settings', exact: true }).click()

    // Provider keys are stored encrypted; Test reports real results from the (mock) API.
    const os = page.getByTestId('provider-opensubtitles')
    await os.getByLabel('API key', { exact: true }).fill(OS_KEY)
    await os.getByRole('button', { name: 'Save OpenSubtitles api key' }).click()
    await os.getByRole('button', { name: 'Test' }).click()
    await expect(page.getByTestId('provider-status-opensubtitles')).toContainText(
      'API key accepted',
    )

    const ss = page.getByTestId('provider-subsource')
    await ss.getByLabel('API key', { exact: true }).fill(SS_KEY)
    await ss.getByRole('button', { name: 'Save SubSource api key' }).click()
    expect(readFileSync(join(userDataDir, 'credentials.json'), 'utf8')).not.toContain(OS_KEY)

    // Prefer Arabic, then English.
    await page.getByLabel('Add preferred language').selectOption('ar')
    await page.getByRole('button', { name: 'Move Arabic up' }).click()

    // Play: the local English file is found and, with no Arabic file present, selected.
    await page.evaluate(() => undefined)
    await app.evaluate(({ dialog }, chosen) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [chosen] })) as never
    }, video)
    await page.getByRole('button', { name: 'Home' }).click()
    await page.getByRole('button', { name: 'Open videos…' }).click()
    const player = await overlayPage(app)
    await waitState(
      player,
      (s) =>
        s.status === 'ready' &&
        s.tracks.some((t) => t.type === 'sub' && t.lang === 'en' && t.selected),
      'local English subtitle loaded and selected',
    )

    // Search online from the player.
    await player.getByRole('button', { name: 'Audio and subtitles' }).click()
    await player.getByRole('button', { name: 'Search online…' }).click()
    const dialog = player.getByRole('dialog', { name: 'Find subtitles' })
    await dialog.getByRole('button', { name: 'Search', exact: true }).click()

    await expect(dialog.getByTestId('subtitle-result')).toHaveCount(1)
    await expect(dialog.getByTestId('subtitle-result')).toContainText('Test.Pattern.2024.720p')
    await expect(dialog.getByTestId('subtitle-result')).toContainText('321 downloads')
    await expect(dialog.getByTestId('provider-error')).toContainText('SubSource')
    await dialog.getByText('What was sent').click()
    await expect(dialog.getByText(/OpenSubtitles: languages=ar,en/)).toBeVisible()

    await dialog
      .getByRole('button', { name: /^Download Arabic subtitle from OpenSubtitles/ })
      .click()
    const saved = join(videoDir, 'Test.Pattern.2024.720p.ar.srt')
    await expect(dialog.getByTestId('subtitle-notice')).toContainText('loaded it into the player')
    // Converted from Windows-1256 to UTF-8.
    expect(readFileSync(saved, 'utf8')).toContain('مرحبا بكم')
    await waitState(
      player,
      (s) => s.tracks.some((t) => t.type === 'sub' && t.lang === 'ar' && t.selected && t.external),
      'downloaded Arabic subtitle selected',
    )

    // Downloading again asks before replacing; cancelling keeps the user's file.
    writeFileSync(saved, 'my edits')
    await dialog
      .getByRole('button', { name: /^Download Arabic subtitle from OpenSubtitles/ })
      .click()
    const confirm = player.getByRole('dialog', { name: 'Replace existing subtitle?' })
    await expect(confirm).toBeVisible()
    await confirm.getByRole('button', { name: 'Cancel' }).click()
    expect(readFileSync(saved, 'utf8')).toBe('my edits')

    // Every OpenSubtitles API request carried the key and a descriptive User-Agent.
    const apiCalls = mock.requests.filter((r) => r.path.startsWith('/api/v1/'))
    expect(apiCalls.length).toBeGreaterThan(0)
    expect(
      apiCalls.every(
        (r) =>
          r.headers['api-key'] === OS_KEY && /^Frame v\d/.test(String(r.headers['user-agent'])),
      ),
    ).toBe(true)
  } finally {
    await app.close()
  }
})

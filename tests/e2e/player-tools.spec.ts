import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { PlayerState } from '../../src/shared/contracts/player'
import { launchApp } from './launch-app'

const fixtures = join(resolve(__dirname, '../..'), 'tests', 'fixtures', 'media', 'أفلام test')
const clip = join(fixtures, 'Test Pattern (2024).mkv')
test.skip(!existsSync(clip), 'Requires `npm run setup:mpv` and `npm run setup:test-media`')

let userDataDir: string
let videoDir: string
let video: string
let subtitle: string

test.beforeEach(() => {
  userDataDir = mkdtempSync(join(tmpdir(), 'frame e2e '))
  videoDir = mkdtempSync(join(tmpdir(), 'frame tools أدوات '))
  video = join(videoDir, 'Test Pattern (2024).mkv')
  subtitle = join(videoDir, 'Test Pattern (2024).en.srt')
  copyFileSync(clip, video)
  copyFileSync(join(fixtures, 'Test Pattern (2024).en.srt'), subtitle)
})

test.afterEach(() => {
  rmSync(userDataDir, { recursive: true, force: true })
  rmSync(videoDir, { recursive: true, force: true })
})

async function overlayPage(app: ElectronApplication): Promise<Page> {
  const existing = app.windows().find((w) => w.url().endsWith('#/player'))
  return existing ?? app.waitForEvent('window', { predicate: (w) => w.url().endsWith('#/player') })
}

async function readyAndPausedAt(player: Page, seconds: number) {
  await expect
    .poll(() => player.evaluate(() => window.frame.player.getState().then((s) => s.status)), {
      timeout: 15_000,
    })
    .toBe('ready')
  await player.evaluate(async (at) => {
    await window.frame.player.command({ type: 'set-pause', paused: true })
    await window.frame.player.command({ type: 'seek', mode: 'absolute', seconds: at })
  }, seconds)
  await expect
    .poll(() =>
      player.evaluate(() => window.frame.player.getState().then((s: PlayerState) => s.position)),
    )
    .toBeCloseTo(seconds, 0)
}

const imageLoaded = (img: ReturnType<Page['getByTestId']>) =>
  img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)

test('timeline previews and bookmarks that survive a restart', async () => {
  let app = await launchApp(userDataDir, [video])
  try {
    let player = await overlayPage(app)
    await readyAndPausedAt(player, 6)

    // Hovering the timeline shows the time and a generated preview frame.
    const seek = player.getByRole('slider', { name: 'Seek' })
    const box = await seek.boundingBox()
    if (!box) throw new Error('no seek bar')
    await player.mouse.move(box.x + box.width * 0.75, box.y + box.height / 2)
    await expect(player.getByTestId('timeline-hover')).toContainText('0:0')
    await expect
      .poll(() => imageLoaded(player.getByTestId('timeline-preview')), {
        timeout: 15_000,
      })
      .toBe(true)
    await player.mouse.move(box.x + box.width / 2, box.y - 200)

    // B bookmarks the current moment; the panel lists it with a thumbnail.
    await player.locator('body').click({ position: { x: 20, y: 20 } })
    await player.keyboard.press('b')
    await expect(player.getByRole('status')).toContainText('Bookmark added at 0:06')
    await expect(player.getByTestId('bookmark-marker')).toHaveCount(1)
    await player.getByRole('button', { name: 'Bookmarks', exact: true }).click()
    const panel = player.getByRole('complementary', { name: 'Bookmarks' })
    await expect(panel.getByTestId('bookmark-list').locator('li')).toHaveCount(1)
    await expect.poll(() => imageLoaded(panel.locator('img')), { timeout: 15_000 }).toBe(true)

    await panel.getByRole('button', { name: /^Edit Bookmark at 0:06/ }).click()
    await panel.getByLabel('Bookmark title').fill('Colour bars')
    await panel.getByLabel('Bookmark note').fill('Check the gradient')
    await panel.getByRole('button', { name: 'Save' }).click()
    await expect(panel).toContainText('Check the gradient')

    // Clicking the bookmark seeks back to it.
    await player.evaluate(() =>
      window.frame.player.command({ type: 'seek', mode: 'absolute', seconds: 1 }),
    )
    await panel.getByRole('button', { name: /^Go to Colour bars/ }).click()
    await expect
      .poll(() => player.evaluate(() => window.frame.player.getState().then((s) => s.position)))
      .toBeCloseTo(6, 0)
    await app.close()

    // After a restart, the bookmark is still there for the same file.
    app = await launchApp(userDataDir, [video])
    player = await overlayPage(app)
    await readyAndPausedAt(player, 2)
    await player.getByRole('button', { name: 'Bookmarks', exact: true }).click()
    await expect(player.getByRole('complementary', { name: 'Bookmarks' })).toContainText(
      'Colour bars',
    )
    await player.getByRole('button', { name: /^Delete Colour bars/ }).click()
    await expect(player.getByTestId('bookmark-marker')).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('subtitle studio applies profiles without touching subtitle files', async () => {
  const before = readFileSync(subtitle)
  const app = await launchApp(userDataDir, [video])
  try {
    const player = await overlayPage(app)
    await readyAndPausedAt(player, 2)

    await player.getByRole('button', { name: 'Audio and subtitles' }).click()
    await player.getByRole('button', { name: 'Subtitle style…' }).click()
    const panel = player.getByRole('complementary', { name: 'Subtitle style' })
    await panel.getByLabel('Subtitle profile').selectOption({ label: 'High contrast' })
    await expect(panel.getByLabel('Background')).toHaveValue('box')
    await panel.getByRole('slider', { name: 'Font size' }).fill('60')
    await expect
      .poll(() =>
        player.evaluate(() =>
          window.frame.settings.get().then((s) => ({
            active: s.subtitleStyle.activeProfileId,
            size: s.subtitleStyle.profiles.find((p) => p.id === 'high-contrast')?.style.fontSize,
          })),
        ),
      )
      .toEqual({ active: 'high-contrast', size: 60 })

    // Reset returns the built-in profile to its shipped style.
    await panel.getByRole('button', { name: 'Reset profile to defaults' }).click()
    await expect(panel.getByRole('slider', { name: 'Font size' })).toHaveValue('44')

    // Settings shows the same profiles with a preview; the player keeps playing normally.
    const main = await app.firstWindow()
    await main.getByRole('button', { name: 'Settings', exact: true }).click()
    await expect(main.getByTestId('subtitle-preview')).toBeVisible()
    await expect(main.getByLabel('Subtitle profile')).toHaveValue('high-contrast')

    // Turning off timeline previews stops generating them.
    await main.getByLabel('Show preview images when hovering the timeline').uncheck()
    await expect.poll(() => player.evaluate(() => window.frame.player.previewAt(3))).toBeNull()

    expect(await player.evaluate(() => window.frame.player.getState().then((s) => s.status))).toBe(
      'ready',
    )
    expect(readFileSync(subtitle).equals(before)).toBe(true)
  } finally {
    await app.close()
  }
})

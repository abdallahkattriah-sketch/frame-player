import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchApp } from './launch-app'

let userDataDir: string
let mediaRoot: string

test.beforeEach(() => {
  userDataDir = mkdtempSync(join(tmpdir(), 'frame e2e '))
  mediaRoot = mkdtempSync(join(tmpdir(), 'frame library مكتبة '))
  for (const rel of [
    'Movies/The.Matrix.1999.mkv',
    'Movies/Amélie (2001).mp4',
    'TV/Show/Season 1/S01E01.mkv',
  ]) {
    const full = join(mediaRoot, rel)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, 'not a real video')
  }
})

test.afterEach(() => {
  rmSync(userDataDir, { recursive: true, force: true })
  rmSync(mediaRoot, { recursive: true, force: true })
})

/** Native dialogs cannot be driven by tests; answer the next folder picker with `path`. */
async function stubFolderPicker(app: ElectronApplication, path: string) {
  await app.evaluate(({ dialog }, chosen) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [chosen] })) as never
  }, path)
}

async function openSettings(page: Page) {
  await page.getByRole('button', { name: 'Settings' }).click()
  await expect(page.getByRole('heading', { name: 'Library folders' })).toBeVisible()
}

test('add, scan, detect missing files, persist, and remove a library folder', async () => {
  let app = await launchApp(userDataDir)
  try {
    const page = await app.firstWindow()
    await openSettings(page)
    await stubFolderPicker(app, mediaRoot)
    await page.getByRole('button', { name: 'Add folder' }).click()

    const status = page.getByTestId('library-folder-status')
    await expect(status).toHaveText('3 videos')

    // Adding the same folder again is refused.
    await page.getByRole('button', { name: 'Add folder' }).click()
    await expect(page.getByRole('alert')).toContainText('already part of your library')

    rmSync(join(mediaRoot, 'Movies', 'The.Matrix.1999.mkv'))
    await page.getByRole('button', { name: `Rescan ${mediaRoot}` }).click()
    await expect(status).toHaveText('2 videos · 1 missing')
  } finally {
    await app.close()
  }

  // Folders and scan results survive a restart.
  app = await launchApp(userDataDir)
  try {
    const page = await app.firstWindow()
    await openSettings(page)
    await expect(page.getByTestId('library-folder-status')).toHaveText('2 videos · 1 missing')

    await page.getByRole('button', { name: `Remove ${mediaRoot} from library` }).click()
    const dialog = page.getByRole('dialog', { name: 'Remove folder from library?' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Remove' }).click()

    await expect(page.getByTestId('library-folder')).toHaveCount(0)
    // Files on disk are untouched.
    expect(existsSync(join(mediaRoot, 'Movies', 'Amélie (2001).mp4'))).toBe(true)
  } finally {
    await app.close()
  }
})

test('an unavailable folder is reported, not emptied', async () => {
  const app = await launchApp(userDataDir)
  try {
    const page = await app.firstWindow()
    await openSettings(page)
    await stubFolderPicker(app, mediaRoot)
    await page.getByRole('button', { name: 'Add folder' }).click()
    await expect(page.getByTestId('library-folder-status')).toHaveText('3 videos')

    rmSync(mediaRoot, { recursive: true, force: true })
    await page.getByRole('button', { name: `Rescan ${mediaRoot}` }).click()
    await expect(page.getByTestId('library-folder-status')).toHaveText(
      'Not available — is the drive connected?',
    )
  } finally {
    await app.close()
  }
})

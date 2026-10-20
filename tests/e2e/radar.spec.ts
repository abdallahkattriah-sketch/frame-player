import { expect, test } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchApp } from './launch-app'
import { GOOD_TOKEN, startTmdbMock, type TmdbMock } from './tmdb-mock'

// Mocked TMDB with dates relative to today: no real TMDB request is made.

let userDataDir: string
let tmdb: TmdbMock

test.beforeEach(async () => {
  userDataDir = mkdtempSync(join(tmpdir(), 'frame e2e '))
  tmdb = await startTmdbMock()
})

test.afterEach(async () => {
  await tmdb.close()
  rmSync(userDataDir, { recursive: true, force: true })
})

test('Radar shows releases of followed people with Egypt dates, and popular movies', async () => {
  const app = await launchApp(userDataDir, [], {
    FRAME_TMDB_API_BASE: tmdb.apiBase,
    FRAME_TMDB_IMAGE_BASE: tmdb.imageBase,
  })
  try {
    const page = await app.firstWindow()
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await page.getByLabel('TMDB token', { exact: true }).fill(GOOD_TOKEN)
    await page.getByRole('button', { name: 'Save TMDB token' }).click()
    await expect(page.getByTestId('tmdb-test-result')).toHaveText('Connected to TMDB.')

    // Following nobody: an explanation, and Popular Now still works.
    await page.getByRole('button', { name: 'Radar' }).click()
    const radar = page.getByTestId('radar')
    await expect(radar).toContainText('Follow actors and directors to fill your Radar.')
    const popular = radar.getByRole('region', { name: 'Popular now' })
    await expect(popular).toContainText('The Matrix')

    // Follow someone from a popular movie's cast.
    await popular.getByRole('button', { name: /^The Matrix \(1999\)/ }).click()
    const details = page.getByTestId('tmdb-details')
    await details.getByRole('button', { name: 'Follow Keanu Reeves' }).click()
    await expect(details.getByRole('button', { name: 'Unfollow Keanu Reeves' })).toBeVisible()
    await details.getByRole('button', { name: 'Close' }).click()

    const soon = radar.getByRole('region', { name: 'Coming soon' })
    await expect(soon).toContainText('Soon Movie')
    await expect(soon.getByTestId('radar-date')).toContainText('· Egypt')
    await expect(soon).toContainText('In 10 days')
    await expect(soon).toContainText('With Keanu Reeves')

    // A US-only date is labeled as such, never as Egypt.
    const fresh = radar.getByRole('region', { name: 'Newly released' })
    await expect(fresh).toContainText('Fresh Movie')
    await expect(fresh.getByTestId('radar-date')).toContainText('No Egypt date · US')

    const digital = radar.getByRole('region', { name: 'Digital release' })
    await expect(digital).toContainText('Fresh Movie')
    await expect(digital).toContainText('Digital in 20 days')
    await expect(digital).not.toContainText('Soon Movie')
    await expect(radar.getByTestId('radar-updated')).toBeVisible()

    // Filters hide sections without refetching.
    await radar.getByRole('button', { name: 'Release type' }).click()
    await page.getByRole('option', { name: 'Digital' }).click()
    await expect(radar.getByRole('region', { name: 'Coming soon' })).toHaveCount(0)
    await expect(digital).toBeVisible()

    // A card opens the title's details.
    await digital.getByRole('button', { name: /^Fresh Movie/ }).click()
    await expect(page.getByTestId('tmdb-details')).toBeVisible()
  } finally {
    await app.close()
  }
})

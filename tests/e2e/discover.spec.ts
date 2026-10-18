import { expect, test } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchApp } from './launch-app'
import { GOOD_TOKEN, startTmdbMock, type TmdbMock } from './tmdb-mock'

// Mocked TMDB lists: no real TMDB request is made.

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

test('Home, Movies, and TV Shows show trending, top 10, and new titles from TMDB', async () => {
  const app = await launchApp(userDataDir, [], {
    FRAME_TMDB_API_BASE: tmdb.apiBase,
    FRAME_TMDB_IMAGE_BASE: tmdb.imageBase,
  })
  try {
    const page = await app.firstWindow()

    // Without a token, Home points to the setup instead of showing empty rows.
    await expect(page.getByTestId('discover-hint')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Open videos…' })).toBeVisible()
    await page.getByRole('button', { name: 'Set up TMDB' }).click()
    await page.getByLabel('TMDB token', { exact: true }).fill(GOOD_TOKEN)
    await page.getByRole('button', { name: 'Save TMDB token' }).click()
    await expect(page.getByTestId('tmdb-test-result')).toHaveText('Connected to TMDB.')

    await page.getByRole('button', { name: 'Home' }).click()
    await expect(page.getByTestId('discover-hint')).toHaveCount(0)
    const hero = page.getByTestId('discover-hero')
    await expect(hero.getByRole('heading', { name: 'The Matrix' })).toBeVisible()
    await hero.getByRole('button', { name: 'Show Breaking Bad (2008)' }).click()
    await expect(hero.getByRole('heading', { name: 'Breaking Bad' })).toBeVisible()

    // Top 10 today: movies and shows, people left out.
    const topTen = page.getByRole('region', { name: 'Top 10 today' })
    await expect(topTen.getByRole('button', { name: /on TMDB$/ })).toHaveCount(5)
    await expect(topTen).not.toContainText('Somebody')
    await expect(page.getByRole('region', { name: 'Coming soon' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'New episodes this week' })).toContainText(
      'Night Shift',
    )

    // Posters open details and can be added to a collection.
    await topTen.getByRole('button', { name: 'Arrival Day (2026), movie on TMDB' }).click()
    const details = page.getByTestId('tmdb-details')
    await expect(details.getByRole('heading', { name: 'Arrival Day' })).toBeVisible()
    await details.getByRole('button', { name: 'Close' }).click()
    await hero.getByRole('button', { name: 'Add to collection' }).click()
    await page
      .getByRole('dialog', { name: 'Add to collection' })
      .getByRole('button', { name: 'New collection…' })
      .click()
    const create = page.getByRole('dialog', { name: 'New collection' })
    await create.getByLabel('Name').fill('Must watch')
    await create.getByRole('button', { name: 'Create and add' }).click()
    await expect(page.getByRole('list', { name: 'Collections' })).toContainText('Must watch1')

    // Movies: the library by default, Discover one click away and remembered.
    await page.getByRole('button', { name: 'Movies', exact: true }).click()
    await expect(page.getByRole('tab', { name: 'Your movies' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await page.getByRole('tab', { name: 'Discover' }).click()
    await expect(page.getByRole('region', { name: 'Top 10 movies this week' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'In cinemas now' })).toContainText('Quiet Harbor')
    await page.getByRole('button', { name: 'TV Shows' }).click()
    await page.getByRole('tab', { name: 'Discover' }).click()
    await expect(page.getByRole('region', { name: 'New episodes today' })).toContainText(
      'Night Shift',
    )
    await page.getByRole('button', { name: 'Movies', exact: true }).click()
    await expect(page.getByRole('tab', { name: 'Discover' })).toHaveAttribute(
      'aria-selected',
      'true',
    )

    // The lists can be switched off.
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await page
      .getByLabel('Show trending and top 10 lists from TMDB on Home, Movies, and TV Shows')
      .uncheck()
    await page.getByRole('button', { name: 'Home' }).click()
    await expect(page.getByRole('button', { name: 'Open videos…' })).toBeVisible()
    await expect(page.getByTestId('discover-hero')).toHaveCount(0)
    await expect(page.getByTestId('discover-hint')).toHaveCount(0)
  } finally {
    await app.close()
  }
})

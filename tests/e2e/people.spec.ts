import { expect, test } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchApp } from './launch-app'
import { GOOD_TOKEN, startTmdbMock, type TmdbMock } from './tmdb-mock'

// Mocked TMDB: no real TMDB request is made.

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

test('follow people from a title, open their profile, and manage them under People', async () => {
  const env = { FRAME_TMDB_API_BASE: tmdb.apiBase, FRAME_TMDB_IMAGE_BASE: tmdb.imageBase }
  let app = await launchApp(userDataDir, [], env)
  try {
    const page = await app.firstWindow()
    await page.getByRole('button', { name: 'People' }).click()
    await expect(page.getByText('You are not following anyone yet.')).toBeVisible()

    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await page.getByLabel('TMDB token', { exact: true }).fill(GOOD_TOKEN)
    await page.getByRole('button', { name: 'Save TMDB token' }).click()
    await expect(page.getByTestId('tmdb-test-result')).toHaveText('Connected to TMDB.')

    // Cast and crew of a title, with person ids, can be followed in place.
    await page.getByRole('button', { name: 'Home' }).click()
    await page
      .getByRole('region', { name: 'Top 10 today' })
      .getByRole('button', { name: /^The Matrix \(1999\)/ })
      .click()
    const details = page.getByTestId('tmdb-details')
    const strip = details.getByTestId('people-strip')
    await expect(strip).toContainText('Lana Wachowski')
    await strip.getByRole('button', { name: 'Follow Lana Wachowski' }).click()
    await expect(strip.getByRole('button', { name: 'Unfollow Lana Wachowski' })).toBeVisible()

    // The profile opens over the title and lists upcoming work and the filmography.
    await strip.getByRole('button', { name: /^Keanu Reeves/ }).click()
    const person = page.getByTestId('person-details')
    await expect(person.getByRole('heading', { name: 'Keanu Reeves' })).toBeVisible()
    await expect(person.getByRole('region', { name: 'Upcoming' })).toContainText('Far Future')
    await expect(person.getByRole('region', { name: 'Filmography' })).toContainText('The Matrix')
    await person.getByRole('button', { name: 'Follow', exact: true }).click()
    // Still under the mouse, so it offers Unfollow.
    await expect(person.getByRole('button', { name: 'Unfollow', pressed: true })).toBeVisible()
    await person.getByRole('button', { name: 'Close' }).click()
    await expect(person).toHaveCount(0)
    await expect(details).toBeVisible()
    await details.getByRole('button', { name: 'Close' }).click()
  } finally {
    await app.close()
  }

  // Follows are stored locally and survive a restart.
  app = await launchApp(userDataDir, [], env)
  try {
    const page = await app.firstWindow()
    await page.getByRole('button', { name: 'People' }).click()
    await expect(page.getByTestId('item-count')).toHaveText('2 people')
    await page.getByRole('button', { name: 'Unfollow Lana Wachowski' }).click()
    await expect(page.getByTestId('item-count')).toHaveText('1 person')
    await expect(page.getByRole('heading', { name: 'Following' })).toBeVisible()
    await expect(page.getByRole('main')).toContainText('Keanu Reeves')
  } finally {
    await app.close()
  }
})

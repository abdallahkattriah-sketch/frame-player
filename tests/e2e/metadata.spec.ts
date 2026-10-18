import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchApp } from './launch-app'
import { GOOD_TOKEN, startTmdbMock, type TmdbMock } from './tmdb-mock'

// Mocked TMDB: a local server with TMDB-shaped responses. No real TMDB request is made.

let userDataDir: string
let mediaRoot: string
let tmdb: TmdbMock

test.beforeEach(async () => {
  userDataDir = mkdtempSync(join(tmpdir(), 'frame e2e '))
  mediaRoot = mkdtempSync(join(tmpdir(), 'frame library '))
  for (const rel of [
    'Movies/The.Matrix.1999.mkv',
    'Movies/Dune.mkv',
    'TV/Breaking Bad (2008)/Season 1/S01E01.mkv',
  ]) {
    const full = join(mediaRoot, rel)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, 'not a real video')
  }
  tmdb = await startTmdbMock()
})

test.afterEach(async () => {
  await tmdb.close()
  rmSync(userDataDir, { recursive: true, force: true })
  rmSync(mediaRoot, { recursive: true, force: true })
})

function launch() {
  return launchApp(userDataDir, [], {
    FRAME_TMDB_API_BASE: tmdb.apiBase,
    FRAME_TMDB_IMAGE_BASE: tmdb.imageBase,
  })
}

async function addFolder(app: ElectronApplication, page: Page) {
  await app.evaluate(({ dialog }, chosen) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [chosen] })) as never
  }, mediaRoot)
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'Add folder' }).click()
  await expect(page.getByTestId('library-folder-status')).toHaveText('3 videos')
}

test('identifies the library with TMDB, shows artwork and details, and supports manual matching', async () => {
  const app = await launch()
  try {
    const page = await app.firstWindow()
    await addFolder(app, page)

    // A wrong token is reported clearly and stored nowhere in plain text.
    const tokenField = page.getByLabel('TMDB token', { exact: true })
    await tokenField.fill('eyJ.wrong-token')
    await page.getByRole('button', { name: 'Save TMDB token' }).click()
    await expect(page.getByTestId('tmdb-test-result')).toHaveText(
      'TMDB rejected the token. Check it in Settings.',
    )

    await tokenField.fill(GOOD_TOKEN)
    await page.getByRole('button', { name: 'Save TMDB token' }).click()
    await expect(page.getByTestId('tmdb-test-result')).toHaveText('Connected to TMDB.')
    await expect(page.getByTestId('tmdb-token-status')).toHaveText('Saved (encrypted)')
    expect(readFileSync(join(userDataDir, 'credentials.json'), 'utf8')).not.toContain(GOOD_TOKEN)

    // Identification runs after the token is saved: The Matrix and the show auto-match.
    await page.getByRole('button', { name: 'Movies' }).click()
    const matrixCard = page.getByRole('button', { name: 'Play The Matrix' })
    await expect(matrixCard).toBeVisible()
    await expect
      .poll(() =>
        matrixCard
          .locator('img')
          .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth),
      )
      .toBe(1)
    await page.getByRole('button', { name: 'TV Shows' }).click()
    await expect(page.getByRole('button', { name: 'Open Breaking Bad' })).toBeVisible()

    // Dune is ambiguous (two films, no year): it waits in Unmatched for the user.
    await page.getByRole('button', { name: 'All Media' }).click()
    await page.getByRole('button', { name: 'Unmatched' }).click()
    await expect(page.getByTestId('item-count')).toHaveText('1 item')
    await page.getByRole('button', { name: 'More actions for Dune' }).click()
    await page.getByRole('menuitem', { name: 'Identify…' }).click()

    const dialog = page.getByRole('dialog', { name: 'Identify' })
    const options = dialog.getByRole('option')
    await expect(options).toHaveCount(2)
    await options.filter({ hasText: '2021' }).click()
    await dialog.getByRole('button', { name: 'Use this match' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByText('Everything is identified.')).toBeVisible()

    // Details panel shows TMDB data.
    await page.getByRole('button', { name: 'All', exact: true }).click()
    await page.getByRole('button', { name: 'More actions for The Matrix' }).click()
    await page.getByRole('menuitem', { name: 'Details' }).click()
    const details = page.getByTestId('details-panel')
    await expect(details).toContainText('A hacker learns the truth about his reality.')
    await expect(details).toContainText('Lana Wachowski')
    await expect(details).toContainText('Keanu Reeves')
    await expect(details).toContainText('tt0133093')
    await details.getByRole('button', { name: 'Close details' }).click()

    // Searching also lists titles on TMDB, including ones not in the library.
    const searchBox = page.getByRole('searchbox', { name: 'Search library' })
    await searchBox.fill('Dune')
    const online = page.getByTestId('tmdb-results')
    await expect(
      online.getByRole('button', { name: 'Dune: Prophecy (2024), TV show on TMDB' }),
    ).toBeVisible()
    await expect(online.getByRole('button', { name: 'Dune (2021), movie on TMDB' })).toContainText(
      'In library',
    )
    await expect(
      online.getByRole('button', { name: 'Dune (1984), movie on TMDB' }),
    ).not.toContainText('In library')

    await online.getByRole('button', { name: 'Dune (2021), movie on TMDB' }).click()
    const tmdbDetails = page.getByTestId('tmdb-details')
    await expect(tmdbDetails).toContainText('Science Fiction')
    await expect(tmdbDetails).toContainText('In your library')
    // "View on TMDB" opens the browser; record the URL instead of opening it.
    await app.evaluate(({ shell }) => {
      shell.openExternal = (async (url: string) => {
        ;(globalThis as { openedUrl?: string }).openedUrl = url
      }) as never
    })
    await tmdbDetails.getByRole('button', { name: 'View on TMDB' }).click()
    await expect
      .poll(() => app.evaluate(() => (globalThis as { openedUrl?: string }).openedUrl))
      .toBe('https://www.themoviedb.org/movie/438631')
    // Add it to a collection from the details; the details then say so.
    await tmdbDetails.getByRole('button', { name: 'Add to collection…' }).click()
    let addDialog = page.getByRole('dialog', { name: 'Add to collection' })
    await addDialog.getByRole('button', { name: 'New collection…' }).click()
    const create = page.getByRole('dialog', { name: 'New collection' })
    await create.getByLabel('Name').fill('Watchlist')
    await create.getByRole('button', { name: 'Create and add' }).click()
    await expect(tmdbDetails.getByTestId('in-collections')).toHaveText('In Watchlist')
    await tmdbDetails.getByRole('button', { name: 'Close' }).click()

    // Titles not in the library can be added from the poster's hover button…
    const lynch = online.getByRole('button', { name: 'Dune (1984), movie on TMDB' })
    await lynch.hover()
    await online.getByRole('button', { name: 'Add Dune (1984) to a collection' }).click()
    addDialog = page.getByRole('dialog', { name: 'Add to collection' })
    await addDialog.getByRole('button', { name: /Watchlist/ }).click()
    await expect(addDialog).toHaveCount(0)
    // …or by dragging the poster onto the collection in the sidebar.
    const nav = page.getByRole('list', { name: 'Collections' })
    await online
      .getByRole('button', { name: 'Dune: Prophecy (2024), TV show on TMDB' })
      .dragTo(nav.getByRole('button', { name: /Watchlist/ }))
    await expect(nav).toContainText('Watchlist3')

    // In the collection, hovering a poster tells whether the library has it.
    await searchBox.fill('')
    await nav.getByRole('button', { name: /Watchlist/ }).click()
    await expect(page.getByTestId('item-count')).toHaveText('3 items')
    const saved = page.getByTestId('collection-title')
    await expect(saved).toHaveCount(3)
    const owned = saved.filter({ hasText: '2021' })
    await owned.hover()
    await expect(owned.getByTestId('ownership')).toBeVisible()
    await expect(owned.getByTestId('ownership')).toHaveText('In your library')
    await expect(saved.filter({ hasText: '1984' }).getByTestId('ownership')).toHaveText(
      'Not in your library',
    )
    await saved.filter({ hasText: '1984' }).hover()
    await page.getByRole('button', { name: 'Remove Dune (1984) from Watchlist' }).click()
    await expect(saved).toHaveCount(2)

    // A library video dragged onto the collection joins it; its details list the collection.
    await page.getByRole('button', { name: 'Movies', exact: true }).click()
    await page
      .getByRole('button', { name: 'Play The Matrix' })
      .dragTo(nav.getByRole('button', { name: /Watchlist/ }))
    await expect(nav).toContainText('Watchlist3')
    await page.getByRole('button', { name: 'More actions for The Matrix' }).click()
    await page.getByRole('menuitem', { name: 'Details' }).click()
    await expect(page.getByTestId('details-panel').getByTestId('in-collections')).toHaveText(
      'In Watchlist',
    )
    await page.getByRole('button', { name: 'Close details' }).click()

    // The TMDB results can be switched off.
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await page.getByLabel('Also show movies and shows from TMDB when searching').uncheck()
    await searchBox.fill('Dune')
    await expect(page.getByRole('heading', { name: 'Results for “Dune”' })).toBeVisible()
    await expect(page.getByTestId('tmdb-results')).toHaveCount(0)
    await searchBox.fill('')

    // Required TMDB attribution.
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await expect(page.getByTestId('tmdb-attribution')).toHaveText(
      'This product uses the TMDB API but is not endorsed or certified by TMDB.',
    )
    await expect(page.getByRole('img', { name: 'The Movie Database (TMDB)' }).first()).toBeVisible()
  } finally {
    await app.close()
  }
})

test('turning off online lookups stops all TMDB requests and the library keeps working', async () => {
  const app = await launch()
  try {
    const page = await app.firstWindow()
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await page.getByLabel(/Look up information online/).uncheck()
    await page.getByLabel('TMDB token', { exact: true }).fill(GOOD_TOKEN)
    await page.getByRole('button', { name: 'Save TMDB token' }).click()
    await addFolder(app, page)

    await page.getByRole('button', { name: 'Movies' }).click()
    await expect(page.getByTestId('item-count')).toHaveText('2 items')
    await page.waitForTimeout(500)
    expect(tmdb.requests.filter((p) => p.startsWith('/3/search'))).toEqual([])
  } finally {
    await app.close()
  }
})

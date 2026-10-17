import { describe, expect, it } from 'vitest'
import { HttpClient } from '../../src/main/network/http-client'
import { OpenSubtitlesProvider } from '../../src/main/subtitles/opensubtitles/opensubtitles-provider'
import { SubSourceProvider } from '../../src/main/subtitles/subsource/subsource-provider'
import type { SubtitleSearchContext } from '../../src/main/subtitles/provider'
import { decodeSubtitle } from '../../src/main/subtitles/subtitle-content'

/**
 * Real requests to the providers, run only when keys are set in the environment:
 *   FRAME_TEST_OPENSUBTITLES_KEY (+ optional FRAME_TEST_OPENSUBTITLES_USER / _PASS)
 *   FRAME_TEST_SUBSOURCE_KEY
 * Downloads use quota, so they run only with FRAME_TEST_ALLOW_DOWNLOAD=1.
 */
const env = process.env
const allowDownload = env['FRAME_TEST_ALLOW_DOWNLOAD'] === '1'
const http = new HttpClient({ timeoutMs: 30_000 })

const matrix: SubtitleSearchContext = {
  fileName: 'The.Matrix.1999.1080p.BluRay.x264.mkv',
  title: 'The Matrix',
  year: 1999,
  kind: 'movie',
  season: null,
  episode: null,
  tmdbId: 603,
  imdbId: 'tt0133093',
  movieHash: null,
  languages: ['en'],
  hearingImpaired: 'include',
}

describe.skipIf(!env['FRAME_TEST_OPENSUBTITLES_KEY'])('OpenSubtitles live API', () => {
  const provider = new OpenSubtitlesProvider({
    http,
    getApiKey: () => env['FRAME_TEST_OPENSUBTITLES_KEY'],
    getUsername: () => env['FRAME_TEST_OPENSUBTITLES_USER'],
    getPassword: () => env['FRAME_TEST_OPENSUBTITLES_PASS'],
    userAgent: 'Frame v0.1.0',
  })

  it('accepts the configuration', async () => {
    const check = await provider.validateConfiguration()
    expect(check.ok, check.message).toBe(true)
  })

  it('finds English subtitles for The Matrix by TMDB id', async () => {
    const results = await provider.searchSubtitles(matrix)
    expect(results.length).toBeGreaterThan(0)
    expect(results.every((r) => r.language === 'en')).toBe(true)
  })

  it.skipIf(!allowDownload)('downloads and validates one subtitle (uses quota)', async () => {
    const [first] = await provider.searchSubtitles(matrix)
    const file = await provider.downloadSubtitle(first?.id ?? '')
    expect(decodeSubtitle(file.files[0]?.bytes ?? Buffer.alloc(0)).format).toBeTruthy()
    await provider.dispose()
  })
})

describe.skipIf(!env['FRAME_TEST_SUBSOURCE_KEY'])('SubSource live API', () => {
  const provider = new SubSourceProvider({ http, getApiKey: () => env['FRAME_TEST_SUBSOURCE_KEY'] })

  it('accepts the key', async () => {
    const check = await provider.validateConfiguration()
    expect(check.ok, check.message).toBe(true)
  })

  it('finds English subtitles for The Matrix by IMDb id (verifies the language naming)', async () => {
    const results = await provider.searchSubtitles(matrix)
    expect(results.length).toBeGreaterThan(0)
    expect(results.every((r) => r.language === 'en')).toBe(true)
  })

  it.skipIf(!allowDownload)('downloads and validates one subtitle', async () => {
    const [first] = await provider.searchSubtitles(matrix)
    const file = await provider.downloadSubtitle(first?.id ?? '')
    expect(file.files.length).toBeGreaterThan(0)
    expect(decodeSubtitle(file.files[0]?.bytes ?? Buffer.alloc(0)).format).toBeTruthy()
  })
})

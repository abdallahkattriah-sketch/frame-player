import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { deflateRawSync } from 'node:zlib'
import { describe, expect, it, vi } from 'vitest'
import { HttpClient } from '../../../src/main/network/http-client'
import { OpenSubtitlesProvider } from '../../../src/main/subtitles/opensubtitles/opensubtitles-provider'
import {
  SubSourceProvider,
  subsourceLanguageName,
} from '../../../src/main/subtitles/subsource/subsource-provider'
import { SubtitleService, type ResolvedTarget } from '../../../src/main/subtitles/subtitle-service'
import type { SubtitleSearchContext } from '../../../src/main/subtitles/provider'
import { rankResults } from '../../../src/main/subtitles/subtitle-ranking'
import { useTempDirs } from './temp-dir'

const tempDir = useTempDirs()

const SRT = '1\n00:00:01,000 --> 00:00:02,000\nHello\n'

/** Single-entry ZIP builder for tests. */
function zip(entries: { name: string; data: Buffer }[]): Buffer {
  const parts: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const e of entries) {
    const name = Buffer.from(e.name)
    const body = deflateRawSync(e.data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(8, 8)
    local.writeUInt32LE(body.length, 18)
    local.writeUInt32LE(e.data.length, 22)
    local.writeUInt16LE(name.length, 26)
    const c = Buffer.alloc(46)
    c.writeUInt32LE(0x02014b50, 0)
    c.writeUInt16LE(8, 10)
    c.writeUInt32LE(body.length, 20)
    c.writeUInt32LE(e.data.length, 24)
    c.writeUInt16LE(name.length, 28)
    c.writeUInt32LE(offset, 42)
    parts.push(local, name, body)
    central.push(c, name)
    offset += 30 + name.length + body.length
  }
  const dir = Buffer.concat(central)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(dir.length, 12)
  eocd.writeUInt32LE(offset, 16)
  return Buffer.concat([...parts, dir, eocd])
}

type Handler = (url: URL, init: RequestInit) => Response | Promise<Response>
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function fakeFetch(handlers: Record<string, Handler>) {
  const calls: { url: URL; init: RequestInit }[] = []
  const fn = vi.fn(async (input: URL, init: RequestInit = {}) => {
    const url = new URL(input)
    calls.push({ url, init })
    const key = `${init.method ?? 'GET'} ${url.origin}${url.pathname}`
    const handler = handlers[key]
    if (!handler) return json({ message: 'not found' }, 404)
    return handler(url, init)
  })
  return {
    fn,
    calls,
    http: new HttpClient({
      fetch: fn as unknown as typeof fetch,
      sleep: async () => undefined,
      maxRetries: 1,
    }),
  }
}

const header = (init: RequestInit, name: string) => (init.headers as Record<string, string>)[name]

const OS = 'https://os.test'
const osSubtitle = (fileId: number, extra: Record<string, unknown> = {}) => ({
  id: String(fileId),
  type: 'subtitle',
  attributes: {
    language: 'ar',
    download_count: 1200,
    hearing_impaired: false,
    foreign_parts_only: false,
    fps: 23.976,
    ratings: 8,
    votes: 4,
    from_trusted: true,
    ai_translated: false,
    machine_translated: false,
    release: 'Show.S01E02.1080p.WEB-DL.x264-GRP',
    feature_details: { parent_tmdb_id: 1396, season_number: 1, episode_number: 2 },
    files: [{ file_id: fileId, file_name: 'Show.S01E02.ar' }],
    ...extra,
  },
})

function openSubtitles(handlers: Record<string, Handler>, account = true) {
  const fake = fakeFetch(handlers)
  const provider = new OpenSubtitlesProvider({
    http: fake.http,
    getApiKey: () => 'os-key',
    getUsername: () => (account ? 'user' : undefined),
    getPassword: () => (account ? 'pass' : undefined),
    userAgent: 'Frame v0.1.0',
    baseOrigin: OS,
    now: () => 0,
  })
  return { provider, ...fake }
}

const episodeContext: SubtitleSearchContext = {
  fileName: 'Show.S01E02.1080p.WEB-DL.x264-GRP.mkv',
  title: 'Show',
  year: 2008,
  kind: 'episode',
  season: 1,
  episode: 2,
  tmdbId: 1396,
  imdbId: 'tt0903747',
  movieHash: null,
  languages: ['en', 'ar'],
  hearingImpaired: 'include',
}

describe('OpenSubtitlesProvider', () => {
  it('searches episodes by parent TMDB id with sorted, lowercase parameters and required headers', async () => {
    const { provider, calls } = openSubtitles({
      [`GET ${OS}/api/v1/subtitles`]: () => json({ data: [osSubtitle(42)] }),
    })
    const results = await provider.searchSubtitles(episodeContext)
    const call = calls[0] as { url: URL; init: RequestInit }
    expect([...call.url.searchParams.keys()]).toEqual([
      'episode_number',
      'languages',
      'parent_tmdb_id',
      'season_number',
      'type',
    ])
    expect(call.url.searchParams.get('languages')).toBe('ar,en')
    expect(header(call.init, 'Api-Key')).toBe('os-key')
    expect(header(call.init, 'User-Agent')).toBe('Frame v0.1.0')
    expect(results[0]).toMatchObject({
      id: '42',
      language: 'ar',
      downloads: 1200,
      ratingLabel: '8.0/10 from 4 votes',
      season: 1,
      episode: 2,
      hashMatch: null,
      matchedTmdbId: 1396,
    })
  })

  it('sends a movie hash only when given, and reports hash matches', async () => {
    const { provider, calls } = openSubtitles({
      [`GET ${OS}/api/v1/subtitles`]: () =>
        json({ data: [osSubtitle(1, { moviehash_match: true })] }),
    })
    const results = await provider.searchSubtitles({
      ...episodeContext,
      kind: 'movie',
      tmdbId: 603,
      movieHash: '8e245d9679d31e12',
    })
    expect(calls[0]?.url.searchParams.get('moviehash')).toBe('8e245d9679d31e12')
    expect(calls[0]?.url.searchParams.get('tmdb_id')).toBe('603')
    expect(results[0]?.hashMatch).toBe(true)
  })

  it('logs in once, downloads with the user token, and records the quota', async () => {
    const { provider, calls } = openSubtitles({
      [`POST ${OS}/api/v1/login`]: (_u, init) => {
        expect(JSON.parse(init.body as string)).toEqual({ username: 'user', password: 'pass' })
        return json({
          token: 'jwt-1',
          base_url: 'api.opensubtitles.com',
          status: 200,
          user: { allowed_downloads: 20, vip: false },
        })
      },
      [`POST ${OS}/api/v1/download`]: (_u, init) => {
        expect(header(init, 'Authorization')).toBe('Bearer jwt-1')
        expect(JSON.parse(init.body as string)).toEqual({ file_id: 42 })
        return json({
          link: 'https://dl.test/abc/file.srt',
          file_name: 'file.srt',
          requests: 1,
          remaining: 19,
          message: '',
          reset_time: '',
          reset_time_utc: '2026-10-18T00:00:00Z',
        })
      },
      'GET https://dl.test/abc/file.srt': () => new Response(SRT),
    })
    const first = await provider.downloadSubtitle('42')
    await provider.downloadSubtitle('42')
    expect(first.files[0]?.bytes.toString()).toBe(SRT)
    expect(first.quota).toEqual({ remaining: 19, resetsAt: '2026-10-18T00:00:00Z' })
    expect(calls.filter((c) => c.url.pathname.endsWith('/login'))).toHaveLength(1)
    // Credentials never go to the temporary download host.
    const dl = calls.find((c) => c.url.host === 'dl.test')
    expect(header(dl?.init ?? {}, 'Authorization')).toBeUndefined()
    expect(header(dl?.init ?? {}, 'Api-Key')).toBeUndefined()
  })

  it('never retries rejected credentials', async () => {
    const { provider, calls } = openSubtitles({
      [`POST ${OS}/api/v1/login`]: () => json({ message: 'invalid' }, 401),
    })
    expect(await provider.validateConfiguration()).toMatchObject({
      ok: false,
      message: 'OpenSubtitles rejected the username or password.',
    })
    expect(await provider.validateConfiguration()).toMatchObject({ ok: false })
    expect(calls.filter((c) => c.url.pathname.endsWith('/login'))).toHaveLength(1)
  })

  it('explains a refused download (quota)', async () => {
    const { provider } = openSubtitles(
      { [`POST ${OS}/api/v1/download`]: () => json({ message: 'quota' }, 406) },
      false,
    )
    await expect(provider.downloadSubtitle('42')).rejects.toThrow(/download limit/)
  })
})

const SS = 'https://ss.test'
function subSource(handlers: Record<string, Handler>) {
  const fake = fakeFetch(handlers)
  return {
    provider: new SubSourceProvider({ http: fake.http, getApiKey: () => 'ss-key', baseOrigin: SS }),
    ...fake,
  }
}

describe('SubSourceProvider', () => {
  it('finds the title by IMDb id, lists subtitles per language name, and keeps only requested languages', async () => {
    const { provider, calls } = subSource({
      [`GET ${SS}/api/v1/movies/search`]: (url) => {
        expect(url.searchParams.get('searchType')).toBe('imdb')
        expect(url.searchParams.get('imdb')).toBe('tt0903747')
        return json({
          success: true,
          data: [
            {
              movieId: 77,
              title: 'Show',
              type: 'tvseries',
              season: 1,
              imdbId: 'tt0903747',
              tmdbId: '1396',
            },
          ],
        })
      },
      [`GET ${SS}/api/v1/subtitles`]: (url) =>
        json({
          success: true,
          data:
            url.searchParams.get('language') === 'arabic'
              ? [
                  {
                    subtitleId: 900,
                    language: 'arabic',
                    releaseInfo: ['Show.S01E02.1080p.WEB-DL'],
                    hearingImpaired: false,
                    foreignParts: false,
                    framerate: '23.976',
                    downloads: 50,
                    rating: { good: 3, bad: 1, total: 4 },
                  },
                  { subtitleId: 901, language: 'french', releaseInfo: ['Show.S01E03'] },
                ]
              : [],
        }),
    })
    const results = await provider.searchSubtitles(episodeContext)
    expect(results.map((r) => [r.id, r.language, r.season, r.episode])).toEqual([
      ['900', 'ar', 1, 2],
    ])
    expect(results[0]?.ratingLabel).toBe('3 good, 1 bad')
    expect(calls.every((c) => header(c.init, 'X-API-Key') === 'ss-key')).toBe(true)
    expect(
      calls
        .filter((c) => c.url.pathname.endsWith('/subtitles'))
        .map((c) => c.url.searchParams.get('language')),
    ).toEqual(['english', 'arabic'])
    expect(subsourceLanguageName('pt-BR')).toBe('brazilian portuguese')
  })

  it('downloads a ZIP and extracts only subtitle files', async () => {
    const { provider } = subSource({
      [`GET ${SS}/api/v1/subtitles/900/download`]: () =>
        new Response(
          zip([
            { name: 'readme.txt', data: Buffer.from('x') },
            { name: 'Show.S01E02.srt', data: Buffer.from(SRT) },
          ]),
          {
            headers: { 'content-type': 'application/zip' },
          },
        ),
    })
    const { files } = await provider.downloadSubtitle('900')
    expect(files.map((f) => f.name)).toEqual(['Show.S01E02.srt'])
  })

  it('reports a rejected key clearly', async () => {
    const { provider } = subSource({ [`GET ${SS}/api/v1/movies/search`]: () => json({}, 401) })
    expect(await provider.validateConfiguration()).toEqual({
      ok: false,
      message: 'SubSource rejected the API key. Check it in Settings.',
    })
  })
})

describe('rankResults', () => {
  it('puts hash matches and the right episode first and explains why', () => {
    const base = {
      provider: 'opensubtitles' as const,
      releaseName: null,
      fileName: null,
      format: null,
      downloads: null,
      ratingLabel: null,
      hearingImpaired: false,
      forced: false,
      fps: null,
      hashMatch: null,
      machineTranslated: false,
      aiTranslated: false,
      trustedUploader: null,
      uploadedAt: null,
      matchedImdbId: null,
      matchedTmdbId: 1396,
    }
    const ranked = rankResults(episodeContext, [
      { ...base, id: 'wrong-episode', language: 'en', season: 1, episode: 5 },
      {
        ...base,
        id: 'right',
        language: 'en',
        season: 1,
        episode: 2,
        releaseName: 'Show.S01E02.1080p.WEB-DL.x264-GRP',
      },
      { ...base, id: 'hash', language: 'ar', season: 1, episode: 2, hashMatch: true },
    ])
    expect(ranked.map((r) => r.id)).toEqual(['hash', 'right', 'wrong-episode'])
    expect(ranked[1]?.reasons).toContain('Release name matches the file')
    expect(ranked[2]?.reasons).toContain('For a different episode (S1E5)')
    expect(ranked[0]?.languageLabel).toBe('Arabic')
  })
})

describe('SubtitleService', () => {
  function service(options: { online?: boolean; ssFails?: boolean; dir?: string } = {}) {
    const dir = options.dir ?? tempDir()
    const video = join(dir, 'Show.S01E02.1080p.WEB-DL.x264-GRP.mkv')
    writeFileSync(video, '')
    const os = openSubtitles({
      [`GET ${OS}/api/v1/subtitles`]: () => json({ data: [osSubtitle(42)] }),
      [`POST ${OS}/api/v1/login`]: () =>
        json({
          token: 't',
          base_url: 'api.opensubtitles.com',
          status: 200,
          user: { allowed_downloads: 5 },
        }),
      [`POST ${OS}/api/v1/download`]: () =>
        json({
          link: 'https://dl.test/f.srt',
          file_name: 'f.srt',
          requests: 1,
          remaining: 4,
          message: '',
          reset_time: '',
          reset_time_utc: '',
        }),
      // Windows-1256 Arabic subtitle.
      'GET https://dl.test/f.srt': () =>
        new Response(
          Buffer.concat([
            Buffer.from('1\n00:00:01,000 --> 00:00:02,000\n'),
            Buffer.from([0xe3, 0xd1, 0xcd, 0xc8, 0xc7, 0x0a]),
          ]),
        ),
    })
    const ss = subSource({
      [`GET ${SS}/api/v1/movies/search`]: () =>
        options.ssFails ? json({}, 500) : json({ success: true, data: [] }),
    })
    const addToPlayer = vi.fn(async () => true)
    const target: ResolvedTarget = {
      videoPath: video,
      title: 'Show',
      year: 2008,
      kind: 'episode',
      season: 1,
      episode: 2,
      tmdbId: 1396,
      imdbId: null,
    }
    const svc = new SubtitleService({
      providers: [os.provider, ss.provider],
      isOnline: () => options.online ?? true,
      isProviderEnabled: () => true,
      allowFileHash: () => false,
      saveDirFor: () => dir,
      resolveTarget: () => target,
      addToPlayer,
    })
    return { svc, dir, video, addToPlayer, os, ss }
  }

  const search = {
    target: { current: true as const },
    languages: ['ar'],
    hearingImpaired: 'include' as const,
    providers: ['opensubtitles' as const, 'subsource' as const],
  }

  it('returns results from one provider even when the other fails, and reports what was sent', async () => {
    const { svc } = service({ ssFails: true })
    const response = await svc.searchSubtitles(search)
    expect(response.results.map((r) => r.provider)).toEqual(['opensubtitles'])
    expect(response.errors).toEqual([
      { provider: 'subsource', message: expect.stringMatching(/server error/) },
    ])
    expect(response.sent.find((s) => s.provider === 'opensubtitles')?.summary).toContain(
      'parent_tmdb_id=1396',
    )
  })

  it('reports missing keys per provider without crashing or sending requests', async () => {
    const os = fakeFetch({})
    const ss = fakeFetch({})
    const svc = new SubtitleService({
      providers: [
        new OpenSubtitlesProvider({
          http: os.http,
          getApiKey: () => undefined,
          getUsername: () => undefined,
          getPassword: () => undefined,
          userAgent: 'Frame v0.1.0',
          baseOrigin: OS,
        }),
        new SubSourceProvider({ http: ss.http, getApiKey: () => undefined, baseOrigin: SS }),
      ],
      isOnline: () => true,
      isProviderEnabled: () => true,
      allowFileHash: () => false,
      saveDirFor: () => tempDir(),
      resolveTarget: () => ({
        videoPath: 'C:\\Videos\\Film.mkv',
        title: 'Film',
        year: 2020,
        kind: 'movie',
        season: null,
        episode: null,
        tmdbId: null,
        imdbId: null,
      }),
      addToPlayer: async () => false,
    })
    const response = await svc.searchSubtitles(search)
    expect(response.results).toEqual([])
    expect(response.errors.map((e) => e.provider).sort()).toEqual(['opensubtitles', 'subsource'])
    expect(response.errors.every((e) => /key/i.test(e.message))).toBe(true)
    expect(os.fn).not.toHaveBeenCalled()
    expect(ss.fn).not.toHaveBeenCalled()
  })

  it('makes no requests when online subtitles are turned off', async () => {
    const { svc, os, ss } = service({ online: false })
    const response = await svc.searchSubtitles(search)
    expect(response.errors).toHaveLength(2)
    expect(os.fn).not.toHaveBeenCalled()
    expect(ss.fn).not.toHaveBeenCalled()
  })

  it('saves a validated UTF-8 file next to the video, loads it, and never overwrites silently', async () => {
    const { svc, dir, addToPlayer, video } = service()
    const request = {
      target: { current: true as const },
      provider: 'opensubtitles' as const,
      resultId: '42',
      language: 'ar',
      hearingImpaired: false,
      forced: false,
      overwrite: false,
    }
    const first = await svc.downloadSubtitle(request)
    const expectedPath = join(dir, 'Show.S01E02.1080p.WEB-DL.x264-GRP.ar.srt')
    expect(first).toMatchObject({
      status: 'saved',
      path: expectedPath,
      format: 'srt',
      sourceEncoding: 'windows-1256',
      loadedIntoPlayer: true,
    })
    expect(readFileSync(expectedPath, 'utf8')).toContain('مرحبا')
    expect(addToPlayer).toHaveBeenCalledWith(video, expectedPath, 'ar')

    writeFileSync(expectedPath, 'my own edits')
    expect(await svc.downloadSubtitle(request)).toEqual({ status: 'exists', path: expectedPath })
    expect(readFileSync(expectedPath, 'utf8')).toBe('my own edits')

    expect(await svc.downloadSubtitle({ ...request, overwrite: true })).toMatchObject({
      status: 'saved',
    })
    expect(readFileSync(expectedPath, 'utf8')).toContain('مرحبا')
  })

  it('rejects a download that is not a subtitle and writes nothing', async () => {
    const dir = tempDir()
    const { svc } = service({ dir })
    const os = (svc as unknown as { options: { providers: OpenSubtitlesProvider[] } }).options
      .providers[0] as OpenSubtitlesProvider
    vi.spyOn(os, 'downloadSubtitle').mockResolvedValue({
      files: [{ name: 'x.srt', bytes: Buffer.from('<html><body>Error</body></html>') }],
    })
    await expect(
      svc.downloadSubtitle({
        target: { current: true },
        provider: 'opensubtitles',
        resultId: '1',
        language: 'en',
        hearingImpaired: null,
        forced: null,
        overwrite: false,
      }),
    ).rejects.toThrow(/web page/)
    expect(existsSync(join(dir, 'Show.S01E02.1080p.WEB-DL.x264-GRP.en.srt'))).toBe(false)
  })
})

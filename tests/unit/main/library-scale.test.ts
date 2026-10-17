import { describe, expect, it } from 'vitest'
import type { ParsedMediaName } from '@shared/contracts/library'
import { openDatabase } from '../../../src/main/database/connection'
import { migrate } from '../../../src/main/database/migrator'
import { migrations } from '../../../src/main/database/migrations'
import {
  LibraryRepository,
  type ScannedFile,
} from '../../../src/main/database/repositories/library-repository'
import { LibraryQueryRepository } from '../../../src/main/database/repositories/library-query-repository'
import { HistoryRepository } from '../../../src/main/database/repositories/history-repository'
import { CollectionRepository } from '../../../src/main/database/repositories/collection-repository'
import { pathKey } from '../../../src/main/library/path-key'

const blank: ParsedMediaName = {
  kind: 'movie',
  title: null,
  year: null,
  season: null,
  episode: null,
  episodeEnd: null,
  episodeTitle: null,
  resolution: '1080p',
  videoCodec: null,
  edition: null,
  releaseGroup: null,
}

const MOVIES = 12_000
const SHOWS = 200
const EPISODES_PER_SHOW = 40 // 8,000 episodes: 20,000 files in total

function files(): ScannedFile[] {
  const list: ScannedFile[] = []
  for (let i = 0; i < MOVIES; i++) {
    const rel = `Movies\\Movie ${i} (${1950 + (i % 75)}).mkv`
    const path = `D:\\Media\\${rel}`
    list.push({
      ...blank,
      title: `Movie ${i}`,
      year: 1950 + (i % 75),
      path,
      pathKey: pathKey(path),
      relativePath: rel,
      fileName: rel.slice(7),
      sizeBytes: 1_000_000 + i,
      mtimeMs: 1,
    })
  }
  for (let s = 0; s < SHOWS; s++) {
    for (let e = 1; e <= EPISODES_PER_SHOW; e++) {
      const season = Math.ceil(e / 10)
      const rel = `TV\\Show ${s}\\S0${season}E${String(e).padStart(2, '0')}.mkv`
      const path = `D:\\Media\\${rel}`
      list.push({
        ...blank,
        kind: 'episode',
        title: `Show ${s}`,
        season,
        episode: e,
        path,
        pathKey: pathKey(path),
        relativePath: rel,
        fileName: rel.split('\\').pop() as string,
        sizeBytes: 500_000,
        mtimeMs: 1,
      })
    }
  }
  return list
}

function time<T>(fn: () => T): { result: T; ms: number } {
  const started = performance.now()
  const result = fn()
  return { result, ms: performance.now() - started }
}

describe('library queries at scale', () => {
  it('stay fast with 20,000 files, history and collections', { timeout: 120_000 }, () => {
    const db = openDatabase(':memory:')
    migrate(db, migrations)
    const library = new LibraryRepository(db)
    const folderId = library.insertFolder('D:\\Media', pathKey('D:\\Media'))
    const all = files()
    library.upsertFiles(folderId, 1, all)
    const history = new HistoryRepository(db)
    for (let i = 0; i < 2000; i++) {
      const f = all[i * 10] as ScannedFile
      history.upsert({
        pathKey: f.pathKey,
        path: f.path,
        positionSeconds: 600,
        durationSeconds: 5400,
        completed: i % 3 === 0,
        playCount: 1,
        lastWatchedAt: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
        audioTrackId: null,
        subtitleTrackId: null,
        speed: null,
      })
    }
    const query = new LibraryQueryRepository(db)
    const collections = new CollectionRepository(db)
    const c = collections.create('Big', 'playlist')
    const ids = query
      .query({ view: 'movies', limit: 1000 })
      .map((i) => i.fileId)
      .filter((id): id is number => id !== null)
    collections.addFiles(c.id, ids)

    // Generous bounds (slow CI machines); typical runs are far below them.
    const checks: [string, () => unknown[], number, number][] = [
      ['all media', () => query.query({ view: 'all' }), 20_000, 1500],
      ['movies by year', () => query.query({ view: 'movies', sort: 'year' }), MOVIES, 1500],
      ['search', () => query.query({ view: 'all', search: 'Movie 1234' }), 1, 500],
      ['continue watching', () => query.query({ view: 'continue-watching' }), 100, 500],
      ['shows', () => query.listShows(), SHOWS, 1000],
      ['one show', () => query.query({ view: 'all', showKey: 'show 7' }), EPISODES_PER_SHOW, 300],
      ['collection', () => query.query({ view: 'all', collectionId: c.id }), 1000, 500],
    ]
    const timings: string[] = []
    for (const [name, run, expected, budgetMs] of checks) {
      const { result, ms } = time(run)
      timings.push(`${name} ${ms.toFixed(0)} ms`)
      expect(result.length, name).toBeGreaterThanOrEqual(expected)
      expect(ms, `${name} took ${ms.toFixed(0)} ms`).toBeLessThan(budgetMs)
    }
    console.info(`library queries, 20,000 files: ${timings.join(', ')}`)
  })
})

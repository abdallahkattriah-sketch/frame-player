import { describe, expect, it, vi } from 'vitest'
import { initialPlayerState, type PlayerState } from '@shared/contracts/player'
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
import { HistoryService } from '../../../src/main/application/history-service'
import { pathKey } from '../../../src/main/library/path-key'

const blank: ParsedMediaName = {
  kind: 'unknown',
  title: null,
  year: null,
  season: null,
  episode: null,
  episodeEnd: null,
  episodeTitle: null,
  resolution: null,
  videoCodec: null,
  edition: null,
  releaseGroup: null,
}

function file(rel: string, parsed: Partial<ParsedMediaName>, size = 100): ScannedFile {
  const path = `C:\\Media\\${rel}`
  return {
    ...blank,
    ...parsed,
    path,
    pathKey: pathKey(path),
    relativePath: rel,
    fileName: rel.split('\\').pop() as string,
    sizeBytes: size,
    mtimeMs: 1,
  }
}

function setup() {
  const db = openDatabase(':memory:')
  migrate(db, migrations)
  const library = new LibraryRepository(db)
  const folderId = library.insertFolder('C:\\Media', pathKey('C:\\Media'))
  library.upsertFiles(folderId, 1, [
    file(
      'Matrix.1999.mkv',
      { kind: 'movie', title: 'The Matrix', year: 1999, resolution: '1080p' },
      500,
    ),
    file(
      'Amelie.2001.mkv',
      { kind: 'movie', title: 'Amélie', year: 2001, resolution: '720p' },
      300,
    ),
    file('100%_Wolf.mkv', { kind: 'movie', title: '100% Wolf', year: 2020 }),
    file('Show\\S01E02.mkv', {
      kind: 'episode',
      title: 'Show',
      season: 1,
      episode: 2,
      episodeTitle: 'Pilot Two',
    }),
    file('Show\\S01E01.mkv', { kind: 'episode', title: 'Show', season: 1, episode: 1 }),
    file('show\\S02E01.mkv', { kind: 'episode', title: 'show', season: 2, episode: 1 }),
    file('Anime - 05.mkv', { kind: 'episode', title: 'Anime', episode: 5 }),
    file('Gone.mkv', { kind: 'movie', title: 'Gone' }),
  ])
  // "Gone" disappears in the next scan.
  library.upsertFiles(folderId, 2, [])
  db.prepare("UPDATE media_files SET last_seen_scan = 2 WHERE file_name <> 'Gone.mkv'").run()
  library.markUnseenMissing(folderId, 2)

  const query = new LibraryQueryRepository(db)
  const history = new HistoryRepository(db)
  const id = (name: string) =>
    (db.prepare('SELECT id FROM media_files WHERE file_name = ?').get(name) as { id: number }).id
  return { db, query, history, id }
}

const titles = (items: { title: string | null; fileName: string }[]) =>
  items.map((i) => i.title ?? i.fileName)

describe('LibraryQueryRepository', () => {
  it('filters views by kind and hides missing files except in the missing view', () => {
    const { query } = setup()
    expect(titles(query.query({ view: 'movies' }))).toEqual(['100% Wolf', 'Amélie', 'The Matrix'])
    expect(titles(query.query({ view: 'all' }))).not.toContain('Gone')
    expect(titles(query.query({ view: 'missing' }))).toEqual(['Gone'])
  })

  it('sorts by year, size, and direction', () => {
    const { query } = setup()
    expect(titles(query.query({ view: 'movies', sort: 'year', direction: 'desc' }))).toEqual([
      '100% Wolf',
      'Amélie',
      'The Matrix',
    ])
    expect(titles(query.query({ view: 'movies', sort: 'size', direction: 'desc' }))[0]).toBe(
      'The Matrix',
    )
  })

  it('searches titles, file names, and episode titles, treating % literally', () => {
    const { query } = setup()
    expect(titles(query.query({ view: 'all', search: '100%' }))).toEqual(['100% Wolf'])
    expect(titles(query.query({ view: 'all', search: '%' }))).toEqual(['100% Wolf'])
    expect(titles(query.query({ view: 'all', search: 'pilot' }))).toEqual(['Show'])
    expect(titles(query.query({ view: 'all', search: 'matrix.1999' }))).toEqual(['The Matrix'])
  })

  it('groups shows case-insensitively and lists their episodes in order', () => {
    const { query } = setup()
    const shows = query.listShows()
    expect(shows.map((s) => [s.key, s.episodeCount, s.seasons, s.hasUnseasonedEpisodes])).toEqual([
      ['anime', 1, [], true],
      ['show', 3, [1, 2], false],
    ])
    const episodes = query.query({ view: 'episodes', showKey: 'show' })
    expect(episodes.map((e) => [e.season, e.episode])).toEqual([
      [1, 1],
      [1, 2],
      [2, 1],
    ])
  })

  it('filters by resolution and watched state, and supports favorites', () => {
    const { query, history, id } = setup()
    expect(titles(query.query({ view: 'movies', resolution: '720p' }))).toEqual(['Amélie'])
    expect(query.listResolutions()).toEqual(['1080p', '720p'])

    const matrix = query.getFile(id('Matrix.1999.mkv'))
    history.setWatched(
      matrix?.pathKey as string,
      matrix?.path as string,
      true,
      '2026-10-01T00:00:00Z',
    )
    expect(titles(query.query({ view: 'movies', watched: 'watched' }))).toEqual(['The Matrix'])
    expect(titles(query.query({ view: 'movies', watched: 'unwatched' }))).toEqual([
      '100% Wolf',
      'Amélie',
    ])

    query.setFavorite(id('Amelie.2001.mkv'), true)
    expect(titles(query.query({ view: 'favorites' }))).toEqual(['Amélie'])
  })

  it('builds continue watching from history, including files outside the library', () => {
    const { query, history, id } = setup()
    const amelie = query.getFile(id('Amelie.2001.mkv'))
    const base = {
      durationSeconds: 6000,
      completed: false,
      playCount: 1,
      audioTrackId: null,
      subtitleTrackId: null,
      speed: 1,
    }
    history.upsert({
      ...base,
      pathKey: amelie?.pathKey as string,
      path: amelie?.path as string,
      positionSeconds: 1200,
      lastWatchedAt: '2026-10-02T00:00:00Z',
    })
    history.upsert({
      ...base,
      pathKey: pathKey('D:\\Elsewhere\\clip.mp4'),
      path: 'D:\\Elsewhere\\clip.mp4',
      positionSeconds: 60,
      lastWatchedAt: '2026-10-03T00:00:00Z',
    })
    history.upsert({
      ...base,
      pathKey: pathKey('D:\\barely.mp4'),
      path: 'D:\\barely.mp4',
      positionSeconds: 2,
      lastWatchedAt: '2026-10-04T00:00:00Z',
    })

    const items = query.query({ view: 'continue-watching' })
    expect(items.map((i) => [i.fileName, i.fileId !== null, i.progress?.position])).toEqual([
      ['clip.mp4', false, 60],
      ['Amelie.2001.mkv', true, 1200],
    ])
    expect(query.getHistoryPath(items[0]?.historyKey as string)).toBe('D:\\Elsewhere\\clip.mp4')
    expect(query.query({ view: 'recently-watched' })).toHaveLength(3)
  })
})

describe('HistoryService', () => {
  function service(
    overrides: { resumePlayback?: boolean; completionThresholdPercent?: number } = {},
  ) {
    const { db, history } = setup()
    let now = new Date('2026-10-17T10:00:00Z')
    const onChanged = vi.fn()
    const svc = new HistoryService({
      repository: history,
      settings: () => ({ resumePlayback: true, completionThresholdPercent: 90, ...overrides }),
      onChanged,
      now: () => now,
      saveIntervalMs: 10_000,
    })
    const advance = (ms: number) => {
      now = new Date(now.getTime() + ms)
    }
    return { db, history, svc, advance, onChanged }
  }

  const playing = (
    path: string,
    position: number,
    extra: Partial<PlayerState> = {},
  ): PlayerState => ({
    ...initialPlayerState,
    status: 'ready',
    path,
    position,
    duration: 600,
    paused: false,
    ...extra,
  })

  it('throttles saves during playback and saves on pause', () => {
    const { svc, history, advance } = service()
    const key = pathKey('C:\\v.mkv')
    svc.onPlayerState(playing('C:\\v.mkv', 6))
    expect(history.get(key)?.positionSeconds).toBe(6)

    advance(3000)
    svc.onPlayerState(playing('C:\\v.mkv', 9))
    expect(history.get(key)?.positionSeconds).toBe(6) // throttled

    svc.onPlayerState(playing('C:\\v.mkv', 9.5, { paused: true }))
    expect(history.get(key)?.positionSeconds).toBe(9.5) // pause forces a save

    advance(11_000)
    svc.onPlayerState(playing('C:\\v.mkv', 20))
    expect(history.get(key)).toMatchObject({ positionSeconds: 20, playCount: 1, completed: false })
  })

  it('does not record files closed within the first seconds', () => {
    const { svc, history } = service()
    svc.onPlayerState(playing('C:\\brief.mkv', 2))
    svc.onSessionEnded(playing('C:\\brief.mkv', 3))
    expect(history.get(pathKey('C:\\brief.mkv'))).toBeUndefined()
  })

  it('marks completion at the configured threshold and at end of file', () => {
    const { svc, history } = service({ completionThresholdPercent: 80 })
    svc.onPlayerState(playing('C:\\a.mkv', 100))
    svc.onSessionEnded(playing('C:\\a.mkv', 490)) // 81.6%
    expect(history.get(pathKey('C:\\a.mkv'))).toMatchObject({ completed: true, positionSeconds: 0 })

    svc.onPlayerState(playing('C:\\b.mkv', 100))
    svc.onPlayerState(playing('C:\\b.mkv', 300, { eofReached: true }))
    expect(history.get(pathKey('C:\\b.mkv'))?.completed).toBe(true)
  })

  it('saves the previous file when the playlist moves on, and counts plays', () => {
    const { svc, history, onChanged } = service()
    svc.onPlayerState(playing('C:\\one.mkv', 30))
    svc.onPlayerState(playing('C:\\one.mkv', 45))
    svc.onPlayerState({ ...playing('C:\\two.mkv', 0), status: 'loading' })
    expect(history.get(pathKey('C:\\one.mkv'))).toMatchObject({ positionSeconds: 45, playCount: 1 })
    expect(onChanged).toHaveBeenCalled()
  })

  it('remembers selected tracks, with 0 meaning switched off', () => {
    const { svc, history } = service()
    const track = (id: number, type: 'audio' | 'sub', selected: boolean) => ({
      id,
      type,
      title: null,
      lang: null,
      codec: null,
      selected,
      external: false,
      isDefault: false,
      forced: false,
    })
    svc.onSessionEnded(
      playing('C:\\t.mkv', 60, {
        tracks: [track(1, 'audio', false), track(2, 'audio', true), track(1, 'sub', false)],
      }),
    )
    expect(history.get(pathKey('C:\\t.mkv'))).toMatchObject({ audioTrackId: 2, subtitleTrackId: 0 })
  })

  it('resumes only unfinished items away from the start and end, when enabled', () => {
    const { svc } = service()
    svc.onSessionEnded(playing('C:\\mid.mkv', 120))
    expect(svc.resumeFor('C:\\MID.mkv')).toMatchObject({ position: 120 }) // case-insensitive key
    svc.onSessionEnded(playing('C:\\end.mkv', 595, { duration: 6000 }))
    svc.onSessionEnded(playing('C:\\nearend.mkv', 400, { duration: 405 }))
    expect(svc.resumeFor('C:\\nearend.mkv')).toBeNull()
    expect(svc.resumeFor('C:\\never.mkv')).toBeNull()

    const disabled = service({ resumePlayback: false })
    disabled.svc.onSessionEnded(playing('C:\\mid.mkv', 120))
    expect(disabled.svc.resumeFor('C:\\mid.mkv')).toBeNull()
  })
})

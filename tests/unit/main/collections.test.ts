import { describe, expect, it } from 'vitest'
import type { ParsedMediaName } from '@shared/contracts/library'
import { collectionNameSchema, collectionTitleInputSchema } from '@shared/contracts/collections'
import { openDatabase } from '../../../src/main/database/connection'
import { migrate } from '../../../src/main/database/migrator'
import { migrations } from '../../../src/main/database/migrations'
import {
  LibraryRepository,
  type ScannedFile,
} from '../../../src/main/database/repositories/library-repository'
import { LibraryQueryRepository } from '../../../src/main/database/repositories/library-query-repository'
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
  resolution: null,
  videoCodec: null,
  edition: null,
  releaseGroup: null,
}

function file(name: string, title: string): ScannedFile {
  const path = `C:\\Media\\${name}`
  return {
    ...blank,
    title,
    path,
    pathKey: pathKey(path),
    relativePath: name,
    fileName: name,
    sizeBytes: 1,
    mtimeMs: 1,
  }
}

function setup() {
  const db = openDatabase(':memory:')
  migrate(db, migrations)
  const library = new LibraryRepository(db)
  const folderId = library.insertFolder('C:\\Media', pathKey('C:\\Media'))
  library.upsertFiles(folderId, 1, [
    file('a.mkv', 'Alpha'),
    file('b.mkv', 'Bravo'),
    file('c.mkv', 'Charlie'),
  ])
  const query = new LibraryQueryRepository(db)
  const ids = Object.fromEntries(
    query.query({ view: 'all' }).map((i) => [i.title as string, i.fileId as number]),
  ) as Record<'Alpha' | 'Bravo' | 'Charlie', number>
  return { db, library, folderId, query, ids, collections: new CollectionRepository(db) }
}

describe('collections', () => {
  it('keeps files in the user’s order, without duplicates', () => {
    const { collections, query, ids } = setup()
    const c = collections.create('Weekend', 'playlist')
    expect(collections.addFiles(c.id, [ids.Charlie, ids.Alpha, ids.Charlie, 9999])).toBe(2)
    expect(collections.addFiles(c.id, [ids.Alpha, ids.Bravo])).toBe(1)
    const titles = () => query.query({ view: 'all', collectionId: c.id }).map((i) => i.title)
    expect(titles()).toEqual(['Charlie', 'Alpha', 'Bravo'])
    collections.moveFile(c.id, ids.Bravo, 0)
    expect(titles()).toEqual(['Bravo', 'Charlie', 'Alpha'])
    collections.removeFile(c.id, ids.Charlie)
    expect(titles()).toEqual(['Bravo', 'Alpha'])
    expect(collections.list()).toEqual([
      { id: c.id, name: 'Weekend', kind: 'playlist', itemCount: 2 },
    ])
    // Other sorts still work inside a collection; manual order outside one falls back to title.
    expect(
      query.query({ view: 'all', collectionId: c.id, sort: 'title' }).map((i) => i.title),
    ).toEqual(['Alpha', 'Bravo'])
    expect(query.query({ view: 'all', sort: 'manual' }).map((i) => i.title)).toEqual([
      'Alpha',
      'Bravo',
      'Charlie',
    ])
  })

  it('renames, reorders and deletes collections without touching library files', () => {
    const { collections, query, ids } = setup()
    const a = collections.create('First', 'collection')
    const b = collections.create('Second', 'collection')
    collections.addFiles(a.id, [ids.Alpha])
    collections.move(b.id, 'up')
    expect(collections.list().map((c) => c.name)).toEqual(['Second', 'First'])
    collections.move(b.id, 'up') // already first: no change
    expect(collections.list().map((c) => c.name)).toEqual(['Second', 'First'])
    expect(collections.rename(a.id, 'Favourites 2026')).toBe(true)
    expect(collections.delete(a.id)).toBe(true)
    expect(collections.list().map((c) => c.name)).toEqual(['Second'])
    expect(query.query({ view: 'all' })).toHaveLength(3)
  })

  it('finds videos by the name of a collection they are in', () => {
    const { collections, query, ids } = setup()
    const c = collections.create('Oscar winners', 'collection')
    collections.addFiles(c.id, [ids.Bravo])
    expect(query.query({ view: 'all', search: 'oscar' }).map((i) => i.title)).toEqual(['Bravo'])
  })

  it('drops membership when a library folder is removed', () => {
    const { collections, library, folderId, ids } = setup()
    const c = collections.create('Mix', 'playlist')
    collections.addFiles(c.id, [ids.Alpha, ids.Bravo])
    library.deleteFolder(folderId)
    expect(collections.list()[0]?.itemCount).toBe(0)
  })

  it('validates names', () => {
    expect(collectionNameSchema.safeParse('  Movie night  ').data).toBe('Movie night')
    expect(collectionNameSchema.safeParse('   ').success).toBe(false)
    expect(collectionNameSchema.safeParse('a\u0007b').success).toBe(false)
    expect(collectionNameSchema.safeParse('x'.repeat(101)).success).toBe(false)
  })
})

describe('collection titles (TMDB movies and shows)', () => {
  const dune = {
    mediaType: 'movie' as const,
    tmdbId: 438631,
    title: 'Dune',
    year: 2021,
    posterPath: '/dune.jpg',
  }
  const show = {
    mediaType: 'tv' as const,
    tmdbId: 1396,
    title: 'Breaking Bad',
    year: 2008,
    posterPath: null,
  }

  it('saves titles beside files, marks the ones in the library, and counts both', () => {
    const { db, collections, ids } = setup()
    const c = collections.create('Watchlist', 'collection')
    collections.addFiles(c.id, [ids.Alpha])
    expect(collections.addTitle(c.id, dune)).toBe(true)
    expect(collections.addTitle(c.id, show)).toBe(true)
    // Saving again does not duplicate; it refreshes the stored details.
    collections.addTitle(c.id, { ...dune, title: 'Dune: Part One' })
    expect(collections.get(c.id)?.itemCount).toBe(3)

    db.prepare(
      `INSERT INTO media_matches (target_type, target_key, status, tmdb_media_type, tmdb_id, updated_at)
       VALUES ('show', 'breaking bad', 'matched', 'tv', 1396, '2026-01-01')`,
    ).run()
    expect(collections.titles(c.id).map((t) => [t.title, t.inLibrary])).toEqual([
      ['Dune: Part One', false],
      ['Breaking Bad', true],
    ])
    expect(collections.containing({ mediaType: 'tv', tmdbId: 1396 })).toEqual([c.id])
    expect(collections.containing({ fileId: ids.Alpha })).toEqual([c.id])
    expect(collections.containing({ fileId: ids.Bravo })).toEqual([])
  })

  it('removes titles, refuses unknown collections, and cascades on delete', () => {
    const { collections } = setup()
    const c = collections.create('Later', 'collection')
    expect(collections.addTitle(9999, dune)).toBe(false)
    collections.addTitle(c.id, dune)
    expect(collections.removeTitle(c.id, 'movie', dune.tmdbId)).toBe(true)
    expect(collections.removeTitle(c.id, 'movie', dune.tmdbId)).toBe(false)
    collections.addTitle(c.id, show)
    collections.delete(c.id)
    expect(collections.containing({ mediaType: 'tv', tmdbId: 1396 })).toEqual([])
  })

  it('validates titles crossing the IPC boundary', () => {
    expect(collectionTitleInputSchema.safeParse(dune).success).toBe(true)
    for (const bad of [
      { ...dune, posterPath: '../../secret.jpg' },
      { ...dune, posterPath: 'https://evil.example/x.jpg' },
      { ...dune, mediaType: 'person' },
      { ...dune, title: '' },
      { ...dune, extra: true },
    ]) {
      expect(collectionTitleInputSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false)
    }
  })
})

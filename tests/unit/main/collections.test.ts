import { describe, expect, it } from 'vitest'
import type { ParsedMediaName } from '@shared/contracts/library'
import { collectionNameSchema } from '@shared/contracts/collections'
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

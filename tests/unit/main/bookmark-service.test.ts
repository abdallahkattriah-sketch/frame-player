import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { openDatabase } from '../../../src/main/database/connection'
import { migrate } from '../../../src/main/database/migrator'
import { migrations } from '../../../src/main/database/migrations'
import { BookmarkRepository } from '../../../src/main/database/repositories/bookmark-repository'
import { BookmarkService } from '../../../src/main/application/bookmark-service'
import { useTempDirs } from './temp-dir'

const tempDir = useTempDirs()

function setup() {
  const db = openDatabase(':memory:')
  migrate(db, migrations)
  const dir = tempDir()
  const thumbs = {
    bookmark: vi.fn(async (_video: string, _seconds: number, id: number) => {
      await new Promise((r) => setTimeout(r, 0))
      mkdirSync(join(dir, 'bookmarks'), { recursive: true })
      writeFileSync(join(dir, 'bookmarks', `${id}.jpg`), 'jpeg')
      return true
    }),
    removeBookmark: vi.fn(),
    resolve: (_kind: 'bookmark', pathname: string) => join(dir, 'bookmarks', pathname.slice(1)),
  }
  const onChanged = vi.fn()
  const service = new BookmarkService({
    repository: new BookmarkRepository(db),
    thumbnails: thumbs,
    onChanged,
    now: () => new Date('2026-10-17T12:00:00Z'),
  })
  return { service, thumbs, onChanged }
}

describe('BookmarkService', () => {
  it('adds bookmarks per file (case-insensitively on Windows) in time order', async () => {
    const { service } = setup()
    await service.add('C:\\Videos\\Film.mkv', 95.25)
    await service.add('C:\\Videos\\Film.mkv', 10)
    await service.add('C:\\Videos\\Other.mkv', 5)
    const list = service.list('c:\\videos\\FILM.mkv')
    expect(list.map((b) => b.position)).toEqual([10, 95.25])
    expect(list[0]).toMatchObject({
      title: null,
      note: null,
      createdAt: '2026-10-17T12:00:00.000Z',
    })
  })

  it('creates a thumbnail in the background and reports the change', async () => {
    const { service, thumbs, onChanged } = setup()
    const added = await service.add('C:\\Videos\\Film.mkv', 42)
    expect(added.thumbnailUrl).toBeNull()
    await vi.waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(thumbs.bookmark).toHaveBeenCalledWith('C:\\Videos\\Film.mkv', 42, added.id)
    expect(service.list('C:\\Videos\\Film.mkv')[0]?.thumbnailUrl).toBe(
      `frame-art://bookmark/${added.id}.jpg`,
    )
  })

  it('edits and clears titles and notes, and removes the thumbnail with the bookmark', async () => {
    const { service, thumbs } = setup()
    const { id } = await service.add('C:\\Videos\\Film.mkv', 1)
    expect(service.edit(id, { title: 'Opening', note: 'Great shot' })).toBe(true)
    expect(service.list('C:\\Videos\\Film.mkv')[0]).toMatchObject({
      title: 'Opening',
      note: 'Great shot',
    })
    service.edit(id, { note: '' })
    expect(service.list('C:\\Videos\\Film.mkv')[0]).toMatchObject({ title: 'Opening', note: null })
    expect(service.remove(id)).toBe(true)
    expect(thumbs.removeBookmark).toHaveBeenCalledWith(id)
    expect(service.list('C:\\Videos\\Film.mkv')).toEqual([])
    expect(service.edit(id, { title: 'x' })).toBe(false)
  })
})

import { existsSync } from 'node:fs'
import type { Bookmark, BookmarkEdit } from '@shared/contracts/bookmarks'
import type { BookmarkRepository, BookmarkRow } from '../database/repositories/bookmark-repository'
import type { ThumbnailService } from '../media-engine/thumbnail-service'
import { pathKey } from '../library/path-key'

export interface BookmarkServiceOptions {
  repository: BookmarkRepository
  thumbnails: Pick<ThumbnailService, 'bookmark' | 'removeBookmark'> & {
    resolve: (kind: 'bookmark', pathname: string) => string | null
  }
  /** Bookmarks changed outside a direct request (e.g. a thumbnail finished). */
  onChanged: () => void
  now?: () => Date
}

export class BookmarkService {
  constructor(private readonly options: BookmarkServiceOptions) {}

  list(videoPath: string): Bookmark[] {
    return this.options.repository.listFor(pathKey(videoPath)).map((row) => this.toBookmark(row))
  }

  /** Adds a bookmark; its thumbnail is generated afterwards and announced via onChanged. */
  async add(videoPath: string, position: number): Promise<Bookmark> {
    const row = this.options.repository.add({
      pathKey: pathKey(videoPath),
      path: videoPath,
      position: Math.max(0, position),
      title: null,
      note: null,
      createdAt: (this.options.now?.() ?? new Date()).toISOString(),
    })
    void this.options.thumbnails
      .bookmark(videoPath, row.position, row.id)
      .then((ok) => {
        if (ok) this.options.onChanged()
      })
      .catch(() => undefined)
    return this.toBookmark(row)
  }

  edit(id: number, edit: BookmarkEdit): boolean {
    return this.options.repository.update(id, edit)
  }

  remove(id: number): boolean {
    const removed = this.options.repository.delete(id)
    if (removed) this.options.thumbnails.removeBookmark(id)
    return removed
  }

  private toBookmark(row: BookmarkRow): Bookmark {
    const name = `/${row.id}.jpg`
    const file = this.options.thumbnails.resolve('bookmark', name)
    return {
      id: row.id,
      position: row.position,
      title: row.title,
      note: row.note,
      createdAt: row.createdAt,
      thumbnailUrl: file && existsSync(file) ? `frame-art://bookmark${name}` : null,
    }
  }
}

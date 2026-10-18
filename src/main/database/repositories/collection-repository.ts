import type {
  Collection,
  CollectionKind,
  CollectionTarget,
  CollectionTitle,
  CollectionTitleInput,
} from '@shared/contracts/collections'
import { transaction, type Database } from '../connection'

/** Collections and playlists of library files, each in a user-defined order. */
export class CollectionRepository {
  constructor(
    private readonly db: Database,
    private readonly now: () => Date = () => new Date(),
  ) {}

  list(): Collection[] {
    return this.db
      .prepare(
        `SELECT c.id, c.name, c.kind,
                (SELECT COUNT(*) FROM collection_items ci WHERE ci.collection_id = c.id) +
                (SELECT COUNT(*) FROM collection_titles ct WHERE ct.collection_id = c.id) AS itemCount
         FROM collections c ORDER BY c.sort_order, c.id`,
      )
      .all() as unknown as Collection[]
  }

  get(id: number): Collection | undefined {
    return this.list().find((c) => c.id === id)
  }

  create(name: string, kind: CollectionKind): Collection {
    const next = this.db
      .prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM collections')
      .get() as { n: number }
    const result = this.db
      .prepare('INSERT INTO collections (name, kind, sort_order, created_at) VALUES (?, ?, ?, ?)')
      .run(name, kind, next.n, this.now().toISOString())
    return { id: Number(result.lastInsertRowid), name, kind, itemCount: 0 }
  }

  rename(id: number, name: string): boolean {
    return this.db.prepare('UPDATE collections SET name = ? WHERE id = ?').run(name, id).changes > 0
  }

  /** Deletes the collection and its membership rows; library files are unaffected. */
  delete(id: number): boolean {
    return this.db.prepare('DELETE FROM collections WHERE id = ?').run(id).changes > 0
  }

  /** Moves a collection one place up or down in the sidebar order. */
  move(id: number, direction: 'up' | 'down'): void {
    transaction(this.db, () => {
      const ids = this.list().map((c) => c.id)
      const from = ids.indexOf(id)
      const to = from + (direction === 'up' ? -1 : 1)
      if (from < 0 || to < 0 || to >= ids.length) return
      ;[ids[from], ids[to]] = [ids[to] as number, ids[from] as number]
      const update = this.db.prepare('UPDATE collections SET sort_order = ? WHERE id = ?')
      ids.forEach((cid, index) => update.run(index, cid))
    })
  }

  /** Appends files that are not already in the collection. Returns how many were added. */
  addFiles(id: number, fileIds: readonly number[]): number {
    return transaction(this.db, () => {
      const exists = this.db.prepare('SELECT 1 FROM collections WHERE id = ?').get(id)
      if (!exists) return 0
      const start = this.db
        .prepare(
          'SELECT COALESCE(MAX(position), -1) + 1 AS n FROM collection_items WHERE collection_id = ?',
        )
        .get(id) as { n: number }
      const insert = this.db.prepare(
        `INSERT OR IGNORE INTO collection_items (collection_id, file_id, position, added_at)
         SELECT ?, id, ?, ? FROM media_files WHERE id = ?`,
      )
      const addedAt = this.now().toISOString()
      let added = 0
      for (const fileId of new Set(fileIds)) {
        added += Number(insert.run(id, start.n + added, addedAt, fileId).changes)
      }
      return added
    })
  }

  removeFile(id: number, fileId: number): boolean {
    return transaction(this.db, () => {
      const removed =
        this.db
          .prepare('DELETE FROM collection_items WHERE collection_id = ? AND file_id = ?')
          .run(id, fileId).changes > 0
      if (removed) this.renumber(id, this.fileOrder(id))
      return removed
    })
  }

  /** Moves a file to `toIndex` (clamped) within the collection's manual order. */
  moveFile(id: number, fileId: number, toIndex: number): boolean {
    return transaction(this.db, () => {
      const order = this.fileOrder(id)
      const from = order.indexOf(fileId)
      if (from < 0) return false
      order.splice(from, 1)
      order.splice(Math.max(0, Math.min(toIndex, order.length)), 0, fileId)
      this.renumber(id, order)
      return true
    })
  }

  fileOrder(id: number): number[] {
    return (
      this.db
        .prepare(
          'SELECT file_id AS fileId FROM collection_items WHERE collection_id = ? ORDER BY position',
        )
        .all(id) as { fileId: number }[]
    ).map((r) => r.fileId)
  }

  /** Saves a TMDB title; saving it again refreshes its title, year, and poster. */
  addTitle(id: number, title: CollectionTitleInput): boolean {
    const exists = this.db.prepare('SELECT 1 FROM collections WHERE id = ?').get(id)
    if (!exists) return false
    this.db
      .prepare(
        `INSERT INTO collection_titles
           (collection_id, media_type, tmdb_id, title, year, poster_path, added_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (collection_id, media_type, tmdb_id)
         DO UPDATE SET title = excluded.title, year = excluded.year, poster_path = excluded.poster_path`,
      )
      .run(
        id,
        title.mediaType,
        title.tmdbId,
        title.title,
        title.year,
        title.posterPath,
        this.now().toISOString(),
      )
    return true
  }

  removeTitle(id: number, mediaType: CollectionTitle['mediaType'], tmdbId: number): boolean {
    return (
      this.db
        .prepare(
          'DELETE FROM collection_titles WHERE collection_id = ? AND media_type = ? AND tmdb_id = ?',
        )
        .run(id, mediaType, tmdbId).changes > 0
    )
  }

  /** Saved titles in the order they were added, each marked if the library has it. */
  titles(id: number): CollectionTitle[] {
    const rows = this.db
      .prepare(
        `SELECT ct.media_type AS mediaType, ct.tmdb_id AS tmdbId, ct.title, ct.year,
                ct.poster_path AS posterPath, ct.added_at AS addedAt,
                EXISTS (SELECT 1 FROM media_matches m
                        WHERE m.status = 'matched' AND m.tmdb_media_type = ct.media_type
                          AND m.tmdb_id = ct.tmdb_id) AS inLibrary
         FROM collection_titles ct WHERE ct.collection_id = ?
         ORDER BY ct.added_at, ct.rowid`,
      )
      .all(id) as unknown as (Omit<CollectionTitle, 'inLibrary'> & { inLibrary: number })[]
    return rows.map((r) => ({ ...r, inLibrary: r.inLibrary === 1 }))
  }

  /** Ids of the collections that hold this file or title. */
  containing(target: CollectionTarget): number[] {
    const rows = (
      'fileId' in target
        ? this.db
            .prepare('SELECT collection_id AS id FROM collection_items WHERE file_id = ?')
            .all(target.fileId)
        : this.db
            .prepare(
              'SELECT collection_id AS id FROM collection_titles WHERE media_type = ? AND tmdb_id = ?',
            )
            .all(target.mediaType, target.tmdbId)
    ) as { id: number }[]
    return rows.map((r) => r.id)
  }

  private renumber(id: number, order: readonly number[]) {
    const update = this.db.prepare(
      'UPDATE collection_items SET position = ? WHERE collection_id = ? AND file_id = ?',
    )
    order.forEach((fileId, index) => update.run(index, id, fileId))
  }
}

import type { Database } from '../connection'

export interface BookmarkRow {
  id: number
  pathKey: string
  path: string
  position: number
  title: string | null
  note: string | null
  createdAt: string
}

const columns = `id, path_key AS pathKey, path, position_seconds AS position, title, note,
  created_at AS createdAt`

export class BookmarkRepository {
  constructor(private readonly db: Database) {}

  listFor(pathKey: string): BookmarkRow[] {
    return this.db
      .prepare(`SELECT ${columns} FROM bookmarks WHERE path_key = ? ORDER BY position_seconds, id`)
      .all(pathKey) as unknown as BookmarkRow[]
  }

  get(id: number): BookmarkRow | undefined {
    return this.db.prepare(`SELECT ${columns} FROM bookmarks WHERE id = ?`).get(id) as
      BookmarkRow | undefined
  }

  add(row: Omit<BookmarkRow, 'id'>): BookmarkRow {
    const result = this.db
      .prepare(
        `INSERT INTO bookmarks (path_key, path, position_seconds, title, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(row.pathKey, row.path, row.position, row.title, row.note, row.createdAt)
    return { ...row, id: Number(result.lastInsertRowid) }
  }

  /** Empty strings clear the field. Returns false if the bookmark does not exist. */
  update(id: number, edit: { title?: string; note?: string }): boolean {
    const current = this.get(id)
    if (!current) return false
    const title = edit.title === undefined ? current.title : edit.title || null
    const note = edit.note === undefined ? current.note : edit.note || null
    this.db.prepare(`UPDATE bookmarks SET title = ?, note = ? WHERE id = ?`).run(title, note, id)
    return true
  }

  delete(id: number): boolean {
    return this.db.prepare(`DELETE FROM bookmarks WHERE id = ?`).run(id).changes > 0
  }
}

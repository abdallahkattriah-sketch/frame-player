import { DatabaseSync } from 'node:sqlite'

export type Database = DatabaseSync

export function openDatabase(path: string): Database {
  const db = new DatabaseSync(path, { enableForeignKeyConstraints: true })
  try {
    db.exec('PRAGMA journal_mode = WAL')
    db.exec('PRAGMA synchronous = NORMAL')
    db.exec('PRAGMA busy_timeout = 5000')
    return db
  } catch (error) {
    // A corrupt file fails here; release the handle so the file can be moved aside.
    db.close()
    throw error
  }
}

/** Runs `fn` inside a write transaction; rolls back and rethrows on failure. */
export function transaction<T>(db: Database, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

/** SQL string literal for paths used in statements that cannot take parameters (e.g. VACUUM INTO). */
export function sqlStringLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

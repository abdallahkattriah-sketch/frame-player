import { existsSync, mkdirSync, renameSync } from 'node:fs'
import { basename, join } from 'node:path'
import { openDatabase, type Database } from './connection'
import { migrate, SchemaTooNewError } from './migrator'
import type { Migration } from './migrations'

export interface OpenAppDatabaseOptions {
  dbPath: string
  backupDir: string
  migrations: readonly Migration[]
  now?: () => Date
}

export interface OpenAppDatabaseResult {
  db: Database
  /** Set when the previous database was unreadable and has been moved aside. */
  recoveredFrom?: { backupPath: string; reason: string }
}

/**
 * Opens and migrates the app database. A corrupt database is moved into the backup
 * directory (never deleted) and replaced with a fresh one. A database written by a
 * newer Frame version is left untouched and the error is rethrown.
 */
export function openAppDatabase(options: OpenAppDatabaseOptions): OpenAppDatabaseResult {
  const now = options.now ?? (() => new Date())
  try {
    return { db: openAndMigrate(options, now) }
  } catch (error) {
    if (error instanceof SchemaTooNewError || !existsSync(options.dbPath)) throw error
    const reason = error instanceof Error ? error.message : String(error)
    const backupPath = quarantine(options.dbPath, options.backupDir, now)
    return { db: openAndMigrate(options, now), recoveredFrom: { backupPath, reason } }
  }
}

function openAndMigrate(options: OpenAppDatabaseOptions, now: () => Date): Database {
  const db = openDatabase(options.dbPath)
  try {
    assertIntegrity(db)
    migrate(db, options.migrations, { backupDir: options.backupDir, now })
    return db
  } catch (error) {
    db.close()
    throw error
  }
}

function assertIntegrity(db: Database) {
  const row = db.prepare('PRAGMA quick_check').get() as { quick_check?: string } | undefined
  if (row?.quick_check !== 'ok') {
    throw new Error(`Database integrity check failed: ${row?.quick_check ?? 'no result'}`)
  }
}

function quarantine(dbPath: string, backupDir: string, now: () => Date): string {
  mkdirSync(backupDir, { recursive: true })
  const stamp = now().toISOString().replaceAll(':', '-')
  const target = join(backupDir, `${basename(dbPath)}.corrupt-${stamp}`)
  renameSync(dbPath, target)
  for (const suffix of ['-wal', '-shm']) {
    if (existsSync(dbPath + suffix)) renameSync(dbPath + suffix, target + suffix)
  }
  return target
}

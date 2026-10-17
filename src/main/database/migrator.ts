import { mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { sqlStringLiteral, transaction, type Database } from './connection'
import type { Migration } from './migrations'

const MAX_MIGRATION_BACKUPS = 5

export class SchemaTooNewError extends Error {
  constructor(
    readonly databaseVersion: number,
    readonly supportedVersion: number,
  ) {
    super(
      `Database schema version ${databaseVersion} is newer than this version of Frame supports (${supportedVersion}).`,
    )
    this.name = 'SchemaTooNewError'
  }
}

export function getSchemaVersion(db: Database): number {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number } | undefined
  return row?.user_version ?? 0
}

export interface MigrateOptions {
  /** Directory for a pre-migration snapshot of an existing database. Omit to skip backups. */
  backupDir?: string
  now?: () => Date
}

export interface MigrateResult {
  from: number
  to: number
  backupPath?: string
}

export function migrate(
  db: Database,
  all: readonly Migration[],
  options: MigrateOptions = {},
): MigrateResult {
  const sorted = [...all].sort((a, b) => a.version - b.version)
  const latest = sorted.at(-1)?.version ?? 0
  const from = getSchemaVersion(db)

  if (from > latest) throw new SchemaTooNewError(from, latest)

  const pending = sorted.filter((m) => m.version > from)
  if (pending.length === 0) return { from, to: from }

  let backupPath: string | undefined
  if (from > 0 && options.backupDir) {
    backupPath = backupBeforeMigration(
      db,
      options.backupDir,
      from,
      options.now ?? (() => new Date()),
    )
  }

  for (const migration of pending) {
    transaction(db, () => {
      db.exec(migration.sql)
      db.exec(`PRAGMA user_version = ${migration.version}`)
    })
  }

  return { from, to: getSchemaVersion(db), backupPath }
}

function backupBeforeMigration(db: Database, dir: string, version: number, now: () => Date) {
  mkdirSync(dir, { recursive: true })
  const stamp = now().toISOString().replaceAll(':', '-')
  const path = join(dir, `frame-v${version}-${stamp}.db`)
  db.exec(`VACUUM INTO ${sqlStringLiteral(path)}`)
  pruneBackups(dir)
  return path
}

function pruneBackups(dir: string) {
  const backups = readdirSync(dir)
    .filter((name) => /^frame-v\d+-.+\.db$/.test(name))
    .sort()
  for (const name of backups.slice(0, Math.max(0, backups.length - MAX_MIGRATION_BACKUPS))) {
    rmSync(join(dir, name), { force: true })
  }
}

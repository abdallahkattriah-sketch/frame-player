import { existsSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { openDatabase } from '../../../src/main/database/connection'
import { getSchemaVersion, migrate, SchemaTooNewError } from '../../../src/main/database/migrator'
import {
  latestSchemaVersion,
  migrations,
  type Migration,
} from '../../../src/main/database/migrations'
import { openAppDatabase } from '../../../src/main/database/open-app-database'
import { useTempDirs } from './temp-dir'

const tempDir = useTempDirs()

function tableNames(db: ReturnType<typeof openDatabase>): string[] {
  return (
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as {
      name: string
    }[]
  ).map((r) => r.name)
}

describe('migrate', () => {
  it('brings a fresh database to the latest version', () => {
    const db = openDatabase(':memory:')
    const result = migrate(db, migrations)
    expect(result).toEqual({ from: 0, to: latestSchemaVersion })
    expect(tableNames(db)).toEqual(expect.arrayContaining(['app_settings', 'provider_config']))
    db.close()
  })

  it('is a no-op when already current', () => {
    const db = openDatabase(':memory:')
    migrate(db, migrations)
    expect(migrate(db, migrations)).toEqual({
      from: latestSchemaVersion,
      to: latestSchemaVersion,
    })
    db.close()
  })

  it('applies only pending migrations to an older database and backs it up first', () => {
    const dir = tempDir()
    const dbPath = join(dir, 'frame.db')
    const v1: Migration = { version: 1, name: 'a', sql: 'CREATE TABLE a (x TEXT) STRICT;' }
    const v2: Migration = { version: 2, name: 'b', sql: 'CREATE TABLE b (y TEXT) STRICT;' }

    const old = openDatabase(dbPath)
    migrate(old, [v1])
    old.prepare('INSERT INTO a (x) VALUES (?)').run('kept')
    old.close()

    const db = openDatabase(dbPath)
    const result = migrate(db, [v1, v2], { backupDir: join(dir, 'backups') })
    expect(result.from).toBe(1)
    expect(result.to).toBe(2)
    expect(db.prepare('SELECT x FROM a').get()).toEqual({ x: 'kept' })
    expect(result.backupPath && existsSync(result.backupPath)).toBe(true)
    db.close()

    const backup = openDatabase(result.backupPath as string)
    expect(getSchemaVersion(backup)).toBe(1)
    backup.close()
  })

  it('rolls back a failing migration and keeps the previous version', () => {
    const db = openDatabase(':memory:')
    const good: Migration = { version: 1, name: 'good', sql: 'CREATE TABLE a (x TEXT) STRICT;' }
    const bad: Migration = {
      version: 2,
      name: 'bad',
      sql: 'CREATE TABLE b (y TEXT) STRICT; THIS IS NOT SQL;',
    }
    expect(() => migrate(db, [good, bad])).toThrow()
    expect(getSchemaVersion(db)).toBe(1)
    expect(tableNames(db)).not.toContain('b')
    db.close()
  })

  it('refuses a database from a newer Frame version', () => {
    const db = openDatabase(':memory:')
    db.exec(`PRAGMA user_version = ${latestSchemaVersion + 1}`)
    expect(() => migrate(db, migrations)).toThrow(SchemaTooNewError)
    db.close()
  })
})

describe('openAppDatabase', () => {
  it('creates and migrates a new database', () => {
    const dir = tempDir()
    const { db, recoveredFrom } = openAppDatabase({
      dbPath: join(dir, 'frame.db'),
      backupDir: join(dir, 'backups'),
      migrations,
    })
    expect(recoveredFrom).toBeUndefined()
    expect(getSchemaVersion(db)).toBe(latestSchemaVersion)
    db.close()
  })

  it('moves a corrupt database aside and starts fresh', () => {
    const dir = tempDir()
    const dbPath = join(dir, 'frame.db')
    writeFileSync(dbPath, 'this is not a sqlite database'.repeat(200))

    const { db, recoveredFrom } = openAppDatabase({
      dbPath,
      backupDir: join(dir, 'backups'),
      migrations,
    })

    expect(recoveredFrom?.backupPath).toBeDefined()
    expect(existsSync(recoveredFrom?.backupPath as string)).toBe(true)
    expect(readdirSync(join(dir, 'backups'))).toHaveLength(1)
    expect(getSchemaVersion(db)).toBe(latestSchemaVersion)
    db.close()
  })

  it('does not touch a database written by a newer version', () => {
    const dir = tempDir()
    const dbPath = join(dir, 'frame.db')
    const future = openDatabase(dbPath)
    future.exec(`PRAGMA user_version = ${latestSchemaVersion + 5}`)
    future.close()

    expect(() => openAppDatabase({ dbPath, backupDir: join(dir, 'backups'), migrations })).toThrow(
      SchemaTooNewError,
    )
    expect(existsSync(dbPath)).toBe(true)
    expect(existsSync(join(dir, 'backups'))).toBe(false)
  })
})

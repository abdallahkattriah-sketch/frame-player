import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { openDatabase } from '../../../src/main/database/connection'
import { migrate } from '../../../src/main/database/migrator'
import { migrations } from '../../../src/main/database/migrations'
import { SettingsRepository } from '../../../src/main/database/repositories/settings-repository'
import { SettingsService } from '../../../src/main/application/settings-service'
import { defaultSettings } from '@shared/settings/schema'
import { useTempDirs } from './temp-dir'

const tempDir = useTempDirs()

function serviceFor(path: string, warn = vi.fn()) {
  const db = openDatabase(path)
  migrate(db, migrations)
  const repo = new SettingsRepository(db)
  return { db, repo, warn, service: new SettingsService(repo, warn) }
}

describe('SettingsService', () => {
  it('returns defaults when nothing is stored', () => {
    const { db, service } = serviceFor(':memory:')
    expect(service.get()).toEqual(defaultSettings)
    db.close()
  })

  it('persists updates across reopening the database', () => {
    const path = join(tempDir(), 'frame.db')
    const first = serviceFor(path)
    const updated = first.service.update({ playback: { seekStepSeconds: 30 } })
    expect(updated.playback.seekStepSeconds).toBe(30)
    expect(updated.playback.resumePlayback).toBe(defaultSettings.playback.resumePlayback)
    first.db.close()

    const second = serviceFor(path)
    expect(second.service.get().playback.seekStepSeconds).toBe(30)
    second.db.close()
  })

  it('rejects invalid values without writing anything', () => {
    const { db, repo, service } = serviceFor(':memory:')
    expect(() => service.update({ playback: { seekStepSeconds: 0 } })).toThrow()
    expect(repo.getAll()).toEqual([])
    db.close()
  })

  it('falls back to defaults for a corrupt or invalid section only', () => {
    const { db, repo, warn, service } = serviceFor(':memory:')
    repo.upsert('playback', '{not json')
    repo.upsert('privacy', JSON.stringify({ onlineMetadataEnabled: 'yes' }))
    repo.upsert('appearance', JSON.stringify({ themeId: 'custom' }))

    const settings = service.get()
    expect(settings.playback).toEqual(defaultSettings.playback)
    expect(settings.privacy).toEqual(defaultSettings.privacy)
    expect(settings.appearance.themeId).toBe('custom')
    expect(warn).toHaveBeenCalledTimes(2)
    db.close()
  })

  it('fills fields missing from an older stored section with defaults', () => {
    const { db, repo, service } = serviceFor(':memory:')
    repo.upsert('playback', JSON.stringify({ seekStepSeconds: 5 }))
    expect(service.get().playback).toEqual({ ...defaultSettings.playback, seekStepSeconds: 5 })
    db.close()
  })
})

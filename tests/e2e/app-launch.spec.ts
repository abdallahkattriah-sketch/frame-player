import { expect, test } from '@playwright/test'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchApp } from './launch-app'

let userDataDir: string

test.beforeEach(() => {
  userDataDir = mkdtempSync(join(tmpdir(), 'frame e2e بيانات '))
})

test.afterEach(() => {
  rmSync(userDataDir, { recursive: true, force: true })
})

test('app launches with an isolated renderer and a working bridge', async () => {
  const app = await launchApp(userDataDir)
  try {
    const page = await app.firstWindow()

    const globals = await page.evaluate(() => {
      const g = globalThis as Record<string, unknown>
      return {
        require: typeof g['require'],
        process: typeof g['process'],
        frame: typeof g['frame'],
      }
    })
    expect(globals).toEqual({ require: 'undefined', process: 'undefined', frame: 'object' })

    await expect(page.getByTestId('app-info')).toContainText('Electron')
    expect(existsSync(join(userDataDir, 'frame.db'))).toBe(true)
  } finally {
    await app.close()
  }
})

test('settings persist across restarts', async () => {
  const first = await launchApp(userDataDir)
  try {
    const page = await first.firstWindow()
    const updated = await page.evaluate(() =>
      window.frame.settings.update({ playback: { seekStepSeconds: 42 } }),
    )
    expect(updated.playback.seekStepSeconds).toBe(42)
  } finally {
    await first.close()
  }

  const second = await launchApp(userDataDir)
  try {
    const page = await second.firstWindow()
    const settings = await page.evaluate(() => window.frame.settings.get())
    expect(settings.playback.seekStepSeconds).toBe(42)
  } finally {
    await second.close()
  }
})

test('invalid IPC arguments are rejected', async () => {
  const app = await launchApp(userDataDir)
  try {
    const page = await app.firstWindow()
    const error = await page.evaluate(() =>
      window.frame.settings
        .update({ playback: { seekStepSeconds: -1 } })
        .then(() => 'accepted')
        .catch((e: Error) => e.message),
    )
    expect(error).toContain('Invalid arguments for settings:update')
  } finally {
    await app.close()
  }
})

test('a corrupt database is backed up and the app still starts', async () => {
  writeFileSync(join(userDataDir, 'frame.db'), 'corrupt'.repeat(1000))

  const app = await launchApp(userDataDir)
  try {
    const page = await app.firstWindow()
    const status = await page.evaluate(() => window.frame.app.getStartupStatus())
    expect(status.databaseRecovery?.backupPath).toContain('frame.db.corrupt-')
    await expect(page.getByTestId('database-recovered')).toBeVisible()
    expect(readdirSync(join(userDataDir, 'backups'))).toHaveLength(1)
  } finally {
    await app.close()
  }
})

test('secrets never cross the bridge', async () => {
  const app = await launchApp(userDataDir)
  try {
    const page = await app.firstWindow()
    const status = await page.evaluate(async () => {
      try {
        return await window.frame.credentials.set('tmdb.accessToken', 'e2e-secret-value')
      } catch (e) {
        return (e as Error).message
      }
    })
    expect(JSON.stringify(status)).not.toContain('e2e-secret-value')
    if (process.platform === 'win32') {
      // DPAPI is always available on Windows, so the secret must be stored (encrypted).
      expect(status).toMatchObject({
        encryptionAvailable: true,
        credentials: { 'tmdb.accessToken': true },
      })
      const onDisk = readFileSync(join(userDataDir, 'credentials.json'), 'utf8')
      expect(onDisk).not.toContain('e2e-secret-value')
    }
  } finally {
    await app.close()
  }
})

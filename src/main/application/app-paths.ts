import { app } from 'electron'
import { join } from 'node:path'

export interface AppPaths {
  userData: string
  database: string
  backups: string
  credentials: string
}

/**
 * Development and tests may redirect all app state with FRAME_USER_DATA_DIR.
 * Must run before the app is ready. Ignored in packaged builds.
 */
export function configureUserDataDir(): void {
  const override = process.env['FRAME_USER_DATA_DIR']
  if (override && !app.isPackaged) app.setPath('userData', override)
}

export function resolveAppPaths(): AppPaths {
  const userData = app.getPath('userData')
  return {
    userData,
    database: join(userData, 'frame.db'),
    backups: join(userData, 'backups'),
    credentials: join(userData, 'credentials.json'),
  }
}

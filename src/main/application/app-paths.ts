import { app } from 'electron'
import { join } from 'node:path'

export interface AppPaths {
  userData: string
  database: string
  backups: string
  credentials: string
  screenshots: string
  artwork: string
}

/** Endpoints a development build may redirect (tests use a local mock TMDB). */
export function devOverrides(): { tmdbApiBase?: string; tmdbImageBase?: string } {
  if (app.isPackaged) return {}
  return {
    tmdbApiBase: process.env['FRAME_TMDB_API_BASE'] || undefined,
    tmdbImageBase: process.env['FRAME_TMDB_IMAGE_BASE'] || undefined,
  }
}

function userDataOverride(): string | undefined {
  const override = process.env['FRAME_USER_DATA_DIR']
  return override && !app.isPackaged ? override : undefined
}

/**
 * Development and tests may redirect all app state with FRAME_USER_DATA_DIR.
 * Must run before the app is ready. Ignored in packaged builds.
 */
export function configureUserDataDir(): void {
  const override = userDataOverride()
  if (override) app.setPath('userData', override)
}

export function resolveAppPaths(): AppPaths {
  const userData = app.getPath('userData')
  return {
    userData,
    database: join(userData, 'frame.db'),
    backups: join(userData, 'backups'),
    credentials: join(userData, 'credentials.json'),
    artwork: join(userData, 'cache', 'artwork'),
    // Redirected along with user data so tests never write into the user's Pictures folder.
    screenshots: userDataOverride()
      ? join(userData, 'screenshots')
      : join(app.getPath('pictures'), 'Frame'),
  }
}

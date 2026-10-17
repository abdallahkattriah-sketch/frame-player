import { app } from 'electron'
import { join } from 'node:path'

export interface AppPaths {
  userData: string
  database: string
  backups: string
  credentials: string
  screenshots: string
  artwork: string
  thumbnails: string
}

/** Endpoints a development build may redirect (tests use a local mock TMDB). */
export function devOverrides(): {
  tmdbApiBase?: string
  tmdbImageBase?: string
  openSubtitlesOrigin?: string
  subSourceOrigin?: string
  skipSetup?: boolean
} {
  if (app.isPackaged) return {}
  return {
    tmdbApiBase: process.env['FRAME_TMDB_API_BASE'] || undefined,
    tmdbImageBase: process.env['FRAME_TMDB_IMAGE_BASE'] || undefined,
    openSubtitlesOrigin: process.env['FRAME_OPENSUBTITLES_ORIGIN'] || undefined,
    subSourceOrigin: process.env['FRAME_SUBSOURCE_ORIGIN'] || undefined,
    skipSetup: process.env['FRAME_SKIP_SETUP'] === '1',
  }
}

/**
 * Where app state lives when not in %APPDATA%: FRAME_USER_DATA_DIR in development and tests
 * (ignored when packaged), or a "Frame Data" folder beside the portable executable (the
 * portable launcher sets PORTABLE_EXECUTABLE_DIR).
 */
export function userDataOverrideFor(
  env: Record<string, string | undefined>,
  isPackaged: boolean,
): string | undefined {
  if (isPackaged) {
    const portable = env['PORTABLE_EXECUTABLE_DIR']
    return portable ? join(portable, 'Frame Data') : undefined
  }
  return env['FRAME_USER_DATA_DIR'] || undefined
}

function userDataOverride(): string | undefined {
  return userDataOverrideFor(process.env, app.isPackaged)
}

/** Applies userDataOverride(). Must run before the app is ready. */
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
    thumbnails: join(userData, 'cache', 'thumbs'),
    // Redirected along with user data: tests never write into Pictures, and portable copies
    // keep everything beside the executable.
    screenshots: userDataOverride()
      ? join(userData, 'screenshots')
      : join(app.getPath('pictures'), 'Frame'),
  }
}

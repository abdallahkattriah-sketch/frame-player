import { existsSync } from 'node:fs'
import { join } from 'node:path'

export class MpvNotFoundError extends Error {
  constructor(readonly searched: string) {
    super(
      `The mpv playback engine was not found at ${searched}. ` +
        'In development, run `npm run setup:mpv`. In an installed build, reinstall Frame.',
    )
    this.name = 'MpvNotFoundError'
  }
}

export interface MpvLocation {
  isPackaged: boolean
  /** process.resourcesPath in a packaged build. */
  resourcesPath: string
  /** Project root in development. */
  appPath: string
}

export function resolveMpvPath({ isPackaged, resourcesPath, appPath }: MpvLocation): string {
  const path = isPackaged
    ? join(resourcesPath, 'mpv', 'mpv.exe')
    : join(appPath, 'resources', 'mpv', 'mpv.exe')
  if (!existsSync(path)) throw new MpvNotFoundError(path)
  return path
}

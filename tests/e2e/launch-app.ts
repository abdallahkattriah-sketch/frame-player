import { _electron as electron } from '@playwright/test'
import { join } from 'node:path'

/** Launches the built app with all state redirected into `userDataDir`. */
export function launchApp(
  userDataDir: string,
  extraArgs: string[] = [],
  extraEnv: Record<string, string> = {},
) {
  return electron.launch({
    args: [join(__dirname, '../../out/main/index.js'), ...extraArgs],
    env: { ...process.env, FRAME_USER_DATA_DIR: userDataDir, ...extraEnv },
  })
}

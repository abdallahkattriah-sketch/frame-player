import { statSync } from 'node:fs'
import { resolve } from 'node:path'
import { hasVideoExtension } from '@shared/constants/media'

/**
 * Media files passed on the command line ("Open with Frame", drag onto the exe, tests).
 * Only existing regular files with a video extension are accepted; flags are ignored.
 */
export function extractMediaPaths(argv: readonly string[], cwd: string): string[] {
  const paths: string[] = []
  for (const arg of argv) {
    if (!arg || arg.startsWith('-') || !hasVideoExtension(arg)) continue
    const full = resolve(cwd, arg)
    try {
      if (statSync(full).isFile()) paths.push(full)
    } catch {
      // Missing or inaccessible: ignore, the user did not pick it interactively.
    }
  }
  return paths
}

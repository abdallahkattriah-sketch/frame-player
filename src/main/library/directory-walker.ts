import { opendir, realpath, stat } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { pathKey } from './path-key'

export interface WalkOptions {
  root: string
  extensions: readonly string[]
  followSymlinks: boolean
  /** Folder-relative directories to skip ("Extras", "TV/Old"). */
  exclusions: readonly string[]
  signal?: AbortSignal
  /** Called for every directory entry examined (for progress). */
  onExamined?: () => void
}

export interface FoundFile {
  path: string
  /** Relative to the root, using the platform separator. */
  relativePath: string
  sizeBytes: number
  mtimeMs: number
}

/** System, temporary, and metadata folders never worth scanning. */
const IGNORED_DIRECTORIES = new Set([
  '$recycle.bin',
  'system volume information',
  'recycler',
  '@eadir',
  '.@__thumb',
  '.ds_store',
  '.trash',
  '.trashes',
  'node_modules',
])

function isIgnoredFile(name: string): boolean {
  // Office lock files, macOS resource forks, partial downloads.
  return (
    name.startsWith('~$') || name.startsWith('._') || /\.(part|crdownload|tmp|!qb)$/i.test(name)
  )
}

/**
 * Walks `root` asynchronously, yielding video files. Unreadable subfolders are skipped (and
 * reported through `onError`), never fatal. When following symlinks, each real directory is
 * visited once, so link loops terminate.
 */
export async function* walkVideoFiles(
  options: WalkOptions,
  onError: (path: string, error: unknown) => void = () => undefined,
): AsyncGenerator<FoundFile> {
  const extensions = new Set(options.extensions.map((e) => e.toLowerCase()))
  const excluded = new Set(options.exclusions.map((e) => pathKey(join(options.root, e))))
  const visitedReal = new Set<string>()
  const stack: string[] = [options.root]

  while (stack.length > 0) {
    options.signal?.throwIfAborted()
    const dir = stack.pop() as string

    if (options.followSymlinks) {
      try {
        const real = pathKey(await realpath(dir))
        if (visitedReal.has(real)) continue
        visitedReal.add(real)
      } catch (error) {
        onError(dir, error)
        continue
      }
    }

    let handle
    try {
      handle = await opendir(dir, { bufferSize: 64 })
    } catch (error) {
      if (dir === options.root) throw error // the root itself must be readable
      onError(dir, error)
      continue
    }

    const subdirs: string[] = []
    try {
      for await (const entry of handle) {
        options.signal?.throwIfAborted()
        options.onExamined?.()
        const full = join(dir, entry.name)
        let isDir = entry.isDirectory()
        let isFile = entry.isFile()

        if (entry.isSymbolicLink()) {
          if (!options.followSymlinks) continue
          try {
            const target = await stat(full)
            isDir = target.isDirectory()
            isFile = target.isFile()
          } catch (error) {
            onError(full, error) // broken link
            continue
          }
        }

        if (isDir) {
          const lower = entry.name.toLowerCase()
          if (IGNORED_DIRECTORIES.has(lower) || entry.name.startsWith('.')) continue
          if (excluded.has(pathKey(full))) continue
          subdirs.push(full)
        } else if (isFile && !isIgnoredFile(entry.name)) {
          const dot = entry.name.lastIndexOf('.')
          if (dot < 0 || !extensions.has(entry.name.slice(dot + 1).toLowerCase())) continue
          try {
            const s = await stat(full)
            yield {
              path: full,
              relativePath: relative(options.root, full),
              sizeBytes: s.size,
              mtimeMs: Math.floor(s.mtimeMs),
            }
          } catch (error) {
            onError(full, error)
          }
        }
      }
    } catch (error) {
      if (options.signal?.aborted) throw error
      onError(dir, error)
    }
    // Reverse so traversal order follows directory listing order.
    for (let i = subdirs.length - 1; i >= 0; i--) stack.push(subdirs[i] as string)
  }
}

/** Parent folder names of a relative path, nearest first ("A/B/c.mkv" → ["B", "A"]). */
export function parentFolders(relativePath: string): string[] {
  return relativePath.split(sep).slice(0, -1).reverse()
}

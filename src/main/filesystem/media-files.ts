import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { hasVideoExtension } from '@shared/constants/media'

const naturalOrder = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

/** Video files directly inside `dir` (not recursive), in natural order ("Ep 2" before "Ep 10"). */
export function listVideoFiles(dir: string): string[] {
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return []
  }
  return names
    .filter((name) => hasVideoExtension(name))
    .sort(naturalOrder.compare)
    .map((name) => join(dir, name))
    .filter(isFile)
}

/** Expands folders and keeps existing video files, preserving the given order. */
export function resolveMediaPaths(paths: readonly string[]): string[] {
  const result: string[] = []
  for (const path of paths) {
    let stats
    try {
      stats = statSync(path)
    } catch {
      continue // missing or inaccessible
    }
    if (stats.isDirectory()) result.push(...listVideoFiles(path))
    else if (stats.isFile() && hasVideoExtension(path)) result.push(path)
  }
  return result
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

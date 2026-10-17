import { resolve, sep } from 'node:path'

/**
 * Normalized key for comparing paths. Windows file systems are case-insensitive, so the
 * key is case-folded there; trailing separators are removed.
 */
export function pathKey(path: string, platform: NodeJS.Platform = process.platform): string {
  let normalized = resolve(path)
  if (normalized.length > 3 && normalized.endsWith(sep)) normalized = normalized.slice(0, -1)
  return platform === 'win32' ? normalized.toLowerCase() : normalized
}

/** True when `child` is `parent` or inside it (both given as path keys). */
export function isSameOrInside(childKey: string, parentKey: string): boolean {
  if (childKey === parentKey) return true
  const prefix = parentKey.endsWith(sep) ? parentKey : parentKey + sep
  return childKey.startsWith(prefix)
}

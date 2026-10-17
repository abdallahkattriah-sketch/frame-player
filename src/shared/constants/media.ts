/** Default video extensions (lowercase, without dot). Configurable per library later. */
export const defaultVideoExtensions = [
  'mkv',
  'mp4',
  'm4v',
  'avi',
  'mov',
  'wmv',
  'webm',
  'mpg',
  'mpeg',
  'ts',
  'm2ts',
  'flv',
] as const

export function hasVideoExtension(
  path: string,
  extensions: readonly string[] = defaultVideoExtensions,
): boolean {
  const dot = path.lastIndexOf('.')
  if (dot < 0) return false
  return extensions.includes(path.slice(dot + 1).toLowerCase())
}

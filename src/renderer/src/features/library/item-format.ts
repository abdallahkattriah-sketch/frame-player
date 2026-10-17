import type { LibraryItem } from '@shared/contracts/library'

const pad = (n: number) => String(n).padStart(2, '0')

/** "S01E02", "S01E02–E03", "E05" for absolute numbering, or null. */
export function episodeCode(
  item: Pick<LibraryItem, 'season' | 'episode' | 'episodeEnd'>,
): string | null {
  if (item.episode === null) return null
  const end = item.episodeEnd !== null ? `–E${pad(item.episodeEnd)}` : ''
  return item.season === null
    ? `E${pad(item.episode)}${end}`
    : `S${pad(item.season)}E${pad(item.episode)}${end}`
}

/** TMDB title when matched, otherwise what the file name says. */
export function displayTitle(item: LibraryItem): string {
  return item.metadataTitle ?? item.title ?? item.fileName
}

/** Secondary line: year for movies, episode code and title for episodes. */
export function subtitleLine(item: LibraryItem): string {
  if (item.kind === 'episode') {
    return [episodeCode(item), item.episodeName ?? item.episodeTitle].filter(Boolean).join(' · ')
  }
  return [item.metadataYear ?? item.year, item.resolution].filter(Boolean).join(' · ')
}

/** Fraction watched (0–1), or null when unknown. Completed items count as 1. */
export function progressFraction(item: LibraryItem): number | null {
  const p = item.progress
  if (!p) return null
  if (p.completed) return 1
  if (!p.duration || p.duration <= 0) return null
  return Math.min(1, Math.max(0, p.position / p.duration))
}

export function formatBytes(bytes: number | null): string {
  if (bytes === null) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`
}

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

export function formatRelativeDate(iso: string | null, now: Date = new Date()): string {
  if (!iso) return '—'
  const then = new Date(iso)
  const days = Math.round((then.getTime() - now.getTime()) / 86_400_000)
  if (Math.abs(days) < 1) return 'today'
  if (Math.abs(days) < 30) return relative.format(days, 'day')
  return then.toLocaleDateString()
}

export function itemRef(item: LibraryItem) {
  if (item.fileId !== null) return { fileId: item.fileId }
  return { historyKey: item.historyKey as string }
}

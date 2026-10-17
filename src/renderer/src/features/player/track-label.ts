import type { PlayerTrack } from '@shared/contracts/player'

// fallback: 'none' → undefined for codes the runtime does not know.
const languageNames = new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' })

/** Human-readable language for an mpv/ISO 639 code; falls back to the code itself. */
export function languageName(code: string | null): string | null {
  if (!code) return null
  try {
    return languageNames.of(code) ?? code.toUpperCase()
  } catch {
    return code.toUpperCase()
  }
}

/** e.g. "English — Commentary (forced)" or "Track 2". Only reports what mpv provides. */
export function trackLabel(track: PlayerTrack): string {
  const language = languageName(track.lang)
  const parts = [language, track.title].filter((p): p is string => Boolean(p))
  let label = parts.length > 0 ? parts.join(' — ') : `Track ${track.id}`
  const flags = [track.forced && 'forced', track.external && 'external'].filter(Boolean)
  if (flags.length > 0) label += ` (${flags.join(', ')})`
  return label
}

export function formatDelay(seconds: number): string {
  const ms = Math.round(seconds * 1000)
  return `${ms > 0 ? '+' : ''}${ms} ms`
}

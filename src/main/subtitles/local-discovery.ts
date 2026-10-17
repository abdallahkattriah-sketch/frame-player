import { readdir, stat } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { normalizeLanguage } from '@shared/constants/languages'
import { SUBTITLE_EXTENSIONS } from './subtitle-content'

export interface LocalSubtitle {
  path: string
  language: string | null
  forced: boolean
  hearingImpaired: boolean
  /** File name equals the video's name exactly apart from the extension. */
  exactName: boolean
}

const SUBTITLE_FOLDERS = ['subs', 'subtitles', 'sub']

function isSubtitleFile(name: string): boolean {
  return (SUBTITLE_EXTENSIONS as readonly string[]).includes(extname(name).slice(1).toLowerCase())
}

/**
 * Reads "Movie.ar.forced.srt" style suffixes after the video's base name. Returns null when
 * the file does not belong to this video.
 */
export function parseSubtitleName(
  videoBase: string,
  subtitleFile: string,
): Omit<LocalSubtitle, 'path'> | null {
  const name = subtitleFile.slice(0, -extname(subtitleFile).length)
  const lowerName = name.toLowerCase()
  const lowerBase = videoBase.toLowerCase()
  if (
    lowerName !== lowerBase &&
    !lowerName.startsWith(`${lowerBase}.`) &&
    !lowerName.startsWith(`${lowerBase}_`)
  ) {
    return null
  }
  const tokens = name
    .slice(videoBase.length)
    .split(/[._\s-]+/)
    .filter(Boolean)
    .map((t) => t.toLowerCase())
  let language: string | null = null
  let forced = false
  let hearingImpaired = false
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i] as string
    if (token === 'forced' || token === 'foreign') forced = true
    // "hi" in subtitle names means hearing impaired; Hindi is written "hin" or "hindi".
    else if (token === 'sdh' || token === 'hi' || token === 'cc') hearingImpaired = true
    else if (language === null) {
      // Two-part tags like "pt.BR" / "zh.TW".
      const next = tokens[i + 1]
      const combined = next ? normalizeLanguage(`${token}-${next}`) : null
      if (combined && /^[a-z]{2}-[a-z]{2}$/.test(`${token}-${next}`)) {
        language = combined
        i++
      } else {
        language = normalizeLanguage(token)
      }
    }
  }
  return { language, forced, hearingImpaired, exactName: tokens.length === 0 }
}

async function listFiles(dir: string): Promise<string[]> {
  try {
    return await readdir(dir)
  } catch {
    return []
  }
}

/** Finds subtitle files for a video: beside it, and in Subs/ or Subs/<video name>/ folders. */
export async function discoverLocalSubtitles(videoPath: string): Promise<LocalSubtitle[]> {
  const dir = dirname(videoPath)
  const videoBase = basename(videoPath, extname(videoPath))
  const found: LocalSubtitle[] = []

  for (const name of await listFiles(dir)) {
    if (!isSubtitleFile(name)) continue
    const parsed = parseSubtitleName(videoBase, name)
    if (parsed) found.push({ path: join(dir, name), ...parsed })
  }

  for (const entry of await listFiles(dir)) {
    if (!SUBTITLE_FOLDERS.includes(entry.toLowerCase())) continue
    const subsDir = join(dir, entry)
    try {
      if (!(await stat(subsDir)).isDirectory()) continue
    } catch {
      continue
    }
    for (const name of await listFiles(subsDir)) {
      const full = join(subsDir, name)
      if (isSubtitleFile(name)) {
        const parsed = parseSubtitleName(videoBase, name)
        if (parsed) found.push({ path: full, ...parsed })
      } else if (name.toLowerCase() === videoBase.toLowerCase()) {
        // Subs/<video name>/2_English.srt — files named only by language.
        for (const inner of await listFiles(full)) {
          if (!isSubtitleFile(inner)) continue
          const langPart = inner.slice(0, -extname(inner).length).replace(/^\d+[_\s.-]*/, '')
          const parsed = parseSubtitleName('', `.${langPart}${extname(inner)}`)
          found.push({
            path: join(full, inner),
            language: parsed?.language ?? null,
            forced: parsed?.forced ?? false,
            hearingImpaired: parsed?.hearingImpaired ?? false,
            exactName: false,
          })
        }
      }
    }
  }
  return found
}

export interface TrackPreference {
  preferredLanguages: readonly string[]
  hearingImpaired: 'include' | 'exclude' | 'only'
}

/**
 * Picks the subtitle to show automatically. Only a file in a preferred language is chosen;
 * a similar file name alone is never enough. Full subtitles beat forced-only ones.
 */
export function chooseLocalSubtitle(
  candidates: readonly LocalSubtitle[],
  pref: TrackPreference,
): LocalSubtitle | null {
  let best: { sub: LocalSubtitle; score: number } | null = null
  for (const sub of candidates) {
    const rank = sub.language ? pref.preferredLanguages.indexOf(sub.language) : -1
    if (rank < 0) continue
    if (pref.hearingImpaired === 'exclude' && sub.hearingImpaired) continue
    if (pref.hearingImpaired === 'only' && !sub.hearingImpaired) continue
    let score = 100 - rank * 10
    if (sub.forced) score -= 5
    if (sub.exactName) score += 1
    if (!best || score > best.score) best = { sub, score }
  }
  return best?.sub ?? null
}

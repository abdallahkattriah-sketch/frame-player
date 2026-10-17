import type { MediaKind, ParsedMediaName } from '@shared/contracts/library'

/**
 * Best-effort parsing of release-style file names. It extracts evidence for metadata
 * matching; it never decides a match on its own, and leaves fields null when unsure.
 */

const RESOLUTION: [RegExp, string][] = [
  [/\b(?:2160p|4k|uhd)\b/i, '2160p'],
  [/\b1080[pi]\b/i, '1080p'],
  [/\b720p\b/i, '720p'],
  [/\b576[pi]\b/i, '576p'],
  [/\b480[pi]\b/i, '480p'],
]

const CODEC: [RegExp, string][] = [
  [/\b(?:x265|h\.?265|hevc)\b/i, 'hevc'],
  [/\b(?:x264|h\.?264|avc)\b/i, 'h264'],
  [/\bav1\b/i, 'av1'],
  [/\bvp9\b/i, 'vp9'],
  [/\b(?:xvid|divx)\b/i, 'mpeg4'],
]

const EDITION: [RegExp, string][] = [
  [/\bdirector'?s[ .]cut\b/i, "Director's Cut"],
  [/\bextended(?:[ .](?:cut|edition))?\b/i, 'Extended'],
  [/\bunrated\b/i, 'Unrated'],
  [/\btheatrical(?:[ .]cut)?\b/i, 'Theatrical'],
  [/\bremastered\b/i, 'Remastered'],
  [/\buncut\b/i, 'Uncut'],
  [/\bimax\b/i, 'IMAX'],
  [/\bcriterion\b/i, 'Criterion'],
  [/\bspecial[ .]edition\b/i, 'Special Edition'],
]

/** Tokens that mark the end of the title part of a release name. */
const TAG =
  /\b(?:2160p|1080[pi]|720p|576[pi]|480[pi]|4k|uhd|hdr10?\+?|hdr|dv|dolby[ .]?vision|web[ .-]?dl|webrip|web|bluray|blu-ray|bdrip|brrip|dvdrip|dvd|hdtv|remux|x26[45]|h\.?26[45]|hevc|avc|av1|xvid|divx|aac(?:2[ .]0)?|ac3|eac3|dts(?:-hd)?|truehd|atmos|ddp?5[ .]1|10bit|8bit|proper|repack|internal|multi|dual[ .]audio|subbed|dubbed|extended|unrated|remastered|uncut|imax|criterion|director'?s[ .]cut|theatrical)\b/i

const EPISODE_PATTERNS: RegExp[] = [
  // S01E02, S01E02E03, S01E02-E03, s1e2
  /\bs(\d{1,2})[ .]?e(\d{1,4})(?:[ .-]?e(\d{1,4}))?\b/i,
  // 1x02, 01x02-03
  /\b(\d{1,2})x(\d{2,4})(?:-(\d{2,4}))?\b/i,
  // Season 1 - Episode 2, Season 1 Episode 2
  /\bseason[ ._-]*(\d{1,2})[ ._-]*(?:-[ ._-]*)?episode[ ._-]*(\d{1,4})\b/i,
]

/** "[Group] Show Name - 05 [1080p]" — absolute numbering, typical for anime. */
const ABSOLUTE_EPISODE = /^(.*?\S)\s+-\s+(\d{1,4})(?:v\d)?(?=\s|$|\[|\()/

const SEASON_FOLDER = /^(?:season|series|s)[ ._-]*(\d{1,2})$/i
const SPECIALS_FOLDER = /^(?:specials?|extras?|sp)$/i
const YEAR = /(?:^|[\s.([_-])((?:19|20)\d{2})(?=$|[\s.)\]_-])/g

function findFirst(table: [RegExp, string][], text: string): string | null {
  for (const [re, value] of table) if (re.test(text)) return value
  return null
}

/** Replaces dot/underscore separators with spaces, unless the name already uses spaces. */
function normalizeSeparators(text: string): string {
  const usesSpaces = /\s/.test(text.trim())
  let out = usesSpaces ? text.replace(/_/g, ' ') : text.replace(/[._]/g, ' ')
  // Keep dotted acronyms like "S.H.I.E.L.D" readable after replacement.
  out = out.replace(/\b((?:[A-Z] ){2,}[A-Z])\b/g, (m) => m.replace(/ /g, '.'))
  return out
}

function cleanTitle(text: string): string | null {
  const cleaned = normalizeSeparators(text)
    .replace(/\[[^\]]*\]|\{[^}]*\}/g, ' ') // [Group], [1080p], {tags}
    .replace(/\(\s*\)/g, ' ')
    .replace(/[\s\-–—:,]+$/u, '')
    .replace(/^[\s\-–—:,]+/u, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return cleaned.length > 0 ? cleaned : null
}

function stripExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot > 0 ? fileName.slice(0, dot) : fileName
}

function releaseGroup(name: string): string | null {
  const leading = /^\[([^\]]{1,40})\]/.exec(name)
  if (leading?.[1]) return leading[1].trim()
  const trailing = /-([A-Za-z0-9]{2,20})(?:\[[^\]]*\])?$/.exec(name)
  // Only trust a trailing "-GROUP" when release tags precede it.
  if (trailing?.[1] && TAG.test(name.slice(0, trailing.index))) return trailing[1]
  return null
}

/** Cuts text at the first release tag, returning the part before it. */
function beforeTags(text: string): string {
  const m = TAG.exec(text)
  return m ? text.slice(0, m.index) : text
}

/** Picks the release year: the last plausible year that is not the very start of the title. */
function extractYear(text: string): { year: number | null; index: number } {
  let best: { year: number; index: number } | null = null
  for (const m of text.matchAll(YEAR)) {
    const value = m[1]
    if (!value) continue
    const index = (m.index ?? 0) + m[0].indexOf(value)
    if (index === 0) continue // "2001 A Space Odyssey", "1917"
    const year = Number(value)
    if (year > new Date().getFullYear() + 1) continue
    best = { year, index }
  }
  return best ?? { year: null, index: -1 }
}

/**
 * Parses a file name, using its parent folders (nearest first) for show and season names
 * when the file name alone lacks them.
 */
export function parseMediaName(
  fileName: string,
  parentFolders: readonly string[] = [],
): ParsedMediaName {
  const base = stripExtension(fileName)
  const spaced = normalizeSeparators(base)
  const result: ParsedMediaName = {
    kind: 'unknown',
    title: null,
    year: null,
    season: null,
    episode: null,
    episodeEnd: null,
    episodeTitle: null,
    resolution: findFirst(RESOLUTION, base),
    videoCodec: findFirst(CODEC, base),
    edition: findFirst(EDITION, base),
    releaseGroup: releaseGroup(base),
  }

  const withoutGroup = spaced.replace(/^\[[^\]]*\]\s*/, '')

  // TV: explicit season/episode markers.
  for (const pattern of EPISODE_PATTERNS) {
    const m = pattern.exec(withoutGroup)
    if (!m?.[1] || !m[2]) continue
    result.kind = 'episode'
    result.season = Number(m[1])
    result.episode = Number(m[2])
    result.episodeEnd = m[3] ? Number(m[3]) : null
    const before = withoutGroup.slice(0, m.index)
    const after = withoutGroup.slice(m.index + m[0].length)
    const { year, index } = extractYear(before)
    result.year = year
    result.title = cleanTitle(index > 0 ? before.slice(0, index).replace(/[([]\s*$/, '') : before)
    result.episodeTitle = cleanTitle(beforeTags(after).replace(/^[\s\-–—]+/u, ''))
    break
  }

  // Anime-style absolute numbering: "Show - 05".
  if (result.kind === 'unknown') {
    const m = ABSOLUTE_EPISODE.exec(beforeTags(withoutGroup).trim())
    if (m?.[1] && m[2] && !extractYear(` ${m[2]}`).year) {
      result.kind = 'episode'
      result.episode = Number(m[2])
      result.title = cleanTitle(m[1])
    }
  }

  // Movie: title, then optional year.
  if (result.kind === 'unknown') {
    const head = beforeTags(withoutGroup)
    const { year, index } = extractYear(head)
    result.year = year
    result.title = cleanTitle(index > 0 ? head.slice(0, index).replace(/[([]\s*$/, '') : head)
    if (result.title) result.kind = 'movie'
  }

  if (result.kind === 'episode') applyFolderContext(result, parentFolders)
  return result
}

/** "Show Name/Season 2/03.mkv": take season and show from folders when the name lacks them. */
function applyFolderContext(result: ParsedMediaName, parents: readonly string[]) {
  let showFolderIndex = 0
  const nearest = parents[0]?.trim()
  if (nearest) {
    const seasonMatch = SEASON_FOLDER.exec(nearest)
    if (seasonMatch?.[1] || SPECIALS_FOLDER.test(nearest)) {
      showFolderIndex = 1
      if (result.season === null) result.season = seasonMatch?.[1] ? Number(seasonMatch[1]) : 0
    }
  }
  if (!result.title) {
    const showFolder = parents[showFolderIndex]
    if (showFolder) {
      const { year, index } = extractYear(showFolder)
      result.title = cleanTitle(
        index > 0 ? showFolder.slice(0, index).replace(/[([]\s*$/, '') : showFolder,
      )
      result.year ??= year
    }
  }
  if (!result.title) result.kind = 'unknown' satisfies MediaKind
}

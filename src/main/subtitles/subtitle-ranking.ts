import { languageLabel } from '@shared/constants/languages'
import type { SubtitleResult } from '@shared/contracts/subtitles'
import type { RawSubtitleResult, SubtitleSearchContext } from './provider'

/** Release-name tokens worth comparing (source, resolution, codec, group…). */
function releaseTokens(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .replace(/\.[a-z0-9]{2,4}$/, '')
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 2 && !/^(the|a|an|and|of)$/.test(t)),
  )
}

/**
 * Orders results by the evidence each provider returned. The score (0–1) is Frame's estimate;
 * every contribution is listed in `reasons` so the user can judge it.
 */
export function rankResults(
  context: SubtitleSearchContext,
  raw: readonly RawSubtitleResult[],
): SubtitleResult[] {
  const fileTokens = releaseTokens(context.fileName)
  const ranked = raw.map((r): SubtitleResult => {
    const reasons: string[] = []
    let score = 0.35

    if (r.hashMatch === true) {
      score += 0.4
      reasons.push('Matches this exact video file (hash)')
    }

    const langIndex = r.language
      ? context.languages.findIndex((l) => l.split('-')[0] === r.language?.split('-')[0])
      : -1
    if (langIndex >= 0) score += 0.1 - langIndex * 0.03

    const wrongTitle =
      (context.tmdbId !== null && r.matchedTmdbId !== null && r.matchedTmdbId !== context.tmdbId) ||
      (context.imdbId !== null && r.matchedImdbId !== null && r.matchedImdbId !== context.imdbId)
    if (wrongTitle) {
      score -= 0.4
      reasons.push('Listed for a different title')
    } else if (
      (context.tmdbId !== null && r.matchedTmdbId === context.tmdbId) ||
      (context.imdbId !== null && r.matchedImdbId === context.imdbId)
    ) {
      score += 0.1
      reasons.push('Same movie/show ID')
    }

    if (context.kind === 'episode' && context.episode !== null) {
      if (r.season !== null && r.episode !== null) {
        if (r.season === context.season && r.episode === context.episode) {
          score += 0.15
          reasons.push(`Episode S${context.season}E${context.episode} confirmed`)
        } else {
          score -= 0.5
          reasons.push(`For a different episode (S${r.season}E${r.episode})`)
        }
      } else {
        reasons.push('Episode not confirmed by the provider')
      }
    }

    const release = r.releaseName ?? r.fileName
    if (release && fileTokens.size > 0) {
      const tokens = releaseTokens(release)
      let shared = 0
      for (const t of tokens) if (fileTokens.has(t)) shared++
      const overlap = shared / Math.max(1, Math.min(tokens.size, fileTokens.size))
      if (overlap >= 0.6) reasons.push('Release name matches the file')
      score += overlap * 0.15
    }

    if (context.hearingImpaired === 'exclude' && r.hearingImpaired === true) score -= 0.2
    if (r.machineTranslated === true || r.aiTranslated === true) {
      score -= 0.1
      reasons.push(r.aiTranslated ? 'AI-translated' : 'Machine-translated')
    }
    if (r.trustedUploader === true) score += 0.03
    if (r.downloads) score += Math.min(0.05, Math.log10(1 + r.downloads) / 100)

    const {
      season: _season,
      episode: _episode,
      matchedImdbId: _imdb,
      matchedTmdbId: _tmdb,
      ...result
    } = r
    return {
      ...result,
      languageLabel: languageLabel(r.language),
      confidence: Math.round(Math.max(0, Math.min(1, score)) * 100) / 100,
      reasons,
    }
  })
  return ranked.sort((a, b) => b.confidence - a.confidence)
}

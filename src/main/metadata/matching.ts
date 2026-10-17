import type { MatchCandidate, MetadataMediaType } from '@shared/contracts/metadata'

/**
 * Ranks search results against what the file name tells us. Scores are Frame's own
 * estimate (0–1). A file is matched automatically only when one candidate is clearly
 * best; otherwise the candidates are kept for the user to choose from.
 */

export interface MatchEvidence {
  title: string
  year: number | null
  mediaType: MetadataMediaType
}

export interface RawCandidate {
  tmdbId: number
  mediaType: MetadataMediaType
  title: string
  originalTitle: string | null
  date: string | null
  overview: string | null
  posterPath: string | null
  popularity: number | null
  voteCount: number | null
}

export const AUTO_MATCH_MIN_SCORE = 0.85
export const AUTO_MATCH_MIN_MARGIN = 0.1

/** Lowercase, strip diacritics and punctuation, unify "&"/"and". Keeps non-Latin letters. */
export function normalizeTitle(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\b(?:the|a|an)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function bigrams(text: string): Map<string, number> {
  const grams = new Map<string, number>()
  const s = ` ${text} `
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2)
    grams.set(g, (grams.get(g) ?? 0) + 1)
  }
  return grams
}

/** Sørensen–Dice coefficient over character bigrams (0–1). */
export function titleSimilarity(a: string, b: string): number {
  const x = normalizeTitle(a)
  const y = normalizeTitle(b)
  if (!x || !y) return 0
  if (x === y) return 1
  const ga = bigrams(x)
  const gb = bigrams(y)
  let overlap = 0
  let total = 0
  for (const [g, n] of ga) {
    overlap += Math.min(n, gb.get(g) ?? 0)
    total += n
  }
  for (const n of gb.values()) total += n
  return (2 * overlap) / total
}

export function yearOf(date: string | null): number | null {
  const m = date ? /^(\d{4})/.exec(date) : null
  return m ? Number(m[1]) : null
}

export function scoreCandidate(evidence: MatchEvidence, c: RawCandidate): number {
  const title = Math.max(
    titleSimilarity(evidence.title, c.title),
    c.originalTitle ? titleSimilarity(evidence.title, c.originalTitle) : 0,
  )
  let score = title * 0.8

  const year = yearOf(c.date)
  if (evidence.year !== null && year !== null) {
    const diff = Math.abs(evidence.year - year)
    // Release years often differ by one between regions and festivals.
    score += diff === 0 ? 0.2 : diff === 1 ? 0.1 : -0.25
  } else if (evidence.year === null) {
    // No year to confirm: rely on the title, with a small nudge for well-known titles.
    score += 0.1 + Math.min(0.05, Math.log10(1 + (c.voteCount ?? 0)) / 100)
  }
  if (c.mediaType !== evidence.mediaType) score -= 0.3
  return Math.max(0, Math.min(1, score))
}

export interface RankResult {
  candidates: MatchCandidate[]
  /** Set when the best candidate is confident and clearly ahead of the rest. */
  autoMatch: MatchCandidate | null
}

export function rankCandidates(
  evidence: MatchEvidence,
  raw: readonly RawCandidate[],
  keep = 8,
): RankResult {
  const candidates = raw
    .map<MatchCandidate>((c) => ({
      tmdbId: c.tmdbId,
      mediaType: c.mediaType,
      title: c.title,
      originalTitle: c.originalTitle && c.originalTitle !== c.title ? c.originalTitle : null,
      year: yearOf(c.date),
      overview: c.overview || null,
      posterPath: c.posterPath,
      confidence: Math.round(scoreCandidate(evidence, c) * 1000) / 1000,
    }))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, keep)

  const [best, second] = candidates
  const clearlyBest =
    best !== undefined &&
    best.confidence >= AUTO_MATCH_MIN_SCORE &&
    best.confidence - (second?.confidence ?? 0) >= AUTO_MATCH_MIN_MARGIN
  return { candidates, autoMatch: clearlyBest ? best : null }
}

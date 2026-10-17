/**
 * Validates downloaded subtitle bytes and normalizes them to UTF-8 text. Anything that is
 * not recognizably a subtitle (HTML error pages, binaries, empty files) is rejected.
 */

export type SubtitleFormat = 'srt' | 'ass' | 'ssa' | 'vtt' | 'sub'

export const SUBTITLE_EXTENSIONS: readonly SubtitleFormat[] = ['srt', 'ass', 'ssa', 'vtt', 'sub']

export const MAX_SUBTITLE_BYTES = 10 * 1024 * 1024

export class InvalidSubtitleError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidSubtitleError'
  }
}

export interface DecodedSubtitle {
  text: string
  format: SubtitleFormat
  /** Encoding the bytes were read as. Saved files are always UTF-8. */
  sourceEncoding: string
}

function decode(bytes: Uint8Array, fallbackEncoding: string): { text: string; encoding: string } {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: new TextDecoder('utf-8').decode(bytes.subarray(3)), encoding: 'utf-8' }
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: new TextDecoder('utf-16le').decode(bytes.subarray(2)), encoding: 'utf-16le' }
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { text: new TextDecoder('utf-16be').decode(bytes.subarray(2)), encoding: 'utf-16be' }
  }
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'utf-8' }
  } catch {
    // Legacy 8-bit encoding (e.g. Windows-1256 for Arabic, Windows-1252 for Western).
    return { text: new TextDecoder(fallbackEncoding).decode(bytes), encoding: fallbackEncoding }
  }
}

/** Identifies the subtitle format from content, not the file name. */
export function detectFormat(text: string): SubtitleFormat | null {
  const head = text
    .slice(0, 4096)
    .replace(/^\uFEFF/, '')
    .trimStart()
  if (/^WEBVTT(?:[ \t].*)?(?:\r?\n|$)/.test(head)) return 'vtt'
  if (/^\[Script Info\]/im.test(head)) {
    return /ScriptType:\s*v4\.00\+/i.test(head) || /^\[V4\+ Styles\]/im.test(text) ? 'ass' : 'ssa'
  }
  if (
    /^\d+\s*\r?\n\s*\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s*-->\s*\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}/m.test(
      head,
    )
  ) {
    return 'srt'
  }
  if (/^\{\d+\}\{\d*\}/m.test(head)) return 'sub' // MicroDVD
  return null
}

function looksLikeHtml(text: string): boolean {
  return /^\s*(?:<!doctype html|<html|<head|<body)/i.test(text.slice(0, 512))
}

/** NUL bytes or many control characters mean this is not a text subtitle. */
function looksBinary(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, 8192)
  let control = 0
  for (const b of sample) {
    if (b === 0) return true
    if (b < 9 || (b > 13 && b < 32)) control++
  }
  return sample.length > 0 && control / sample.length > 0.05
}

export function decodeSubtitle(
  bytes: Uint8Array,
  fallbackEncoding = 'windows-1252',
): DecodedSubtitle {
  if (bytes.length === 0) throw new InvalidSubtitleError('The subtitle file is empty.')
  if (bytes.length > MAX_SUBTITLE_BYTES)
    throw new InvalidSubtitleError('The subtitle file is too large.')
  const utf16 = (bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff)
  if (!utf16 && looksBinary(bytes)) {
    throw new InvalidSubtitleError('The download is a binary file, not a subtitle.')
  }
  const { text, encoding } = decode(bytes, fallbackEncoding)
  if (looksLikeHtml(text)) {
    throw new InvalidSubtitleError('The provider returned a web page instead of a subtitle.')
  }
  const format = detectFormat(text)
  if (!format) throw new InvalidSubtitleError('The file is not a recognized subtitle format.')
  return { text: text.replace(/^\uFEFF/, ''), format, sourceEncoding: encoding }
}

/** Legacy encoding to assume for non-UTF-8 files, by subtitle language. */
export function fallbackEncodingFor(language: string | null): string {
  const lang = (language ?? '').toLowerCase().slice(0, 2)
  if (lang === 'ar' || lang === 'fa' || lang === 'ur') return 'windows-1256'
  if (lang === 'ru' || lang === 'uk' || lang === 'bg' || lang === 'sr') return 'windows-1251'
  if (lang === 'el') return 'windows-1253'
  if (lang === 'tr') return 'windows-1254'
  if (lang === 'he') return 'windows-1255'
  if (['pl', 'cs', 'sk', 'hu', 'ro', 'hr', 'sl'].includes(lang)) return 'windows-1250'
  return 'windows-1252'
}

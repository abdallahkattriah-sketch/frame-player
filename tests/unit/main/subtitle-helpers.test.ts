import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { deflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { normalizeLanguage } from '@shared/constants/languages'
import {
  decodeSubtitle,
  detectFormat,
  fallbackEncodingFor,
  InvalidSubtitleError,
} from '../../../src/main/subtitles/subtitle-content'
import {
  InvalidArchiveError,
  isZip,
  readZip,
  safeEntryName,
} from '../../../src/main/subtitles/zip-reader'
import { computeMovieHash } from '../../../src/main/subtitles/movie-hash'
import {
  chooseLocalSubtitle,
  discoverLocalSubtitles,
  parseSubtitleName,
} from '../../../src/main/subtitles/local-discovery'
import { useTempDirs } from './temp-dir'

const tempDir = useTempDirs()

const SRT =
  '1\r\n00:00:01,000 --> 00:00:02,500\r\nHello\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\nWorld\r\n'
const ARABIC_SRT = '1\n00:00:01,000 --> 00:00:02,000\nمرحبا بكم\n'

/** Builds a ZIP (stored or deflated) for tests; names are written as given. */
function zip(entries: { name: string; data: Buffer; deflate?: boolean; size?: number }[]): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8')
    const body = e.deflate ? deflateRawSync(e.data) : e.data
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(0x0800, 6)
    local.writeUInt16LE(e.deflate ? 8 : 0, 8)
    local.writeUInt32LE(body.length, 18)
    local.writeUInt32LE(e.size ?? e.data.length, 22)
    local.writeUInt16LE(name.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(e.deflate ? 8 : 0, 10)
    central.writeUInt32LE(body.length, 20)
    central.writeUInt32LE(e.size ?? e.data.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)
    locals.push(local, name, body)
    centrals.push(central, name)
    offset += 30 + name.length + body.length
  }
  const dir = Buffer.concat(centrals)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(dir.length, 12)
  eocd.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, dir, eocd])
}

describe('subtitle content validation', () => {
  it('detects formats from content', () => {
    expect(detectFormat(SRT)).toBe('srt')
    expect(detectFormat('WEBVTT\n\n00:01.000 --> 00:02.000\nHi')).toBe('vtt')
    expect(detectFormat('[Script Info]\nScriptType: v4.00+\n')).toBe('ass')
    expect(detectFormat('[Script Info]\nScriptType: v4.00\n')).toBe('ssa')
    expect(detectFormat('{100}{200}Hello')).toBe('sub')
    expect(detectFormat('just some text')).toBeNull()
  })

  it('decodes UTF-8 (with or without BOM), UTF-16, and legacy Arabic encodings to text', () => {
    expect(decodeSubtitle(Buffer.from(`\uFEFF${SRT}`)).text.startsWith('1')).toBe(true)
    const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(ARABIC_SRT, 'utf16le')])
    expect(decodeSubtitle(utf16)).toMatchObject({ format: 'srt', sourceEncoding: 'utf-16le' })
    expect(decodeSubtitle(utf16).text).toContain('مرحبا')

    // "مرحبا" in Windows-1256.
    const cp1256 = Buffer.concat([
      Buffer.from('1\n00:00:01,000 --> 00:00:02,000\n'),
      Buffer.from([0xe3, 0xd1, 0xcd, 0xc8, 0xc7]),
      Buffer.from('\n'),
    ])
    const decoded = decodeSubtitle(cp1256, fallbackEncodingFor('ar'))
    expect(decoded.sourceEncoding).toBe('windows-1256')
    expect(decoded.text).toContain('مرحبا')
  })

  it('rejects HTML error pages, binaries, empty and unrecognized files', () => {
    const bad = [
      Buffer.from('<!DOCTYPE html><html><body>Quota exceeded</body></html>'),
      Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04]),
      Buffer.alloc(0),
      Buffer.from('this is not a subtitle'),
    ]
    for (const bytes of bad) expect(() => decodeSubtitle(bytes)).toThrow(InvalidSubtitleError)
  })
})

describe('zip reader', () => {
  it('extracts stored and deflated subtitle files', () => {
    const archive = zip([
      { name: 'Movie.en.srt', data: Buffer.from(SRT) },
      { name: 'folder/Movie.ar.srt', data: Buffer.from(ARABIC_SRT), deflate: true },
      { name: 'readme.txt', data: Buffer.from('ads') },
    ])
    expect(isZip(archive)).toBe(true)
    const entries = readZip(archive, (n) => n.endsWith('.srt'))
    expect(entries.map((e) => e.name)).toEqual(['Movie.en.srt', 'Movie.ar.srt'])
    expect(entries[1]?.bytes.toString('utf8')).toContain('مرحبا')
  })

  it('drops path traversal and absolute names instead of writing outside', () => {
    expect(safeEntryName('../../evil.srt')).toBeNull()
    expect(safeEntryName('C:\\Windows\\evil.srt')).toBeNull()
    expect(safeEntryName('/etc/evil.srt')).toBeNull()
    expect(safeEntryName('sub/dir/ok.srt')).toBe('ok.srt')
    const archive = zip([
      { name: '../evil.srt', data: Buffer.from(SRT) },
      { name: 'good.srt', data: Buffer.from(SRT) },
    ])
    expect(readZip(archive).map((e) => e.name)).toEqual(['good.srt'])
  })

  it('refuses zip bombs and damaged archives', () => {
    const bomb = zip([{ name: 'a.srt', data: Buffer.alloc(5_000_000, 0x41), deflate: true }])
    expect(() => readZip(bomb)).toThrow(InvalidArchiveError)
    const lying = zip([{ name: 'a.srt', data: Buffer.from(SRT), size: 50 * 1024 * 1024 }])
    expect(() => readZip(lying)).toThrow(InvalidArchiveError)
    expect(() => readZip(Buffer.from('PK\u0003\u0004 not really'))).toThrow(InvalidArchiveError)
  })
})

describe('movie hash', () => {
  it('sums file size and the first and last 64 KiB as 64-bit words', async () => {
    const dir = tempDir()
    const path = join(dir, 'video.bin')
    const size = 200_000
    const data = Buffer.alloc(size)
    for (let i = 0; i < size; i++) data[i] = (i * 31) % 256
    writeFileSync(path, data)

    let expected = BigInt(size)
    const mask = (1n << 64n) - 1n
    for (const start of [0, size - 65536]) {
      for (let i = 0; i < 65536; i += 8)
        expected = (expected + data.readBigUInt64LE(start + i)) & mask
    }
    expect(await computeMovieHash(path)).toBe(expected.toString(16).padStart(16, '0'))

    writeFileSync(join(dir, 'tiny.bin'), Buffer.alloc(1000))
    expect(await computeMovieHash(join(dir, 'tiny.bin'))).toBeNull()
  })
})

describe('local subtitle discovery', () => {
  it('parses language and variant suffixes', () => {
    expect(parseSubtitleName('Movie', 'Movie.srt')).toEqual({
      language: null,
      forced: false,
      hearingImpaired: false,
      exactName: true,
    })
    expect(parseSubtitleName('Movie', 'Movie.ar.srt')?.language).toBe('ar')
    expect(parseSubtitleName('Movie', 'Movie.eng.forced.srt')).toMatchObject({
      language: 'en',
      forced: true,
    })
    expect(parseSubtitleName('Movie', 'Movie.en.sdh.srt')).toMatchObject({
      language: 'en',
      hearingImpaired: true,
    })
    expect(parseSubtitleName('Movie', 'Movie.pt.BR.srt')?.language).toBe('pt-BR')
    expect(parseSubtitleName('Movie', 'Movie.Arabic.ass')?.language).toBe('ar')
    expect(parseSubtitleName('Movie', 'Other Movie.en.srt')).toBeNull()
    expect(normalizeLanguage('zh_TW')).toBe('zh-TW')
  })

  it('finds subtitles beside the video and in Subs folders, including Unicode names', async () => {
    const dir = tempDir()
    const video = join(dir, 'فيلم 映画 (2020).mkv')
    writeFileSync(video, '')
    for (const name of [
      'فيلم 映画 (2020).ar.srt',
      'فيلم 映画 (2020).en.forced.srt',
      'Unrelated.en.srt',
      'notes.txt',
    ]) {
      writeFileSync(join(dir, name), SRT)
    }
    mkdirSync(join(dir, 'Subs', 'فيلم 映画 (2020)'), { recursive: true })
    writeFileSync(join(dir, 'Subs', 'فيلم 映画 (2020)', '2_English.srt'), SRT)

    const found = await discoverLocalSubtitles(video)
    expect(found.map((f) => [f.path.slice(dir.length + 1), f.language, f.forced]).sort()).toEqual(
      [
        ['فيلم 映画 (2020).ar.srt', 'ar', false],
        ['فيلم 映画 (2020).en.forced.srt', 'en', true],
        [join('Subs', 'فيلم 映画 (2020)', '2_English.srt'), 'en', false],
      ].sort(),
    )
  })

  it('auto-selects only preferred languages, preferring full over forced subtitles', () => {
    const subs = [
      { path: 'a', language: 'en', forced: true, hearingImpaired: false, exactName: false },
      { path: 'b', language: 'en', forced: false, hearingImpaired: true, exactName: false },
      { path: 'c', language: 'ar', forced: false, hearingImpaired: false, exactName: false },
      { path: 'd', language: null, forced: false, hearingImpaired: false, exactName: true },
    ]
    expect(
      chooseLocalSubtitle(subs, { preferredLanguages: ['ar', 'en'], hearingImpaired: 'include' })
        ?.path,
    ).toBe('c')
    expect(
      chooseLocalSubtitle(subs, { preferredLanguages: ['en'], hearingImpaired: 'include' })?.path,
    ).toBe('b')
    expect(
      chooseLocalSubtitle(subs, { preferredLanguages: ['en'], hearingImpaired: 'exclude' })?.path,
    ).toBe('a')
    // An exact-name file without a language is not chosen just because the name matches.
    expect(
      chooseLocalSubtitle(subs, { preferredLanguages: ['fr'], hearingImpaired: 'include' }),
    ).toBeNull()
  })
})

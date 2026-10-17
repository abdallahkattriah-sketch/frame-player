import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { initialPlayerState, playerCommandSchema } from '@shared/contracts/player'
import { hasVideoExtension } from '@shared/constants/media'
import {
  applyProperty,
  isLooping,
  parseAspect,
  parseChapters,
  parsePlaylist,
  parseTracks,
  PlayerStateTracker,
  toMpvCommands,
} from '../../../src/main/media-engine/player-state'
import { buildMpvArgs, createPipePath } from '../../../src/main/media-engine/mpv-process'
import { MpvNotFoundError, resolveMpvPath } from '../../../src/main/media-engine/mpv-locator'
import { extractMediaPaths } from '../../../src/main/filesystem/launch-args'
import { listVideoFiles, resolveMediaPaths } from '../../../src/main/filesystem/media-files'
import { useTempDirs } from './temp-dir'

const tempDir = useTempDirs()

describe('applyProperty', () => {
  it('maps mpv properties onto player state', () => {
    let s = applyProperty(initialPlayerState, 'time-pos', 12.5)
    s = applyProperty(s, 'duration', 100)
    s = applyProperty(s, 'pause', false)
    s = applyProperty(s, 'vo-configured', true)
    s = applyProperty(s, 'volume', 70)
    s = applyProperty(s, 'speed', 1.5)
    s = applyProperty(s, 'sub-delay', -0.25)
    s = applyProperty(s, 'video-params', { w: 1920, h: 1080, pixelformat: 'yuv420p' })
    s = applyProperty(s, 'hwdec-current', 'no')
    expect(s).toMatchObject({
      position: 12.5,
      duration: 100,
      paused: false,
      videoActive: true,
      volume: 70,
      speed: 1.5,
      subtitleDelay: -0.25,
      videoInfo: { width: 1920, height: 1080, hwdec: null },
    })
  })

  it('treats missing values from mpv as unknown rather than zero', () => {
    const s = applyProperty({ ...initialPlayerState, position: 5 }, 'time-pos', undefined)
    expect(s.position).toBeNull()
    expect(applyProperty(s, 'volume', null).volume).toBe(initialPlayerState.volume)
    expect(applyProperty(s, 'playlist-pos', -1).playlistPosition).toBeNull()
  })

  it('derives repeat mode from loop-file and loop-playlist in any order', () => {
    const t = new PlayerStateTracker()
    let s = t.apply(initialPlayerState, 'loop-playlist', 'inf')
    expect(s.repeat).toBe('all')
    s = t.apply(s, 'loop-file', 'inf')
    expect(s.repeat).toBe('one')
    s = t.apply(s, 'loop-file', false) // loop-playlist is still on
    expect(s.repeat).toBe('all')
    s = t.apply(s, 'loop-playlist', false)
    expect(s.repeat).toBe('off')
  })

  it('derives scaling from keepaspect and panscan in any order', () => {
    const t = new PlayerStateTracker()
    let s = t.apply(initialPlayerState, 'panscan', 1)
    expect(s.scaling).toBe('fill')
    s = t.apply(s, 'keepaspect', false)
    expect(s.scaling).toBe('stretch')
    s = t.apply(s, 'keepaspect', true) // panscan is still 1
    expect(s.scaling).toBe('fill')
    s = t.apply(s, 'panscan', 0)
    expect(s.scaling).toBe('fit')
  })

  it('delegates other properties to applyProperty', () => {
    const s = new PlayerStateTracker().apply(initialPlayerState, 'speed', 2)
    expect(s.speed).toBe(2)
  })

  it('ignores unknown properties', () => {
    expect(applyProperty(initialPlayerState, 'something-else', 1)).toBe(initialPlayerState)
  })
})

describe('mpv value parsers', () => {
  it('parses track lists defensively', () => {
    const tracks = parseTracks([
      { id: 1, type: 'video', codec: 'h264', selected: true },
      { id: 1, type: 'audio', lang: 'ara', title: 'Stereo', default: true, selected: true },
      { id: 2, type: 'sub', lang: 'en', external: true, forced: true },
      { id: 'x', type: 'sub' },
      { id: 3, type: 'attachment' },
      'junk',
    ])
    expect(tracks).toHaveLength(3)
    expect(tracks[1]).toMatchObject({ type: 'audio', lang: 'ara', isDefault: true, selected: true })
    expect(tracks[2]).toMatchObject({ external: true, forced: true, selected: false, title: null })
    expect(parseTracks(null)).toEqual([])
  })

  it('parses playlists and marks the current entry', () => {
    expect(
      parsePlaylist([
        { filename: 'C:\\a.mkv', current: true, playing: true },
        { filename: 'C:\\b.mkv' },
        { nope: 1 },
      ]),
    ).toEqual([
      { path: 'C:\\a.mkv', title: null, current: true },
      { path: 'C:\\b.mkv', title: null, current: false },
    ])
  })

  it('parses aspect overrides in every form mpv reports', () => {
    expect(parseAspect(-1)).toBe('auto')
    expect(parseAspect('no')).toBe('auto')
    expect(parseAspect(16 / 9)).toBe('16:9')
    expect(parseAspect('2.35:1')).toBe('2.35:1')
    expect(parseAspect(1.3333)).toBe('4:3')
    expect(parseAspect(3.7)).toBe('auto')
  })

  it('parses chapter lists in time order and drops invalid entries', () => {
    expect(
      parseChapters([
        { title: 'Intro', time: 0 },
        { title: '', time: 95.5 },
        { title: 'Bad', time: 'x' },
        { time: 30 },
        null,
      ]),
    ).toEqual([
      { title: 'Intro', time: 0 },
      { title: null, time: 30 },
      { title: null, time: 95.5 },
    ])
    expect(parseChapters(undefined)).toEqual([])
    let s = applyProperty(initialPlayerState, 'chapter-list', [{ title: 'A', time: 0 }])
    s = applyProperty(s, 'chapter', 0)
    expect(s).toMatchObject({ chapters: [{ title: 'A', time: 0 }], chapter: 0 })
    expect(applyProperty(s, 'chapter', -1).chapter).toBeNull()
  })

  it('recognizes loop values', () => {
    expect([true, 'inf', 'force', 3].map(isLooping)).toEqual([true, true, true, true])
    expect([false, 'no', 0, undefined].map(isLooping)).toEqual([false, false, false, false])
  })
})

describe('toMpvCommands', () => {
  it('maps the allowed high-level commands', () => {
    expect(toMpvCommands({ type: 'toggle-pause' })).toEqual([['cycle', 'pause']])
    expect(toMpvCommands({ type: 'seek', mode: 'absolute', seconds: 30 })).toEqual([
      ['seek', 30, 'absolute+exact'],
    ])
    expect(toMpvCommands({ type: 'set-subtitle-track', id: 'none' })).toEqual([
      ['set_property', 'sid', 'no'],
    ])
    expect(toMpvCommands({ type: 'set-audio-track', id: 2 })).toEqual([['set_property', 'aid', 2]])
    expect(toMpvCommands({ type: 'frame-step', direction: 'backward' })).toEqual([
      ['frame-back-step'],
    ])
    expect(toMpvCommands({ type: 'set-aspect-ratio', aspect: 'auto' })).toEqual([
      ['set_property', 'video-aspect-override', '-1'],
    ])
    expect(toMpvCommands({ type: 'set-repeat', repeat: 'one' })).toEqual([
      ['set_property', 'loop-file', 'inf'],
      ['set_property', 'loop-playlist', 'no'],
    ])
    expect(toMpvCommands({ type: 'set-scaling', scaling: 'fill' })).toEqual([
      ['set_property', 'keepaspect', true],
      ['set_property', 'panscan', 1],
    ])
    expect(toMpvCommands({ type: 'toggle-fullscreen' })).toEqual([])
    expect(toMpvCommands({ type: 'chapter', direction: 'next' })).toEqual([['add', 'chapter', 1]])
    expect(toMpvCommands({ type: 'chapter', direction: 'previous' })).toEqual([
      ['add', 'chapter', -1],
    ])
  })

  it('rejects raw, unknown, or out-of-range commands at the schema', () => {
    for (const bad of [
      { type: 'run', args: ['calc.exe'] },
      { type: 'seek', mode: 'absolute', seconds: Number.NaN },
      { type: 'set-volume', volume: 1000 },
      { type: 'set-speed', speed: 0 },
      { type: 'set-speed', speed: 100 },
      { type: 'set-audio-track', id: -1 },
      { type: 'set-subtitle-track', id: 'auto' },
      { type: 'set-aspect-ratio', aspect: '7:3' },
      { type: 'set-subtitle-delay', seconds: 10_000 },
      { type: 'playlist-play', index: 1.5 },
      ['run', 'calc.exe'],
    ]) {
      expect(playerCommandSchema.safeParse(bad).success).toBe(false)
    }
  })
})

describe('mpv process arguments', () => {
  it('uses a unique per-instance pipe and isolates mpv from user config', () => {
    const a = createPipePath()
    expect(a).toMatch(/^\\\\\.\\pipe\\frame-mpv-\d+-[0-9a-f-]{36}$/)
    expect(createPipePath()).not.toBe(a)

    const args = buildMpvArgs({ mpvPath: 'mpv.exe', windowId: '12345', hwdec: 'no', volume: 55 }, a)
    expect(args).toContain('--wid=12345')
    expect(args).toContain(`--input-ipc-server=${a}`)
    expect(args).toContain('--no-config')
    expect(args).toContain('--ytdl=no')
    expect(args).toContain('--hwdec=no')
    expect(args).toContain('--volume=55')
    // The media path is never on the command line; it is sent over IPC.
    expect(args.some((x) => x.includes('.mkv'))).toBe(false)
  })
})

describe('resolveMpvPath', () => {
  it('finds mpv under resources in development and in packaged builds', () => {
    const dir = tempDir()
    mkdirSync(join(dir, 'resources', 'mpv'), { recursive: true })
    writeFileSync(join(dir, 'resources', 'mpv', 'mpv.exe'), '')
    mkdirSync(join(dir, 'packaged', 'mpv'), { recursive: true })
    writeFileSync(join(dir, 'packaged', 'mpv', 'mpv.exe'), '')

    expect(resolveMpvPath({ isPackaged: false, appPath: dir, resourcesPath: 'x' })).toBe(
      join(dir, 'resources', 'mpv', 'mpv.exe'),
    )
    expect(
      resolveMpvPath({ isPackaged: true, appPath: 'x', resourcesPath: join(dir, 'packaged') }),
    ).toBe(join(dir, 'packaged', 'mpv', 'mpv.exe'))
  })

  it('throws an actionable error when mpv is missing', () => {
    expect(() =>
      resolveMpvPath({ isPackaged: false, appPath: tempDir(), resourcesPath: 'x' }),
    ).toThrow(MpvNotFoundError)
  })
})

describe('extractMediaPaths', () => {
  it('keeps existing video files from argv and ignores flags, scripts, and missing files', () => {
    const dir = tempDir()
    const video = join(dir, 'فيلم 映画.MKV')
    writeFileSync(video, '')
    writeFileSync(join(dir, 'notes.txt'), '')

    expect(
      extractMediaPaths(
        ['--inspect', 'out/main/index.js', video, 'notes.txt', 'missing.mp4', ''],
        dir,
      ),
    ).toEqual([video])
  })

  it('recognizes extensions case-insensitively', () => {
    expect(hasVideoExtension('a.Mp4')).toBe(true)
    expect(hasVideoExtension('a.srt')).toBe(false)
    expect(hasVideoExtension('noext')).toBe(false)
  })
})

describe('media folders', () => {
  it('lists videos directly in a folder in natural order', () => {
    const dir = tempDir()
    for (const name of ['Ep 10.mkv', 'Ep 2.mkv', 'Ep 1.MP4', 'Ep 1.srt', 'cover.jpg']) {
      writeFileSync(join(dir, name), '')
    }
    mkdirSync(join(dir, 'Extras.mkv')) // a folder with a video-like name is not a file
    mkdirSync(join(dir, 'Season 2'))
    writeFileSync(join(dir, 'Season 2', 'Ep 1.mkv'), '')

    expect(listVideoFiles(dir).map((p) => p.slice(dir.length + 1))).toEqual([
      'Ep 1.MP4',
      'Ep 2.mkv',
      'Ep 10.mkv',
    ])
  })

  it('expands folders, keeps file order, and skips missing or unsupported paths', () => {
    const dir = tempDir()
    const sub = join(dir, 'sub')
    mkdirSync(sub)
    writeFileSync(join(sub, 'b.mkv'), '')
    writeFileSync(join(sub, 'a.mkv'), '')
    const single = join(dir, 'z.webm')
    writeFileSync(single, '')
    writeFileSync(join(dir, 'doc.pdf'), '')

    expect(
      resolveMediaPaths([single, sub, join(dir, 'missing.mkv'), join(dir, 'doc.pdf')]),
    ).toEqual([single, join(sub, 'a.mkv'), join(sub, 'b.mkv')])
    expect(resolveMediaPaths([join(dir, 'nothing-here')])).toEqual([])
  })
})

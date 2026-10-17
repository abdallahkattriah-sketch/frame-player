import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { initialPlayerState, playerCommandSchema } from '@shared/contracts/player'
import { hasVideoExtension } from '@shared/constants/media'
import { applyProperty, toMpvCommand } from '../../../src/main/media-engine/player-state'
import { buildMpvArgs, createPipePath } from '../../../src/main/media-engine/mpv-process'
import { MpvNotFoundError, resolveMpvPath } from '../../../src/main/media-engine/mpv-locator'
import { extractMediaPaths } from '../../../src/main/filesystem/launch-args'
import { useTempDirs } from './temp-dir'

const tempDir = useTempDirs()

describe('applyProperty', () => {
  it('maps mpv properties onto player state', () => {
    let s = applyProperty(initialPlayerState, 'time-pos', 12.5)
    s = applyProperty(s, 'duration', 100)
    s = applyProperty(s, 'pause', false)
    s = applyProperty(s, 'vo-configured', true)
    s = applyProperty(s, 'volume', 70)
    expect(s).toMatchObject({
      position: 12.5,
      duration: 100,
      paused: false,
      videoActive: true,
      volume: 70,
    })
  })

  it('treats missing values from mpv as unknown rather than zero', () => {
    const s = applyProperty({ ...initialPlayerState, position: 5 }, 'time-pos', undefined)
    expect(s.position).toBeNull()
    expect(applyProperty(s, 'volume', null).volume).toBe(initialPlayerState.volume)
  })

  it('ignores unknown properties', () => {
    expect(applyProperty(initialPlayerState, 'something-else', 1)).toBe(initialPlayerState)
  })
})

describe('toMpvCommand', () => {
  it('maps only the allowed high-level commands', () => {
    expect(toMpvCommand({ type: 'toggle-pause' })).toEqual(['cycle', 'pause'])
    expect(toMpvCommand({ type: 'seek', mode: 'absolute', seconds: 30 })).toEqual([
      'seek',
      30,
      'absolute+exact',
    ])
    expect(toMpvCommand({ type: 'seek', mode: 'relative', seconds: -10 })).toEqual([
      'seek',
      -10,
      'relative',
    ])
    expect(toMpvCommand({ type: 'toggle-fullscreen' })).toBeNull()
  })

  it('rejects raw or unknown commands at the schema', () => {
    for (const bad of [
      { type: 'run', args: ['calc.exe'] },
      { type: 'seek', mode: 'absolute', seconds: Number.NaN },
      { type: 'set-volume', volume: 1000 },
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

    const args = buildMpvArgs({ mpvPath: 'mpv.exe', windowId: '12345' }, a)
    expect(args).toContain('--wid=12345')
    expect(args).toContain(`--input-ipc-server=${a}`)
    expect(args).toContain('--no-config')
    expect(args).toContain('--ytdl=no')
    expect(args).toContain('--hwdec=auto-safe')
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

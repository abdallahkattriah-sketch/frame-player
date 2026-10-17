import { existsSync, readFileSync, utimesSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  mpvFrameExtractor,
  previewSlot,
  ThumbnailService,
  videoCacheKey,
  type FrameExtractor,
} from '../../../src/main/media-engine/thumbnail-service'
import { useTempDirs } from './temp-dir'

const tempDir = useTempDirs()

function video(dir: string, name = 'clip.mkv') {
  const path = join(dir, name)
  writeFileSync(path, 'video bytes')
  return path
}

/** Extractor that waits for the test to release each call. */
function controlledExtractor() {
  const calls: { video: string; seconds: number; release: (ok?: boolean) => void }[] = []
  const extract: FrameExtractor = (videoPath, seconds, outFile, { signal }) =>
    new Promise((resolve, reject) => {
      const call = {
        video: videoPath,
        seconds,
        release: (ok = true) => {
          if (!ok) return reject(new Error('failed'))
          writeFileSync(outFile, 'jpeg')
          resolve()
        },
      }
      signal.addEventListener('abort', () => resolve())
      calls.push(call)
    })
  return { calls, extract }
}

const tick = () => new Promise((r) => setTimeout(r, 0))

describe('preview slots', () => {
  it('spaces previews at least a second apart and at most 200 per video', () => {
    expect(previewSlot(0, 12)).toEqual({ index: 0, time: 0.5 })
    expect(previewSlot(7.9, 12)).toEqual({ index: 7, time: 7.5 })
    // Two hours: 36-second slots; the last slot never goes past the end.
    expect(previewSlot(3600, 7200).index).toBe(100)
    expect(previewSlot(9999, 7200).index).toBe(199)
    expect(previewSlot(-5, 7200).index).toBe(0)
  })

  it('keys the cache by path, size and modification time', () => {
    const dir = tempDir()
    const path = video(dir)
    const key = videoCacheKey(path)
    expect(key).toMatch(/^[0-9a-f]{24}$/)
    utimesSync(path, new Date(), new Date(Date.now() + 5000))
    expect(videoCacheKey(path)).not.toBe(key)
    expect(videoCacheKey(join(dir, 'missing.mkv'))).toBeNull()
  })
})

describe('ThumbnailService', () => {
  it('generates once and serves from the cache afterwards', async () => {
    const dir = tempDir()
    const path = video(dir)
    const { calls, extract } = controlledExtractor()
    const service = new ThumbnailService({ dir: join(dir, 'thumbs'), extract })
    const first = service.preview(path, 12, 3.2)
    await tick()
    calls[0]?.release()
    const name = await first
    expect(name).toMatch(/^[0-9a-f]{24}\/3\.jpg$/)
    expect(calls[0]?.seconds).toBe(3.5)
    expect(await service.preview(path, 12, 3.9)).toBe(name)
    expect(calls).toHaveLength(1)
    const file = service.resolve('thumb', `/${name}`)
    expect(file && readFileSync(file, 'utf8')).toBe('jpeg')
  })

  it('replaces a queued preview with the newer request', async () => {
    const dir = tempDir()
    const path = video(dir)
    const { calls, extract } = controlledExtractor()
    const service = new ThumbnailService({ dir: join(dir, 'thumbs'), extract })
    const running = service.preview(path, 100, 10)
    const stale = service.preview(path, 100, 20)
    const latest = service.preview(path, 100, 30)
    await tick()
    expect(await stale).toBeNull()
    calls[0]?.release()
    expect(await running).not.toBeNull()
    await tick()
    expect(calls.map((c) => c.seconds)).toEqual([10.5, 30.5])
    calls[1]?.release()
    expect(await latest).not.toBeNull()
  })

  it('cancels work for a previous video and reports failures as null', async () => {
    const dir = tempDir()
    const a = video(dir, 'a.mkv')
    const b = video(dir, 'b.mkv')
    const { calls, extract } = controlledExtractor()
    const service = new ThumbnailService({ dir: join(dir, 'thumbs'), extract })
    const old = service.preview(a, 100, 10)
    await tick()
    const next = service.preview(b, 100, 10)
    expect(await old).toBeNull()
    await tick()
    calls[1]?.release(false)
    expect(await next).toBeNull()
  })

  it('only resolves names it creates', () => {
    const dir = tempDir()
    const service = new ThumbnailService({ dir, extract: async () => undefined })
    expect(service.resolve('thumb', '/0123456789abcdef01234567/5.jpg')).toBe(
      join(dir, '0123456789abcdef01234567', '5.jpg'),
    )
    expect(service.resolve('bookmark', '/42.jpg')).toBe(join(dir, 'bookmarks', '42.jpg'))
    for (const bad of ['/../secret/5.jpg', '/0123456789abcdef01234567/../../x.jpg', '/a/5.jpg']) {
      expect(service.resolve('thumb', bad)).toBeNull()
    }
    expect(service.resolve('bookmark', '/..%2F42.jpg')).toBeNull()
    expect(service.resolve('bookmark', '/1/42.jpg')).toBeNull()
  })
})

const root = resolve(__dirname, '../../..')
const mpvPath = join(root, 'resources', 'mpv', 'mpv.exe')
const clip = join(root, 'tests', 'fixtures', 'media', 'أفلام test', 'Test Pattern (2024).mkv')

describe.skipIf(!existsSync(mpvPath) || !existsSync(clip))('mpv frame extraction', () => {
  it('writes a JPEG of the requested frame from a Unicode path', async () => {
    const dir = tempDir()
    const service = new ThumbnailService({
      dir: join(dir, 'thumbs'),
      extract: mpvFrameExtractor(() => mpvPath),
    })
    const name = await service.preview(clip, 12, 6)
    expect(name).not.toBeNull()
    const bytes = readFileSync(service.resolve('thumb', `/${name}`) ?? '')
    expect(bytes.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]))
    expect(await service.bookmark(clip, 4.25, 7)).toBe(true)
    expect(existsSync(service.resolve('bookmark', '/7.jpg') ?? '')).toBe(true)
  })
})

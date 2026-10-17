import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  utimesSync,
} from 'node:fs'
import { join } from 'node:path'
import { pathKey } from '../library/path-key'

/** Extracts one frame of `videoPath` at `seconds` into `outFile` (JPEG). Rejects on failure. */
export type FrameExtractor = (
  videoPath: string,
  seconds: number,
  outFile: string,
  options: { exact: boolean; signal: AbortSignal },
) => Promise<void>

export interface ThumbnailServiceOptions {
  /** cache/thumbs: one folder per video, plus bookmarks/. */
  dir: string
  extract: FrameExtractor
  /** Video folders kept when pruning (most recently used first). */
  maxVideos?: number
}

export const THUMB_WIDTH = 240
/** Previews are taken at most this many positions per video. */
const MAX_PREVIEWS = 200
const MIN_INTERVAL_SECONDS = 1

/** Spacing of preview positions for a video of this duration. */
export function previewInterval(duration: number): number {
  return Math.max(MIN_INTERVAL_SECONDS, duration / MAX_PREVIEWS)
}

/** The preview slot covering `seconds`, and the time its frame is taken from. */
export function previewSlot(seconds: number, duration: number): { index: number; time: number } {
  const interval = previewInterval(duration)
  const last = Math.max(0, Math.ceil(duration / interval) - 1)
  const index = Math.min(last, Math.max(0, Math.floor(seconds / interval)))
  return { index, time: Math.min(index * interval + interval / 2, Math.max(0, duration - 0.1)) }
}

/**
 * Cache folder name for a video: changes when the file is replaced or modified, so stale
 * previews are never shown. Null when the file cannot be read.
 */
export function videoCacheKey(videoPath: string): string | null {
  try {
    const stat = statSync(videoPath)
    return createHash('sha256')
      .update(`${pathKey(videoPath)}\n${stat.size}\n${stat.mtimeMs}`)
      .digest('hex')
      .slice(0, 24)
  } catch {
    return null
  }
}

const VIDEO_KEY = /^[0-9a-f]{24}$/
const PREVIEW_FILE = /^(\d{1,3})\.jpg$/
const BOOKMARK_FILE = /^(\d{1,12})\.jpg$/

interface Job {
  kind: 'preview' | 'bookmark'
  run: (signal: AbortSignal) => Promise<void>
  done: (ok: boolean) => void
  videoPath: string
}

/**
 * Generates timeline previews and bookmark thumbnails off the UI path, one at a time.
 * A newer preview request replaces a queued older one (the pointer has moved on), and
 * switching videos cancels work for the previous video.
 */
export class ThumbnailService {
  private readonly queue: Job[] = []
  private running: { job: Job; abort: AbortController } | null = null

  constructor(private readonly options: ThumbnailServiceOptions) {}

  /**
   * File name (relative to the cache) of the preview covering `seconds`, generating it if
   * needed. Resolves null when superseded, cancelled, or the frame could not be extracted.
   */
  async preview(videoPath: string, duration: number, seconds: number): Promise<string | null> {
    if (!(duration > 0)) return null
    const key = videoCacheKey(videoPath)
    if (!key) return null
    const { index, time } = previewSlot(seconds, duration)
    const relative = `${key}/${index}.jpg`
    const file = join(this.options.dir, key, `${index}.jpg`)
    if (existsSync(file)) return relative

    this.cancelOtherVideos(videoPath)
    for (const queued of this.queue.filter((j) => j.kind === 'preview')) this.drop(queued)
    const ok = await this.enqueue({
      kind: 'preview',
      videoPath,
      run: (signal) => this.extractTo(videoPath, time, file, { exact: false, signal }),
    })
    return ok ? relative : null
  }

  /** Generates the thumbnail for a bookmark (exact frame). Resolves false on failure. */
  bookmark(videoPath: string, seconds: number, bookmarkId: number): Promise<boolean> {
    const file = this.bookmarkFile(bookmarkId)
    return this.enqueue({
      kind: 'bookmark',
      videoPath,
      run: (signal) => this.extractTo(videoPath, seconds, file, { exact: true, signal }),
    })
  }

  removeBookmark(bookmarkId: number): void {
    rmSync(this.bookmarkFile(bookmarkId), { force: true })
  }

  /**
   * Absolute path of a cached thumbnail named by `frame-art://thumb/...` or
   * `frame-art://bookmark/...`, or null if the name is not one this service creates.
   */
  resolve(kind: 'thumb' | 'bookmark', pathname: string): string | null {
    const parts = pathname.split('/').filter(Boolean)
    if (kind === 'thumb') {
      const [key, name] = parts
      if (parts.length !== 2 || !key || !name || !VIDEO_KEY.test(key) || !PREVIEW_FILE.test(name))
        return null
      return join(this.options.dir, key, name)
    }
    const [name] = parts
    if (parts.length !== 1 || !name || !BOOKMARK_FILE.test(name)) return null
    return join(this.options.dir, 'bookmarks', name)
  }

  /** Removes preview folders beyond the most recently used `maxVideos`. */
  prune(): void {
    let entries: { path: string; mtime: number }[]
    try {
      entries = readdirSync(this.options.dir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && VIDEO_KEY.test(e.name))
        .map((e) => {
          const path = join(this.options.dir, e.name)
          return { path, mtime: statSync(path).mtimeMs }
        })
    } catch {
      return
    }
    entries.sort((a, b) => b.mtime - a.mtime)
    for (const old of entries.slice(this.options.maxVideos ?? 100)) {
      rmSync(old.path, { recursive: true, force: true })
    }
  }

  /** Deletes all timeline previews (not bookmark thumbnails); pending previews are cancelled. */
  clearPreviews(): void {
    for (const job of this.queue.filter((j) => j.kind === 'preview')) this.drop(job)
    if (this.running?.job.kind === 'preview') this.running.abort.abort()
    let names: string[]
    try {
      names = readdirSync(this.options.dir).filter((name) => VIDEO_KEY.test(name))
    } catch {
      return
    }
    for (const name of names) rmSync(join(this.options.dir, name), { recursive: true, force: true })
  }

  /** Cancels everything (app shutdown or player closed). */
  cancelAll(): void {
    for (const job of this.queue.splice(0)) job.done(false)
    this.running?.abort.abort()
  }

  private bookmarkFile(bookmarkId: number): string {
    return join(this.options.dir, 'bookmarks', `${bookmarkId}.jpg`)
  }

  /** Previews for other videos are obsolete; bookmark thumbnails are kept. */
  private cancelOtherVideos(videoPath: string) {
    const key = pathKey(videoPath)
    const obsolete = (job: Job) => job.kind === 'preview' && pathKey(job.videoPath) !== key
    for (const job of this.queue.filter(obsolete)) this.drop(job)
    if (this.running && obsolete(this.running.job)) this.running.abort.abort()
  }

  private drop(job: Job) {
    const i = this.queue.indexOf(job)
    if (i >= 0) this.queue.splice(i, 1)
    job.done(false)
  }

  private enqueue(job: Omit<Job, 'done'>): Promise<boolean> {
    return new Promise((resolve) => {
      this.queue.push({ ...job, done: resolve })
      void this.pump()
    })
  }

  private async pump() {
    if (this.running) return
    const job = this.queue.shift()
    if (!job) return
    const abort = new AbortController()
    this.running = { job, abort }
    let ok: boolean
    try {
      await job.run(abort.signal)
      ok = !abort.signal.aborted
    } catch {
      ok = false
    } finally {
      this.running = null
    }
    job.done(ok)
    void this.pump()
  }

  /** Extracts into a private temporary folder, then moves the result into place. */
  private async extractTo(
    videoPath: string,
    seconds: number,
    file: string,
    options: { exact: boolean; signal: AbortSignal },
  ) {
    const folder = join(file, '..')
    mkdirSync(folder, { recursive: true })
    const temp = join(this.options.dir, `.tmp-${randomUUID()}`)
    mkdirSync(temp)
    try {
      const out = join(temp, 'frame.jpg')
      await this.options.extract(videoPath, seconds, out, options)
      if (options.signal.aborted) return
      if (!existsSync(out)) throw new Error('No frame was produced')
      renameSync(out, file)
      const now = new Date()
      utimesSync(folder, now, now) // most recently used, for pruning
    } finally {
      rmSync(temp, { recursive: true, force: true })
    }
  }
}

const EXTRACT_TIMEOUT_MS = 15_000

/**
 * Frame extractor using a short-lived headless mpv: no window, no audio, user config and
 * scripts ignored, arguments passed without a shell.
 */
export function mpvFrameExtractor(mpvPath: () => string): FrameExtractor {
  return (videoPath, seconds, outFile, { exact, signal }) =>
    new Promise((resolve, reject) => {
      if (signal.aborted) return resolve()
      const outDir = join(outFile, '..')
      const args = [
        '--no-config',
        '--load-scripts=no',
        '--ytdl=no',
        '--terminal=no',
        '--msg-level=all=no',
        '--audio=no',
        '--sub=no',
        '--hwdec=no',
        `--hr-seek=${exact ? 'yes' : 'no'}`,
        `--start=${seconds.toFixed(3)}`,
        '--frames=1',
        '--vo=image',
        '--vo-image-format=jpg',
        '--vo-image-jpeg-quality=80',
        `--vo-image-outdir=${outDir}`,
        `--vf=scale=${THUMB_WIDTH}:-2`,
        '--',
        videoPath,
      ]
      const child = spawn(mpvPath(), args, { shell: false, windowsHide: true, stdio: 'ignore' })
      const timer = setTimeout(() => child.kill(), EXTRACT_TIMEOUT_MS)
      const onAbort = () => child.kill()
      signal.addEventListener('abort', onAbort, { once: true })
      child.once('error', (error) => {
        clearTimeout(timer)
        signal.removeEventListener('abort', onAbort)
        reject(error)
      })
      child.once('exit', (code) => {
        clearTimeout(timer)
        signal.removeEventListener('abort', onAbort)
        if (signal.aborted) return resolve()
        // mpv's image output names files 00000001.jpg, 00000002.jpg, ...
        const produced = join(outDir, '00000001.jpg')
        if (code !== 0 || !existsSync(produced)) {
          return reject(new Error(`mpv could not extract a frame (exit code ${code})`))
        }
        renameSync(produced, outFile)
        resolve()
      })
    })
}

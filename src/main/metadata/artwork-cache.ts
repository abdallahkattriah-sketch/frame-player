import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { ArtworkKind } from '@shared/contracts/metadata'
import type { HttpClient } from '../network/http-client'
import { MAX_CACHE_AGE_MS } from './metadata-service'

/** Sizes requested per kind; small enough for the UI, never "original". */
export const ARTWORK_SIZES: Record<ArtworkKind, string> = {
  poster: 'w342',
  backdrop: 'w1280',
  still: 'w300',
  profile: 'w185',
}

const DEFAULT_BASE_URL = 'https://image.tmdb.org/t/p/'
const MAX_BYTES = 10 * 1024 * 1024
const PATH_PATTERN = /^\/[A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp)$/
/** Only raster formats: SVG can carry script and is never needed for posters. */
const CONTENT_TYPES: Record<string, string> = {
  'image/jpeg': 'image/jpeg',
  'image/png': 'image/png',
  'image/webp': 'image/webp',
}

export interface ArtworkCacheOptions {
  dir: string
  http: HttpClient
  /** Downloads are allowed (privacy setting and network); cached files are always served. */
  canDownload: () => boolean
  /** secure_base_url from TMDB /configuration, when known. */
  getBaseUrl?: () => string | undefined
}

export interface Artwork {
  bytes: Buffer
  contentType: string
}

function contentTypeFor(path: string): string {
  if (path.endsWith('.png')) return 'image/png'
  if (path.endsWith('.webp')) return 'image/webp'
  return 'image/jpeg'
}

/** Disk cache for TMDB images, keyed by kind and TMDB file path. */
export class ArtworkCache {
  private readonly inflight = new Map<string, Promise<Artwork | null>>()

  constructor(private readonly options: ArtworkCacheOptions) {}

  isValidPath(path: string): boolean {
    return PATH_PATTERN.test(path)
  }

  /** Returns cached artwork, downloading it once if allowed. Null when unavailable. */
  get(kind: ArtworkKind, path: string): Promise<Artwork | null> {
    if (!this.isValidPath(path)) return Promise.resolve(null)
    const size = ARTWORK_SIZES[kind]
    const file = join(this.options.dir, size, path.slice(1))
    const key = `${size}${path}`
    const pending = this.inflight.get(key)
    if (pending) return pending
    const task = this.load(file, size, path).finally(() => this.inflight.delete(key))
    this.inflight.set(key, task)
    return task
  }

  /** Deletes cached images older than the TMDB caching limit. */
  async purgeExpired(now = Date.now()): Promise<number> {
    let removed = 0
    let sizes: string[]
    try {
      sizes = await readdir(this.options.dir)
    } catch {
      return 0
    }
    for (const size of sizes) {
      const dir = join(this.options.dir, size)
      let files: string[]
      try {
        files = await readdir(dir)
      } catch {
        continue
      }
      for (const name of files) {
        const file = join(dir, name)
        try {
          if (now - (await stat(file)).mtimeMs > MAX_CACHE_AGE_MS) {
            await rm(file, { force: true })
            removed++
          }
        } catch {
          // Already gone or locked; try again next time.
        }
      }
    }
    return removed
  }

  private async load(file: string, size: string, path: string): Promise<Artwork | null> {
    try {
      return { bytes: await readFile(file), contentType: contentTypeFor(path) }
    } catch {
      // Not cached yet.
    }
    if (!this.options.canDownload()) return null

    const base = this.options.getBaseUrl?.() ?? DEFAULT_BASE_URL
    const url = new URL(`${base.replace(/\/?$/, '/')}${size}${path}`)
    const loopback = url.hostname === '127.0.0.1' || url.hostname === 'localhost'
    if (url.protocol !== 'https:' && !loopback) return null
    try {
      const { bytes, contentType } = await this.options.http.getBytes(url, { maxBytes: MAX_BYTES })
      const type = CONTENT_TYPES[contentType.split(';')[0]?.trim().toLowerCase() ?? '']
      if (!type) return null // e.g. an HTML error page
      await mkdir(dirname(file), { recursive: true })
      const tmp = `${file}.${process.pid}.tmp`
      await writeFile(tmp, bytes)
      await rename(tmp, file)
      return { bytes, contentType: type }
    } catch {
      return null
    }
  }
}

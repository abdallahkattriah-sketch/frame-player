import { protocol } from 'electron'
import { artworkKinds, type ArtworkKind } from '@shared/contracts/metadata'
import { readFile } from 'node:fs/promises'
import type { ArtworkCache } from './artwork-cache'
import type { ThumbnailService } from '../media-engine/thumbnail-service'

export const ARTWORK_SCHEME = 'frame-art'

/** Must run before the app is ready. */
export function registerArtworkScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: ARTWORK_SCHEME, privileges: { standard: true, secure: true } },
  ])
}

const notFound = () => new Response(null, { status: 404 })

/**
 * Serves `frame-art://<kind>/<tmdb file path>` from the artwork cache, downloading on first
 * use when online lookups are enabled, and `frame-art://thumb/...` / `frame-art://bookmark/...`
 * from the thumbnail cache. Nothing else on disk is reachable through it.
 */
export function handleArtworkProtocol(cache: ArtworkCache, thumbnails: ThumbnailService): void {
  protocol.handle(ARTWORK_SCHEME, async (request) => {
    let url: URL
    try {
      url = new URL(request.url)
    } catch {
      return notFound()
    }
    if (url.hostname === 'thumb' || url.hostname === 'bookmark') {
      const file = thumbnails.resolve(url.hostname, url.pathname)
      if (!file) return notFound()
      try {
        const bytes = await readFile(file)
        // Bookmark ids can be reused after deletion, so the page must not cache these.
        return new Response(new Uint8Array(bytes), {
          headers: { 'content-type': 'image/jpeg', 'cache-control': 'no-store' },
        })
      } catch {
        return notFound()
      }
    }
    const kind = url.hostname as ArtworkKind
    if (!artworkKinds.includes(kind) || !cache.isValidPath(url.pathname)) return notFound()
    const art = await cache.get(kind, url.pathname)
    if (!art) return notFound()
    return new Response(new Uint8Array(art.bytes), {
      headers: { 'content-type': art.contentType, 'cache-control': 'max-age=86400' },
    })
  })
}

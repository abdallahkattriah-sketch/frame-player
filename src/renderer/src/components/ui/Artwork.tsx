import { useState, type ReactNode } from 'react'
import { artworkUrl, type ArtworkKind } from '@shared/contracts/metadata'

interface ArtworkProps {
  kind: ArtworkKind
  path: string | null
  alt: string
  className?: string
  /** Shown when there is no artwork or it cannot be loaded (e.g. offline, not cached). */
  fallback: ReactNode
}

/** Cached TMDB artwork served by the main process, with a graceful fallback. */
export function Artwork({ kind, path, alt, className, fallback }: ArtworkProps) {
  const url = artworkUrl(kind, path)
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  if (!url || failedUrl === url) return <>{fallback}</>
  return (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setFailedUrl(url)}
      className={className}
    />
  )
}

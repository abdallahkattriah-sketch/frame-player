import { useCallback, useEffect, useState } from 'react'
import type { Collection } from '@shared/contracts/collections'

/** The user's collections and playlists, refreshed whenever the library changes. */
export function useCollections() {
  const [collections, setCollections] = useState<Collection[]>([])

  const reload = useCallback(() => {
    window.frame.collections
      .list()
      .then(setCollections)
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    reload()
    return window.frame.library.onChanged(reload)
  }, [reload])

  return { collections, reload }
}

export function errorText(e: unknown): string {
  return e instanceof Error
    ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
    : String(e)
}

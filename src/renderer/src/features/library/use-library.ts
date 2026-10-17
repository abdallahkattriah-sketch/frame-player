import { useCallback, useEffect, useRef, useState } from 'react'
import type { LibraryItem, LibraryQuery, LibraryShow } from '@shared/contracts/library'
import type { ViewPreference } from '@shared/settings/schema'

/** Re-runs `load` on mount, when `deps` change, and when the library changes. */
function useLibraryData<T>(load: () => Promise<T>, key: string) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const loadRef = useRef(load)
  // Keep the latest loader without re-subscribing; declared before the effect that uses it.
  useEffect(() => {
    loadRef.current = load
  })

  const refresh = useCallback(() => {
    let active = true
    loadRef
      .current()
      .then((result) => {
        if (!active) return
        setData(result)
        setError(null)
      })
      .catch((e: unknown) => {
        if (active) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const cancel = refresh()
    const unsubscribe = window.frame.library.onChanged(() => refresh())
    return () => {
      cancel()
      unsubscribe()
    }
  }, [refresh, key])

  return { data, error }
}

export function useLibraryQuery(query: LibraryQuery) {
  const key = JSON.stringify(query)
  return useLibraryData<LibraryItem[]>(() => window.frame.library.query(query), key)
}

export function useShows(search: string) {
  return useLibraryData<LibraryShow[]>(
    () => window.frame.library.listShows(search || undefined),
    search,
  )
}

export function useResolutions() {
  return useLibraryData<string[]>(() => window.frame.library.listResolutions(), 'resolutions')
}

export function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), ms)
    return () => window.clearTimeout(t)
  }, [value, ms])
  return debounced
}

/** Layout and sort for a view, persisted in settings. */
export function useViewPreference(viewId: string, fallback: ViewPreference) {
  const [pref, setPref] = useState<ViewPreference>(fallback)

  useEffect(() => {
    let active = true
    window.frame.settings
      .get()
      .then((s) => {
        const stored = s.ui.viewPreferences[viewId]
        if (active && stored) setPref(stored)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [viewId])

  const update = useCallback(
    (patch: Partial<ViewPreference>) => {
      setPref((prev) => {
        const next = { ...prev, ...patch }
        void window.frame.settings
          .get()
          .then((s) =>
            window.frame.settings.update({
              ui: { viewPreferences: { ...s.ui.viewPreferences, [viewId]: next } },
            }),
          )
          .catch(() => undefined)
        return next
      })
    },
    [viewId],
  )

  return [pref, update] as const
}

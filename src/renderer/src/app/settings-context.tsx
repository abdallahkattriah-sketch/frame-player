import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { AppSettings, SettingsPatch } from '@shared/settings/schema'
import { applyAppearance } from './appearance'

const SAVE_DELAY_MS = 150

interface SettingsContextValue {
  settings: AppSettings | null
  /**
   * Applies the change immediately (live preview), then saves it shortly after; quick
   * successive edits are merged into one save. A rejected save restores the stored settings.
   */
  update: (patch: SettingsPatch) => void
  /** Saves edits that are still waiting; call before main-process actions that read settings. */
  flush: () => Promise<void>
  error: string | null
}

const SettingsContext = createContext<SettingsContextValue>({
  settings: null,
  update: () => undefined,
  flush: () => Promise.resolve(),
  error: null,
})

function mergePatch(a: SettingsPatch, b: SettingsPatch): SettingsPatch {
  const merged: Record<string, object> = { ...a }
  for (const [section, value] of Object.entries(b)) {
    merged[section] = { ...(merged[section] ?? {}), ...(value as object) }
  }
  return merged as SettingsPatch
}

function errorText(e: unknown) {
  return e instanceof Error
    ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
    : String(e)
}

/** One settings subscription per window; also applies the appearance settings to the page. */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pending = useRef<SettingsPatch | null>(null)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    let active = true
    window.frame.settings
      .get()
      .then((s) => {
        if (active) setSettings(s)
      })
      .catch(() => undefined)
    const unsubscribe = window.frame.settings.onChanged((s) => {
      // Don't overwrite edits that are still waiting to be saved.
      if (active && !pending.current) setSettings(s)
    })
    return () => {
      active = false
      unsubscribe()
      window.clearTimeout(timer.current)
    }
  }, [])

  useEffect(() => {
    if (settings) applyAppearance(settings.appearance)
  }, [settings])

  const flush = useCallback((): Promise<void> => {
    window.clearTimeout(timer.current)
    const toSave = pending.current
    if (!toSave) return Promise.resolve()
    return window.frame.settings
      .update(toSave)
      .then((saved) => {
        if (pending.current === toSave) {
          pending.current = null
          setSettings(saved)
        }
        setError(null)
      })
      .catch((e: unknown) => {
        pending.current = null
        setError(errorText(e))
        void window.frame.settings.get().then(setSettings)
      })
  }, [])

  const update = useCallback(
    (patch: SettingsPatch) => {
      setSettings((current) => {
        if (!current) return current
        const next = { ...current } as Record<string, object>
        for (const [section, value] of Object.entries(patch)) {
          next[section] = { ...(next[section] ?? {}), ...(value as object) }
        }
        return next as AppSettings
      })
      pending.current = pending.current ? mergePatch(pending.current, patch) : patch
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => void flush(), SAVE_DELAY_MS)
    },
    [flush],
  )

  const value = useMemo(
    () => ({ settings, update, flush, error }),
    [settings, update, flush, error],
  )
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings(): SettingsContextValue {
  return useContext(SettingsContext)
}

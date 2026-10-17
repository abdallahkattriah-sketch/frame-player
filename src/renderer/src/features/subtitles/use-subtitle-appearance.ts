import { useCallback, useEffect, useRef, useState } from 'react'
import type { SubtitleAppearance } from '@shared/settings/subtitle-style'

const SAVE_DELAY_MS = 150

function errorText(e: unknown) {
  return e instanceof Error
    ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
    : String(e)
}

/**
 * Subtitle profiles from settings. Changes show immediately and are saved shortly after
 * (dragging a slider sends one update, not one per pixel); a rejected save is reverted.
 */
export function useSubtitleAppearance() {
  const [appearance, setAppearance] = useState<SubtitleAppearance | null>(null)
  const [error, setError] = useState<string | null>(null)
  const saved = useRef<SubtitleAppearance | null>(null)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    window.frame.settings
      .get()
      .then((s) => {
        saved.current = s.subtitleStyle
        setAppearance(s.subtitleStyle)
      })
      .catch((e: unknown) => setError(errorText(e)))
    // Another window (player or settings) or a reset changed the profiles.
    const off = window.frame.settings.onChanged((s) => {
      saved.current = s.subtitleStyle
      if (timer.current === undefined) setAppearance(s.subtitleStyle)
    })
    return () => {
      off()
      window.clearTimeout(timer.current)
    }
  }, [])

  const change = useCallback((next: SubtitleAppearance) => {
    setAppearance(next)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      timer.current = undefined
      window.frame.settings
        .update({ subtitleStyle: next })
        .then((s) => {
          saved.current = s.subtitleStyle
          setError(null)
        })
        .catch((e: unknown) => {
          setAppearance(saved.current)
          setError(errorText(e))
        })
    }, SAVE_DELAY_MS)
  }, [])

  return { appearance, change, error }
}

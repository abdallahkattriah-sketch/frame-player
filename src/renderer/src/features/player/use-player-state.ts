import { useEffect, useState } from 'react'
import { initialPlayerState, type PlayerState } from '@shared/contracts/player'

/** Mirrors the main process's mpv-derived player state. */
export function usePlayerState(): PlayerState {
  const [state, setState] = useState<PlayerState>(initialPlayerState)

  useEffect(() => {
    let active = true
    const unsubscribe = window.frame.player.onState((next) => {
      if (active) setState(next)
    })
    window.frame.player
      .getState()
      .then((next) => {
        if (active) setState(next)
      })
      .catch(() => undefined)
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  return state
}

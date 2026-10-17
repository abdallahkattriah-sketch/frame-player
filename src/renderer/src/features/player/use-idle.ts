import { useEffect, useState } from 'react'

/** True after `ms` without pointer or keyboard activity in the window. */
export function useIdle(ms: number): boolean {
  const [idle, setIdle] = useState(false)

  useEffect(() => {
    let timer = window.setTimeout(() => setIdle(true), ms)
    const wake = () => {
      setIdle(false)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setIdle(true), ms)
    }
    const events = ['pointermove', 'pointerdown', 'keydown', 'wheel'] as const
    for (const e of events) window.addEventListener(e, wake)
    return () => {
      window.clearTimeout(timer)
      for (const e of events) window.removeEventListener(e, wake)
    }
  }, [ms])

  return idle
}

import { useEffect, useState } from 'react'
import type { AppInfo } from '@shared/contracts/ipc'

export function HomeView() {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    window.frame.app
      .getInfo()
      .then((result) => {
        if (!cancelled) setInfo(result)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Your library is empty</h1>
      <p className="max-w-sm text-sm text-muted">
        Library folders and playback arrive in upcoming milestones.
      </p>
      <p className="text-xs text-subtle" data-testid="app-info">
        {error
          ? `Bridge error: ${error}`
          : info
            ? `${info.name} ${info.version} · Electron ${info.electronVersion}`
            : 'Connecting…'}
      </p>
    </section>
  )
}

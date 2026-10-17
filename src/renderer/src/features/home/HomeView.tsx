import { useEffect, useState } from 'react'
import type { AppInfo, StartupStatus } from '@shared/contracts/ipc'

export function HomeView() {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [startup, setStartup] = useState<StartupStatus>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([window.frame.app.getInfo(), window.frame.app.getStartupStatus()])
      .then(([appInfo, startupStatus]) => {
        if (cancelled) return
        setInfo(appInfo)
        setStartup(startupStatus)
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
      {startup.databaseRecovery && (
        <div
          role="alert"
          data-testid="database-recovered"
          className="mb-4 max-w-lg rounded-md border border-danger/40 bg-danger/10 px-4 py-3 text-left text-sm"
        >
          Frame&apos;s database could not be read, so a fresh one was created. The old file was kept
          at <span className="break-all text-muted">{startup.databaseRecovery.backupPath}</span>
        </div>
      )}
      <h1 className="text-2xl font-semibold tracking-tight">Your library is empty</h1>
      <p className="max-w-sm text-sm text-muted">
        Library folders arrive in an upcoming milestone. You can already play a single file.
      </p>
      <button
        type="button"
        onClick={() => void window.frame.player.openFileDialog()}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-bg hover:brightness-110"
      >
        Open video…
      </button>
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

import { useEffect, useState } from 'react'
import type { AppInfo, StartupStatus } from '@shared/contracts/ipc'
import type { OpenMediaResult } from '@shared/contracts/player'
import { useFileDrop } from '@renderer/features/player/use-file-drop'

export function HomeView() {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [startup, setStartup] = useState<StartupStatus>({})
  const [error, setError] = useState<string | null>(null)
  const [openError, setOpenError] = useState<string | null>(null)

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

  const showResult = (result: OpenMediaResult) => setOpenError(result.error ?? null)
  const drop = useFileDrop(showResult)
  const open = (picker: () => Promise<OpenMediaResult>) => {
    picker()
      .then(showResult)
      .catch((err: unknown) => setOpenError(err instanceof Error ? err.message : String(err)))
  }

  return (
    <section
      className={`flex h-full flex-col items-center justify-center gap-3 rounded-xl text-center ${
        drop.dragging ? 'outline-2 outline-dashed outline-accent' : ''
      }`}
      {...drop.handlers}
    >
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
        Library folders arrive in an upcoming milestone. Meanwhile, open videos or a folder, or drop
        them here.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => open(window.frame.player.openFilesDialog)}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-bg hover:brightness-110"
        >
          Open videos…
        </button>
        <button
          type="button"
          onClick={() => open(window.frame.player.openFolderDialog)}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-elevated"
        >
          Open folder…
        </button>
      </div>
      {openError && (
        <p role="alert" className="text-sm text-danger">
          {openError}
        </p>
      )}
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

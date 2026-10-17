import { useState } from 'react'
import { FolderPlus, HardDrive, RefreshCw, Trash2 } from 'lucide-react'
import type { LibraryFolder, ScanProgress } from '@shared/contracts/library'
import { ConfirmDialog } from '@renderer/components/ui/ConfirmDialog'
import { useLibraryFolders } from './use-library-folders'

function statusText(folder: LibraryFolder, progress: ScanProgress | undefined): string {
  if (progress?.status === 'scanning' || folder.lastScanStatus === 'scanning') {
    return progress ? `Scanning… ${progress.found.toLocaleString()} videos found` : 'Scanning…'
  }
  switch (folder.lastScanStatus) {
    case 'never':
      return 'Not scanned yet'
    case 'unavailable':
      return 'Not available — is the drive connected?'
    case 'failed':
      return `Scan failed: ${folder.lastScanError ?? 'unknown error'}`
    case 'cancelled':
      return 'Scan cancelled'
    case 'complete': {
      const missing = folder.missingCount > 0 ? ` · ${folder.missingCount} missing` : ''
      return `${folder.fileCount.toLocaleString()} videos${missing}`
    }
  }
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.currentTarget.checked)}
        className="accent-[var(--frame-accent)]"
      />
      {label}
    </label>
  )
}

function FolderRow({
  folder,
  progress,
  onRemove,
  onChanged,
}: {
  folder: LibraryFolder
  progress: ScanProgress | undefined
  onRemove: () => void
  onChanged: () => void
}) {
  const [exclusions, setExclusions] = useState(folder.exclusions.join('\n'))
  const [error, setError] = useState<string | null>(null)
  const scanning = progress?.status === 'scanning' || folder.lastScanStatus === 'scanning'

  const update = (options: Parameters<typeof window.frame.library.updateFolder>[1]) => {
    window.frame.library
      .updateFolder(folder.id, options)
      .then(() => {
        setError(null)
        onChanged()
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }

  return (
    <li className="rounded-lg border border-border bg-surface p-4" data-testid="library-folder">
      <div className="flex items-start gap-3">
        <HardDrive
          size={18}
          className={`mt-0.5 shrink-0 ${folder.available ? 'text-muted' : 'text-danger'}`}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium" title={folder.path}>
            {folder.path}
          </div>
          <div className="mt-0.5 text-xs text-muted" data-testid="library-folder-status">
            {statusText(folder, progress)}
          </div>
        </div>
        <button
          type="button"
          aria-label={`Rescan ${folder.path}`}
          title="Rescan"
          disabled={scanning}
          onClick={() => void window.frame.library.rescan(folder.id)}
          className="rounded-md p-1.5 text-muted hover:bg-elevated hover:text-text disabled:opacity-40"
        >
          <RefreshCw size={16} className={scanning ? 'animate-spin' : undefined} />
        </button>
        <button
          type="button"
          aria-label={`Remove ${folder.path} from library`}
          title="Remove from library"
          onClick={onRemove}
          className="rounded-md p-1.5 text-muted hover:bg-elevated hover:text-danger"
        >
          <Trash2 size={16} />
        </button>
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-subtle hover:text-muted">Options</summary>
        <div className="mt-3 flex flex-col gap-3 pl-1">
          <Toggle
            label="Rescan automatically when files change"
            checked={folder.autoRescan}
            onChange={(autoRescan) => update({ autoRescan })}
          />
          <Toggle
            label="Follow symbolic links and junctions"
            checked={folder.followSymlinks}
            onChange={(followSymlinks) => update({ followSymlinks })}
          />
          <label className="flex flex-col gap-1 text-xs text-muted">
            Excluded subfolders (one per line, relative to this folder)
            <textarea
              value={exclusions}
              onChange={(e) => setExclusions(e.currentTarget.value)}
              onBlur={() =>
                update({
                  exclusions: exclusions
                    .split('\n')
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              rows={3}
              className="rounded-md border border-border bg-bg p-2 font-mono text-xs text-text focus:border-accent focus:outline-none"
            />
          </label>
          {error && (
            <p role="alert" className="text-xs text-danger">
              {error}
            </p>
          )}
        </div>
      </details>
    </li>
  )
}

export function LibraryFoldersSection() {
  const { folders, progress, error, refresh } = useLibraryFolders()
  const [message, setMessage] = useState<string | null>(null)
  const [pendingRemoval, setPendingRemoval] = useState<LibraryFolder | null>(null)

  const addFolder = () => {
    window.frame.library
      .addFolderDialog()
      .then((result) => {
        setMessage(result?.error ?? null)
        refresh()
      })
      .catch((e: unknown) => setMessage(e instanceof Error ? e.message : String(e)))
  }

  return (
    <section aria-labelledby="library-folders-heading" className="max-w-3xl">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex-1">
          <h2 id="library-folders-heading" className="text-lg font-semibold">
            Library folders
          </h2>
          <p className="text-sm text-muted">
            Frame reads these folders to build your library. Removing a folder never deletes your
            files.
          </p>
        </div>
        {folders && folders.length > 1 && (
          <button
            type="button"
            onClick={() => void window.frame.library.rescan()}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-elevated"
          >
            Rescan all
          </button>
        )}
        <button
          type="button"
          onClick={addFolder}
          className="flex items-center gap-2 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-bg hover:brightness-110"
        >
          <FolderPlus size={16} aria-hidden />
          Add folder
        </button>
      </div>

      {(message ?? error) && (
        <p role="alert" className="mb-3 text-sm text-danger">
          {message ?? error}
        </p>
      )}

      {folders === null ? (
        <div className="h-20 animate-pulse rounded-lg bg-surface" aria-label="Loading folders" />
      ) : folders.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted">
          No folders yet. Add the folders where you keep movies and shows.
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {folders.map((folder) => (
            <FolderRow
              key={folder.id}
              folder={folder}
              progress={progress[folder.id]}
              onRemove={() => setPendingRemoval(folder)}
              onChanged={refresh}
            />
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={pendingRemoval !== null}
        title="Remove folder from library?"
        confirmLabel="Remove"
        destructive
        onCancel={() => setPendingRemoval(null)}
        onConfirm={() => {
          const folder = pendingRemoval
          setPendingRemoval(null)
          if (!folder) return
          window.frame.library
            .removeFolder(folder.id)
            .then(refresh)
            .catch((e: unknown) => setMessage(e instanceof Error ? e.message : String(e)))
        }}
      >
        <span className="break-all">{pendingRemoval?.path}</span> and its videos will be removed
        from Frame. The files stay on your disk.
      </ConfirmDialog>
    </section>
  )
}

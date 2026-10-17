import { useCallback, useEffect, useState } from 'react'
import type { LibraryFolder, ScanProgress } from '@shared/contracts/library'

/** Library folders plus live scan progress pushed from the main process. */
export function useLibraryFolders() {
  const [folders, setFolders] = useState<LibraryFolder[] | null>(null)
  const [progress, setProgress] = useState<Record<number, ScanProgress>>({})
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    window.frame.library
      .listFolders()
      .then((list) => {
        setFolders(list)
        setError(null)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  useEffect(() => {
    refresh()
    return window.frame.library.onScanProgress((p) => {
      setProgress((prev) => ({ ...prev, [p.folderId]: p }))
      if (p.status !== 'scanning') refresh()
    })
  }, [refresh])

  return { folders, progress, error, refresh }
}

import { watch, type FSWatcher } from 'node:fs'
import { stat } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import type {
  AddFolderResult,
  FolderOptions,
  LibraryFolder,
  ScanProgress,
  ScanStatus,
} from '@shared/contracts/library'
import type { LibraryRepository, ScannedFile } from '../database/repositories/library-repository'
import { parentFolders, walkVideoFiles } from './directory-walker'
import { parseMediaName } from './filename-parser'
import { isSameOrInside, pathKey } from './path-key'

export interface LibraryServiceOptions {
  repository: LibraryRepository
  /** Lowercase extensions without dots, read at the start of each scan. */
  videoExtensions: () => readonly string[]
  onProgress: (progress: ScanProgress) => void
  warn?: (message: string) => void
  batchSize?: number
  progressIntervalMs?: number
  /** Quiet period after a file-system change before an automatic rescan. */
  autoRescanDelayMs?: number
}

interface RunningScan {
  controller: AbortController
  done: Promise<ScanStatus>
}

export class LibraryService {
  private readonly scans = new Map<number, RunningScan>()
  private readonly watchers = new Map<number, { watcher: FSWatcher; timer?: NodeJS.Timeout }>()
  private lastScanId = 0
  private disposed = false

  constructor(private readonly options: LibraryServiceOptions) {}

  listFolders(): LibraryFolder[] {
    return this.options.repository.listFolders().map((f) => ({
      ...f,
      lastScanStatus: this.scans.has(f.id) ? 'scanning' : f.lastScanStatus,
    }))
  }

  /** Adds a folder and starts scanning it in the background. */
  async addFolder(path: string): Promise<AddFolderResult> {
    const full = resolve(path)
    try {
      if (!(await stat(full)).isDirectory()) return { error: 'That path is not a folder.' }
    } catch {
      return { error: 'That folder could not be opened.' }
    }
    const key = pathKey(full)
    for (const existing of this.options.repository.folderKeys()) {
      if (isSameOrInside(key, existing.pathKey)) {
        return { error: 'This folder is already part of your library.' }
      }
      if (isSameOrInside(existing.pathKey, key)) {
        return {
          error:
            'This folder contains a folder that is already in your library. Remove that one first.',
        }
      }
    }
    const id = this.options.repository.insertFolder(full, key)
    void this.scan(id)
    return { folder: this.getFolder(id) }
  }

  /** Stops any scan and forgets the folder and its records. Never deletes files. */
  async removeFolder(id: number): Promise<void> {
    this.stopWatcher(id)
    const running = this.scans.get(id)
    if (running) {
      running.controller.abort()
      await running.done
    }
    this.options.repository.deleteFolder(id)
  }

  updateFolder(id: number, options: FolderOptions): LibraryFolder | undefined {
    if (!this.options.repository.getFolder(id)) return undefined
    const exclusions = options.exclusions?.map((e) => e.replace(/^[\\/]+|[\\/]+$/g, ''))
    this.options.repository.updateFolderOptions(id, { ...options, exclusions })
    const folder = this.getFolder(id)
    if (folder) this.syncWatcher(folder)
    return folder
  }

  /** Scans one folder. A scan already running for it is joined, never duplicated. */
  scan(id: number): Promise<ScanStatus> {
    const running = this.scans.get(id)
    if (running) return running.done
    const controller = new AbortController()
    const done = this.runScan(id, controller.signal).finally(() => this.scans.delete(id))
    this.scans.set(id, { controller, done })
    return done
  }

  scanAll(): Promise<ScanStatus[]> {
    return Promise.all(this.options.repository.folderKeys().map((f) => this.scan(f.id)))
  }

  /** Starts watchers for folders with automatic rescanning enabled. */
  startWatchers(): void {
    for (const folder of this.options.repository.listFolders()) this.syncWatcher(folder)
  }

  async dispose(): Promise<void> {
    this.disposed = true
    for (const id of [...this.watchers.keys()]) this.stopWatcher(id)
    const pending = [...this.scans.values()]
    for (const s of pending) s.controller.abort()
    await Promise.all(pending.map((s) => s.done))
  }

  private getFolder(id: number): LibraryFolder | undefined {
    return this.listFolders().find((f) => f.id === id)
  }

  private nextScanId(): number {
    // Monotonic even if the clock goes backwards.
    this.lastScanId = Math.max(this.lastScanId + 1, Date.now())
    return this.lastScanId
  }

  private async runScan(id: number, signal: AbortSignal): Promise<ScanStatus> {
    const repo = this.options.repository
    const folder = repo.getFolder(id)
    if (!folder) return 'failed'
    const progress: ScanProgress = {
      folderId: id,
      status: 'scanning',
      examined: 0,
      found: 0,
      error: null,
    }
    const emit = () => this.options.onProgress({ ...progress })
    const interval = this.options.progressIntervalMs ?? 250
    let lastEmit = 0

    repo.setScanState(id, { status: 'scanning' })
    emit()

    try {
      const rootStat = await stat(folder.path).catch(() => null)
      if (!rootStat?.isDirectory()) {
        // Removable drive unplugged or folder moved: keep records, mark unavailable.
        return this.finish(
          id,
          progress,
          'unavailable',
          'The folder is not available right now.',
          false,
        )
      }

      const scanId = this.nextScanId()
      const batchSize = this.options.batchSize ?? 500
      let batch: ScannedFile[] = []
      const flush = () => {
        if (batch.length > 0) repo.upsertFiles(id, scanId, batch)
        batch = []
      }

      const walker = walkVideoFiles(
        {
          root: folder.path,
          extensions: this.options.videoExtensions(),
          followSymlinks: folder.followSymlinks,
          exclusions: folder.exclusions,
          signal,
          onExamined: () => {
            progress.examined++
            const now = Date.now()
            if (now - lastEmit >= interval) {
              lastEmit = now
              emit()
            }
          },
        },
        (path, error) =>
          this.options.warn?.(
            `library: skipped ${path}: ${error instanceof Error ? error.message : String(error)}`,
          ),
      )

      for await (const file of walker) {
        const parsed = parseMediaName(basename(file.path), parentFolders(file.relativePath))
        batch.push({
          ...file,
          ...parsed,
          pathKey: pathKey(file.path),
          fileName: basename(file.path),
        })
        progress.found++
        if (batch.length >= batchSize) {
          flush()
          // Let IPC and timers run between batches.
          await new Promise((r) => setImmediate(r))
        }
      }
      flush()
      repo.markUnseenMissing(id, scanId)
      return this.finish(id, progress, 'complete', null, true)
    } catch (error) {
      if (signal.aborted) return this.finish(id, progress, 'cancelled', null, undefined)
      const message = error instanceof Error ? error.message : String(error)
      return this.finish(id, progress, 'failed', message, undefined)
    }
  }

  private finish(
    id: number,
    progress: ScanProgress,
    status: ScanStatus,
    error: string | null,
    available: boolean | undefined,
  ): ScanStatus {
    // The folder may have been removed while scanning.
    if (this.options.repository.getFolder(id)) {
      this.options.repository.setScanState(id, {
        status,
        error,
        available: status === 'unavailable' ? false : available,
        finished: status !== 'cancelled',
      })
    }
    this.options.onProgress({ ...progress, status, error })
    return status
  }

  private syncWatcher(folder: LibraryFolder) {
    this.stopWatcher(folder.id)
    if (!folder.autoRescan || this.disposed) return
    try {
      const watcher = watch(folder.path, { recursive: true, persistent: false }, () => {
        const entry = this.watchers.get(folder.id)
        if (!entry) return
        clearTimeout(entry.timer)
        entry.timer = setTimeout(
          () => void this.scan(folder.id),
          this.options.autoRescanDelayMs ?? 5000,
        )
      })
      watcher.on('error', () => this.stopWatcher(folder.id)) // e.g. drive removed
      this.watchers.set(folder.id, { watcher })
    } catch (error) {
      this.options.warn?.(
        `library: cannot watch ${folder.path}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  private stopWatcher(id: number) {
    const entry = this.watchers.get(id)
    if (!entry) return
    clearTimeout(entry.timer)
    entry.watcher.close()
    this.watchers.delete(id)
  }
}

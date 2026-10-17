import { mkdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { monitorEventLoopDelay } from 'node:perf_hooks'
import { describe, expect, it } from 'vitest'
import type { ScanProgress } from '@shared/contracts/library'
import { defaultVideoExtensions } from '@shared/constants/media'
import { openDatabase } from '../../../src/main/database/connection'
import { migrate } from '../../../src/main/database/migrator'
import { migrations } from '../../../src/main/database/migrations'
import { LibraryRepository } from '../../../src/main/database/repositories/library-repository'
import { LibraryService } from '../../../src/main/library/library-service'
import { useTempDirs } from './temp-dir'

const tempDir = useTempDirs()

function setup() {
  const db = openDatabase(':memory:')
  migrate(db, migrations)
  const repository = new LibraryRepository(db)
  const progress: ScanProgress[] = []
  const service = new LibraryService({
    repository,
    videoExtensions: () => defaultVideoExtensions,
    onProgress: (p) => progress.push(p),
    progressIntervalMs: 0,
  })
  const fileRows = () =>
    db
      .prepare(
        'SELECT id, relative_path AS rel, missing, parsed_kind AS kind, parsed_title AS title, parsed_season AS season, parsed_episode AS episode FROM media_files ORDER BY relative_path',
      )
      .all() as {
      id: number
      rel: string
      missing: number
      kind: string
      title: string
      season: number
      episode: number
    }[]
  return { db, repository, service, progress, fileRows }
}

function touch(path: string, content = 'x') {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, content)
}

async function addAndScan(service: LibraryService, path: string) {
  const result = await service.addFolder(path)
  expect(result.error).toBeUndefined()
  const id = result.folder?.id as number
  await service.scan(id) // joins the scan addFolder started
  return id
}

describe('LibraryService scanning', () => {
  it('finds videos recursively, parses names, and ignores other files', async () => {
    const root = tempDir()
    touch(join(root, 'Movies', 'The.Matrix.1999.1080p.mkv'))
    touch(join(root, 'TV', 'Breaking Bad (2008)', 'Season 1', 'S01E02.mkv'))
    touch(join(root, 'TV', 'Show.S01E01.mp4'))
    touch(join(root, 'notes.txt'))
    touch(join(root, 'Movies', 'cover.jpg'))
    touch(join(root, 'Movies', '~$lock.mkv'))
    touch(join(root, 'Movies', 'download.mkv.part'))
    touch(join(root, '$RECYCLE.BIN', 'deleted.mkv'))
    touch(join(root, '.hidden', 'secret.mkv'))
    const { service, fileRows, progress } = setup()

    const id = await addAndScan(service, root)
    const rows = fileRows()
    expect(rows.map((r) => r.rel)).toEqual([
      join('Movies', 'The.Matrix.1999.1080p.mkv'),
      join('TV', 'Breaking Bad (2008)', 'Season 1', 'S01E02.mkv'),
      join('TV', 'Show.S01E01.mp4'),
    ])
    expect(rows[1]).toMatchObject({ kind: 'episode', title: 'Breaking Bad', season: 1, episode: 2 })
    expect(service.listFolders()[0]).toMatchObject({ id, lastScanStatus: 'complete', fileCount: 3 })
    expect(progress.at(-1)).toMatchObject({ folderId: id, status: 'complete', found: 3 })
  })

  it('rescans without duplicates, keeps ids, and tracks missing and returning files', async () => {
    const root = tempDir()
    const a = join(root, 'A.2001.mkv')
    const b = join(root, 'B.2002.mkv')
    touch(a)
    touch(b)
    const { service, fileRows } = setup()
    const id = await addAndScan(service, root)
    const first = fileRows()

    await service.scan(id)
    expect(fileRows()).toEqual(first)

    rmSync(b)
    await service.scan(id)
    expect(fileRows().map((r) => [r.rel, r.missing])).toEqual([
      ['A.2001.mkv', 0],
      ['B.2002.mkv', 1],
    ])
    expect(service.listFolders()[0]).toMatchObject({ fileCount: 1, missingCount: 1 })

    touch(b)
    await service.scan(id)
    expect(fileRows()).toEqual(first) // same ids, no longer missing
  })

  it('marks an unavailable folder without touching its records', async () => {
    const parent = tempDir()
    const root = join(parent, 'Drive')
    touch(join(root, 'Film.2010.mkv'))
    const { service, fileRows } = setup()
    const id = await addAndScan(service, root)

    renameSync(root, join(parent, 'Unplugged'))
    expect(await service.scan(id)).toBe('unavailable')
    expect(service.listFolders()[0]).toMatchObject({
      available: false,
      lastScanStatus: 'unavailable',
    })
    expect(fileRows()).toHaveLength(1)
    expect(fileRows()[0]?.missing).toBe(0)

    renameSync(join(parent, 'Unplugged'), root)
    expect(await service.scan(id)).toBe('complete')
    expect(service.listFolders()[0]?.available).toBe(true)
  })

  it('rejects duplicate and nested folders', async () => {
    const root = tempDir()
    mkdirSync(join(root, 'Inner'))
    const { service } = setup()
    await addAndScan(service, root)

    expect((await service.addFolder(root)).error).toMatch(/already part/)
    expect((await service.addFolder(root.toUpperCase())).error).toMatch(/already part/)
    expect((await service.addFolder(join(root, 'Inner'))).error).toMatch(/already part/)
    expect((await service.addFolder(join(root, '..'))).error).toMatch(/contains a folder/)
    expect((await service.addFolder(join(root, 'nope'))).error).toMatch(/could not be opened/)
  })

  it('skips excluded subfolders after a rescan', async () => {
    const root = tempDir()
    touch(join(root, 'Keep', 'One.2001.mkv'))
    touch(join(root, 'Extras', 'Two.2002.mkv'))
    const { service, fileRows } = setup()
    const id = await addAndScan(service, root)
    expect(fileRows()).toHaveLength(2)

    service.updateFolder(id, { exclusions: ['/Extras/'] })
    await service.scan(id)
    expect(fileRows().map((r) => [r.rel, r.missing])).toEqual([
      [join('Extras', 'Two.2002.mkv'), 1],
      [join('Keep', 'One.2001.mkv'), 0],
    ])
    expect(service.listFolders()[0]?.exclusions).toEqual(['Extras'])
  })

  it('follows links only when enabled and terminates on link loops', async () => {
    const root = tempDir()
    const outside = tempDir()
    touch(join(outside, 'Linked.2003.mkv'))
    touch(join(root, 'Local.2004.mkv'))
    // Junctions need no special privileges on Windows.
    symlinkSync(outside, join(root, 'link-out'), 'junction')
    symlinkSync(root, join(root, 'loop'), 'junction')
    const { service, fileRows } = setup()
    const id = await addAndScan(service, root)
    expect(fileRows().map((r) => r.rel)).toEqual(['Local.2004.mkv'])

    service.updateFolder(id, { followSymlinks: true })
    expect(await service.scan(id)).toBe('complete')
    expect(
      fileRows()
        .map((r) => r.rel)
        .sort(),
    ).toEqual([join('link-out', 'Linked.2003.mkv'), 'Local.2004.mkv'].sort())
  })

  it('joins concurrent scan requests instead of running two', async () => {
    const root = tempDir()
    for (let i = 0; i < 50; i++) touch(join(root, `File ${i}.mkv`))
    const { service, progress } = setup()
    const added = await service.addFolder(root)
    const id = added.folder?.id as number
    const [a, b] = await Promise.all([service.scan(id), service.scan(id)])
    expect([a, b]).toEqual(['complete', 'complete'])
    expect(progress.filter((p) => p.status === 'complete')).toHaveLength(1)
  })

  it('cancels a running scan when the folder is removed and keeps no records', async () => {
    const root = tempDir()
    for (let i = 0; i < 2000; i++) touch(join(root, `d${i % 20}`, `File ${i}.mkv`))
    const { service, fileRows, progress } = setup()
    const added = await service.addFolder(root)
    await service.removeFolder(added.folder?.id as number)
    expect(service.listFolders()).toEqual([])
    expect(fileRows()).toEqual([])
    expect(progress.at(-1)?.status).toMatch(/cancelled|complete/)
  })
})

describe('LibraryService automatic rescanning', () => {
  it('rescans after file-system changes when enabled, and stops on dispose', async () => {
    const root = tempDir()
    touch(join(root, 'First.2001.mkv'))
    const db = openDatabase(':memory:')
    migrate(db, migrations)
    const progress: ScanProgress[] = []
    const service = new LibraryService({
      repository: new LibraryRepository(db),
      videoExtensions: () => defaultVideoExtensions,
      onProgress: (p) => progress.push(p),
      autoRescanDelayMs: 50,
    })
    const added = await service.addFolder(root)
    const id = added.folder?.id as number
    await service.scan(id)
    service.updateFolder(id, { autoRescan: true })

    touch(join(root, 'Sub', 'Second.2002.mkv'))
    await expect
      .poll(() => service.listFolders()[0]?.fileCount, { timeout: 5000, interval: 50 })
      .toBe(2)

    await service.dispose()
    const completed = progress.filter((p) => p.status === 'complete').length
    touch(join(root, 'Third.2003.mkv'))
    await new Promise((r) => setTimeout(r, 300))
    expect(progress.filter((p) => p.status === 'complete').length).toBe(completed)
  })
})

describe('LibraryService performance', () => {
  it('scans 5,000 files while keeping the event loop responsive', { timeout: 60_000 }, async () => {
    const root = tempDir()
    for (let s = 0; s < 50; s++) {
      for (let e = 0; e < 100; e++) {
        touch(
          join(
            root,
            `Show ${s}`,
            `Season ${1 + (e % 5)}`,
            `Show.${s}.S0${1 + (e % 5)}E${e}.1080p.mkv`,
          ),
        )
      }
    }
    const { service, fileRows } = setup()
    const delay = monitorEventLoopDelay({ resolution: 10 })
    delay.enable()
    const started = performance.now()
    await addAndScan(service, root)
    const elapsed = performance.now() - started
    delay.disable()

    expect(fileRows()).toHaveLength(5000)
    const maxMs = delay.max / 1e6
    console.log(
      `5,000 files: ${elapsed.toFixed(0)} ms, max event-loop delay ${maxMs.toFixed(1)} ms`,
    )
    expect(maxMs).toBeLessThan(250)
  })
})

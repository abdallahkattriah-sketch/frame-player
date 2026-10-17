import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach } from 'vitest'

/** Creates a temp directory per call, removed after each test. Names include spaces and Unicode. */
export function useTempDirs(): () => string {
  const created: string[] = []
  afterEach(() => {
    for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true })
  })
  return () => {
    const dir = mkdtempSync(join(tmpdir(), 'frame test أفلام '))
    created.push(dir)
    return dir
  }
}

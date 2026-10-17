import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// A sandboxed preload can only require 'electron'; any other runtime import breaks the bridge.
describe('preload imports', () => {
  it('only imports electron and dependency-free modules at runtime', () => {
    const source = readFileSync(join(__dirname, '../../../src/preload/index.ts'), 'utf8')
    const runtimeImports = [...source.matchAll(/^import (?!type )[^\n]* from '([^']+)'/gm)].map(
      (match) => match[1],
    )
    expect(runtimeImports).toEqual(['electron', '@shared/contracts/channels'])
  })
})

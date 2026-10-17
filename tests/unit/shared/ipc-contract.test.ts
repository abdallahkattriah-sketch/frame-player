import { describe, expect, it } from 'vitest'
import { IpcChannel, appInfoSchema } from '@shared/contracts/ipc'

describe('IPC contract', () => {
  it('uses unique channel names', () => {
    const names = Object.values(IpcChannel)
    expect(new Set(names).size).toBe(names.length)
  })

  it('validates app info', () => {
    const valid = { name: 'Frame', version: '0.1.0', platform: 'win32', electronVersion: '44.9.0' }
    expect(appInfoSchema.parse(valid)).toEqual(valid)
    expect(() => appInfoSchema.parse({ ...valid, version: '' })).toThrow()
    expect(() => appInfoSchema.parse({ name: 'Frame' })).toThrow()
  })
})

import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: {} }))

const { userDataOverrideFor } = await import('../../../src/main/application/app-paths')

describe('user data location', () => {
  it('uses FRAME_USER_DATA_DIR only in development and tests', () => {
    expect(userDataOverrideFor({ FRAME_USER_DATA_DIR: 'C:\\tmp\\e2e' }, false)).toBe('C:\\tmp\\e2e')
    expect(userDataOverrideFor({ FRAME_USER_DATA_DIR: 'C:\\tmp\\e2e' }, true)).toBeUndefined()
    expect(userDataOverrideFor({}, false)).toBeUndefined()
  })

  it('keeps a portable copy’s data beside the executable', () => {
    expect(userDataOverrideFor({ PORTABLE_EXECUTABLE_DIR: 'E:\\Frame' }, true)).toBe(
      join('E:\\Frame', 'Frame Data'),
    )
    expect(userDataOverrideFor({}, true)).toBeUndefined()
  })
})

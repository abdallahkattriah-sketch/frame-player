import { describe, expect, it } from 'vitest'
import { playerAreaSchema, playerCommandSchema } from '@shared/contracts/player'
import { toMpvCommands } from '../../../src/main/media-engine/player-state'

describe('in-window player contract', () => {
  it('accepts a sane player area and rejects anything else', () => {
    const area = { x: 220, y: 52, width: 1060, height: 700 }
    expect(playerAreaSchema.parse(area)).toEqual(area)
    expect(() => playerAreaSchema.parse({ ...area, width: 0 })).toThrow()
    expect(() => playerAreaSchema.parse({ ...area, x: -5 })).toThrow()
    expect(() => playerAreaSchema.parse({ ...area, y: Number.NaN })).toThrow()
    expect(() => playerAreaSchema.parse({ ...area, extra: true })).toThrow()
  })

  it('handles closing and hiding in the window layer, never as mpv commands', () => {
    for (const type of ['close-player', 'hide-player', 'show-player'] as const) {
      expect(playerCommandSchema.parse({ type })).toEqual({ type })
      expect(toMpvCommands({ type })).toEqual([])
    }
  })
})

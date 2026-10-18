import { describe, expect, it } from 'vitest'
import { placeMenu } from '@renderer/features/library/ItemMenu'

const viewport = { width: 1000, height: 800 }
const size = { width: 200, height: 300 }

describe('placeMenu', () => {
  it('opens at the right-click point when there is room', () => {
    expect(placeMenu({ x: 100, y: 100 }, size, viewport)).toEqual({ left: 100, top: 100 })
  })

  it('flips left and up near the right and bottom edges', () => {
    expect(placeMenu({ x: 950, y: 700 }, size, viewport)).toEqual({ left: 750, top: 400 })
  })

  it('aligns to a button’s right edge and always stays on screen', () => {
    expect(placeMenu({ x: 500, y: 50 }, size, viewport, true)).toEqual({ left: 300, top: 50 })
    expect(placeMenu({ x: 50, y: 10 }, size, viewport, true)).toEqual({ left: 8, top: 10 })
    expect(placeMenu({ x: 10, y: 10 }, { width: 200, height: 900 }, viewport)).toEqual({
      left: 10,
      top: 8,
    })
  })
})

import { describe, expect, it } from 'vitest'
import { formatTime } from '@renderer/features/player/format-time'

describe('formatTime', () => {
  it('formats minutes and hours', () => {
    expect(formatTime(0)).toBe('0:00')
    expect(formatTime(65.9)).toBe('1:05')
    expect(formatTime(3600 + 62)).toBe('1:01:02')
  })

  it('renders unknown values as placeholders', () => {
    expect(formatTime(null)).toBe('--:--')
    expect(formatTime(Number.NaN)).toBe('--:--')
    expect(formatTime(-1)).toBe('--:--')
  })
})

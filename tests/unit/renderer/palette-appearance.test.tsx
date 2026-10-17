// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { defaultAppearance } from '@shared/settings/theme'
import { applyAppearance } from '@renderer/app/appearance'
import { CommandPalette, filterCommands } from '@renderer/components/ui/CommandPalette'

afterEach(cleanup)
// jsdom has no layout, so no scrollIntoView.
Element.prototype.scrollIntoView = vi.fn()

const commands = [
  { id: 'a', label: 'Go to Movies', group: 'Navigation', run: vi.fn() },
  { id: 'b', label: 'Open videos…', group: 'Media', binding: 'Ctrl+O', run: vi.fn() },
  { id: 'c', label: 'Theme: Daylight', group: 'Appearance', run: vi.fn() },
]

describe('command palette', () => {
  it('matches every word in the label or group', () => {
    expect(filterCommands(commands, '').map((c) => c.id)).toEqual(['a', 'b', 'c'])
    expect(filterCommands(commands, 'go mov').map((c) => c.id)).toEqual(['a'])
    expect(filterCommands(commands, 'appearance').map((c) => c.id)).toEqual(['c'])
    expect(filterCommands(commands, 'nothing')).toEqual([])
  })

  it('runs the highlighted command with the keyboard and closes', () => {
    const onClose = vi.fn()
    render(<CommandPalette commands={commands} onClose={onClose} />)
    const input = screen.getByRole('combobox', { name: 'Search commands' })
    fireEvent.change(input, { target: { value: 'o' } })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(commands[1]?.run).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalled()
    expect(screen.getByText('Ctrl + O')).toBeTruthy()
  })
})

describe('applyAppearance', () => {
  it('writes theme tokens and layout settings as CSS variables', () => {
    const root = document.createElement('div')
    applyAppearance(
      {
        ...defaultAppearance,
        themeId: 'daylight',
        accentOverride: '#123456',
        density: 'compact',
        posterSize: 'large',
        fontScale: 1.1,
        animations: 'off',
      },
      root,
    )
    expect(root.style.getPropertyValue('--frame-bg')).toBe('#F6F5F2')
    expect(root.style.getPropertyValue('--frame-accent')).toBe('#123456')
    expect(root.style.getPropertyValue('color-scheme')).toBe('light')
    expect(root.style.getPropertyValue('--spacing')).toBe('0.21rem')
    expect(root.style.getPropertyValue('--frame-poster-width')).toBe('195px')
    expect(root.style.fontSize).toBe('110%')
    expect(root.dataset['motion']).toBe('off')
  })
})

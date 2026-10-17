// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Sidebar } from '@renderer/components/shell/Sidebar'

afterEach(cleanup)

describe('Sidebar', () => {
  it('marks the active view and reports navigation', () => {
    const onNavigate = vi.fn()
    render(<Sidebar activeView="settings" onNavigate={onNavigate} />)

    expect(screen.getByRole('button', { name: 'Settings' }).getAttribute('aria-current')).toBe(
      'page',
    )
    expect(screen.getByRole('button', { name: 'Home' }).getAttribute('aria-current')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Home' }))
    expect(onNavigate).toHaveBeenCalledWith('home')
  })
})

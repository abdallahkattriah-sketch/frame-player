// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Sidebar } from '@renderer/components/shell/Sidebar'

afterEach(cleanup)

beforeEach(() => {
  ;(window as unknown as { frame: unknown }).frame = {
    collections: {
      list: () => Promise.resolve([{ id: 7, name: 'Weekend', kind: 'playlist', itemCount: 2 }]),
    },
    library: { onChanged: () => () => undefined },
  }
})

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

  it('lists collections and navigates to them', async () => {
    const onNavigate = vi.fn()
    render(<Sidebar activeView="collection-7" onNavigate={onNavigate} />)
    const weekend = await screen.findByRole('button', { name: /Weekend/ })
    expect(weekend.getAttribute('aria-current')).toBe('page')
    fireEvent.click(weekend)
    expect(onNavigate).toHaveBeenCalledWith('collection-7')
  })
})

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { initialPlayerState, type PlayerState } from '@shared/contracts/player'
import { AudioSubtitleMenu, SpeedMenu } from '@renderer/features/player/menus'

const command = vi.fn(() => Promise.resolve())

beforeEach(() => {
  command.mockClear()
  ;(window as unknown as { frame: unknown }).frame = { player: { command } }
})
afterEach(cleanup)

const state: PlayerState = {
  ...initialPlayerState,
  subtitleDelay: 0.2,
  tracks: [
    {
      id: 1,
      type: 'audio',
      title: null,
      lang: 'ja',
      codec: 'aac',
      selected: true,
      external: false,
      isDefault: true,
      forced: false,
    },
    {
      id: 1,
      type: 'sub',
      title: null,
      lang: 'ar',
      codec: 'subrip',
      selected: true,
      external: true,
      isDefault: false,
      forced: false,
    },
    {
      id: 2,
      type: 'sub',
      title: 'Signs',
      lang: 'en',
      codec: 'ass',
      selected: false,
      external: false,
      isDefault: false,
      forced: true,
    },
  ],
}

describe('AudioSubtitleMenu', () => {
  it('lists tracks, marks the selected ones, and sends selections', () => {
    render(<AudioSubtitleMenu state={state} />)
    fireEvent.click(screen.getByRole('button', { name: 'Audio and subtitles' }))

    expect(
      screen.getByRole('menuitemradio', { name: /Japanese/ }).getAttribute('aria-checked'),
    ).toBe('true')
    expect(
      screen
        .getByRole('menuitemradio', { name: /Arabic \(external\)/ })
        .getAttribute('aria-checked'),
    ).toBe('true')

    fireEvent.click(screen.getByRole('menuitemradio', { name: 'English — Signs (forced)' }))
    expect(command).toHaveBeenCalledWith({ type: 'set-subtitle-track', id: 2 })
  })

  it('steps the subtitle delay by 100 ms and resets it', () => {
    render(<AudioSubtitleMenu state={state} />)
    fireEvent.click(screen.getByRole('button', { name: 'Audio and subtitles' }))

    fireEvent.click(screen.getByRole('button', { name: 'Increase subtitle delay' }))
    expect(command).toHaveBeenLastCalledWith({ type: 'set-subtitle-delay', seconds: 0.3 })
    fireEvent.click(screen.getByRole('button', { name: 'Reset subtitle delay' }))
    expect(command).toHaveBeenLastCalledWith({ type: 'set-subtitle-delay', seconds: 0 })
  })

  it('closes on Escape', () => {
    render(<AudioSubtitleMenu state={state} />)
    fireEvent.click(screen.getByRole('button', { name: 'Audio and subtitles' }))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
  })
})

describe('SpeedMenu', () => {
  it('shows a non-preset speed as selected', () => {
    render(<SpeedMenu speed={1.3} />)
    fireEvent.click(screen.getByRole('button', { name: /Playback speed/ }))
    expect(screen.getByRole('menuitemradio', { name: '1.3×' }).getAttribute('aria-checked')).toBe(
      'true',
    )
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Normal' }))
    expect(command).toHaveBeenCalledWith({ type: 'set-speed', speed: 1 })
  })
})

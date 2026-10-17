import { useMemo } from 'react'
import type { PlayerCommand } from '@shared/contracts/player'
import { effectiveShortcuts, type ShortcutActionId } from '@shared/settings/shortcuts'
import { builtInThemes } from '@shared/settings/theme'
import { CommandPalette, type PaletteCommand } from '@renderer/components/ui/CommandPalette'
import {
  primaryNavItems,
  secondaryNavItems,
  type NavItemId,
} from '@renderer/components/shell/nav-items'
import { usePlayerState } from '@renderer/features/player/use-player-state'
import { useSettings } from './settings-context'

const ignore = () => undefined

interface MainCommandPaletteProps {
  onNavigate: (view: NavItemId) => void
  onClose: () => void
}

/** Commands for the library window: navigation, opening media, library, player, themes. */
export function MainCommandPalette({ onNavigate, onClose }: MainCommandPaletteProps) {
  const player = usePlayerState()
  const { settings, update } = useSettings()

  const commands = useMemo<PaletteCommand[]>(() => {
    const shortcuts = effectiveShortcuts(settings?.shortcuts.bindings ?? {})
    const binding = (id: ShortcutActionId) => shortcuts[id][0]
    const send = (command: PlayerCommand) => () => {
      window.frame.player.command(command).catch(ignore)
    }
    const list: PaletteCommand[] = [
      ...[...primaryNavItems, ...secondaryNavItems].map((item) => ({
        id: `go-${item.id}`,
        label: `Go to ${item.label}`,
        group: 'Navigation',
        binding: item.id === 'settings' ? binding('open-settings') : undefined,
        run: () => onNavigate(item.id),
      })),
      {
        id: 'open-files',
        label: 'Open videos…',
        group: 'Media',
        run: () => void window.frame.player.openFilesDialog().catch(ignore),
      },
      {
        id: 'open-folder',
        label: 'Open folder…',
        group: 'Media',
        run: () => void window.frame.player.openFolderDialog().catch(ignore),
      },
      {
        id: 'add-library-folder',
        label: 'Add library folder…',
        group: 'Library',
        run: () => void window.frame.library.addFolderDialog().catch(ignore),
      },
      {
        id: 'rescan',
        label: 'Rescan all library folders',
        group: 'Library',
        run: () => void window.frame.library.rescan().catch(ignore),
      },
      {
        id: 'identify',
        label: 'Identify unmatched items with TMDB',
        group: 'Library',
        run: () => void window.frame.metadata.identifyNow().catch(ignore),
      },
    ]
    if (player.path) {
      list.push(
        {
          id: 'show-player',
          label: 'Show player',
          group: 'Player',
          run: send({ type: 'show-player' }),
        },
        {
          id: 'play-pause',
          label: player.paused ? 'Play' : 'Pause',
          group: 'Player',
          run: send({ type: 'toggle-pause' }),
        },
        { id: 'stop', label: 'Stop', group: 'Player', run: send({ type: 'stop' }) },
        { id: 'next', label: 'Next video', group: 'Player', run: send({ type: 'playlist-next' }) },
        {
          id: 'previous',
          label: 'Previous video',
          group: 'Player',
          run: send({ type: 'playlist-previous' }),
        },
        {
          id: 'mute',
          label: player.muted ? 'Unmute' : 'Mute',
          group: 'Player',
          run: send({ type: 'toggle-mute' }),
        },
      )
    }
    for (const theme of [...builtInThemes, ...(settings?.appearance.customThemes ?? [])]) {
      list.push({
        id: `theme-${theme.id}`,
        label: `Theme: ${theme.name}`,
        group: 'Appearance',
        run: () => update({ appearance: { themeId: theme.id } }),
      })
    }
    return list
  }, [settings, update, player.path, player.paused, player.muted, onNavigate])

  return <CommandPalette commands={commands} onClose={onClose} />
}

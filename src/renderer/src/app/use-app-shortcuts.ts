import { useEffect, useMemo } from 'react'
import { bindingFromEvent, bindingIndex, effectiveShortcuts } from '@shared/settings/shortcuts'
import { isTypingTarget, shouldHandleWhileTyping } from '@renderer/features/player/player-keymap'
import { useSettings } from './settings-context'

interface AppShortcutHandlers {
  onCommandPalette: () => void
  onOpenSettings: () => void
  /** False while a dialog (e.g. the palette) handles keys itself. */
  enabled: boolean
}

/** Shortcuts of the library window ('app' scope), following the user's bindings. */
export function useAppShortcuts({
  onCommandPalette,
  onOpenSettings,
  enabled,
}: AppShortcutHandlers) {
  const { settings } = useSettings()
  const bindings = useMemo(
    () => bindingIndex(effectiveShortcuts(settings?.shortcuts.bindings ?? {}), 'app'),
    [settings?.shortcuts.bindings],
  )

  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) && !shouldHandleWhileTyping(e)) return
      const binding = bindingFromEvent(e)
      const action = binding ? bindings.get(binding) : undefined
      if (action === 'command-palette') onCommandPalette()
      else if (action === 'open-settings') onOpenSettings()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [bindings, enabled, onCommandPalette, onOpenSettings])
}

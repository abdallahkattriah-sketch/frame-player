import { z } from 'zod'

export type ShortcutScope = 'player' | 'app'

export interface ShortcutAction {
  id: string
  label: string
  group: 'Playback' | 'Audio and subtitles' | 'Player panels' | 'Navigation'
  /** 'player' works in the player window; 'app' works in every window. */
  scope: ShortcutScope
  defaults: readonly string[]
}

/** Every action that can have a shortcut, with Frame's defaults. */
export const shortcutActions = [
  {
    id: 'play-pause',
    label: 'Play / pause',
    group: 'Playback',
    scope: 'player',
    defaults: ['Space', 'K'],
  },
  { id: 'stop', label: 'Stop', group: 'Playback', scope: 'player', defaults: ['Shift+S'] },
  {
    id: 'seek-forward',
    label: 'Seek forward',
    group: 'Playback',
    scope: 'player',
    defaults: ['ArrowRight'],
  },
  {
    id: 'seek-backward',
    label: 'Seek backward',
    group: 'Playback',
    scope: 'player',
    defaults: ['ArrowLeft'],
  },
  {
    id: 'seek-forward-long',
    label: 'Seek forward 1 minute',
    group: 'Playback',
    scope: 'player',
    defaults: ['Shift+ArrowRight'],
  },
  {
    id: 'seek-backward-long',
    label: 'Seek backward 1 minute',
    group: 'Playback',
    scope: 'player',
    defaults: ['Shift+ArrowLeft'],
  },
  { id: 'frame-forward', label: 'Next frame', group: 'Playback', scope: 'player', defaults: ['.'] },
  {
    id: 'frame-backward',
    label: 'Previous frame',
    group: 'Playback',
    scope: 'player',
    defaults: [','],
  },
  { id: 'speed-up', label: 'Faster', group: 'Playback', scope: 'player', defaults: [']'] },
  { id: 'speed-down', label: 'Slower', group: 'Playback', scope: 'player', defaults: ['['] },
  {
    id: 'speed-reset',
    label: 'Normal speed',
    group: 'Playback',
    scope: 'player',
    defaults: ['Backspace'],
  },
  { id: 'next', label: 'Next video', group: 'Playback', scope: 'player', defaults: ['N'] },
  {
    id: 'previous',
    label: 'Previous video',
    group: 'Playback',
    scope: 'player',
    defaults: ['Shift+N'],
  },
  {
    id: 'next-chapter',
    label: 'Next chapter',
    group: 'Playback',
    scope: 'player',
    defaults: ['PageDown'],
  },
  {
    id: 'previous-chapter',
    label: 'Previous chapter',
    group: 'Playback',
    scope: 'player',
    defaults: ['PageUp'],
  },
  { id: 'fullscreen', label: 'Fullscreen', group: 'Playback', scope: 'player', defaults: ['F'] },
  { id: 'screenshot', label: 'Screenshot', group: 'Playback', scope: 'player', defaults: ['S'] },
  {
    id: 'volume-up',
    label: 'Volume up',
    group: 'Audio and subtitles',
    scope: 'player',
    defaults: ['ArrowUp'],
  },
  {
    id: 'volume-down',
    label: 'Volume down',
    group: 'Audio and subtitles',
    scope: 'player',
    defaults: ['ArrowDown'],
  },
  { id: 'mute', label: 'Mute', group: 'Audio and subtitles', scope: 'player', defaults: ['M'] },
  {
    id: 'audio-delay-up',
    label: 'Audio delay +100 ms',
    group: 'Audio and subtitles',
    scope: 'player',
    defaults: ['Shift+X'],
  },
  {
    id: 'audio-delay-down',
    label: 'Audio delay −100 ms',
    group: 'Audio and subtitles',
    scope: 'player',
    defaults: ['Shift+Z'],
  },
  {
    id: 'subtitle-delay-up',
    label: 'Subtitle delay +100 ms',
    group: 'Audio and subtitles',
    scope: 'player',
    defaults: ['X'],
  },
  {
    id: 'subtitle-delay-down',
    label: 'Subtitle delay −100 ms',
    group: 'Audio and subtitles',
    scope: 'player',
    defaults: ['Z'],
  },
  {
    id: 'toggle-subtitles',
    label: 'Show / hide subtitles',
    group: 'Audio and subtitles',
    scope: 'player',
    defaults: ['V'],
  },
  {
    id: 'audio-menu',
    label: 'Audio and subtitle tracks',
    group: 'Audio and subtitles',
    scope: 'player',
    defaults: ['A'],
  },
  {
    id: 'subtitle-search',
    label: 'Search subtitles online',
    group: 'Audio and subtitles',
    scope: 'player',
    defaults: ['Ctrl+F'],
  },
  {
    id: 'subtitle-style',
    label: 'Subtitle style',
    group: 'Audio and subtitles',
    scope: 'player',
    defaults: ['Shift+V'],
  },
  {
    id: 'add-bookmark',
    label: 'Add bookmark',
    group: 'Player panels',
    scope: 'player',
    defaults: ['B'],
  },
  {
    id: 'bookmarks',
    label: 'Bookmarks',
    group: 'Player panels',
    scope: 'player',
    defaults: ['Shift+B'],
  },
  { id: 'playlist', label: 'Playlist', group: 'Player panels', scope: 'player', defaults: ['P'] },
  {
    id: 'info',
    label: 'Playback information',
    group: 'Player panels',
    scope: 'player',
    defaults: ['I'],
  },
  {
    id: 'compact-controls',
    label: 'Compact player controls',
    group: 'Player panels',
    scope: 'player',
    defaults: ['C'],
  },
  {
    id: 'command-palette',
    label: 'Command palette',
    group: 'Navigation',
    scope: 'app',
    defaults: ['Ctrl+K', 'Ctrl+Shift+P'],
  },
  {
    id: 'open-settings',
    label: 'Open settings',
    group: 'Navigation',
    scope: 'app',
    defaults: ['Ctrl+,'],
  },
] as const satisfies readonly ShortcutAction[]

export type ShortcutActionId = (typeof shortcutActions)[number]['id']

export const shortcutActionIds = shortcutActions.map((a) => a.id) as [
  ShortcutActionId,
  ...ShortcutActionId[],
]

/** Keys that may be bound: printable characters and named keys (no modifier-only bindings). */
const bindingPattern =
  /^(?:Ctrl\+)?(?:Alt\+)?(?:Shift\+)?(?:[!-~]|Space|Arrow(?:Up|Down|Left|Right)|Page(?:Up|Down)|Home|End|Insert|Delete|Backspace|Enter|Tab|F(?:[1-9]|1[0-2]))$/

export const shortcutBindingSchema = z.string().regex(bindingPattern, 'Not a supported key')

/** User changes only: actions missing here use their defaults; [] means no shortcut. */
export const shortcutOverridesSchema = z
  .partialRecord(z.enum(shortcutActionIds), z.array(shortcutBindingSchema).max(3))
  .refine((o) => Object.keys(o).length <= shortcutActions.length)

export type ShortcutOverrides = z.infer<typeof shortcutOverridesSchema>
export type ShortcutMap = Record<ShortcutActionId, readonly string[]>

/** Exported shortcut files. */
export const shortcutFileSchema = z
  .object({
    format: z.literal('frame-shortcuts'),
    version: z.literal(1),
    bindings: shortcutOverridesSchema,
  })
  .strict()

export interface KeyEventLike {
  key: string
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  metaKey?: boolean
}

/**
 * Canonical binding for a key press ("Ctrl+Shift+P", "Space", "X"), or null for presses that
 * cannot be bindings (modifier keys alone, dead keys, the Windows key).
 */
export function bindingFromEvent(e: KeyEventLike): string | null {
  if (e.metaKey) return null
  let key = e.key
  if (['Control', 'Shift', 'Alt', 'Meta', 'Dead', 'Unidentified', 'Process'].includes(key)) {
    return null
  }
  if (key === ' ') key = 'Space'
  else if (key.length === 1) key = key.toUpperCase()
  // Escape always closes things; it is not assignable.
  if (key === 'Escape') return null
  const parts: string[] = []
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  const binding = [...parts, key].join('+')
  return bindingPattern.test(binding) ? binding : null
}

/** Readable form for display ("Ctrl + K", "→"). */
export function formatBinding(binding: string): string {
  const names: Record<string, string> = {
    ArrowRight: '→',
    ArrowLeft: '←',
    ArrowUp: '↑',
    ArrowDown: '↓',
    PageUp: 'Page Up',
    PageDown: 'Page Down',
  }
  if (binding === '+') return '+'
  const parts = binding.split('+')
  // "Ctrl++" is Ctrl with the plus key.
  if (binding.endsWith('++')) parts.splice(-2, 2, '+')
  return parts.map((p) => names[p] ?? p).join(' + ')
}

export function effectiveShortcuts(overrides: ShortcutOverrides): ShortcutMap {
  const map = {} as Record<ShortcutActionId, readonly string[]>
  for (const action of shortcutActions) map[action.id] = overrides[action.id] ?? action.defaults
  return map
}

/** binding → action, for looking up key presses in one scope ('app' actions apply everywhere). */
export function bindingIndex(
  map: ShortcutMap,
  scope: ShortcutScope,
): Map<string, ShortcutActionId> {
  const index = new Map<string, ShortcutActionId>()
  for (const action of shortcutActions) {
    if (action.scope !== scope && action.scope !== 'app') continue
    for (const binding of map[action.id]) index.set(binding, action.id)
  }
  return index
}

/** The action that already uses `binding`, other than `except`. */
export function findConflict(
  map: ShortcutMap,
  binding: string,
  except: ShortcutActionId,
): ShortcutActionId | null {
  for (const action of shortcutActions) {
    if (action.id !== except && map[action.id].includes(binding)) return action.id
  }
  return null
}

const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i])

/** Stores only differences from the defaults. */
function toOverrides(map: ShortcutMap): ShortcutOverrides {
  const overrides: ShortcutOverrides = {}
  for (const action of shortcutActions) {
    if (!sameList(map[action.id], action.defaults)) overrides[action.id] = [...map[action.id]]
  }
  return overrides
}

/**
 * Adds `binding` to `action`, taking it away from any other action that had it (the editor
 * asks first). At most three bindings per action; the oldest is dropped.
 */
export function assignBinding(
  overrides: ShortcutOverrides,
  action: ShortcutActionId,
  binding: string,
): ShortcutOverrides {
  const map = { ...effectiveShortcuts(overrides) }
  for (const other of shortcutActions) {
    if (other.id !== action) map[other.id] = map[other.id].filter((b) => b !== binding)
  }
  const current = map[action].filter((b) => b !== binding)
  map[action] = [...current, binding].slice(-3)
  return toOverrides(map)
}

export function removeBinding(
  overrides: ShortcutOverrides,
  action: ShortcutActionId,
  binding: string,
): ShortcutOverrides {
  const map = { ...effectiveShortcuts(overrides) }
  map[action] = map[action].filter((b) => b !== binding)
  return toOverrides(map)
}

export function resetBinding(
  overrides: ShortcutOverrides,
  action: ShortcutActionId,
): ShortcutOverrides {
  const map = { ...effectiveShortcuts(overrides) }
  const defaults = shortcutActions.find((a) => a.id === action)?.defaults ?? []
  map[action] = defaults
  // Restoring a default can take a key another action has since been given.
  for (const binding of defaults) {
    for (const other of shortcutActions) {
      if (other.id !== action) map[other.id] = map[other.id].filter((b) => b !== binding)
    }
  }
  return toOverrides(map)
}

/** Pairs of actions that share a binding (possible after editing defaults or importing). */
export function listConflicts(
  map: ShortcutMap,
): { binding: string; actions: ShortcutActionId[] }[] {
  const owners = new Map<string, ShortcutActionId[]>()
  for (const action of shortcutActions) {
    for (const binding of map[action.id]) {
      owners.set(binding, [...(owners.get(binding) ?? []), action.id])
    }
  }
  return [...owners]
    .filter(([, actions]) => actions.length > 1)
    .map(([binding, actions]) => ({ binding, actions }))
}

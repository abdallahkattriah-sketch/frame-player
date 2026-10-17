import { useEffect, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { formatBinding } from '@shared/settings/shortcuts'

export interface PaletteCommand {
  id: string
  label: string
  group: string
  /** Shortcut shown beside the command. */
  binding?: string
  run: () => void
}

/** Every word of the query must appear in the label or group (case-insensitive). */
export function filterCommands(
  commands: readonly PaletteCommand[],
  query: string,
): PaletteCommand[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return [...commands]
  return commands.filter((c) => {
    const text = `${c.label} ${c.group}`.toLowerCase()
    return words.every((w) => text.includes(w))
  })
}

interface CommandPaletteProps {
  commands: readonly PaletteCommand[]
  onClose: () => void
}

export function CommandPalette({ commands, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)
  const results = useMemo(() => filterCommands(commands, query), [commands, query])
  const selected = Math.min(active, Math.max(0, results.length - 1))

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${selected}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const run = (command: PaletteCommand | undefined) => {
    if (!command) return
    onClose()
    command.run()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-bg/50 pt-[12vh]"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <div
        role="dialog"
        aria-label="Command palette"
        aria-modal="true"
        className="flex max-h-[60vh] w-[min(36rem,90vw)] flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search size={16} className="text-subtle" aria-hidden />
          <input
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-list"
            aria-activedescendant={
              results[selected] ? `command-${results[selected].id}` : undefined
            }
            aria-label="Search commands"
            placeholder="Type a command…"
            value={query}
            onChange={(e) => {
              setQuery(e.currentTarget.value)
              setActive(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActive((selected + 1) % Math.max(1, results.length))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActive((selected - 1 + results.length) % Math.max(1, results.length))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                run(results[selected])
              } else if (e.key === 'Escape') {
                e.preventDefault()
                e.stopPropagation()
                onClose()
              }
            }}
            className="w-full bg-transparent py-3 text-sm focus:outline-none"
          />
        </div>
        <ul
          ref={listRef}
          id="command-palette-list"
          role="listbox"
          className="overflow-y-auto p-1.5"
        >
          {results.length === 0 && (
            <li className="px-3 py-2 text-sm text-muted">No commands found</li>
          )}
          {results.map((command, index) => (
            <li
              key={command.id}
              id={`command-${command.id}`}
              role="option"
              aria-selected={index === selected}
              data-index={index}
              onPointerMove={() => setActive(index)}
              onClick={() => run(command)}
              className={`flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm ${
                index === selected ? 'bg-elevated' : ''
              }`}
            >
              <span className="flex-1 truncate">{command.label}</span>
              <span className="text-xs text-subtle">{command.group}</span>
              {command.binding && (
                <kbd className="rounded border border-border px-1.5 py-0.5 font-sans text-xs text-muted">
                  {formatBinding(command.binding)}
                </kbd>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

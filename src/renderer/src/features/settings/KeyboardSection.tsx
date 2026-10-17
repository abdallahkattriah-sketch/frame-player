import { useEffect, useState } from 'react'
import { Plus, RotateCcw, X } from 'lucide-react'
import {
  assignBinding,
  bindingFromEvent,
  effectiveShortcuts,
  findConflict,
  formatBinding,
  listConflicts,
  removeBinding,
  resetBinding,
  shortcutActions,
  type ShortcutActionId,
  type ShortcutOverrides,
} from '@shared/settings/shortcuts'
import { useSettings } from '@renderer/app/settings-context'

const labelOf = (id: ShortcutActionId) => shortcutActions.find((a) => a.id === id)?.label ?? id
const groups = [...new Set(shortcutActions.map((a) => a.group))]

interface Conflict {
  action: ShortcutActionId
  binding: string
  owner: ShortcutActionId
}

export function KeyboardSection() {
  const { settings, update, flush } = useSettings()
  const [recording, setRecording] = useState<ShortcutActionId | null>(null)
  const [conflict, setConflict] = useState<Conflict | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const overrides = settings?.shortcuts.bindings
  const map = effectiveShortcuts(overrides ?? {})

  const save = (next: ShortcutOverrides) => update({ shortcuts: { bindings: next } })

  // While recording, the next key press becomes the binding (and reaches nothing else).
  useEffect(() => {
    if (!recording || !overrides) return
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        setRecording(null)
        return
      }
      const binding = bindingFromEvent(e)
      if (!binding) return // a modifier on its own: keep waiting
      setRecording(null)
      const owner = findConflict(effectiveShortcuts(overrides), binding, recording)
      if (owner) setConflict({ action: recording, binding, owner })
      else update({ shortcuts: { bindings: assignBinding(overrides, recording, binding) } })
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [recording, overrides, update])

  if (!settings || !overrides) return null
  const conflicts = listConflicts(map)

  return (
    <section aria-labelledby="keyboard-heading" className="flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-start gap-2">
        <div className="flex-1">
          <h2 id="keyboard-heading" className="text-lg font-semibold">
            Keyboard shortcuts
          </h2>
          <p className="text-sm text-muted">
            Ctrl+K opens the command palette. Shortcuts never fire while you type in a text field.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            flush()
              .then(() => window.frame.shortcuts.importFile())
              .then((r) => setMessage(r.error ?? (r.imported ? 'Shortcuts imported.' : null)))
              .catch((e: unknown) => setMessage(String(e)))
          }}
          className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-elevated"
        >
          Import…
        </button>
        <button
          type="button"
          onClick={() => {
            flush()
              .then(() => window.frame.shortcuts.exportFile())
              .then((saved) => setMessage(saved ? 'Shortcuts exported.' : null))
              .catch((e: unknown) => setMessage(String(e)))
          }}
          className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-elevated"
        >
          Export…
        </button>
        <button
          type="button"
          disabled={Object.keys(overrides).length === 0}
          onClick={() => save({})}
          className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-elevated disabled:opacity-40"
        >
          Reset all
        </button>
      </div>
      {message && (
        <p role="status" className="text-sm text-muted" data-testid="shortcut-message">
          {message}
        </p>
      )}
      {conflicts.length > 0 && (
        <div role="alert" className="rounded-md border border-danger/40 px-3 py-2 text-sm">
          {conflicts.map((c) => (
            <div key={c.binding}>
              {formatBinding(c.binding)} is assigned to {c.actions.map(labelOf).join(' and ')}.
            </div>
          ))}
        </div>
      )}

      {groups.map((group) => (
        <div key={group} className="flex flex-col gap-1 text-sm">
          <h3 className="text-xs font-medium uppercase tracking-wide text-subtle">{group}</h3>
          {shortcutActions
            .filter((a) => a.group === group)
            .map((action) => (
              <div key={action.id} className="flex flex-col rounded-md px-2 py-1 hover:bg-surface">
                <div className="flex items-center gap-2" data-testid={`shortcut-${action.id}`}>
                  <span className="w-56 shrink-0">{action.label}</span>
                  <div className="flex flex-1 flex-wrap items-center gap-1">
                    {map[action.id].map((binding) => (
                      <span
                        key={binding}
                        className="inline-flex items-center gap-1 rounded border border-border bg-bg px-1.5 py-0.5 text-xs"
                      >
                        <kbd className="font-sans">{formatBinding(binding)}</kbd>
                        <button
                          type="button"
                          aria-label={`Remove ${formatBinding(binding)} from ${action.label}`}
                          onClick={() => save(removeBinding(overrides, action.id, binding))}
                          className="text-subtle hover:text-danger"
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                    {recording === action.id ? (
                      <span className="text-xs text-accent" role="status">
                        Press a key… (Esc to cancel)
                      </span>
                    ) : (
                      map[action.id].length < 3 && (
                        <button
                          type="button"
                          aria-label={`Add shortcut for ${action.label}`}
                          onClick={() => {
                            setConflict(null)
                            setRecording(action.id)
                          }}
                          className="rounded p-0.5 text-subtle hover:bg-elevated hover:text-text"
                        >
                          <Plus size={14} />
                        </button>
                      )
                    )}
                  </div>
                  {overrides[action.id] && (
                    <button
                      type="button"
                      aria-label={`Reset ${action.label} to default`}
                      title="Reset to default"
                      onClick={() => save(resetBinding(overrides, action.id))}
                      className="rounded p-1 text-subtle hover:bg-elevated hover:text-text"
                    >
                      <RotateCcw size={13} />
                    </button>
                  )}
                </div>
                {conflict?.action === action.id && (
                  <div role="alert" className="mt-1 flex items-center gap-2 pl-56 text-xs">
                    <span>
                      {formatBinding(conflict.binding)} is already used by {labelOf(conflict.owner)}
                      .
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        save(assignBinding(overrides, conflict.action, conflict.binding))
                        setConflict(null)
                      }}
                      className="rounded bg-accent px-2 py-0.5 text-bg"
                    >
                      Replace
                    </button>
                    <button
                      type="button"
                      onClick={() => setConflict(null)}
                      className="rounded px-2 py-0.5 text-muted hover:bg-elevated"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            ))}
        </div>
      ))}
    </section>
  )
}

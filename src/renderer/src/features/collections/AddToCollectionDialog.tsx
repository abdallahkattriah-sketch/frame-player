import { useEffect, useRef, useState } from 'react'
import { ListMusic, Plus, Shapes } from 'lucide-react'
import type { LibraryItem } from '@shared/contracts/library'
import { displayTitle } from '@renderer/features/library/item-format'
import { NameDialog } from './NameDialog'
import { errorText, useCollections } from './use-collections'

/** Adds a library item to an existing or new collection. */
export function AddToCollectionDialog({
  item,
  onClose,
}: {
  item: LibraryItem
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const { collections } = useCollections()
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileId = item.fileId

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open && !creating) dialog.showModal()
    if (dialog?.open && creating) dialog.close()
  }, [creating])

  if (fileId === null) return null
  if (creating) {
    return (
      <NameDialog
        title="New collection"
        chooseKind
        confirmLabel="Create and add"
        onSubmit={async (name, kind) => {
          await window.frame.collections.create(name, kind, [fileId])
        }}
        onClose={onClose}
      />
    )
  }

  return (
    <dialog
      ref={ref}
      aria-label="Add to collection"
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      className="m-auto w-full max-w-sm rounded-lg border border-border bg-surface p-5 text-sm text-text shadow-2xl backdrop:bg-black/60"
    >
      <h2 className="text-base font-semibold">Add to collection</h2>
      <p className="mb-3 truncate text-muted">{displayTitle(item)}</p>
      <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
        {collections.map((c) => {
          const Icon = c.kind === 'playlist' ? ListMusic : Shapes
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => {
                  window.frame.collections
                    .addItems(c.id, [fileId])
                    .then(onClose)
                    .catch((e: unknown) => setError(errorText(e)))
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-elevated"
              >
                <Icon size={15} className="text-muted" aria-hidden />
                <span className="flex-1 truncate">{c.name}</span>
                <span className="text-xs text-subtle">{c.itemCount}</span>
              </button>
            </li>
          )
        })}
        <li>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-accent hover:bg-elevated"
          >
            <Plus size={15} aria-hidden /> New collection…
          </button>
        </li>
      </ul>
      {error && (
        <p role="alert" className="mt-2 text-danger">
          {error}
        </p>
      )}
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-border px-3 py-1.5 hover:bg-elevated"
        >
          Cancel
        </button>
      </div>
    </dialog>
  )
}

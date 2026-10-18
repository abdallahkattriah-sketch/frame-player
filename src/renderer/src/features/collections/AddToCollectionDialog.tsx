import { useEffect, useRef, useState } from 'react'
import { Bookmark, Check, ListMusic, Plus, Shapes } from 'lucide-react'
import type { CollectionTarget, CollectionTitleInput } from '@shared/contracts/collections'
import { NameDialog } from './NameDialog'
import { errorText, useCollections } from './use-collections'

/** A library file or a TMDB title, with the name shown in the dialog. */
export type AddToCollectionTarget = { label: string } & (
  { fileId: number } | { title: CollectionTitleInput }
)

function targetRef(target: AddToCollectionTarget): CollectionTarget {
  return 'fileId' in target
    ? { fileId: target.fileId }
    : { mediaType: target.title.mediaType, tmdbId: target.title.tmdbId }
}

/** The ids of the collections holding the target, kept current as collections change. */
export function useContainingCollections(target: CollectionTarget | null): number[] {
  const [ids, setIds] = useState<number[]>([])
  const key = target ? JSON.stringify(target) : null
  useEffect(() => {
    if (!key) return
    const parsed = JSON.parse(key) as CollectionTarget
    const load = () =>
      window.frame.collections
        .containing(parsed)
        .then(setIds)
        .catch(() => undefined)
    load()
    return window.frame.library.onChanged(load)
  }, [key])
  return key ? ids : []
}

/** "In Weekend, Favorites" for a file or title saved to collections; nothing otherwise. */
export function CollectionMembership({ target }: { target: CollectionTarget }) {
  const ids = useContainingCollections(target)
  const { collections } = useCollections()
  const names = collections.filter((c) => ids.includes(c.id)).map((c) => c.name)
  if (names.length === 0) return null
  return (
    <p className="flex items-center gap-1 text-sm text-accent" data-testid="in-collections">
      <Bookmark size={14} className="shrink-0 fill-accent" aria-hidden />
      <span className="truncate">In {names.join(', ')}</span>
    </p>
  )
}

/** Adds a library file or TMDB title to a collection, or removes it from one it is in. */
export function AddToCollectionDialog({
  target,
  onClose,
}: {
  target: AddToCollectionTarget
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const { collections } = useCollections()
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const containing = useContainingCollections(targetRef(target))

  const add = (id: number) =>
    'fileId' in target
      ? window.frame.collections.addItems(id, [target.fileId])
      : window.frame.collections.addTitle(id, target.title)
  const remove = (id: number) =>
    'fileId' in target
      ? window.frame.collections.removeItem(id, target.fileId)
      : window.frame.collections.removeTitle(id, target.title.mediaType, target.title.tmdbId)

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open && !creating) dialog.showModal()
    if (dialog?.open && creating) dialog.close()
  }, [creating])

  if (creating) {
    return (
      <NameDialog
        title="New collection"
        chooseKind
        confirmLabel="Create and add"
        onSubmit={async (name, kind) => {
          const created = await window.frame.collections.create(name, kind)
          await add(created.id)
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
      <p className="mb-3 truncate text-muted" dir="auto">
        {target.label}
      </p>
      <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
        {collections.map((c) => {
          const Icon = c.kind === 'playlist' ? ListMusic : Shapes
          const added = containing.includes(c.id)
          return (
            <li key={c.id}>
              <button
                type="button"
                title={added ? `Remove from ${c.name}` : undefined}
                onClick={() => {
                  ;(added ? remove(c.id) : add(c.id))
                    .then(onClose)
                    .catch((e: unknown) => setError(errorText(e)))
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-elevated"
              >
                <Icon size={15} className="text-muted" aria-hidden />
                <span className="flex-1 truncate">{c.name}</span>
                {added ? (
                  <span className="flex items-center gap-1 text-xs text-accent">
                    <Check size={13} aria-hidden /> Added
                  </span>
                ) : (
                  <span className="text-xs text-subtle">{c.itemCount}</span>
                )}
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
      {containing.length > 0 && (
        <p className="mt-2 text-xs text-subtle">Choose a collection marked Added to remove it.</p>
      )}
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

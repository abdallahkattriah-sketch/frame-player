import { useEffect, useRef, useState } from 'react'
import { collectionNameSchema, type CollectionKind } from '@shared/contracts/collections'

interface NameDialogProps {
  title: string
  initialName?: string
  /** Shown when creating: collection or playlist. */
  chooseKind?: boolean
  confirmLabel: string
  onSubmit: (name: string, kind: CollectionKind) => Promise<void>
  onClose: () => void
}

/** Asks for a collection name (and, when creating, its kind). Explains invalid names. */
export function NameDialog({
  title,
  initialName = '',
  chooseKind,
  confirmLabel,
  onSubmit,
  onClose,
}: NameDialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const [name, setName] = useState(initialName)
  const [kind, setKind] = useState<CollectionKind>('collection')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      className="m-auto w-full max-w-sm rounded-lg border border-border bg-surface p-5 text-text shadow-2xl backdrop:bg-black/60"
    >
      <form
        className="flex flex-col gap-3 text-sm"
        onSubmit={(e) => {
          e.preventDefault()
          const parsed = collectionNameSchema.safeParse(name)
          if (!parsed.success) {
            setError(parsed.error.issues[0]?.message ?? 'Invalid name')
            return
          }
          onSubmit(parsed.data, kind)
            .then(onClose)
            .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
        }}
      >
        <h2 className="text-base font-semibold">{title}</h2>
        <label className="flex flex-col gap-1">
          <span className="text-muted">Name</span>
          <input
            autoFocus
            value={name}
            maxLength={100}
            aria-invalid={error !== null}
            onChange={(e) => {
              setName(e.currentTarget.value)
              setError(null)
            }}
            className="rounded-md border border-border bg-bg px-2 py-1.5 focus:border-accent focus:outline-none"
          />
        </label>
        {chooseKind && (
          <fieldset className="flex gap-4">
            <legend className="sr-only">Type</legend>
            {(['collection', 'playlist'] as const).map((k) => (
              <label key={k} className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="collection-kind"
                  checked={kind === k}
                  onChange={() => setKind(k)}
                  className="accent-[var(--frame-accent)]"
                />
                {k === 'collection' ? 'Collection' : 'Playlist (plays in order)'}
              </label>
            ))}
          </fieldset>
        )}
        {error && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-3 py-1.5 hover:bg-elevated"
          >
            Cancel
          </button>
          <button type="submit" className="rounded-md bg-accent px-3 py-1.5 font-medium text-bg">
            {confirmLabel}
          </button>
        </div>
      </form>
    </dialog>
  )
}

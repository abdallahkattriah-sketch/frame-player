import { useEffect, useId, useRef, type ReactNode } from 'react'

interface ConfirmDialogProps {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel: string
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** Modal confirmation built on <dialog>: focus is trapped and Escape cancels. */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  destructive,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  // Unique per dialog: several can be mounted on one page.
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault()
        onCancel()
      }}
      className="m-auto w-full max-w-md rounded-lg border border-border bg-surface p-5 text-text shadow-2xl backdrop:bg-black/60"
    >
      <h2 id={titleId} className="text-base font-semibold">
        {title}
      </h2>
      <div className="mt-2 text-sm text-muted">{children}</div>
      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-elevated"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className={`rounded-md px-3 py-1.5 text-sm font-medium hover:brightness-110 ${
            destructive ? 'bg-danger text-bg' : 'bg-accent text-bg'
          }`}
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  )
}

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'

interface PopoverProps {
  /** Accessible name of the trigger button. */
  label: string
  trigger: ReactNode
  children: ReactNode
  align?: 'start' | 'end'
  className?: string
  /** Controlled open state (e.g. opened by a keyboard shortcut). */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

/** A button that toggles a panel above it. Closes on outside click or Escape. */
export function Popover({
  label,
  trigger,
  children,
  align = 'end',
  className,
  open: controlledOpen,
  onOpenChange,
}: PopoverProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const open = controlledOpen ?? uncontrolledOpen
  const setOpen = useCallback(
    (next: boolean | ((current: boolean) => boolean)) => {
      const value = typeof next === 'function' ? next(open) : next
      setUncontrolledOpen(value)
      onOpenChange?.(value)
    },
    [open, onOpenChange],
  )
  const rootRef = useRef<HTMLDivElement>(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
      }
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [open, setOpen])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className={`rounded-md p-1.5 text-text hover:bg-elevated ${open ? 'bg-elevated' : ''}`}
      >
        {trigger}
      </button>
      {open && (
        <div
          id={panelId}
          className={`absolute bottom-full mb-2 min-w-48 rounded-lg border border-border bg-surface/95 p-1.5 text-sm shadow-xl ${
            align === 'end' ? 'right-0' : 'left-0'
          } ${className ?? ''}`}
        >
          {children}
        </div>
      )}
    </div>
  )
}

interface MenuSectionProps {
  title: string
  children: ReactNode
}

export function MenuSection({ title, children }: MenuSectionProps) {
  return (
    <div role="group" aria-label={title} className="py-1">
      <div className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-subtle">
        {title}
      </div>
      {children}
    </div>
  )
}

interface MenuOptionProps {
  checked: boolean
  onSelect: () => void
  children: ReactNode
}

export function MenuOption({ checked, onSelect, children }: MenuOptionProps) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={checked}
      onClick={onSelect}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-elevated ${
        checked ? 'text-accent' : 'text-text'
      }`}
    >
      <span aria-hidden className="w-3 text-center">
        {checked ? '•' : ''}
      </span>
      <span className="truncate">{children}</span>
    </button>
  )
}

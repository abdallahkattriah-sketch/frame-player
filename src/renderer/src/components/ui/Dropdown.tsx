import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Check, ChevronDown } from 'lucide-react'

export interface DropdownOption {
  value: string
  label: string
  icon?: ReactNode
}

/** One group of mutually exclusive choices; a dropdown may hold several (e.g. sort field and direction). */
export interface DropdownGroup {
  label?: string
  value: string
  options: DropdownOption[]
  onChange: (value: string) => void
}

interface DropdownProps {
  /** Accessible name of the control. */
  label: string
  groups: DropdownGroup[]
  /** Trigger content; defaults to the selected option of the first group. */
  display?: ReactNode
  align?: 'start' | 'end'
}

/** Shared look for controls in a filter row, so they read as one unit. */
export const controlClass =
  'flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-sm text-text transition-colors hover:border-subtle'

/** A row of toggle buttons with the same height and border as the other controls. */
export const segmentedClass =
  'flex h-8 items-center gap-0.5 rounded-md border border-border bg-surface p-0.5 text-sm'

export const segmentClass = (active: boolean) =>
  `flex h-full items-center rounded px-2.5 transition-colors ${
    active ? 'bg-raised text-accent' : 'text-muted hover:text-text'
  }`

/** A styled replacement for a native select: a button that opens a listbox. */
export function Dropdown({ label, groups, display, align = 'end' }: DropdownProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const id = useId()

  const first = groups[0]
  const current = first?.options.find((o) => o.value === first.value)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    // Focus the selected option when the list opens.
    const selected = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')
    ;(selected ?? listRef.current?.querySelector<HTMLElement>('[role="option"]'))?.focus({
      preventScroll: true,
    })
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const close = () => {
    setOpen(false)
    buttonRef.current?.focus()
  }

  const onListKeyDown = (e: KeyboardEvent) => {
    const options = [...(listRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])]
    const index = options.indexOf(document.activeElement as HTMLElement)
    const move = (to: number) => {
      e.preventDefault()
      options[(to + options.length) % options.length]?.focus()
    }
    if (e.key === 'ArrowDown') move(index + 1)
    else if (e.key === 'ArrowUp') move(index - 1)
    else if (e.key === 'Home') move(0)
    else if (e.key === 'End') move(options.length - 1)
    else if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault()
      e.stopPropagation()
      close()
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            setOpen(true)
          }
        }}
        className={`${controlClass} ${open ? 'border-accent hover:border-accent' : ''}`}
      >
        {display ?? current?.label}
        <ChevronDown size={14} className="text-subtle" aria-hidden />
      </button>
      {open && (
        <div
          ref={listRef}
          id={id}
          role="listbox"
          aria-label={label}
          onKeyDown={onListKeyDown}
          className={`absolute top-full z-30 mt-1 min-w-full whitespace-nowrap rounded-md border border-border bg-elevated p-1 text-sm shadow-xl ${
            align === 'end' ? 'right-0' : 'left-0'
          }`}
        >
          {groups.map((group, g) => (
            <div
              key={g}
              role="group"
              aria-label={group.label}
              className={g > 0 ? 'mt-1 border-t border-border pt-1' : ''}
            >
              {group.label && groups.length > 1 && (
                <div className="px-2.5 pb-1 pt-1.5 text-xs text-subtle">{group.label}</div>
              )}
              {group.options.map((option) => {
                const selected = option.value === group.value
                return (
                  <div
                    key={option.value}
                    role="option"
                    aria-selected={selected}
                    tabIndex={-1}
                    onClick={() => {
                      group.onChange(option.value)
                      close()
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        group.onChange(option.value)
                        close()
                      }
                    }}
                    className={`flex cursor-default items-center gap-2 rounded px-2.5 py-1.5 outline-none hover:bg-raised focus:bg-raised ${
                      selected ? 'text-accent' : 'text-text'
                    }`}
                  >
                    {option.icon}
                    <span className="flex-1">{option.label}</span>
                    <Check size={14} className={selected ? '' : 'invisible'} aria-hidden />
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

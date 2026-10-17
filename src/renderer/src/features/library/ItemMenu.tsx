import { useEffect, useRef } from 'react'
import { MoreHorizontal } from 'lucide-react'
import type { LibraryItem } from '@shared/contracts/library'
import { displayTitle, itemRef } from './item-format'
import { matchRequestFor, useMetadataActions } from '@renderer/features/metadata/metadata-actions'

interface ItemMenuProps {
  item: LibraryItem
  open: boolean
  onOpenChange: (open: boolean) => void
  onPlay: () => void
  className?: string
}

/** Actions for one item. Opened from the "more" button, right-click, or Shift+F10. */
export function ItemMenu({ item, open, onOpenChange, onPlay, className }: ItemMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const metadataActions = useMetadataActions()

  useEffect(() => {
    if (!open) return
    menuRef.current?.querySelector<HTMLButtonElement>('[role=menuitem]')?.focus()
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) onOpenChange(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [open, onOpenChange])

  const watched = item.progress?.completed === true
  const run = (action: () => unknown) => () => {
    onOpenChange(false)
    void Promise.resolve(action()).catch(() => undefined)
  }

  const actions: { label: string; action: () => unknown }[] = [
    { label: item.missing ? 'Play (file missing)' : 'Play', action: onPlay },
    {
      label: watched ? 'Mark as unwatched' : 'Mark as watched',
      action: () => window.frame.history.setWatched(itemRef(item), !watched),
    },
  ]
  const match = matchRequestFor(item)
  if (match) {
    actions.push({ label: 'Details', action: () => metadataActions.openDetails(item) })
    actions.push({
      label:
        item.matchStatus === 'matched'
          ? item.kind === 'episode'
            ? 'Change show match…'
            : 'Change match…'
          : 'Identify…',
      action: () => metadataActions.openMatch(match),
    })
  }
  if (item.fileId !== null) {
    const id = item.fileId
    actions.push({
      label: item.favorite ? 'Remove from favorites' : 'Add to favorites',
      action: () => window.frame.library.setFavorite(id, !item.favorite),
    })
    actions.push({ label: 'Show in folder', action: () => window.frame.library.showInFolder(id) })
  }
  if (item.progress) {
    actions.push({
      label: 'Remove from history',
      action: () => window.frame.history.remove(itemRef(item)),
    })
  }

  return (
    <div ref={rootRef} className={`relative ${className ?? ''}`}>
      <button
        type="button"
        aria-label={`More actions for ${displayTitle(item)}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation()
          onOpenChange(!open)
        }}
        className="rounded-md bg-bg/70 p-1 text-muted hover:bg-elevated hover:text-text"
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={`Actions for ${displayTitle(item)}`}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            const items = [
              ...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role=menuitem]') ?? []),
            ]
            const index = items.indexOf(document.activeElement as HTMLButtonElement)
            if (e.key === 'Escape') {
              e.stopPropagation()
              onOpenChange(false)
            } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault()
              const next = (index + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
              items[next]?.focus()
            }
          }}
          className="absolute right-0 top-full z-20 mt-1 min-w-48 rounded-lg border border-border bg-surface p-1 text-sm shadow-xl"
        >
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              role="menuitem"
              onClick={run(a.action)}
              className="block w-full rounded-md px-3 py-1.5 text-left hover:bg-elevated focus:bg-elevated focus:outline-none"
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

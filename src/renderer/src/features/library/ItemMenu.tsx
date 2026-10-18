import { useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { MoreHorizontal } from 'lucide-react'
import type { LibraryItem } from '@shared/contracts/library'
import { displayTitle, itemRef } from './item-format'
import { matchRequestFor, useMetadataActions } from '@renderer/features/metadata/metadata-actions'
import { useCurrentCollection } from '@renderer/features/collections/CollectionView'

interface ItemMenuProps {
  item: LibraryItem
  open: boolean
  /** Right-click position; without it the menu opens below its "more" button. */
  anchor?: { x: number; y: number } | null
  onOpenChange: (open: boolean) => void
  onPlay: () => void
  className?: string
}

/** Actions for one item. Opened from the "more" button, right-click, or Shift+F10. */
const MARGIN = 8

/**
 * Viewport position for a menu of `size` opened at `point`, flipped and clamped so it stays
 * fully visible.
 */
export function placeMenu(
  point: { x: number; y: number },
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  /** Right-aligned to the point (a button's right edge) instead of starting at it. */
  alignEnd = false,
): { left: number; top: number } {
  let left = alignEnd ? point.x - size.width : point.x
  let top = point.y
  if (left + size.width > viewport.width - MARGIN) left = point.x - size.width
  if (top + size.height > viewport.height - MARGIN) top = point.y - size.height
  left = Math.max(MARGIN, Math.min(left, viewport.width - size.width - MARGIN))
  top = Math.max(MARGIN, Math.min(top, viewport.height - size.height - MARGIN))
  return { left, top }
}

export function ItemMenu({ item, open, anchor, onOpenChange, onPlay, className }: ItemMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  // Rendered on the page body (cards clip their contents): measured hidden, then placed
  // before the browser paints, and re-placed when the page scrolls or the window resizes
  // (a menu opened from the button follows it; a right-click menu stays at the pointer).
  useLayoutEffect(() => {
    const menu = menuRef.current
    if (!open || !menu) return
    const place = () => {
      const button = buttonRef.current?.getBoundingClientRect()
      const point = anchor ?? (button ? { x: button.right, y: button.bottom + 4 } : { x: 0, y: 0 })
      const { left, top } = placeMenu(
        point,
        { width: menu.offsetWidth, height: menu.offsetHeight },
        { width: window.innerWidth, height: window.innerHeight },
        !anchor,
      )
      menu.style.left = `${left}px`
      menu.style.top = `${top}px`
      menu.style.visibility = 'visible'
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, anchor])
  const metadataActions = useMetadataActions()
  const current = useCurrentCollection()

  useEffect(() => {
    if (!open) return
    // Focusing must not scroll the page under the menu.
    menuRef.current
      ?.querySelector<HTMLButtonElement>('[role=menuitem]')
      ?.focus({ preventScroll: true })
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        onOpenChange(false)
      }
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
  if (item.fileId !== null && !item.missing) {
    actions.push({ label: 'Find subtitles…', action: () => metadataActions.openSubtitles(item) })
  }
  if (item.fileId !== null) {
    const id = item.fileId
    actions.push({
      label: item.favorite ? 'Remove from favorites' : 'Add to favorites',
      action: () => window.frame.library.setFavorite(id, !item.favorite),
    })
    actions.push({ label: 'Show in folder', action: () => window.frame.library.showInFolder(id) })
    actions.push({
      label: 'Add to collection…',
      action: () => metadataActions.openAddToCollection(item),
    })
    if (current) {
      const { collection, order } = current
      const index = order.indexOf(id)
      if (index > 0) {
        actions.push({
          label: 'Move up',
          action: () => window.frame.collections.moveItem(collection.id, id, index - 1),
        })
      }
      if (index >= 0 && index < order.length - 1) {
        actions.push({
          label: 'Move down',
          action: () => window.frame.collections.moveItem(collection.id, id, index + 1),
        })
      }
      actions.push({
        label: `Remove from ${collection.name}`,
        action: () => window.frame.collections.removeItem(collection.id, id),
      })
    }
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
        ref={buttonRef}
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
      {open &&
        createPortal(
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
                const next =
                  (index + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
                items[next]?.focus({ preventScroll: true })
              }
            }}
            style={{ left: 0, top: 0, visibility: 'hidden' }}
            className="fixed z-50 min-w-48 rounded-lg border border-border bg-surface p-1 text-sm shadow-xl"
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
          </div>,
          document.body,
        )}
    </div>
  )
}

import { useState, type KeyboardEvent, type MouseEvent } from 'react'
import { CheckCircle2, Film, Heart, Tv } from 'lucide-react'
import type { LibraryItem } from '@shared/contracts/library'
import { Artwork } from '@renderer/components/ui/Artwork'
import { ItemMenu } from './ItemMenu'
import {
  displayTitle,
  formatBytes,
  formatRelativeDate,
  progressFraction,
  subtitleLine,
} from './item-format'

export interface ItemProps {
  item: LibraryItem
  onPlay: () => void
}

/** Opens the actions menu on right-click and Shift+F10 / the context-menu key. */
function useItemMenu() {
  const [menuOpen, setMenuOpen] = useState(false)
  return {
    menuOpen,
    setMenuOpen,
    onContextMenu: (e: MouseEvent) => {
      e.preventDefault()
      setMenuOpen(true)
    },
    onKeyDown: (e: KeyboardEvent, onPlay: () => void) => {
      if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
        e.preventDefault()
        setMenuOpen(true)
      } else if (e.key === 'Enter' && e.target === e.currentTarget) {
        onPlay()
      }
    },
  }
}

function ProgressBar({ item }: { item: LibraryItem }) {
  const fraction = progressFraction(item)
  if (fraction === null || item.progress?.completed) return null
  return (
    <div
      className="h-1 w-full bg-bg/70"
      role="progressbar"
      aria-label="Watched"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(fraction * 100)}
    >
      <div className="h-full bg-accent" style={{ width: `${fraction * 100}%` }} />
    </div>
  )
}

/** Placeholder artwork until metadata provides a poster. */
function Placeholder({ item }: { item: LibraryItem }) {
  const Icon = item.kind === 'episode' ? Tv : Film
  return (
    <div className="flex h-full w-full flex-col justify-between bg-elevated p-3">
      <Icon size={20} className="text-subtle" aria-hidden />
      <div className="line-clamp-4 text-sm font-medium leading-snug text-muted" dir="auto">
        {displayTitle(item)}
      </div>
    </div>
  )
}

export function MediaCard({ item, onPlay }: ItemProps) {
  const menu = useItemMenu()
  const title = displayTitle(item)
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Play ${title}`}
      onClick={onPlay}
      onContextMenu={menu.onContextMenu}
      onKeyDown={(e) => menu.onKeyDown(e, onPlay)}
      data-testid="media-card"
      className={`group flex cursor-pointer flex-col gap-2 rounded-lg outline-offset-4 ${
        item.missing ? 'opacity-50' : ''
      }`}
    >
      <div className="relative aspect-[2/3] overflow-hidden rounded-md border border-border shadow-sm transition-transform group-hover:-translate-y-0.5 group-hover:border-subtle">
        <Artwork
          kind="poster"
          path={item.posterPath}
          alt=""
          className="h-full w-full object-cover"
          fallback={<Placeholder item={item} />}
        />
        <div className="absolute inset-x-0 bottom-0">
          <ProgressBar item={item} />
        </div>
        <div className="absolute left-2 top-2 flex gap-1">
          {item.progress?.completed && (
            <CheckCircle2 size={16} className="text-accent" aria-label="Watched" />
          )}
          {item.favorite && (
            <Heart size={16} className="fill-accent text-accent" aria-label="Favorite" />
          )}
        </div>
        <ItemMenu
          item={item}
          open={menu.menuOpen}
          onOpenChange={menu.setMenuOpen}
          onPlay={onPlay}
          className={`absolute right-2 top-2 ${
            menu.menuOpen ? '' : 'opacity-0 focus-within:opacity-100 group-hover:opacity-100'
          }`}
        />
      </div>
      <div className="min-w-0 px-0.5">
        <div className="truncate text-sm font-medium" title={title} dir="auto">
          {title}
        </div>
        <div className="truncate text-xs text-muted">{subtitleLine(item) || ' '}</div>
      </div>
    </div>
  )
}

export function MediaRow({ item, onPlay }: ItemProps) {
  const menu = useItemMenu()
  const title = displayTitle(item)
  const fraction = progressFraction(item)
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Play ${title}`}
      onClick={onPlay}
      onContextMenu={menu.onContextMenu}
      onKeyDown={(e) => menu.onKeyDown(e, onPlay)}
      data-testid="media-row"
      className={`group grid h-full cursor-pointer grid-cols-[minmax(0,3fr)_minmax(0,2fr)_6rem_6rem_6rem_2rem] items-center gap-3 rounded-md px-3 text-sm hover:bg-surface ${
        item.missing ? 'opacity-50' : ''
      }`}
    >
      <div className="flex min-w-0 items-center gap-2">
        {item.progress?.completed && (
          <CheckCircle2 size={14} className="shrink-0 text-accent" aria-label="Watched" />
        )}
        {item.favorite && (
          <Heart size={14} className="shrink-0 fill-accent text-accent" aria-label="Favorite" />
        )}
        <span className="truncate" title={title} dir="auto">
          {title}
        </span>
      </div>
      <span className="truncate text-muted">{subtitleLine(item)}</span>
      <span className="text-muted tabular-nums">
        {fraction !== null && !item.progress?.completed ? `${Math.round(fraction * 100)}%` : ''}
      </span>
      <span className="text-right text-muted tabular-nums">{formatBytes(item.sizeBytes)}</span>
      <span className="text-right text-muted">{formatRelativeDate(item.addedAt)}</span>
      <ItemMenu
        item={item}
        open={menu.menuOpen}
        onOpenChange={menu.setMenuOpen}
        onPlay={onPlay}
        className={
          menu.menuOpen ? '' : 'opacity-0 focus-within:opacity-100 group-hover:opacity-100'
        }
      />
    </div>
  )
}

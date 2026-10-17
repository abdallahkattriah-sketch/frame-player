import { useEffect, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { LibraryItem } from '@shared/contracts/library'
import { MediaCard, MediaRow } from './MediaCard'

const CARD_MIN_WIDTH = 150
const GAP = 20
const ROW_HEIGHT = 44

interface MediaCollectionProps {
  items: LibraryItem[]
  mode: 'grid' | 'list'
  /** Plays items[index]; the view decides what queue to build around it. */
  onPlay: (index: number) => void
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

/** Virtualized grid or list: only visible rows are rendered, so large libraries stay fast. */
export function MediaCollection({ items, mode, onPlay }: MediaCollectionProps) {
  const [scrollRef, width] = useWidth<HTMLDivElement>()
  const columns =
    mode === 'grid' ? Math.max(1, Math.floor((width + GAP) / (CARD_MIN_WIDTH + GAP))) : 1
  const cardWidth = (width - GAP * (columns - 1)) / columns
  // Poster (2:3) plus two lines of text.
  const rowHeight = mode === 'grid' ? cardWidth * 1.5 + 56 + GAP : ROW_HEIGHT
  const rowCount = Math.ceil(items.length / columns)

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 4,
  })

  useEffect(() => {
    virtualizer.measure()
  }, [rowHeight, virtualizer])

  return (
    <div
      ref={scrollRef}
      className="min-h-0 flex-1 overflow-y-auto pr-1"
      data-testid="media-collection"
    >
      {mode === 'list' && (
        <div className="sticky top-0 z-10 grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)_6rem_6rem_6rem_2rem] gap-3 border-b border-border bg-bg px-3 py-2 text-xs text-subtle">
          <span>Title</span>
          <span>Details</span>
          <span>Watched</span>
          <span className="text-right">Size</span>
          <span className="text-right">Added</span>
          <span />
        </div>
      )}
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((row) => {
          const start = row.index * columns
          const rowItems = items.slice(start, start + columns)
          return (
            <div
              key={row.key}
              className="absolute left-0 top-0 w-full"
              style={{ height: row.size, transform: `translateY(${row.start}px)` }}
            >
              {mode === 'grid' ? (
                <div
                  className="grid"
                  style={{
                    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                    columnGap: GAP,
                  }}
                >
                  {rowItems.map((item, i) => (
                    <MediaCard
                      key={item.fileId ?? item.historyKey}
                      item={item}
                      onPlay={() => onPlay(start + i)}
                    />
                  ))}
                </div>
              ) : (
                rowItems.map((item, i) => (
                  <MediaRow
                    key={item.fileId ?? item.historyKey}
                    item={item}
                    onPlay={() => onPlay(start + i)}
                  />
                ))
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

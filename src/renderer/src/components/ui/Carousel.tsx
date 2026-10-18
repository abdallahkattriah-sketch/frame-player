import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

/** A horizontal row without a scrollbar: arrows on hover page through it, edges fade. */
export function Carousel({
  label,
  children,
  gap = 'gap-4',
}: {
  label: string
  children: ReactNode
  /** Tailwind gap class between items. */
  gap?: string
}) {
  const ref = useRef<HTMLUListElement>(null)
  const [edges, setEdges] = useState({ start: false, end: false })

  const update = useCallback(() => {
    const el = ref.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    setEdges({ start: el.scrollLeft > 1, end: el.scrollLeft < max - 1 })
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [update, children])

  const page = (direction: 1 | -1) => {
    const el = ref.current
    if (!el) return
    // One "page": the visible width, minus a little so the last poster stays in view.
    el.scrollBy({ left: direction * Math.max(el.clientWidth - 140, 140), behavior: 'smooth' })
  }

  const fade = (side: 'left' | 'right') =>
    `pointer-events-none absolute inset-y-0 w-16 from-bg to-transparent ${
      side === 'left' ? 'left-0 bg-linear-to-r' : 'right-0 bg-linear-to-l'
    }`
  const arrow =
    'absolute top-[calc(50%-1.75rem)] z-10 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-elevated/90 text-text opacity-0 shadow-lg transition-opacity hover:bg-raised focus-visible:opacity-100 group-hover/row:opacity-100'

  return (
    <div className="group/row relative">
      <ul
        ref={ref}
        aria-label={label}
        onScroll={update}
        className={`scrollbar-none -mx-1 flex overflow-x-auto px-1 py-1 ${gap}`}
      >
        {children}
      </ul>
      {edges.start && <div className={fade('left')} aria-hidden />}
      {edges.end && <div className={fade('right')} aria-hidden />}
      {edges.start && (
        <button
          type="button"
          aria-label="Scroll left"
          onClick={() => page(-1)}
          className={`${arrow} left-1`}
        >
          <ChevronLeft size={18} />
        </button>
      )}
      {edges.end && (
        <button
          type="button"
          aria-label="Scroll right"
          onClick={() => page(1)}
          className={`${arrow} right-1`}
        >
          <ChevronRight size={18} />
        </button>
      )}
    </div>
  )
}

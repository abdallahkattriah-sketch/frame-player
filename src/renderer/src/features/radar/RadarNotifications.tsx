import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, CheckCheck, Film, X } from 'lucide-react'
import type { RadarNotification } from '@shared/contracts/radar'
import { Artwork } from '@renderer/components/ui/Artwork'
import { useSettings } from '@renderer/app/settings-context'
import { formatDay } from '@renderer/features/people/filmography'
import { usePeopleActions } from '@renderer/features/people/people-actions'

function describe(n: RadarNotification): string {
  const where = n.country === 'EG' ? 'in Egypt' : `in ${n.country} (no Egypt date yet)`
  const what = n.kind === 'digital' ? 'Digital release' : 'In cinemas'
  return `${what} ${where} · ${formatDay(n.date)}`
}

/** Toolbar bell listing new releases of followed people, each announced once. */
export function RadarNotifications({ onOpen }: { onOpen?: () => void }) {
  const { settings } = useSettings()
  const enabled = settings?.metadata.radarNotifications ?? true
  const { openTitle } = usePeopleActions()
  const [items, setItems] = useState<RadarNotification[]>([])
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const load = useCallback(
    () =>
      void window.frame.radar
        .notifications()
        .then((r) => {
          setItems(r.items)
          setUnread(r.unread)
        })
        .catch(() => undefined),
    [],
  )
  useEffect(() => {
    load()
    return window.frame.radar.onNotificationsChanged(load)
  }, [load])

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
  }, [open])

  if (!enabled && items.length === 0) return null

  const openItem = (n: RadarNotification) => {
    setOpen(false)
    if (!n.read) void window.frame.radar.markRead(n.tmdbMovieId, n.kind).catch(() => undefined)
    openTitle({
      tmdbId: n.tmdbMovieId,
      mediaType: 'movie',
      title: n.title,
      year: Number(n.date.slice(0, 4)) || null,
      overview: null,
      posterPath: n.posterPath,
      backdropPath: null,
      voteAverage: null,
      inLibrary: false,
    })
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={unread ? `Release notifications, ${unread} unread` : 'Release notifications'}
        title="Release notifications"
        aria-expanded={open}
        onClick={() => {
          if (!open) onOpen?.()
          setOpen((v) => !v)
        }}
        className={`relative flex size-8 items-center justify-center rounded-md text-muted transition hover:bg-elevated hover:text-text ${open ? 'bg-elevated text-text' : ''}`}
      >
        <Bell
          size={17}
          aria-hidden
          className={unread ? 'origin-top motion-safe:animate-[frame-pop_400ms_ease-out]' : ''}
        />
        {unread > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-bg"
            data-testid="notification-count"
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Release notifications"
          className="absolute top-full right-0 z-50 mt-2 flex max-h-[70vh] w-96 flex-col overflow-hidden rounded-xl border border-border bg-surface/95 text-sm shadow-2xl backdrop-blur [-webkit-app-region:no-drag] motion-safe:animate-[frame-menu_160ms_ease-out]"
        >
          <div className="flex items-center gap-2 border-b border-border/60 px-4 py-2.5">
            <span className="flex-1 font-semibold">New releases</span>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => void window.frame.radar.markAllRead().catch(() => undefined)}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted hover:bg-elevated hover:text-text"
              >
                <CheckCheck size={13} aria-hidden /> Mark all read
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-muted">
              No new releases from people you follow yet.
            </p>
          ) : (
            <ul className="overflow-y-auto py-1">
              {items.map((n) => (
                <li key={`${n.tmdbMovieId}:${n.kind}`} className="group relative">
                  <button
                    type="button"
                    onClick={() => openItem(n)}
                    className="flex w-full items-start gap-3 px-4 py-2.5 text-left transition hover:bg-elevated"
                  >
                    <span className="mt-0.5 block aspect-[2/3] w-9 shrink-0 overflow-hidden rounded border border-border bg-elevated">
                      <Artwork
                        kind="poster"
                        path={n.posterPath}
                        alt=""
                        className="h-full w-full object-cover"
                        fallback={
                          <span className="flex h-full w-full items-center justify-center">
                            <Film size={12} className="text-subtle" aria-hidden />
                          </span>
                        }
                      />
                    </span>
                    <span className="min-w-0 flex-1 pr-5">
                      <span className="flex items-center gap-1.5">
                        {!n.read && (
                          <span
                            className="size-1.5 shrink-0 rounded-full bg-accent"
                            aria-label="Unread"
                          />
                        )}
                        <span
                          className={`truncate ${n.read ? 'text-muted' : 'font-medium'}`}
                          dir="auto"
                        >
                          {n.title}
                        </span>
                      </span>
                      <span className="block text-xs text-muted">{describe(n)}</span>
                      {n.people.length > 0 && (
                        <span className="block truncate text-[11px] text-subtle">
                          With {n.people.join(', ')}
                        </span>
                      )}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Dismiss ${n.title}`}
                    onClick={() =>
                      void window.frame.radar.dismiss(n.tmdbMovieId, n.kind).catch(() => undefined)
                    }
                    className="absolute top-2.5 right-3 rounded p-1 text-subtle opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100 hover:bg-raised hover:text-text"
                  >
                    <X size={13} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="border-t border-border/60 px-4 py-2 text-[11px] text-subtle">
            {enabled
              ? 'Frame checks TMDB when it starts and when you open Radar, not in the background.'
              : 'Notifications are off in Settings › Metadata.'}
          </p>
        </div>
      )}
    </div>
  )
}
